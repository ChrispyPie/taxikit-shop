-- Ångra 20261104a_prognos_history.sql (tar bort historiken, prognos_bookings påverkas inte)
select cron.unschedule(jobid) from cron.job where jobname = 'prognos-history-prune';
drop trigger if exists prognos_history_trg on public.prognos_bookings;
drop function if exists private.prognos_history_capture();
drop function if exists private.prognos_history_prune();
drop table if exists public.prognos_booking_history;
