-- 2026-10-28u Notiser sparas på servern när pushen skickas (t547u)
-- Bara tillägg/utökningar:
--  * ny notis_svc_add (bara service_role, anropas av edge-funktionerna bevakning och prognos-sync)
--  * notis_add: om samma notis redan finns (servern sparade den först) och föraren redan läst den i telefonen -> markera läst
--  * notis_feed: skickar även nkey så att appen inte visar samma notis två gånger
-- Ångra: supabase/migrations/undo/20261028u_notis_server_undo.sql
create or replace function public.notis_svc_add(p_driver text, p_key text, p_kind text, p_tag text, p_title text, p_body text)
 returns boolean language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_kind text := lower(coalesce(p_kind, 'push'));
begin
  if coalesce(btrim(p_driver), '') = '' or coalesce(btrim(p_key), '') = '' or coalesce(btrim(p_title), '') = '' then return false; end if;
  if not exists (select 1 from public.drivers d where d.id = p_driver) then return false; end if;
  if v_kind !~ '^[a-z_]{1,20}$' then v_kind := 'push'; end if;
  insert into public.push_notices (driver_id, nkey, kind, tag, title, body, created_at)
  values (p_driver, left(btrim(p_key), 200), v_kind, left(p_tag, 120), left(btrim(p_title), 200),
          nullif(left(coalesce(p_body, ''), 600), ''), clock_timestamp())
  on conflict (driver_id, nkey) do nothing;
  return found;
end $function$;
revoke all on function public.notis_svc_add(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notis_svc_add(text, text, text, text, text, text) to service_role;

CREATE OR REPLACE FUNCTION public.notis_add(p_token text, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    on conflict (driver_id, nkey) do update set read_at = coalesce(push_notices.read_at, excluded.read_at)
      where excluded.read_at is not null and push_notices.read_at is null;
    if found then n := n + 1; end if;
  end loop;
  delete from public.push_notices where driver_id = a.driver_id and created_at < now() - interval '60 days';
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.notis_feed(p_token text, p_limit integer DEFAULT 80)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; v_lim integer := least(greatest(coalesce(p_limit, 80), 1), 150); r jsonb; u integer;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then return jsonb_build_object('items', '[]'::jsonb, 'unread', 0); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]') into r from (
    select * from (
      (select 'p'::text src, p.id, p.kind, p.tag, p.title, p.body, p.created_at, p.read_at is not null as read, p.nkey,
              null::bigint event_id, null::bigint forum_post_id
         from public.push_notices p where p.driver_id = a.driver_id order by p.created_at desc limit v_lim)
      union all
      (select 'e'::text, e.id, e.kind, null::text, null::text, e.body, e.created_at, e.read_at is not null, null::text,
              e.event_id, e.forum_post_id
         from public.event_notices e where e.driver_id = a.driver_id order by e.created_at desc limit v_lim)
    ) y order by created_at desc limit v_lim) x;
  select (select count(*) from public.push_notices where driver_id = a.driver_id and read_at is null)
       + (select count(*) from public.event_notices where driver_id = a.driver_id and read_at is null) into u;
  return jsonb_build_object('items', r, 'unread', u);
end $function$
;
