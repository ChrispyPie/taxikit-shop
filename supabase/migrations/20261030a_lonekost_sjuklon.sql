-- Lönekostnader och sjuklön (önskemål #37 och #39 från Berra, Christians ja 30 okt 2026 02:37).
-- Bara tillägg: en ny tabell i private-schemat och fem nya funktioner. Inga befintliga tabeller eller funktioner ändras.
-- Ångra: supabase/migrations/undo/20261030a_lonekost_sjuklon_undo.sql
--
-- #37 Bilkalkylen (Admin › Bilar): förarlönen får pension, löneskatt och övriga försäkringar ovanpå arbetsgivaravgiften.
--     Procenten sparas per åkeri och kan ändras av ägaren (och S admin). Standard (tills Berra svarar):
--       arbetsgivaravgift 31,42 %, pension 4,4 %, löneskatt 1,067 %, övriga försäkringar 0,26 %.
--       De tre nya räknas på lönen FÖRE semesterersättning (bas = 'lon'). 'lon_sem' = lön + semesterersättning.
--       (Arbetsgivaravgiften räknas som förut på lön + semesterersättning.)
-- #39 Sjukanmälan: beräknad sjuklön = 80 % av förarens snittlön de senaste 6 månaderna före första sjukdagen.
--     Lönen räknas med samma formel som Lönekoll och bilkalkylen, ur resdatan (private.day_summary).
--     Standard (tills Berra svarar): snitt per kalenderdag, utan semesterersättning, åkeriet betalar dag 1–14,
--     karensavdrag = 20 % av en veckas sjuklön (7 × sjuklön per dag × 20 %). Från dag 15: Försäkringskassan.
--     Syns bara för föraren själv och ägaren/S admin (samma regler som resten av Sjukanmälan, flaggan 'sjuk').

create table if not exists private.lonekost_settings (
  company_id    text primary key,
  agavg         numeric(6,3) not null default 31.42 check (agavg between 0 and 100),
  pension       numeric(6,3) not null default 4.4   check (pension between 0 and 100),
  loneskatt     numeric(6,3) not null default 1.067 check (loneskatt between 0 and 100),
  ovr_forsakr   numeric(6,3) not null default 0.26  check (ovr_forsakr between 0 and 100),
  bas           text not null default 'lon' check (bas in ('lon', 'lon_sem')),
  sjuklon_pct   numeric(6,3) not null default 80 check (sjuklon_pct between 0 and 100),
  karens_pct    numeric(6,3) not null default 20 check (karens_pct between 0 and 100),
  snitt_man     integer not null default 6 check (snitt_man between 1 and 24),
  snitt_per     text not null default 'dag' check (snitt_per in ('dag', 'timme', 'pass')),
  sem_i_snitt   boolean not null default false,
  sjuklon_dagar integer not null default 14 check (sjuklon_dagar between 1 and 90),
  updated_at    timestamptz not null default now(),
  updated_by    text
);
revoke all on private.lonekost_settings from public, anon, authenticated;

-- Åkeriets inställningar som json (standardvärden om ingen rad finns)
create or replace function private.lonekost_cfg(p_company text)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object('agavg', s.agavg, 'pension', s.pension, 'loneskatt', s.loneskatt, 'ovr_forsakr', s.ovr_forsakr,
    'bas', s.bas, 'sjuklon_pct', s.sjuklon_pct, 'karens_pct', s.karens_pct, 'snitt_man', s.snitt_man, 'snitt_per', s.snitt_per,
    'sem_i_snitt', s.sem_i_snitt, 'sjuklon_dagar', s.sjuklon_dagar, 'sparad', s.updated_at is not null, 'updated_at', s.updated_at)
  from (select * from private.lonekost_settings where company_id = p_company
        union all
        select p_company, 31.42, 4.4, 1.067, 0.26, 'lon', 80, 20, 6, 'dag', false, 14, null, null
        where not exists (select 1 from private.lonekost_settings where company_id = p_company)) s
$$;
revoke all on function private.lonekost_cfg(text) from public, anon, authenticated;

-- Läsa (samma som list_cars): can_view_company eller can_edit_cars
create or replace function public.get_lonekost(p_token text)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if not (private.can_view_company(a.category) or private.can_edit_cars(a.category)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return json_build_object('can_edit', private.can_edit_cars(a.category), 'cfg', private.lonekost_cfg(private.actor_company(a.driver_id)));
end $$;
revoke all on function public.get_lonekost(text) from public;
grant execute on function public.get_lonekost(text) to anon, authenticated;

-- Ändra (samma som save_car_full): can_edit_cars. Saknade nycklar behåller sitt värde. Loggas som 'lonekost' (från/till).
create or replace function public.save_lonekost(p_token text, p_cfg jsonb)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_co text; o jsonb; k jsonb := coalesce(p_cfg, '{}'::jsonb); n jsonb;
begin
  select * into a from private.session_actor(p_token);
  if not private.can_edit_cars(a.category) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(k) <> 'object' then raise exception 'invalid_lonekost' using errcode = '22023'; end if;
  v_co := private.actor_company(a.driver_id);
  o := private.lonekost_cfg(v_co);
  n := o || (k - 'sparad' - 'updated_at');
  begin
    insert into private.lonekost_settings as s (company_id, agavg, pension, loneskatt, ovr_forsakr, bas, sjuklon_pct, karens_pct,
        snitt_man, snitt_per, sem_i_snitt, sjuklon_dagar, updated_at, updated_by)
    values (v_co, (n->>'agavg')::numeric, (n->>'pension')::numeric, (n->>'loneskatt')::numeric, (n->>'ovr_forsakr')::numeric,
        n->>'bas', (n->>'sjuklon_pct')::numeric, (n->>'karens_pct')::numeric, (n->>'snitt_man')::numeric::int, n->>'snitt_per',
        (n->>'sem_i_snitt')::boolean, (n->>'sjuklon_dagar')::numeric::int, now(), a.driver_id)
    on conflict (company_id) do update set agavg = excluded.agavg, pension = excluded.pension, loneskatt = excluded.loneskatt,
        ovr_forsakr = excluded.ovr_forsakr, bas = excluded.bas, sjuklon_pct = excluded.sjuklon_pct, karens_pct = excluded.karens_pct,
        snitt_man = excluded.snitt_man, snitt_per = excluded.snitt_per, sem_i_snitt = excluded.sem_i_snitt,
        sjuklon_dagar = excluded.sjuklon_dagar, updated_at = now(), updated_by = a.driver_id;
  exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
    raise exception 'invalid_lonekost' using errcode = '22023';
  end;
  n := private.lonekost_cfg(v_co);
  if (o - 'sparad' - 'updated_at') is distinct from (n - 'sparad' - 'updated_at') then
    perform private.log(a.driver_id, a.category, 'lonekost', v_co,
      jsonb_build_object('from', o - 'sparad' - 'updated_at', 'to', n - 'sparad' - 'updated_at'), a.via_master);
  end if;
  return json_build_object('can_edit', true, 'cfg', n);
end $$;
revoke all on function public.save_lonekost(text, jsonb) from public;
grant execute on function public.save_lonekost(text, jsonb) to anon, authenticated;

-- Snittlön för en förare under en period, ur resdatan. Samma formel som Lönekoll/bilkalkylen:
--   (inkört inkl. moms + Uber tillbaka till brutto) ÷ 1,06 − Uberavgift 25 % − adm.avgift 1,3 % − inpassering 2 500 kr/mån = lönegrund
--   × provision 37 % = lön, + semesterersättning 13 %.
-- Inpasseringen räknas för varje månad med körningar, i proportion till hur stor del av månaden som ligger i perioden.
create or replace function private.forar_lon_period(p_company text, p_forar text, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with s as (
    select d.* from private.day_summary d
     where p_from <= p_to and d.company_id = p_company and d.forar = p_forar and d.day between p_from and p_to
  ), m as (
    select date_trunc('month', s.day)::date m from s group by 1
  ), ip as (
    select coalesce(sum((least(p_to, (m.m + interval '1 month')::date - 1) - greatest(p_from, m.m) + 1)::numeric
             / ((m.m + interval '1 month')::date - m.m)), 0) v from m
  ), t as (
    select coalesce(sum(s.inkort), 0) inkort, coalesce(sum(s.uber_gross), 0) uber, coalesce(sum(s.minutes), 0) minuter,
           coalesce(sum(s.shifts), 0) pass, count(distinct s.day) kordagar, min(s.day) forsta, max(s.day) sista from s
  ), x as (
    select t.*, (t.inkort + 0.26 * t.uber) / 1.06 ex, (select v from ip) inpass_man from t
  ), y as (
    select x.*, greatest(0, x.ex - 0.25 * x.uber - 0.013 * x.ex - 2500 * x.inpass_man) lonegrund from x
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'kalenderdagar', greatest(0, p_to - p_from + 1),
    'inkort', round(y.inkort, 2), 'uber', round(y.uber, 2), 'pass', y.pass, 'timmar', round(y.minuter / 60.0, 1),
    'kordagar', y.kordagar, 'forsta', y.forsta, 'sista', y.sista, 'inpass_man', round(y.inpass_man, 3),
    'lonegrund', round(y.lonegrund, 2), 'lon', round(y.lonegrund * 0.37, 2), 'sem', round(y.lonegrund * 0.37 * 0.13, 2))
  from y
$$;
revoke all on function private.forar_lon_period(text, text, date, date) from public, anon, authenticated;

-- Beräknad sjuklön för en sjukperiod. Föraren själv eller ägaren/S admin (flaggan 'sjuk', demo nekas) – samma som sjuk_get.
-- Snittet tas från de senaste snitt_man månaderna före första sjukdagen. Har föraren kört kortare tid än så
-- räknas snittet från första dagen med resdata (annars blir snittet för lågt för nya förare).
create or replace function public.sjuk_lon_calc(p_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; r private.sick_reports; v_co text; c jsonb; v_to date; v_from date; v_first date; l jsonb;
  v_bas numeric; v_dagar int; v_per_dag numeric; v_sjuk_dag numeric; v_karens numeric; v_days int; v_ag int; v_brutto numeric;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_id);
  v_co := private.actor_company(r.driver_id);
  c := private.lonekost_cfg(v_co);
  v_to := r.start_date - 1;
  v_from := (r.start_date - make_interval(months => (c->>'snitt_man')::int))::date;
  select min(d.day) into v_first from private.day_summary d where d.company_id = v_co and d.forar = r.driver_id and d.day <= v_to;
  if v_first is null then
    return jsonb_build_object('id', r.id, 'ingen_data', true, 'cfg', c, 'from', v_from, 'to', v_to);
  end if;
  v_from := greatest(v_from, v_first);
  l := private.forar_lon_period(v_co, r.driver_id, v_from, v_to);
  v_bas := (l->>'lon')::numeric + case when (c->>'sem_i_snitt')::boolean then (l->>'sem')::numeric else 0 end;
  v_dagar := (l->>'kalenderdagar')::int;
  v_per_dag := case when v_dagar > 0 then v_bas / v_dagar else 0 end;
  v_sjuk_dag := v_per_dag * (c->>'sjuklon_pct')::numeric / 100;
  v_karens := 7 * v_sjuk_dag * (c->>'karens_pct')::numeric / 100;
  v_days := private.sjuk_days(r);
  v_ag := least(v_days, (c->>'sjuklon_dagar')::int);
  v_brutto := v_sjuk_dag * v_ag;
  return jsonb_build_object('id', r.id, 'ingen_data', false, 'cfg', c, 'lon', l,
    'kortare', v_from > (r.start_date - make_interval(months => (c->>'snitt_man')::int))::date,
    'bas', round(v_bas, 2), 'per_dag', round(v_per_dag, 2),
    'per_kordag', case when (l->>'kordagar')::int > 0 then round(v_bas / (l->>'kordagar')::int, 2) end,
    'per_pass', case when (l->>'pass')::int > 0 then round(v_bas / (l->>'pass')::int, 2) end,
    'per_timme', case when (l->>'timmar')::numeric > 0 then round(v_bas / (l->>'timmar')::numeric, 2) end,
    'sjuklon_dag', round(v_sjuk_dag, 2), 'karens', round(least(v_karens, v_brutto), 2),
    'dagar', v_days, 'agare_dagar', v_ag, 'fk_dagar', greatest(0, v_days - v_ag), 'open', r.end_date is null,
    'brutto', round(v_brutto, 2), 'att_betala', round(greatest(0, v_brutto - v_karens), 2));
end $$;
revoke all on function public.sjuk_lon_calc(text, bigint) from public;
grant execute on function public.sjuk_lon_calc(text, bigint) to anon, authenticated;
