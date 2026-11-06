-- Klassiskt forum (2026-11-06): sektioner → trådar → svar.
-- Additivt: nya tabeller + nya RPC:er. Gamla forum_posts/forum_comments/forum_* RPC:er orörda.
-- Ingen datamigrering (forumet är tomt). Admin › Önskemål (dev_wishes) orörd — Forum › Önskemål startar tomt.
-- Ångra: supabase/migrations/undo/20261106a_forum_classic_undo.sql
--
-- Sektioner (seed): Allmänt, Önskemål & förslag (status), Buggar (status), Mitt åkeri (åkeri-scope), Admin (bara ägare/S).
-- Status (önskemål/buggar): ny | pagar | planerad | klar. Bara ägare/S sätter status.
-- Tabellen forum_replies heter så för att inte krocka med befintliga forum_posts.

-- ── Tabeller ───────────────────────────────────────────────────────────────

create table if not exists public.forum_sections (
  id          text primary key,
  title       text not null,
  description text not null default '',
  icon        text not null default '💬',
  sort_order  int  not null default 0,
  group_key   text not null default 'huvud' check (group_key in ('huvud','akeri','admin')),
  scope       text not null default 'global' check (scope in ('global','company','admin')),
  has_status  boolean not null default false,
  read_roles  text[] not null default array['forare','agare','sadmin']::text[],
  write_roles text[] not null default array['forare','agare','sadmin']::text[],
  active      boolean not null default true
);

create table if not exists public.forum_threads (
  id               bigserial primary key,
  section_id       text not null references public.forum_sections(id),
  company_id       text not null,
  author_id        text not null,
  title            text not null check (char_length(btrim(title)) between 1 and 120),
  status           text check (status is null or status in ('ny','pagar','planerad','klar')),
  status_by        text,
  status_at        timestamptz,
  status_comment   text check (status_comment is null or char_length(status_comment) <= 500),
  reply_count      int not null default 0,
  view_count       int not null default 0,
  hidden           boolean not null default false,
  created_at       timestamptz not null default clock_timestamp(),
  last_activity_at timestamptz not null default clock_timestamp()
);
create index if not exists forum_threads_section_act_idx
  on public.forum_threads (section_id, last_activity_at desc);
create index if not exists forum_threads_company_idx
  on public.forum_threads (company_id, last_activity_at desc);
create index if not exists forum_threads_author_idx
  on public.forum_threads (author_id, created_at desc);

create table if not exists public.forum_replies (
  id         bigserial primary key,
  thread_id  bigint not null references public.forum_threads(id) on delete cascade,
  author_id  text not null,
  company_id text not null,
  body       text not null check (char_length(btrim(body)) between 1 and 5000),
  hidden     boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  edited_at  timestamptz
);
create index if not exists forum_replies_thread_idx
  on public.forum_replies (thread_id, created_at, id);

create table if not exists public.forum_reads (
  driver_id    text not null,
  thread_id    bigint not null references public.forum_threads(id) on delete cascade,
  last_read_at timestamptz not null default clock_timestamp(),
  primary key (driver_id, thread_id)
);

alter table public.forum_sections enable row level security;
alter table public.forum_threads  enable row level security;
alter table public.forum_replies  enable row level security;
alter table public.forum_reads    enable row level security;
revoke all on public.forum_sections from anon, authenticated;
revoke all on public.forum_threads  from anon, authenticated;
revoke all on public.forum_replies  from anon, authenticated;
revoke all on public.forum_reads    from anon, authenticated;
revoke all on sequence public.forum_threads_id_seq from anon, authenticated;
revoke all on sequence public.forum_replies_id_seq from anon, authenticated;

drop trigger if exists zz_demo_write_guard on public.forum_sections;
create trigger zz_demo_write_guard before insert or delete or update on public.forum_sections
  for each statement execute function private.demo_write_guard();
drop trigger if exists zz_demo_write_guard on public.forum_threads;
create trigger zz_demo_write_guard before insert or delete or update on public.forum_threads
  for each statement execute function private.demo_write_guard();
drop trigger if exists zz_demo_write_guard on public.forum_replies;
create trigger zz_demo_write_guard before insert or delete or update on public.forum_replies
  for each statement execute function private.demo_write_guard();
