-- Delad enhet: liten RPC som svarar om den inloggade föraren har ett avslutat pass
-- vars sluttid är efter en given tidpunkt (inloggningen på den här enheten).
--
-- Bakgrund: timkörningen (taxi-goteborg-data, ingest till dataset 'current') skriver bara in
-- ett pass när det är avslutat i STIG (scraper.py: "Ett pass syns först när det är avslutat").
-- Därför räcker det att titta efter ett pass i public.shifts med ifylld, tolkningsbar slut-tid
-- efter p_since — ingen egen klocka, ingen ny tabell.
--
-- Additivt: EN ny funktion. Inga ALTER/DROP av befintliga funktioner eller tabeller.
-- Returnerar bara { "ended": true|false }. Inga namn, telefonnummer, passnummer eller andra uppgifter.
-- Demokonton får alltid ended=false (de visar någon annans data).
-- Ogiltig session ger samma fel som övriga inloggnings-RPC (errcode 28000).
-- Ångra: supabase/migrations/undo/20261110c_delad_enhet_undo.sql

create or replace function public.pass_ended_since(p_token text, p_since timestamptz)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_ended boolean := false;
begin
  if p_since is null then
    return json_build_object('ended', false);
  end if;
  select * into a from private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object('ended', false);
  end if;
  select exists (
    select 1
      from public.shifts s
     where s.dataset = 'current'
       and coalesce(s.forar, s.data->>'forar') = a.driver_id
       and btrim(coalesce(s.data->>'passnr', '')) <> ''
       and btrim(coalesce(s.data->>'start', '')) <> ''
       and btrim(coalesce(s.data->>'slut', '')) <> ''
       and private.shift_ts(s.data->>'slut') is not null
       and (private.shift_ts(s.data->>'slut') at time zone 'Europe/Stockholm') > p_since
       and (private.shift_ts(s.data->>'slut') at time zone 'Europe/Stockholm') <= now() + interval '15 minutes'
  ) into v_ended;
  return json_build_object('ended', coalesce(v_ended, false));
end
$$;

revoke all on function public.pass_ended_since(text, timestamptz) from public;
grant execute on function public.pass_ended_since(text, timestamptz) to anon, authenticated;
