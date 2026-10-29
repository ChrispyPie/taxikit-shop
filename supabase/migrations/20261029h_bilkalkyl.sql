-- Bilkalkyl (t620u): Admin › Bilar visar vinst/förlust per bil, som Taxi Göteborgs "Bilar i Taxitrafik".
-- Bara tillägg: nya kolumner i public.cars (alla får vara tomma), två nya private-funktioner,
-- en ny RPC public.save_car_full och en utökad public.list_cars (samma nycklar som förut + 'kalkyl', 'intakt', 'idag').
-- public.save_car ändras inte (save_car_full anropar den och sparar sedan kalkylfälten i samma transaktion).
-- Behörighet som förut: läsa = can_view_company eller can_edit_cars, ändra = can_edit_cars (ägare och S admin).
-- Vinst = inkört − förarlön − avgifter − bilkostnader (t620u).
-- Inkört: riktig resdata från private.day_summary för bilnumret, senaste 365 dagarna (begränsat till datum i/ur trafik).
--   Samma siffror som Åkeridata (inkort, Uber räknat till 74 %) + Uber brutto, BOM och inpasseringsandel, så att appen
--   kan räkna förarlönen med samma formel som Lönekoll. Bilar utan resdata kan få en manuell intäkt/år.
-- Ångra: supabase/migrations/undo/20261029h_bilkalkyl_undo.sql

alter table public.cars
  add column if not exists bildtyp text check (bildtyp in ('sedan','kombi','storbil','special')),
  add column if not exists specialfordon boolean,
  add column if not exists i_trafik date,
  add column if not exists ur_trafik date,
  add column if not exists besiktning date,
  add column if not exists plombering date,
  add column if not exists alkotest date,
  add column if not exists livslangd_ar numeric(4,1) check (livslangd_ar > 0 and livslangd_ar <= 30),
  add column if not exists inkopspris numeric(12,2) check (inkopspris >= 0),
  add column if not exists rantor_ar numeric(12,2) check (rantor_ar >= 0),
  add column if not exists skatt_ar numeric(12,2) check (skatt_ar >= 0),
  add column if not exists service_ar numeric(12,2) check (service_ar >= 0),
  add column if not exists taxiavg_ar numeric(12,2) check (taxiavg_ar >= 0),
  add column if not exists forsakring_ar numeric(12,2) check (forsakring_ar >= 0),
  add column if not exists tvatt_ar numeric(12,2) check (tvatt_ar >= 0),
  add column if not exists mil_ar integer check (mil_ar > 0 and mil_ar <= 100000),
  add column if not exists intakt_mode text check (intakt_mode in ('data','manual')),
  add column if not exists intakt_ar numeric(12,2) check (intakt_ar >= 0),
  add column if not exists kalkyl_updated_at timestamptz,
  add column if not exists kalkyl_updated_by text;

-- Kalkylfälten som json (samma namn som kolumnerna)
create or replace function private.car_kalkyl_json(c public.cars)
returns jsonb language sql stable as $$
  select jsonb_build_object('bildtyp', c.bildtyp, 'specialfordon', c.specialfordon,
    'i_trafik', c.i_trafik, 'ur_trafik', c.ur_trafik, 'besiktning', c.besiktning, 'plombering', c.plombering, 'alkotest', c.alkotest,
    'livslangd_ar', c.livslangd_ar, 'inkopspris', c.inkopspris, 'rantor_ar', c.rantor_ar, 'skatt_ar', c.skatt_ar,
    'service_ar', c.service_ar, 'taxiavg_ar', c.taxiavg_ar, 'forsakring_ar', c.forsakring_ar, 'tvatt_ar', c.tvatt_ar,
    'mil_ar', c.mil_ar, 'intakt_mode', c.intakt_mode, 'intakt_ar', c.intakt_ar)
$$;
revoke all on function private.car_kalkyl_json(public.cars) from public, anon, authenticated;

