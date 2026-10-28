-- 20261028u: Kort namn i Bil & verkstad ("Christian P" i stället för "Christian Parsa").
-- private.bil_driver_name används i ärenden, uppgifter, underhåll, verkstadstimmar och deras notistexter,
-- och svaren går även till förare. Nu skickas bara förnamn + första bokstaven i efternamnet.
-- Saknas förnamn blir det null, och anroparna visar då förar-id som förut. Demo-läget är oförändrat.
-- Samma signatur och returtyp, ingen tabell ändras. Ångra: undo/20261028u_kort_namn_undo.sql
create or replace function private.bil_driver_name(p_id text)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case when private.is_demo() then private.demo_alias(p_id) else
    (select nullif(btrim(d.first_name), '') || coalesce(' ' || upper(left(nullif(btrim(d.last_name), ''), 1)), '')
       from public.drivers d where d.id = p_id) end
$function$;
