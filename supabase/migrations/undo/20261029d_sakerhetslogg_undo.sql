-- Ångra 20261029d_sakerhetslogg.sql
select cron.unschedule('taxikit-log-prune') where exists (select 1 from cron.job where jobname = 'taxikit-log-prune');
drop function if exists public.admin_log_page_v2(text, integer, timestamp with time zone, bigint, text[], text, text);
drop trigger if exists activity_log_meta on public.activity_log;
drop function if exists private.activity_log_meta();
drop function if exists private.request_meta();
drop index if exists public.activity_log_ip_idx;
drop index if exists public.activity_log_device_idx;
-- Kolumnerna lämnas kvar (tomma för nya rader efter ångra). Ta bort dem också om IP/enhet ska raderas:
-- alter table public.activity_log drop column if exists ip, drop column if exists user_agent, drop column if exists device_id;
