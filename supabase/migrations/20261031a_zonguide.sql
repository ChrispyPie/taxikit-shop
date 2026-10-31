-- Zonguide (t811u/t812u): bästa startzonerna för varje veckodag och timme, ur hela åkeriets resor.
-- Test, bara för admin (ägaren och S admin, samma som Åkeridata och Bilar). Vanliga förare ser den inte.
-- Bara tillägg: en ny RPC public.zonguide. Inga tabeller, ingen cron. Räknas när sidan öppnas.
-- Data: private.trip_fact, data->>'startzon' och ts (startdatum + starttid, svensk tid utan tidszon).
-- Snitt = starter i zonen den veckodagen och timmen / antal veckor (senaste p_weeks hela veckorna, i dag räknas inte).
-- Magasinet (290) räknas inte (t346u). Zonnamn från public.venues där zonen finns (appen har namn för några zoner till).
-- Ett körpass räknas 06–05: dygnsöversikten för lördag går lördag 06 till söndag 05.
-- Ångra: supabase/migrations/undo/20261031a_zonguide_undo.sql

create or replace function public.zonguide(p_token text, p_dow int default null, p_hour int default null, p_weeks int default 12)
returns json language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  a record; v_co text;
  v_now timestamp := now() at time zone 'Europe/Stockholm';
  v_dow int; v_hour int; v_weeks int; v_to date; v_from date; v_d0 int; v_res json;
begin
  select * into a from private.session_actor(p_token);
  if not private.can_view_company(a.category) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_co := private.actor_company(a.driver_id);
  v_dow := coalesce(p_dow, extract(isodow from v_now)::int);
  v_hour := coalesce(p_hour, extract(hour from v_now)::int);
  v_weeks := least(greatest(coalesce(p_weeks, 12), 4), 52);
  if v_dow not between 1 and 7 or v_hour not between 0 and 23 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_to := v_now::date;                      -- till och med i går
  v_from := v_to - 7 * v_weeks;             -- exakt v_weeks av varje veckodag
  v_d0 := case when v_hour < 6 then case when v_dow = 1 then 7 else v_dow - 1 end else v_dow end;   -- körpassets dag

  with t as (
    select extract(isodow from f.ts)::int d, extract(hour from f.ts)::int h, btrim(f.data->>'startzon') z,
           date_trunc('week', f.ts)::date w
      from private.trip_fact f
     where f.company_id = v_co and f.ts >= v_from and f.ts < v_to
       and btrim(coalesce(f.data->>'startzon', '')) ~ '^\d{1,4}$' and btrim(f.data->>'startzon') <> '290'
  ), sel as (select * from t where d = v_dow and h = v_hour),
  zn as (
    select v.zone::text z, string_agg(v.name, ', ' order by v.id) namn
      from public.venues v where v.zone is not null group by v.zone
  ), top as (
    select sel.z, count(*) n, count(distinct sel.w) veckor from sel group by sel.z
  ), slots as (
    select v_d0 d, g h, 0 ord from generate_series(6, 23) g
    union all select case when v_d0 = 7 then 1 else v_d0 + 1 end, g, 1 from generate_series(0, 5) g
  ), sz as (
    select s.d, s.h, s.ord, t.z, count(*) n
      from slots s join t on t.d = s.d and t.h = s.h group by 1, 2, 3, 4
  )
  select json_build_object(
    'dow', v_dow, 'hour', v_hour, 'weeks', v_weeks, 'from', v_from, 'to', v_to - 1,
    'nu', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI'), 'pass_dag', v_d0,
    'starter', (select count(*) from sel),
    'veckor_med_data', (select count(distinct w) from sel),
    'top', coalesce((select json_agg(json_build_object('zon', top.z, 'namn', zn.namn, 'n', top.n, 'veckor', top.veckor,
                       'per_vecka', round(top.n::numeric / v_weeks, 2),
                       'andel', round(100.0 * top.n / nullif((select count(*) from sel), 0))) order by top.n desc, top.veckor desc, top.z::int)
                      from (select * from top order by n desc, veckor desc, z::int limit 8) top left join zn on zn.z = top.z), '[]'::json),
    'dygn', (select json_agg(json_build_object('dow', s.d, 'hour', s.h,
               'starter', coalesce((select sum(n) from sz where sz.d = s.d and sz.h = s.h), 0),
               'top', coalesce((select json_agg(json_build_object('zon', x.z, 'n', x.n) order by x.n desc, x.z::int)
                                 from (select sz.z, sz.n from sz where sz.d = s.d and sz.h = s.h order by sz.n desc, sz.z::int limit 3) x), '[]'::json))
               order by s.ord, s.h) from slots s),
    'namn', coalesce((select json_object_agg(zn.z, zn.namn) from zn), '{}'::json)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.zonguide(text, int, int, int) from public;
grant execute on function public.zonguide(text, int, int, int) to anon, authenticated;