drop trigger if exists zz_demo_write_guard on public.forum_reads;
create trigger zz_demo_write_guard before insert or delete or update on public.forum_reads
  for each statement execute function private.demo_write_guard();

-- Seed (idempotent). Önskemål startar tomt — ingen koppling till dev_wishes.
insert into public.forum_sections (id, title, description, icon, sort_order, group_key, scope, has_status, read_roles, write_roles)
values
  ('allmant',  'Allmänt',            'Prat om jobbet, tips och frågor som gäller alla',
   '💬', 10, 'huvud', 'global',  false,
   array['forare','agare','sadmin']::text[], array['forare','agare','sadmin']::text[]),
  ('onskemal', 'Önskemål & förslag', 'Idéer till appen. Status: Ny / Pågår / Planerad / Klar',
   '💡', 20, 'huvud', 'global',  true,
   array['forare','agare','sadmin']::text[], array['forare','agare','sadmin']::text[]),
  ('buggar',   'Buggar',             'Något som är trasigt i appen — beskriv gärna',
   '🐞', 30, 'huvud', 'global',  true,
   array['forare','agare','sadmin']::text[], array['forare','agare','sadmin']::text[]),
  ('akeri',    'Mitt åkeri',         'Bara förare i ditt åkeri ser den här sektionen',
   '🚕', 40, 'akeri', 'company', false,
   array['forare','agare','sadmin']::text[], array['forare','agare','sadmin']::text[]),
  ('admin',    'Admin',              'Internt för ägare och S admin. Förare kan inte läsa.',
   '🔒', 50, 'admin', 'admin',   false,
   array['agare','sadmin']::text[],          array['agare','sadmin']::text[])
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  group_key = excluded.group_key,
  scope = excluded.scope,
  has_status = excluded.has_status,
  read_roles = excluded.read_roles,
  write_roles = excluded.write_roles,
  active = true;

-- ── Hjälpare ───────────────────────────────────────────────────────────────

create or replace function private.fx_roles(p_is_admin boolean, p_is_sadmin boolean)
 returns text[] language sql immutable as $function$
  select array_remove(array[
    'forare',
    case when coalesce(p_is_admin, false) or coalesce(p_is_sadmin, false) then 'agare' end,
    case when coalesce(p_is_sadmin, false) then 'sadmin' end
  ], null)::text[];
$function$;

create or replace function private.fx_can_read(s public.forum_sections, p_roles text[])
 returns boolean language sql stable as $function$
  select s.active and s.read_roles && p_roles;
$function$;

create or replace function private.fx_can_write(s public.forum_sections, p_roles text[], p_via_master boolean)
 returns boolean language sql stable as $function$
  select s.active and not coalesce(p_via_master, false) and s.write_roles && p_roles;
$function$;

create or replace function private.fx_thread_visible(
  t public.forum_threads, s public.forum_sections,
  p_co text, p_roles text[], p_sadmin boolean, p_me text
) returns boolean language sql stable as $function$
  select private.fx_can_read(s, p_roles)
     and (not t.hidden or t.author_id = p_me or coalesce(p_sadmin, false)
          or (coalesce('agare' = any(p_roles), false) and t.company_id = p_co))
     and case s.scope
           when 'company' then t.company_id = p_co or coalesce(p_sadmin, false)
           when 'admin'   then private.fx_can_read(s, p_roles)
           else true
         end;
$function$;

create or replace function private.fx_author_json(p_id text)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select jsonb_build_object(
    'author', private.forum_name(p_id),
    'aid', case when not private.is_demo() then p_id end,
    'ak', private.forum_avatar(p_id));
$function$;

-- ── RPC: hem (sektioner) ───────────────────────────────────────────────────

