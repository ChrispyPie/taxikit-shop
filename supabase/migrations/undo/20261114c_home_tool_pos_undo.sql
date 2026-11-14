-- Ångra 20261114c_home_tool_pos.sql
-- Tar bort 5-arg-RPC:en, hjälpfunktionen och kolumnen pos. get återgår till versionen från 20261112b.
drop function if exists public.home_tool_order_set(text, text[], text[], jsonb, jsonb);

create or replace function public.home_tool_order_get(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_ids text[];
  v_hidden text[];
  v_folders jsonb;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object('ids', null, 'hidden', null, 'folders', null);
  end if;
  select t.ids, t.hidden, t.folders into v_ids, v_hidden, v_folders
    from private.home_tool_order t
   where t.driver_id = a.driver_id;
  return json_build_object(
    'ids', to_json(v_ids),
    'hidden', to_json(v_hidden),
    'folders', v_folders
  );
end
$$;

revoke all on function public.home_tool_order_get(text) from public;
grant execute on function public.home_tool_order_get(text) to anon, authenticated;

drop function if exists private.home_tool_pos_clean(jsonb);

alter table private.home_tool_order drop column if exists pos;
