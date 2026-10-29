-- Ångra 20261029b_logg_utokad. Loggrader som redan skrivits ligger kvar.

drop trigger if exists zz_audit_log on public.forum_posts;
drop trigger if exists zz_audit_log on public.forum_comments;
drop trigger if exists zz_audit_log on public.forum_rules_accept;
drop trigger if exists zz_audit_log on public.companies;
drop trigger if exists zz_audit_log on public.events;
drop trigger if exists zz_audit_log on public.event_comments;
drop trigger if exists zz_audit_log on public.event_subscriptions;
drop trigger if exists zz_audit_log on public.push_subscriptions;
drop trigger if exists zz_audit_log on public.arrival_watches;
drop trigger if exists zz_audit_log on public.prognos_watches;
drop trigger if exists zz_audit_log on public.profile_photos;
drop trigger if exists zz_audit_log on public.trip_datasets;
drop function if exists private.audit_row();
drop function if exists public.admin_log_page(text, integer, timestamptz, bigint, text[], text);
drop function if exists private.log_prune(interval);
drop index if exists public.activity_log_action_created_idx;
drop index if exists public.activity_log_target_created_idx;

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
    -- Demokonto: måste vara aktiverat, inte avslutat och inte äldre än expires_at. Inget undantag för huvudlösenordet.
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
    perform set_config('taxi.demo', dm.driver_id, true);   -- gäller resten av transaktionen (skrivspärr + anonymisering)
    driver_id := dm.demo_of;
    via_master := true;          -- befintliga "bara titta"-spärrar (forum, profilbild, prognos m.m.)
    category := 'standard';      -- aldrig admin/ägare på servern, oavsett demoroll
    return;
  end if;
  if not s.via_master and (not coalesce(v_found, false) or not v_act or v_cat = 'avslutad') then
    raise exception 'invalid_session' using errcode = '28000';
  end if;
  -- glidande utgång: 24 h efter senaste aktivitet (skrivs högst en gång per minut)
  if s.expires_at < now() + interval '24 hours' - interval '1 minute' then
    update private.sessions set expires_at = now() + interval '24 hours' where token_hash = s.token_hash;
  end if;
  driver_id := s.driver_id;
  via_master := s.via_master;
  category := case when coalesce(v_found, false) then private.norm_cat(v_cat) else null end;
end $function$;

CREATE OR REPLACE FUNCTION public.logout(p_token text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  delete from private.sessions where token_hash = private.token_hash(p_token);
  select json_build_object('ok', true);
$function$;
