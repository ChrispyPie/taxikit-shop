-- 2026-11-27 B: Sjuk och intyg låses med tråden.
-- När admin/ägare raderar en sjuktråd (Papperskorg, owner_hidden/owner_permanent i inbox_private.party_deletions) får föraren
-- läsa men inte längre ändra: friskanmäla, ladda upp eller ta bort intyg, eller ta bort sjukperioden. Servern nekar med
-- thread_closed (42501), som för vanliga trådar. Ägare/superadmin/admin med sjukbehörighet (boss) berörs inte.
-- En låst, öppen sjukperiod hindrar inte längre en ny sjukanmälan (annars skulle föraren bli fast).
-- Hård radering av sjukuppgifter förblir avstängd (private.mailbox_secret_hard_delete_enabled() = false, oförändrad).
-- Ångra: supabase/migrations/undo/20261127b_sjuk_lock.sql
create or replace function private.sjuk_locked(p_report bigint) returns boolean
language sql stable security definer set search_path = 'public', 'pg_temp' as $f$
  select exists (select 1 from private.sick_reports r
                   join inbox_private.party_deletions d on d.company_id = private.actor_company(r.driver_id) and d.kind = 'sjuk' and d.item_id = r.id
                  where r.id = p_report and (d.owner_hidden or d.owner_permanent))
$f$;
revoke all on function private.sjuk_locked(bigint) from public, anon, authenticated;
CREATE OR REPLACE FUNCTION private.sjuk_json(r private.sick_reports, p_boss boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'id', r.id, 'driver_id', r.driver_id, 'name', private.bil_driver_name(r.driver_id),
    'start', r.start_date, 'end', r.end_date, 'open', r.end_date is null, 'days', private.sjuk_days(r),
    'comment', r.comment, 'status', r.status, 'status_comment', r.status_comment,
    'status_by', case when r.status_by is not null then private.bil_driver_name(r.status_by) end, 'status_at', r.status_at,
    'recovered_at', r.recovered_at, 'sjuklon', r.sjuklon, 'sjuklon_at', r.sjuklon_at,
    'created_at', r.created_at,
    'certs', (select count(*) from private.sick_certs c where c.report_id = r.id and c.uploaded),
    'locked', private.sjuk_locked(r.id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'from', e.from_status, 'to', e.to_status,
                 'comment', e.comment, 'who', private.bil_driver_name(e.by_driver), 'self', e.by_driver = r.driver_id) order by e.at, e.id)
               from private.sick_events e where e.report_id = r.id), '[]'::jsonb))
$function$;

CREATE OR REPLACE FUNCTION public.sjuk_recover(p_token text, p_id bigint, p_back date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; r private.sick_reports; v_back date := coalesce(p_back, private.sjuk_today()); v_days int;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_id);
  if not a.boss and private.sjuk_locked(r.id) then raise exception 'thread_closed' using errcode = '42501'; end if;
  if r.end_date is not null then raise exception 'already_recovered' using errcode = '23505'; end if;
  if v_back <= r.start_date or v_back > private.sjuk_today() + 1 then raise exception 'bad_date' using errcode = '22023'; end if;
  update private.sick_reports set end_date = v_back - 1, recovered_at = now(), updated_at = now() where id = r.id returning * into r;
  v_days := private.sjuk_days(r);
  perform private.sjuk_push_bosses(a.driver_id, '💪 Friskanmälan',
    coalesce(private.bil_driver_name(r.driver_id), r.driver_id) || ' är frisk från ' || private.sjuk_fmt_date(v_back) || ' (' || v_days || ' sjukdag' || case when v_days = 1 then '' else 'ar' end || ').', 'sjuk-' || r.id);
  perform private.sjuk_push_driver(r.driver_id, a.driver_id, '💪 Friskanmäld',
    'Du är friskanmäld från ' || private.sjuk_fmt_date(v_back) || '.', 'sjuk-' || r.id);
  perform private.log(a.driver_id, a.category, 'bil_sjuk_recover', r.driver_id,
    jsonb_build_object('id', r.id, 'start', r.start_date, 'end', r.end_date, 'days', v_days), a.via_master);
  return private.sjuk_json(r, a.boss);
end $function$;

