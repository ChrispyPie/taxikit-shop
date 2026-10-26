-- t358u: Nyheter (changelog) – vad varje förare senast har sett, sparat per förare på servern.
-- Additivt: ny tabell + två RPC:er som kräver giltig förarsession (private.session_actor). Inga ALTER/DROP av befintligt.
create table if not exists public.changelog_seen (
  driver_id text primary key,
  last_seen text not null,            -- id/datum på senaste sedda nyhet, t.ex. '2026-10-26' eller '2026-10-26b'
  updated_at timestamptz not null default now()
);
alter table public.changelog_seen enable row level security;
revoke all on public.changelog_seen from anon, authenticated;

-- Hämta förarens markering (null = har aldrig öppnat Nyheter)
create or replace function public.changelog_seen_get(p_token text)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v text;
begin
  select * into a from private.session_actor(p_token);
  select c.last_seen into v from public.changelog_seen c where c.driver_id = a.driver_id;
  return v;
end $$;
revoke all on function public.changelog_seen_get(text) from public;
grant execute on function public.changelog_seen_get(text) to anon, authenticated;

-- Spara markering (flyttas bara framåt). Returnerar sparat värde.
create or replace function public.changelog_seen_set(p_token text, p_seen text)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v text;
begin
  select * into a from private.session_actor(p_token);
  if p_seen is null or p_seen !~ '^\d{4}-\d{2}-\d{2}[a-z]?$' then
    raise exception 'bad_value' using errcode = '22023';
  end if;
  insert into public.changelog_seen as c (driver_id, last_seen, updated_at)
  values (a.driver_id, p_seen, now())
  on conflict (driver_id) do update
    set last_seen = greatest(c.last_seen, excluded.last_seen), updated_at = now()
  returning c.last_seen into v;
  return v;
end $$;
revoke all on function public.changelog_seen_set(text, text) from public;
grant execute on function public.changelog_seen_set(text, text) to anon, authenticated;

-- Ångra:
-- drop function if exists public.changelog_seen_set(text, text);
-- drop function if exists public.changelog_seen_get(text);
-- drop table if exists public.changelog_seen;
