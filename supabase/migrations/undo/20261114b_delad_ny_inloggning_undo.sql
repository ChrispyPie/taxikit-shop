-- Ångrar 20261114b_delad_ny_inloggning: återställer login, session_actor och session_delad_logout_reason
-- exakt som de låg live 2026-11-14 före ändringen, och tar bort kolumnen client_enhet.
CREATE OR REPLACE FUNCTION public.login(p_id text, p_password text, p_delad boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id text := regexp_replace(coalesce(p_id, ''), '^\s+|\s+$', '', 'g');
  d public.drivers; v_fails int; v_token text; v_role text; v_pw_ok boolean;
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
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.sessions(token_hash, driver_id, via_master) values (private.token_hash(v_token), v_id, false);
  if coalesce(p_delad, false) and not exists (select 1 from private.demo_accounts x where x.driver_id = v_id) then
    update private.sessions
       set delad_enhet = true,
           delad_since = coalesce(created_at, now())
     where token_hash = private.token_hash(v_token);
  end if;
  update public.drivers set logged_in = true, last_login_at = now() where id = v_id;
  perform private.log(v_id, v_role, 'login', v_id, '{}'::jsonb, false);
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
      perform private.delad_enhet_close_session(s.token_hash, v_delad_reason, true);
      raise exception 'invalid_session' using errcode = '28000';
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
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

drop index if exists private.sessions_driver_enhet_idx;
alter table private.sessions drop column if exists client_enhet;
