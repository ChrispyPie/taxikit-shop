-- 20261104a: prognos_booking_history – livscykeln för varje prognosbokning i 90 dagar.
-- prognos_bookings rensas efter 1–2 dygn (prognos_svc_prune), så den här tabellen behåller historiken
-- så att prognosen kan jämföras med åkeriets resor i efterhand (S admin-rapporten).
-- Fångas med en trigger på prognos_bookings, prognos-sync ändras inte. Triggern får aldrig stoppa synken.
-- Additivt. Ångra: supabase/migrations/undo/20261104a_prognos_history_undo.sql

create table if not exists public.prognos_booking_history (
  booking_id          bigint primary key,
  zone_id             text not null,
  zone_name           text,
  category            text not null,
  addons              text[] not null default '{}',
  first_seen_at       timestamptz not null default now(),   -- när bokningen dök upp i prognosen
  first_estimated_at  timestamptz,                          -- första prognostiden
  first_confidence    text,
  first_block         integer,
  estimated_at        timestamptz,                          -- senaste prognostiden
  confidence          text,
  block_index         integer,
  current_block       integer,
  status              text not null default 'open',
  ended_at            timestamptz,                          -- när den lämnade 'open' (försvann/utgick/slogs ihop)
  deleted_at          timestamptz,                          -- när prognos_bookings-raden rensades
  n_changes           integer not null default 0,
  events              jsonb not null default '[]'::jsonb,   -- [{t, ev, est, conf, blk, cur, st, add}]
  backfilled          boolean not null default false,
  updated_at          timestamptz not null default now()
);
create index if not exists prognos_booking_history_seen_idx on public.prognos_booking_history (first_seen_at);
create index if not exists prognos_booking_history_zone_idx on public.prognos_booking_history (zone_id, estimated_at);

alter table public.prognos_booking_history enable row level security;
revoke all on public.prognos_booking_history from anon, authenticated;

create or replace function private.prognos_history_capture()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare ev jsonb;
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.prognos_booking_history as h
        (booking_id, zone_id, zone_name, category, addons, first_seen_at, first_estimated_at, first_confidence, first_block,
         estimated_at, confidence, block_index, current_block, status, ended_at, events)
      values (new.id, new.zone_id, new.zone_name, new.category, coalesce(new.addons, '{}'), coalesce(new.observed_at, now()),
              new.estimated_at, new.confidence, new.block_index, new.estimated_at, new.confidence, new.block_index, new.current_block,
              new.status, case when new.status <> 'open' then now() end,
              jsonb_build_array(jsonb_build_object('t', now(), 'ev', 'ny', 'est', new.estimated_at, 'conf', new.confidence,
                'blk', new.block_index, 'cur', new.current_block, 'st', new.status, 'add', coalesce(new.addons, '{}'))))
      on conflict (booking_id) do nothing;
    elsif tg_op = 'UPDATE' then
      if (new.estimated_at, new.confidence, new.block_index, new.current_block, new.status, new.category, coalesce(new.addons, '{}'), new.zone_id)
         is distinct from
         (old.estimated_at, old.confidence, old.block_index, old.current_block, old.status, old.category, coalesce(old.addons, '{}'), old.zone_id) then
        ev := jsonb_strip_nulls(jsonb_build_object('t', now(), 'ev', 'andring',
          'est', case when new.estimated_at is distinct from old.estimated_at then to_jsonb(new.estimated_at) end,
          'conf', case when new.confidence is distinct from old.confidence then to_jsonb(new.confidence) end,
          'blk', case when new.block_index is distinct from old.block_index then to_jsonb(new.block_index) end,
          'cur', case when new.current_block is distinct from old.current_block then to_jsonb(new.current_block) end,
          'st', case when new.status is distinct from old.status then to_jsonb(new.status) end,
          'cat', case when new.category is distinct from old.category then to_jsonb(new.category) end,
          'add', case when coalesce(new.addons, '{}') is distinct from coalesce(old.addons, '{}') then to_jsonb(coalesce(new.addons, '{}')) end));
        insert into public.prognos_booking_history as h
          (booking_id, zone_id, zone_name, category, addons, first_seen_at, first_estimated_at, first_confidence, first_block,
           estimated_at, confidence, block_index, current_block, status, ended_at, events, backfilled)
        values (new.id, new.zone_id, new.zone_name, new.category, coalesce(new.addons, '{}'), coalesce(old.observed_at, now()),
                old.estimated_at, old.confidence, old.block_index, new.estimated_at, new.confidence, new.block_index, new.current_block,
                new.status, case when new.status <> 'open' then now() end, jsonb_build_array(ev), true)
        on conflict (booking_id) do update set
          zone_id = excluded.zone_id, zone_name = coalesce(excluded.zone_name, h.zone_name), category = excluded.category,
          addons = excluded.addons, estimated_at = excluded.estimated_at, confidence = excluded.confidence,
          block_index = excluded.block_index, current_block = excluded.current_block, status = excluded.status,
          ended_at = case when excluded.status = 'open' then null
                          when h.status = 'open' or h.ended_at is null then now() else h.ended_at end,
          n_changes = h.n_changes + 1,
          events = case when jsonb_array_length(h.events) < 300 then h.events || ev else h.events end,
          updated_at = now();
      end if;
    elsif tg_op = 'DELETE' then
      update public.prognos_booking_history
         set deleted_at = now(), ended_at = coalesce(ended_at, now()), updated_at = now(),
             events = events || jsonb_build_object('t', now(), 'ev', 'rensad', 'st', old.status)
       where booking_id = old.id;
    end if;
  exception when others then
    raise warning 'prognos_history_capture: %', sqlerrm;   -- får aldrig stoppa synken
  end;
  return null;
end $$;
revoke all on function private.prognos_history_capture() from public, anon, authenticated;

drop trigger if exists prognos_history_trg on public.prognos_bookings;
create trigger prognos_history_trg
  after insert or update or delete on public.prognos_bookings
  for each row execute function private.prognos_history_capture();

-- Fyll på med det som redan finns (bokningar som ännu inte rensats). Första prognostiden okänd → samma som nu.
insert into public.prognos_booking_history
  (booking_id, zone_id, zone_name, category, addons, first_seen_at, first_estimated_at, first_confidence, first_block,
   estimated_at, confidence, block_index, current_block, status, ended_at, events, backfilled)
select b.id, b.zone_id, b.zone_name, b.category, coalesce(b.addons, '{}'), b.observed_at, b.estimated_at, b.confidence, b.block_index,
       b.estimated_at, b.confidence, b.block_index, b.current_block, b.status,
       case when b.status <> 'open' then coalesce(g.gone_at, b.created_at) end,
       jsonb_build_array(jsonb_build_object('t', now(), 'ev', 'efterfylld', 'st', b.status)), true
  from public.prognos_bookings b
  left join public.prognos_bookings_gone g on g.booking_id = b.id
on conflict (booking_id) do nothing;

-- Daglig rensning: äldre än 90 dagar tas bort (pg_cron i databasen, inte cron-job.org).
create or replace function private.prognos_history_prune()
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  with d as (delete from public.prognos_booking_history where first_seen_at < now() - interval '90 days' returning 1)
  select count(*)::int from d
$$;
revoke all on function private.prognos_history_prune() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'prognos-history-prune';
select cron.schedule('prognos-history-prune', '35 3 * * *', 'select private.prognos_history_prune()');
