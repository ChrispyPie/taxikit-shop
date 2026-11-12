-- 2026-11-12svar2: Bokad tid på en felanmälan (Felanmälan / Bilen står / Behövs).
-- Inget nytt bokningssystem: bokningen ligger i inbox_private.bookings på en vanlig mailbox-tråd till den som
-- anmälde. Tråden kopplas till ärendet i inbox_private.issue_threads (en tråd per ärende, länk – ingen kopia).
-- Bekräfta/Avböj går som förut via mailbox_v2 'decide'. Schemat/Prognos (mailbox_v2 'timeline') läser
-- bokningarna via trådens driver_id = anmälaren, så grått→fast fungerar som för andra bokade tider.
-- Ej körd vid commit. Ångra: undo/20261112d_arende_bokad_tid_undo.sql
begin;

create table if not exists inbox_private.issue_threads (
 issue_id bigint primary key references public.car_issues(id) on delete cascade,
 thread_id bigint not null unique references inbox_private.threads(id) on delete cascade,
 company_id text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists mb_issue_threads_company on inbox_private.issue_threads(company_id);
alter table inbox_private.issue_threads enable row level security;
revoke all on table inbox_private.issue_threads from public, anon, authenticated;

-- p_action:
--   'get'   {issue_id}                         → {thread_id, is_driver, bookings[]} (markerar tråden läst)
--   'book'  {issue_id,kind,date,time,body,car_choice} → hitta/skapa tråd för ärendet, sedan dispatch 'book'
--   'links' {}                                 → [{issue_id,thread_id,booking_states,next_at,unread}] för listan
-- p_data.admin = true kräver admin på åkeriet (samma regel som mailbox_v2).
create or replace function public.issue_booking(p_token text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; i public.car_issues; t inbox_private.threads; v_admin boolean := coalesce((p_data->>'admin')::boolean, false);
 v_thread bigint; v_subject text;
begin
 select * into a from private.bil_actor(p_token);
 if not exists(select 1 from public.drivers d where d.id = a.driver_id and coalesce(d.activated, false)) then raise exception 'forbidden' using errcode = '42501'; end if;
 if a.category not in ('standard','semester','admin','agare','superadmin') then raise exception 'forbidden' using errcode = '42501'; end if;
 if v_admin and not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;

 if p_action = 'links' then
  return coalesce((select jsonb_agg(jsonb_build_object('issue_id', l.issue_id, 'thread_id', l.thread_id,
     'booking_states', coalesce((select jsonb_agg(bk.status order by bk.created_at, bk.id) from inbox_private.bookings bk where bk.thread_id = l.thread_id), '[]'),
     'next_at', (select min(bk.starts_at) from inbox_private.bookings bk where bk.thread_id = l.thread_id and bk.status in ('pending_driver','pending_admin','accepted') and bk.starts_at > clock_timestamp()),
     'unread', exists(select 1 from inbox_private.messages m where m.thread_id = l.thread_id and m.sender_id <> a.driver_id
        and m.created_at > coalesce((select r.seen_at from inbox_private.reads r where r.thread_id = l.thread_id and r.driver_id = a.driver_id), '-infinity'::timestamptz))))
   from inbox_private.issue_threads l join public.car_issues ci on ci.id = l.issue_id
   where l.company_id = a.company_id and ci.company_id = a.company_id and (v_admin or ci.reported_by = a.driver_id)), '[]');
 end if;

 -- Samma behörighet som car_issue_message: admin på åkeriet, eller den som anmälde.
 select * into i from public.car_issues where id = (p_data->>'issue_id')::bigint and company_id = a.company_id for update;
 if not found or not (v_admin or i.reported_by = a.driver_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
 select l.thread_id into v_thread from inbox_private.issue_threads l where l.issue_id = i.id and l.company_id = a.company_id;

 if p_action = 'get' then
  if v_thread is not null then
   insert into inbox_private.reads(thread_id, driver_id, seen_at) values(v_thread, a.driver_id, clock_timestamp())
   on conflict(thread_id, driver_id) do update set seen_at = excluded.seen_at;
  end if;
  return jsonb_build_object('thread_id', v_thread, 'is_driver', i.reported_by = a.driver_id,
   'bookings', coalesce((select jsonb_agg(to_jsonb(bk) - 'proposed_by' - 'decided_by' order by bk.created_at, bk.id) from inbox_private.bookings bk where bk.thread_id = v_thread), '[]'));
 elsif p_action = 'book' then
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  -- Låst ärende (ägaren har raderat det) är bara läsning för föraren, precis som i Ärenden.
  if not v_admin and exists(select 1 from inbox_private.party_deletions d where d.company_id = a.company_id and d.kind = 'issue' and d.item_id = i.id and (d.owner_hidden or d.owner_permanent)) then
   raise exception 'thread_closed' using errcode = '42501';
  end if;
  if v_thread is null then
   if not exists(select 1 from public.drivers d where d.id = i.reported_by and d.activated and private.actor_company(d.id) = a.company_id) then raise exception 'bad_recipient' using errcode = '22023'; end if;
   v_subject := left(case when i.kind = 'fault' then case when i.blocking then 'Bilen står' else 'Felanmälan' end else coalesce(private.bil_supply_label(i.supply_type), 'Behövs till bilen') end
                || coalesce(' · bil ' || i.car_label, ''), 120);
   insert into inbox_private.threads(company_id, driver_id, subject, car_number, car_id, created_by)
   values(a.company_id, i.reported_by, v_subject, nullif(left(btrim(coalesce(i.car_label, '')), 80), ''), i.car_id, a.driver_id) returning * into t;
   insert into inbox_private.issue_threads(issue_id, thread_id, company_id) values(i.id, t.id, a.company_id);
   v_thread := t.id;
  end if;
  -- dispatch gör resten: token, admin/förare på tråden, datum, bil, gränser, systemrad och status pending_*.
  perform inbox_private.dispatch(p_token, 'book', (p_data - 'issue_id' - 'driver_id') || jsonb_build_object('thread_id', v_thread, 'admin', v_admin));
  return jsonb_build_object('thread_id', v_thread, 'issue_id', i.id);
 end if;
 raise exception 'bad_action' using errcode = '22023';
end $$;
revoke all on function public.issue_booking(text, text, jsonb) from public;
grant execute on function public.issue_booking(text, text, jsonb) to anon, authenticated;

commit;
