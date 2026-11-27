-- Admin › Ekonomi, fas 1 (Christian + Berra, 2026-11-27): sjuklön + verkstadstimmar per period, totalt och per förare.
-- Bara tillägg + tre funktioner som byts ut mot utökade versioner (provision som inställning). Ändrar inga tabellrader.
-- Ångra: supabase/migrations/undo/20261127e_ekonomi_fas1_undo.sql (återställer exakt det som låg i databasen före).
--
-- 1. Provision (procent av lönegrund) blir en inställning per åkeri i private.lonekost_settings (förvalt 37, som i Lönekoll
--    och på lönebeskeden: "Rak %, std.taxi 37 x lönegrund"). private.forar_lon_period (används av sjuk_lon_calc) läser den
--    i stället för det hårdkodade 0,37. Ägaren ändrar den under Admin › Bilar › Lönekostnad och sjuklön.
-- 2. Sjuklön: kolumnerna sjuklon_belopp + sjuklon_calc på private.sick_reports sparar beloppet när ägaren markerar Beviljad
--    (trigger, så sjuk_set_sjuklon och andra sjukfunktioner är orörda).
-- 3. private.sjuk_calc(r): samma uträkning som sjuk_lon_calc men utan inloggningskontroll (internt).
-- 4. private.ekonomi_calc + messaging_private.ekonomi_period + public.ekonomi_period: sammanställning per månad och förare.
--    Behörighet som payroll_month: bara ägare och superadmin, inte demo, bara det egna åkeriets förare.

-- ── 1. Provision ──────────────────────────────────────────────────────────────────────────
alter table private.lonekost_settings
  add column if not exists provision numeric(6,3) not null default 37 check (provision between 0 and 100);

create or replace function private.lonekost_cfg(p_company text)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select jsonb_build_object('agavg', s.agavg, 'pension', s.pension, 'loneskatt', s.loneskatt, 'ovr_forsakr', s.ovr_forsakr,
    'bas', s.bas, 'sjuklon_pct', s.sjuklon_pct, 'karens_pct', s.karens_pct, 'snitt_man', s.snitt_man, 'snitt_per', s.snitt_per,
    'sem_i_snitt', s.sem_i_snitt, 'sjuklon_dagar', s.sjuklon_dagar, 'provision', s.provision,
    'sparad', s.updated_at is not null, 'updated_at', s.updated_at)
  from (select * from private.lonekost_settings where company_id = p_company
        union all
        select p_company, 31.42, 4.4, 1.067, 0.26, 'lon', 80, 20, 6, 'dag', false, 14, null, null, 37
        where not exists (select 1 from private.lonekost_settings where company_id = p_company)) s
$function$;

create or replace function public.save_lonekost(p_token text, p_cfg jsonb)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
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
        snitt_man, snitt_per, sem_i_snitt, sjuklon_dagar, provision, updated_at, updated_by)
    values (v_co, (n->>'agavg')::numeric, (n->>'pension')::numeric, (n->>'loneskatt')::numeric, (n->>'ovr_forsakr')::numeric,
        n->>'bas', (n->>'sjuklon_pct')::numeric, (n->>'karens_pct')::numeric, (n->>'snitt_man')::numeric::int, n->>'snitt_per',
        (n->>'sem_i_snitt')::boolean, (n->>'sjuklon_dagar')::numeric::int, (n->>'provision')::numeric, now(), a.driver_id)
    on conflict (company_id) do update set agavg = excluded.agavg, pension = excluded.pension, loneskatt = excluded.loneskatt,
        ovr_forsakr = excluded.ovr_forsakr, bas = excluded.bas, sjuklon_pct = excluded.sjuklon_pct, karens_pct = excluded.karens_pct,
        snitt_man = excluded.snitt_man, snitt_per = excluded.snitt_per, sem_i_snitt = excluded.sem_i_snitt,
        sjuklon_dagar = excluded.sjuklon_dagar, provision = excluded.provision, updated_at = now(), updated_by = a.driver_id;
  exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
    raise exception 'invalid_lonekost' using errcode = '22023';
  end;
  n := private.lonekost_cfg(v_co);
  if (o - 'sparad' - 'updated_at') is distinct from (n - 'sparad' - 'updated_at') then
    perform private.log(a.driver_id, a.category, 'lonekost', v_co,
      jsonb_build_object('from', o - 'sparad' - 'updated_at', 'to', n - 'sparad' - 'updated_at'), a.via_master);
  end if;
  return json_build_object('can_edit', true, 'cfg', n);
