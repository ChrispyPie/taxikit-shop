-- Ägarens designändring: ämnestrådar i stället för Inkorg/Utkorg. Rent additivt ovanpå 20261106g.
create table public.message_conversations (
 id bigint generated always as identity primary key,
 started_by text not null references public.drivers(id),
 recipient_id text not null references public.drivers(id),
 subject text not null check(char_length(btrim(subject)) between 1 and 120),
 created_at timestamptz not null default clock_timestamp(),
 check(started_by<>recipient_id)
);
alter table public.message_conversations enable row level security;
revoke all on public.message_conversations from public,anon,authenticated;
revoke all on sequence public.message_conversations_id_seq from public,anon,authenticated;
create index message_conversations_starter_idx on public.message_conversations(started_by,id desc);
create index message_conversations_recipient_idx on public.message_conversations(recipient_id,id desc);
alter table public.direct_messages add column conversation_id bigint references public.message_conversations(id);
create index direct_messages_conversation_idx on public.direct_messages(conversation_id,id);
create trigger zz_demo_write_guard before insert or update or delete on public.message_conversations
 for each statement execute function private.demo_write_guard();

create function messaging_private.conversation_create(p_token text,p_to text,p_subject text,p_body text)
returns bigint language plpgsql security definer set search_path='' as $$
declare me text:=messaging_private.message_actor(p_token); v bigint; m bigint;
begin
 if p_subject is null or char_length(btrim(p_subject)) not between 1 and 120 then raise exception 'bad_subject' using errcode='22023'; end if;
 -- Befintlig meddelandekontroll sköter mottagare, längd och spamgräns i samma transaktion.
 m:=messaging_private.message_send(p_token,p_to,p_body);
 insert into public.message_conversations(started_by,recipient_id,subject) values(me,p_to,btrim(p_subject)) returning id into v;
 update public.direct_messages set conversation_id=v where id=m;
 return v;
end $$;

create function messaging_private.conversation_reply(p_token text,p_id bigint,p_body text)
returns bigint language plpgsql security definer set search_path='' as $$
declare me text:=messaging_private.message_actor(p_token); c public.message_conversations; m bigint;
begin
 select * into c from public.message_conversations where id=p_id and me in(started_by,recipient_id);
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 m:=messaging_private.message_send(p_token,case when c.started_by=me then c.recipient_id else c.started_by end,p_body);
 update public.direct_messages set conversation_id=c.id where id=m;
 return m;
end $$;

create function messaging_private.conversation_list(p_token text,p_before bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me text:=messaging_private.message_actor(p_token); r jsonb; n integer;
begin
 select count(*)::integer into n from public.direct_messages where recipient_id=me and read_at is null and conversation_id is not null;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.latest_id desc),'[]'::jsonb) into r from (
  select c.id,c.subject,private.forum_name(case when c.started_by=me then c.recipient_id else c.started_by end) name,
   lm.id latest_id,lm.body last_body,lm.created_at at,lm.recipient_id=me incoming,
   (select count(*) from public.direct_messages d where d.conversation_id=c.id and d.recipient_id=me and d.read_at is null) unread
  from public.message_conversations c
  join lateral(select * from public.direct_messages m where m.conversation_id=c.id order by m.id desc limit 1) lm on true
  where me in(c.started_by,c.recipient_id) and (p_before is null or lm.id<p_before)
  order by lm.id desc limit 50
 ) x;
 return jsonb_build_object('items',r,'unread',n,'next',case when jsonb_array_length(r)=50 then (r->49->>'latest_id')::bigint end);
end $$;

create function messaging_private.conversation_get(p_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me text:=messaging_private.message_actor(p_token); c public.message_conversations; r jsonb;
begin
 select * into c from public.message_conversations where id=p_id and me in(started_by,recipient_id);
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 update public.direct_messages set read_at=clock_timestamp() where conversation_id=c.id and recipient_id=me and read_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'at',m.created_at,'read_at',m.read_at,'mine',m.sender_id=me) order by m.id),'[]'::jsonb)
 into r from public.direct_messages m where m.conversation_id=c.id;
 return jsonb_build_object('id',c.id,'subject',c.subject,'name',private.forum_name(case when c.started_by=me then c.recipient_id else c.started_by end),'messages',r);
end $$;

revoke all on function messaging_private.conversation_create(text,text,text,text) from public;
grant execute on function messaging_private.conversation_create(text,text,text,text) to anon,authenticated;
create function public.conversation_create(p_token text,p_to text,p_subject text,p_body text) returns bigint language sql security invoker set search_path='' as $$select messaging_private.conversation_create(p_token,p_to,p_subject,p_body)$$;
revoke all on function public.conversation_create(text,text,text,text) from public;
grant execute on function public.conversation_create(text,text,text,text) to anon,authenticated;

revoke all on function messaging_private.conversation_reply(text,bigint,text) from public;
grant execute on function messaging_private.conversation_reply(text,bigint,text) to anon,authenticated;
create function public.conversation_reply(p_token text,p_id bigint,p_body text) returns bigint language sql security invoker set search_path='' as $$select messaging_private.conversation_reply(p_token,p_id,p_body)$$;
revoke all on function public.conversation_reply(text,bigint,text) from public;
grant execute on function public.conversation_reply(text,bigint,text) to anon,authenticated;

revoke all on function messaging_private.conversation_list(text,bigint) from public;
grant execute on function messaging_private.conversation_list(text,bigint) to anon,authenticated;
create function public.conversation_list(p_token text,p_before bigint default null) returns jsonb language sql security invoker set search_path='' as $$select messaging_private.conversation_list(p_token,p_before)$$;
revoke all on function public.conversation_list(text,bigint) from public;
grant execute on function public.conversation_list(text,bigint) to anon,authenticated;

revoke all on function messaging_private.conversation_get(text,bigint) from public;
grant execute on function messaging_private.conversation_get(text,bigint) to anon,authenticated;
create function public.conversation_get(p_token text,p_id bigint) returns jsonb language sql security invoker set search_path='' as $$select messaging_private.conversation_get(p_token,p_id)$$;
revoke all on function public.conversation_get(text,bigint) from public;
grant execute on function public.conversation_get(text,bigint) to anon,authenticated;
