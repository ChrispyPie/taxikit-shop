-- Ångra 20261112a_delad_enhet_after_ingest.sql
-- Tar bort service-role-wrappern. private.delad_enhet_expire och
-- pg_cron taxikit-delad-enhet-expire (minut 20) lämnas orörda.

drop function if exists public.delad_enhet_svc_expire();

notify pgrst, 'reload schema';