create or replace function public.forum_home(p_token text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_roles text[];
begin
  select * into a from private.forum_actor(p_token);
  v_roles := private.fx_roles(a.is_admin, a.is_sadmin);
  return jsonb_build_object(
    'is_admin', a.is_admin, 'is_sadmin', a.is_sadmin,
    'via_master', coalesce(a.via_master, false),
    'has_name', private.forum_has_name(a.driver_id),
    'my_name', private.forum_name(a.driver_id),
    'company', jsonb_build_object('id', a.company_id, 'name', private.forum_co_name(a.company_id)),
    'can_write_any', not coalesce(a.via_master, false),
    'sections', coalesce((
      select jsonb_agg(x.j order by x.sort_order)
      from (
        select s.sort_order, jsonb_build_object(
          'id', s.id, 'title', s.title, 'description', s.description, 'icon', s.icon,
          'group', s.group_key, 'scope', s.scope, 'has_status', s.has_status,
          'can_read', private.fx_can_read(s, v_roles),
          'can_write', private.fx_can_write(s, v_roles, a.via_master),
          'locked', not private.fx_can_read(s, v_roles),
          'threads', (select count(*)::int from public.forum_threads t
                        where t.section_id = s.id and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id)),
          'replies', (select coalesce(sum(t.reply_count), 0)::int from public.forum_threads t
                        where t.section_id = s.id and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id)),
          'unread', (select count(*)::int from public.forum_threads t
                       left join public.forum_reads r on r.thread_id = t.id and r.driver_id = a.driver_id
                      where t.section_id = s.id
                        and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id)
                        and t.last_activity_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
                        and t.author_id <> a.driver_id),
          'last', (select jsonb_build_object(
                      'at', t.last_activity_at,
                      'author', private.forum_name(t.author_id),
                      'mine', t.author_id = a.driver_id)
                     from public.forum_threads t
                    where t.section_id = s.id
                      and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id)
                    order by t.last_activity_at desc limit 1)
        ) j
        from public.forum_sections s
        where s.active
          -- visa låsta sektioner (admin) så förare ser att de finns
          and (private.fx_can_read(s, v_roles) or s.scope = 'admin')
      ) x
    ), '[]'::jsonb)
  );
end $function$;

-- ── RPC: trådlista i sektion ───────────────────────────────────────────────

create or replace function public.forum_section_threads(p_token text, p_section text, p_include_klar boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_roles text[]; s public.forum_sections;
begin
  select * into a from private.forum_actor(p_token);
  v_roles := private.fx_roles(a.is_admin, a.is_sadmin);
  select * into s from public.forum_sections where id = p_section and active;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not private.fx_can_read(s, v_roles) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'section', jsonb_build_object(
      'id', s.id, 'title', s.title, 'description', s.description, 'icon', s.icon,
      'has_status', s.has_status, 'can_write', private.fx_can_write(s, v_roles, a.via_master)),
    'is_admin', a.is_admin, 'is_sadmin', a.is_sadmin,
    'has_name', private.forum_has_name(a.driver_id),
    'can_status', a.is_admin or a.is_sadmin,
    'threads', coalesce((
      select jsonb_agg(j order by ord desc) from (
        select t.last_activity_at as ord, jsonb_build_object(
          'id', t.id, 'title', t.title, 'status', t.status,
          'author', private.forum_name(t.author_id),
          'aid', case when not private.is_demo() then t.author_id end,
          'mine', t.author_id = a.driver_id,
          'co', case when s.scope = 'global' then private.forum_co_name(t.company_id) end,
          'replies', t.reply_count, 'views', t.view_count,
          'created_at', t.created_at, 'last_activity_at', t.last_activity_at,
          'last_author', (select private.forum_name(r.author_id) from public.forum_replies r
                            where r.thread_id = t.id and (not r.hidden or r.author_id = a.driver_id)
                            order by r.created_at desc, r.id desc limit 1),
          'unread', t.last_activity_at > coalesce(
            (select r2.last_read_at from public.forum_reads r2
              where r2.thread_id = t.id and r2.driver_id = a.driver_id), 'epoch'::timestamptz)
                    and t.author_id <> a.driver_id,
          'hidden', t.hidden
        ) j
        from public.forum_threads t
        where t.section_id = s.id
          and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id)
          and (not s.has_status or coalesce(p_include_klar, false) or coalesce(t.status, 'ny') <> 'klar')
        order by t.last_activity_at desc
        limit 100
      ) z
    ), '[]'::jsonb)
  );
end $function$;

-- ── RPC: en tråd ───────────────────────────────────────────────────────────

