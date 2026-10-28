-- Notisflöde i förarappen (2026-10-28): notiser sparas så att de finns kvar när föraren öppnar appen.
-- Push-notiser (flyg/tåg-bevakning, prognos) sparades inte någonstans tidigare. Nu lägger telefonen in dem här
-- (sw.js sparar i telefonen → notis.js skickar hit när appen öppnas). Flödet visar dessutom de notiser som redan
-- finns i event_notices (Bil & verkstad, Forum, Kalender).
-- Bara tillägg: en ny tabell + tre nya RPC:er. Inga befintliga tabeller eller funktioner ändras.
-- Ångra: supabase/migrations/undo/20261028r_notisflode_undo.sql (och /workspace/backups/UNDO-notisflode-2026-10-28.md)

create table if not exists public.push_notices (
  id bigserial primary key,
  driver_id text not null,
  nkey text not null check (char_length(nkey) between 1 and 200),          -- avdubblering per förare
  kind text not null default 'push' check (kind ~ '^[a-z_]{1,20}$'),       -- flyg, tag, prognos, test, push
  tag text check (tag is null or char_length(tag) <= 120),
  title text not null check (char_length(title) between 1 and 200),
  body text check (body is null or char_length(body) <= 600),
  created_at timestamptz not null default clock_timestamp(),               -- när notisen kom till telefonen
  saved_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (driver_id, nkey)
);
create index if not exists push_notices_driver_idx on public.push_notices (driver_id, created_at desc);

-- RLS på, inga policies: ingen kommer åt tabellen direkt, allt går via RPC:erna nedan.
alter table public.push_notices enable row level security;
revoke all on public.push_notices from anon, authenticated;
revoke all on sequence public.push_notices_id_seq from anon, authenticated;

-- demokonton får inte skriva (samma spärr som övriga tabeller)
drop trigger if exists zz_demo_write_guard on public.push_notices;
create trigger zz_demo_write_guard before insert or delete or update on public.push_notices
  for each statement execute function private.demo_write_guard();

-- Spara push-notiser som telefonen tagit emot. p_items = [{key, kind, tag, title, body, at (ms), read}], högst 50 per anrop.
-- Samma key två gånger sparas bara en gång. Egna push-notiser äldre än 60 dagar rensas.
create or replace function public.notis_add(p_token text, p_items jsonb)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; n integer := 0; x jsonb; v_at timestamptz; v_kind text;
begin
  select * into a from private.session_actor(p_token);   -- kastar 28000 invalid_session
  if private.is_demo() then return 0; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return 0; end if;
  for x in select value from jsonb_array_elements(p_items) with ordinality t(value, i) where i <= 50 loop
    if jsonb_typeof(x) <> 'object' or coalesce(btrim(x->>'key'), '') = '' or coalesce(btrim(x->>'title'), '') = '' then continue; end if;
    v_kind := lower(coalesce(x->>'kind', 'push'));
    if v_kind !~ '^[a-z_]{1,20}$' then v_kind := 'push'; end if;
    v_at := null;
    begin
      if (x->>'at') ~ '^\d{10,14}$' then v_at := to_timestamp((x->>'at')::bigint / 1000.0); end if;
    exception when others then v_at := null;
    end;
    v_at := least(clock_timestamp(), greatest(clock_timestamp() - interval '7 days', coalesce(v_at, clock_timestamp())));
    insert into public.push_notices (driver_id, nkey, kind, tag, title, body, created_at, read_at)
    values (a.driver_id, left(btrim(x->>'key'), 200), v_kind, left(x->>'tag', 120), left(btrim(x->>'title'), 200),
            nullif(left(coalesce(x->>'body', ''), 600), ''), v_at,
            case when x->>'read' = 'true' then clock_timestamp() end)
    on conflict (driver_id, nkey) do nothing;
    if found then n := n + 1; end if;
  end loop;
  delete from public.push_notices where driver_id = a.driver_id and created_at < now() - interval '60 days';
  return n;
end $function$;

-- Hela notisflödet för föraren: egna push-notiser + notiser från Bil & verkstad, Forum och Kalender (event_notices).
-- src: 'p' = push_notices, 'e' = event_notices. Nyast först, högst p_limit (max 150). unread = antal olästa.
create or replace function public.notis_feed(p_token text, p_limit integer default 80)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; v_lim integer := least(greatest(coalesce(p_limit, 80), 1), 150); r jsonb; u integer;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then return jsonb_build_object('items', '[]'::jsonb, 'unread', 0); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]') into r from (
    select * from (
      (select 'p'::text src, p.id, p.kind, p.tag, p.title, p.body, p.created_at, p.read_at is not null as read,
              null::bigint event_id, null::bigint forum_post_id
         from public.push_notices p where p.driver_id = a.driver_id order by p.created_at desc limit v_lim)
      union all
      (select 'e'::text, e.id, e.kind, null::text, null::text, e.body, e.created_at, e.read_at is not null,
              e.event_id, e.forum_post_id
         from public.event_notices e where e.driver_id = a.driver_id order by e.created_at desc limit v_lim)
    ) y order by created_at desc limit v_lim) x;
  select (select count(*) from public.push_notices where driver_id = a.driver_id and read_at is null)
       + (select count(*) from public.event_notices where driver_id = a.driver_id and read_at is null) into u;
  return jsonb_build_object('items', r, 'unread', u);
end $function$;

-- Markera som läst: en notis (p_src 'p' eller 'e' + p_id) eller allt (p_id null). Bara förarens egna.
create or replace function public.notis_read(p_token text, p_src text default null, p_id bigint default null)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; n integer := 0; m integer := 0;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then return 0; end if;
  if p_id is null then
    update public.push_notices set read_at = now() where driver_id = a.driver_id and read_at is null;
    get diagnostics n = row_count;
    update public.event_notices set read_at = now() where driver_id = a.driver_id and read_at is null;
    get diagnostics m = row_count;
    return n + m;
  elsif p_src = 'p' then
    update public.push_notices set read_at = now() where driver_id = a.driver_id and id = p_id and read_at is null;
  elsif p_src = 'e' then
    update public.event_notices set read_at = now() where driver_id = a.driver_id and id = p_id and read_at is null;
  end if;
  get diagnostics n = row_count;
  return n;
end $function$;

revoke all on function public.notis_add(text, jsonb) from public;
revoke all on function public.notis_feed(text, integer) from public;
revoke all on function public.notis_read(text, text, bigint) from public;
grant execute on function public.notis_add(text, jsonb) to anon, authenticated;
grant execute on function public.notis_feed(text, integer) to anon, authenticated;
grant execute on function public.notis_read(text, text, bigint) to anon, authenticated;
