-- Inkorg för förare + gemensam ärendelista för admin + samma statusord överallt (2026-11-06, Christians "kör" t962u)
-- Bara tillägg:
--   * två nya kolumner (null som standard) i public.event_notices: case_kind, case_id
--   * en ny tabell public.case_reads (senast läst för sjukanmälan och önskemål)
--   * en ny trigger på event_notices som kopplar en ny notis till ärendet den gäller (ändrar aldrig något annat,
--     och om något går fel sparas notisen ändå som förut)
--   * nya funktioner: private.case_st, public.case_inbox, public.case_get, public.case_seen, public.case_admin_list
-- En befintlig funktion byts ut med samma signatur och samma fält + två nya (case_kind, case_id):
--   public.notis_feed
-- Ångra: supabase/migrations/undo/20261106f_inkorg_arenden_undo.sql och docs/inkorg/UNDO.md
--
-- Statusord (samma överallt):  ny = Ny, pagar = Pågår, vantar = Väntar på svar, klar = Klar
-- De gamla statusvärdena i tabellerna ändras INTE. Översättningen görs i private.case_st (och samma tabell i appen).
--
-- Ärendetyper (case_kind):  issue = felanmälan / behövs till bilen (car_issues)
--                           wh    = verkstadstid (workshop_hours)
--                           task  = uppgift (car_tasks)
--                           sjuk  = sjukanmälan (private.sick_reports, bara med flaggan 'sjuk')
--                           wish  = önskemål (dev_wishes)

-- 1) Koppling notis → ärende
alter table public.event_notices add column if not exists case_kind text;
alter table public.event_notices add column if not exists case_id bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_notices_case_kind_check') then
    alter table public.event_notices add constraint event_notices_case_kind_check
      check (case_kind is null or case_kind in ('issue', 'wh', 'task', 'sjuk', 'wish'));
  end if;
end $$;
create index if not exists event_notices_case_idx on public.event_notices (driver_id, case_kind, case_id) where case_kind is not null;

-- 2) Senast läst (för ärenden som inte har en egen läst-tabell)
create table if not exists public.case_reads (
  kind text not null check (kind in ('wh', 'task', 'sjuk', 'wish')),
  case_id bigint not null,
  driver_id text not null,
  read_at timestamptz not null default clock_timestamp(),
  primary key (kind, case_id, driver_id)
);
alter table public.case_reads enable row level security;   -- inga policies: bara via RPC:erna nedan
revoke all on public.case_reads from anon, authenticated;
drop trigger if exists zz_demo_write_guard on public.case_reads;
create trigger zz_demo_write_guard before insert or delete or update on public.case_reads
  for each statement execute function private.demo_write_guard();

-- 3) Ny notis: koppla till ärendet som ändrades i samma transaktion (samma RPC-anrop).
--    now() = transaktionens start, så bara rader som just ändrats räknas. Fel här stoppar aldrig notisen.
create or replace function private.event_notice_case_tag()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare k text := coalesce(new.kind, ''); v bigint; kk text;
begin
  if new.case_kind is not null then return new; end if;
  begin
    if k like 'bil_wh%' then
      kk := 'wh';
      select w.id into v from public.workshop_hours w
       where w.updated_at >= now() or w.created_at >= now()
       order by greatest(w.updated_at, w.created_at) desc, w.id desc limit 1;
    elsif k like 'bil_task%' then
      kk := 'task';
      select t.id into v from public.car_tasks t
       where t.company_id = new.company_id and (t.updated_at >= now() or t.created_at >= now())
       order by greatest(t.updated_at, t.created_at) desc, t.id desc limit 1;
    elsif k in ('bil_status', 'bil_issue_msg', 'bil_fault', 'bil_stop', 'bil_supply') then
      kk := 'issue';
      select i.id into v from public.car_issues i
       where i.company_id = new.company_id and (i.updated_at >= now() or i.created_at >= now())
       order by greatest(i.updated_at, i.created_at) desc, i.id desc limit 1;
    end if;
    if v is not null then new.case_kind := kk; new.case_id := v; end if;
  exception when others then
    null;   -- notisen sparas ändå, bara utan koppling
  end;
  return new;
end $function$;
drop trigger if exists aa_case_tag on public.event_notices;
create trigger aa_case_tag before insert on public.event_notices
  for each row execute function private.event_notice_case_tag();

-- 4) Samma statusord överallt. p_kind: issue | wh | task | sjuk | wish | forum. p_waiting: workshop_hours.waiting_on
create or replace function private.case_st(p_kind text, p_status text, p_waiting text default null)
 returns text language sql immutable
as $function$
  select case p_kind
    when 'issue' then case p_status when 'ny' then 'ny' when 'pagar' then 'pagar' else 'klar' end
    when 'wh'    then case when p_status = 'pending' then case p_waiting when 'driver' then 'vantar' when 'owner' then 'pagar' else 'ny' end
                       else 'klar' end
    when 'task'  then case p_status when 'ny' then 'vantar' when 'bokad' then 'pagar' else 'klar' end
    when 'sjuk'  then case p_status when 'ny' then 'ny' when 'intyg_begart' then 'vantar' else 'klar' end
    when 'wish'  then case p_status when 'ny' then 'ny' when 'last' then 'pagar' when 'planerad' then 'pagar' else 'klar' end
    when 'forum' then case p_status when 'ny' then 'ny' when 'pagar' then 'pagar' when 'planerad' then 'pagar' when 'klar' then 'klar' end
  end
$function$;

