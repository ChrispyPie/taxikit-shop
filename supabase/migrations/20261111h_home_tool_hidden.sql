-- 20261111h: vilka verktyg föraren har valt bort från startskärmen.
-- Additivt: ny kolumn hidden på private.home_tool_order och en extra parameter på set-RPC.
-- Befintliga rader får hidden = '{}', alltså alla verktyg kvar (ingen synlig ändring).
-- Ångra: supabase/migrations/undo/20261111h_home_tool_hidden_undo.sql

alter table private.home_tool_order
  add column if not exists hidden text[] not null default '{}';

comment on column private.home_tool_order.hidden is
  'Verktygs-id:n föraren har tagit bort från startskärmen. Tom array = alla verktyg är tillagda.';

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

-- Ny 3-arg variant. Den äldre 2-arg-funktionen behålls och anropar denna med tom hidden.
create or replace function public.home_tool_order_set(p_token text, p_ids text[], p_hidden text[])
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
  v_ids := private.home_tool_ids_clean(p_ids);
  v_hidden := private.home_tool_ids_clean(p_hidden);
  -- kärnverktyg går inte att dölja
  v_hidden := coalesce(array(
    select x from unnest(v_hidden) as x
     where x not in ('installningar', 'om', 'admin', 'sadmin')
  ), '{}'::text[]);
  if (v_ids is null or array_length(v_ids, 1) is null)
     and (v_hidden is null or array_length(v_hidden, 1) is null) then
    delete from private.home_tool_order where driver_id = a.driver_id;
    return json_build_object('ids', null, 'hidden', null);
  end if;
  insert into private.home_tool_order (driver_id, ids, hidden, updated_at)
  values (a.driver_id, coalesce(v_ids, '{}'::text[]), coalesce(v_hidden, '{}'::text[]), now())
  on conflict (driver_id) do update
    set ids = excluded.ids,
        hidden = excluded.hidden,
        updated_at = now();
  return json_build_object('ids', to_json(v_ids), 'hidden', to_json(v_hidden));
end
$$;

revoke all on function public.home_tool_order_set(text, text[], text[]) from public;
grant execute on function public.home_tool_order_set(text, text[], text[]) to anon, authenticated;

-- Behåll 2-arg så äldre klienter inte rensar hidden av misstag.
create or replace function public.home_tool_order_set(p_token text, p_ids text[])
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_hidden text[];
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object('ids', null, 'hidden', null);
  end if;
  select t.hidden into v_hidden
    from private.home_tool_order t
   where t.driver_id = a.driver_id;
  return public.home_tool_order_set(p_token, p_ids, coalesce(v_hidden, '{}'::text[]));
end
$$;

revoke all on function public.home_tool_order_set(text, text[]) from public;
grant execute on function public.home_tool_order_set(text, text[]) to anon, authenticated;
