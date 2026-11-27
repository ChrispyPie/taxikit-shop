-- 2026-11-27 C: vilka bilar har föraren kört de senaste dagarna (körpassdata), för frågan "Är det rätt bil?" i Meddelande/Bokad tid.
-- Läser bara inloggade förarens egna pass (private.shift_fact.forar = sessionens förare). Ingen skrivning. Ångra: undo/20261127c_recent_cars.sql
create or replace function public.my_recent_cars(p_token text, p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = 'public', 'pg_temp' as $f$
declare a record; d integer := least(greatest(coalesce(p_days, 7), 1), 31);
begin
  select * into a from private.session_actor(p_token);
  return coalesce((select jsonb_agg(s.x order by s.x) from (
            select distinct upper(btrim(f.taxi)) as x from private.shift_fact f
             where f.forar = a.driver_id
               and f.day >= ((now() at time zone 'Europe/Stockholm')::date - d)
               and btrim(coalesce(f.taxi, '')) <> '') s), '[]'::jsonb);
end $f$;
revoke all on function public.my_recent_cars(text, integer) from public;
grant execute on function public.my_recent_cars(text, integer) to anon, authenticated;
