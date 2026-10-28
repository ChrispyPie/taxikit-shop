-- Snabbare Körpassdata/Lönekoll (t540u, 2026-10-28)
-- Ny funktion, bara tillägg: get_trip_data ändras inte.
-- Förarsidorna (Körpassdata, Lönekoll, hjälpboten) visar bara den inloggades egna pass och resor
-- för alla utom ägaren (som har förarväljaren). get_trip_data skickar ändå hela åkeriets resor till
-- S admin (ca 15 000 resor, 4 MB), som sedan filtreras bort i telefonen. Den här funktionen
-- skickar bara de egna (ca 1 200 resor, 0,3 MB). Ägaren får exakt samma svar som från get_trip_data.
-- Ångra: se docs/snabbare/UNDO.md
create or replace function public.get_my_trip_data(p_token text, p_dataset text default 'current')
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare a record; v_meta jsonb; r json;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(a.category, '') = 'agare' then
    return public.get_trip_data(p_token, p_dataset);
  end if;
  select meta into v_meta from public.trip_datasets where name = p_dataset;
  if not found then return null; end if;
  -- samma som "övriga"-grenen i get_trip_data (egna rader via indexet trips_dataset_forar / shifts_dataset_forar)
  select (v_meta || jsonb_build_object(
    'trips', coalesce((select jsonb_agg(t.data order by t.ord) from public.trips t
                       where t.dataset = p_dataset and t.forar = a.driver_id), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(s.data order by s.ord) from public.shifts s
                       where s.dataset = p_dataset and s.forar = a.driver_id), '[]'::jsonb)
  ))::json into r;
  return private.demo_mask(r);
end $function$;

revoke all on function public.get_my_trip_data(text, text) from public;
grant execute on function public.get_my_trip_data(text, text) to anon, authenticated;