create or replace function public.forum_thread_get(p_token text, p_id bigint)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_roles text[]; t public.forum_threads; s public.forum_sections;
begin
  select * into a from private.forum_actor(p_token);
  v_roles := private.fx_roles(a.is_admin, a.is_sadmin);
  select * into t from public.forum_threads where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into s from public.forum_sections where id = t.section_id;
  if not private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.forum_threads set view_count = view_count + 1 where id = t.id;
  insert into public.forum_reads (driver_id, thread_id, last_read_at)
  values (a.driver_id, t.id, clock_timestamp())
  on conflict (driver_id, thread_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object(
    'id', t.id, 'title', t.title, 'status', t.status,
    'status_comment', t.status_comment,
    'status_by', case when t.status_by is not null then private.forum_name(t.status_by) end,
    'status_at', t.status_at,
    'section', jsonb_build_object('id', s.id, 'title', s.title, 'has_status', s.has_status),
    'author', private.forum_name(t.author_id),
    'aid', case when not private.is_demo() then t.author_id end,
    'co', case when s.scope = 'global' then private.forum_co_name(t.company_id) end,
    'mine', t.author_id = a.driver_id,
    'hidden', t.hidden,
    'created_at', t.created_at, 'last_activity_at', t.last_activity_at,
    'replies_n', t.reply_count, 'views', t.view_count + 1,
    'can_write', private.fx_can_write(s, v_roles, a.via_master) and private.forum_has_name(a.driver_id),
    'can_status', (a.is_admin or a.is_sadmin) and s.has_status and not coalesce(a.via_master, false),
    'has_name', private.forum_has_name(a.driver_id),
    'my_name', private.forum_name(a.driver_id),
    'is_admin', a.is_admin, 'is_sadmin', a.is_sadmin,
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'body', q.body,
        'author', private.forum_name(q.author_id),
        'aid', case when not private.is_demo() then q.author_id end,
        'ak', private.forum_avatar(q.author_id),
        'co', case when s.scope = 'global' then private.forum_co_name(q.company_id) end,
        'mine', q.author_id = a.driver_id,
        'hidden', q.hidden,
        'created_at', q.created_at,
        'edited', q.edited_at is not null,
        'n', q.n
      ) order by q.n)
      from (
        select r.*, row_number() over (order by r.created_at, r.id) as n
          from public.forum_replies r
         where r.thread_id = t.id
           and (not r.hidden or r.author_id = a.driver_id or a.is_sadmin
                or (a.is_admin and r.company_id = a.company_id))
      ) q
    ), '[]'::jsonb)
  );
end $function$;

-- ── RPC: ny tråd ───────────────────────────────────────────────────────────

