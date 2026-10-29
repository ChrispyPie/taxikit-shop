-- Ångra 20261029h_bilkalkyl.sql.
-- Steg 1 (räcker oftast): ta bort nya RPC:n och återställ list_cars som den var före 29 okt 2026.
-- Den gamla adminsidan fungerar då som förut. Kolumnerna och kalkyluppgifterna finns kvar.
drop function if exists public.save_car_full(text, bigint, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.list_cars(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if not (private.can_view_company(a.category) or private.can_edit_cars(a.category)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return json_build_object('can_edit', private.can_edit_cars(a.category), 'fuel', private.fuel_overview(),
    'cars', coalesce((select jsonb_agg(private.car_json(c) || jsonb_build_object('calc', private.car_cost(c)) order by c.bilnummer) from public.cars c), '[]'::jsonb));
end $function$;

drop function if exists private.car_revenue(text, text, date, date);
drop function if exists private.car_kalkyl_json(public.cars);

-- Steg 2 (valfritt, raderar uppgifter som ägaren har fyllt i, kör bara efter ja från Christian):
-- alter table public.cars
--   drop column if exists bildtyp, drop column if exists specialfordon, drop column if exists i_trafik, drop column if exists ur_trafik,
--   drop column if exists besiktning, drop column if exists plombering, drop column if exists alkotest, drop column if exists livslangd_ar,
--   drop column if exists inkopspris, drop column if exists rantor_ar, drop column if exists skatt_ar, drop column if exists service_ar,
--   drop column if exists taxiavg_ar, drop column if exists forsakring_ar, drop column if exists tvatt_ar, drop column if exists mil_ar,
--   drop column if exists intakt_mode, drop column if exists intakt_ar,
--   drop column if exists kalkyl_updated_at, drop column if exists kalkyl_updated_by;
