-- 2026-10-28v Notiser vet vart de leder (t551u): Prognos-notiser öppnar rätt zon och visar förbokningen.
-- Bara tillägg/utökningar (bakåtkompatibelt, gamla appen och gamla edge-funktioner påverkas inte):
--  * push_notices.target (jsonb, får vara tom): t.ex. {"zone":"161","cat":"app","at":"2026-10-28T14:35:00Z","id":"123"}
--  * private.notis_target: tvättar target (bara zone/cat/at/id i rätt format, annars tomt)
--  * ny notis_svc_add med p_target (7 argument, bara service_role). Den gamla med 6 argument finns kvar.
--  * notis_add: tar emot target från appen (fyller i target om raden saknar det)
--  * notis_feed: skickar target
-- Ångra: supabase/migrations/undo/20261028v_notis_target_undo.sql
alter table public.push_notices add column if not exists target jsonb;

create or replace function private.notis_target(p jsonb)
 returns jsonb language sql immutable set search_path to 'pg_catalog', 'pg_temp'
as $function$
  select case when p is null or jsonb_typeof(p) <> 'object' then null else nullif(jsonb_strip_nulls(jsonb_build_object(
    'zone', case when p->>'zone' ~ '^[0-9]{1,5}$' then p->>'zone' end,
    'cat',  case when p->>'cat' ~ '^[a-z_]{1,20}$' then p->>'cat' end,
    'at',   case when p->>'at' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,6})?)?(Z|[+-]\d\d:?\d\d)?$' then p->>'at' end,
    'id',   case when p->>'id' ~ '^[0-9]{1,18}$' then p->>'id' end
  )), '{}'::jsonb) end
$function$;
revoke all on function private.notis_target(jsonb) from public, anon, authenticated;

create or replace function public.notis_svc_add(p_driver text, p_key text, p_kind text, p_tag text, p_title text, p_body text, p_target jsonb)
 returns boolean language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_kind text := lower(coalesce(p_kind, 'push'));
begin
  if coalesce(btrim(p_driver), '') = '' or coalesce(btrim(p_key), '') = '' or coalesce(btrim(p_title), '') = '' then return false; end if;
  if not exists (select 1 from public.drivers d where d.id = p_driver) then return false; end if;
  if v_kind !~ '^[a-z_]{1,20}$' then v_kind := 'push'; end if;
  insert into public.push_notices (driver_id, nkey, kind, tag, title, body, created_at, target)
  values (p_driver, left(btrim(p_key), 200), v_kind, left(p_tag, 120), left(btrim(p_title), 200),
          nullif(left(coalesce(p_body, ''), 600), ''), clock_timestamp(), private.notis_target(p_target))
  on conflict (driver_id, nkey) do nothing;
  return found;
end $function$;
revoke all on function public.notis_svc_add(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.notis_svc_add(text, text, text, text, text, text, jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.notis_add(p_token text, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; n integer := 0; x jsonb; v_at timestamptz; v_kind text; v_tg jsonb;
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
    v_tg := private.notis_target(x->'target');
    insert into public.push_notices (driver_id, nkey, kind, tag, title, body, created_at, read_at, target)
    values (a.driver_id, left(btrim(x->>'key'), 200), v_kind, left(x->>'tag', 120), left(btrim(x->>'title'), 200),
            nullif(left(coalesce(x->>'body', ''), 600), ''), v_at,
            case when x->>'read' = 'true' then clock_timestamp() end, v_tg)
    on conflict (driver_id, nkey) do update set read_at = coalesce(push_notices.read_at, excluded.read_at),
                                                target = coalesce(push_notices.target, excluded.target)
      where (excluded.read_at is not null and push_notices.read_at is null)
         or (excluded.target is not null and push_notices.target is null);
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
      (select 'p'::text src, p.id, p.kind, p.tag, p.title, p.body, p.created_at, p.read_at is not null as read, p.nkey, p.target,
              null::bigint event_id, null::bigint forum_post_id
         from public.push_notices p where p.driver_id = a.driver_id order by p.created_at desc limit v_lim)
      union all
      (select 'e'::text, e.id, e.kind, null::text, null::text, e.body, e.created_at, e.read_at is not null, null::text, null::jsonb,
              e.event_id, e.forum_post_id
         from public.event_notices e where e.driver_id = a.driver_id order by e.created_at desc limit v_lim)
    ) y order by created_at desc limit v_lim) x;
  select (select count(*) from public.push_notices where driver_id = a.driver_id and read_at is null)
       + (select count(*) from public.event_notices where driver_id = a.driver_id and read_at is null) into u;
  return jsonb_build_object('items', r, 'unread', u);
end $function$
;
