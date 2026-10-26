-- t348u: fliken "Original" – samma vy som prognos.taxigoteborg.nu (zon → 3 block × fordonstyp),
-- byggd från senaste serverhämtade snapshot. Additivt: en ny läsfunktion, inga tabelländringar.
-- Returnerar bara aggregerade siffror (vitlistade fält), aldrig kod/token.
create or replace function public.prognos_original(p_token text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; s record;
begin
  select * into a from private.session_actor(p_token);
  select fetched_at, payload into s from public.prognos_snapshots where ok order by fetched_at desc limit 1;
  if s.payload is null then return null; end if;
  return json_build_object(
    'fetched_at', s.fetched_at,
    'generated_at', s.payload->>'generated_at',
    'zones', coalesce((
      select json_object_agg(z.key, json_build_object(
        'id', z.key, 'name', z.value->>'name', 'status', z.value->>'status',
        'total', coalesce((z.value->>'total')::int, 0),
        'app', coalesce((z.value->>'app')::int, 0), 'barnstol', coalesce((z.value->>'barnstol')::int, 0),
        'ovrigt', coalesce((z.value->>'ovrigt')::int, 0), 'storbil', coalesce((z.value->>'storbil')::int, 0),
        'elbil', coalesce((z.value->>'elbil')::int, 0), 'babyskydd', coalesce((z.value->>'babyskydd')::int, 0),
        'timeFrom', z.value->>'timeFrom', 'timeTo', z.value->>'timeTo',
        'last_updated', z.value->>'last_updated',
        'windowMinutes', coalesce((z.value->>'windowMinutes')::int, 120),
        'blocks', coalesce((select json_agg(json_build_object(
            'total', coalesce((b->>'total')::int, 0), 'app', coalesce((b->>'app')::int, 0),
            'barnstol', coalesce((b->>'barnstol')::int, 0), 'ovrigt', coalesce((b->>'ovrigt')::int, 0),
            'storbil', coalesce((b->>'storbil')::int, 0), 'elbil', coalesce((b->>'elbil')::int, 0),
            'babyskydd', coalesce((b->>'babyskydd')::int, 0)) order by ord)
          from jsonb_array_elements(case when jsonb_typeof(z.value->'blocks') = 'array' then z.value->'blocks' else '[]'::jsonb end)
               with ordinality as t(b, ord)), '[]'::json)
      ))
      from jsonb_each(s.payload->'zones') z
    ), '{}'::json)
  );
end $$;
revoke all on function public.prognos_original(text) from public;
grant execute on function public.prognos_original(text) to anon, authenticated;

-- ÅNGRA:
-- drop function if exists public.prognos_original(text);
