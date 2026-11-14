-- Ångra 20261114c: återställ session_actor (utan hopp över skrivning i read-only)
-- och de publika RPC:ernas STABLE-markering.

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


ALTER FUNCTION public.case_admin_list(text, integer) STABLE;
ALTER FUNCTION public.case_inbox(text, integer) STABLE;
ALTER FUNCTION public.case_get(text, text, bigint) STABLE;
ALTER FUNCTION public.notis_feed(text, integer) STABLE;
ALTER FUNCTION public.get_leaderboard_archive(text, date, date) STABLE;
ALTER FUNCTION public.get_trip_archive(text, integer, integer) STABLE;
ALTER FUNCTION public.admin_driver_last_drive(text) STABLE;
