-- 20261114a: Delad enhet — utloggning direkt efter timkörningen + ingen falsk "stale" mitt i passet (t1591u).
--
-- 1) Timkörningen (sync_supabase.py) anropar public.delad_enhet_svc_expire() via PostgREST efter ingest.
--    Varje anrop har gett HTTP 400 "DELETE requires a WHERE clause" (pg_safeupdate är på för PostgREST):
--    private.delad_enhet_expire() tömmer sin temptabell med "delete from _delad_expired;". Därför har bara
--    reserven pg_cron (minut 20) loggat ut, t.ex. 06:20. Fix: "delete ... where true". Samma beteende i övrigt.
-- 2) private.delad_enhet_stale_after() höjs från 1 till 2 timmar. Timkörningen kommer ca minut 6–9 och hoppar
--    ibland över en hämtning; med 1 timme räknades servern som "tyst" (stale) mitt i passet: 14/11 kl. 03:07
--    (get_me 403 på plattan) och 04:20 (cron stängde plattans sessioner med reason=stale).
-- Inga tabeller eller data ändras. Ångra: supabase/migrations/undo/20261114a_delad_enhet_expire_fix_undo.sql

CREATE OR REPLACE FUNCTION private.delad_enhet_expire()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n int := 0;
  r record;
begin
  delete from private.delad_logouts where at < now() - interval '7 days';

  create temporary table if not exists _delad_expired (
    driver_id text,
    token_hash text,
    delad_endpoint text,
    reason text,
    at timestamptz
  ) on commit drop;
  delete from _delad_expired where true;   -- WHERE krävs av pg_safeupdate när timkörningen anropar via PostgREST

  with due as (
    select s.token_hash,
           s.driver_id,
           s.delad_endpoint,
           private.delad_enhet_reason(s.driver_id, coalesce(s.delad_since, s.created_at)) as reason
      from private.sessions s
     where s.delad_enhet
       and s.expires_at > now()
       and not exists (
         select 1 from private.demo_accounts d where d.driver_id = s.driver_id
       )
  ),
  upd as (
    update private.sessions s
       set expires_at = now(),
           delad_logout_at = now(),
           delad_logout_reason = due.reason
      from due
     where s.token_hash = due.token_hash
       and due.reason is not null
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
$function$;

CREATE OR REPLACE FUNCTION private.delad_enhet_stale_after()
 RETURNS interval
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select interval '2 hours';
$function$;