end $function$;

-- Samma som förut, men provisionen (och därmed semesterersättningen) kommer från inställningen i stället för 0,37.
create or replace function private.forar_lon_period(p_company text, p_forar text, p_from date, p_to date)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
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
  ), pv as (
    select coalesce((private.lonekost_cfg(p_company)->>'provision')::numeric, 37) / 100 v
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'kalenderdagar', greatest(0, p_to - p_from + 1),
    'inkort', round(y.inkort, 2), 'uber', round(y.uber, 2), 'pass', y.pass, 'timmar', round(y.minuter / 60.0, 1),
    'kordagar', y.kordagar, 'forsta', y.forsta, 'sista', y.sista, 'inpass_man', round(y.inpass_man, 3),
    'lonegrund', round(y.lonegrund, 2), 'lon', round(y.lonegrund * (select v from pv), 2),
    'sem', round(y.lonegrund * (select v from pv) * 0.13, 2), 'provision', round((select v from pv) * 100, 3))
  from y
$function$;
revoke all on function private.forar_lon_period(text, text, date, date) from public, anon, authenticated;

-- ── 2. Sjuklön: spara beloppet när ägaren markerar Beviljad ──────────────────────────────────
alter table private.sick_reports
  add column if not exists sjuklon_belopp numeric(12,2),
  add column if not exists sjuklon_calc jsonb;

-- ── 3. Uträkning för en sjukperiod (samma som sjuk_lon_calc, utan inloggning – bara internt) ──────
create or replace function private.sjuk_calc(r private.sick_reports)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare v_co text; c jsonb; v_to date; v_from date; v_first date; l jsonb;
  v_bas numeric; v_dagar int; v_per_dag numeric; v_sjuk_dag numeric; v_karens numeric; v_days int; v_ag int; v_brutto numeric;
begin
  v_co := private.actor_company(r.driver_id);
  c := private.lonekost_cfg(v_co);
  v_to := r.start_date - 1;
  v_from := (r.start_date - make_interval(months => (c->>'snitt_man')::int))::date;
  select min(d.day) into v_first from private.day_summary d where d.company_id = v_co and d.forar = r.driver_id and d.day <= v_to;
  v_days := private.sjuk_days(r);
  v_ag := least(v_days, (c->>'sjuklon_dagar')::int);
  if v_first is null then
    return jsonb_build_object('ingen_data', true, 'dagar', v_days, 'agare_dagar', v_ag, 'sjuklon_dag', 0, 'karens', 0, 'brutto', 0, 'att_betala', 0);
  end if;
  v_from := greatest(v_from, v_first);
  l := private.forar_lon_period(v_co, r.driver_id, v_from, v_to);
  v_bas := (l->>'lon')::numeric + case when (c->>'sem_i_snitt')::boolean then (l->>'sem')::numeric else 0 end;
  v_dagar := (l->>'kalenderdagar')::int;
  v_per_dag := case when v_dagar > 0 then v_bas / v_dagar else 0 end;
  v_sjuk_dag := v_per_dag * (c->>'sjuklon_pct')::numeric / 100;
  v_karens := 7 * v_sjuk_dag * (c->>'karens_pct')::numeric / 100;
  v_brutto := v_sjuk_dag * v_ag;
  return jsonb_build_object('ingen_data', false, 'per_dag', round(v_per_dag, 2), 'sjuklon_dag', round(v_sjuk_dag, 4),
    'karens', round(least(v_karens, v_brutto), 2), 'dagar', v_days, 'agare_dagar', v_ag, 'brutto', round(v_brutto, 2),
    'att_betala', round(greatest(0, v_brutto - least(v_karens, v_brutto)), 2), 'provision', l->'provision', 'at', now());
