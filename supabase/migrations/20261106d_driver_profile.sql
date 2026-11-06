-- Offentlig förarprofil (2026-11-06d): social profilsida, galleri, gästbok.
-- Additivt. Ångra: supabase/migrations/undo/20261106d_driver_profile_undo.sql
-- Applicera INTE i prod förrän Christian sagt kör.
-- Personuppgifter (get_my_profile/save_my_profile) orörda.

create table if not exists public.driver_profiles (
  driver_id       text primary key,
  taxi_start_year int check (taxi_start_year is null or taxi_start_year between 1970 and extract(year from now())::int + 1),
  home_zone       text check (home_zone is null or char_length(btrim(home_zone)) between 1 and 80),
  fav_zone        text check (fav_zone is null or char_length(btrim(fav_zone)) between 1 and 80),
  shift           text check (shift is null or shift in ('dag','natt','extra')),
  languages       text check (languages is null or char_length(languages) <= 200),
  bio             text check (bio is null or char_length(bio) <= 500),
  hobbies         text check (hobbies is null or char_length(hobbies) <= 300),
  permits         text check (permits is null or char_length(permits) <= 400),
  also_uber_bolt  boolean not null default false,
  fun_tip         text check (fun_tip is null or char_length(fun_tip) <= 300),
  -- synlighet per fält: 'alla' | 'akeri' (default alla). Saknas nyckel = alla.
  visibility      jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default clock_timestamp()
);

