-- Ångra 20261106f_inkorg_arenden.sql (kör i Supabase SQL editor). Inga gamla data ändras av migrationen,
-- så ångra tar bara bort det nya och lägger tillbaka notis_feed som den var före 2026-11-06.

drop trigger if exists aa_case_tag on public.event_notices;
drop function if exists private.event_notice_case_tag();
drop function if exists public.case_inbox(text, integer);
drop function if exists public.case_get(text, text, bigint);
drop function if exists public.case_seen(text, text, bigint);
drop function if exists public.case_admin_list(text, integer);
drop function if exists private.case_unread_notices(text, text, bigint);
drop function if exists private.case_cut(text, int);
drop function if exists private.case_st(text, text, text);

-- notis_feed som före (live-version 2026-11-06, från 20261028v_notis_target)
create or replace function public.notis_feed(p_token text, p_limit integer default 80)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
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
end $function$;

-- Tabellen och kolumnerna tas bort sist (innehåller bara läst-markeringar och kopplingar, inga ärenden)
drop table if exists public.case_reads;
drop index if exists public.event_notices_case_idx;
alter table public.event_notices drop constraint if exists event_notices_case_kind_check;
alter table public.event_notices drop column if exists case_id;
alter table public.event_notices drop column if exists case_kind;
