-- Timkörningen (taxi-goteborg-data, sync_supabase.py) anropar
-- public.delad_enhet_svc_expire() så fort ingest till dataset 'current' är klar.
-- Samma rutin som private.delad_enhet_expire() (pass-slut eller föråldrad hämtning).
-- pg_cron-jobbet taxikit-delad-enhet-expire (minut 20 varje timme) är reserv
-- ifall timkörningen inte går. Dubbelkörning är ofarlig: redan stängda
-- sessioner (expires_at <= now()) väljs inte om, så ingen dubbel notis.

create or replace function public.delad_enhet_svc_expire()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  return private.delad_enhet_expire();
end
$$;

comment on function public.delad_enhet_svc_expire() is
  'Service-role: kör delad-enhet-utloggning efter att timkörningen sparat current. Samma som private.delad_enhet_expire.';

revoke all on function public.delad_enhet_svc_expire() from public, anon, authenticated;
grant execute on function public.delad_enhet_svc_expire() to service_role;

notify pgrst, 'reload schema';