create table if not exists public.profile_gallery (
  id         bigserial primary key,
  driver_id  text not null,
  path       text not null,
  caption    text check (caption is null or char_length(caption) <= 120),
  sort_order int not null default 0,
  uploaded   boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists profile_gallery_driver_idx on public.profile_gallery (driver_id, sort_order, id);

create table if not exists public.profile_guestbook (
  id          bigserial primary key,
  profile_id  text not null,
  author_id   text not null,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  hidden      boolean not null default false,
  created_at  timestamptz not null default clock_timestamp()
);
create index if not exists profile_guestbook_profile_idx on public.profile_guestbook (profile_id, created_at desc);

alter table public.driver_profiles enable row level security;
alter table public.profile_gallery enable row level security;
alter table public.profile_guestbook enable row level security;
revoke all on public.driver_profiles from anon, authenticated;
revoke all on public.profile_gallery from anon, authenticated;
revoke all on public.profile_guestbook from anon, authenticated;
revoke all on sequence public.profile_gallery_id_seq from anon, authenticated;
revoke all on sequence public.profile_guestbook_id_seq from anon, authenticated;

drop trigger if exists zz_demo_write_guard on public.driver_profiles;
create trigger zz_demo_write_guard before insert or delete or update on public.driver_profiles
  for each statement execute function private.demo_write_guard();
drop trigger if exists zz_demo_write_guard on public.profile_gallery;
create trigger zz_demo_write_guard before insert or delete or update on public.profile_gallery
  for each statement execute function private.demo_write_guard();
drop trigger if exists zz_demo_write_guard on public.profile_guestbook;
create trigger zz_demo_write_guard before insert or delete or update on public.profile_guestbook
  for each statement execute function private.demo_write_guard();

-- Storage-bucket (privat). Edge-funktionen profil-galleri skriver via service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-gallery', 'profile-gallery', false, 1500000, array['image/jpeg']::text[])
on conflict (id) do nothing;

-- ── Hjälpare ───────────────────────────────────────────────────────────────

create or replace function private.profile_vis_ok(p_vis jsonb, p_field text, p_same_co boolean)
 returns boolean language sql immutable as $function$
  select case coalesce(p_vis ->> p_field, 'alla')
    when 'akeri' then p_same_co
    else true
  end;
$function$;

create or replace function private.profile_field(p_vis jsonb, p_field text, p_val text, p_same_co boolean, p_mine boolean)
 returns text language sql immutable as $function$
  select case when p_mine or private.profile_vis_ok(p_vis, p_field, p_same_co) then p_val end;
$function$;

-- ── RPC: hämta profil (egen eller annans) ──────────────────────────────────

create or replace function public.profile_get(p_token text, p_driver_id text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_id text; d public.drivers; pr public.driver_profiles;
        v_same boolean; v_mine boolean; v_co text; v_roles text[];
        v_threads int; v_replies int; cc record;
begin
  select * into a from private.forum_actor(p_token);
  v_id := coalesce(nullif(btrim(p_driver_id), ''), a.driver_id);
  select * into d from public.drivers where id = v_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_co := private.actor_company(d.id);
  v_mine := d.id = a.driver_id;
  v_same := v_co = a.company_id or a.is_sadmin;
  select * into pr from public.driver_profiles where driver_id = d.id;
  -- Räknare: bara trådar/svar i sektioner tittaren får läsa (Admin syns aldrig för förare).
  v_roles := private.fx_roles(a.is_admin, a.is_sadmin);
  select count(*)::int into v_threads
    from public.forum_threads t
    join public.forum_sections s on s.id = t.section_id
   where t.author_id = d.id
     and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id);
  select count(*)::int into v_replies
    from public.forum_replies r
    join public.forum_threads t on t.id = r.thread_id
    join public.forum_sections s on s.id = t.section_id
   where r.author_id = d.id and not r.hidden
     and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id);
  select * into cc from private.bil_current_car(d.id, v_co);

  return jsonb_build_object(
    'id', d.id,
    'name', private.forum_name(d.id),
    'ak', private.forum_avatar(d.id),
    'co', private.forum_co_name(v_co),
    'co_id', v_co,
    'mine', v_mine,
    'is_admin', a.is_admin,
    'is_sadmin', a.is_sadmin,
    'can_edit', v_mine and not coalesce(a.via_master, false),
    'can_delete_guestbook', v_mine or a.is_admin or a.is_sadmin,
    'taxi_start_year', case when v_mine or private.profile_vis_ok(coalesce(pr.visibility,'{}'::jsonb),'taxi_start_year', v_same)
                            then pr.taxi_start_year end,
    'years_taxi', case when pr.taxi_start_year is not null
                         and (v_mine or private.profile_vis_ok(coalesce(pr.visibility,'{}'::jsonb),'taxi_start_year', v_same))
                       then greatest(0, extract(year from now())::int - pr.taxi_start_year) end,
    'home_zone', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'home_zone', pr.home_zone, v_same, v_mine),
    'fav_zone', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'fav_zone', pr.fav_zone, v_same, v_mine),
    'shift', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'shift', pr.shift, v_same, v_mine),
    'languages', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'languages', pr.languages, v_same, v_mine),
    'bio', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'bio', pr.bio, v_same, v_mine),
    'hobbies', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'hobbies', pr.hobbies, v_same, v_mine),
    'permits', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'permits', pr.permits, v_same, v_mine),
    'also_uber_bolt', case when v_mine or private.profile_vis_ok(coalesce(pr.visibility,'{}'::jsonb),'also_uber_bolt', v_same)
                           then coalesce(pr.also_uber_bolt, false) end,
    'fun_tip', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'fun_tip', pr.fun_tip, v_same, v_mine),
    'visibility', case when v_mine then coalesce(pr.visibility, '{}'::jsonb) else null end,
    'stats', jsonb_build_object(
      'forum_threads', v_threads,
      'forum_replies', v_replies
    ),
    'car', case when cc.car_id is not null then jsonb_build_object(
             'id', cc.car_id, 'label', cc.label, 'source', cc.source, 'at', cc.at
           ) end,
    'gallery_n', (select count(*)::int from public.profile_gallery g where g.driver_id = d.id and g.uploaded),
    'guestbook_n', (select count(*)::int from public.profile_guestbook g where g.profile_id = d.id and not g.hidden)
  );
end $function$;

-- ── RPC: spara social profil ───────────────────────────────────────────────

