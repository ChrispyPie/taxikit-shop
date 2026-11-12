-- 20261112c: villkor för tågbevakningar (när en bevakning får ge notis och ljud).
--
-- Nytt (bara tillägg, inget befintligt ändras):
--  * tabell private.bev_villkor: förarens villkor som jsonb, en rad per förare
--    { v: 1, updated_at, tag: { default: {sound, lead_min, small_min, big_min, jump_min},
--                               dep: { "t<tågnr>|<planerad ISO>" | "rw<id>": {...} } } }
--  * RPC bev_villkor_get / bev_villkor_save (inloggad förare via p_token, demokonton sparar inget)
--  * service-funktion bev_svc_villkor(p_drivers) (bara service_role, används av edge-funktionen bevakning)
-- Siffrorna valideras och begränsas i appen och i edge-funktionen (villkor.ts normalize), här bara storlek och typ.
-- Appen och edge-funktionen klarar sig utan migrationen: appen sparar då bara i telefonen och servern
-- använder standardvillkoren (tystare än förut).
-- Ångra: undo/20261112c_bev_villkor_undo.sql

create table if not exists private.bev_villkor (
  driver_id text primary key references public.drivers(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint bev_villkor_obj check (jsonb_typeof(data) = 'object'),
  constraint bev_villkor_size check (pg_column_size(data) <= 32768)
);
revoke all on table private.bev_villkor from public, anon, authenticated;

comment on table private.bev_villkor is
  'Förarens villkor för när tågbevakningar ger notis och ljud (Mina bevakningar). Se TaxiData/tag-villkor.js.';

create or replace function public.bev_villkor_get(p_token text) returns jsonb
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v jsonb;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then return null; end if;
  select b.data into v from private.bev_villkor b where b.driver_id = a.driver_id;
  return v;
end $$;

create or replace function public.bev_villkor_save(p_token text, p_data jsonb) returns jsonb
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then return p_data; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'bad_data' using errcode = '22023';
  end if;
  if pg_column_size(p_data) > 32768 then
    raise exception 'too_big' using errcode = '22023';
  end if;
  if p_data ? 'tag' and jsonb_typeof(p_data->'tag') <> 'object' then
    raise exception 'bad_data' using errcode = '22023';
  end if;
  insert into private.bev_villkor (driver_id, data, updated_at)
  values (a.driver_id, p_data, now())
  on conflict (driver_id) do update set data = excluded.data, updated_at = now();
  return p_data;
end $$;

create or replace function public.bev_svc_villkor(p_drivers text[]) returns jsonb
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(jsonb_object_agg(b.driver_id, b.data), '{}'::jsonb)
    from private.bev_villkor b
   where b.driver_id = any(coalesce(p_drivers, '{}'::text[]))
$$;

revoke all on function public.bev_villkor_get(text) from public;
revoke all on function public.bev_villkor_save(text, jsonb) from public;
revoke all on function public.bev_svc_villkor(text[]) from public, anon, authenticated;
grant execute on function public.bev_villkor_get(text) to anon, authenticated, service_role;
grant execute on function public.bev_villkor_save(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.bev_svc_villkor(text[]) to service_role;
