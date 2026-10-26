-- Verkstadstimmar: dialog mellan ägaren och föraren + månadssumma (2026-10-26)
-- Bara tillägg: ny kolumn (null som standard), ny tabell, nya RPC:er.
-- Fyra befintliga funktioner byts ut (samma signatur, samma beteende + nya fält):
--   private.wh_json, public.workshop_pending_count, public.admin_workshop_decide, public.bil_badge
-- Gamla versioner: functions-pre-verkstad-dialog-2026-10-26.sql. Ångra: 20261026_verkstad_dialog_rollback.sql

-- 1) Vem väntar vi på? null = ingen dialog, 'driver' = ägaren har frågat, 'owner' = föraren har svarat
alter table public.workshop_hours add column if not exists waiting_on text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workshop_hours_waiting_on_check') then
    alter table public.workshop_hours add constraint workshop_hours_waiting_on_check check (waiting_on in ('driver', 'owner'));
  end if;
end $$;

-- 2) Meddelanden på en verkstadstid
create table if not exists public.workshop_messages (
  id bigserial primary key,
  hours_id bigint not null references public.workshop_hours(id) on delete cascade,
  sender_id text not null,
  sender_role text not null check (sender_role in ('owner', 'driver')),
  kind text not null default 'msg' check (kind in ('msg', 'approved', 'rejected', 'reopen')),
  body text check (char_length(body) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists workshop_messages_hours_idx on public.workshop_messages (hours_id, created_at);
alter table public.workshop_messages enable row level security;  -- inga policies: bara via RPC:erna nedan
revoke all on public.workshop_messages from anon, authenticated;

-- 3) wh_json: samma fält som förut + waiting_on, updated_at och tråden
create or replace function private.wh_json(w workshop_hours, p_rate numeric)
 returns jsonb language sql stable
as $function$
  select jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'car_id', w.car_id, 'car', w.car_label,
    'comment', w.comment, 'status', w.status, 'minutes', private.wh_minutes(w),
    'rate', case when w.status = 'approved' then w.rate else p_rate end,
    'kr', round(private.wh_minutes(w) / 60.0 * case when w.status = 'approved' then w.rate else p_rate end),
    'decided_at', w.decided_at, 'decision_comment', w.decision_comment, 'created_at', w.created_at, 'issue_id', w.issue_id,
    'updated_at', w.updated_at,
    'waiting_on', case when w.status = 'pending' then w.waiting_on end,
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.sender_role, 'kind', m.kind, 'body', m.body, 'at', m.created_at,
                 'who', case when m.sender_role = 'owner' then 'Ägaren' else coalesce(private.bil_driver_name(m.sender_id), m.sender_id) end)
               order by m.created_at, m.id) from public.workshop_messages m where m.hours_id = w.id), '[]'::jsonb))
$function$;

-- 4) Ägaren (eller S admin) frågar/svarar föraren. Öppnar igen en beslutad post om det behövs.
create or replace function public.workshop_ask(p_token text, p_id bigint, p_body text)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; o public.workshop_hours; w public.workshop_hours; v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_reopen boolean;
begin
  select * into a from private.session_actor(p_token);
  if not (coalesce(a.category, '') = any (private.workshop_roles())) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_body is null then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v_body) > 1000 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  select * into o from public.workshop_hours where id = p_id for update;
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

-- 5) Föraren svarar på sin egen väntande post
create or replace function public.workshop_reply(p_token text, p_id bigint, p_body text)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; o public.workshop_hours; w public.workshop_hours; v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_who text;
begin
  select * into a from private.session_actor(p_token);
  if a.category is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_body is null then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v_body) > 1000 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  select * into o from public.workshop_hours where id = p_id and driver_id = a.driver_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.status <> 'pending' then raise exception 'not_editable' using errcode = '42501'; end if;
  if (select count(*) from public.workshop_messages m where m.sender_id = a.driver_id and m.created_at > now() - interval '1 day') >= 100 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body) values (o.id, a.driver_id, 'driver', 'msg', v_body);
  update public.workshop_hours set waiting_on = 'owner', updated_at = now() where id = p_id returning * into w;
  v_who := coalesce(private.bil_driver_name(a.driver_id), a.driver_id);
  perform private.bil_notify_admins(private.actor_company(a.driver_id), 'bil_wh_reply',
    '💬 ' || v_who || ' svarade om verkstadstid ' || to_char(w.start_at at time zone 'Europe/Stockholm', 'DD/MM HH24:MI') || ' (bil ' || w.car_label || '): ' || v_body,
    a.driver_id);
  perform private.log(a.driver_id, a.category, 'workshop_reply', a.driver_id,
    jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'minutes', private.wh_minutes(w), 'car', w.car_label, 'comment', left(v_body, 200)), a.via_master);
  return private.wh_json(w, private.workshop_rate())::json;
end $function$;

-- 6) Siffran på Admin-rutan: bara det som väntar på ägaren (inte frågor som väntar på föraren)
create or replace function public.workshop_pending_count(p_token text)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if not (coalesce(a.category, '') = any (private.workshop_roles())) then return 0; end if;
  return (select count(*) from public.workshop_hours where status = 'pending' and waiting_on is distinct from 'driver');
end $function$;

-- 7) Beslut: som förut + beslutet sparas i tråden, dialogen stängs och föraren får en notis
create or replace function public.admin_workshop_decide(p_token text, p_id bigint, p_status text, p_comment text)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
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

-- 8) Bil-siffran: + antal verkstadstider där ägaren väntar på mitt svar
create or replace function public.bil_badge(p_token text)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record;
begin
  select * into a from private.bil_actor(p_token);
  return json_build_object(
    'unread', (select count(*) from public.event_notices n where n.driver_id = a.driver_id and n.read_at is null and n.kind like 'bil%'),
    'blocking', case when a.is_admin then (select count(*) from public.car_issues i where i.company_id = a.company_id and i.kind = 'fault' and i.blocking and i.status <> 'klar') else 0 end,
    'tasks', (select count(*) from public.car_tasks t where t.assigned_to = a.driver_id and t.status <> 'klar'),
    'wh_q', (select count(*) from public.workshop_hours w where w.driver_id = a.driver_id and w.status = 'pending' and w.waiting_on = 'driver'));
end $function$;

grant execute on function public.workshop_ask(text, bigint, text) to anon, authenticated;
grant execute on function public.workshop_reply(text, bigint, text) to anon, authenticated;