create or replace function public.forum_thread_new(p_token text, p_section text, p_title text, p_body text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_roles text[]; s public.forum_sections; t public.forum_threads;
        v_title text := btrim(coalesce(p_title, '')); v_body text := btrim(coalesce(p_body, ''));
begin
  select * into a from private.forum_actor(p_token);
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  if not private.forum_has_name(a.driver_id) then raise exception 'need_first_name' using errcode = '22023'; end if;
  v_roles := private.fx_roles(a.is_admin, a.is_sadmin);
  select * into s from public.forum_sections where id = p_section and active;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not private.fx_can_write(s, v_roles, a.via_master) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_title = '' then raise exception 'need_title' using errcode = '22023'; end if;
  if char_length(v_title) > 120 then raise exception 'title_too_long' using errcode = '22023'; end if;
  if v_body = '' then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v_body) > 5000 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if (select count(*) from public.forum_threads x where x.author_id = a.driver_id and x.created_at > now() - interval '1 day') >= 30 then
    raise exception 'too_many' using errcode = '54000';
  end if;
  insert into public.forum_threads (section_id, company_id, author_id, title, status, reply_count, last_activity_at)
  values (s.id, a.company_id, a.driver_id, v_title,
          case when s.has_status then 'ny' else null end,
          1, clock_timestamp())
  returning * into t;
  insert into public.forum_replies (thread_id, author_id, company_id, body)
  values (t.id, a.driver_id, a.company_id, v_body);
  insert into public.forum_reads (driver_id, thread_id, last_read_at)
  values (a.driver_id, t.id, clock_timestamp())
  on conflict (driver_id, thread_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object('id', t.id, 'section', s.id);
end $function$;

-- ── RPC: svara ─────────────────────────────────────────────────────────────

create or replace function public.forum_thread_reply(p_token text, p_thread_id bigint, p_body text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_roles text[]; t public.forum_threads; s public.forum_sections;
        v_body text := btrim(coalesce(p_body, '')); r public.forum_replies;
begin
  select * into a from private.forum_actor(p_token);
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  if not private.forum_has_name(a.driver_id) then raise exception 'need_first_name' using errcode = '22023'; end if;
  v_roles := private.fx_roles(a.is_admin, a.is_sadmin);
  select * into t from public.forum_threads where id = p_thread_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into s from public.forum_sections where id = t.section_id;
  if not private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.fx_can_write(s, v_roles, a.via_master) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_body = '' then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v_body) > 5000 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if (select count(*) from public.forum_replies x where x.author_id = a.driver_id and x.created_at > now() - interval '1 day') >= 100 then
    raise exception 'too_many' using errcode = '54000';
  end if;
  insert into public.forum_replies (thread_id, author_id, company_id, body)
  values (t.id, a.driver_id, a.company_id, v_body) returning * into r;
  update public.forum_threads
     set reply_count = reply_count + 1, last_activity_at = clock_timestamp()
   where id = t.id;
  insert into public.forum_reads (driver_id, thread_id, last_read_at)
  values (a.driver_id, t.id, clock_timestamp())
  on conflict (driver_id, thread_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object('id', r.id, 'thread_id', t.id);
end $function$;

-- ── RPC: status ────────────────────────────────────────────────────────────

create or replace function public.forum_thread_status(p_token text, p_thread_id bigint, p_status text, p_comment text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; t public.forum_threads; s public.forum_sections;
        v_st text := lower(btrim(coalesce(p_status, '')));
        v_c  text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into a from private.forum_actor(p_token);
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  if not (a.is_admin or a.is_sadmin) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_st not in ('ny','pagar','planerad','klar') then raise exception 'bad_status' using errcode = '22023'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  select * into t from public.forum_threads where id = p_thread_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into s from public.forum_sections where id = t.section_id;
  if not s.has_status then raise exception 'forbidden' using errcode = '42501'; end if;
  if s.scope = 'company' and t.company_id <> a.company_id and not a.is_sadmin then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.forum_threads set
    status = v_st, status_by = a.driver_id, status_at = clock_timestamp(),
    status_comment = v_c, last_activity_at = clock_timestamp()
  where id = t.id;
  if v_c is not null then
    insert into public.forum_replies (thread_id, author_id, company_id, body)
    values (t.id, a.driver_id, a.company_id, 'Status: ' || v_st || E'\n' || v_c);
    update public.forum_threads set reply_count = reply_count + 1 where id = t.id;
  end if;
  return jsonb_build_object('ok', true, 'status', v_st);
end $function$;

-- ── RPC: badge (olästa) ────────────────────────────────────────────────────

create or replace function public.forum_classic_badge(p_token text)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_roles text[]; n int;
begin
  select * into a from private.forum_actor(p_token);
  v_roles := private.fx_roles(a.is_admin, a.is_sadmin);
  select count(*)::int into n
  from public.forum_threads t
  join public.forum_sections s on s.id = t.section_id
  left join public.forum_reads r on r.thread_id = t.id and r.driver_id = a.driver_id
  where private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id)
    and t.last_activity_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
    and t.author_id <> a.driver_id;
  return coalesce(n, 0);
end $function$;

grant execute on function public.forum_home(text) to anon, authenticated;
grant execute on function public.forum_section_threads(text, text, boolean) to anon, authenticated;
-- Överlagring utan p_include_klar (PostgREST / äldre klienter)
create or replace function public.forum_section_threads(p_token text, p_section text)
 returns jsonb language sql security definer set search_path to 'public', 'pg_temp' as $function$
  select public.forum_section_threads(p_token, p_section, false);
$function$;
grant execute on function public.forum_section_threads(text, text) to anon, authenticated;

grant execute on function public.forum_thread_get(text, bigint) to anon, authenticated;
grant execute on function public.forum_thread_new(text, text, text, text) to anon, authenticated;
grant execute on function public.forum_thread_reply(text, bigint, text) to anon, authenticated;
grant execute on function public.forum_thread_status(text, bigint, text, text) to anon, authenticated;
grant execute on function public.forum_classic_badge(text) to anon, authenticated;