end $function$;
revoke all on function private.sjuk_calc(private.sick_reports) from public, anon, authenticated;

-- Trigger: beloppet sparas när sjuklön sätts till Beviljad/Utbetald (eller slutdatum ändras medan det är beviljat).
-- Misslyckas uträkningen blir beloppet tomt; själva ändringen av sjuklön stoppas aldrig.
create or replace function private.sick_belopp_trg() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare c jsonb;
begin
  if new.sjuklon in ('beviljad', 'utbetald') then
    if old.sjuklon is distinct from new.sjuklon and old.sjuklon not in ('beviljad', 'utbetald')
       or new.sjuklon_belopp is null or old.end_date is distinct from new.end_date then
      begin
        c := private.sjuk_calc(new);
        new.sjuklon_calc := c;
        new.sjuklon_belopp := case when (c->>'ingen_data')::boolean then null else (c->>'att_betala')::numeric end;
      exception when others then
        new.sjuklon_calc := null; new.sjuklon_belopp := null;
      end;
    end if;
  else
    new.sjuklon_calc := null; new.sjuklon_belopp := null;
  end if;
  return new;
end $function$;
revoke all on function private.sick_belopp_trg() from public, anon, authenticated;
drop trigger if exists aa_sick_belopp on private.sick_reports;
create trigger aa_sick_belopp before update of sjuklon, end_date on private.sick_reports
  for each row execute function private.sick_belopp_trg();

-- ── 4. Ekonomi: sammanställning per månad och förare ──────────────────────────────────────────
-- Verkstad: som payroll_month (godkänd tid × timpriset som gällde vid godkännandet), uppdelat per månad.
-- Sjuklön: bara perioder där sjuklön är Beviljad/Utbetald. Perioder som går över månadsskifte delas dag för dag
-- (sjuklön dag 1–14); karensavdraget dras först i den första månaden (och rullar vidare om första månaden är för kort).
-- Stängda perioder med sparat belopp använder det sparade; öppna perioder räknas live.
create or replace function private.ekonomi_calc(p_company text, p_from date, p_to date)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare f date := date_trunc('month', p_from)::date; t date := (date_trunc('month', p_to) + interval '1 month')::date - 1;
  ft timestamptz; tt timestamptz;
  v jsonb; sj jsonb := '[]'::jsonb; pe jsonb := '[]'::jsonb;
  r private.sick_reports; c jsonb; v_dag numeric; v_kar numeric; v_ag int; v_ws date; v_we date; m date; me date;
  v_d int; v_g numeric; v_k numeric; v_net numeric; v_rest numeric; v_tot numeric; v_counted boolean; v_win_end date;
