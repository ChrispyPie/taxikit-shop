-- Ångra 20261124g: tillbaka till public.current_driver_id(p_token) i flygbevakningarnas RPC:er.
-- OBS: fungerar bara om public.current_driver_id(text) finns igen – annars blir flygbevakningarna trasiga (404) som före fixen.
do $m$
declare f text; src text;
begin
  foreach f in array array['public.flight_watch_list(text)', 'public.flight_watch_save(text,bigint,jsonb)', 'public.flight_watch_delete(text,bigint)'] loop
    src := pg_get_functiondef(f::regprocedure);
    src := replace(src, 'select sa.driver_id into d from private.session_actor(p_token) sa;', 'd := public.current_driver_id(p_token);');
    execute src;
  end loop;
end $m$;
