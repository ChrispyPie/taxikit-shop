-- Prognos v2 (t833u): barnstol/babyskydd som tillval på bilbokningen + "snart"-rader.
-- Bara tillägg. Ingen tabell tas bort, ingen data raderas.
--  1) Ny kolumn prognos_bookings.addons (text[], tom som standard): 'barnstol' / 'babyskydd'
--     sätts av prognos-sync på den bilbokning som tillvalet hör till.
--  2) prognos_list_bookings returnerar addons, och tar även med öppna bokningar vars tid har
--     passerat (upp till 3 h bakåt) så att appen kan visa dem som "snart" så länge prognosen
--     fortfarande har dem (prognos-sync stänger dem när de försvinner). Övrigt som förut.
--  3) Gamla fristående barnstol-/babyskyddsbokningar (öppna) stängs med status 'merged'.
--     prognos-sync v2 skapar inga nya sådana.
-- Nya statusar som prognos-sync v2 använder (ingen constraint finns): 'expired' (passerad och
-- stöds inte längre av prognosen), 'merged' (se 3).
-- Ordning vid go-live: denna SQL -> deploy prognos-sync -> merge av appen.
-- Ångra: supabase/migrations/undo/20261103a_prognos_v2_undo.sql

alter table public.prognos_bookings
  add column if not exists addons text[] not null default '{}';

create or replace function public.prognos_list_bookings(p_token text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; v_from timestamptz; v_to timestamptz;
begin
  select * into a from private.session_actor(p_token);
  v_from := coalesce(p_from, now() - interval '15 minutes');
  v_to := coalesce(p_to, now() + interval '2 hours 30 minutes');
  return coalesce((
    select json_agg(json_build_object(
      'id', id, 'zone_id', zone_id, 'zone_name', zone_name, 'category', category,
      'estimated_at', estimated_at, 'observed_at', observed_at, 'block_index', block_index,
      'current_block', coalesce(current_block, block_index),
      'confidence', confidence, 'status', status, 'addons', addons
    ) order by estimated_at, zone_id, category)
    from public.prognos_bookings
    where status = 'open'
      and estimated_at <= v_to
      and (estimated_at >= v_from
           or (p_from is null and estimated_at >= now() - interval '3 hours'))
  ), '[]'::json);
end $function$;

update public.prognos_bookings
   set status = 'merged'
 where status = 'open' and category in ('barnstol', 'babyskydd');
