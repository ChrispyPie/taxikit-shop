-- Ärenden (Bil & verkstad: "Behövs till bilen" och felanmälan): meddelandetråd mellan föraren och ägaren (2026-10-28)
-- Bara tillägg: två nya tabeller, två nya RPC:er. Tre befintliga funktioner byts ut med samma signatur och
-- samma fält som förut + nya fält (msgs, unread, iss_msg, msg):
--   private.bil_issue_json, public.bil_badge, public.bil_open_count
-- Gamla versioner och ångra-SQL: se /workspace/backups/UNDO-arende-meddelanden-2026-10-28.md och
-- supabase/migrations/undo/20261028a_arende_meddelanden_undo.sql
-- Godkänn/Neka-flödet (set_car_issue_status: Pågår/Åtgärdad + valfri kommentar) ändras inte.

-- 1) Meddelanden på ett ärende
create table if not exists public.car_issue_messages (
  id bigserial primary key,
  issue_id bigint not null references public.car_issues(id) on delete cascade,
  sender_id text not null,
  sender_role text not null check (sender_role in ('owner', 'driver')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists car_issue_messages_issue_idx on public.car_issue_messages (issue_id, created_at);
create index if not exists car_issue_messages_sender_idx on public.car_issue_messages (sender_id, created_at);
-- RLS på, inga policies: ingen kommer åt tabellen direkt. Allt går via RPC:erna nedan, som kontrollerar
-- att föraren bara ser sina egna ärenden och att ägaren/superadmin bara ser sitt åkeris ärenden.
alter table public.car_issue_messages enable row level security;
revoke all on public.car_issue_messages from anon, authenticated;
revoke all on sequence public.car_issue_messages_id_seq from anon, authenticated;

-- 2) Senast läst per person och ärende (för "nytt svar"-markeringen)
create table if not exists public.car_issue_reads (
  issue_id bigint not null references public.car_issues(id) on delete cascade,
  driver_id text not null,
  read_at timestamptz not null default clock_timestamp(),
  primary key (issue_id, driver_id)
);
alter table public.car_issue_reads enable row level security;
revoke all on public.car_issue_reads from anon, authenticated;

-- demokonton får inte skriva (samma spärr som övriga bil-tabeller)
drop trigger if exists zz_demo_write_guard on public.car_issue_messages;
create trigger zz_demo_write_guard before insert or delete or update on public.car_issue_messages
  for each statement execute function private.demo_write_guard();
drop trigger if exists zz_demo_write_guard on public.car_issue_reads;
create trigger zz_demo_write_guard before insert or delete or update on public.car_issue_reads
  for each statement execute function private.demo_write_guard();

-- 3) Antal olästa på ett ärende för en person: bara den andra sidans meddelanden efter senast läst
create or replace function private.bil_issue_unread(p_issue bigint, p_reporter text, p_me text)
 returns integer language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::int from public.car_issue_messages m
   where m.issue_id = p_issue and m.sender_id is distinct from p_me
     and m.sender_role = case when p_reporter = p_me then 'owner' else 'driver' end
     and m.created_at > coalesce((select r.read_at from public.car_issue_reads r where r.issue_id = p_issue and r.driver_id = p_me), '-infinity'::timestamptz)
$function$;

-- 4) bil_issue_json: samma fält som förut + msgs (tråden) och unread
create or replace function private.bil_issue_json(i car_issues, p_me text, p_admin boolean, p_named boolean)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
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
               from public.car_issue_updates u where u.issue_id = i.id), '[]'::jsonb),
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.sender_role, 'body', m.body, 'at', m.created_at,
                  'mine', m.sender_id = p_me,
                  'who', case when m.sender_role = 'owner' then coalesce(private.bil_driver_name(m.sender_id), 'Ägaren')
                              else coalesce(private.bil_driver_name(m.sender_id), 'Föraren') end)
                  order by m.created_at, m.id)
               from public.car_issue_messages m where m.issue_id = i.id), '[]'::jsonb),
    'unread', private.bil_issue_unread(i.id, i.reported_by, p_me))
$function$;

