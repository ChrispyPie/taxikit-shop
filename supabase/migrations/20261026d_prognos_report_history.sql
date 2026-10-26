-- t344u: felrapport ska kunna visa bokningar som visats senaste ~60 min, även försvunna.
-- Additivt: ny tabell + trigger (loggar statusbyte) + läs-RPC för inloggade förare. Inga ALTER/DROP av befintligt.
create table if not exists public.prognos_bookings_gone (
  booking_id bigint primary key,
  status text not null,
  gone_at timestamptz not null default now()
);
create index if not exists prognos_bookings_gone_at_idx on public.prognos_bookings_gone (gone_at);
alter table public.prognos_bookings_gone enable row level security;
revoke all on public.prognos_bookings_gone from anon, authenticated;

create or replace function private.prognos_bookings_gone_capture()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    if new.status is distinct from old.status and new.status <> 'open' then
      insert into public.prognos_bookings_gone (booking_id, status, gone_at)
      values (new.id, new.status, now())
      on conflict (booking_id) do update set status = excluded.status, gone_at = excluded.gone_at;
    end if;
  exception when others then
    raise warning 'prognos_bookings_gone_capture: %', sqlerrm; -- får aldrig stoppa synken
  end;
  return new;
end $$;
revoke all on function private.prognos_bookings_gone_capture() from public, anon, authenticated;

drop trigger if exists prognos_bookings_gone_trg on public.prognos_bookings;
create trigger prognos_bookings_gone_trg after update of status on public.prognos_bookings
  for each row execute function private.prognos_bookings_gone_capture();

-- Läs-RPC: bokningar i en zon som visats senaste p_minutes (öppna + försvunna). Ingen kod/PIN.
create or replace function public.prognos_report_history(p_token text, p_zone text, p_minutes int default 60)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_min int;
begin
  select * into a from private.session_actor(p_token);
  v_min := least(greatest(coalesce(p_minutes, 60), 10), 180);
  return coalesce((
    select json_agg(json_build_object(
      'estimated_at', b.estimated_at, 'category', b.category, 'confidence', b.confidence,
      'status', b.status, 'first_seen', b.observed_at, 'gone_at', g.gone_at
    ) order by b.estimated_at, b.category)
    from (select * from public.prognos_bookings b
           where b.zone_id = p_zone
             and b.observed_at <= now()
             and b.estimated_at >= now() - make_interval(mins => v_min + 15)
           order by b.estimated_at limit 80) b
    left join public.prognos_bookings_gone g on g.booking_id = b.id
    where b.status = 'open'
       or g.gone_at >= now() - make_interval(mins => v_min)
       or (g.gone_at is null and b.created_at >= now() - make_interval(mins => v_min + 60))
  ), '[]'::json);
end $$;
revoke all on function public.prognos_report_history(text, text, int) from public;
grant execute on function public.prognos_report_history(text, text, int) to anon, authenticated;

-- Ångra:
-- drop function if exists public.prognos_report_history(text, text, int);
-- drop trigger if exists prognos_bookings_gone_trg on public.prognos_bookings;
-- drop function if exists private.prognos_bookings_gone_capture();
-- drop table if exists public.prognos_bookings_gone;
