-- ROLLBACK verkstad-dialog 2026-10-26: återställer exakt som före. OBS: tar bort trådarna (workshop_messages) och waiting_on.
begin;
CREATE OR REPLACE FUNCTION private.wh_json(w workshop_hours, p_rate numeric)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'car_id', w.car_id, 'car', w.car_label,
CREATE OR REPLACE FUNCTION public.admin_workshop_decide(p_token text, p_id bigint, p_status text, p_comment text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; o public.workshop_hours; w public.workshop_hours; v_rate numeric := private.workshop_rate();
        v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into a from private.session_actor(p_token);
  if not (coalesce(a.category, '') = any (private.workshop_roles())) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'bad_status' using errcode = '22023'; end if;
  if char_length(coalesce(v_comment, '')) > 500 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  select * into o from public.workshop_hours where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status = 'approved' and o.status = 'rejected' then
    perform pg_advisory_xact_lock(hashtext('workshop:' || o.driver_id));
    if exists (select 1 from public.workshop_hours x where x.driver_id = o.driver_id and x.status <> 'rejected'
                 and x.id <> o.id and x.start_at < o.end_at and x.end_at > o.start_at) then
      raise exception 'overlap' using errcode = '23P01';
    end if;
  end if;
  update public.workshop_hours set status = p_status,
         rate = case when p_status = 'approved' then case when o.status = 'approved' then o.rate else v_rate end end,
         decided_by = a.driver_id, decided_at = now(), decision_comment = v_comment, updated_at = now()
   where id = p_id returning * into w;
  perform private.log(a.driver_id, a.category, case when p_status = 'approved' then 'workshop_approve' else 'workshop_reject' end, w.driver_id,
    jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'minutes', private.wh_minutes(w), 'car', w.car_label,
      'from', o.status, 'comment', v_comment, 'kr', case when p_status = 'approved' then round(private.wh_minutes(w) / 60.0 * w.rate) end), a.via_master);
  return private.wh_json(w, v_rate)::json;
end $function$
;
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
    'tasks', (select count(*) from public.car_tasks t where t.assigned_to = a.driver_id and t.status <> 'klar'));
end $function$
;
CREATE OR REPLACE FUNCTION public.workshop_pending_count(p_token text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if not (coalesce(a.category, '') = any (private.workshop_roles())) then return 0; end if;
  return (select count(*) from public.workshop_hours where status = 'pending');
end $function$
;
drop function if exists public.workshop_ask(text, bigint, text);
drop function if exists public.workshop_reply(text, bigint, text);
drop table if exists public.workshop_messages;
alter table public.workshop_hours drop constraint if exists workshop_hours_waiting_on_check;
alter table public.workshop_hours drop column if exists waiting_on;
-- Notiser som redan skickats (kind bil_wh_q/bil_wh_reply/bil_wh_decided) får ligga kvar; vill man ta bort dem:
-- delete from public.event_notices where kind in ('bil_wh_q','bil_wh_reply','bil_wh_decided');
commit;
