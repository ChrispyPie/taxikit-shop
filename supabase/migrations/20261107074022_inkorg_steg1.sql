-- DRAFT: not applied. Step 1, no row edits/deletions, no new table grants.
-- Existing session-checked RPCs extended; undo restores exact pre-change definitions.
begin;
-- Central TEMPORARY superadmin access to confidential sickness/certificates.
-- To end testing: replace only this function body with array['agare']::text[].
-- Do not change workshop_roles: payroll remains owner/superadmin only.
create or replace function private.sjuk_boss_roles()
returns text[] language sql immutable set search_path = ''
as $$ select array['agare','superadmin']::text[] $$;
revoke all on function private.sjuk_boss_roles() from public, anon, authenticated;
CREATE OR REPLACE FUNCTION private.bil_admin_roles()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ select array['admin','agare','superadmin']::text[] $function$;

CREATE OR REPLACE FUNCTION private.sjuk_actor(p_token text, OUT driver_id text, OUT category text, OUT via_master boolean, OUT boss boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() or not private.has_feature(a.driver_id, 'sjuk') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  driver_id := a.driver_id; category := a.category; via_master := a.via_master;
  boss := a.category = any (private.sjuk_boss_roles());
end $function$;

CREATE OR REPLACE FUNCTION private.sjuk_push_bosses(p_except text, p_title text, p_body text, p_tag text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  insert into private.sjuk_push_queue (recipient, title, body, tag)
  select d.id, p_title, p_body, p_tag
    from public.drivers d join private.feature_flags f on f.driver_id = d.id and f.feature = 'sjuk'
   where d.category = any (private.sjuk_boss_roles()) and coalesce(d.activated, false) and d.id <> coalesce(p_except, '')
     and private.actor_company(d.id) = private.actor_company(p_except)
$function$;

CREATE OR REPLACE FUNCTION public.case_inbox(p_token text, p_klar_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; r jsonb; v_sjuk boolean; v_lim integer := least(greatest(coalesce(p_klar_limit, 300), 1), 5000);
begin
  select * into a from private.bil_actor(p_token);
  if private.is_demo() then return jsonb_build_object('items', '[]'::jsonb, 'unread', 0, 'needs', 0); end if;
  if a.category in ('agare', 'superadmin') then
    return jsonb_build_object('items', '[]'::jsonb, 'unread', 0, 'needs', 0, 'klar_total', 0, 'klar_limit', v_lim);
  end if;
  v_sjuk := private.has_feature(a.driver_id, 'sjuk');
  with x as (
    -- Felanmälan / behövs till bilen
    select 'issue'::text kind, i.id, case when i.kind = 'fault' then case when i.blocking then 'Bilen står' else 'Felanmälan' end
                                          else private.bil_supply_label(i.supply_type) end title,
           i.car_label car, private.case_cut(i.body) txt, i.status, private.case_st('issue', i.status) st,
           lm.sender_role last_role, private.case_cut(lm.body) last_txt,
           greatest(i.updated_at, i.created_at, lm.created_at) at,
           (i.status <> 'klar' and lm.sender_role = 'owner') needs,
           greatest(private.bil_issue_unread(i.id, i.reported_by, a.driver_id), private.case_unread_notices(a.driver_id, 'issue', i.id)) unread
      from public.car_issues i
      left join lateral (select m.sender_role, m.body, m.created_at from public.car_issue_messages m
                          where m.issue_id = i.id order by m.created_at desc, m.id desc limit 1) lm on true
     where i.company_id = a.company_id and i.reported_by = a.driver_id
    union all
    -- Verkstadstid
    select 'wh', w.id, 'Verkstadstid', w.car_label, private.case_cut(w.comment), w.status, private.case_st('wh', w.status, w.waiting_on),
           lm.sender_role, private.case_cut(lm.body), greatest(w.updated_at, w.created_at, lm.created_at),
           (w.status = 'pending' and w.waiting_on = 'driver'),
           private.case_unread_notices(a.driver_id, 'wh', w.id)
      from public.workshop_hours w
      left join lateral (select m.sender_role, m.body, m.created_at from public.workshop_messages m
                          where m.hours_id = w.id order by m.created_at desc, m.id desc limit 1) lm on true
     where w.driver_id = a.driver_id
    union all
    -- Uppgift som ägaren skickat till mig
    select 'task', t.id, t.title, t.car_label, private.case_cut(t.instruction), t.status, private.case_st('task', t.status),
           null, private.case_cut(t.reply), greatest(t.updated_at, t.created_at),
           (t.status = 'ny'),
           private.case_unread_notices(a.driver_id, 'task', t.id)
      from public.car_tasks t
     where t.company_id = a.company_id and t.assigned_to = a.driver_id
    union all
    -- Sjukanmälan (inga kommentarer i listan)
    select 'sjuk', s.id, 'Sjukanmälan', null, 'Från ' || to_char(s.start_date, 'DD/MM'), s.status, private.case_st('sjuk', s.status),
           null, null, greatest(s.updated_at, s.created_at),
           (s.status = 'intyg_begart'),
           case when s.status_at is not null and s.status_by is distinct from a.driver_id
                 and s.status_at > coalesce((select c.read_at from public.case_reads c where c.kind = 'sjuk' and c.case_id = s.id and c.driver_id = a.driver_id), '-infinity'::timestamptz)
                then 1 else 0 end
      from private.sick_reports s
     where v_sjuk and s.driver_id = a.driver_id
    union all
    -- Önskemål (ägaren → Christian)
    select 'wish', d.id, 'Önskemål', null, private.case_cut(d.body), d.status, private.case_st('wish', d.status),
           case when d.reply is not null then 'owner' end, private.case_cut(d.reply), greatest(d.updated_at, d.created_at),
           false,
           case when d.reply is not null
                 and d.updated_at > coalesce((select c.read_at from public.case_reads c where c.kind = 'wish' and c.case_id = d.id and c.driver_id = a.driver_id), '-infinity'::timestamptz)
                then 1 else 0 end
      from public.dev_wishes d
     where d.author_id = a.driver_id and d.company_id = a.company_id
    union all
    -- Only maintenance suggested by this driver, never other drivers' car data.
    select 'maint', m.id, private.bil_mtype_label(m.mtype, m.title), c.bilnummer,
           private.case_cut(m.note), m.status, case when m.status = 'klar' then 'klar' else 'pagar' end,
           null, null, greatest(m.updated_at, m.created_at), false, 0
      from public.car_maintenance m join public.cars c on c.id = m.car_id
     where m.company_id = a.company_id and m.suggested_by = a.driver_id
  )
  select jsonb_build_object(
      'items', coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'category', case when x.kind = 'issue' then
                 (select case when i.kind = 'fault' then 'fault' else 'supply' end from public.car_issues i where i.id = x.id and i.company_id = a.company_id) else x.kind end, 'id', x.id, 'title', x.title, 'car', x.car, 'txt', x.txt,
                 'status', x.status, 'st', x.st, 'needs', coalesce(x.needs, false), 'unread', coalesce(x.unread, 0),
                 'last_from', case x.last_role when 'owner' then 'agare' when 'driver' then 'du' end, 'last_txt', x.last_txt, 'at', x.at)
               order by coalesce(x.needs, false) desc, (x.unread > 0) desc, (x.st = 'klar'), x.at desc), '[]'::jsonb),
      'unread', count(*) filter (where x.unread > 0),
      'needs', count(*) filter (where x.needs),
      'klar_total', (select count(*) from x where x.st = 'klar'), 'klar_limit', v_lim)
    into r from (select * from x where x.st <> 'klar'
                 union all (select * from x where x.st = 'klar' order by x.at desc limit v_lim)) x;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.case_get(p_token text, p_kind text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; s record; i public.car_issues; w public.workshop_hours; t public.car_tasks; d public.dev_wishes; sr private.sick_reports; m public.car_maintenance; j jsonb; v_st text;
begin
  select * into a from private.bil_actor(p_token);
  if p_kind = 'issue' then
    select * into i from public.car_issues x where x.id = p_id and x.company_id = a.company_id;
    if not found or not (a.is_admin or i.reported_by = a.driver_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
    j := private.bil_issue_json(i, a.driver_id, a.is_admin, a.is_admin); v_st := private.case_st('issue', i.status);
  elsif p_kind = 'wh' then
    select * into w from public.workshop_hours x where x.id = p_id;
    if not found or not (w.driver_id = a.driver_id or (a.is_admin and private.actor_company(w.driver_id) = a.company_id)) then
      raise exception 'not_found' using errcode = 'P0002'; end if;
    j := private.wh_json(w, private.workshop_rate()) ||
         jsonb_build_object('mine', w.driver_id = a.driver_id, 'reporter_name', case when a.is_admin then private.bil_driver_name(w.driver_id) end);
    v_st := private.case_st('wh', w.status, w.waiting_on);
  elsif p_kind = 'task' then
    select * into t from public.car_tasks x where x.id = p_id and x.company_id = a.company_id;
    if not found or not (a.is_admin or t.assigned_to = a.driver_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
    j := private.bil_task_json(t, a.driver_id, a.is_admin); v_st := private.case_st('task', t.status);
  elsif p_kind = 'maint' then
    select * into m from public.car_maintenance x where x.id = p_id and x.company_id = a.company_id;
    if not found or not (a.is_admin or m.suggested_by = a.driver_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
    j := private.bil_maint_json(m, private.bil_car_km(m.car_id), a.is_admin) ||
         jsonb_build_object('car', (select c.bilnummer from public.cars c where c.id = m.car_id));
    v_st := case when m.status = 'klar' then 'klar' else 'pagar' end;
  elsif p_kind = 'sjuk' then
    select * into s from private.sjuk_actor(p_token);          -- kastar forbidden utan flaggan
    sr := private.sjuk_report_for(s.driver_id, s.boss, p_id);    -- kastar not_found om man inte får se den
    if s.boss and sr.driver_id <> a.driver_id and private.actor_company(sr.driver_id) <> a.company_id then
      raise exception 'not_found' using errcode = 'P0002'; end if;
    j := private.sjuk_json(sr, s.boss); v_st := private.case_st('sjuk', sr.status);
  elsif p_kind = 'wish' then
    select * into d from public.dev_wishes x where x.id = p_id and x.company_id = a.company_id;
    if not found or not (a.is_admin or d.author_id = a.driver_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
    j := private.dev_wish_json(d, a.driver_id); v_st := private.case_st('wish', d.status);
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  return jsonb_build_object('kind', p_kind, 'id', p_id, 'st', v_st, 'admin', a.is_admin, 'data', j);
end $function$;

CREATE OR REPLACE FUNCTION public.case_admin_list(p_token text, p_klar_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; r jsonb; v_sjuk boolean; v_lim integer := least(greatest(coalesce(p_klar_limit, 300), 1), 5000);
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  if private.is_demo() then return jsonb_build_object('items', '[]'::jsonb); end if;
  v_sjuk := private.has_feature(a.driver_id, 'sjuk') and a.category = any (private.sjuk_boss_roles());
  with x as (
    select 'issue'::text kind, i.id, case when i.kind = 'fault' then case when i.blocking then 'Bilen står' else 'Felanmälan' end
                                          else private.bil_supply_label(i.supply_type) end title,
           i.car_label car, private.case_cut(i.body) txt, i.status, private.case_st('issue', i.status) st,
           private.bil_driver_name(i.reported_by) who, i.reported_by = a.driver_id mine,
           lm.sender_role last_role, greatest(i.updated_at, i.created_at, lm.created_at) at,
           (i.status = 'ny' or (i.status <> 'klar' and lm.sender_role = 'driver')) needs,
           (i.kind = 'fault' and i.blocking and i.status <> 'klar') urgent
      from public.car_issues i
      left join lateral (select m.sender_role, m.created_at from public.car_issue_messages m
                          where m.issue_id = i.id order by m.created_at desc, m.id desc limit 1) lm on true
     where i.company_id = a.company_id
    union all
    select 'wh', w.id, 'Verkstadstid', w.car_label,
           to_char(w.start_at at time zone 'Europe/Stockholm', 'DD/MM HH24:MI') || ' · ' || (private.wh_minutes(w) / 60) || ' h ' || (private.wh_minutes(w) % 60) || ' min',
           w.status, private.case_st('wh', w.status, w.waiting_on),
           private.bil_driver_name(w.driver_id), w.driver_id = a.driver_id,
           lm.sender_role, greatest(w.updated_at, w.created_at, lm.created_at),
           (w.status = 'pending' and w.waiting_on is distinct from 'driver'), false
      from public.workshop_hours w
      left join lateral (select m.sender_role, m.created_at from public.workshop_messages m
                          where m.hours_id = w.id order by m.created_at desc, m.id desc limit 1) lm on true
     where a.is_admin and private.actor_company(w.driver_id) = a.company_id
    union all
    select 'task', t.id, t.title, t.car_label, private.case_cut(coalesce(t.reply, t.instruction)), t.status, private.case_st('task', t.status),
           private.bil_driver_name(t.assigned_to), t.assigned_to = a.driver_id,
           null, greatest(t.updated_at, t.created_at), false, false
      from public.car_tasks t
     where t.company_id = a.company_id
    union all
    select 'sjuk', s.id, 'Sjukanmälan', null, 'Från ' || to_char(s.start_date, 'DD/MM'), s.status, private.case_st('sjuk', s.status),
           private.bil_driver_name(s.driver_id), s.driver_id = a.driver_id,
           null, greatest(s.updated_at, s.created_at), (s.status = 'ny'), false
      from private.sick_reports s
     where v_sjuk and private.actor_company(s.driver_id) = a.company_id
    union all
    -- Önskemål (ägaren → Christian). Status och svar sätts av Christian via assistenten, inte här.
    select 'wish', d.id, 'Önskemål', null, private.case_cut(d.body), d.status, private.case_st('wish', d.status),
           private.bil_driver_name(d.author_id), d.author_id = a.driver_id,
           case when d.reply is not null then 'owner' end, greatest(d.updated_at, d.created_at),
           (d.status = 'ny' and d.author_id is distinct from a.driver_id and a.category = 'superadmin'), false
      from public.dev_wishes d
     where d.company_id = a.company_id
    union all
    select 'maint', m.id, private.bil_mtype_label(m.mtype, m.title), c.bilnummer,
           private.case_cut(m.note), m.status, case when m.status = 'klar' then 'klar' else 'pagar' end,
           private.bil_driver_name(coalesce(m.suggested_by, m.created_by)), coalesce(m.suggested_by, m.created_by) = a.driver_id,
           null, greatest(m.updated_at, m.created_at), (m.status = 'forslag'), false
      from public.car_maintenance m join public.cars c on c.id = m.car_id
     where m.company_id = a.company_id
  )
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'id', x.id, 'title', x.title, 'car', x.car,
                 'txt', x.txt, 'status', x.status, 'st', x.st, 'who', x.who, 'mine', x.mine, 'needs', coalesce(x.needs, false),
                 'urgent', x.urgent, 'last_from', case x.last_role when 'owner' then 'agare' when 'driver' then 'forare' end, 'at', x.at)
               order by coalesce(x.needs, false) desc, x.urgent desc, (x.st = 'klar'), x.at desc), '[]'::jsonb),
      'klar_total', (select count(*) from x where x.st = 'klar'), 'klar_limit', v_lim)
    into r from (select * from x where x.st <> 'klar'
                 union all (select * from x where x.st = 'klar' order by x.at desc limit v_lim)) x;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.case_seen(p_token text, p_kind text, p_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; n int := 0; ok boolean := false;
begin
  select * into a from private.bil_actor(p_token);
  if private.is_demo() then return 0; end if;
  if p_kind = 'issue' then
    insert into public.car_issue_reads (issue_id, driver_id, read_at)
    select i.id, a.driver_id, clock_timestamp() from public.car_issues i
     where i.id = p_id and i.company_id = a.company_id and (a.is_admin or i.reported_by = a.driver_id)
    on conflict (issue_id, driver_id) do update set read_at = excluded.read_at;
    get diagnostics n = row_count; ok := n > 0;
  elsif p_kind = 'wh' then
    ok := exists (select 1 from public.workshop_hours w where w.id = p_id
                   and (w.driver_id = a.driver_id or (a.is_admin and private.actor_company(w.driver_id) = a.company_id)));
  elsif p_kind = 'task' then
    ok := exists (select 1 from public.car_tasks t where t.id = p_id and t.company_id = a.company_id and (a.is_admin or t.assigned_to = a.driver_id));
  elsif p_kind = 'maint' then
    perform public.case_get(p_token, p_kind, p_id);
    return 0;
  elsif p_kind = 'sjuk' then
    ok := private.has_feature(a.driver_id, 'sjuk') and exists (select 1 from private.sick_reports s where s.id = p_id
            and (s.driver_id = a.driver_id or (a.category = any (private.sjuk_boss_roles()) and private.actor_company(s.driver_id) = a.company_id)));
  elsif p_kind = 'wish' then
    ok := exists (select 1 from public.dev_wishes d where d.id = p_id and d.company_id = a.company_id and (a.is_admin or d.author_id = a.driver_id));
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  if not ok then return 0; end if;
  if p_kind <> 'issue' then
    insert into public.case_reads (kind, case_id, driver_id, read_at) values (p_kind, p_id, a.driver_id, clock_timestamp())
    on conflict (kind, case_id, driver_id) do update set read_at = excluded.read_at;
  end if;
  update public.event_notices set read_at = now()
   where driver_id = a.driver_id and case_kind = p_kind and case_id = p_id and read_at is null;
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_workshop_decide(p_token text, p_id bigint, p_status text, p_comment text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; o public.workshop_hours; w public.workshop_hours; v_rate numeric := private.workshop_rate();
        v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'bad_status' using errcode = '22023'; end if;
  if char_length(coalesce(v_comment, '')) > 500 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  select * into o from public.workshop_hours where id = p_id
    and private.actor_company(driver_id) = a.company_id for update;
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
         decided_by = a.driver_id, decided_at = now(), decision_comment = v_comment, waiting_on = null, updated_at = now()
   where id = p_id returning * into w;
  insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body) values (w.id, a.driver_id, 'owner', p_status, v_comment);
  if w.driver_id is distinct from a.driver_id and o.status is distinct from p_status then
    insert into public.event_notices (company_id, driver_id, kind, body)
    values (private.actor_company(w.driver_id), w.driver_id, 'bil_wh_decided',
            left(case when p_status = 'approved' then '✅ Godkänd' else '❌ Nekad' end || ': verkstadstid ' ||
                 to_char(w.start_at at time zone 'Europe/Stockholm', 'DD/MM HH24:MI') || ' (bil ' || w.car_label || ')' || coalesce(' – ' || v_comment, ''), 300));
  end if;
  perform private.log(a.driver_id, a.category, case when p_status = 'approved' then 'workshop_approve' else 'workshop_reject' end, w.driver_id,
    jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'minutes', private.wh_minutes(w), 'car', w.car_label,
      'from', o.status, 'comment', v_comment, 'kr', case when p_status = 'approved' then round(private.wh_minutes(w) / 60.0 * w.rate) end), a.via_master);
  return private.wh_json(w, v_rate)::json;
end $function$;

CREATE OR REPLACE FUNCTION public.workshop_ask(p_token text, p_id bigint, p_body text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; o public.workshop_hours; w public.workshop_hours; v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_reopen boolean;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_body is null then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v_body) > 1000 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  select * into o from public.workshop_hours where id = p_id
    and private.actor_company(driver_id) = a.company_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_reopen := o.status <> 'pending';
  if v_reopen then
    perform pg_advisory_xact_lock(hashtext('workshop:' || o.driver_id));
    if o.status = 'rejected' and exists (select 1 from public.workshop_hours x where x.driver_id = o.driver_id and x.status <> 'rejected'
                 and x.id <> o.id and x.start_at < o.end_at and x.end_at > o.start_at) then
      raise exception 'overlap' using errcode = '23P01';
    end if;
    -- äldre beslut (före tråden fanns) sparas i tråden så motiveringen inte försvinner
    if not exists (select 1 from public.workshop_messages m where m.hours_id = o.id and m.kind = o.status) then
      insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body, created_at)
      values (o.id, coalesce(o.decided_by, a.driver_id), 'owner', o.status, o.decision_comment, coalesce(o.decided_at, now()));
    end if;
    insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body) values (o.id, a.driver_id, 'owner', 'reopen', null);
  end if;
  insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body) values (o.id, a.driver_id, 'owner', 'msg', v_body);
  update public.workshop_hours set status = 'pending', rate = null,
         decided_by = case when v_reopen then null else decided_by end, decided_at = case when v_reopen then null else decided_at end,
         decision_comment = case when v_reopen then null else decision_comment end,
         waiting_on = 'driver', updated_at = now()
   where id = p_id returning * into w;
  if w.driver_id is distinct from a.driver_id then
    insert into public.event_notices (company_id, driver_id, kind, body)
    values (private.actor_company(w.driver_id), w.driver_id, 'bil_wh_q',
            left('❓ Fråga om din verkstadstid ' || to_char(w.start_at at time zone 'Europe/Stockholm', 'DD/MM HH24:MI') || ' (bil ' || w.car_label || '): ' || v_body, 300));
  end if;
  perform private.log(a.driver_id, a.category, 'workshop_ask', w.driver_id,
    jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'minutes', private.wh_minutes(w), 'car', w.car_label,
      'from', o.status, 'comment', left(v_body, 200)), a.via_master);
  return private.wh_json(w, private.workshop_rate())::json;
