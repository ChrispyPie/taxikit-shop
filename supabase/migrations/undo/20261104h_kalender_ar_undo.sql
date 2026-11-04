-- Ångra 20261104h: tillbaka till max 62 dagar (Kalender År-vyn slutar då ladda).
CREATE OR REPLACE FUNCTION public.get_events(p_token text, p_from date, p_to date, p_city text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; c public.cities; t0 timestamptz; t1 timestamptz;
begin
  select * into a from private.kal_actor(p_token);
  c := private.kal_city(a.company_id, p_city);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  t0 := p_from::timestamp at time zone c.timezone;
  t1 := (p_to + 1)::timestamp at time zone c.timezone;
  return private.demo_mask(jsonb_build_object(
    'city', jsonb_build_object('slug', c.slug, 'name', c.name, 'country', c.country, 'timezone', c.timezone),
    'cities', (select jsonb_agg(jsonb_build_object('slug', ci.slug, 'name', ci.name, 'timezone', ci.timezone) order by ci.name)
                 from public.cities ci join public.company_cities cc on cc.city = ci.slug and cc.company_id = a.company_id
                where ci.active),
    'can_approve', a.is_admin,
    'me', a.driver_id,
    'unread_notices', (select count(*) from public.event_notices n where n.driver_id = a.driver_id and n.read_at is null and n.kind not like 'bil%' and n.kind not like 'forum%'),
    'venues', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name) order by v.name), '[]')
                 from public.venues v where v.city = c.slug),
    'events', coalesce((
      select jsonb_agg(private.kal_event_json(e, a.driver_id, a.is_admin, a.company_id) order by e.starts_at, e.id)
        from public.events e
       where e.city = c.slug
         and e.starts_at < t1 and coalesce(e.ends_at, e.starts_at) >= t0
         and private.kal_visible(e, a.company_id, a.driver_id, a.is_admin)
         -- skrapat evenemang som forsvunnit fran kallan i 3 dygn = troligen installt
         and (e.company_id is not null or e.last_seen_at > now() - interval '3 days')
    ), '[]')));
end $function$;
