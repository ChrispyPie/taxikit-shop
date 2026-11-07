-- DRAFT, not applied. Additive storage; old data is never deleted.
begin;
create schema if not exists inbox_private;
revoke all on schema inbox_private from public;
grant usage on schema inbox_private to anon, authenticated;
create table if not exists inbox_private.threads (
 id bigint generated always as identity primary key, company_id text not null, driver_id text not null references public.drivers(id),
 subject text not null check(char_length(btrim(subject)) between 1 and 120),
 car_number text check(car_number ~ '^[0-9]{1,3}$'), created_by text not null references public.drivers(id),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create table if not exists inbox_private.messages (
 id bigint generated always as identity primary key, thread_id bigint not null references inbox_private.threads(id),
 sender_id text not null references public.drivers(id), sender_role text not null check(sender_role in ('driver','admin','system')),
 body text not null check(char_length(btrim(body)) between 1 and 2000), created_at timestamptz not null default clock_timestamp()
);
create table if not exists inbox_private.reads (
 thread_id bigint not null references inbox_private.threads(id), driver_id text not null references public.drivers(id), seen_at timestamptz not null,
 primary key(thread_id,driver_id)
);
create table if not exists inbox_private.bookings (
 id bigint generated always as identity primary key, thread_id bigint not null references inbox_private.threads(id),
 kind text not null check(char_length(btrim(kind)) between 1 and 120), title text not null check(char_length(btrim(title)) between 1 and 120),
 starts_at timestamptz not null, car_number text check(car_number ~ '^[0-9]{1,3}$'),
 status text not null check(status in ('pending_driver','pending_admin','accepted','declined')),
 proposer_role text not null check(proposer_role in ('driver','admin')), proposed_by text not null references public.drivers(id),
 created_at timestamptz not null default clock_timestamp(), decided_by text references public.drivers(id), decided_at timestamptz, reason text check(char_length(reason)<=500)
);
-- Explicit taxi-company mapping, not 'all app users'. Existing åkerier are Taxi Göteborg.
-- New åkerier must be assigned explicitly; absent mappings never grant cross-åkeri contact access.
create table if not exists inbox_private.bolag(slug text primary key,label text not null);
create table if not exists inbox_private.operator_companies(company_id text primary key,bolag_slug text not null references inbox_private.bolag(slug));
insert into inbox_private.bolag(slug,label) values('taxi-goteborg','Taxi Göteborg') on conflict do nothing;
insert into inbox_private.operator_companies(company_id,bolag_slug)
 select distinct private.actor_company(d.id),'taxi-goteborg' from public.drivers d where private.actor_company(d.id) is not null on conflict do nothing;
create table if not exists inbox_private.contacts (
 driver_id text primary key references public.drivers(id), cars text[] not null default '{}',
 phone_visibility text not null default 'owner' check(phone_visibility in ('owner','company','bolag'))
);
create index if not exists mb_threads_company_at on inbox_private.threads(company_id,updated_at desc);
create index if not exists mb_threads_driver_at on inbox_private.threads(driver_id,updated_at desc);
create index if not exists mb_messages_thread_at on inbox_private.messages(thread_id,created_at,id);
create index if not exists mb_bookings_thread_at on inbox_private.bookings(thread_id,starts_at);
create index if not exists mb_threads_creator_at on inbox_private.threads(created_by,created_at);
create index if not exists mb_messages_sender_at on inbox_private.messages(sender_id,created_at);
create index if not exists mb_bookings_proposer_at on inbox_private.bookings(proposed_by,created_at);
alter table inbox_private.threads enable row level security;
alter table inbox_private.messages enable row level security;
alter table inbox_private.reads enable row level security;
alter table inbox_private.bookings enable row level security;
alter table inbox_private.contacts enable row level security;
alter table inbox_private.bolag enable row level security;
alter table inbox_private.operator_companies enable row level security;
revoke all on all tables in schema inbox_private from public,anon,authenticated;
revoke all on all sequences in schema inbox_private from public,anon,authenticated;

-- The only client entry point in this unexposed schema. No authorization from user_metadata.
create or replace function inbox_private.dispatch(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a record; t inbox_private.threads; b inbox_private.bookings; v_admin boolean:=coalesce((p_data->>'admin')::boolean,false);
 v_driver text; v_body text; v_title text; v_car text; v_kind text; v_role text; v_at timestamptz; v_result jsonb;
 v_phone text; v_visibility text; v_cars text[]; v_same boolean; v_same_bolag boolean; v_company_label text; v_contact inbox_private.contacts; v_id bigint;
begin
 select * into a from private.bil_actor(p_token);
 if not exists(select 1 from public.drivers d where d.id=a.driver_id and coalesce(d.activated,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if a.category not in ('standard','semester','admin','agare','superadmin') then raise exception 'forbidden' using errcode='42501'; end if;
 if v_admin and not a.is_admin then raise exception 'forbidden' using errcode='42501'; end if;
 if private.is_demo() then raise exception 'demo_read_only' using errcode='42501'; end if;
 v_role:=case when v_admin then 'admin' else 'driver' end;
 if p_action='contacts_get' then
   v_driver:=coalesce(nullif(p_data->>'driver_id',''),a.driver_id);
   select d.phone into v_phone from public.drivers d where d.id=v_driver and coalesce(d.activated,false);
   if not found then raise exception 'not_found' using errcode='P0002'; end if;
   select * into v_contact from inbox_private.contacts where driver_id=v_driver;
   v_visibility:=coalesce(v_contact.phone_visibility,'owner'); v_same:=private.actor_company(v_driver)=a.company_id;
   select bo.label into v_company_label from inbox_private.operator_companies c join inbox_private.bolag bo on bo.slug=c.bolag_slug where c.company_id=a.company_id;
   v_same_bolag:=exists(select 1 from inbox_private.operator_companies c join inbox_private.operator_companies target on target.bolag_slug=c.bolag_slug where c.company_id=a.company_id and target.company_id=private.actor_company(v_driver));
   return jsonb_build_object('cars',case when v_same or a.category='superadmin' then coalesce((select jsonb_agg(jsonb_build_object('number',x,'phone','+46707650'||lpad(x,3,'0'))) from unnest(coalesce(v_contact.cars,'{}')) x),'[]') else '[]'::jsonb end,
     'phone',case when v_driver=a.driver_id or a.category='superadmin' or (v_same and a.category='agare') or (v_same_bolag and v_visibility='bolag') or (v_same and v_visibility='company') then v_phone end,
     'visibility',case when v_driver=a.driver_id then v_visibility end,'company_label',coalesce(v_company_label,'Taxibolaget'));
 elsif p_action in ('contacts_save','profile_save') then
   if a.via_master then raise exception 'forbidden' using errcode='42501'; end if;
   select * into v_contact from inbox_private.contacts where driver_id=a.driver_id;
   v_visibility:=coalesce(p_data->>'visibility',v_contact.phone_visibility,'owner');
   if v_visibility not in ('owner','company','bolag') then raise exception 'bad_visibility' using errcode='22023'; end if;
   v_cars:=coalesce(v_contact.cars,'{}');
   if p_data ? 'cars' then
     if jsonb_typeof(p_data->'cars')<>'array' or jsonb_array_length(p_data->'cars')>30 then raise exception 'bad_car_number' using errcode='22023'; end if;
     if exists(select 1 from jsonb_array_elements_text(p_data->'cars') x where x is null or x !~ '^[0-9]{1,3}$') then raise exception 'bad_car_number' using errcode='22023'; end if;
     select coalesce(array_agg(distinct (x::int)::text),'{}') into v_cars from jsonb_array_elements_text(p_data->'cars') x;
   end if;
   insert into inbox_private.contacts(driver_id,cars,phone_visibility) values(a.driver_id,v_cars,v_visibility)
     on conflict(driver_id) do update set cars=excluded.cars,phone_visibility=excluded.phone_visibility;
   -- Existing required contact validation and the visibility change commit atomically.
   if p_action='profile_save' then perform public.save_my_profile(p_token,p_data->'profile'); end if;
   return inbox_private.dispatch(p_token,'contacts_get','{}');
 elsif p_action='recipients' then
   if not v_admin then raise exception 'forbidden' using errcode='42501'; end if;
   return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',private.bil_driver_name(d.id)) order by d.id)
     from public.drivers d where d.activated and private.actor_company(d.id)=a.company_id and d.category in ('standard','semester','admin','agare','superadmin')),'[]');
 elsif p_action='timeline' then
   return coalesce((select jsonb_agg(jsonb_build_object('id',bk.id,'thread_id',bk.thread_id,'title',bk.title,'kind',bk.kind,'car_number',bk.car_number,'at',bk.starts_at,'status',bk.status) order by bk.starts_at)
     from inbox_private.bookings bk join inbox_private.threads th on th.id=bk.thread_id
     where th.driver_id=a.driver_id and th.company_id=a.company_id and bk.status<>'declined' and bk.starts_at>clock_timestamp()-interval '2 hours' and bk.starts_at<clock_timestamp()+interval '1 year'),'[]');
 elsif p_action='list' then
   return coalesce((select jsonb_agg(j order by at desc,id desc) from (
     select th.id,th.updated_at at,jsonb_build_object('id',th.id,'subject',th.subject,'car_number',th.car_number,'at',th.updated_at,
       'name',case when v_admin then private.bil_driver_name(th.driver_id) else 'Admin' end,
       'last_body',(select m.body from inbox_private.messages m where m.thread_id=th.id order by m.created_at desc,m.id desc limit 1),
       'unread',exists(select 1 from inbox_private.messages m where m.thread_id=th.id and m.sender_id<>a.driver_id and m.created_at>coalesce((select r.seen_at from inbox_private.reads r where r.thread_id=th.id and r.driver_id=a.driver_id),'-infinity'::timestamptz))) j
     from inbox_private.threads th where th.company_id=a.company_id and (v_admin or (th.driver_id=a.driver_id and a.category not in ('agare','superadmin')))
   ) q),'[]');
 elsif p_action in ('create','book') and nullif(p_data->>'thread_id','') is null then
   v_driver:=case when v_admin then p_data->>'driver_id' else a.driver_id end;
   if not exists(select 1 from public.drivers d where d.id=v_driver and d.activated and private.actor_company(d.id)=a.company_id and d.category in ('standard','semester','admin','agare','superadmin')) then raise exception 'bad_recipient' using errcode='22023'; end if;
   v_title:=case when p_action='book' then btrim(coalesce(p_data->>'kind','')) else btrim(coalesce(p_data->>'subject','')) end;
   v_car:=nullif(btrim(p_data->>'car_number'),'');
   if char_length(v_title) not between 1 and 120 then raise exception 'bad_subject' using errcode='22023'; end if;
   if v_car is not null and v_car !~ '^[0-9]{1,3}$' then raise exception 'bad_car_number' using errcode='22023'; end if;
   if (select count(*) from inbox_private.threads where created_by=a.driver_id and created_at>clock_timestamp()-interval '1 day')>=100 then raise exception 'too_many' using errcode='54000'; end if;
   insert into inbox_private.threads(company_id,driver_id,subject,car_number,created_by) values(a.company_id,v_driver,v_title,v_car,a.driver_id) returning * into t;
   if p_action='create' then
     v_body:=btrim(coalesce(p_data->>'body',''));
     if char_length(v_body) not between 1 and 2000 then raise exception 'bad_text' using errcode='22023'; end if;
     insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,v_role,v_body);
     return jsonb_build_object('id',t.id);
   end if;
 else
   if p_action='decide' then
     select * into b from inbox_private.bookings where id=(p_data->>'booking_id')::bigint for update;
     if not found then raise exception 'not_found' using errcode='P0002'; end if;
     v_id:=b.thread_id;
   else v_id:=(p_data->>'thread_id')::bigint; end if;
   select * into t from inbox_private.threads where id=v_id and company_id=a.company_id and (v_admin or (driver_id=a.driver_id and a.category not in ('agare','superadmin')));
   if not found then raise exception 'not_found' using errcode='P0002'; end if;
 end if;
 if p_action='get' then
   insert into inbox_private.reads(thread_id,driver_id,seen_at) values(t.id,a.driver_id,clock_timestamp()) on conflict(thread_id,driver_id) do update set seen_at=excluded.seen_at;
   return jsonb_build_object('id',t.id,'subject',t.subject,'car_number',t.car_number,'driver_id',case when v_admin then t.driver_id end,'is_driver',t.driver_id=a.driver_id,
     'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'role',m.sender_role,'mine',m.sender_id=a.driver_id,'at',m.created_at) order by m.created_at,m.id) from inbox_private.messages m where m.thread_id=t.id),'[]'),
     'bookings',coalesce((select jsonb_agg(to_jsonb(bk) - 'proposed_by' - 'decided_by' order by bk.created_at,bk.id) from inbox_private.bookings bk where bk.thread_id=t.id),'[]'));
 elsif p_action='reply' then
   v_body:=btrim(coalesce(p_data->>'body',''));
   if char_length(v_body) not between 1 and 2000 then raise exception 'bad_text' using errcode='22023'; end if;
   if (select count(*) from inbox_private.messages where sender_id=a.driver_id and created_at>clock_timestamp()-interval '1 day')>=200 then raise exception 'too_many' using errcode='54000'; end if;
   insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,v_role,v_body);
 elsif p_action='book' then
   v_kind:=btrim(coalesce(p_data->>'kind',''));v_title:=v_kind;v_car:=nullif(btrim(p_data->>'car_number'),'');
   if (v_car is null and coalesce(p_data->'car_unspecified','false'::jsonb)<>'true'::jsonb) or (v_car is not null and p_data->'car_unspecified'='true'::jsonb) then raise exception 'need_car_number' using errcode='22023'; end if;
   v_body:=btrim(coalesce(p_data->>'body',''));
   if char_length(v_body)>2000 then raise exception 'bad_text' using errcode='22023'; end if;
   if char_length(v_title) not between 1 and 120 or char_length(v_kind) not between 1 and 120 then raise exception 'bad_subject' using errcode='22023'; end if;
   if v_car is not null and v_car !~ '^[0-9]{1,3}$' then raise exception 'bad_car_number' using errcode='22023'; end if;
   if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_data->>'time','') !~ '^\d{2}:\d{2}$' then raise exception 'bad_date' using errcode='22023'; end if;
   begin
     v_at:=((p_data->>'date')||' '||(p_data->>'time'))::timestamp at time zone 'Europe/Stockholm';
   exception when datetime_field_overflow or invalid_datetime_format then raise exception 'bad_date' using errcode='22023'; end;
   if v_at<=clock_timestamp() or v_at>clock_timestamp()+interval '2 years' or to_char(v_at at time zone 'Europe/Stockholm','YYYY-MM-DD HH24:MI')<>(p_data->>'date')||' '||(p_data->>'time') then raise exception 'bad_date' using errcode='22023'; end if;
   if (select count(*) from inbox_private.bookings where proposed_by=a.driver_id and created_at>clock_timestamp()-interval '1 day')>=100 then raise exception 'too_many' using errcode='54000'; end if;
   insert into inbox_private.bookings(thread_id,kind,title,starts_at,car_number,status,proposer_role,proposed_by)
     values(t.id,v_kind,v_title,v_at,v_car,case when v_admin then 'pending_driver' else 'pending_admin' end,v_role,a.driver_id);
   insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,'system','Bokad tid föreslagen: '||v_title);
   if v_body<>'' then insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,v_role,v_body); end if;
 elsif p_action='decide' then
   -- An owner who also drives answers their own invitation from Admin, not a second inbox.
   if v_admin and b.status='pending_driver' and t.driver_id=a.driver_id then v_admin:=false; end if;
   if b.status not in ('pending_driver','pending_admin') or (v_admin and b.status<>'pending_admin') or (not v_admin and b.status<>'pending_driver') then raise exception 'forbidden' using errcode='42501'; end if;
   if coalesce(p_data->>'decision','') not in ('accepted','declined') then raise exception 'bad_status' using errcode='22023'; end if;
   v_body:=nullif(btrim(p_data->>'reason'),'');
   if (p_data->>'decision'='declined' and (v_body is null or v_body !~ '[^[:space:]]')) or char_length(v_body)>500 then raise exception 'need_reason' using errcode='22023'; end if;
   update inbox_private.bookings set status=p_data->>'decision',decided_by=a.driver_id,decided_at=clock_timestamp(),reason=v_body where id=b.id;
   insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,'system',case when p_data->>'decision'='accepted' then 'Bokad tid godkänd: ' else 'Bokad tid avböjd: ' end||b.title||coalesce(' – '||v_body,''));
 else raise exception 'bad_action' using errcode='22023'; end if;
 update inbox_private.threads set updated_at=clock_timestamp() where id=t.id;
 return jsonb_build_object('id',t.id);