end $function$;

CREATE OR REPLACE FUNCTION private.sjuk_report_for(p_driver text, p_boss boolean, p_id bigint)
 RETURNS private.sick_reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r private.sick_reports;
begin
  select * into r from private.sick_reports where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.driver_id <> p_driver and (not p_boss or private.actor_company(r.driver_id) is distinct from private.actor_company(p_driver)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.sjuk_get(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record;
begin
  select * into a from private.sjuk_actor(p_token);
  return jsonb_build_object(
    'me', a.driver_id, 'boss', a.boss, 'today', private.sjuk_today(),
    'mine', coalesce((select jsonb_agg(private.sjuk_json(r, a.boss) order by r.start_date desc, r.id desc)
                        from private.sick_reports r where r.driver_id = a.driver_id), '[]'::jsonb),
    'all', case when a.boss then coalesce((select jsonb_agg(private.sjuk_json(r, true) order by (r.end_date is null) desc, r.start_date desc, r.id desc)
                        from private.sick_reports r
                       where private.actor_company(r.driver_id) = private.actor_company(a.driver_id)
                         and (r.end_date is null or r.id in (select x.id from private.sick_reports x
                              where private.actor_company(x.driver_id) = private.actor_company(a.driver_id)
                              order by x.start_date desc, x.id desc limit 300))), '[]'::jsonb) end)
    || case when a.boss and private.has_feature(a.driver_id, 'sjuk_se_allt') then jsonb_build_object('se_allt', true) else '{}'::jsonb end;
end $function$;

commit;
