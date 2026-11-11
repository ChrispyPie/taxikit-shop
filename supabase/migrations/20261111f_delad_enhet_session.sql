-- 20261111f: Delad enhet — utloggning på servern.
--
-- Bakgrund: utloggningen kördes bara i webbläsaren (var 5:e minut och när
-- appen blev synlig). Om plattskärmen är av körs ingen JavaScript, så
-- sessionen låg kvar tills någon öppnade appen eller stängde den för hand.
--
-- Additivt:
--  * private.sessions.delad_enhet, delad_since, delad_endpoint,
--    delad_logout_reason, delad_logout_at
--  * private.delad_logouts (skäl + tid per token_hash, överlever städning av
--    utgångna sessioner) så platta kan fråga varför den loggades ut
--  * public.push_subscriptions.token_hash — kopplar push-enhet till session
--  * RPC public.session_set_delad_enhet(p_token, p_on, p_endpoint default null)
--  * RPC public.session_delad_logout_reason(p_token) — fungerar med utgången token
--  * private.delad_enhet_stale_after() — EN konstant, standard 1 timme.
--    Ändra bara intervallet i den funktionen.
--  * private.delad_enhet_expire() — stänger Delad enhet-sessioner när
--      (1) ett avslutat pass finns i public.shifts (samma regel som
--          public.pass_ended_since), eller
--      (2) dataset current inte har uppdaterats på
--          private.delad_enhet_stale_after() (timkörningen tyst/nere)
--    Sparar skäl + tid, skriver en Notis på kontot och skickar push till
--    förarens övriga inloggade enheter (inte den utloggade plattan).
--  * pg_cron 'taxikit-delad-enhet-expire' var 15:e minut
-- Personliga sessioner (delad_enhet = false) och demokonton påverkas inte.
-- Ångra: supabase/migrations/undo/20261111f_delad_enhet_session_undo.sql

alter table private.sessions
  add column if not exists delad_enhet boolean not null default false;
alter table private.sessions
  add column if not exists delad_since timestamptz;
alter table private.sessions
  add column if not exists delad_endpoint text;
alter table private.sessions
  add column if not exists delad_logout_reason text;
alter table private.sessions
  add column if not exists delad_logout_at timestamptz;

comment on column private.sessions.delad_enhet is
  'Sant när klienten slagit på Delad enhet för just den här sessionen (t.ex. platta i bilen).';
comment on column private.sessions.delad_since is
  'Tidpunkt som pass-slut jämförs mot (normalt inloggningen). Null när Delad enhet är av.';
comment on column private.sessions.delad_endpoint is
  'Push-endpoint för den här Delad enhet-sessionen, så utloggnings-push inte går till plattan.';
comment on column private.sessions.delad_logout_reason is
  'pass = passet avslutat, stale = servern har inte uppdaterats i tid.';
comment on column private.sessions.delad_logout_at is
  'När Delad enhet-sessionen stängdes automatiskt (Europe/Stockholm i visningstext).';

create table if not exists private.delad_logouts (
  token_hash text primary key,
  reason text not null,
  at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions
  add column if not exists token_hash text;

-- Ändra här hur länge timkörningen får vara tyst innan Delad enhet-sessioner stängs.
create or replace function private.delad_enhet_stale_after()
returns interval
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select interval '1 hour';
$$;

revoke all on function private.delad_enhet_stale_after() from public, anon, authenticated;

create or replace function private.delad_enhet_stale_label()
returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_iv interval := private.delad_enhet_stale_after();
  v_sec numeric := extract(epoch from v_iv);
  v_n int;
begin
  if v_sec is null or v_sec <= 0 then
    return '1 timme';
  end if;
  if v_sec % 3600 = 0 then
    v_n := (v_sec / 3600)::int;
    return v_n::text || case when v_n = 1 then ' timme' else ' timmar' end;
  end if;
  if v_sec % 60 = 0 then
    v_n := (v_sec / 60)::int;
    return v_n::text || ' minuter';
  end if;
  return '1 timme';
end
$$;

revoke all on function private.delad_enhet_stale_label() from public, anon, authenticated;

create or replace function private.delad_enhet_scrape_at()
returns timestamptz
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    case
      when d.meta->>'last_updated' ~ '^\d{4}-\d\d-\d\dT'
      then (d.meta->>'last_updated')::timestamptz
    end,
    d.updated_at
  )
  from public.trip_datasets d
  where d.name = 'current';
$$;

