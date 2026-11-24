-- FÖRSLAG (inte körd, ingen migration). Prognoshistorik: summerade antal per zon/datum/timme.
-- Bara aggregat – inga boknings-id, inga förare. Läses via inloggad session som övriga prognos-RPC:er.
-- Undo: drop function if exists public.prognos_historik(text, text);
create or replace function public.prognos_historik(p_token text, p_zone text)
returns json language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if p_zone = 'morgon' then
    -- Morgonprognos (lämning 292): senaste version före 04:00 per datum, timmar 04–08
    return coalesce((select json_agg(json_build_object('d', date_iso, 'h', buckets) order by date_iso)
      from (select distinct on (date_iso) date_iso, buckets from prognos_morgon_log
            where (first_seen at time zone 'Europe/Stockholm') < (date_iso + time '04:00')
            order by date_iso, first_seen desc) m), '[]'::json);
  end if;
  -- Zoner: taxidygn 06–06 (natten räknas till kvällens datum)
  return coalesce((select json_agg(json_build_object('d', d, 'h', hs) order by d) from (
    -- tomma timmar/dagar fylls med 0 i klienten
    select d, json_object_agg(h, n) hs from (
      select ((estimated_at at time zone 'Europe/Stockholm') - interval '6 hours')::date d,
             extract(hour from estimated_at at time zone 'Europe/Stockholm')::int h, count(*)::int n
      from prognos_booking_history where zone_id = p_zone group by 1,2) x
    group by d) y), '[]'::json);
end $$;
revoke all on function public.prognos_historik(text, text) from public;
grant execute on function public.prognos_historik(text, text) to anon, authenticated;
