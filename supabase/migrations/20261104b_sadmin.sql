-- 20261104b: S admin-panelen (TaxiData/sadmin.html)
--  * private.require_sadmin(p_token): bara drivers.category = 'superadmin'. Nekar demosessioner och master-inloggning (via_master).
--    Berra kan bli S admin senare genom att bara byta hans kategori (sadmin_guard stoppar att det görs i appen).
--  * public.sadmin_me, public.sadmin_prognos_trips: nya, loggas i activity_log.
--  * public.zonguide: bara S admin (var ägare + S admin via can_view_company). Loggas.
--  * RLS på prognos_snapshots, prognos_bookings, prognos_meta, prognos_watches. Bara postgres och service_role har
--    rättigheter på tabellerna; prognos-sync kör med service_role (förbi RLS) och appen läser via security definer-funktioner.
-- Ångra: supabase/migrations/undo/20261104b_sadmin_undo.sql

create or replace function private.require_sadmin(p_token text, out driver_id text, out category text, out via_master boolean)
returns record
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() or coalesce(a.via_master, true) or a.category is distinct from 'superadmin'
     or exists (select 1 from private.demo_accounts d where d.driver_id = a.driver_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  driver_id := a.driver_id; category := a.category; via_master := false;
end $$;
revoke all on function private.require_sadmin(text) from public, anon, authenticated;

create or replace function public.sadmin_me(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare a record;
begin
  select * into a from private.require_sadmin(p_token);
  perform private.log(a.driver_id, a.category, 'sadmin_open', null, '{}'::jsonb, false);
  return json_build_object('ok', true, 'driver_id', a.driver_id, 'category', a.category,
    'history_from', (select min(first_seen_at) from public.prognos_booking_history),
    'history_rows', (select count(*) from public.prognos_booking_history));
end $$;
revoke all on function public.sadmin_me(text) from public;
grant execute on function public.sadmin_me(text) to anon, authenticated;

-- Prognos mot resor. Landvetter (291/292 i resdatan = 293 i prognosen) visas för sig.
-- Resdatan har bara taxameterns starttid (startdatum + starttid, hela minuter) = när resan med kunden startade.
-- Det finns ingen tid för när bokningen skickades till bilen eller kundens beställda tid, varken i resdatan eller i prognosen
-- (prognosen ger bara antal per block). Prognostiden är tänkt som när bokningen går ut till bilarna, så:
--   rå skillnad      = resans start − prognostid
--   justerad         = (resans start − p_offset min) − prognostid   (p_offset = antagen tid från utskick till start, standard 10)
--   offsets          = för 0–30 min: hur många resor som får en bokning inom ±20 min och hur nära (median |justerad|)
--   borta_fore_start = resans start − när bokningen försvann ur prognosen (närmaste mått på utskicket vi har)
create or replace function private.prognos_cat_ok(p_cat text, p_k text[])
returns boolean language sql immutable as $$
  select p_cat in ('app','ovrigt')
      or (p_cat = 'storbil' and 'Storbil' = any(coalesce(p_k, '{}')))
      or (p_cat = 'elbil' and 'Miljö' = any(coalesce(p_k, '{}')))
$$;
revoke all on function private.prognos_cat_ok(text, text[]) from public, anon, authenticated;

create or replace function public.sadmin_prognos_trips(p_token text, p_days integer default 30, p_offset integer default 10)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare a record; v_days int; v_off int; v_from timestamptz; v_res json;
begin
  select * into a from private.require_sadmin(p_token);
  v_days := least(greatest(coalesce(p_days, 30), 1), 90);
  v_off := least(greatest(coalesce(p_offset, 10), 0), 45);
  perform private.log(a.driver_id, a.category, 'sadmin_prognos_report', null, jsonb_build_object('days', v_days, 'offset', v_off), false);
  v_from := greatest(now() - make_interval(days => v_days),
                     coalesce((select min(first_seen_at) from public.prognos_booking_history), now()));

  with b as (
    select h.*, case when h.zone_id = '293' then 'landvetter' else 'stan' end grp,
           -- sluttiden går att lita på: fångad live, eller efterfylld från prognos_bookings_gone (inte created_at)
           (not h.backfilled or exists (select 1 from public.prognos_bookings_gone g where g.booking_id = h.booking_id)) tid_ok
      from public.prognos_booking_history h
     where h.estimated_at >= v_from - interval '2 hours' and h.category <> 'barnstol'
  ), t as (
    select f.ts at time zone 'Europe/Stockholm' as at, f.taxi, c.kategorier,
           case when btrim(f.data->>'startzon') in ('291','292','293') then '293' else btrim(f.data->>'startzon') end zone_id
      from private.trip_fact f
      left join public.cars c on c.bilnummer = f.taxi
     where f.ts >= (v_from at time zone 'Europe/Stockholm')
       and btrim(f.data->>'startzon') in ('291','292','293','15','161','163','406','432')
  ), t2 as (
    select t.*, case when t.zone_id = '293' then 'landvetter' else 'stan' end grp from t
  ), m as (   -- vald offset: närmaste bokning kring (start − offset), ±20 min
    select t2.*, x.*, g.borta_fore_start
      from t2
      left join lateral (
        select b.booking_id, b.category bcat, b.confidence bconf, b.status bst,
               round(extract(epoch from (t2.at - b.estimated_at)) / 60)::int raw_min
          from b
         where b.zone_id = t2.zone_id and private.prognos_cat_ok(b.category, t2.kategorier)
           and b.estimated_at between t2.at - make_interval(mins => v_off + 20) and t2.at - make_interval(mins => v_off - 20)
         order by abs(extract(epoch from (t2.at - make_interval(mins => v_off) - b.estimated_at))), b.booking_id
         limit 1) x on true
      left join lateral (   -- bokning som försvann ur prognosen 0–45 min före start (eller högst 5 min efter)
        select round(extract(epoch from (t2.at - b.ended_at)) / 60)::int borta_fore_start
          from b
         where b.zone_id = t2.zone_id and private.prognos_cat_ok(b.category, t2.kategorier)
           and b.status <> 'open' and b.tid_ok and b.ended_at is not null
           and b.ended_at between t2.at - interval '45 minutes' and t2.at + interval '5 minutes'
         order by abs(extract(epoch from (t2.at - b.ended_at)) - 600), b.booking_id
         limit 1) g on true
  ), w as (   -- rå skillnad mot närmaste bokning inom ±60 min (fördelning, oberoende av offset)
    select t2.grp, x.raw_min
      from t2
      join lateral (
        select round(extract(epoch from (t2.at - b.estimated_at)) / 60)::int raw_min
          from b
         where b.zone_id = t2.zone_id and private.prognos_cat_ok(b.category, t2.kategorier)
           and b.estimated_at between t2.at - interval '60 minutes' and t2.at + interval '60 minutes'
         order by abs(extract(epoch from (t2.at - b.estimated_at))), b.booking_id
         limit 1) x on true
  ), o as (   -- vilken offset passar bäst
    select t2.grp, o.o, x.adj
      from t2 cross join (values (0),(5),(10),(15),(20),(25),(30)) o(o)
      left join lateral (
        select extract(epoch from (t2.at - make_interval(mins => o.o) - b.estimated_at)) / 60 adj
          from b
         where b.zone_id = t2.zone_id and private.prognos_cat_ok(b.category, t2.kategorier)
           and b.estimated_at between t2.at - make_interval(mins => o.o + 20) and t2.at - make_interval(mins => o.o - 20)
         order by abs(extract(epoch from (t2.at - make_interval(mins => o.o) - b.estimated_at))), b.booking_id
         limit 1) x on true
  ), bs as (
    select grp, count(*) n, count(*) filter (where confidence = 'saker') n_saker,
           percentile_cont(0.5) within group (order by extract(epoch from (ended_at - estimated_at)) / 60)
             filter (where confidence = 'saker' and status = 'canceled' and ended_at is not null and tid_ok) saker_borta_median,
           count(*) filter (where confidence = 'saker' and status = 'canceled' and ended_at is not null and tid_ok
                            and abs(extract(epoch from (ended_at - estimated_at))) <= 300) saker_borta_5min,
           count(*) filter (where confidence = 'saker' and status = 'canceled' and ended_at is not null and tid_ok) saker_borta_n
      from b where b.estimated_at >= v_from group by grp
  ), ts as (
    select grp, count(*) n, count(booking_id) n_match,
           percentile_cont(0.5) within group (order by raw_min) median_raw,
           percentile_cont(0.5) within group (order by raw_min - v_off) median_adj,
           count(borta_fore_start) n_borta,
           percentile_cont(0.5) within group (order by borta_fore_start) median_borta
      from m group by grp
  )
  select json_build_object(
    'from', v_from, 'to', now(), 'days', v_days, 'offset', v_off,
    'history_rows', (select count(*) from public.prognos_booking_history),
    'history_from', (select min(first_seen_at) from public.prognos_booking_history),
    'groups', (select json_agg(json_build_object('grp', g.grp,
        'bokningar', coalesce(bs.n, 0), 'saker', coalesce(bs.n_saker, 0),
        'saker_borta_n', coalesce(bs.saker_borta_n, 0), 'saker_borta_5min', coalesce(bs.saker_borta_5min, 0),
        'saker_borta_median', round(bs.saker_borta_median::numeric, 1),
        'resor', coalesce(ts.n, 0), 'traffar', coalesce(ts.n_match, 0),
        'median_raw', ts.median_raw, 'median_adj', ts.median_adj,
        'borta_n', coalesce(ts.n_borta, 0), 'borta_median', ts.median_borta,
        'fordelning', (select json_agg(json_build_object('fran', bin * 5, 'n', n) order by bin)
                         from (select floor(raw_min / 5.0)::int bin, count(*) n from w where w.grp = g.grp group by 1) h),
        'borta_fordelning', (select json_agg(json_build_object('fran', bin * 5, 'n', n) order by bin)
                         from (select floor(borta_fore_start / 5.0)::int bin, count(*) n from m
                                where m.grp = g.grp and borta_fore_start is not null group by 1) h),
        'offsets', (select json_agg(json_build_object('offset', o, 'traffar', n, 'median_abs', round(med::numeric, 1)) order by o)
                      from (select o.o, count(adj) n, percentile_cont(0.5) within group (order by abs(adj)) med
                              from o where o.grp = g.grp group by o.o) q)
      ) order by g.grp)
        from (values ('landvetter'), ('stan')) g(grp) left join bs using (grp) left join ts using (grp)),
    'resor', (select json_agg(r order by (r->>'at') desc) from (
        select json_build_object('at', at, 'taxi', taxi, 'zon', zone_id, 'grp', grp, 'kategori', bcat, 'sakerhet', bconf,
               'status', bst, 'raw_min', raw_min, 'adj_min', raw_min - v_off, 'borta_fore_start', borta_fore_start) r
          from m order by at desc limit 60) q)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.sadmin_prognos_trips(text, integer, integer) from public;
grant execute on function public.sadmin_prognos_trips(text, integer, integer) to anon, authenticated;

-- Zonguiden: bara S admin (test). Byter behörighetsraden i den befintliga funktionen.
do $do$
declare v_src text; v_new text;
begin
  v_src := pg_get_functiondef('public.zonguide(text,integer,integer,integer)'::regprocedure);
  v_new := replace(v_src,
    E'select * into a from private.session_actor(p_token);\n  if not private.can_view_company(a.category) then raise exception ''forbidden'' using errcode = ''42501''; end if;',
    E'select * into a from private.require_sadmin(p_token);   -- 20261104b: bara S admin\n  perform private.log(a.driver_id, a.category, ''sadmin_zonguide'', null, jsonb_build_object(''dow'', p_dow, ''hour'', p_hour, ''weeks'', p_weeks), false);');
  if v_new = v_src then raise exception 'zonguide: hittade inte behörighetsraden'; end if;
  execute v_new;
end $do$;

alter table public.prognos_snapshots enable row level security;
alter table public.prognos_bookings  enable row level security;
alter table public.prognos_meta      enable row level security;
alter table public.prognos_watches   enable row level security;
