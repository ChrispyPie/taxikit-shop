-- Ångra 20261122c_prognos_list_first_estimated.sql
-- Återställer prognos_list_bookings till definitionen i 20261103a (utan first_estimated_at).
-- Grant och signatur oförändrade.

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
      'confidence', confidence, 'status', status, 'addons', addons
    ) order by estimated_at, zone_id, category)
    from public.prognos_bookings
    where status = 'open'
      and estimated_at <= v_to
      and (estimated_at >= v_from
           or (p_from is null and estimated_at >= now() - interval '3 hours'))
  ), '[]'::json);
end $function$;
