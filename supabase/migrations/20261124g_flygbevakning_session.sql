-- Fix (t1838u): "Kunde inte hämta flygbevakningar" sedan 2026-11-24 19:45 svensk tid.
-- flight_watch_list/save/delete anropade public.current_driver_id(text), som inte längre finns i databasen
-- (Postgres: "function public.current_driver_id(text) does not exist" -> PostgREST 404).
-- Nu används samma sessionskontroll som tåg-bevakningarna: private.session_actor(p_token)
-- (ger också rätt förare för demokonton och delad enhet). Övrig logik orörd.
-- Ångra: undo/20261124g_flygbevakning_session_undo.sql
do $m$
declare f text; src text;
begin
  foreach f in array array['public.flight_watch_list(text)', 'public.flight_watch_save(text,bigint,jsonb)', 'public.flight_watch_delete(text,bigint)'] loop
    src := pg_get_functiondef(f::regprocedure);
    if position('public.current_driver_id(p_token)' in src) = 0 then continue; end if;
    src := replace(src, 'd := public.current_driver_id(p_token);', 'select sa.driver_id into d from private.session_actor(p_token) sa;');
    execute src;
  end loop;
end $m$;