end $$;
revoke all on function inbox_private.dispatch(text,text,jsonb) from public;
grant execute on function inbox_private.dispatch(text,text,jsonb) to anon,authenticated;
create or replace function public.mailbox_v2(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select inbox_private.dispatch(p_token,p_action,p_data)$$;
revoke all on function public.mailbox_v2(text,text,jsonb) from public;
grant execute on function public.mailbox_v2(text,text,jsonb) to anon,authenticated;
-- Legacy direct conversations and car reports remain readable, never writable from old cached clients.
do $guard$ begin
 if to_regprocedure('public.car_issue_message(text, bigint, text)') is not null then execute 'revoke execute on function public.car_issue_message(text, bigint, text) from public,anon,authenticated'; end if;
 if to_regprocedure('public.conversation_create(text, text, text, text)') is not null then execute 'revoke execute on function public.conversation_create(text, text, text, text) from public,anon,authenticated'; end if;
 if to_regprocedure('messaging_private.conversation_create(text, text, text, text)') is not null then execute 'revoke execute on function messaging_private.conversation_create(text, text, text, text) from public,anon,authenticated'; end if;
 if to_regprocedure('public.conversation_reply(text, bigint, text)') is not null then execute 'revoke execute on function public.conversation_reply(text, bigint, text) from public,anon,authenticated'; end if;
 if to_regprocedure('messaging_private.conversation_reply(text, bigint, text)') is not null then execute 'revoke execute on function messaging_private.conversation_reply(text, bigint, text) from public,anon,authenticated'; end if;
 if to_regprocedure('public.delete_car_maintenance(text, bigint)') is not null then execute 'revoke execute on function public.delete_car_maintenance(text, bigint) from public,anon,authenticated'; end if;
 if to_regprocedure('public.done_car_maintenance(text, bigint, date, integer, numeric, text, boolean)') is not null then execute 'revoke execute on function public.done_car_maintenance(text, bigint, date, integer, numeric, text, boolean) from public,anon,authenticated'; end if;
 if to_regprocedure('public.message_send(text, text, text)') is not null then execute 'revoke execute on function public.message_send(text, text, text) from public,anon,authenticated'; end if;
 if to_regprocedure('messaging_private.message_send(text, text, text)') is not null then execute 'revoke execute on function messaging_private.message_send(text, text, text) from public,anon,authenticated'; end if;
 if to_regprocedure('public.move_car_issue_to_maint(text, bigint, text, text)') is not null then execute 'revoke execute on function public.move_car_issue_to_maint(text, bigint, text, text) from public,anon,authenticated'; end if;
 if to_regprocedure('public.save_car_issue(text, bigint, text, bigint, text, text, boolean, text)') is not null then execute 'revoke execute on function public.save_car_issue(text, bigint, text, bigint, text, text, boolean, text) from public,anon,authenticated'; end if;
 if to_regprocedure('public.save_car_maintenance(text, bigint, bigint, text, text, date, integer, integer, integer, text)') is not null then execute 'revoke execute on function public.save_car_maintenance(text, bigint, bigint, text, text, date, integer, integer, integer, text) from public,anon,authenticated'; end if;
 if to_regprocedure('public.set_car_issue_kind(text, bigint, text, text)') is not null then execute 'revoke execute on function public.set_car_issue_kind(text, bigint, text, text) from public,anon,authenticated'; end if;
 if to_regprocedure('public.set_car_issue_status(text, bigint, text, text)') is not null then execute 'revoke execute on function public.set_car_issue_status(text, bigint, text, text) from public,anon,authenticated'; end if;
end $guard$;

commit;