CREATE OR REPLACE FUNCTION public.sjuk_report(p_token text, p_start date DEFAULT NULL::date, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; v_start date := coalesce(p_start, private.sjuk_today()); v_c text := nullif(btrim(coalesce(p_comment, '')), '');
  r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  if v_start < private.sjuk_today() - 14 or v_start > private.sjuk_today() + 1 then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  if char_length(coalesce(v_c, '')) > 500 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  if exists (select 1 from private.sick_reports x where x.driver_id = a.driver_id and x.end_date is null and not private.sjuk_locked(x.id)) then
    raise exception 'already_sick' using errcode = '23505';
  end if;
  if (select count(*) from private.sick_reports x where x.driver_id = a.driver_id and x.created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into private.sick_reports (driver_id, start_date, comment) values (a.driver_id, v_start, v_c) returning * into r;
  perform private.sjuk_push_bosses(a.driver_id, '🤒 Ny sjukanmälan',
    coalesce(private.bil_driver_name(a.driver_id), a.driver_id) || ' är sjuk från ' || private.sjuk_fmt_date(v_start) || '.', 'sjuk-' || r.id);
  perform private.log(a.driver_id, a.category, 'bil_sjuk_add', a.driver_id,
    jsonb_build_object('id', r.id, 'start', v_start), a.via_master);
  return private.sjuk_json(r, a.boss);
end $function$;

CREATE OR REPLACE FUNCTION public.sjuk_svc_cert_begin(p_token text, p_report bigint, p_mime text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; r private.sick_reports; v_id bigint; v_path text;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_report);
  if not a.boss and private.sjuk_locked(r.id) then raise exception 'thread_closed' using errcode = '42501'; end if;
  if p_mime not in ('image/jpeg', 'application/pdf') then raise exception 'bad_mime' using errcode = '22023'; end if;
  if (select count(*) from private.sick_certs c where c.report_id = r.id) >= 10 then raise exception 'too_many' using errcode = '54000'; end if;
  v_path := r.driver_id || '/' || r.id || '/' || replace(gen_random_uuid()::text, '-', '') || case when p_mime = 'application/pdf' then '.pdf' else '.jpg' end;
  insert into private.sick_certs (report_id, path, mime, uploaded_by) values (r.id, v_path, p_mime, a.driver_id) returning id into v_id;
  return jsonb_build_object('id', v_id, 'path', v_path);
end $function$;

CREATE OR REPLACE FUNCTION public.sjuk_svc_cert_delete(p_token text, p_cert bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; c private.sick_certs; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  select * into c from private.sick_certs where id = p_cert;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := private.sjuk_report_for(a.driver_id, a.boss, c.report_id);
  if not a.boss and private.sjuk_locked(r.id) then raise exception 'thread_closed' using errcode = '42501'; end if;
  if c.uploaded_by <> a.driver_id and not a.boss then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from private.sick_certs where id = c.id;
  perform private.log(a.driver_id, a.category, 'bil_sjuk_cert_delete', r.driver_id, jsonb_build_object('id', r.id), a.via_master);
  return jsonb_build_object('path', c.path);
end $function$;

CREATE OR REPLACE FUNCTION public.sjuk_svc_cert_finish(p_token text, p_cert bigint, p_ok boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; c private.sick_certs; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  select * into c from private.sick_certs where id = p_cert and uploaded_by = a.driver_id;
  if not found then return; end if;
  if not p_ok then delete from private.sick_certs where id = c.id; return; end if;
  if not a.boss and private.sjuk_locked(c.report_id) then raise exception 'thread_closed' using errcode = '42501'; end if;
  update private.sick_certs set uploaded = true where id = c.id;
  select * into r from private.sick_reports where id = c.report_id;
  perform private.sjuk_push_bosses(a.driver_id, '📄 Läkarintyg uppladdat',
    coalesce(private.bil_driver_name(r.driver_id), r.driver_id) || ' – sjukperioden från ' || private.sjuk_fmt_date(r.start_date) || '.', 'sjuk-' || r.id);
  perform private.sjuk_push_driver(r.driver_id, a.driver_id, '📄 Läkarintyg uppladdat',
    'Ett intyg lades till på din sjukperiod från ' || private.sjuk_fmt_date(r.start_date) || '.', 'sjuk-' || r.id);
  perform private.log(a.driver_id, a.category, 'bil_sjuk_cert', r.driver_id, jsonb_build_object('id', r.id), a.via_master);
end $function$;

CREATE OR REPLACE FUNCTION public.sjuk_svc_delete(p_token text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; r private.sick_reports; v_paths jsonb;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_id);
  if not a.boss and private.sjuk_locked(r.id) then raise exception 'thread_closed' using errcode = '42501'; end if;
  if not a.boss and r.status <> 'ny' then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(c.path), '[]'::jsonb) into v_paths from private.sick_certs c where c.report_id = r.id;
  delete from private.sick_reports where id = r.id;
  delete from private.sjuk_push_queue where tag = 'sjuk-' || r.id and sent_at is null;
  perform private.log(a.driver_id, a.category, 'bil_sjuk_delete', r.driver_id, jsonb_build_object('id', r.id, 'start', r.start_date), a.via_master);
  return jsonb_build_object('paths', v_paths);
end $function$;

