-- t378u: Admin › Chaufförer – senaste kördatum per förare, så listan kan sorteras efter senast körd.
-- Additivt: EN ny RPC. Inga ALTER/DROP/ändringar av befintliga funktioner eller tabeller.
-- Behörighet: samma som förarlistan (private.require_admin → admin/ägare/S admin). Demosessioner har
-- alltid kategori 'standard' på servern och nekas därför (ägar-demot använder påhittad data i demo.js).
-- Datum = senaste dag i resdatan (trips.startdatum) ELLER körpassdatan (shifts.start, 'YYYYMMDD …'),
-- det som är senast. Förar-id räknas på samma sätt som i admin_list_drivers.
-- Returnerar bara id + datum (YYYY-MM-DD), inga belopp eller resdetaljer.
--   { "from": "2026-01-01", "drivers": { "710022": "2026-10-26", … } }
-- "from" = äldsta dag som finns i datan, så appen kan skriva "Inte kört sedan jan 2026" i stället för "Aldrig kört".
create or replace function public.admin_driver_last_drive(p_token text)
returns json language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare a record; v_from text; v_map json;
begin
  select * into a from private.require_admin(p_token);
  with u as (
    select coalesce(t.forar, t.data->>'forar', ds.meta->>'forar') id, left(t.startdatum, 10) d
      from public.trips t join public.trip_datasets ds on ds.name = t.dataset
     where t.startdatum ~ '^\d{4}-\d{2}-\d{2}'
    union all
    select coalesce(s.forar, s.data->>'forar', ds.meta->>'forar'),
           substr(s.start, 1, 4) || '-' || substr(s.start, 5, 2) || '-' || substr(s.start, 7, 2)
      from public.shifts s join public.trip_datasets ds on ds.name = s.dataset
     where s.start ~ '^\d{8}'
  ), g as (
    select id, max(d) d from u where id is not null and d <= to_char(now() at time zone 'Europe/Stockholm' + interval '1 day', 'YYYY-MM-DD') group by id
  )
  select (select min(d) from u), coalesce((select json_object_agg(id, d) from g), '{}'::json) into v_from, v_map;
  return json_build_object('from', v_from, 'drivers', v_map);
end $$;
revoke all on function public.admin_driver_last_drive(text) from public;
grant execute on function public.admin_driver_last_drive(text) to anon, authenticated;

-- Ångra:
-- drop function if exists public.admin_driver_last_drive(text);
