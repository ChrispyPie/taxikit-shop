-- Ångra 20261111f_delad_enhet_session.sql
-- Påverkar inte public.pass_ended_since (den hör till 20261110c).
select cron.unschedule(jobid) from cron.job where jobname = 'taxikit-delad-enhet-expire';
drop function if exists public.session_delad_logout_reason(text);
drop function if exists public.session_set_delad_enhet(text, boolean, text);
drop function if exists public.session_set_delad_enhet(text, boolean);
drop function if exists private.delad_enhet_expire();
drop function if exists private.delad_enhet_notify(text, text, timestamptz, text[]);
drop function if exists private.delad_enhet_logout_text(text, timestamptz);
drop function if exists private.delad_enhet_scrape_at();
drop function if exists private.delad_enhet_stale_label();
drop function if exists private.delad_enhet_stale_after();
drop function if exists private.delad_enhet_max_age();
drop table if exists private.delad_logouts;
alter table private.sessions drop column if exists delad_logout_at;
alter table private.sessions drop column if exists delad_logout_reason;
alter table private.sessions drop column if exists delad_endpoint;
alter table private.sessions drop column if exists delad_since;
alter table private.sessions drop column if exists delad_enhet;
alter table public.push_subscriptions drop column if exists token_hash;

drop function if exists public.logout_my_session(text, uuid);
drop function if exists public.list_my_sessions(text);
drop function if exists public.session_set_device(text, text, integer, integer);
drop function if exists private.session_device_label(text, integer, integer, boolean);
drop index if exists private.sessions_device_id_uidx;
alter table private.sessions drop column if exists device_label;
alter table private.sessions drop column if exists device_ua;
alter table private.sessions drop column if exists last_seen_at;
alter table private.sessions drop column if exists device_id;

-- Återställ session_actor som den var före den här migrationen (20261029b + live).
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
      update private.sessions set expires_at = least(now() + interval '24 hours', dm.expires_at) where token_hash = s.token_hash;
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
    update private.sessions set expires_at = now() + interval '24 hours' where token_hash = s.token_hash;
  end if;
  driver_id := s.driver_id;
  via_master := s.via_master;
  category := case when coalesce(v_found, false) then private.norm_cat(v_cat) else null end;
  perform set_config('taxi.actor', driver_id, true);
  perform set_config('taxi.actor_role', coalesce(category, ''), true);
  perform set_config('taxi.via_master', case when via_master then 'on' else 'off' end, true);
end $function$;

-- Återställ push_save som den var före den här migrationen.
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
  insert into public.push_subscriptions (driver_id, endpoint, p256dh, auth, ua)
  values (a.driver_id, p_endpoint, p_p256dh, p_auth, left(p_ua, 200))
  on conflict (endpoint) do update set driver_id = excluded.driver_id, p256dh = excluded.p256dh, auth = excluded.auth,
    ua = excluded.ua, fail_count = 0;
  delete from public.push_subscriptions where driver_id = a.driver_id and id not in
    (select id from public.push_subscriptions where driver_id = a.driver_id order by created_at desc limit 5);
  return json_build_object('ok', true, 'devices', (select count(*) from public.push_subscriptions where driver_id = a.driver_id));
end
$$;
