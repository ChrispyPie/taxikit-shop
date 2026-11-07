-- PR #86, approved by Christian 2026-11-07. Preservation checks abort if source rows change. No underlying case/message/certificate deletion.
begin;
create temporary table pr86_preserve_before on commit drop as
select 'inbox_private.threads'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from inbox_private.threads x
union all
select 'inbox_private.messages'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from inbox_private.messages x
union all
select 'inbox_private.bookings'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from inbox_private.bookings x
union all
select 'inbox_private.reads'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.thread_id,x.driver_id),'')) as fingerprint from inbox_private.reads x
union all
select 'public.car_issues'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.car_issues x
union all
select 'public.workshop_hours'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.workshop_hours x
union all
select 'public.workshop_messages'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.workshop_messages x
union all
select 'public.car_tasks'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.car_tasks x
union all
select 'public.car_maintenance'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.car_maintenance x
union all
select 'private.sick_reports'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from private.sick_reports x
union all
select 'private.sick_certs'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from private.sick_certs x;
alter table inbox_private.unread_flags add column if not exists pinned boolean not null default false;
alter table inbox_private.unread_flags add column if not exists hidden boolean not null default false;

-- Temporary superadmin trash rights follow the SAME central switch as sickness boss rights.
create or replace function private.mailbox_trash_roles() returns text[] language sql stable set search_path='' as $$select private.sjuk_boss_roles()$$;
revoke all on function private.mailbox_trash_roles() from public,anon,authenticated;
-- NEVER enable medical/file deletion merely to enable ordinary mailbox cleanup.
create or replace function private.mailbox_secret_hard_delete_enabled() returns boolean language sql immutable set search_path='' as $$select false$$;
revoke all on function private.mailbox_secret_hard_delete_enabled() from public,anon,authenticated;
create table if not exists inbox_private.party_deletions (
 company_id text not null,kind text not null,item_id bigint not null,
 owner_hidden boolean not null default false,owner_permanent boolean not null default false,
 primary key(company_id,kind,item_id)
);
alter table inbox_private.party_deletions enable row level security;
revoke all on inbox_private.party_deletions from public,anon,authenticated;
CREATE OR REPLACE FUNCTION inbox_private.dispatch(p_token text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a record; t inbox_private.threads; b inbox_private.bookings; v_admin boolean:=coalesce((p_data->>'admin')::boolean,false);
 v_car_id bigint; v_driver text; v_body text; v_title text; v_car text; v_kind text; v_role text; v_at timestamptz; v_result jsonb;
 v_phone text; v_visibility text; v_cars text[]; v_same boolean; v_same_bolag boolean; v_company_label text; v_contact inbox_private.contacts; v_id bigint;
begin
 select * into a from private.bil_actor(p_token);
 if not exists(select 1 from public.drivers d where d.id=a.driver_id and coalesce(d.activated,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if a.category not in ('standard','semester','admin','agare','superadmin') then raise exception 'forbidden' using errcode='42501'; end if;
 if v_admin and not a.is_admin then raise exception 'forbidden' using errcode='42501'; end if;
 if private.is_demo() then raise exception 'demo_read_only' using errcode='42501'; end if;
 v_role:=case when v_admin then 'admin' else 'driver' end;
 if p_action='item_lock' then
   perform inbox_private.dispatch(p_token,'preference_authorize',p_data);
   return jsonb_build_object('locked',exists(select 1 from inbox_private.party_deletions d where d.company_id=a.company_id and d.kind=p_data->>'kind' and d.item_id=(p_data->>'id')::bigint and (d.owner_hidden or d.owner_permanent)));
 elsif p_action='mailbox_capabilities' then
   return jsonb_build_object('can_trash',v_admin and a.category=any(private.mailbox_trash_roles()),'secret_hard_delete_enabled',private.mailbox_secret_hard_delete_enabled());
 elsif p_action='item_flags' then
   return coalesce((select jsonb_agg(jsonb_build_object('kind',k.kind,'id',k.item_id,'is_unread',coalesce(f.is_unread,false),'pinned',coalesce(f.pinned,false),
     'hidden',coalesce(f.hidden,false) or coalesce(d.owner_hidden,false),'in_trash',coalesce(d.owner_hidden,false) and not coalesce(d.owner_permanent,false),'permanent',coalesce(d.owner_permanent,false)))
     from (select kind,item_id from inbox_private.unread_flags where driver_id=a.driver_id union select kind,item_id from inbox_private.party_deletions where v_admin and company_id=a.company_id and (kind<>'sjuk' or a.category=any(private.sjuk_boss_roles()))) k
     left join inbox_private.unread_flags f on f.driver_id=a.driver_id and f.kind=k.kind and f.item_id=k.item_id
     left join inbox_private.party_deletions d on v_admin and d.company_id=a.company_id and d.kind=k.kind and d.item_id=k.item_id),'[]');
 elsif p_action='bulk_preferences' then
   if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'bad_selection' using errcode='22023'; end if;
   if coalesce(p_data->>'operation','') not in ('pin','unpin','unread','hide','restore','permanent') then raise exception 'bad_action' using errcode='22023'; end if;
   if p_data->>'operation' in ('restore','permanent') and not (v_admin and a.category=any(private.mailbox_trash_roles())) then raise exception 'forbidden' using errcode='42501'; end if;
   for v_result in select value from jsonb_array_elements(p_data->'items') loop
     perform inbox_private.dispatch(p_token,case when p_data->>'operation'='unread' then 'mark_unread' else 'preference_authorize' end,jsonb_build_object('admin',v_admin,'kind',v_result->>'kind','id',v_result->>'id'));
     v_kind:=v_result->>'kind';v_id:=(v_result->>'id')::bigint;
     -- Serialize the two parties' deletion decisions, so either deletion order is safe.
     if v_kind='thread' then select * into t from inbox_private.threads where id=v_id for update;
     elsif v_kind='wh' then perform 1 from public.workshop_hours where id=v_id for update; end if;
     if p_data->>'operation' in ('restore','permanent') then
       if not exists(select 1 from inbox_private.party_deletions d where d.company_id=a.company_id and d.kind=v_kind and d.item_id=v_id and d.owner_hidden and not d.owner_permanent) then raise exception 'not_in_trash' using errcode='22023'; end if;
       update inbox_private.party_deletions set owner_hidden=p_data->>'operation'='permanent',owner_permanent=p_data->>'operation'='permanent' where company_id=a.company_id and kind=v_kind and item_id=v_id;
     elsif p_data->>'operation'='hide' and v_admin then
       insert into inbox_private.party_deletions(company_id,kind,item_id,owner_hidden) values(a.company_id,v_kind,v_id,true)
       on conflict(company_id,kind,item_id) do update set owner_hidden=true;
     elsif p_data->>'operation' in ('pin','unpin','hide') then
       insert into inbox_private.unread_flags(driver_id,kind,item_id,pinned,hidden) values(a.driver_id,v_kind,v_id,p_data->>'operation'='pin',p_data->>'operation'='hide')
       on conflict(driver_id,kind,item_id) do update set
         pinned=case when p_data->>'operation' in ('pin','unpin') then p_data->>'operation'='pin' else inbox_private.unread_flags.pinned end,
         hidden=case when p_data->>'operation'='hide' then true else inbox_private.unread_flags.hidden end;
     end if;
     -- Only ordinary v2 message threads can be purged. Both actual parties must have deleted.
     -- Legacy case records (including sick reports/certificates/storage) are never hard-deleted here.
     if v_kind='thread' and exists(select 1 from inbox_private.party_deletions d where d.company_id=t.company_id and d.kind='thread' and d.item_id=t.id and d.owner_permanent)
       and exists(select 1 from inbox_private.unread_flags f where f.driver_id=t.driver_id and f.kind='thread' and f.item_id=t.id and f.hidden) then
       delete from inbox_private.bookings where thread_id=t.id;
       delete from inbox_private.messages where thread_id=t.id;
       delete from inbox_private.reads where thread_id=t.id;
       delete from inbox_private.threads where id=t.id;
       delete from inbox_private.unread_flags where kind='thread' and item_id=t.id;
       delete from inbox_private.party_deletions where company_id=t.company_id and kind='thread' and item_id=t.id;
     end if;
   end loop;
   return jsonb_build_object('ok',true);
 elsif p_action='unread_flags' then
   return coalesce((select jsonb_agg(jsonb_build_object('kind',f.kind,'id',f.item_id)) from inbox_private.unread_flags f where f.driver_id=a.driver_id and f.is_unread),'[]');
 elsif p_action in ('mark_unread','mark_read','preference_authorize') then
   v_kind:=p_data->>'kind'; v_id:=(p_data->>'id')::bigint;
   -- Validate through exactly the existing read authorization, including sickness secrecy.
   if v_kind='thread' then
     if not exists(select 1 from inbox_private.threads th where th.id=v_id and th.company_id=a.company_id and (v_admin or (th.driver_id=a.driver_id and a.category not in ('agare','superadmin')))) then raise exception 'not_found' using errcode='P0002'; end if;
   elsif v_kind='old-message' then
     v_driver:=messaging_private.message_actor(p_token);
     if not exists(select 1 from public.message_conversations c where c.id=v_id and v_driver in(c.started_by,c.recipient_id)) then raise exception 'not_found' using errcode='P0002'; end if;
   elsif v_kind in ('issue','wh','task','sjuk','maint') then
     perform public.case_get(p_token,v_kind,v_id);
   else raise exception 'bad_action' using errcode='22023'; end if;
   if p_action='preference_authorize' then return jsonb_build_object('ok',true); end if;
   insert into inbox_private.unread_flags(driver_id,kind,item_id,is_unread) values(a.driver_id,v_kind,v_id,p_action='mark_unread')
     on conflict(driver_id,kind,item_id) do update set is_unread=excluded.is_unread;
   return jsonb_build_object('ok',true);
 elsif p_action='contacts_get' then
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
 elsif p_action='cars' then
   return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'number',btrim(c.bilnummer)) order by c.bilnummer,c.id) from public.cars c where c.company_id=a.company_id and char_length(btrim(c.bilnummer)) between 1 and 80),'[]');
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
       'locked',exists(select 1 from inbox_private.party_deletions d where d.company_id=th.company_id and d.kind='thread' and d.item_id=th.id and (d.owner_hidden or d.owner_permanent)),
       'booking_states',coalesce((select jsonb_agg(bk.status) from inbox_private.bookings bk where bk.thread_id=th.id),'[]'),
       'last_sender_role',(select m.sender_role from inbox_private.messages m where m.thread_id=th.id order by m.created_at desc,m.id desc limit 1),
       'decision_reply',exists(select 1 from inbox_private.messages m join inbox_private.bookings bk on bk.thread_id=m.thread_id and bk.status='declined' and bk.reason=m.body and m.created_at between bk.decided_at and bk.decided_at+interval '1 second' where m.thread_id=th.id and m.id=(select lm.id from inbox_private.messages lm where lm.thread_id=th.id order by lm.created_at desc,lm.id desc limit 1)),
       'last_body',(select m.body from inbox_private.messages m where m.thread_id=th.id order by m.created_at desc,m.id desc limit 1),
       'unread',exists(select 1 from inbox_private.messages m where m.thread_id=th.id and m.sender_id<>a.driver_id and m.created_at>coalesce((select r.seen_at from inbox_private.reads r where r.thread_id=th.id and r.driver_id=a.driver_id),'-infinity'::timestamptz))) j
     from inbox_private.threads th where th.company_id=a.company_id and (v_admin or (th.driver_id=a.driver_id and a.category not in ('agare','superadmin')))
   ) q),'[]');
 elsif p_action in ('create','book') and nullif(p_data->>'thread_id','') is null then
   v_driver:=case when v_admin then p_data->>'driver_id' else a.driver_id end;
   if not exists(select 1 from public.drivers d where d.id=v_driver and d.activated and private.actor_company(d.id)=a.company_id and d.category in ('standard','semester','admin','agare','superadmin')) then raise exception 'bad_recipient' using errcode='22023'; end if;
   v_title:=case when p_action='book' then btrim(coalesce(p_data->>'kind','')) else btrim(coalesce(p_data->>'subject','')) end;
   select chosen.car_id,chosen.car_number into v_car_id,v_car from inbox_private.resolve_car(a.company_id,p_data->>'car_choice') chosen;
   if char_length(v_title) not between 1 and 120 then raise exception 'bad_subject' using errcode='22023'; end if;
   if (select count(*) from inbox_private.threads where created_by=a.driver_id and created_at>clock_timestamp()-interval '1 day')>=100 then raise exception 'too_many' using errcode='54000'; end if;
   insert into inbox_private.threads(company_id,driver_id,subject,car_number,car_id,created_by) values(a.company_id,v_driver,v_title,v_car,v_car_id,a.driver_id) returning * into t;
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
 -- Reply/book/decide all write messages: enforce read-only on the server, not just in UI.
 select * into t from inbox_private.threads where id=t.id for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if p_action in ('reply','book','decide') and exists(select 1 from inbox_private.party_deletions d where d.company_id=t.company_id and d.kind='thread' and d.item_id=t.id and (d.owner_permanent or (not v_admin and d.owner_hidden))) then
   raise exception 'thread_closed' using errcode='42501';
 end if;
 if p_action='get' then
   insert into inbox_private.reads(thread_id,driver_id,seen_at) values(t.id,a.driver_id,clock_timestamp()) on conflict(thread_id,driver_id) do update set seen_at=excluded.seen_at;
   return jsonb_build_object('locked',exists(select 1 from inbox_private.party_deletions d where d.company_id=t.company_id and d.kind='thread' and d.item_id=t.id and (d.owner_hidden or d.owner_permanent)),'id',t.id,'subject',t.subject,'car_number',t.car_number,'car_id',t.car_id,'driver_id',case when v_admin then t.driver_id end,'is_driver',t.driver_id=a.driver_id,
     'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'role',m.sender_role,'mine',m.sender_id=a.driver_id,'at',m.created_at) order by m.created_at,m.id) from inbox_private.messages m where m.thread_id=t.id),'[]'),
     'bookings',coalesce((select jsonb_agg(to_jsonb(bk) - 'proposed_by' - 'decided_by' order by bk.created_at,bk.id) from inbox_private.bookings bk where bk.thread_id=t.id),'[]'));
 elsif p_action='reply' then
   v_body:=btrim(coalesce(p_data->>'body',''));
   if char_length(v_body) not between 1 and 2000 then raise exception 'bad_text' using errcode='22023'; end if;
   if (select count(*) from inbox_private.messages where sender_id=a.driver_id and created_at>clock_timestamp()-interval '1 day')>=200 then raise exception 'too_many' using errcode='54000'; end if;
   insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,v_role,v_body);
 elsif p_action='book' then
   v_kind:=btrim(coalesce(p_data->>'kind',''));v_title:=v_kind;
   select chosen.car_id,chosen.car_number into v_car_id,v_car from inbox_private.resolve_car(a.company_id,p_data->>'car_choice') chosen;
   v_body:=btrim(coalesce(p_data->>'body',''));
   if char_length(v_body)>2000 then raise exception 'bad_text' using errcode='22023'; end if;
   if char_length(v_title) not between 1 and 120 or char_length(v_kind) not between 1 and 120 then raise exception 'bad_subject' using errcode='22023'; end if;
   if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_data->>'time','') !~ '^\d{2}:\d{2}$' then raise exception 'bad_date' using errcode='22023'; end if;
   begin
     v_at:=((p_data->>'date')||' '||(p_data->>'time'))::timestamp at time zone 'Europe/Stockholm';
   exception when datetime_field_overflow or invalid_datetime_format then raise exception 'bad_date' using errcode='22023'; end;
   if v_at<=clock_timestamp() or v_at>clock_timestamp()+interval '2 years' or to_char(v_at at time zone 'Europe/Stockholm','YYYY-MM-DD HH24:MI')<>(p_data->>'date')||' '||(p_data->>'time') then raise exception 'bad_date' using errcode='22023'; end if;
   if (select count(*) from inbox_private.bookings where proposed_by=a.driver_id and created_at>clock_timestamp()-interval '1 day')>=100 then raise exception 'too_many' using errcode='54000'; end if;
   insert into inbox_private.bookings(thread_id,kind,title,starts_at,car_number,car_id,status,proposer_role,proposed_by)
     values(t.id,v_kind,v_title,v_at,v_car,v_car_id,case when v_admin then 'pending_driver' else 'pending_admin' end,v_role,a.driver_id);
   insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,'system','Bokad tid föreslagen: '||v_title);
   if v_body<>'' then insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,v_role,v_body); end if;
 elsif p_action='decide' then
   -- An owner who also drives answers their own invitation from Admin, not a second inbox.
   if v_admin and b.status='pending_driver' and t.driver_id=a.driver_id then v_admin:=false; end if;
   if b.status not in ('pending_driver','pending_admin') or (v_admin and b.status<>'pending_admin') or (not v_admin and b.status<>'pending_driver') then raise exception 'forbidden' using errcode='42501'; end if;
   if coalesce(p_data->>'decision','') not in ('accepted','declined') then raise exception 'bad_status' using errcode='22023'; end if;
   v_body:=nullif(btrim(p_data->>'reason'),'');
   if (p_data->>'decision'='declined' and (v_body is null or v_body !~ '[^[:space:]]')) or char_length(v_body)>2000 then raise exception 'need_reason' using errcode='22023'; end if;
   update inbox_private.bookings set status=p_data->>'decision',decided_by=a.driver_id,decided_at=clock_timestamp(),reason=v_body where id=b.id;
   insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,'system',case when p_data->>'decision'='accepted' then 'Bokad tid godkänd: ' else 'Bokad tid avböjd: ' end||b.title);
   if p_data->>'decision'='declined' then insert into inbox_private.messages(thread_id,sender_id,sender_role,body) values(t.id,a.driver_id,v_role,v_body); end if;
 else raise exception 'bad_action' using errcode='22023'; end if;
 -- A new admin-side message resurrects the driver's ENTIRE existing history, never a copy.
 if v_admin then
   update inbox_private.unread_flags set hidden=false where driver_id=t.driver_id and kind='thread' and item_id=t.id;
 end if;
 update inbox_private.threads set updated_at=clock_timestamp() where id=t.id;
 return jsonb_build_object('id',t.id);
