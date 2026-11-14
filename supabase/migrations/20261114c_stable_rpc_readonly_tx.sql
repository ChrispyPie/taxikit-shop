-- 20261114c: STABLE PostgREST-RPC som går via private.session_actor fick HTTP 405
-- (PostgREST error=25006, read_only_sql_transaction) när session_actor skulle
-- uppdatera last_seen_at eller förlänga expires_at (efter mer än en minut).
-- PostgREST kör STABLE-funktioner i en transaktion som bara får läsa, så UPDATE
-- faller. Då visades "Det gick inte. Kontrollera nätet och försök igen" i
-- Admin › Ärenden (case_admin_list) trots att övriga anrop i samma laddning
-- lyckades och listan från förra gången fortfarande syntes. Samma fel sågs på
-- case_get och notis_feed.
--  1) Hoppa över skrivningen i session_actor när transaktionen är read-only.
--  2) Markera de publika RPC:erna som faktiskt anropar session_actor som VOLATILE
--     så last_seen/expires fortfarande uppdateras vid listning.
-- Ångra: supabase/migrations/undo/20261114c_stable_rpc_readonly_tx_undo.sql

CREATE OR REPLACE FUNCTION private.session_actor(p_token text, OUT driver_id text, OUT category text, OUT via_master boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s private.sessions; v_cat text; v_act boolean; v_found boolean; dm private.demo_accounts; t_cat text; t_act boolean; v_delad_reason text; v_ro boolean;
begin
  v_ro := current_setting('transaction_read_only') = 'on';
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
    if not v_ro and s.expires_at < now() + interval '24 hours' - interval '1 minute' then
      update private.sessions
         set expires_at = least(now() + interval '24 hours', dm.expires_at),
             last_seen_at = now()
       where token_hash = s.token_hash;
    elsif not v_ro and (s.last_seen_at is null or s.last_seen_at < now() - interval '1 minute') then
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
  if not v_ro and s.expires_at < now() + interval '24 hours' - interval '1 minute' then
    update private.sessions
       set expires_at = now() + interval '24 hours',
           last_seen_at = now()
     where token_hash = s.token_hash;
  elsif not v_ro and (s.last_seen_at is null or s.last_seen_at < now() - interval '1 minute') then
    update private.sessions set last_seen_at = now() where token_hash = s.token_hash;
  end if;
  driver_id := s.driver_id;
  via_master := s.via_master;
  category := case when coalesce(v_found, false) then private.norm_cat(v_cat) else null end;
  perform set_config('taxi.actor', driver_id, true);
  perform set_config('taxi.actor_role', coalesce(category, ''), true);
  perform set_config('taxi.via_master', case when via_master then 'on' else 'off' end, true);
end $function$;

-- Publika RPC som anropar session_actor (direkt eller via bil_actor/require_admin).
-- VOLATILE så PostgREST inte sätter transaktionen i bara-läs-läge.
ALTER FUNCTION public.case_admin_list(text, integer) VOLATILE;
ALTER FUNCTION public.case_inbox(text, integer) VOLATILE;
ALTER FUNCTION public.case_get(text, text, bigint) VOLATILE;
ALTER FUNCTION public.notis_feed(text, integer) VOLATILE;
ALTER FUNCTION public.get_leaderboard_archive(text, date, date) VOLATILE;
ALTER FUNCTION public.get_trip_archive(text, integer, integer) VOLATILE;
ALTER FUNCTION public.admin_driver_last_drive(text) VOLATILE;
