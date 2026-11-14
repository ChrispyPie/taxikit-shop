-- 20261114b: Delad enhet – ny inloggning ersätter gammal session + stängning som inte rullas tillbaka (t1594u)
--  1) private.sessions.client_enhet = appens enhets-id (huvudet x-taxi-enhet) som sessionen loggade in från.
--     public.login stänger förarens tidigare aktiva sessioner med samma enhets-id innan den nya skapas,
--     så samma platta inte visas som två sessioner. Andra enheter påverkas inte. Saknas huvudet stängs inget.
--  2) private.session_actor skrev "stäng sessionen" och kastade sedan invalid_session i samma anrop, så
--     stängningen rullades tillbaka. Nu kastar den bara felet (med hint delad_pass/delad_stale), och
--     public.session_delad_logout_reason (anropas av appen direkt efter 28000) stänger och sparar orsaken.
--     Timjobbet (delad_enhet_svc_expire) stänger dessutom som förut.
-- Ångra: supabase/migrations/undo/20261114b_delad_ny_inloggning_undo.sql

alter table private.sessions add column if not exists client_enhet text;
create index if not exists sessions_driver_enhet_idx
  on private.sessions (driver_id, client_enhet) where client_enhet is not null;
comment on column private.sessions.client_enhet is
  'Appens enhets-id (x-taxi-enhet) vid inloggning. Ny inloggning med samma förare + enhet stänger äldre sessioner.';

CREATE OR REPLACE FUNCTION public.login(p_id text, p_password text, p_delad boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id text := regexp_replace(coalesce(p_id, ''), '^\s+|\s+$', '', 'g');
  d public.drivers; v_fails int; v_token text; v_role text; v_pw_ok boolean;
  v_enhet text; v_closed int := 0;
begin
  if v_id !~ '^[A-Za-z0-9_-]{1,32}$' then return json_build_object('ok', false, 'error', 'bad_id'); end if;
  if upper(v_id) ~ '^DEMO[0-9]+$' then v_id := upper(v_id); end if;   -- demo-ID:n skrivs med versaler
  select count(*) into v_fails from public.activity_log
   where action = 'login_failed' and target_id = v_id and created_at > now() - interval '15 minutes';
  if v_fails >= 10 then return json_build_object('ok', false, 'error', 'locked'); end if;

  -- Demokonto som gått ut eller avslutats: neka direkt (t371u)
  if exists (select 1 from private.demo_accounts x where upper(x.driver_id) = upper(v_id) and (x.ended_at is not null or x.expires_at <= now())) then
    perform private.log(v_id, null, 'login_failed', v_id, '{"reason":"demo_ended"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'demo_ended');
  end if;

  select * into d from public.drivers where id = v_id;
  v_role := case when d.id is null then null else private.norm_cat(d.category) end;
  v_pw_ok := d.id is not null and d.password_hash is not null and coalesce(p_password, '') <> ''
             and extensions.crypt(private.norm_pw(p_password), d.password_hash) = d.password_hash;

  -- Fel lösenord, okänt id eller konto utan lösenord: samma svar, så att ingen kan se om ett konto finns.
  if not v_pw_ok then
    perform private.log(v_id, v_role, 'login_failed', v_id, jsonb_build_object('reason',
      case when d.id is null then 'unknown_id'
           when d.password_hash is null and coalesce(d.activated, false) then 'pending'
           when d.password_hash is null then 'inactive'
           else 'wrong_password' end), false);
    return json_build_object('ok', false, 'error', 'wrong');
  elsif not coalesce(d.activated, false) then
    perform private.log(v_id, v_role, 'login_failed', v_id, '{"reason":"inactive"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'inactive');
  elsif d.category = 'avslutad' then
    perform private.log(v_id, v_role, 'login_failed', v_id, '{"reason":"ended"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'ended');
  end if;

  delete from private.sessions where expires_at < now();
  -- Ny inloggning på samma enhet stänger förarens tidigare sessioner där (t1594u).
  -- Enheten känns igen på huvudet x-taxi-enhet (enhet.js). Utan huvud stängs inget.
  v_enhet := (private.request_meta()).device_id;
  if v_enhet is not null then
    with gamla as (
      update private.sessions s
         set expires_at = now()
       where s.driver_id = v_id
         and s.client_enhet = v_enhet
         and s.expires_at > now()
      returning 1
    )
    select count(*) into v_closed from gamla;
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.sessions(token_hash, driver_id, via_master, client_enhet)
    values (private.token_hash(v_token), v_id, false, v_enhet);
  if coalesce(p_delad, false) and not exists (select 1 from private.demo_accounts x where x.driver_id = v_id) then
    update private.sessions
       set delad_enhet = true,
           delad_since = coalesce(created_at, now())
     where token_hash = private.token_hash(v_token);
  end if;
  update public.drivers set logged_in = true, last_login_at = now() where id = v_id;
  perform private.log(v_id, v_role, 'login', v_id,
    case when v_closed > 0 then jsonb_build_object('ersatte_sessioner', v_closed) else '{}'::jsonb end, false);
  return json_build_object('ok', true, 'token', v_token, 'via_master', false,
    'driver', json_build_object('id', v_id, 'category', v_role, 'first_name', d.first_name, 'last_name', d.last_name));
end
$function$;

CREATE OR REPLACE FUNCTION private.session_actor(p_token text, OUT driver_id text, OUT category text, OUT via_master boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s private.sessions; v_cat text; v_act boolean; v_found boolean; dm private.demo_accounts; t_cat text; t_act boolean; v_delad_reason text;
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
  if coalesce(s.delad_enhet, false) then
    v_delad_reason := private.delad_enhet_reason(s.driver_id, coalesce(s.delad_since, s.created_at));
    if v_delad_reason is not null then
      -- Ingen skrivning här: raise rullar tillbaka allt i samma anrop. Sessionen stängs av
      -- session_delad_logout_reason (som appen anropar direkt efter 28000) och av timjobbet.
      raise exception 'invalid_session' using errcode = '28000', hint = 'delad_' || v_delad_reason;
    end if;
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

CREATE OR REPLACE FUNCTION public.session_delad_logout_reason(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_hash text;
  v_reason text;
  v_at timestamptz;
  v_ses private.sessions;
  v_why text;
begin
  if coalesce(p_token, '') = '' then
    return json_build_object('ended', false);
  end if;
  v_hash := private.token_hash(p_token);
  -- Stäng här (i ett anrop som inte kastar fel) en delad session som session_actor nekade,
  -- så att stängningen, loggraden och push-notisen sparas (t1594u).
  select * into v_ses from private.sessions x
   where x.token_hash = v_hash and x.expires_at > now() and coalesce(x.delad_enhet, false);
  if found then
    v_why := private.delad_enhet_reason(v_ses.driver_id, coalesce(v_ses.delad_since, v_ses.created_at));
    if v_why is not null then
      perform private.delad_enhet_close_session(v_hash, v_why, true);
    end if;
  end if;
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
$function$;
