-- 20261122b: ta bort Väder och Nyheter från alla sparade hemskärmar.
-- Modulerna finns kvar att installera i Moduler (klienten håller dem avstängda som standard).
-- Först kopieras varje berörd rad till private.home_tool_order_backup_20261122_vader_nyheter.
-- Ångra: supabase/migrations/undo/20261122b_home_tool_vader_nyheter_undo.sql
--        (återställer ids, hidden, folders och pos från säkerhetskopian).
-- Klienten har en engångsstädning i hem-ordning-core.js för layout som bara finns på enheten.

create table if not exists private.home_tool_order_backup_20261122_vader_nyheter (
  driver_id text primary key,
  ids text[],
  hidden text[],
  folders jsonb,
  pos jsonb,
  updated_at timestamptz,
  backed_up_at timestamptz not null default now()
);

comment on table private.home_tool_order_backup_20261122_vader_nyheter is
  'Kopia av hemskärmens modulordning innan Väder och Nyheter togs bort från alla konton 2026-11-22. Återställs med undo/20261122b_home_tool_vader_nyheter_undo.sql.';

create or replace function private.home_tool_textarr_without(p_ids text[], p_drop text[])
returns text[]
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(array(
    select x from unnest(coalesce(p_ids, '{}'::text[])) as x
     where x is not null and x <> all(p_drop)
  ), '{}'::text[]);
$$;

create or replace function private.home_tool_folders_without(p jsonb, p_drop text[])
returns jsonb
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(f.obj order by f.o), '[]'::jsonb) into v
  from (
    select o,
           (elem - 'items') || jsonb_build_object(
             'items',
             coalesce((
               select jsonb_agg(to_jsonb(i) order by io)
               from jsonb_array_elements_text(coalesce(elem->'items', '[]'::jsonb))
                    with ordinality as t(i, io)
               where i <> all(p_drop)
             ), '[]'::jsonb)
           ) as obj
    from jsonb_array_elements(p) with ordinality as x(elem, o)
    where jsonb_typeof(elem) = 'object'
  ) f;
  return coalesce(v, '[]'::jsonb);
end
$$;

create or replace function private.home_tool_pos_without(p jsonb, p_drop text[])
returns jsonb
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb := '{}'::jsonb;
  e record;
  arr jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return '{}'::jsonb;
  end if;
  for e in select key, value from jsonb_each(p) loop
    if jsonb_typeof(e.value) = 'array' then
      select coalesce(jsonb_agg(to_jsonb(x) order by o), '[]'::jsonb) into arr
      from (
        select value #>> '{}' as x, ordinality as o
        from jsonb_array_elements(e.value) with ordinality
        where jsonb_typeof(value) = 'string' and (value #>> '{}') <> all(p_drop)
      ) s;
      if arr is not null and jsonb_array_length(arr) > 0 then
        v := v || jsonb_build_object(e.key, arr);
      end if;
    elsif jsonb_typeof(e.value) = 'object' then
      v := v || jsonb_build_object(e.key, (e.value - p_drop));
    else
      v := v || jsonb_build_object(e.key, e.value);
    end if;
  end loop;
  return private.home_tool_pos_clean(v);
end
$$;

revoke all on function private.home_tool_textarr_without(text[], text[]) from public, anon, authenticated;
revoke all on function private.home_tool_folders_without(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.home_tool_pos_without(jsonb, text[]) from public, anon, authenticated;

insert into private.home_tool_order_backup_20261122_vader_nyheter
  (driver_id, ids, hidden, folders, pos, updated_at)
select t.driver_id, t.ids, t.hidden, t.folders, t.pos, t.updated_at
from private.home_tool_order t
where
     'vader' = any(coalesce(t.ids, '{}'::text[]))
  or 'nyheter' = any(coalesce(t.ids, '{}'::text[]))
  or 'vader' = any(coalesce(t.hidden, '{}'::text[]))
  or 'nyheter' = any(coalesce(t.hidden, '{}'::text[]))
  or exists (
       select 1
       from jsonb_array_elements(coalesce(t.folders, '[]'::jsonb)) f,
            jsonb_array_elements_text(coalesce(f->'items', '[]'::jsonb)) item
       where item in ('vader', 'nyheter')
     )
  or exists (
       select 1
       from jsonb_each(coalesce(t.pos, '{}'::jsonb)) e
       where (jsonb_typeof(e.value) = 'object' and (e.value ? 'vader' or e.value ? 'nyheter'))
          or (jsonb_typeof(e.value) = 'array' and exists (
                select 1 from jsonb_array_elements_text(e.value) v where v in ('vader', 'nyheter')
              ))
     )
on conflict (driver_id) do nothing;

update private.home_tool_order t
set ids = private.home_tool_textarr_without(t.ids, array['vader', 'nyheter']),
    hidden = private.home_tool_textarr_without(t.hidden, array['vader', 'nyheter'])
             || array['vader', 'nyheter'],
    folders = private.home_tool_folders_without(t.folders, array['vader', 'nyheter']),
    pos = private.home_tool_pos_without(t.pos, array['vader', 'nyheter']),
    updated_at = now()
where t.driver_id in (
  select b.driver_id from private.home_tool_order_backup_20261122_vader_nyheter b
);