revoke all on function private.delad_enhet_scrape_at() from public, anon, authenticated;

create or replace function private.delad_enhet_logout_text(p_reason text, p_at timestamptz)
returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_kl text;
  v_why text;
begin
  v_kl := to_char(coalesce(p_at, now()) at time zone 'Europe/Stockholm', 'HH24:MI');
  if p_reason = 'stale' then
    v_why := 'servern har inte uppdaterats på ' || private.delad_enhet_stale_label();
  elsif p_reason = 'remote' then
    v_why := 'utloggad från annan enhet';
  else
    v_why := 'passet avslutat';
  end if;
  return 'Du loggades ut automatiskt kl ' || v_kl || ' – ' || v_why;
end
$$;

revoke all on function private.delad_enhet_logout_text(text, timestamptz) from public, anon, authenticated;

create or replace function private.delad_enhet_notify(p_driver text, p_reason text, p_at timestamptz, p_skip_endpoints text[])
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_title text := 'Utloggad från delad enhet';
  v_body text;
  v_key text;
  v_tick text;
  resp extensions.http_response;
begin
  if coalesce(btrim(p_driver), '') = '' then
    return;
  end if;
  v_body := private.delad_enhet_logout_text(p_reason, p_at);
  v_key := 'delad|' || coalesce(p_reason, 'pass') || '|' || to_char(coalesce(p_at, now()) at time zone 'Europe/Stockholm', 'YYYYMMDDHH24MI');
  insert into public.push_notices (driver_id, nkey, kind, tag, title, body, created_at)
  values (p_driver, left(v_key, 200), 'konto', 'konto-delad', left(v_title, 200), left(v_body, 600), clock_timestamp())
  on conflict (driver_id, nkey) do nothing;
  v_tick := private.vault_secret('BEVAKNING_TICK_KEY');
  if coalesce(v_tick, '') = '' then
    return;
  end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
    resp := extensions.http((
      'POST',
      'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/bevakning',
      array[extensions.http_header('x-tick-key', v_tick)],
      'application/json',
      json_build_object(
        'action', 'notify',
        'driver', p_driver,
        'title', v_title,
        'body', v_body,
        'tag', 'konto-delad',
        'nkey', v_key,
        'skip_endpoints', coalesce(to_jsonb(p_skip_endpoints), '[]'::jsonb)
      )::text
    )::extensions.http_request);
  exception when others then
    null;
  end;
end
$$;

revoke all on function private.delad_enhet_notify(text, text, timestamptz, text[]) from public, anon, authenticated;

drop function if exists private.delad_enhet_max_age();

create or replace function private.delad_enhet_expire()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  n int := 0;
  v_stale boolean;
  r record;
begin
  delete from private.delad_logouts where at < now() - interval '7 days';

  v_stale := private.delad_enhet_scrape_at() is null
             or private.delad_enhet_scrape_at() <= now() - private.delad_enhet_stale_after();

  create temporary table if not exists _delad_expired (
    driver_id text,
    token_hash text,
    delad_endpoint text,
    reason text,
    at timestamptz
  ) on commit drop;
  delete from _delad_expired;

  with upd as (
    update private.sessions s
       set expires_at = now(),
           delad_logout_at = now(),
           delad_logout_reason = case
             when exists (
               select 1
                 from public.shifts sh
                where sh.dataset = 'current'
                  and coalesce(sh.forar, sh.data->>'forar') = s.driver_id
                  and btrim(coalesce(sh.data->>'passnr', '')) <> ''
                  and btrim(coalesce(sh.data->>'start', '')) <> ''
                  and btrim(coalesce(sh.data->>'slut', '')) <> ''
                  and private.shift_ts(sh.data->>'slut') is not null
                  and (private.shift_ts(sh.data->>'slut') at time zone 'Europe/Stockholm')
                        > coalesce(s.delad_since, s.created_at)
                  and (private.shift_ts(sh.data->>'slut') at time zone 'Europe/Stockholm')
                        <= now() + interval '15 minutes'
             ) then 'pass'
             else 'stale'
           end
     where s.delad_enhet
       and s.expires_at > now()
       and not exists (
         select 1 from private.demo_accounts d where d.driver_id = s.driver_id
       )
       and (
         v_stale
         or exists (
           select 1
             from public.shifts sh
            where sh.dataset = 'current'
              and coalesce(sh.forar, sh.data->>'forar') = s.driver_id
              and btrim(coalesce(sh.data->>'passnr', '')) <> ''
              and btrim(coalesce(sh.data->>'start', '')) <> ''
              and btrim(coalesce(sh.data->>'slut', '')) <> ''
              and private.shift_ts(sh.data->>'slut') is not null
              and (private.shift_ts(sh.data->>'slut') at time zone 'Europe/Stockholm')
                    > coalesce(s.delad_since, s.created_at)
              and (private.shift_ts(sh.data->>'slut') at time zone 'Europe/Stockholm')
                    <= now() + interval '15 minutes'
         )
       )
    returning s.driver_id, s.token_hash, s.delad_endpoint, s.delad_logout_reason as reason, s.delad_logout_at as at
  )
  insert into _delad_expired (driver_id, token_hash, delad_endpoint, reason, at)
  select driver_id, token_hash, delad_endpoint, reason, at from upd;

  get diagnostics n = row_count;

  insert into private.delad_logouts (token_hash, reason, at)
  select e.token_hash, e.reason, e.at
    from _delad_expired e
  on conflict (token_hash) do update
     set reason = excluded.reason, at = excluded.at;

  for r in
    select e.driver_id,
           case when bool_or(e.reason = 'pass') then 'pass' else min(e.reason) end as reason,
           min(e.at) as at,
           array_remove(array_agg(distinct x.endpoint), null) as skip_endpoints
      from _delad_expired e
      left join lateral (
        select e.delad_endpoint as endpoint
        union
        select p.endpoint
          from public.push_subscriptions p
         where p.token_hash = e.token_hash
      ) x on true
     group by e.driver_id
  loop
    perform private.delad_enhet_notify(r.driver_id, r.reason, r.at, r.skip_endpoints);
  end loop;

  return n;