end $function$
;

create or replace function inbox_private.workshop_mailbox_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_driver text;v_company text;
begin
 select w.driver_id into v_driver from public.workshop_hours w where w.id=new.hours_id for update;
 v_company:=private.actor_company(v_driver);
 if new.sender_role='driver' and exists(select 1 from inbox_private.party_deletions d where d.company_id=v_company and d.kind='wh' and d.item_id=new.hours_id and (d.owner_hidden or d.owner_permanent)) then
   raise exception 'thread_closed' using errcode='42501';
 end if;
 if new.sender_role='owner' then
   update inbox_private.unread_flags set hidden=false where driver_id=v_driver and kind='wh' and item_id=new.hours_id;
 end if;
 return new;
end $$;
revoke all on function inbox_private.workshop_mailbox_guard() from public,anon,authenticated;
create or replace trigger mailbox_closed_workshop before insert on public.workshop_messages for each row execute function inbox_private.workshop_mailbox_guard();
create temporary table pr86_preserve_after on commit drop as
select 'inbox_private.threads'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from inbox_private.threads x
union all
select 'inbox_private.messages'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from inbox_private.messages x
union all
select 'inbox_private.bookings'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from inbox_private.bookings x
union all
select 'inbox_private.reads'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.thread_id,x.driver_id),'')) as fingerprint from inbox_private.reads x
union all
select 'public.car_issues'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.car_issues x
union all
select 'public.workshop_hours'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.workshop_hours x
union all
select 'public.workshop_messages'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.workshop_messages x
union all
select 'public.car_tasks'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.car_tasks x
union all
select 'public.car_maintenance'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from public.car_maintenance x
union all
select 'private.sick_reports'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from private.sick_reports x
union all
select 'private.sick_certs'::text as source, count(*) as n, md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by x.id),'')) as fingerprint from private.sick_certs x;
do $preserve$ begin
 if exists(select * from pr86_preserve_before except select * from pr86_preserve_after) or exists(select * from pr86_preserve_after except select * from pr86_preserve_before) then raise exception 'PR86 preservation check failed'; end if;
 if exists(select 1 from inbox_private.unread_flags where hidden or pinned) or exists(select 1 from inbox_private.party_deletions) then raise exception 'PR86 must not hide, pin, lock or trash any existing item on migration'; end if;
end $preserve$;
commit;
