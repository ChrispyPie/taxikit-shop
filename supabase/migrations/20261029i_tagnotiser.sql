-- 20261029i (hette först 20261029e): Mina tågnotiser (t609u). Fasta notiser för vissa tåg, t.ex. snabbtågen från Stockholm,
-- bara under de tider föraren väljer (t.ex. 17:00–05:00 mån–fre).
--
-- Nytt (bara tillägg, inget befintligt tas bort):
--  * tabell public.train_watches: förarens fasta tågnotiser (filter + tider + vad som ska meddelas)
--  * tabell public.train_watch_sent: vilka notiser som redan skickats per förare och tåg (så inget skickas två gånger)
--  * RPC train_watch_list / train_watch_save / train_watch_delete (inloggad förare via p_token, demokonton nekas)
--  * service-funktioner tw_svc_active / tw_svc_mark (bara service_role, används av edge-funktionen bevakning)
--  * private.tw_in_window: är klockan (svensk tid) inom förarens tider? Över natten (17:00–05:00) räknas
--    morgontimmarna till dagen då passet började.
--  * private.bevakning_tick ersätts: anropar edge-funktionen även när någon tågnotis är aktiv just nu
--    (samma pg_cron-jobb som i dag, ingen ny schemaläggning, inget i cron-job.org).
-- Loggar ändringar i Admin › Logg som watch_train_save / watch_train_delete (gruppen Notiser och bevakningar).
-- Ångra: undo/20261029i_tagnotiser_undo.sql

create table if not exists public.train_watches (
  id bigserial primary key,
  driver_id text not null references public.drivers(id) on delete cascade,
  name text not null default 'Tågnotis',
  enabled boolean not null default true,
  origins text[] not null default '{}',          -- 'sthlm', 'kbh', 'oslo' (tom = alla)
  fast_only boolean not null default false,       -- bara snabbtåg (SJ Snabbtåg/X2000/SJ 3000, VR/Vy Snabbtåg)
  train_nos text[] not null default '{}',         -- bara dessa tågnummer (tom = alla)
  lead_min int not null default 20,               -- notis så här många min före ankomst (0 = ingen)
  notify_delay boolean not null default true,
  delay_min int not null default 10,
  notify_cancel boolean not null default true,
  days int[] not null default '{1,2,3,4,5,6,7}',  -- ISO-veckodag 1 = måndag … 7 = söndag (dagen passet börjar)
  from_min int not null default 0,                -- minuter efter midnatt; from = to betyder hela dygnet
  to_min int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint train_watches_lead check (lead_min between 0 and 120),
  constraint train_watches_delay check (delay_min between 5 and 180),
  constraint train_watches_from check (from_min between 0 and 1439),
  constraint train_watches_to check (to_min between 0 and 1439)
);
create index if not exists train_watches_driver_idx on public.train_watches(driver_id);
alter table public.train_watches enable row level security;
revoke all on table public.train_watches from public, anon, authenticated;
revoke all on sequence public.train_watches_id_seq from public, anon, authenticated;

create table if not exists public.train_watch_sent (
  driver_id text not null references public.drivers(id) on delete cascade,
  ident text not null,
  sched timestamptz not null,
  state jsonb not null default '{}'::jsonb,       -- {lead: true, est: iso, canceled: true}
  updated_at timestamptz not null default now(),
  primary key (driver_id, ident, sched)
);
alter table public.train_watch_sent enable row level security;
revoke all on table public.train_watch_sent from public, anon, authenticated;

-- Är tidpunkten p_at inom tiderna? Svensk tid.
create or replace function private.tw_in_window(p_days int[], p_from int, p_to int, p_at timestamptz default now())
 returns boolean language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare lt timestamp := p_at at time zone 'Europe/Stockholm'; m int; d int; prev int;
begin
  m := extract(hour from lt)::int * 60 + extract(minute from lt)::int;
  d := extract(isodow from lt)::int;
  prev := case when d = 1 then 7 else d - 1 end;
  if p_from = p_to then return d = any(p_days); end if;
  if p_from < p_to then return m >= p_from and m < p_to and d = any(p_days); end if;
  -- över natten, t.ex. 17:00–05:00: kvällen hör till dagen, morgonen till dagen innan
  return (m >= p_from and d = any(p_days)) or (m < p_to and prev = any(p_days));
