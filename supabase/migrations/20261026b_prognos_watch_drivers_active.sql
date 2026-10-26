-- t335u (additiv): bevakare av zon+kategori som har en giltig (ej utgången) session.
-- Används av prognos-sync v6 så att push bara går till inloggade förare.
-- Ångra: drop function public.prognos_svc_watch_drivers_active(text, text);
create or replace function public.prognos_svc_watch_drivers_active(p_zone text, p_cat text)
returns json
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(json_agg(distinct w.driver_id), '[]'::json)
  from public.prognos_watches w
  where w.zone_id = p_zone
    and (w.category = p_cat or w.category = '*')
    and exists (select 1 from private.sessions s where s.driver_id = w.driver_id and s.expires_at > now())
$$;
revoke all on function public.prognos_svc_watch_drivers_active(text, text) from public, anon, authenticated;
grant execute on function public.prognos_svc_watch_drivers_active(text, text) to service_role;