end
$$;

revoke all on function private.delad_enhet_expire() from public, anon, authenticated;

drop function if exists public.session_set_delad_enhet(text, boolean);

create or replace function public.session_set_delad_enhet(p_token text, p_on boolean, p_endpoint text default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s_hash text;
  v_ep text;
begin
  perform private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object('ok', true, 'delad_enhet', false);
  end if;
  s_hash := private.token_hash(p_token);
  v_ep := null;
  if coalesce(p_endpoint, '') ~ '^https://' and length(p_endpoint) <= 1000 then
    v_ep := p_endpoint;
  end if;
  if coalesce(p_on, false) then
    update private.sessions
       set delad_enhet = true,
           delad_since = coalesce(delad_since, created_at, now()),
           delad_endpoint = coalesce(v_ep, delad_endpoint),
           delad_logout_reason = null,
           delad_logout_at = null
     where token_hash = s_hash;
  else
    update private.sessions
       set delad_enhet = false,
           delad_since = null,
           delad_endpoint = null
     where token_hash = s_hash;
  end if;
  return json_build_object('ok', true, 'delad_enhet', coalesce(p_on, false));
end
$$;

revoke all on function public.session_set_delad_enhet(text, boolean, text) from public;
grant execute on function public.session_set_delad_enhet(text, boolean, text) to anon, authenticated;

create or replace function public.session_delad_logout_reason(p_token text)
returns json
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_hash text;
  v_reason text;
  v_at timestamptz;
begin
  if coalesce(p_token, '') = '' then
    return json_build_object('ended', false);
  end if;
  v_hash := private.token_hash(p_token);
  select l.reason, l.at into v_reason, v_at
    from private.delad_logouts l
   where l.token_hash = v_hash;
  if v_reason is null then
    select s.delad_logout_reason, s.delad_logout_at into v_reason, v_at
      from private.sessions s
     where s.token_hash = v_hash
       and s.delad_logout_at is not null
       and s.expires_at <= now();
  end if;
  if v_reason is null or v_at is null then
    return json_build_object('ended', false);
  end if;
  return json_build_object(
    'ended', true,
    'reason', v_reason,
    'at', v_at,
    'text', private.delad_enhet_logout_text(v_reason, v_at)
  );
end
$$;

revoke all on function public.session_delad_logout_reason(text) from public;
grant execute on function public.session_delad_logout_reason(text) to anon, authenticated;

create or replace function public.push_save(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(p_endpoint,'') !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = ''
     or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'bad_input' using errcode = '22023'; end if;
  insert into public.push_subscriptions (driver_id, endpoint, p256dh, auth, ua, token_hash)
  values (a.driver_id, p_endpoint, p_p256dh, p_auth, left(p_ua, 200), private.token_hash(p_token))
  on conflict (endpoint) do update set driver_id = excluded.driver_id, p256dh = excluded.p256dh, auth = excluded.auth,
    ua = excluded.ua, fail_count = 0, token_hash = excluded.token_hash;
  delete from public.push_subscriptions where driver_id = a.driver_id and id not in
    (select id from public.push_subscriptions where driver_id = a.driver_id order by created_at desc limit 5);
  return json_build_object('ok', true, 'devices', (select count(*) from public.push_subscriptions where driver_id = a.driver_id));
end
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'taxikit-delad-enhet-expire';
select cron.schedule(
  'taxikit-delad-enhet-expire',
  '*/15 * * * *',
  $c$set statement_timeout = '30s'; select private.delad_enhet_expire()$c$
);


-- Enhetslista på startsidan: etikett, senast sedd, utloggning från annan enhet.
alter table private.sessions
  add column if not exists device_id uuid;
update private.sessions set device_id = gen_random_uuid() where device_id is null;
alter table private.sessions
  alter column device_id set default gen_random_uuid();
create unique index if not exists sessions_device_id_uidx on private.sessions (device_id);

alter table private.sessions
  add column if not exists last_seen_at timestamptz;
update private.sessions set last_seen_at = coalesce(last_seen_at, created_at, now()) where last_seen_at is null;

alter table private.sessions
  add column if not exists device_ua text;
alter table private.sessions
  add column if not exists device_label text;

comment on column private.sessions.device_id is
  'Synligt id för enheten i listan Inloggade enheter. Inte token_hash.';
comment on column private.sessions.last_seen_at is
  'Senaste aktivitet (uppdateras högst en gång per minut via session_actor).';
comment on column private.sessions.device_ua is
  'Kort user-agent-sammanfattning, ingen IP.';
comment on column private.sessions.device_label is
  'Visningsetikett, t.ex. 📱 Telefon eller 🚕 Platta.';

create or replace function private.session_device_label(p_ua text, p_width integer, p_height integer, p_delad boolean)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  ua text := lower(coalesce(p_ua, ''));
  w int := coalesce(p_width, 0);
  h int := coalesce(p_height, 0);
  short int;
begin
  if coalesce(p_delad, false) then
    return '🚕 Platta';
  end if;
  if ua ~ 'ipad|tablet|kindle|playbook' then
    return '🚕 Platta';
  end if;
  -- Android utan "mobile" är ofta en platta
  if ua ~ 'android' and ua !~ 'mobile' then
    return '🚕 Platta';
  end if;
  if ua ~ 'iphone|ipod|mobile|android' then
    return '📱 Telefon';
  end if;
  short := least(w, h);
  if w > 0 and h > 0 and ((w >= 800 and h <= 800) or (h >= 800 and w <= 800)) and greatest(w, h) >= 800 then
    return '🚕 Platta';
  end if;
  if (w > 0 and w <= 700) or (short > 0 and short <= 500) then
    return '📱 Telefon';
  end if;
  if w >= 1100 and h >= 700 then
    return '💻 Dator';
  end if;
  if ua ~ 'windows|macintosh|linux' and ua !~ 'mobile|android|iphone' then
    return '💻 Dator';
  end if;
  return '📱 Telefon';
end
$$;

revoke all on function private.session_device_label(text, integer, integer, boolean) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.session_actor(p_token text, OUT driver_id text, OUT category text, OUT via_master boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s private.sessions; v_cat text; v_act boolean; v_found boolean; dm private.demo_accounts; t_cat text; t_act boolean;
begin
  select * into s from private.sessions
   where token_hash = private.token_hash(p_token) and expires_at > now();
  if not found then raise exception 'invalid_session' using errcode = '28000'; end if;
  select d.category, coalesce(d.activated, false), true into v_cat, v_act, v_found
    from public.drivers d where d.id = s.driver_id;
  select * into dm from private.demo_accounts x where x.driver_id = s.driver_id;
  if dm.driver_id is not null then
    if dm.ended_at is not null or dm.expires_at <= now() or not coalesce(v_found, false) or not v_act then
      raise exception 'invalid_session' using errcode = '28000', hint = 'demo_ended';
    end if;
    select d.category, coalesce(d.activated, false) into t_cat, t_act from public.drivers d where d.id = dm.demo_of;
    if t_cat is null or not t_act or t_cat = 'avslutad' then
      raise exception 'invalid_session' using errcode = '28000';
    end if;
    if s.expires_at < now() + interval '24 hours' - interval '1 minute' then
      update private.sessions
         set expires_at = least(now() + interval '24 hours', dm.expires_at),
             last_seen_at = now()
       where token_hash = s.token_hash;
    elsif s.last_seen_at is null or s.last_seen_at < now() - interval '1 minute' then
      update private.sessions set last_seen_at = now() where token_hash = s.token_hash;
    end if;
    perform set_config('taxi.demo', dm.driver_id, true);
    driver_id := dm.demo_of;
    via_master := true;
    category := 'standard';
    return;
  end if;
  if not s.via_master and (not coalesce(v_found, false) or not v_act or v_cat = 'avslutad') then
    raise exception 'invalid_session' using errcode = '28000';
  end if;
  if s.expires_at < now() + interval '24 hours' - interval '1 minute' then
    update private.sessions
       set expires_at = now() + interval '24 hours',
           last_seen_at = now()
     where token_hash = s.token_hash;
  elsif s.last_seen_at is null or s.last_seen_at < now() - interval '1 minute' then
    update private.sessions set last_seen_at = now() where token_hash = s.token_hash;
  end if;
  driver_id := s.driver_id;
  via_master := s.via_master;
  category := case when coalesce(v_found, false) then private.norm_cat(v_cat) else null end;
  perform set_config('taxi.actor', driver_id, true);
  perform set_config('taxi.actor_role', coalesce(category, ''), true);
  perform set_config('taxi.via_master', case when via_master then 'on' else 'off' end, true);
end $function$;

create or replace function public.session_set_device(p_token text, p_ua text default null, p_width integer default null, p_height integer default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s_hash text;
  v_label text;
  v_delad boolean;
  v_id uuid;
begin
  perform private.session_actor(p_token);
  s_hash := private.token_hash(p_token);
  select delad_enhet into v_delad from private.sessions where token_hash = s_hash;
  v_label := private.session_device_label(p_ua, p_width, p_height, coalesce(v_delad, false));
  update private.sessions
     set device_ua = left(nullif(btrim(coalesce(p_ua, '')), ''), 200),
         device_label = v_label,
         last_seen_at = now()
   where token_hash = s_hash
   returning device_id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'label', v_label);
end
$$;

revoke all on function public.session_set_device(text, text, integer, integer) from public;
grant execute on function public.session_set_device(text, text, integer, integer) to anon, authenticated;

create or replace function public.list_my_sessions(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s_hash text;
  v_driver text;
  v_list json;
begin
  perform private.session_actor(p_token);
  s_hash := private.token_hash(p_token);
  select driver_id into v_driver from private.sessions where token_hash = s_hash;
  select coalesce(json_agg(x.o order by (x.o->>'current')::boolean desc, (x.o->>'last_seen') desc), '[]'::json)
    into v_list
    from (
      select json_build_object(
               'id', se.device_id,
               'label', coalesce(nullif(se.device_label, ''), private.session_device_label(se.device_ua, null, null, se.delad_enhet)),
               'last_seen', coalesce(se.last_seen_at, se.created_at),
               'current', (se.token_hash = s_hash),
               'delad', coalesce(se.delad_enhet, false)
             ) as o
        from private.sessions se
       where se.driver_id = v_driver
         and se.expires_at > now()
    ) x;
  return json_build_object('ok', true, 'devices', v_list);
end
$$;

revoke all on function public.list_my_sessions(text) from public;
grant execute on function public.list_my_sessions(text) to anon, authenticated;

create or replace function public.logout_my_session(p_token text, p_device_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s_hash text;
  v_driver text;
  t private.sessions;
begin
  perform private.session_actor(p_token);
  if private.is_demo() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  s_hash := private.token_hash(p_token);
  select driver_id into v_driver from private.sessions where token_hash = s_hash;
  select * into t from private.sessions
   where device_id = p_device_id and driver_id = v_driver and expires_at > now();
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if t.token_hash = s_hash then
    return json_build_object('ok', false, 'error', 'this_device');
  end if;
  update private.sessions
     set expires_at = now(),
         delad_logout_reason = 'remote',
         delad_logout_at = now()
   where token_hash = t.token_hash;
  insert into private.delad_logouts (token_hash, reason, at)
  values (t.token_hash, 'remote', now())
  on conflict (token_hash) do update set reason = excluded.reason, at = excluded.at;
  return json_build_object('ok', true);
end
$$;

revoke all on function public.logout_my_session(text, uuid) from public;
grant execute on function public.logout_my_session(text, uuid) to anon, authenticated;
