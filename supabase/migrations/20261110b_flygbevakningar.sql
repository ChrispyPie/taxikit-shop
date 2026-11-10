-- Flyg-Bevakningar: fasta notiser för ankomster till Landvetter (ursprung, flygnummer).
-- Additivt, speglar tåg-Bevakningar (20261029i). Ingen ny cron-job.org-jobb;
-- samma pg_cron "taxikit-bevakning" anropar private.bevakning_tick som nu även ser hit.

create table if not exists public.flight_watches (
  id          bigserial primary key,
  driver_id   text not null references public.drivers(id) on delete cascade,
  name        text not null default 'Bevakning',
  origins     text[] not null default '{}',
  airlines    text[] not null default '{}',
  flight_nos  text[] not null default '{}',
  lead_min    int not null default 20,
  notify_delay boolean not null default true,
  delay_min   int not null default 10,
  notify_cancel boolean not null default true,
  days        int[] not null default '{1,2,3,4,5,6,7}',
  from_min    int not null default 0,
  to_min      int not null default 1440,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint flight_watches_name_len check (char_length(name) between 1 and 40),
  constraint flight_watches_lead check (lead_min in (0,10,20,30,45,60)),
  constraint flight_watches_delay check (delay_min in (5,10,15,20,30,45)),
  constraint flight_watches_days check (days <@ '{1,2,3,4,5,6,7}'::int[] and cardinality(days) between 1 and 7),
  constraint flight_watches_win check (from_min between 0 and 1440 and to_min between 0 and 1440)
);
create index if not exists flight_watches_driver_idx on public.flight_watches (driver_id);

create table if not exists public.flight_watch_sent (
  driver_id text not null references public.drivers(id) on delete cascade,
  ident     text not null,
  sched     timestamptz not null,
  state     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (driver_id, ident, sched)
);

alter table public.flight_watches enable row level security;
alter table public.flight_watch_sent enable row level security;
revoke all on public.flight_watches from public, anon, authenticated;
revoke all on public.flight_watch_sent from public, anon, authenticated;
revoke all on sequence public.flight_watches_id_seq from public, anon, authenticated;

-- Aktiva flyg-Bevakningar just nu (samma tidsfönster som tåg: private.tw_in_window).
create or replace function private.fw_active_now()
returns setof public.flight_watches
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.* from public.flight_watches w
  where w.enabled
    and exists (select 1 from public.push_subscriptions p where p.driver_id = w.driver_id)
    and private.tw_in_window(w.days, w.from_min, w.to_min);
$$;

create or replace function public.flight_watch_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d text;
begin
  d := public.current_driver_id(p_token);
  if d is null then raise exception 'invalid_session' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(w) order by w.id)
    from public.flight_watches w where w.driver_id = d
  ), '[]'::jsonb);
end;
$$;

