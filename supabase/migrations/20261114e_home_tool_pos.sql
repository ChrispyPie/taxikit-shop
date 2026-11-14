-- 20261114e: fri placering på startskärmen (2026-11-14fri1). Additivt:
--   * ny kolumn pos jsonb på private.home_tool_order (standard '{}', befintliga rader oförändrade)
--     form: { "<kolumner>": { "<id>": [rad, kolumn] }, "e<kolumner>": {...}, "sida2": [id], "ute": [id] }
--       t.ex. {"4": {"kordata": [0,0], "mapp-ab": [0,3]}, "e4": {"vader": [2,1]}, "sida2": ["vader"], "ute": ["om"]}
--       "e<n>" = positioner på hemskärmens sida 2, "sida2" = vilka som ligger där, "ute" = borttagna genvägar
--       (modulen finns kvar i applådan). 2026-11-14sidor1.
--   * hjälpfunktion private.home_tool_pos_clean (högst 16 nycklar, 80 id per nyckel/lista, rad 0–59, kolumn < antal)
--   * get-RPC returnerar även pos
--   * ny 5-arg set-RPC med p_pos. 4-, 3- och 2-arg finns kvar och rör inte pos.
-- Klienten klarar sig utan migrationen (positionerna sparas då bara på enheten).
-- Ångra: supabase/migrations/undo/20261114e_home_tool_pos_undo.sql

alter table private.home_tool_order
  add column if not exists pos jsonb not null default '{}'::jsonb;

comment on column private.home_tool_order.pos is
  'Fri placering på startskärmen: {"<kolumner>": {"<id>": [rad, kolumn]}}. Tomt objekt = automatisk ordning.';

create or replace function private.home_tool_pos_clean(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_map jsonb;
  k text;
  v_c int;
  e record;
  v_r int;
  v_col int;
  v_used text[];
  n int;
  nk int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return '{}'::jsonb;
  end if;
  -- id-listor: sida2 och ute (giltiga id, utan dubbletter, högst 80; Moduler kan inte tas bort)
  for k in select unnest(array['sida2', 'ute']) loop
    continue when jsonb_typeof(p->k) is distinct from 'array';
    select coalesce(jsonb_agg(x.v order by x.o), '[]'::jsonb) into v_map
    from (
      select v, min(o) as o from (
        select e2.value #>> '{}' as v, e2.ordinality as o
        from jsonb_array_elements(p->k) with ordinality as e2(value, ordinality)
        where jsonb_typeof(e2.value) = 'string'
      ) y
      where v ~ '^[a-z0-9-]{1,40}$' and not (k = 'ute' and v = 'moduler')
      group by v order by min(o) limit 80
    ) x;
    if jsonb_array_length(v_map) > 0 then
      v_out := v_out || jsonb_build_object(k, v_map);
    end if;
  end loop;
  for k in select key from jsonb_each(p) order by key loop
    exit when nk >= 16;
    continue when k !~ '^e?([1-9]|1[0-6])$';
    v_c := regexp_replace(k, '^e', '')::int;
    continue when jsonb_typeof(p->k) <> 'object';
    v_map := '{}'::jsonb; v_used := '{}'::text[]; n := 0;
    for e in select key, value from jsonb_each(p->k) loop
      exit when n >= 80;
      continue when e.key !~ '^[a-z0-9-]{1,40}$';
      continue when jsonb_typeof(e.value) <> 'array' or jsonb_array_length(e.value) <> 2;
      continue when jsonb_typeof(e.value->0) <> 'number' or jsonb_typeof(e.value->1) <> 'number';
      continue when (e.value->>0) !~ '^\d{1,2}$' or (e.value->>1) !~ '^\d{1,2}$';
      v_r := (e.value->>0)::int; v_col := (e.value->>1)::int;
      continue when v_r > 59 or v_col >= v_c or (v_r || ':' || v_col) = any(v_used);
      v_used := v_used || (v_r || ':' || v_col);
      v_map := v_map || jsonb_build_object(e.key, jsonb_build_array(v_r, v_col));
      n := n + 1;
    end loop;
    if n > 0 then
      v_out := v_out || jsonb_build_object(k, v_map);
      nk := nk + 1;
    end if;
  end loop;
  return v_out;
end
$$;

revoke all on function private.home_tool_pos_clean(jsonb) from public, anon, authenticated;

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
  v_pos jsonb;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object('ids', null, 'hidden', null, 'folders', null, 'pos', null);
  end if;
  select t.ids, t.hidden, t.folders, t.pos into v_ids, v_hidden, v_folders, v_pos
    from private.home_tool_order t
   where t.driver_id = a.driver_id;
  return json_build_object(
    'ids', to_json(v_ids),
    'hidden', to_json(v_hidden),
    'folders', v_folders,
    'pos', v_pos
  );
end
$$;

revoke all on function public.home_tool_order_get(text) from public;
grant execute on function public.home_tool_order_get(text) to anon, authenticated;

create or replace function public.home_tool_order_set(p_token text, p_ids text[], p_hidden text[], p_folders jsonb, p_pos jsonb)
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
  v_pos jsonb;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object('ids', null, 'hidden', null, 'folders', null, 'pos', null);
  end if;
  v_ids := private.home_tool_ids_clean(p_ids);
  v_hidden := private.home_tool_ids_clean(p_hidden);
  v_hidden := coalesce(array(
    select x from unnest(v_hidden) as x
     where x not in ('installningar', 'om', 'admin', 'sadmin')
  ), '{}'::text[]);
  v_folders := private.home_tool_folders_clean(p_folders);
  v_pos := private.home_tool_pos_clean(p_pos);
  if (v_ids is null or array_length(v_ids, 1) is null)
     and (v_hidden is null or array_length(v_hidden, 1) is null)
     and jsonb_array_length(v_folders) = 0
     and v_pos = '{}'::jsonb then
    delete from private.home_tool_order where driver_id = a.driver_id;
    return json_build_object('ids', null, 'hidden', null, 'folders', null, 'pos', null);
  end if;
  insert into private.home_tool_order (driver_id, ids, hidden, folders, pos, updated_at)
  values (a.driver_id, coalesce(v_ids, '{}'::text[]), coalesce(v_hidden, '{}'::text[]), v_folders, v_pos, now())
  on conflict (driver_id) do update
    set ids = excluded.ids,
        hidden = excluded.hidden,
        folders = excluded.folders,
        pos = excluded.pos,
        updated_at = now();
  return json_build_object('ids', to_json(v_ids), 'hidden', to_json(v_hidden), 'folders', v_folders, 'pos', v_pos);
end
$$;

revoke all on function public.home_tool_order_set(text, text[], text[], jsonb, jsonb) from public;
grant execute on function public.home_tool_order_set(text, text[], text[], jsonb, jsonb) to anon, authenticated;
