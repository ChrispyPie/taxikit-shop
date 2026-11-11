-- 20261111g: per-förare ordning på hemskärmens verktyg.
-- Additivt: en ny tabell i private och två RPC:er. Inga ändringar av befintliga tabeller.
-- Ångra: supabase/migrations/undo/20261111g_home_tool_order_undo.sql

create table if not exists private.home_tool_order (
  driver_id text primary key,
  ids text[] not null,
  updated_at timestamptz not null default now()
);

comment on table private.home_tool_order is
  'Förarens valda ordning på startskärmens verktygsikoner. Tom eller saknad rad = standardordningen.';

alter table private.home_tool_order enable row level security;

create or replace function private.home_tool_ids_clean(p_ids text[])
returns text[]
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(array_agg(x order by ord), '{}'::text[])
    from (
      select x, min(ord) as ord
        from unnest(coalesce(p_ids, '{}'::text[])) with ordinality as t(x, ord)
       where x ~ '^[a-z0-9-]{1,40}$'
       group by x
       order by min(ord)
       limit 40
    ) s;
$$;

revoke all on function private.home_tool_ids_clean(text[]) from public, anon, authenticated;

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
