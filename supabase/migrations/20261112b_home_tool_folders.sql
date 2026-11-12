-- 20261112b: mappar på startskärmen (Android-likt). Additivt:
--   * ny kolumn folders jsonb på private.home_tool_order (standard '[]', befintliga rader oförändrade)
--   * hjälpfunktion private.home_tool_folders_clean
--   * get-RPC returnerar även folders
--   * ny 4-arg set-RPC med p_folders. 3-arg och 2-arg finns kvar och rör inte folders.
-- Mapp-id ligger i ids (t.ex. 'mapp-abc123', passar home_tool_ids_clean). Klienten klarar sig utan migrationen
-- (mapparna sparas då bara på enheten).
-- Ångra: supabase/migrations/undo/20261112b_home_tool_folders_undo.sql

alter table private.home_tool_order
  add column if not exists folders jsonb not null default '[]'::jsonb;

comment on column private.home_tool_order.folders is
  'Förarens mappar på startskärmen: [{id: mapp-..., name, items: [verktygs-id]}]. Tom array = inga mappar.';

create or replace function private.home_tool_folders_clean(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_out jsonb := '[]'::jsonb;
  f jsonb;
  v_id text;
  v_name text;
  v_items text[];
  v_seen_f text[] := '{}'::text[];
  v_seen_t text[] := '{}'::text[];
  n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    return '[]'::jsonb;
  end if;
  for f in select value from jsonb_array_elements(p) loop
    exit when n >= 20;
    continue when jsonb_typeof(f) <> 'object';
    v_id := f->>'id';
    continue when v_id is null or v_id !~ '^mapp-[a-z0-9]{1,30}$' or v_id = any(v_seen_f);
    v_name := left(btrim(regexp_replace(regexp_replace(coalesce(f->>'name', ''), '[[:cntrl:]<>]', '', 'g'), '\s+', ' ', 'g')), 24);
    if jsonb_typeof(f->'items') = 'array' then
      select coalesce(array_agg(x order by ord), '{}'::text[]) into v_items
        from unnest(private.home_tool_ids_clean(array(
               select e from jsonb_array_elements_text(f->'items') with ordinality as t(e, o)
                where jsonb_typeof((f->'items')->(o::int - 1)) = 'string'
                order by o))) with ordinality as u(x, ord)
       where x !~ '^mapp-' and not (x = any(v_seen_t));
    else
      v_items := '{}'::text[];
    end if;
    continue when coalesce(array_length(v_items, 1), 0) < 2;
    v_seen_f := v_seen_f || v_id;
    v_seen_t := v_seen_t || v_items;
    n := n + 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_name, 'items', to_jsonb(v_items)));
  end loop;
  return v_out;
end
$$;

revoke all on function private.home_tool_folders_clean(jsonb) from public, anon, authenticated;

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

create or replace function public.home_tool_order_set(p_token text, p_ids text[], p_hidden text[], p_folders jsonb)
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
  v_ids := private.home_tool_ids_clean(p_ids);
  v_hidden := private.home_tool_ids_clean(p_hidden);
  v_hidden := coalesce(array(
    select x from unnest(v_hidden) as x
     where x not in ('installningar', 'om', 'admin', 'sadmin')
  ), '{}'::text[]);
  v_folders := private.home_tool_folders_clean(p_folders);
  if (v_ids is null or array_length(v_ids, 1) is null)
     and (v_hidden is null or array_length(v_hidden, 1) is null)
     and jsonb_array_length(v_folders) = 0 then
    delete from private.home_tool_order where driver_id = a.driver_id;
    return json_build_object('ids', null, 'hidden', null, 'folders', null);
  end if;
  insert into private.home_tool_order (driver_id, ids, hidden, folders, updated_at)
  values (a.driver_id, coalesce(v_ids, '{}'::text[]), coalesce(v_hidden, '{}'::text[]), v_folders, now())
  on conflict (driver_id) do update
    set ids = excluded.ids,
        hidden = excluded.hidden,
        folders = excluded.folders,
        updated_at = now();
  return json_build_object('ids', to_json(v_ids), 'hidden', to_json(v_hidden), 'folders', v_folders);
end
$$;

revoke all on function public.home_tool_order_set(text, text[], text[], jsonb) from public;
grant execute on function public.home_tool_order_set(text, text[], text[], jsonb) to anon, authenticated;
