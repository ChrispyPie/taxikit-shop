CREATE OR REPLACE FUNCTION private.sjuk_report_for(p_driver text, p_boss boolean, p_id bigint)
 RETURNS private.sick_reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r private.sick_reports;
begin
  select * into r from private.sick_reports where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.driver_id <> p_driver and not p_boss then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return r;
end $function$
