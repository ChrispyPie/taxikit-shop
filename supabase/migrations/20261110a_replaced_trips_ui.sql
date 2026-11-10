-- Visning av ersatta kvitton i appen (tillägg, 2026-11-10).
-- Ny funktion get_replaced_trips: ägaren får alla ersatta i datasetet,
-- övriga bara sina egna. Räknas inte in i totalsummor (klienten visar dem
-- överstrukna och nedtonade). Fungerar för valfritt suffix (-02 … -10).
-- Ångra: supabase/migrations/undo/20261110a_replaced_trips_ui_undo.sql
create or replace function public.get_replaced_trips(p_token text, p_dataset text default 'current')
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare a record; r jsonb;
begin
  select * into a from private.session_actor(p_token);
  if a.driver_id is null then
    return '[]'::json;
  end if;
  if p_dataset is null or p_dataset !~ '^(current|arkiv|(monthly/)?[0-9]{4}-[0-9]{2})$' then
    return '[]'::json;
  end if;
  if coalesce(a.category, '') = 'agare' then
    select coalesce(jsonb_agg(row_data order by startdatum, kvittonr), '[]'::jsonb) into r
    from (
      select startdatum, kvittonr,
        (e.data || jsonb_build_object(
          'kvittonr', e.kvittonr,
          'forar', e.forar,
          'startdatum', e.startdatum,
          'taxi', coalesce(e.taxi, e.data->>'taxi'),
          'ersatt_av', e.ersatt_av
        )) as row_data
      from private.ersatta_kvitton e
      where e.dataset = p_dataset
    ) s;
  else
    select coalesce(jsonb_agg(row_data order by startdatum, kvittonr), '[]'::jsonb) into r
    from (
      select startdatum, kvittonr,
        (e.data || jsonb_build_object(
          'kvittonr', e.kvittonr,
          'forar', e.forar,
          'startdatum', e.startdatum,
          'taxi', coalesce(e.taxi, e.data->>'taxi'),
          'ersatt_av', e.ersatt_av
        )) as row_data
      from private.ersatta_kvitton e
      where e.dataset = p_dataset and e.forar = a.driver_id
    ) s;
  end if;
  return private.demo_mask(jsonb_build_object('trips', r))->'trips';
end
$function$;

revoke all on function public.get_replaced_trips(text, text) from public;
grant execute on function public.get_replaced_trips(text, text) to anon, authenticated;
