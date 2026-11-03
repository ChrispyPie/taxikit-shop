-- Ångra 20261103a_prognos_v2.sql. Kör EFTER att gamla prognos-sync är deployad igen
-- (annars fortsätter v2 att skriva addons och då finns kolumnen inte).
-- 1) prognos_list_bookings exakt som före v2 (utan addons, utan passerade 0–40-bokningar).
create or replace function public.prognos_list_bookings(p_token text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; v_from timestamptz; v_to timestamptz;
begin
  select * into a from private.session_actor(p_token);
  v_from := coalesce(p_from, now() - interval '15 minutes');
  v_to := coalesce(p_to, now() + interval '2 hours 30 minutes');
  return coalesce((
    select json_agg(json_build_object(
      'id', id, 'zone_id', zone_id, 'zone_name', zone_name, 'category', category,
      'estimated_at', estimated_at, 'observed_at', observed_at, 'block_index', block_index,
      'current_block', coalesce(current_block, block_index),
      'confidence', confidence, 'status', status
    ) order by estimated_at, zone_id, category)
    from public.prognos_bookings
    where estimated_at >= v_from and estimated_at <= v_to
      and status = 'open'
  ), '[]'::json);
end $function$;

-- 2) Öppna igen de fristående barnstol-/babyskyddsbokningar som v2 stängde och som inte passerat.
--    (Gamla synken stänger dem själv när prognosen inte längre har dem.)
update public.prognos_bookings
   set status = 'open'
 where status = 'merged' and estimated_at > now();

-- 3) Ta bort tillvalskolumnen.
alter table public.prognos_bookings drop column if exists addons;

-- Status 'expired' (stängd av v2:s städning) lämnas som den är: stängda bokningar påverkar inget.
