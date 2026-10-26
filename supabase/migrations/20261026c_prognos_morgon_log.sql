-- t336u: spara morgonprognosen över tid (additivt). Senaste finns redan i prognos_snapshots
-- (rensas efter 2 dygn); här sparas en rad per FÖRÄNDRING per datum, för jämförelser senare.
create table if not exists public.prognos_morgon_log (
  id bigint generated always as identity primary key,
  date_iso date not null,
  zone text,
  total int not null,
  buckets jsonb not null,
  generated_at timestamptz,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists prognos_morgon_log_date_idx on public.prognos_morgon_log (date_iso, first_seen desc);
alter table public.prognos_morgon_log enable row level security;
revoke all on public.prognos_morgon_log from anon, authenticated;

create or replace function private.prognos_morgon_log_capture()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare m jsonb; d date; last record;
begin
  begin
    if not coalesce(new.ok, false) then return new; end if;
    m := new.payload->'morgonprognos';
    if m is null or jsonb_typeof(m) <> 'object' or coalesce(m->>'dateIso','') = '' then return new; end if;
    d := (m->>'dateIso')::date;
    select id, buckets, total into last from public.prognos_morgon_log
      where date_iso = d order by first_seen desc limit 1;
    if found and last.buckets = coalesce(m->'buckets','[]'::jsonb) and last.total = coalesce((m->>'total')::int, 0) then
      update public.prognos_morgon_log set last_seen = new.fetched_at,
        generated_at = coalesce((m->>'generated_at')::timestamptz, generated_at) where id = last.id;
    else
      insert into public.prognos_morgon_log (date_iso, zone, total, buckets, generated_at, first_seen, last_seen)
      values (d, m->>'zone', coalesce((m->>'total')::int, 0), coalesce(m->'buckets','[]'::jsonb),
              (m->>'generated_at')::timestamptz, new.fetched_at, new.fetched_at);
    end if;
  exception when others then
    -- får aldrig stoppa skannern
    raise warning 'prognos_morgon_log_capture: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function private.prognos_morgon_log_capture() from public, anon, authenticated;

drop trigger if exists prognos_morgon_log_trg on public.prognos_snapshots;
create trigger prognos_morgon_log_trg after insert on public.prognos_snapshots
  for each row execute function private.prognos_morgon_log_capture();

-- Backfill från befintliga snapshots (äldsta först), bara om loggen är tom
do $$
declare s record; m jsonb; d date; last record;
begin
  if exists (select 1 from public.prognos_morgon_log) then return; end if;
  for s in select fetched_at, payload from public.prognos_snapshots where ok and payload ? 'morgonprognos' order by fetched_at loop
    m := s.payload->'morgonprognos';
    if coalesce(m->>'dateIso','') = '' then continue; end if;
    d := (m->>'dateIso')::date;
    select id, buckets, total into last from public.prognos_morgon_log where date_iso = d order by first_seen desc limit 1;
    if found and last.buckets = coalesce(m->'buckets','[]'::jsonb) and last.total = coalesce((m->>'total')::int,0) then
      update public.prognos_morgon_log set last_seen = s.fetched_at where id = last.id;
    else
      insert into public.prognos_morgon_log (date_iso, zone, total, buckets, generated_at, first_seen, last_seen)
      values (d, m->>'zone', coalesce((m->>'total')::int,0), coalesce(m->'buckets','[]'::jsonb), (m->>'generated_at')::timestamptz, s.fetched_at, s.fetched_at);
    end if;
  end loop;
end $$;

-- Ångra:
-- drop trigger if exists prognos_morgon_log_trg on public.prognos_snapshots;
-- drop function if exists private.prognos_morgon_log_capture();
-- drop table if exists public.prognos_morgon_log;
