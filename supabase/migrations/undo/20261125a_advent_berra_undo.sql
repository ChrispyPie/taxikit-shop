-- Återställer advent-spärren till bara 710022 (20261123b) och tar bort hjälparen.

create or replace function private.advent_today(p_as_of date, p_driver text)
returns date
language plpgsql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
begin
  if p_as_of is not null and p_driver = '710022' then
    return p_as_of;
  end if;
  return (now() at time zone 'Europe/Stockholm')::date;
end;
$$;

create or replace function private.advent_may_use(p_driver text)
returns boolean
language sql
stable
as $$
  select p_driver = '710022' or private.advent_is_live();
$$;

create or replace function private.advent_is_test(p_as_of date, p_driver text)
returns boolean
language sql
stable
as $$
  -- Testdatum och allt före 1 dec 2026 räknas inte på den riktiga topplistan.
  select (p_as_of is not null and p_driver = '710022') or not private.advent_is_live();
$$;

drop function if exists private.advent_preview_driver(text);
