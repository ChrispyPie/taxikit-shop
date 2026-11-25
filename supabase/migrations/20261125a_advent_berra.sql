-- Lägg till 693340 i samma julpyssel-/advent-spärr som 710022 (före 1 dec 2026).
-- Förarnummer jämförs som trimad text, så både text och numeriskt id fungerar.

create or replace function private.advent_preview_driver(p_driver text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
  select btrim(coalesce(p_driver, '')) in ('710022', '693340');
$$;

create or replace function private.advent_today(p_as_of date, p_driver text)
returns date
language plpgsql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
begin
  if p_as_of is not null and private.advent_preview_driver(p_driver) then
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
  select private.advent_preview_driver(p_driver) or private.advent_is_live();
$$;

create or replace function private.advent_is_test(p_as_of date, p_driver text)
returns boolean
language sql
stable
as $$
  -- Testdatum och allt före 1 dec 2026 räknas inte på den riktiga topplistan.
  select (p_as_of is not null and private.advent_preview_driver(p_driver)) or not private.advent_is_live();
$$;
