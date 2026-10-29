-- Ångra 20261029k_besiktning_bildbilaga.sql.
-- Kör också: ta bort edge-funktionen onskemal-foto (eller låt den ligga, den gör inget utan funktionerna nedan),
-- och reverta merge-commiten i GitHub (adminsidan).
-- Inloggning, bilar och önskemål påverkas inte. Datum som ägaren skrivit in (senaste besiktning m.m.) ligger kvar.

-- Del 1
select cron.unschedule('taxikit-bil-kontroll') where exists (select 1 from cron.job where jobname = 'taxikit-bil-kontroll');
drop function if exists private.car_kontroll_check();

-- car_kalkyl_json och save_car_full som i 20261029h/20261029j (live före bytet):
CREATE OR REPLACE FUNCTION private.car_kalkyl_json(c cars)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object('bildtyp', c.bildtyp, 'specialfordon', c.specialfordon,
    'i_trafik', c.i_trafik, 'ur_trafik', c.ur_trafik, 'besiktning', c.besiktning, 'plombering', c.plombering, 'alkotest', c.alkotest,
    'livslangd_ar', c.livslangd_ar, 'inkopspris', c.inkopspris, 'rantor_ar', c.rantor_ar, 'skatt_ar', c.skatt_ar,
    'service_ar', c.service_ar, 'taxiavg_ar', c.taxiavg_ar, 'forsakring_ar', c.forsakring_ar, 'tvatt_ar', c.tvatt_ar,
    'mil_ar', c.mil_ar, 'intakt_mode', c.intakt_mode, 'intakt_ar', c.intakt_ar)
$function$;

CREATE OR REPLACE FUNCTION public.save_car_full(p_token text, p_id bigint, p_car jsonb, p_kalkyl jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    if v_typ = 'special' then v_typ := 'miljobil'; end if;   -- äldre sparad adminsida skickar 'special'
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
  if (v_typ is not null and v_typ not in ('sedan','kombi','storbil','miljobil','executive','mirai','trafic'))
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
end $function$
;
revoke all on function public.save_car_full(text, bigint, jsonb, jsonb) from public;
grant execute on function public.save_car_full(text, bigint, jsonb, jsonb) to anon, authenticated;

drop function if exists private.car_kontroll_next(date, date);
-- Loggen och kolumnerna *_nasta tas bort sist. Vill du spara dem, kör först:
--   select * from private.car_kontroll_notices;  select id, bilnummer, besiktning_nasta, plombering_nasta, alkotest_nasta from public.cars;
drop table if exists private.car_kontroll_notices;
alter table public.cars drop column if exists besiktning_nasta, drop column if exists plombering_nasta, drop column if exists alkotest_nasta;
-- Notiser som redan skickats ligger kvar i notisflödet (event_notices) och försvinner efter 60 dagar.

-- Del 2
-- dev_wish_json som före bytet:
CREATE OR REPLACE FUNCTION private.dev_wish_json(w dev_wishes, p_me text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('id', w.id, 'body', w.body, 'status', w.status, 'reply', w.reply,
    'created_at', w.created_at, 'updated_at', w.updated_at, 'mine', w.author_id = p_me,
    'author', (select nullif(btrim(coalesce(d.first_name, '') || ' ' || left(coalesce(d.last_name, ''), 1)), '')
                 from public.drivers d where d.id = w.author_id))
$function$;

drop function if exists public.dev_wish_photo_begin(text, bigint);
drop function if exists public.dev_wish_photo_finish(bigint, boolean);
drop function if exists public.dev_wish_photo_list(text, bigint);
drop function if exists public.dev_wish_photo_delete_svc(text, bigint);
drop function if exists public.dev_wish_delete_svc(text, bigint);
drop function if exists private.dev_wish_photo_ok(dev_wishes, text, text);

-- Bilderna: töm bucketen först (Supabase › Storage › onskemal-foton › markera alla › Delete),
-- annars går den inte att ta bort. Sedan:
--   drop table if exists public.dev_wish_photos;
--   delete from storage.buckets where id = 'onskemal-foton';
-- (Vill du behålla bilderna: hoppa över de två raderna. Tabellen och bucketen gör ingen skada.)
