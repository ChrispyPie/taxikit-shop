-- 20261122a: Delad enhet — ny inloggning ska inte omedelbart bli ogiltig för att
-- timkörningen är tyst (stale). Det gav en inloggningsslinga: login lyckades,
-- nästa anrop (get_me) såg stale och stängde sessionen, appen laddade om till
-- inloggningsskärmen, om och om igen så länge taxi_delad_enhet var på.
--
-- private.delad_enhet_reason returnerar 'stale' bara om sessionen (p_since)
-- själv är äldre än private.delad_enhet_stale_after(). En just skapad session
-- får vara kvar; en som varit öppen länge stängs fortfarande när datan är gammal.
-- Pass-regeln är oförändrad. Inga tabeller ändras.
-- Ångra: supabase/migrations/undo/20261122a_delad_login_stale_undo.sql

create or replace function private.delad_enhet_reason(p_driver text, p_since timestamptz)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(btrim(p_driver), '') = '' then
    return null;
  end if;
  if exists (
    select 1
      from public.shifts sh
     where sh.dataset = 'current'
       and coalesce(sh.forar, sh.data->>'forar') = p_driver
       and btrim(coalesce(sh.data->>'passnr', '')) <> ''
       and btrim(coalesce(sh.data->>'start', '')) <> ''
       and btrim(coalesce(sh.data->>'slut', '')) <> ''
       and private.shift_ts(sh.data->>'slut') is not null
       and (private.shift_ts(sh.data->>'slut') at time zone 'Europe/Stockholm')
             > coalesce(p_since, '-infinity'::timestamptz)
       and (private.shift_ts(sh.data->>'slut') at time zone 'Europe/Stockholm')
             <= now() + interval '15 minutes'
  ) then
    return 'pass';
  end if;
  if (
       private.delad_enhet_scrape_at() is null
       or private.delad_enhet_scrape_at() <= now() - private.delad_enhet_stale_after()
     )
     and coalesce(p_since, '-infinity'::timestamptz) <= now() - private.delad_enhet_stale_after()
  then
    return 'stale';
  end if;
  return null;
end
$$;

revoke all on function private.delad_enhet_reason(text, timestamptz) from public, anon, authenticated;