create or replace function public.flight_watch_save(p_token text, p_id bigint, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d text; r public.flight_watches;
  v_name text; v_origins text[]; v_airlines text[]; v_nos text[];
  v_lead int; v_nd boolean; v_dm int; v_nc boolean;
  v_days int[]; v_from int; v_to int; v_en boolean;
  x text;
begin
  d := public.current_driver_id(p_token);
  if d is null then raise exception 'invalid_session' using errcode = '28000'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Ogiltiga uppgifter' using errcode = '22023';
  end if;

  v_name := left(btrim(coalesce(p_data->>'name','Bevakning')), 40);
  if v_name = '' then v_name := 'Bevakning'; end if;

  select coalesce(array_agg(distinct upper(btrim(x))), '{}')
    into v_origins
    from jsonb_array_elements_text(coalesce(p_data->'origins','[]'::jsonb)) as x
    where btrim(x) ~ '^[A-Za-z]{3}$';
  v_origins := coalesce(v_origins, '{}');
  if cardinality(v_origins) > 30 then
    raise exception 'För många avreseorter (max 30)' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct upper(btrim(x))), '{}')
    into v_airlines
    from jsonb_array_elements_text(coalesce(p_data->'airlines','[]'::jsonb)) as x
    where btrim(x) ~ '^[A-Za-z]{2,3}$';
  v_airlines := coalesce(v_airlines, '{}');
  if cardinality(v_airlines) > 20 then
    raise exception 'För många flygbolag (max 20)' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct upper(regexp_replace(btrim(x), '\s+', '', 'g'))), '{}')
    into v_nos
    from jsonb_array_elements_text(coalesce(p_data->'flight_nos','[]'::jsonb)) as x
    where upper(regexp_replace(btrim(x), '\s+', '', 'g')) ~ '^[A-Z]{1,3}[0-9]{1,5}$';
  v_nos := coalesce(v_nos, '{}');
  if cardinality(v_nos) > 30 then
    raise exception 'För många flygnummer (max 30)' using errcode = '22023';
  end if;

  if cardinality(v_origins) = 0 and cardinality(v_airlines) = 0 and cardinality(v_nos) = 0 then
    raise exception 'Välj minst en avreseort, ett flygbolag eller ett flygnummer, annars blir det för många notiser.' using errcode = '22023';
  end if;

  v_lead := coalesce((p_data->>'lead_min')::int, 20);
  if v_lead not in (0,10,20,30,45,60) then
    raise exception 'Ogiltig förvarning' using errcode = '22023';
  end if;
  v_nd := coalesce((p_data->>'notify_delay')::boolean, true);
  v_dm := coalesce((p_data->>'delay_min')::int, 10);
  if v_dm not in (5,10,15,20,30,45) then
    raise exception 'Ogiltig förseningsgräns' using errcode = '22023';
  end if;
  v_nc := coalesce((p_data->>'notify_cancel')::boolean, true);

  select coalesce(array_agg(distinct (x)::int), '{1,2,3,4,5,6,7}')
    into v_days
    from jsonb_array_elements_text(coalesce(p_data->'days','[1,2,3,4,5,6,7]'::jsonb)) as x
    where (x)::int between 1 and 7;
  v_days := coalesce(v_days, '{1,2,3,4,5,6,7}');
  if cardinality(v_days) = 0 then
    raise exception 'Välj minst en veckodag' using errcode = '22023';
  end if;

  v_from := coalesce((p_data->>'from_min')::int, 0);
  v_to   := coalesce((p_data->>'to_min')::int, 1440);
  if v_from not between 0 and 1440 or v_to not between 0 and 1440 then
    raise exception 'Ogiltigt tidsfönster' using errcode = '22023';
  end if;
  v_en := coalesce((p_data->>'enabled')::boolean, true);

  if p_id is null or p_id = 0 then
    if (select count(*) from public.flight_watches where driver_id = d) >= 10 then
      raise exception 'Du kan ha högst 10 flyg-Bevakningar' using errcode = '22023';
    end if;
    insert into public.flight_watches (
      driver_id, name, origins, airlines, flight_nos,
      lead_min, notify_delay, delay_min, notify_cancel,
      days, from_min, to_min, enabled
    ) values (
      d, v_name, v_origins, v_airlines, v_nos,
      v_lead, v_nd, v_dm, v_nc,
      v_days, v_from, v_to, v_en
    ) returning * into r;
    perform public.log(d, 'watch_flight_save',
      jsonb_build_object('id', r.id, 'name', v_name, 'origins', v_origins, 'airlines', v_airlines, 'flight_nos', v_nos));
  else
    update public.flight_watches set
      name = v_name, origins = v_origins, airlines = v_airlines, flight_nos = v_nos,
      lead_min = v_lead, notify_delay = v_nd, delay_min = v_dm, notify_cancel = v_nc,
      days = v_days, from_min = v_from, to_min = v_to, enabled = v_en,
      updated_at = now()
    where id = p_id and driver_id = d
    returning * into r;
    if r.id is null then
      raise exception 'Bevakningen finns inte' using errcode = '22023';
    end if;
    perform public.log(d, 'watch_flight_save', jsonb_build_object('id', r.id, 'name', v_name, 'enabled', v_en));
  end if;
  return to_jsonb(r);
end;
$$;

create or replace function public.flight_watch_delete(p_token text, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d text; n int;
begin
  d := public.current_driver_id(p_token);
  if d is null then raise exception 'invalid_session' using errcode = '28000'; end if;
  delete from public.flight_watches where id = p_id and driver_id = d;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Bevakningen finns inte' using errcode = '22023'; end if;
  perform public.log(d, 'watch_flight_delete', jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- Bara service_role (edge-funktionen).
create or replace function public.fw_svc_active()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'watches', coalesce((select jsonb_agg(to_jsonb(w)) from private.fw_active_now() w), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object('driver_id', s.driver_id, 'ident', s.ident, 'sched', s.sched, 'state', s.state))
      from public.flight_watch_sent s
      where s.sched > now() - interval '1 day'
        and exists (select 1 from private.fw_active_now() w where w.driver_id = s.driver_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.fw_svc_mark(p_driver text, p_ident text, p_sched timestamptz, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.flight_watch_sent (driver_id, ident, sched, state, updated_at)
  values (p_driver, p_ident, p_sched, coalesce(p_state,'{}'::jsonb), now())
  on conflict (driver_id, ident, sched) do update
    set state = excluded.state, updated_at = now();
end;
$$;

revoke all on function public.flight_watch_list(text) from public;
revoke all on function public.flight_watch_save(text, bigint, jsonb) from public;
revoke all on function public.flight_watch_delete(text, bigint) from public;
revoke all on function public.fw_svc_active() from public, anon, authenticated;
revoke all on function public.fw_svc_mark(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.flight_watch_list(text) to anon, authenticated, service_role;
grant execute on function public.flight_watch_save(text, bigint, jsonb) to anon, authenticated, service_role;
grant execute on function public.flight_watch_delete(text, bigint) to anon, authenticated, service_role;
grant execute on function public.fw_svc_active() to service_role;
grant execute on function public.fw_svc_mark(text, text, timestamptz, jsonb) to service_role;

-- Utöka befintlig tick: rensa även flight_watch_sent och väck edge om det finns aktiva flyg-Bevakningar.
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
  if not exists (select 1 from public.arrival_watches where expires_at > now())
     and not exists (select 1 from private.tw_active_now())
     and not exists (select 1 from private.fw_active_now()) then return 0; end if;
  v_key := private.vault_secret('BEVAKNING_TICK_KEY');
  if coalesce(v_key,'') = '' then return -1; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  resp := extensions.http(('POST', 'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/bevakning',
     array[extensions.http_header('x-tick-key', v_key)], 'application/json', '{"action":"tick"}')::extensions.http_request);
  return resp.status;
exception when others then return -2;
end $function$;
