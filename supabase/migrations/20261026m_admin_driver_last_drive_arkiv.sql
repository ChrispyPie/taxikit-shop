-- Körd live 2026-10-26 (t385u) efter 20261026j. Ersätter admin_driver_last_drive med en version som även läser arkivet.
-- Låter admin_driver_last_drive även titta i arkivet, så att en förare som senast körde 2025
-- får "Senast körd 14 nov 2025" i stället för "Inte kört sedan jan 2026". "from" blir då 2025-01-01.
-- Samma utdata och behörighet; bara två extra union all-grenar mot private.arkiv_*.
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
    union all
    select coalesce(t.forar, t.data->>'forar'), left(t.startdatum, 10)
      from private.arkiv_trips t where t.dataset = 'arkiv' and t.startdatum ~ '^\d{4}-\d{2}-\d{2}'
    union all
    select coalesce(s.forar, s.data->>'forar'), substr(s.start, 1, 4) || '-' || substr(s.start, 5, 2) || '-' || substr(s.start, 7, 2)
      from private.arkiv_shifts s where s.dataset = 'arkiv' and s.start ~ '^\d{8}'
  ), g as (
    select id, max(d) d from u where id is not null and d <= to_char(now() at time zone 'Europe/Stockholm' + interval '1 day', 'YYYY-MM-DD') group by id
  )
  select (select min(d) from u), coalesce((select json_object_agg(id, d) from g), '{}'::json) into v_from, v_map;
  return json_build_object('from', v_from, 'drivers', v_map);
end $$;
-- Ångra: kör om 20261026j_admin_driver_last_drive.sql (originalversionen).
