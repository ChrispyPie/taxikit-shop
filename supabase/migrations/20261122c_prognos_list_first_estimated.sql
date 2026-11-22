-- 20261122c: prognos_list_bookings returnerar first_estimated_at från historiken.
-- Det är den tidigaste prognostiden som sparats för boknings-id (samma på alla enheter).
-- Ingen ny tabell: fältet finns redan i prognos_booking_history och skrivs av triggern
-- när prognos-sync infogar/uppdaterar prognos_bookings. first_estimated_at ändras inte vid senare hopp.
-- Om historik saknas blir fältet null; klienten faller då tillbaka på nuvarande estimated_at.
-- Bara tillägg i svaret. Ångra: supabase/migrations/undo/20261122c_prognos_list_first_estimated_undo.sql

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
      'id', b.id, 'zone_id', b.zone_id, 'zone_name', b.zone_name, 'category', b.category,
      'estimated_at', b.estimated_at, 'observed_at', b.observed_at, 'block_index', b.block_index,
      'current_block', coalesce(b.current_block, b.block_index),
      'confidence', b.confidence, 'status', b.status, 'addons', b.addons,
      'first_estimated_at', (
        select min(v)
          from (
            select h.first_estimated_at as v
            union all
            select (e->>'est')::timestamptz
              from jsonb_array_elements(coalesce(h.events, '[]'::jsonb)) e
             where e ? 'est'
               and nullif(e->>'est', '') is not null
               and e->>'est' <> 'null'
          ) s
         where v is not null
      )
    ) order by b.estimated_at, b.zone_id, b.category)
    from public.prognos_bookings b
    left join public.prognos_booking_history h on h.booking_id = b.id
    where b.status = 'open'
      and b.estimated_at <= v_to
      and (b.estimated_at >= v_from
           or (p_from is null and b.estimated_at >= now() - interval '3 hours'))
  ), '[]'::json);
end $function$;
