-- Ångra 20261111h_home_tool_hidden.sql
-- Tar bara bort den nya kolumnen och 3-arg-RPC:en. Tabellen och 2-arg-set/get från 20261111g lämnas kvar.
-- För att ångra även själva ordningen: kör därefter 20261111g_home_tool_order_undo.sql.

drop function if exists public.home_tool_order_set(text, text[], text[]);

create or replace function public.home_tool_order_get(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_ids text[];
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object('ids', null);
  end if;
  select t.ids into v_ids
    from private.home_tool_order t
   where t.driver_id = a.driver_id;
  return json_build_object('ids', to_json(v_ids));
end
$$;

revoke all on function public.home_tool_order_get(text) from public;
grant execute on function public.home_tool_order_get(text) to anon, authenticated;

create or replace function public.home_tool_order_set(p_token text, p_ids text[])
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_ids text[];
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object('ids', null);
  end if;
  v_ids := private.home_tool_ids_clean(p_ids);
  if v_ids is null or array_length(v_ids, 1) is null then
    delete from private.home_tool_order where driver_id = a.driver_id;
    return json_build_object('ids', null);
  end if;
  insert into private.home_tool_order (driver_id, ids, updated_at)
  values (a.driver_id, v_ids, now())
  on conflict (driver_id) do update
    set ids = excluded.ids,
        updated_at = now();
  return json_build_object('ids', to_json(v_ids));
end
$$;

revoke all on function public.home_tool_order_set(text, text[]) from public;
grant execute on function public.home_tool_order_set(text, text[]) to anon, authenticated;

alter table private.home_tool_order drop column if exists hidden;
