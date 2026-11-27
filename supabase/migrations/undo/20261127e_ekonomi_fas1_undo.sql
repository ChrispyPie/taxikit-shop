-- Ångra 20261127e_ekonomi_fas1.sql. Kör i denna ordning (inget annat berörs).
-- Steg 1: ta bort det nya (Ekonomi-sidan visar då "Det finns inte på servern ännu"; Löner-sidan i appen går att återställa med revert av PR).
drop function if exists public.ekonomi_period(text, date, date);
drop function if exists messaging_private.ekonomi_period(text, date, date);
drop function if exists private.ekonomi_calc(text, date, date);
drop trigger if exists aa_sick_belopp on private.sick_reports;
drop function if exists private.sick_belopp_trg();
drop function if exists private.sjuk_calc(private.sick_reports);
-- Steg 2: provision-kolumnen måste bort först (gamla lonekost_cfg använder select * och skulle annars fela). Förvalt värde 37 gäller som förut;
--   en ändrad provision går förlorad (finns i Admin › Logg som 'lonekost').
alter table private.lonekost_settings drop column if exists provision;
-- Steg 2b: återställ de tre funktionerna exakt som de låg i databasen 2026-11-27 före ändringen (provision hårdkodad 0,37).
CREATE OR REPLACE FUNCTION private.lonekost_cfg(p_company text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('agavg', s.agavg, 'pension', s.pension, 'loneskatt', s.loneskatt, 'ovr_forsakr', s.ovr_forsakr,
    'bas', s.bas, 'sjuklon_pct', s.sjuklon_pct, 'karens_pct', s.karens_pct, 'snitt_man', s.snitt_man, 'snitt_per', s.snitt_per,
    'sem_i_snitt', s.sem_i_snitt, 'sjuklon_dagar', s.sjuklon_dagar, 'sparad', s.updated_at is not null, 'updated_at', s.updated_at)
  from (select * from private.lonekost_settings where company_id = p_company
        union all
        select p_company, 31.42, 4.4, 1.067, 0.26, 'lon', 80, 20, 6, 'dag', false, 14, null, null
        where not exists (select 1 from private.lonekost_settings where company_id = p_company)) s
$function$
;

CREATE OR REPLACE FUNCTION public.save_lonekost(p_token text, p_cfg jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION private.forar_lon_period(p_company text, p_forar text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    select t.*, (t.inkort + 0.25 * t.uber) / 1.06 ex, (select v from ip) inpass_man from t
  ), y as (
    select x.*, greatest(0, x.ex - 0.25 * x.uber - 0.013 * x.ex - 2500 * x.inpass_man) lonegrund from x
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'kalenderdagar', greatest(0, p_to - p_from + 1),
    'inkort', round(y.inkort, 2), 'uber', round(y.uber, 2), 'pass', y.pass, 'timmar', round(y.minuter / 60.0, 1),
    'kordagar', y.kordagar, 'forsta', y.forsta, 'sista', y.sista, 'inpass_man', round(y.inpass_man, 3),
    'lonegrund', round(y.lonegrund, 2), 'lon', round(y.lonegrund * 0.37, 2), 'sem', round(y.lonegrund * 0.37 * 0.13, 2))
  from y
$function$
;

revoke all on function private.forar_lon_period(text, text, date, date) from public, anon, authenticated;
-- Steg 3 (valfritt, raderar sparade belopp och inställningen; kör bara efter ja från Christian):
-- alter table private.sick_reports drop column if exists sjuklon_belopp, drop column if exists sjuklon_calc;