create or replace function public.profile_save(p_token text, p_data jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v jsonb := coalesce(p_data, '{}'::jsonb); v_vis jsonb;
        v_year int; v_shift text;
begin
  select * into a from private.forum_actor(p_token);
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;

  v_year := nullif(v->>'taxi_start_year','')::int;
  if v_year is not null and (v_year < 1970 or v_year > extract(year from now())::int + 1) then
    raise exception 'bad_year' using errcode = '22023';
  end if;
  v_shift := nullif(btrim(coalesce(v->>'shift','')), '');
  if v_shift is not null and v_shift not in ('dag','natt','extra') then
    raise exception 'bad_shift' using errcode = '22023';
  end if;
  v_vis := coalesce(v->'visibility', '{}'::jsonb);

  insert into public.driver_profiles as p (
    driver_id, taxi_start_year, home_zone, fav_zone, shift, languages, bio, hobbies, permits,
    also_uber_bolt, fun_tip, visibility, updated_at
  ) values (
    a.driver_id, v_year,
    nullif(btrim(coalesce(v->>'home_zone','')), ''),
    nullif(btrim(coalesce(v->>'fav_zone','')), ''),
    v_shift,
    nullif(left(btrim(coalesce(v->>'languages','')), 200), ''),
    nullif(left(btrim(coalesce(v->>'bio','')), 500), ''),
    nullif(left(btrim(coalesce(v->>'hobbies','')), 300), ''),
    nullif(left(btrim(coalesce(v->>'permits','')), 400), ''),
    coalesce((v->>'also_uber_bolt')::boolean, false),
    nullif(left(btrim(coalesce(v->>'fun_tip','')), 300), ''),
    v_vis, clock_timestamp()
  )
  on conflict (driver_id) do update set
    taxi_start_year = excluded.taxi_start_year,
    home_zone = excluded.home_zone,
    fav_zone = excluded.fav_zone,
    shift = excluded.shift,
    languages = excluded.languages,
    bio = excluded.bio,
    hobbies = excluded.hobbies,
    permits = excluded.permits,
    also_uber_bolt = excluded.also_uber_bolt,
    fun_tip = excluded.fun_tip,
    visibility = excluded.visibility,
    updated_at = clock_timestamp();

  return public.profile_get(p_token, a.driver_id);
end $function$;

-- ── Galleri RPC:er (edge profil-galleri) ───────────────────────────────────

create or replace function public.profile_gallery_list(p_token text, p_driver_id text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_id text;
begin
  select * into a from private.forum_actor(p_token);
  v_id := coalesce(nullif(btrim(p_driver_id), ''), a.driver_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'path', g.path, 'caption', g.caption, 'created_at', g.created_at) order by g.sort_order, g.id)
    from public.profile_gallery g where g.driver_id = v_id and g.uploaded
  ), '[]'::jsonb);
end $function$;

create or replace function public.profile_gallery_begin(p_token text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; g public.profile_gallery; v_path text; v_n int;
begin
  select * into a from private.forum_actor(p_token);
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  select count(*) into v_n from public.profile_gallery where driver_id = a.driver_id and uploaded;
  if v_n >= 24 then raise exception 'too_many' using errcode = '54000'; end if;
  v_path := a.driver_id || '/' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '.jpg';
  insert into public.profile_gallery (driver_id, path, sort_order, uploaded)
  values (a.driver_id, v_path, v_n, false) returning * into g;
  return jsonb_build_object('id', g.id, 'path', g.path);
end $function$;

create or replace function public.profile_gallery_finish(p_photo_id bigint, p_ok boolean)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if coalesce(p_ok, false) then
    update public.profile_gallery set uploaded = true where id = p_photo_id;
  else
    delete from public.profile_gallery where id = p_photo_id and not uploaded;
  end if;
end $function$;

create or replace function public.profile_gallery_delete_svc(p_token text, p_photo_id bigint)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; g public.profile_gallery;
begin
  select * into a from private.forum_actor(p_token);
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  select * into g from public.profile_gallery where id = p_photo_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if g.driver_id <> a.driver_id and not a.is_sadmin then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.profile_gallery where id = g.id;
  return jsonb_build_object('path', g.path);
end $function$;

-- ── Gästbok ────────────────────────────────────────────────────────────────

create or replace function public.profile_guestbook_list(p_token text, p_driver_id text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_id text;
begin
  select * into a from private.forum_actor(p_token);
  v_id := coalesce(nullif(btrim(p_driver_id), ''), a.driver_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id,
      'body', g.body,
      'author', private.forum_name(g.author_id),
      'aid', case when not private.is_demo() then g.author_id end,
      'mine', g.author_id = a.driver_id,
      'created_at', g.created_at
    ) order by g.created_at desc)
    from (
      select * from public.profile_guestbook x
       where x.profile_id = v_id and not x.hidden
       order by x.created_at desc limit 50
    ) g
  ), '[]'::jsonb);
end $function$;