-- 5) Skriv ett meddelande. Föraren: bara på sina egna ärenden. Ägaren/superadmin: på alla ärenden i sitt åkeri.
--    Ändrar inte status. Den andra sidan får en notis i appen (och mejl om ägaren har valt det).
create or replace function public.car_issue_message(p_token text, p_id bigint, p_body text)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; i public.car_issues; v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_role text; v_what text; v_who text;
begin
  select * into a from private.bil_actor(p_token);
  if v_body is null then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v_body) > 1000 then raise exception 'msg_too_long' using errcode = '22023'; end if;
  select * into i from public.car_issues where id = p_id and company_id = a.company_id for update;
  if not found or not (a.is_admin or i.reported_by = a.driver_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) from public.car_issue_messages m where m.sender_id = a.driver_id and m.created_at > now() - interval '1 day') >= 100 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  v_role := case when a.is_admin then 'owner' else 'driver' end;
  insert into public.car_issue_messages (issue_id, sender_id, sender_role, body) values (i.id, a.driver_id, v_role, v_body);
  -- den som skriver har förstås läst allt fram till nu
  insert into public.car_issue_reads (issue_id, driver_id, read_at) values (i.id, a.driver_id, clock_timestamp())
  on conflict (issue_id, driver_id) do update set read_at = excluded.read_at;
  update public.car_issues set updated_at = now() where id = i.id returning * into i;
  v_what := case when i.kind = 'fault' then 'felanmälan' else lower(private.bil_supply_label(i.supply_type)) end ||
            coalesce(' (bil ' || i.car_label || ')', '') || coalesce(' "' || left(i.body, 40) || case when char_length(i.body) > 40 then '…' else '' end || '"', '');
  if v_role = 'driver' then
    v_who := coalesce(private.bil_driver_name(a.driver_id), a.driver_id);
    perform private.bil_notify_admins(a.company_id, 'bil_issue_msg', '💬 ' || v_who || ' skrev om ' || v_what || ': ' || v_body, a.driver_id);
  elsif i.reported_by is distinct from a.driver_id then
    insert into public.event_notices (company_id, driver_id, kind, body)
    values (i.company_id, i.reported_by, 'bil_issue_msg', left('💬 Ägaren svarade om ' || v_what || ': ' || v_body, 300));
  end if;
  perform private.log(a.driver_id, a.category, 'bil_issue_msg', i.reported_by,
    jsonb_build_object('id', i.id, 'kind', i.kind, 'car', i.car_label, 'comment', left(v_body, 200)), a.via_master);
  return private.bil_issue_json(i, a.driver_id, a.is_admin, a.is_admin)::json;
end $function$;

-- 6) Markera ärenden som lästa (när föraren/ägaren har öppnat dem). Demokonton: gör ingenting.
create or replace function public.car_issue_seen(p_token text, p_ids bigint[])
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; n int;
begin
  select * into a from private.bil_actor(p_token);
  if private.is_demo() or p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many' using errcode = '22023'; end if;
  insert into public.car_issue_reads (issue_id, driver_id, read_at)
  select i.id, a.driver_id, clock_timestamp() from public.car_issues i
   where i.id = any (p_ids) and i.company_id = a.company_id and (a.is_admin or i.reported_by = a.driver_id)
  on conflict (issue_id, driver_id) do update set read_at = excluded.read_at;
  get diagnostics n = row_count;
  return n;
end $function$;

-- 7) Bil-siffran: + iss_msg = antal av mina ärenden (ägaren: åkeriets ärenden) med nytt svar
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
    'wh_q', (select count(*) from public.workshop_hours w where w.driver_id = a.driver_id and w.status = 'pending' and w.waiting_on = 'driver'),
    'iss_msg', (select count(*) from public.car_issues i where i.company_id = a.company_id and (a.is_admin or i.reported_by = a.driver_id)
                  and exists (select 1 from public.car_issue_messages m where m.issue_id = i.id)
                  and private.bil_issue_unread(i.id, i.reported_by, a.driver_id) > 0));
end $function$;

-- 8) Admin-rutans siffra: + msg = antal ärenden där en förare har skrivit något som ägaren inte har läst
create or replace function public.bil_open_count(p_token text)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin or private.is_demo() then
    return json_build_object('supply', 0, 'fault', 0, 'msg', 0);
  end if;
  return json_build_object(
    'supply', (select count(*) from public.car_issues i where i.company_id = a.company_id and i.kind = 'supply' and i.status = 'ny'),
    'fault',  (select count(*) from public.car_issues i where i.company_id = a.company_id and i.kind = 'fault'  and i.status = 'ny'),
    'msg',    (select count(*) from public.car_issues i where i.company_id = a.company_id and i.status <> 'ny'
                 and exists (select 1 from public.car_issue_messages m where m.issue_id = i.id and m.sender_role = 'driver')
                 and private.bil_issue_unread(i.id, i.reported_by, a.driver_id) > 0));
end $function$;

revoke all on function private.bil_issue_unread(bigint, text, text) from public, anon, authenticated;
grant execute on function public.car_issue_message(text, bigint, text) to anon, authenticated;
grant execute on function public.car_issue_seen(text, bigint[]) to anon, authenticated;