begin
  if t < f or t - f > 800 then raise exception 'bad_period' using errcode = '22023'; end if;
  ft := f::timestamp at time zone 'Europe/Stockholm'; tt := (t + 1)::timestamp at time zone 'Europe/Stockholm';
  select coalesce(jsonb_agg(to_jsonb(x) order by x.mon, x.namn, x.driver_id), '[]'::jsonb) into v from (
    select w.driver_id, private.forum_name(w.driver_id) namn,
      date_trunc('month', w.start_at at time zone 'Europe/Stockholm')::date mon,
      coalesce(sum(private.wh_minutes(w)) filter (where w.status = 'approved'), 0) approved_min,
      coalesce(round(sum(private.wh_minutes(w) / 60.0 * w.rate) filter (where w.status = 'approved')), 0) approved_kr,
      coalesce(sum(private.wh_minutes(w)) filter (where w.status = 'pending'), 0) pending_min,
      coalesce(sum(private.wh_minutes(w)) filter (where w.status = 'rejected'), 0) rejected_min
    from public.workshop_hours w
    where w.start_at >= ft and w.start_at < tt and private.actor_company(w.driver_id) = p_company
    group by w.driver_id, 3
  ) x;
  -- Sjukperioder som berör perioden (alla statusar, för listan); bara Beviljad/Utbetald räknas i summorna.
  for r in select s.* from private.sick_reports s
            where private.actor_company(s.driver_id) = p_company and s.start_date <= t
              and coalesce(s.end_date, private.sjuk_today()) >= f
            order by s.start_date, s.id loop
    v_counted := r.sjuklon in ('beviljad', 'utbetald');
    if r.end_date is not null and r.sjuklon_calc is not null then c := r.sjuklon_calc; else c := private.sjuk_calc(r); end if;
    v_dag := coalesce((c->>'sjuklon_dag')::numeric, 0); v_kar := coalesce((c->>'karens')::numeric, 0);
    v_ag := coalesce((c->>'agare_dagar')::int, 0); v_ws := r.start_date; v_we := r.start_date + v_ag - 1;
    v_tot := coalesce((c->>'att_betala')::numeric, 0);
    if v_counted and v_ag > 0 then
      v_rest := v_kar; m := date_trunc('month', v_ws)::date;
      while m <= v_we loop
        me := (m + interval '1 month')::date - 1;
        v_d := least(v_we, me) - greatest(v_ws, m) + 1;
        v_g := v_d * v_dag; v_k := least(v_rest, v_g); v_rest := v_rest - v_k; v_net := v_g - v_k;
        if m >= f and m <= t then
          sj := sj || jsonb_build_object('driver_id', r.driver_id, 'namn', private.forum_name(r.driver_id), 'mon', m, 'period_id', r.id,
            'dagar', v_d, 'brutto', round(v_g, 2), 'karens', round(v_k, 2), 'kr', round(v_net, 2));
        end if;
        m := (m + interval '1 month')::date;
      end loop;
    end if;
    pe := pe || jsonb_build_object('id', r.id, 'driver_id', r.driver_id, 'namn', private.forum_name(r.driver_id),
      'start', r.start_date, 'end', r.end_date, 'open', r.end_date is null, 'dagar', coalesce((c->>'dagar')::int, private.sjuk_days(r)),
      'agare_dagar', v_ag, 'status', r.status, 'sjuklon', r.sjuklon, 'counted', v_counted,
      'kr', case when v_counted then round(v_tot, 2) end, 'sparat', r.end_date is not null and r.sjuklon_calc is not null,
      'karens', case when v_counted then round(v_kar, 2) end, 'ingen_data', coalesce((c->>'ingen_data')::boolean, false),
      'certs', (select count(*) from private.sick_certs q where q.report_id = r.id and q.uploaded));
  end loop;
  return jsonb_build_object('from', f, 'to', t, 'rate', private.workshop_rate(), 'named', true,
    'cfg', (select jsonb_build_object('sjuklon_pct', x->'sjuklon_pct', 'karens_pct', x->'karens_pct', 'sjuklon_dagar', x->'sjuklon_dagar',
              'snitt_man', x->'snitt_man', 'provision', x->'provision') from (select private.lonekost_cfg(p_company) x) q),
    'verkstad', v, 'sjuk', sj, 'perioder', pe);
end $function$;
revoke all on function private.ekonomi_calc(text, date, date) from public, anon, authenticated;

create or replace function messaging_private.ekonomi_period(p_token text, p_from date, p_to date)
 returns jsonb language plpgsql security definer set search_path = '' as $function$
declare a record;
begin
  select * into a from private.bil_actor(p_token);
  if a.category is null or a.category not in ('agare', 'superadmin') or private.is_demo() then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null then raise exception 'bad_period' using errcode = '22023'; end if;
  return private.ekonomi_calc(a.company_id, p_from, p_to);
end $function$;
revoke all on function messaging_private.ekonomi_period(text, date, date) from public;
grant execute on function messaging_private.ekonomi_period(text, date, date) to anon, authenticated;
create or replace function public.ekonomi_period(p_token text, p_from date, p_to date) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.ekonomi_period(p_token, p_from, p_to) $$;
revoke all on function public.ekonomi_period(text, date, date) from public;
grant execute on function public.ekonomi_period(text, date, date) to anon, authenticated;
