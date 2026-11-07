-- Undo för 20261107b_sjuk_historik.sql
drop trigger if exists sick_ev_cert on private.sick_certs;
drop trigger if exists sick_ev_status on private.sick_reports;
drop trigger if exists sick_ev_ins on private.sick_reports;
drop function if exists private.sick_ev_cert();
drop function if exists private.sick_ev_status();
drop function if exists private.sick_ev_ins();
create or replace function private.sjuk_json(r private.sick_reports, p_boss boolean)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', r.id, 'driver_id', r.driver_id, 'name', private.bil_driver_name(r.driver_id),
    'start', r.start_date, 'end', r.end_date, 'open', r.end_date is null, 'days', private.sjuk_days(r),
    'comment', r.comment, 'status', r.status, 'status_comment', r.status_comment,
    'status_by', case when r.status_by is not null then private.bil_driver_name(r.status_by) end, 'status_at', r.status_at,
    'recovered_at', r.recovered_at, 'sjuklon', r.sjuklon, 'sjuklon_at', r.sjuklon_at,
    'created_at', r.created_at,
    'certs', (select count(*) from private.sick_certs c where c.report_id = r.id and c.uploaded))
$function$;
drop table if exists private.sick_events;
-- Återställ testärendet (Christians egen sjukanmälan id 1) till värdena före 2026-11-07:
-- (kommentaren var Bernt N:s "Krya på dig!")
update private.sick_reports set status = 'intyg_begart', status_by = '693340', status_comment = 'Krya på dig!',
       status_at = '2026-10-30 01:10:43.458855+00', updated_at = '2026-10-30 01:10:43.458855+00' where id = 1;
