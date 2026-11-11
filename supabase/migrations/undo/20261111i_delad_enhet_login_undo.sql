-- Ångra 20261111i_delad_enhet_login.sql
-- Återställer login, session_actor, delad_enhet_expire och cron som de var före den här migrationen.
-- Tar bort de nya hjälpfunktionerna. Påverkar inte tabeller eller 20261111f.

select cron.unschedule(jobid) from cron.job where jobname = 'taxikit-delad-enhet-expire';
select cron.schedule(
  'taxikit-delad-enhet-expire',
  '*/15 * * * *',
  $c$set statement_timeout = '30s'; select private.delad_enhet_expire()$c$
);

drop function if exists private.delad_enhet_close_session(text, text, boolean);
drop function if exists private.delad_enhet_reason(text, timestamptz);

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

drop function if exists public.login(text, text, boolean);

create or replace function public.login(p_id text, p_password text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
  update public.drivers set logged_in = true, last_login_at = now() where id = v_id;
  perform private.log(v_id, v_role, 'login', v_id, '{}'::jsonb, false);
  return json_build_object('ok', true, 'token', v_token, 'via_master', false,
    'driver', json_build_object('id', v_id, 'category', v_role, 'first_name', d.first_name, 'last_name', d.last_name));
end
$$;

revoke all on function public.login(text, text) from public;
grant execute on function public.login(text, text) to anon, authenticated;

