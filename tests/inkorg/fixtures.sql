create role anon; create role authenticated;
create schema private;
create table public.drivers (id text primary key, first_name text, last_name text, category text, activated boolean default true, company text default 'default');
create table public.sessions (token text primary key, driver_id text);
create function private.is_demo() returns boolean language sql as $$ select false $$;
create function private.session_actor(p_token text, out driver_id text, out category text, out via_master boolean) language plpgsql as $$
begin select d.id, d.category, false into driver_id, category, via_master from public.sessions s join public.drivers d on d.id=s.driver_id where s.token=p_token;
 if driver_id is null then raise exception 'invalid_session' using errcode='28000'; end if; end $$;
create function private.actor_company(p_driver text) returns text language sql as $$ select company from public.drivers where id=p_driver $$;
create function private.bil_admin_roles() returns text[] language sql immutable as $$ select array['agare','superadmin'] $$;
create function private.workshop_roles() returns text[] language sql immutable as $$ select array['agare','superadmin'] $$;
create function private.bil_actor(p_token text, OUT driver_id text, OUT category text, OUT company_id text, OUT is_admin boolean, OUT via_master boolean) language plpgsql as $$
declare a record; begin select * into a from private.session_actor(p_token);
 driver_id:=a.driver_id; category:=a.category; via_master:=false; company_id:=private.actor_company(a.driver_id); is_admin:=a.category = any(private.bil_admin_roles()); end $$;
