-- Meddelanden/rapporter + Löner. Endast nya objekt; inga befintliga RPC:er ändras.
-- Säker att applicera före PR-merge. Befintliga sidor får oförändrat beteende.
-- Custom session-auth: privata SECURITY DEFINER-funktioner, publika invoker-wrappers.
create schema messaging_private;
grant usage on schema messaging_private to anon, authenticated;

create table public.direct_messages (
  id bigint generated always as identity primary key,
  sender_id text not null references public.drivers(id),
  recipient_id text not null references public.drivers(id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from public, anon, authenticated;
revoke all on sequence public.direct_messages_id_seq from public, anon, authenticated;
create index direct_messages_sender_idx on public.direct_messages(sender_id, id desc);
create index direct_messages_recipient_idx on public.direct_messages(recipient_id, id desc);
create trigger zz_demo_write_guard before insert or update or delete on public.direct_messages
  for each statement execute function private.demo_write_guard();

create function messaging_private.message_actor(p_token text)
returns text language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(a.via_master, false) or a.category is null or a.category = 'avslutad' or private.is_demo() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return a.driver_id;
end $$;

create function messaging_private.message_recipients(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := messaging_private.message_actor(p_token); r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', private.forum_name(d.id),
    'admin', d.category in ('agare','superadmin','admin')) order by private.forum_name(d.id), d.id), '[]'::jsonb)
    into r from public.drivers d
    where d.id <> me and d.activated is true and d.category in ('standard','semester','admin','agare','superadmin');
  return r;
end $$;

create function messaging_private.message_list(p_token text, p_box text, p_before bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := messaging_private.message_actor(p_token); r jsonb; n integer;
begin
  if p_box is null or p_box not in ('in','out') then raise exception 'bad_box' using errcode='22023'; end if;
  select count(*)::integer into n from public.direct_messages where recipient_id=me and read_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at,
    'read_at', m.read_at, 'peer_id', case when p_box='in' then m.sender_id else m.recipient_id end,
    'name', private.forum_name(case when p_box='in' then m.sender_id else m.recipient_id end)) order by m.id desc), '[]'::jsonb)
    into r from (select * from public.direct_messages
      where (case when p_box='in' then recipient_id=me else sender_id=me end)
        and (p_before is null or id < p_before) order by id desc limit 50) m;
  return jsonb_build_object('items',r,'unread',n,'next',case when jsonb_array_length(r)=50 then (r->49->>'id')::bigint end);
end $$;

create function messaging_private.message_send(p_token text, p_to text, p_body text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare me text := messaging_private.message_actor(p_token); v bigint;
begin
  if p_to is null or p_to=me or not exists (select 1 from public.drivers d where d.id=p_to and d.activated is true
    and d.category in ('standard','semester','admin','agare','superadmin')) then
    raise exception 'bad_recipient' using errcode='22023'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'bad_text' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('direct_messages:' || me, 0));
  if (select count(*) from public.direct_messages where sender_id=me and created_at > now()-interval '1 day') >= 100 then
    raise exception 'too_many' using errcode='54000'; end if;
  insert into public.direct_messages(sender_id,recipient_id,body) values(me,p_to,btrim(p_body)) returning id into v;
  return v;
end $$;

create function messaging_private.message_read(p_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := messaging_private.message_actor(p_token); m public.direct_messages;
begin
  select * into m from public.direct_messages where id=p_id and me in (sender_id,recipient_id);
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if m.recipient_id=me and m.read_at is null then
    update public.direct_messages set read_at=clock_timestamp() where id=m.id and read_at is null returning * into m;
    if not found then select * into m from public.direct_messages where id=p_id; end if;
  end if;
  return jsonb_build_object('id',m.id,'body',m.body,'at',m.created_at,'read_at',m.read_at,
    'incoming',m.recipient_id=me,'peer_id',case when m.recipient_id=me then m.sender_id else m.recipient_id end,
    'name',private.forum_name(case when m.recipient_id=me then m.sender_id else m.recipient_id end));
end $$;

-- Löner: separat servergräns, endast åkeriets förare och ägare/S admin.
-- Non-owner admin-behörighet är INTE beslutad; fråga Berra innan den utökas.
create function messaging_private.payroll_month(p_token text, p_month date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; f timestamptz; t timestamptz; r jsonb;
begin
  select * into a from private.bil_actor(p_token);
  if a.category is null or a.category not in ('agare','superadmin') or private.is_demo() then
    raise exception 'forbidden' using errcode='42501'; end if;
  if p_month is null then raise exception 'bad_period' using errcode='22023'; end if;
  f := date_trunc('month', p_month::timestamp) at time zone 'Europe/Stockholm';
  t := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'Europe/Stockholm';
  select coalesce(jsonb_agg(to_jsonb(x) order by x.namn,x.driver_id),'[]'::jsonb) into r from (
    select w.driver_id, private.forum_name(w.driver_id) namn,
      coalesce(sum(private.wh_minutes(w)) filter(where w.status='approved'),0) approved_min,
      coalesce(round(sum(private.wh_minutes(w)/60.0*w.rate) filter(where w.status='approved')),0) approved_kr,
      coalesce(sum(private.wh_minutes(w)) filter(where w.status='pending'),0) pending_min,
      coalesce(sum(private.wh_minutes(w)) filter(where w.status='rejected'),0) rejected_min
    from public.workshop_hours w where w.start_at >= f and w.start_at < t
      and private.actor_company(w.driver_id)=a.company_id group by w.driver_id
  ) x;
  return jsonb_build_object('rate',private.workshop_rate(),'totals',r,'named',true);
end $$;

revoke all on function messaging_private.message_recipients(text) from public;
grant execute on function messaging_private.message_recipients(text) to anon, authenticated;
create function public.message_recipients(p_token text) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.message_recipients(p_token) $$;
revoke all on function public.message_recipients(text) from public;
grant execute on function public.message_recipients(text) to anon, authenticated;

revoke all on function messaging_private.message_list(text, text, bigint) from public;
grant execute on function messaging_private.message_list(text, text, bigint) to anon, authenticated;
create function public.message_list(p_token text, p_box text, p_before bigint default null) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.message_list(p_token,p_box,p_before) $$;
revoke all on function public.message_list(text, text, bigint) from public;
grant execute on function public.message_list(text, text, bigint) to anon, authenticated;

revoke all on function messaging_private.message_send(text, text, text) from public;
grant execute on function messaging_private.message_send(text, text, text) to anon, authenticated;
create function public.message_send(p_token text, p_to text, p_body text) returns bigint
 language sql security invoker set search_path = '' as $$ select messaging_private.message_send(p_token,p_to,p_body) $$;
revoke all on function public.message_send(text, text, text) from public;
grant execute on function public.message_send(text, text, text) to anon, authenticated;

revoke all on function messaging_private.message_read(text, bigint) from public;
grant execute on function messaging_private.message_read(text, bigint) to anon, authenticated;
create function public.message_read(p_token text, p_id bigint) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.message_read(p_token,p_id) $$;
revoke all on function public.message_read(text, bigint) from public;
grant execute on function public.message_read(text, bigint) to anon, authenticated;

revoke all on function messaging_private.payroll_month(text, date) from public;
grant execute on function messaging_private.payroll_month(text, date) to anon, authenticated;
create function public.payroll_month(p_token text, p_month date) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.payroll_month(p_token,p_month) $$;
revoke all on function public.payroll_month(text, date) from public;
grant execute on function public.payroll_month(text, date) to anon, authenticated;

revoke all on function messaging_private.message_actor(text) from public,anon,authenticated;
