-- 20261111d: Fasta ruttbevakningar (samma tur och klockslag, inte tåg-/flygnummer).
--
-- Nytt (bara tillägg, inget befintligt tas bort):
--  * tabell public.route_watches: förarens fasta bevakning per typ, rutt, klockslag och dagar
--  * tabell public.route_watch_sent: vilka notiser som redan skickats (så inget skickas två gånger)
--  * RPC route_watch_list / route_watch_save / route_watch_delete (inloggad förare via p_token, demokonton nekas)
--  * service-funktioner rw_svc_active / rw_svc_mark (bara service_role, används av edge-funktionen bevakning)
--  * private.rw_in_window: ankomstens klockslag (svensk tid) inom ±15 min från valt klockslag, rätt veckodag
--  * private.bevakning_tick utökas: rensar även route_watch_sent och väcker edge om en fast ruttbevakning är påslagen
-- Befintliga train_watches, flight_watches och tillfälliga arrival_watches lämnas orörda.
-- Loggar ändringar i Admin › Logg som watch_route_save / watch_route_delete (gruppen Notiser och bevakningar).
-- Ångra: undo/20261111d_route_watches_undo.sql

create table if not exists public.route_watches (
  id bigserial primary key,
  driver_id text not null references public.drivers(id) on delete cascade,
  kind text not null,
  route text not null,                            -- tåg: sthlm/kbh/oslo; flyg: IATA; båt: hamnkod
  label text not null default '',
  sched_min int not null,                         -- minuter efter midnatt, svensk tid
  days int[] not null default '{1,2,3,4,5,6,7}',  -- ISO-veckodag 1 = måndag … 7 = söndag
  lead_min int not null default 20,
  notify_delay boolean not null default true,
  delay_min int not null default 10,
  notify_cancel boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_watches_kind check (kind in ('tag', 'flyg', 'bat')),
  constraint route_watches_lead check (lead_min between 0 and 120),
  constraint route_watches_delay check (delay_min between 5 and 180),
  constraint route_watches_sched check (sched_min between 0 and 1439),
  constraint route_watches_uniq unique (driver_id, kind, route, sched_min)
);
create index if not exists route_watches_driver_idx on public.route_watches(driver_id);
alter table public.route_watches enable row level security;
revoke all on table public.route_watches from public, anon, authenticated;
revoke all on sequence public.route_watches_id_seq from public, anon, authenticated;

create table if not exists public.route_watch_sent (
  driver_id text not null references public.drivers(id) on delete cascade,
  ident text not null,
  sched timestamptz not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (driver_id, ident, sched)
);
alter table public.route_watch_sent enable row level security;
revoke all on table public.route_watch_sent from public, anon, authenticated;

-- Är ankomstens planerade tid inom ±15 min från valt klockslag, rätt veckodag? Svensk tid.
create or replace function private.rw_in_window(p_days int[], p_sched_min int, p_at timestamptz, p_slack int default 15)
 returns boolean language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare lt timestamp := p_at at time zone 'Europe/Stockholm'; m int; d int; gap int;
begin
  if p_sched_min is null or p_sched_min not between 0 and 1439 then return false; end if;
  if p_slack is null or p_slack < 0 then p_slack := 15; end if;
  m := extract(hour from lt)::int * 60 + extract(minute from lt)::int;
  d := extract(isodow from lt)::int;
  gap := abs(m - p_sched_min);
  gap := least(gap, 1440 - gap);
  return gap <= p_slack and (p_days is null or d = any(p_days));
end $$;

create or replace function private.rw_json(w public.route_watches) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', w.id, 'kind', w.kind, 'route', w.route, 'label', w.label,
    'sched_min', w.sched_min, 'days', to_jsonb(w.days), 'enabled', w.enabled,
    'lead_min', w.lead_min, 'notify_delay', w.notify_delay, 'delay_min', w.delay_min,
    'notify_cancel', w.notify_cancel)
$$;

create or replace function public.route_watch_list(p_token text) returns jsonb
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  return coalesce((select jsonb_agg(private.rw_json(w) order by w.kind, w.sched_min, w.id)
                   from public.route_watches w where w.driver_id = a.driver_id), '[]'::jsonb);
end $$;