-- Olästa notiser som hör till ett ärende (för en person)
create or replace function private.case_unread_notices(p_me text, p_kind text, p_id bigint)
 returns integer language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::int from public.event_notices e
   where e.driver_id = p_me and e.case_kind = p_kind and e.case_id = p_id and e.read_at is null
$function$;

create or replace function private.case_cut(p text, n int default 80)
 returns text language sql immutable
as $function$
  select case when p is null or btrim(p) = '' then null
              when char_length(btrim(p)) > n then left(regexp_replace(btrim(p), '\s+', ' ', 'g'), n - 1) || '…'
              else regexp_replace(btrim(p), '\s+', ' ', 'g') end
$function$;

-- 5) Förarens inkorg: mina egna ärenden. Inget göms för att det är gammalt: alla öppna + de senaste p_klar_limit klara
--    (appen hämtar fler klara med "Visa fler"). klar_total = antal klara totalt.
create or replace function public.case_inbox(p_token text, p_klar_limit integer default 300)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; r jsonb; v_sjuk boolean; v_lim integer := least(greatest(coalesce(p_klar_limit, 300), 1), 5000);
begin
  select * into a from private.bil_actor(p_token);
  if private.is_demo() then return jsonb_build_object('items', '[]'::jsonb, 'unread', 0, 'needs', 0); end if;
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
  )
  select jsonb_build_object(
      'items', coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'id', x.id, 'title', x.title, 'car', x.car, 'txt', x.txt,
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

-- 6) Ett ärende med hela tråden. Föraren: bara sina egna. Ägaren/S admin: åkeriets.
create or replace function public.case_get(p_token text, p_kind text, p_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; s record; i public.car_issues; w public.workshop_hours; t public.car_tasks; d public.dev_wishes; sr private.sick_reports; j jsonb; v_st text;
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

-- 7) Läst: markerar ärendet som läst och tar bort klockans notiser som hör till ärendet. Demo: gör ingenting.
create or replace function public.case_seen(p_token text, p_kind text, p_id bigint)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
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
  elsif p_kind = 'sjuk' then
    ok := private.has_feature(a.driver_id, 'sjuk') and exists (select 1 from private.sick_reports s where s.id = p_id
            and (s.driver_id = a.driver_id or (a.category = any (private.workshop_roles()) and private.actor_company(s.driver_id) = a.company_id)));
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

-- 8) Gemensam ärendelista för ägaren/S admin (alla admin ser samma lista). Öppna först, alla klara finns kvar
--    (de senaste p_klar_limit skickas, appen hämtar fler). Önskemål finns med (Christians ja 6 nov).
--    needs = "Behöver ditt svar": nytt ärende, eller föraren skrev senast / svarade på en fråga.
create or replace function public.case_admin_list(p_token text, p_klar_limit integer default 300)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; r jsonb; v_sjuk boolean; v_lim integer := least(greatest(coalesce(p_klar_limit, 300), 1), 5000);
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  if private.is_demo() then return jsonb_build_object('items', '[]'::jsonb); end if;
  v_sjuk := private.has_feature(a.driver_id, 'sjuk') and a.category = any (private.workshop_roles());
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
     where a.category = any (private.workshop_roles()) and private.actor_company(w.driver_id) = a.company_id
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

-- 9) notis_feed: exakt som förut + case_kind och case_id (så att klockan kan öppna rätt tråd i Inkorgen)
create or replace function public.notis_feed(p_token text, p_limit integer default 80)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; v_lim integer := least(greatest(coalesce(p_limit, 80), 1), 150); r jsonb; u integer;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then return jsonb_build_object('items', '[]'::jsonb, 'unread', 0); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]') into r from (
    select * from (
      (select 'p'::text src, p.id, p.kind, p.tag, p.title, p.body, p.created_at, p.read_at is not null as read, p.nkey, p.target,
              null::bigint event_id, null::bigint forum_post_id, null::text case_kind, null::bigint case_id
         from public.push_notices p where p.driver_id = a.driver_id order by p.created_at desc limit v_lim)
      union all
      (select 'e'::text, e.id, e.kind, null::text, null::text, e.body, e.created_at, e.read_at is not null, null::text, null::jsonb,
              e.event_id, e.forum_post_id, e.case_kind, e.case_id
         from public.event_notices e where e.driver_id = a.driver_id order by e.created_at desc limit v_lim)
    ) y order by created_at desc limit v_lim) x;
  select (select count(*) from public.push_notices where driver_id = a.driver_id and read_at is null)
       + (select count(*) from public.event_notices where driver_id = a.driver_id and read_at is null) into u;
  return jsonb_build_object('items', r, 'unread', u);
end $function$;

revoke all on function private.event_notice_case_tag() from public, anon, authenticated;
revoke all on function private.case_st(text, text, text) from public, anon, authenticated;
revoke all on function private.case_unread_notices(text, text, bigint) from public, anon, authenticated;
revoke all on function private.case_cut(text, int) from public, anon, authenticated;
revoke all on function public.case_inbox(text, integer) from public;
revoke all on function public.case_get(text, text, bigint) from public;
revoke all on function public.case_seen(text, text, bigint) from public;
revoke all on function public.case_admin_list(text, integer) from public;
grant execute on function public.case_inbox(text, integer) to anon, authenticated;
grant execute on function public.case_get(text, text, bigint) to anon, authenticated;
grant execute on function public.case_seen(text, text, bigint) to anon, authenticated;
grant execute on function public.case_admin_list(text, integer) to anon, authenticated;