end $$;

create or replace function private.tw_json(w public.train_watches) returns jsonb language sql stable as $$
  select jsonb_build_object('id', w.id, 'name', w.name, 'enabled', w.enabled, 'origins', to_jsonb(w.origins),
    'fast_only', w.fast_only, 'train_nos', to_jsonb(w.train_nos), 'lead_min', w.lead_min,
    'notify_delay', w.notify_delay, 'delay_min', w.delay_min, 'notify_cancel', w.notify_cancel,
    'days', to_jsonb(w.days), 'from_min', w.from_min, 'to_min', w.to_min,
    'active_now', w.enabled and private.tw_in_window(w.days, w.from_min, w.to_min, now()))
$$;

create or replace function public.train_watch_list(p_token text) returns jsonb
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  return coalesce((select jsonb_agg(private.tw_json(w) order by w.id) from public.train_watches w where w.driver_id = a.driver_id), '[]'::jsonb);
end $$;

create or replace function public.train_watch_save(p_token text, p_id bigint, p_data jsonb) returns jsonb
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_name text; v_origins text[]; v_nos text[]; v_days int[]; v_fast boolean; v_lead int; v_delay int;
  v_from int; v_to int; v_en boolean; v_nd boolean; v_nc boolean; v_id bigint; v_new boolean := p_id is null;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad_data' using errcode = '22023'; end if;
  v_name := left(btrim(coalesce(p_data->>'name', '')), 40);
  if v_name = '' then v_name := 'Tågnotis'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_origins
    from jsonb_array_elements_text(coalesce(p_data->'origins', '[]'::jsonb)) x;
  if not v_origins <@ array['sthlm', 'kbh', 'oslo'] then raise exception 'bad_origin' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct btrim(x) order by btrim(x)), '{}') into v_nos
    from jsonb_array_elements_text(coalesce(p_data->'train_nos', '[]'::jsonb)) x where btrim(x) <> '';
  if cardinality(v_nos) > 20 or exists (select 1 from unnest(v_nos) n where n !~ '^[0-9]{1,6}$') then
    raise exception 'bad_train_no' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x::int order by x::int), '{}') into v_days
    from jsonb_array_elements_text(coalesce(p_data->'days', '[1,2,3,4,5,6,7]'::jsonb)) x;
  if cardinality(v_days) = 0 or not v_days <@ array[1,2,3,4,5,6,7] then raise exception 'bad_days' using errcode = '22023'; end if;
  v_fast := coalesce((p_data->>'fast_only')::boolean, false);
  v_en := coalesce((p_data->>'enabled')::boolean, true);
  v_nd := coalesce((p_data->>'notify_delay')::boolean, true);
  v_nc := coalesce((p_data->>'notify_cancel')::boolean, true);
  v_lead := coalesce((p_data->>'lead_min')::int, 20);
  v_delay := coalesce((p_data->>'delay_min')::int, 10);
  v_from := coalesce((p_data->>'from_min')::int, 0);
  v_to := coalesce((p_data->>'to_min')::int, 0);
  if v_lead not between 0 and 120 or v_delay not between 5 and 180 or v_from not between 0 and 1439 or v_to not between 0 and 1439 then
    raise exception 'bad_data' using errcode = '22023';
  end if;
  -- Alla tåg till Göteborg C blir för många notiser: minst ett filter krävs
  if cardinality(v_origins) = 0 and not v_fast and cardinality(v_nos) = 0 then
    raise exception 'too_broad' using errcode = '22023';
  end if;
  if v_lead = 0 and not v_nd and not v_nc then raise exception 'nothing_to_send' using errcode = '22023'; end if;
  if v_new then
    if (select count(*) from public.train_watches where driver_id = a.driver_id) >= 10 then
      raise exception 'too_many' using errcode = '22023';
    end if;
    insert into public.train_watches(driver_id, name, enabled, origins, fast_only, train_nos, lead_min, notify_delay, delay_min,
      notify_cancel, days, from_min, to_min)
    values (a.driver_id, v_name, v_en, v_origins, v_fast, v_nos, v_lead, v_nd, v_delay, v_nc, v_days, v_from, v_to)
    returning id into v_id;
  else
    update public.train_watches set name = v_name, enabled = v_en, origins = v_origins, fast_only = v_fast, train_nos = v_nos,
      lead_min = v_lead, notify_delay = v_nd, delay_min = v_delay, notify_cancel = v_nc, days = v_days,
      from_min = v_from, to_min = v_to, updated_at = now()
     where id = p_id and driver_id = a.driver_id
    returning id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  perform private.log(a.driver_id, a.category, 'watch_train_save', a.driver_id,
    jsonb_build_object('id', v_id, 'new', v_new, 'name', v_name, 'enabled', v_en), a.via_master);
  return public.train_watch_list(p_token);