-- Inkört (inkl. moms), Uber brutto, BOM, km och dagar för ett bilnummer under en period, ur private.day_summary.
-- inpass_man = hur många "förarmånader" av inpasseringsavgiften som hör till bilen: för varje förare och månad
-- bilens andel av förarens inkört den månaden × andelen av månaden som ligger i perioden.
create or replace function private.car_revenue(p_company text, p_nr text, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with s as (
    select d.* from private.day_summary d
     where p_from <= p_to and d.company_id = p_company and d.day between p_from and p_to
  ), c as (
    select * from s where upper(btrim(s.taxi)) = upper(btrim(p_nr))
  ), cm as (
    select c.forar, date_trunc('month', c.day)::date m, sum(coalesce(c.inkort, 0) + 0.26 * coalesce(c.uber_gross, 0)) b
      from c group by 1, 2
  ), tm as (
    select s.forar, date_trunc('month', s.day)::date m, sum(coalesce(s.inkort, 0) + 0.26 * coalesce(s.uber_gross, 0)) b
      from s where s.forar in (select forar from cm) group by 1, 2
  ), ip as (
    select coalesce(sum(case when tm.b > 0 then cm.b / tm.b else 0 end
             * ((least(p_to, (cm.m + interval '1 month')::date - 1) - greatest(p_from, cm.m) + 1)::numeric
                / (((cm.m + interval '1 month')::date - cm.m)))), 0) v
      from cm join tm using (forar, m)
  )
  select jsonb_build_object('from', p_from, 'to', p_to,
    'dagar', case when p_from <= p_to then p_to - p_from + 1 else 0 end,
    'inkort', coalesce(round(sum(c.inkort), 2), 0), 'uber', coalesce(round(sum(c.uber_gross), 2), 0),
    'bom', coalesce(round(sum(c.bom_kr), 2), 0), 'km', coalesce(round(sum(c.km), 1), 0),
    'kordagar', count(distinct c.day), 'forare', count(distinct c.forar), 'pass', coalesce(sum(c.shifts), 0),
    'inpass_man', round((select v from ip), 3), 'forsta', min(c.day), 'sista', max(c.day))
    from c
$$;
revoke all on function private.car_revenue(text, text, date, date) from public, anon, authenticated;

-- Samma som förut + 'kalkyl' och 'intakt' per bil och 'idag' överst.
create or replace function public.list_cars(p_token text)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_co text; v_to date := (now() at time zone 'Europe/Stockholm')::date - 1;
begin
  select * into a from private.session_actor(p_token);
  if not (private.can_view_company(a.category) or private.can_edit_cars(a.category)) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_co := private.actor_company(a.driver_id);
  return json_build_object('can_edit', private.can_edit_cars(a.category), 'fuel', private.fuel_overview(), 'idag', v_to + 1,
    'cars', coalesce((select jsonb_agg(private.car_json(c) || jsonb_build_object('calc', private.car_cost(c),
        'kalkyl', private.car_kalkyl_json(c),
        'intakt', private.car_revenue(v_co, c.bilnummer, greatest(v_to - 364, coalesce(c.i_trafik, v_to - 364)), least(v_to, coalesce(c.ur_trafik, v_to))))
      order by c.bilnummer) from public.cars c), '[]'::jsonb));
end $$;

-- Spara bil + kalkyl. p_car går till public.save_car (samma kontroller och logg som förut),
-- p_kalkyl sparas i kalkylkolumnerna. Allt i samma transaktion. Loggas som 'car_kalkyl' (från/till) om något ändrades.
create or replace function public.save_car_full(p_token text, p_id bigint, p_car jsonb, p_kalkyl jsonb)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; k jsonb := coalesce(p_kalkyl, '{}'::jsonb); r json; o public.cars; n public.cars; v_id bigint;
  v_typ text; v_sp boolean; v_it date; v_ut date; v_bes date; v_plo date; v_alk date; v_liv numeric; v_ink numeric;
  v_ran numeric; v_ska numeric; v_ser numeric; v_avg numeric; v_for numeric; v_tva numeric; v_mil int;
  v_im text; v_ia numeric;
begin
  select * into a from private.session_actor(p_token);
  if not private.can_edit_cars(a.category) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(k) <> 'object' then raise exception 'invalid_kalkyl' using errcode = '22023'; end if;
  begin
    v_typ := nullif(k->>'bildtyp', '');
    v_sp := case when nullif(k->>'specialfordon', '') is null then null else (k->>'specialfordon')::boolean end;
    v_it := nullif(k->>'i_trafik', '')::date;   v_ut := nullif(k->>'ur_trafik', '')::date;
    v_bes := nullif(k->>'besiktning', '')::date; v_plo := nullif(k->>'plombering', '')::date; v_alk := nullif(k->>'alkotest', '')::date;
    v_liv := round(nullif(k->>'livslangd_ar', '')::numeric, 1);
    v_ink := round(nullif(k->>'inkopspris', '')::numeric, 2);
    v_ran := round(nullif(k->>'rantor_ar', '')::numeric, 2);
    v_ska := round(nullif(k->>'skatt_ar', '')::numeric, 2);
    v_ser := round(nullif(k->>'service_ar', '')::numeric, 2);
    v_avg := round(nullif(k->>'taxiavg_ar', '')::numeric, 2);
    v_for := round(nullif(k->>'forsakring_ar', '')::numeric, 2);
    v_tva := round(nullif(k->>'tvatt_ar', '')::numeric, 2);
    v_mil := round(nullif(k->>'mil_ar', '')::numeric)::int;
    v_im := coalesce(nullif(k->>'intakt_mode', ''), 'data');
    v_ia := case when v_im = 'manual' then round(nullif(k->>'intakt_ar', '')::numeric, 2) end;
  exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
    raise exception 'invalid_kalkyl' using errcode = '22023';
  end;
  if (v_typ is not null and v_typ not in ('sedan','kombi','storbil','special'))
     or (v_it is not null and v_it not between date '1990-01-01' and date '2100-01-01')
     or (v_ut is not null and v_ut not between date '1990-01-01' and date '2100-01-01')
     or (v_it is not null and v_ut is not null and v_ut < v_it)
     or (v_bes is not null and v_bes not between date '1990-01-01' and date '2100-01-01')
     or (v_plo is not null and v_plo not between date '1990-01-01' and date '2100-01-01')
     or (v_alk is not null and v_alk not between date '1990-01-01' and date '2100-01-01')
     or (v_liv is not null and (v_liv <= 0 or v_liv > 30))
     or least(v_ink, v_ran, v_ska, v_ser, v_avg, v_for, v_tva, v_ia) < 0
     or greatest(v_ink, v_ran, v_ska, v_ser, v_avg, v_for, v_tva, v_ia) > 50000000
     or (v_mil is not null and (v_mil <= 0 or v_mil > 100000))
     or v_im not in ('data','manual') or (v_im = 'manual' and v_ia is null) then
    raise exception 'invalid_kalkyl' using errcode = '22023';
  end if;
  r := public.save_car(p_token, p_id, p_car);   -- kontrollerar och loggar bilfälten som förut
  v_id := (r->>'id')::bigint;
  select * into o from public.cars where id = v_id;
  update public.cars set bildtyp = v_typ, specialfordon = v_sp, i_trafik = v_it, ur_trafik = v_ut, besiktning = v_bes,
      plombering = v_plo, alkotest = v_alk, livslangd_ar = v_liv, inkopspris = v_ink, rantor_ar = v_ran, skatt_ar = v_ska,
      service_ar = v_ser, taxiavg_ar = v_avg, forsakring_ar = v_for, tvatt_ar = v_tva, mil_ar = v_mil,
      intakt_mode = v_im, intakt_ar = v_ia
    where id = v_id returning * into n;
  if private.car_kalkyl_json(o) is distinct from private.car_kalkyl_json(n) then
    update public.cars set kalkyl_updated_at = now(), kalkyl_updated_by = a.driver_id where id = v_id returning * into n;
    perform private.log(a.driver_id, a.category, 'car_kalkyl', n.bilnummer,
      jsonb_build_object('from', private.car_kalkyl_json(o), 'to', private.car_kalkyl_json(n), 'ny', p_id is null), a.via_master);
  end if;
  return (private.car_json(n) || jsonb_build_object('calc', private.car_cost(n), 'kalkyl', private.car_kalkyl_json(n)))::json;
end $$;
revoke all on function public.save_car_full(text, bigint, jsonb, jsonb) from public;
grant execute on function public.save_car_full(text, bigint, jsonb, jsonb) to anon, authenticated;
