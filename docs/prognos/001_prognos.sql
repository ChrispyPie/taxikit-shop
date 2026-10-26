-- Prognos: additiv migration. Inga ALTER/DROP av befintliga objekt.
-- PIN och tick-nyckel skapas/seedas separat (aldrig i git).

-- ---------- tabeller ----------
create table if not exists public.prognos_snapshots (
  id bigserial primary key,
  fetched_at timestamptz not null default now(),
  payload jsonb not null,
  ok boolean not null default true,
  http_status int,
  err text
);

create table if not exists public.prognos_bookings (
  id bigserial primary key,
  zone_id text not null,
  zone_name text,
  category text not null,
  estimated_at timestamptz not null,
  observed_at timestamptz not null,
  block_index int not null check (block_index between 0 and 2),
  status text not null default 'open' check (status in ('open','canceled','assigned')),
  snapshot_id bigint references public.prognos_snapshots(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists prognos_bookings_est_idx on public.prognos_bookings (estimated_at);
create index if not exists prognos_bookings_zone_cat_status_idx on public.prognos_bookings (zone_id, category, status);

create table if not exists public.prognos_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.prognos_watches (
  id bigserial primary key,
  driver_id text not null,
  zone_id text not null,
  category text not null,
  created_at timestamptz not null default now(),
  unique (driver_id, zone_id, category)
);
create index if not exists prognos_watches_zone_cat_idx on public.prognos_watches (zone_id, category);

-- Inga direkta tabellrättigheter – allt via RPC
revoke all on table public.prognos_snapshots from public, anon, authenticated;
revoke all on table public.prognos_bookings from public, anon, authenticated;
revoke all on table public.prognos_meta from public, anon, authenticated;
revoke all on table public.prognos_watches from public, anon, authenticated;
grant all on table public.prognos_snapshots to service_role;
grant all on table public.prognos_bookings to service_role;
grant all on table public.prognos_meta to service_role;
grant all on table public.prognos_watches to service_role;
grant usage, select on sequence public.prognos_snapshots_id_seq to service_role;
grant usage, select on sequence public.prognos_bookings_id_seq to service_role;
grant usage, select on sequence public.prognos_watches_id_seq to service_role;

-- ---------- hjälp: meta ----------
create or replace function private.prognos_meta_get(p_key text)
returns jsonb language sql security definer set search_path to 'public','pg_temp' as $$
  select value from public.prognos_meta where key = p_key
$$;

create or replace function private.prognos_meta_set(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  insert into public.prognos_meta(key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

revoke all on function private.prognos_meta_get(text) from public, anon, authenticated;
revoke all on function private.prognos_meta_set(text, jsonb) from public, anon, authenticated;

-- ---------- service-RPCs (edge / service_role) ----------
create or replace function public.prognos_svc_secret(p_name text)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if p_name not in ('PROGNOS_PIN','PROGNOS_TICK_KEY','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY') then
    return null;
  end if;
  return private.vault_secret(p_name);
end $$;

create or replace function public.prognos_svc_set_status(p_status text, p_err text default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  perform private.prognos_meta_set('status', jsonb_build_object(
    'status', p_status,
    'err', p_err,
    'at', now()
  ));
  if p_status = 'ok' then
    perform private.prognos_meta_set('last_ok_at', to_jsonb(now()));
  end if;
end $$;

create or replace function public.prognos_svc_latest_payload()
returns jsonb language sql security definer set search_path to 'public','pg_temp' as $$
  select payload from public.prognos_snapshots where ok order by fetched_at desc limit 1
$$;

create or replace function public.prognos_svc_insert_snapshot(p_payload jsonb, p_ok boolean, p_http int, p_err text)
returns bigint language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_id bigint;
begin
  insert into public.prognos_snapshots(payload, ok, http_status, err)
  values (p_payload, p_ok, p_http, p_err) returning id into v_id;
  return v_id;
end $$;

create or replace function public.prognos_svc_insert_booking(
  p_zone text, p_zone_name text, p_cat text, p_est timestamptz,
  p_obs timestamptz, p_block int, p_snap bigint
) returns bigint language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_id bigint;
begin
  insert into public.prognos_bookings(zone_id, zone_name, category, estimated_at, observed_at, block_index, snapshot_id)
  values (p_zone, p_zone_name, p_cat, p_est, p_obs, p_block, p_snap)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.prognos_svc_cancel_n(
  p_zone text, p_cat text, p_n int
) returns int language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_done int := 0; r record;
begin
  if p_n is null or p_n <= 0 then return 0; end if;
  for r in
    select id from public.prognos_bookings
     where zone_id = p_zone and category = p_cat and status = 'open'
       and estimated_at > now() - interval '30 minutes'
     order by estimated_at asc, id asc
     limit p_n
  loop
    update public.prognos_bookings set status = 'canceled' where id = r.id;
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

create or replace function public.prognos_svc_prune()
returns int language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_n int;
begin
  delete from public.prognos_snapshots where fetched_at < now() - interval '2 days';
  get diagnostics v_n = row_count;
  delete from public.prognos_bookings
   where estimated_at < now() - interval '1 day' or (status <> 'open' and created_at < now() - interval '2 days');
  return v_n;
end $$;

create or replace function public.prognos_svc_watch_drivers(p_zone text, p_cat text)
returns json language sql security definer set search_path to 'public','pg_temp' as $$
  select coalesce(json_agg(distinct driver_id), '[]'::json)
  from public.prognos_watches
  where zone_id = p_zone and (category = p_cat or category = '*')
$$;

do $$ declare f text; begin
  foreach f in array array[
    'public.prognos_svc_secret(text)',
    'public.prognos_svc_set_status(text,text)',
    'public.prognos_svc_latest_payload()',
    'public.prognos_svc_insert_snapshot(jsonb,boolean,int,text)',
    'public.prognos_svc_insert_booking(text,text,text,timestamptz,timestamptz,int,bigint)',
    'public.prognos_svc_cancel_n(text,text,int)',
    'public.prognos_svc_prune()',
    'public.prognos_svc_watch_drivers(text,text)'
  ] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $$;

-- ---------- förar-RPCs (session) ----------
create or replace function public.prognos_status(p_token text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; st jsonb; last_ok jsonb; has_pin boolean;
begin
  select * into a from private.session_actor(p_token);
  st := private.prognos_meta_get('status');
  last_ok := private.prognos_meta_get('last_ok_at');
  has_pin := coalesce(private.vault_secret('PROGNOS_PIN'), '') <> '';
  return json_build_object(
    'status', coalesce(st->>'status', case when has_pin then 'ok' else 'code_needed' end),
    'err', st->>'err',
    'at', st->>'at',
    'last_ok_at', last_ok #>> '{}',
    'has_code', has_pin,
    'code_needed', coalesce(st->>'status','') = 'code_needed' or not has_pin
  );
end $$;

create or replace function public.prognos_submit_code(p_token text, p_code text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_id uuid; v_code text;
begin
  select * into a from private.session_actor(p_token);
  v_code := trim(coalesce(p_code, ''));
  if length(v_code) < 4 or length(v_code) > 32 then
    raise exception 'invalid_code' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = 'PROGNOS_PIN' order by created_at desc limit 1;
  if v_id is null then
    perform vault.create_secret(v_code, 'PROGNOS_PIN', 'Prognos-åtkomstkod (endast server)');
  else
    perform vault.update_secret(v_id, v_code);
  end if;
  perform public.prognos_svc_set_status('ok', null);
  return json_build_object('ok', true);
end $$;

create or replace function public.prognos_list_bookings(p_token text, p_from timestamptz default null, p_to timestamptz default null)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_from timestamptz; v_to timestamptz;
begin
  select * into a from private.session_actor(p_token);
  v_from := coalesce(p_from, now() - interval '15 minutes');
  v_to := coalesce(p_to, now() + interval '2 hours 30 minutes');
  return coalesce((
    select json_agg(json_build_object(
      'id', id, 'zone_id', zone_id, 'zone_name', zone_name, 'category', category,
      'estimated_at', estimated_at, 'observed_at', observed_at, 'block_index', block_index,
      'status', status
    ) order by estimated_at, zone_id, category)
    from public.prognos_bookings
    where estimated_at >= v_from and estimated_at <= v_to
      and status = 'open'
  ), '[]'::json);
end $$;

create or replace function public.prognos_morgon(p_token text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; p jsonb;
begin
  select * into a from private.session_actor(p_token);
  select payload into p from public.prognos_snapshots where ok order by fetched_at desc limit 1;
  if p is null then return null; end if;
  return p->'morgonprognos';
end $$;

create or replace function public.prognos_zones(p_token text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; p jsonb;
begin
  select * into a from private.session_actor(p_token);
  select payload into p from public.prognos_snapshots where ok order by fetched_at desc limit 1;
  if p is null then return '[]'::json; end if;
  return coalesce((
    select json_agg(json_build_object('id', z.key, 'name', z.value->>'name', 'total', (z.value->>'total')::int)
      order by z.key)
    from jsonb_each(p->'zones') z
  ), '[]'::json);
end $$;

create or replace function public.prognos_watch_list(p_token text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  return coalesce((
    select json_agg(json_build_object('id', id, 'zone_id', zone_id, 'category', category) order by zone_id, category)
    from public.prognos_watches where driver_id = a.driver_id
  ), '[]'::json);
end $$;

create or replace function public.prognos_watch_set(p_token text, p_zone text, p_category text, p_on boolean)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(p_zone,'') = '' or coalesce(p_category,'') = '' then
    raise exception 'invalid_args' using errcode = '22023';
  end if;
  if p_on then
    insert into public.prognos_watches(driver_id, zone_id, category)
    values (a.driver_id, p_zone, p_category)
    on conflict (driver_id, zone_id, category) do nothing;
  else
    delete from public.prognos_watches
     where driver_id = a.driver_id and zone_id = p_zone and category = p_category;
  end if;
  return public.prognos_watch_list(p_token);
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'public.prognos_status(text)',
    'public.prognos_submit_code(text,text)',
    'public.prognos_list_bookings(text,timestamptz,timestamptz)',
    'public.prognos_morgon(text)',
    'public.prognos_zones(text)',
    'public.prognos_watch_list(text)',
    'public.prognos_watch_set(text,text,text,boolean)'
  ] loop
    execute 'revoke all on function ' || f || ' from public';
    execute 'grant execute on function ' || f || ' to anon, authenticated, service_role';
  end loop;
end $$;

-- ---------- tick (pg_cron -> edge) ----------
create or replace function private.prognos_tick()
returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_key text; resp extensions.http_response;
begin
  v_key := private.vault_secret('PROGNOS_TICK_KEY');
  if coalesce(v_key,'') = '' then return -1; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  resp := extensions.http(('POST',
    'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/prognos-sync',
    array[extensions.http_header('x-tick-key', v_key)],
    'application/json', '{"action":"tick"}')::extensions.http_request);
  return resp.status;
exception when others then return -2;
end $$;
revoke all on function private.prognos_tick() from public, anon, authenticated;

-- Schemalägg varje minut (additivt – tar bort bara vårt eget jobbnamn vid undo)
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'prognos-sync') then
    perform cron.schedule('prognos-sync', '* * * * *', 'select private.prognos_tick()');
  end if;
end $$;

-- Initiera meta
insert into public.prognos_meta(key, value)
values ('status', '{"status":"code_needed"}'::jsonb)
on conflict (key) do nothing;