create or replace function public.profile_guestbook_add(p_token text, p_driver_id text, p_body text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v text := btrim(coalesce(p_body,'')); g public.profile_guestbook; v_id text;
begin
  select * into a from private.forum_actor(p_token);
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  if not private.forum_has_name(a.driver_id) then raise exception 'need_first_name' using errcode = '22023'; end if;
  v_id := nullif(btrim(coalesce(p_driver_id,'')), '');
  if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.drivers where id = v_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v = '' then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v) > 500 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if (select count(*) from public.profile_guestbook x where x.author_id = a.driver_id and x.created_at > now() - interval '1 day') >= 30 then
    raise exception 'too_many' using errcode = '54000';
  end if;
  insert into public.profile_guestbook (profile_id, author_id, body)
  values (v_id, a.driver_id, v) returning * into g;
  return jsonb_build_object('id', g.id);
end $function$;

create or replace function public.profile_guestbook_delete(p_token text, p_id bigint)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; g public.profile_guestbook;
begin
  select * into a from private.forum_actor(p_token);
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  select * into g from public.profile_guestbook where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if g.profile_id <> a.driver_id and g.author_id <> a.driver_id and not a.is_admin and not a.is_sadmin then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profile_guestbook set hidden = true where id = g.id;
  return jsonb_build_object('ok', true);
end $function$;


-- ── RPC: lista läsbara forum-trådar/svar för en förare (tittarens behörighet) ──

create or replace function public.profile_forum_list(p_token text, p_driver_id text, p_kind text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare a record; v_id text; v_roles text[]; v_kind text;
begin
  select * into a from private.forum_actor(p_token);
  v_id := coalesce(nullif(btrim(p_driver_id), ''), a.driver_id);
  if not exists (select 1 from public.drivers where id = v_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_kind := lower(coalesce(nullif(btrim(p_kind), ''), 'threads'));
  if v_kind not in ('threads', 'replies') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  v_roles := private.fx_roles(a.is_admin, a.is_sadmin);

  if v_kind = 'threads' then
    return jsonb_build_object(
      'kind', 'threads',
      'driver_id', v_id,
      'name', private.forum_name(v_id),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q.id,
          'thread_id', q.id,
          'title', q.title,
          'section_id', q.section_id,
          'section', q.section_title,
          'status', q.status,
          'created_at', q.created_at,
          'reply_count', q.reply_count
        ) order by q.created_at desc)
        from (
          select t.id, t.title, t.section_id, s.title as section_title, t.status,
                 t.created_at, t.reply_count
            from public.forum_threads t
            join public.forum_sections s on s.id = t.section_id
           where t.author_id = v_id
             and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id)
           order by t.created_at desc
           limit 50
        ) q
      ), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'kind', 'replies',
    'driver_id', v_id,
    'name', private.forum_name(v_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'thread_id', q.thread_id,
        'title', q.title,
        'section_id', q.section_id,
        'section', q.section_title,
        'excerpt', q.excerpt,
        'created_at', q.created_at
      ) order by q.created_at desc)
      from (
        select r.id, r.thread_id, t.title, t.section_id, s.title as section_title,
               left(r.body, 140) as excerpt, r.created_at
          from public.forum_replies r
          join public.forum_threads t on t.id = r.thread_id
          join public.forum_sections s on s.id = t.section_id
         where r.author_id = v_id and not r.hidden
           and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id)
         order by r.created_at desc
         limit 50
      ) q
    ), '[]'::jsonb)
  );
end $function$;

grant execute on function public.profile_get(text, text) to anon, authenticated;
grant execute on function public.profile_forum_list(text, text, text) to anon, authenticated;
grant execute on function public.profile_save(text, jsonb) to anon, authenticated;
grant execute on function public.profile_gallery_list(text, text) to anon, authenticated;
grant execute on function public.profile_gallery_begin(text) to anon, authenticated;
grant execute on function public.profile_gallery_finish(bigint, boolean) to anon, authenticated;
grant execute on function public.profile_gallery_delete_svc(text, bigint) to anon, authenticated;
grant execute on function public.profile_guestbook_list(text, text) to anon, authenticated;
grant execute on function public.profile_guestbook_add(text, text, text) to anon, authenticated;
grant execute on function public.profile_guestbook_delete(text, bigint) to anon, authenticated;

-- Överlagring: profile_get utan p_driver_id
create or replace function public.profile_get(p_token text)
 returns jsonb language sql security definer set search_path to 'public', 'pg_temp' as $function$
  select public.profile_get(p_token, null::text);
$function$;
grant execute on function public.profile_get(text) to anon, authenticated;