create function private.bil_driver_name(p_id text) returns text language sql as $$ select first_name||' '||left(last_name,1) from public.drivers where id=p_id $$;
create function private.has_feature(p_driver text, p_feature text) returns boolean language sql as $$ select true $$;
create function private.demo_write_guard() returns trigger language plpgsql as $$ begin return null; end $$;
create function private.bil_supply_label(t text) returns text language sql as $$ select case t when 'kvitto' then 'Kvittorullar' when 'spolar' then 'Spolarvätska' else 'Behövs' end $$;
create table public.car_issues (id bigserial primary key, company_id text, car_id bigint, car_label text, kind text, supply_type text, body text, blocking boolean default false, status text default 'ny', reported_by text, status_by text, status_at timestamptz, status_comment text, closed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.car_issue_messages (id bigserial primary key, issue_id bigint, sender_id text, sender_role text, body text, created_at timestamptz default clock_timestamp());
create table public.car_issue_reads (issue_id bigint, driver_id text, read_at timestamptz default clock_timestamp(), primary key(issue_id, driver_id));
create table public.workshop_hours (id bigserial primary key, driver_id text, start_at timestamptz, end_at timestamptz, car_id bigint, car_label text, comment text, status text default 'pending', rate numeric, decided_by text, decided_at timestamptz, decision_comment text, created_at timestamptz default now(), updated_at timestamptz default now(), issue_id bigint, waiting_on text);
create table public.workshop_messages (id bigserial primary key, hours_id bigint, sender_id text, sender_role text, kind text default 'msg', body text, created_at timestamptz default now());
create table public.car_tasks (id bigserial primary key, company_id text, car_label text, assigned_to text, title text, instruction text, status text default 'ny', reply text, created_at timestamptz default now(), updated_at timestamptz default now());
create table private.sick_reports (id bigint generated always as identity primary key, driver_id text, start_date date, end_date date, comment text, status text default 'ny', status_comment text, status_by text, status_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.dev_wishes (id bigserial primary key, company_id text, author_id text, body text, status text default 'ny', reply text, created_at timestamptz default clock_timestamp(), updated_at timestamptz default clock_timestamp());
create table public.event_notices (id bigserial primary key, company_id text, driver_id text, event_id bigint, kind text default 'reminder', body text, created_at timestamptz default now(), read_at timestamptz, forum_post_id bigint);
create table public.push_notices (id bigserial primary key, driver_id text, nkey text, kind text, tag text, title text, body text, created_at timestamptz default now(), read_at timestamptz, target jsonb);
create function private.bil_issue_unread(p_issue bigint, p_reporter text, p_me text) returns integer language sql as $$
  select count(*)::int from public.car_issue_messages m where m.issue_id = p_issue and m.sender_id is distinct from p_me
     and m.sender_role = case when p_reporter = p_me then 'owner' else 'driver' end
     and m.created_at > coalesce((select r.read_at from public.car_issue_reads r where r.issue_id = p_issue and r.driver_id = p_me), '-infinity'::timestamptz) $$;
create function private.bil_issue_json(i car_issues, p_me text, p_admin boolean, p_named boolean) returns jsonb language sql as $$ select to_jsonb(i) || jsonb_build_object('msgs', (select coalesce(jsonb_agg(to_jsonb(m)),'[]') from car_issue_messages m where m.issue_id=i.id)) $$;
create function private.wh_minutes(w workshop_hours) returns integer language sql as $$ select (extract(epoch from w.end_at - w.start_at)/60)::int $$;
create function private.workshop_rate() returns numeric language sql as $$ select 250::numeric $$;
create function private.wh_json(w workshop_hours, p_rate numeric) returns jsonb language sql as $$ select to_jsonb(w) $$;
create function private.bil_task_json(t car_tasks, p_me text, p_owner boolean) returns jsonb language sql as $$ select to_jsonb(t) $$;
create function private.sjuk_actor(p_token text, OUT driver_id text, OUT category text, OUT via_master boolean, OUT boss boolean) language plpgsql as $$
declare a record; begin select * into a from private.session_actor(p_token); driver_id:=a.driver_id; category:=a.category; via_master:=false; boss:=a.category = any(private.workshop_roles()); end $$;
create function private.sjuk_report_for(p_driver text, p_boss boolean, p_id bigint) returns private.sick_reports language plpgsql as $$
declare r private.sick_reports; begin select * into r from private.sick_reports where id=p_id and (p_boss or driver_id=p_driver); if not found then raise exception 'not_found'; end if; return r; end $$;
create function private.sjuk_json(r private.sick_reports, p_boss boolean) returns jsonb language sql as $$ select to_jsonb(r) $$;
create function private.dev_wish_json(w public.dev_wishes, p_me text) returns jsonb language sql as $$ select to_jsonb(w) $$;
-- an RPC like car_issue_message (owner reply) to test tagging
create function public.owner_reply(p_issue bigint, p_me text, p_body text) returns void language plpgsql as $$
declare i car_issues; begin
 insert into car_issue_messages(issue_id,sender_id,sender_role,body) values (p_issue,p_me,'owner',p_body);
 update car_issues set updated_at=now() where id=p_issue returning * into i;
 insert into event_notices(company_id,driver_id,kind,body) values (i.company_id,i.reported_by,'bil_issue_msg','💬 Ägaren svarade');
end $$;

-- Synthetic schema additions required by the draft. No real user/session data.
create table public.cars(id bigint primary key, bilnummer text);
create table public.car_maintenance(id bigint primary key, company_id text, car_id bigint, mtype text, title text, note text, status text, suggested_by text, created_by text, created_at timestamptz default now(), updated_at timestamptz default now(), due_date date, due_km int, done_date date, done_comment text);
create function private.bil_mtype_label(t text, title text) returns text language sql as $$select coalesce(title,t)$$;
create function private.bil_car_km(id bigint) returns integer language sql as $$select 10000$$;
create function private.bil_maint_json(m public.car_maintenance, km integer, admin boolean) returns jsonb language sql as $$select to_jsonb(m)$$;
create table private.sjuk_push_queue(recipient text,title text,body text,tag text);
create table private.feature_flags(driver_id text,feature text);
create function private.log(text,text,text,text,jsonb,boolean) returns void language sql as $$select$$;

create function private.sjuk_today() returns date language sql as $$select current_date$$;
