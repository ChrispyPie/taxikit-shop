-- t364u: Prognos aktivitetsprick – antal nya bokningar sedan föraren senast öppnade Prognos.
-- Additivt: ny tabell + två RPC:er med sessionskontroll (private.session_actor). Inga ALTER/DROP av befintligt.
create table if not exists public.prognos_seen (
  driver_id text primary key references public.drivers(id) on delete cascade,
  seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.prognos_seen enable row level security;
revoke all on public.prognos_seen from public, anon, authenticated;

-- Antal bokningar som först setts (created_at) efter förarens senaste besök i Prognos.
-- Alla zoner utom dolda Magasinet (290). Bara bilkategorier (inte barnstol/babyskydd-tillägg),
-- begränsat till förarens filter (p_cats). Alla statusar räknas (en bokning som kom in och sedan
-- passerat räknas ändå som "ny" tills föraren öppnat Prognos).
-- Saknas markering (första gången) sätts den till nu → 0. Master-session: 0, inget sparas.
create or replace function public.prognos_new_count(p_token text, p_cats text[] default null)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_since timestamptz; v_cats text[]; v_n int;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(a.via_master, false) then
    return json_build_object('count', 0, 'since', null);
  end if;
  select s.seen_at into v_since from public.prognos_seen s where s.driver_id = a.driver_id;
  if v_since is null then
    insert into public.prognos_seen(driver_id, seen_at) values (a.driver_id, now())
    on conflict (driver_id) do nothing;
    return json_build_object('count', 0, 'since', now());
  end if;
  v_cats := array(select unnest(coalesce(p_cats, array['app','elbil','storbil','ovrigt']))
                  intersect select unnest(array['app','elbil','storbil','ovrigt']));
  select count(*) into v_n from public.prognos_bookings b
   where b.created_at > v_since
     and b.zone_id <> '290'
     and b.category = any(v_cats);
  return json_build_object('count', v_n, 'since', v_since);
end $$;
revoke all on function public.prognos_new_count(text, text[]) from public;
grant execute on function public.prognos_new_count(text, text[]) to anon, authenticated;

-- Markera Prognos som sedd nu (serverns klocka). Master-session: inget sparas.
create or replace function public.prognos_seen_set(p_token text)
returns timestamptz language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v timestamptz;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(a.via_master, false) then return now(); end if;
  insert into public.prognos_seen as s (driver_id, seen_at, updated_at)
  values (a.driver_id, now(), now())
  on conflict (driver_id) do update set seen_at = greatest(s.seen_at, excluded.seen_at), updated_at = now()
  returning s.seen_at into v;
  return v;
end $$;
revoke all on function public.prognos_seen_set(text) from public;
grant execute on function public.prognos_seen_set(text) to anon, authenticated;

-- Ångra:
-- drop function if exists public.prognos_seen_set(text);
-- drop function if exists public.prognos_new_count(text, text[]);
-- drop table if exists public.prognos_seen;
