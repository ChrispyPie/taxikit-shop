-- Ångra 20261112b_home_tool_folders.sql
-- Tar bort 4-arg-RPC:en, hjälpfunktionen och kolumnen folders. get återgår till versionen från 20261111h.
-- ids och hidden lämnas orörda. Mapp-id (mapp-...) som ligger kvar i ids ignoreras av äldre klienter.

drop function if exists public.home_tool_order_set(text, text[], text[], jsonb);

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
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object('ids', null, 'hidden', null);
  end if;
  select t.ids, t.hidden into v_ids, v_hidden
    from private.home_tool_order t
   where t.driver_id = a.driver_id;
  return json_build_object(
    'ids', to_json(v_ids),
    'hidden', to_json(v_hidden)
  );
end
$$;

revoke all on function public.home_tool_order_get(text) from public;
grant execute on function public.home_tool_order_get(text) to anon, authenticated;

drop function if exists private.home_tool_folders_clean(jsonb);

alter table private.home_tool_order drop column if exists folders;
