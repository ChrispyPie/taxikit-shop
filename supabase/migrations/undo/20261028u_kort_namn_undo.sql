-- Ångra 20261028u_kort_namn: tillbaka till hela namnet (förnamn + efternamn).
create or replace function private.bil_driver_name(p_id text)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case when private.is_demo() then private.demo_alias(p_id) else
    (select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') from public.drivers where id = p_id) end
$function$;
