-- Ångra 20261028a_arende_meddelanden: lägger tillbaka bil_issue_json, bil_badge och bil_open_count exakt som de var
-- före migreringen (hämtade från databasen 2026-10-28) och tar bort de nya funktionerna.
-- Steg 2 (tabellerna) raderar alla ärendemeddelanden – kör bara steg 2 om ni verkligen vill ta bort dem.
begin;

CREATE OR REPLACE FUNCTION private.bil_issue_json(i car_issues, p_me text, p_admin boolean, p_named boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('id', i.id, 'kind', i.kind, 'car_id', i.car_id,
    'car', coalesce((select c.bilnummer from public.cars c where c.id = i.car_id), i.car_label),
    'supply', i.supply_type, 'body', i.body, 'blocking', i.blocking, 'status', i.status,
    'mine', i.reported_by = p_me, 'created_at', i.created_at, 'updated_at', i.updated_at,
    'status_at', i.status_at, 'status_comment', i.status_comment, 'closed_at', i.closed_at,
    'reporter', case when p_admin then i.reported_by end,
    'reporter_name', case when p_named then private.bil_driver_name(i.reported_by) end,
    'photos', (select count(*) from public.car_issue_photos p where p.issue_id = i.id and p.uploaded),
    'workshop_min', (select coalesce(sum(private.wh_minutes(w)), 0) from public.workshop_hours w where w.issue_id = i.id and w.status <> 'rejected'),
    'tasks', case when p_admin then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'status', t.status,
                  'name', coalesce(private.bil_driver_name(t.assigned_to), t.assigned_to)) order by t.id)
               from public.car_tasks t where t.issue_id = i.id), '[]'::jsonb) end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', u.status, 'comment', u.comment, 'at', u.created_at,
                  'by', case when p_admin then u.by_driver end) order by u.created_at)
               from public.car_issue_updates u where u.issue_id = i.id), '[]'::jsonb))
$function$;

CREATE OR REPLACE FUNCTION public.bil_badge(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record;
begin
  select * into a from private.bil_actor(p_token);
  return json_build_object(
    'unread', (select count(*) from public.event_notices n where n.driver_id = a.driver_id and n.read_at is null and n.kind like 'bil%'),
    'blocking', case when a.is_admin then (select count(*) from public.car_issues i where i.company_id = a.company_id and i.kind = 'fault' and i.blocking and i.status <> 'klar') else 0 end,
    'tasks', (select count(*) from public.car_tasks t where t.assigned_to = a.driver_id and t.status <> 'klar'),
    'wh_q', (select count(*) from public.workshop_hours w where w.driver_id = a.driver_id and w.status = 'pending' and w.waiting_on = 'driver'));
end $function$;

CREATE OR REPLACE FUNCTION public.bil_open_count(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin or private.is_demo() then
    return json_build_object('supply', 0, 'fault', 0);
  end if;
  return json_build_object(
    'supply', (select count(*) from public.car_issues i where i.company_id = a.company_id and i.kind = 'supply' and i.status = 'ny'),
    'fault',  (select count(*) from public.car_issues i where i.company_id = a.company_id and i.kind = 'fault'  and i.status = 'ny'));
end $function$;

drop function if exists public.car_issue_message(text, bigint, text);
drop function if exists public.car_issue_seen(text, bigint[]);
drop function if exists private.bil_issue_unread(bigint, text, text);
commit;

-- Steg 2 (valfritt, raderar meddelandena):
-- begin;
-- drop table if exists public.car_issue_reads;
-- drop table if exists public.car_issue_messages;
-- commit;