create or replace function public.route_watch_save(p_token text, p_id bigint, p_data jsonb) returns jsonb
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_kind text; v_route text; v_label text; v_days int[]; v_sched int;
  v_en boolean; v_id bigint; v_new boolean := p_id is null;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad_data' using errcode = '22023'; end if;
  v_kind := lower(btrim(coalesce(p_data->>'kind', '')));
  if v_kind not in ('tag', 'flyg', 'bat') then raise exception 'bad_kind' using errcode = '22023'; end if;
  v_route := btrim(coalesce(p_data->>'route', ''));
  if v_kind = 'flyg' then v_route := upper(v_route); else v_route := lower(v_route); end if;
  if v_kind = 'tag' and v_route !~ '^[a-z][a-z0-9]{1,11}$' then raise exception 'bad_route' using errcode = '22023'; end if;
  if v_kind = 'flyg' and v_route !~ '^[A-Z]{3}$' then raise exception 'bad_route' using errcode = '22023'; end if;
  if v_kind = 'bat' and v_route !~ '^[a-z0-9]{2,16}$' then raise exception 'bad_route' using errcode = '22023'; end if;
  v_label := left(btrim(coalesce(p_data->>'label', '')), 60);
  v_sched := coalesce((p_data->>'sched_min')::int, -1);
  if v_sched not between 0 and 1439 then raise exception 'bad_time' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x::int order by x::int), '{}') into v_days
    from jsonb_array_elements_text(coalesce(p_data->'days', '[1,2,3,4,5,6,7]'::jsonb)) x;
  if cardinality(v_days) = 0 or not v_days <@ array[1,2,3,4,5,6,7] then raise exception 'bad_days' using errcode = '22023'; end if;
  v_en := coalesce((p_data->>'enabled')::boolean, true);
  if v_new then
    if (select count(*) from public.route_watches where driver_id = a.driver_id) >= 40 then
      raise exception 'too_many' using errcode = '22023';
    end if;
    insert into public.route_watches(driver_id, kind, route, label, sched_min, days, enabled)
    values (a.driver_id, v_kind, v_route, v_label, v_sched, v_days, v_en)
    on conflict (driver_id, kind, route, sched_min) do update
      set label = excluded.label, days = excluded.days, enabled = excluded.enabled, updated_at = now()
    returning id into v_id;
  else
    update public.route_watches
       set kind = v_kind, route = v_route, label = v_label, sched_min = v_sched,
           days = v_days, enabled = v_en, updated_at = now()
     where id = p_id and driver_id = a.driver_id
    returning id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  perform private.log(a.driver_id, a.category, 'watch_route_save', a.driver_id,
    jsonb_build_object('id', v_id, 'new', v_new, 'kind', v_kind, 'route', v_route, 'sched_min', v_sched, 'enabled', v_en), a.via_master);
  return public.route_watch_list(p_token);
end $$;

create or replace function public.route_watch_delete(p_token text, p_id bigint) returns jsonb
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_id bigint;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  delete from public.route_watches where id = p_id and driver_id = a.driver_id returning id into v_id;
  if v_id is not null then
    perform private.log(a.driver_id, a.category, 'watch_route_delete', a.driver_id,
      jsonb_build_object('id', p_id), a.via_master);
  end if;
  return public.route_watch_list(p_token);
end $$;

create or replace function private.rw_active_now() returns setof public.route_watches
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select w.* from public.route_watches w
    join public.drivers d on d.id = w.driver_id
   where w.enabled
     and coalesce(d.activated, false) and coalesce(d.category, '') <> 'avslutad'
     and not exists (select 1 from private.demo_accounts x where x.driver_id = w.driver_id)
     and exists (select 1 from public.push_subscriptions p where p.driver_id = w.driver_id and coalesce(p.fail_count, 0) < 5)
$$;

create or replace function public.rw_svc_active() returns jsonb
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object(
    'watches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'driver_id', w.driver_id, 'kind', w.kind, 'route', w.route,
        'sched_min', w.sched_min, 'days', to_jsonb(w.days), 'lead_min', w.lead_min,
        'notify_delay', w.notify_delay, 'delay_min', w.delay_min, 'notify_cancel', w.notify_cancel))
        from private.rw_active_now() w), '[]'::jsonb),
    'sent', coalesce((select jsonb_agg(jsonb_build_object('driver_id', s.driver_id, 'ident', s.ident, 'sched', s.sched, 'state', s.state))
        from public.route_watch_sent s
       where s.sched > now() - interval '12 hours'
         and s.driver_id in (select driver_id from private.rw_active_now())), '[]'::jsonb))
$$;

create or replace function public.rw_svc_mark(p_driver text, p_ident text, p_sched timestamptz, p_state jsonb) returns void
 language sql security definer set search_path to 'public', 'pg_temp' as $$
  insert into public.route_watch_sent(driver_id, ident, sched, state, updated_at)
  values (p_driver, p_ident, p_sched, coalesce(p_state, '{}'::jsonb), now())
  on conflict (driver_id, ident, sched) do update set state = excluded.state, updated_at = now()
$$;

revoke all on function public.rw_svc_active() from public, anon, authenticated;
revoke all on function public.rw_svc_mark(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.route_watch_list(text) to anon, authenticated, service_role;
grant execute on function public.route_watch_save(text, bigint, jsonb) to anon, authenticated, service_role;
grant execute on function public.route_watch_delete(text, bigint) to anon, authenticated, service_role;
grant execute on function public.rw_svc_active() to service_role;
grant execute on function public.rw_svc_mark(text, text, timestamptz, jsonb) to service_role;
revoke all on function private.rw_active_now() from public, anon, authenticated;

-- Utöka befintlig tick: rensa även route_watch_sent och väck edge om det finns en fast ruttbevakning.
create or replace function private.bevakning_tick()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_key text; resp extensions.http_response;
begin
  delete from public.arrival_watches where expires_at < now() - interval '1 hour';
  delete from public.train_watch_sent where sched < now() - interval '2 days';
  delete from public.flight_watch_sent where sched < now() - interval '2 days';
  delete from public.route_watch_sent where sched < now() - interval '2 days';
  if not exists (select 1 from public.arrival_watches where expires_at > now())
     and not exists (select 1 from private.tw_active_now())
     and not exists (select 1 from private.fw_active_now())
     and not exists (select 1 from private.rw_active_now()) then return 0; end if;
  v_key := private.vault_secret('BEVAKNING_TICK_KEY');
  if coalesce(v_key,'') = '' then return -1; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  resp := extensions.http(('POST', 'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/bevakning',
     array[extensions.http_header('x-tick-key', v_key)], 'application/json', '{"action":"tick"}')::extensions.http_request);
  return resp.status;
exception when others then return -2;
end $function$;