end $$;

create or replace function public.train_watch_delete(p_token text, p_id bigint) returns jsonb
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_name text;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  delete from public.train_watches where id = p_id and driver_id = a.driver_id returning name into v_name;
  if v_name is not null then
    perform private.log(a.driver_id, a.category, 'watch_train_delete', a.driver_id,
      jsonb_build_object('id', p_id, 'name', v_name), a.via_master);
  end if;
  return public.train_watch_list(p_token);
end $$;

-- Aktiva just nu: påslagna, inom tiderna, föraren aktiv och har minst en fungerande enhet med push.
create or replace function private.tw_active_now() returns setof public.train_watches
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select w.* from public.train_watches w
    join public.drivers d on d.id = w.driver_id
   where w.enabled
     and coalesce(d.activated, false) and coalesce(d.category, '') <> 'avslutad'
     and not exists (select 1 from private.demo_accounts x where x.driver_id = w.driver_id)
     and exists (select 1 from public.push_subscriptions p where p.driver_id = w.driver_id and coalesce(p.fail_count, 0) < 5)
     and private.tw_in_window(w.days, w.from_min, w.to_min, now())
$$;

create or replace function public.tw_svc_active() returns jsonb
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object(
    'watches', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'driver_id', w.driver_id, 'origins', to_jsonb(w.origins),
        'fast_only', w.fast_only, 'train_nos', to_jsonb(w.train_nos), 'lead_min', w.lead_min, 'notify_delay', w.notify_delay,
        'delay_min', w.delay_min, 'notify_cancel', w.notify_cancel)) from private.tw_active_now() w), '[]'::jsonb),
    'sent', coalesce((select jsonb_agg(jsonb_build_object('driver_id', s.driver_id, 'ident', s.ident, 'sched', s.sched, 'state', s.state))
        from public.train_watch_sent s
       where s.sched > now() - interval '12 hours'
         and s.driver_id in (select driver_id from private.tw_active_now())), '[]'::jsonb))
$$;

create or replace function public.tw_svc_mark(p_driver text, p_ident text, p_sched timestamptz, p_state jsonb) returns void
 language sql security definer set search_path to 'public', 'pg_temp' as $$
  insert into public.train_watch_sent(driver_id, ident, sched, state, updated_at)
  values (p_driver, p_ident, p_sched, coalesce(p_state, '{}'::jsonb), now())
  on conflict (driver_id, ident, sched) do update set state = excluded.state, updated_at = now()
$$;

revoke all on function public.tw_svc_active() from public, anon, authenticated;
revoke all on function public.tw_svc_mark(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.tw_svc_active() to service_role;
grant execute on function public.tw_svc_mark(text, text, timestamptz, jsonb) to service_role;
revoke all on function private.tw_active_now() from public, anon, authenticated;

-- pg_cron (jobb "taxikit-bevakning", varje minut) anropar edge-funktionen när det finns en aktiv bevakning
-- ELLER en tågnotis som är aktiv just nu. Rensar skickat-listan efter 2 dygn.
CREATE OR REPLACE FUNCTION private.bevakning_tick() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_key text; resp extensions.http_response;
begin
  delete from public.arrival_watches where expires_at < now() - interval '1 hour';
  delete from public.train_watch_sent where sched < now() - interval '2 days';
  if not exists (select 1 from public.arrival_watches where expires_at > now())
     and not exists (select 1 from private.tw_active_now()) then return 0; end if;
  v_key := private.vault_secret('BEVAKNING_TICK_KEY');
  if coalesce(v_key,'') = '' then return -1; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  resp := extensions.http(('POST', 'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/bevakning',
     array[extensions.http_header('x-tick-key', v_key)], 'application/json', '{"action":"tick"}')::extensions.http_request);
  return resp.status;
exception when others then return -2;
end $function$;
