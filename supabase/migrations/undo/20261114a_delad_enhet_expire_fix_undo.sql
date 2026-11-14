-- Ångra 20261114a: återställ exakt de tidigare definitionerna (hämtade från databasen 2026-11-14 07:10).

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
  delete from _delad_expired;

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
  select interval '1 hour';
$function$;
