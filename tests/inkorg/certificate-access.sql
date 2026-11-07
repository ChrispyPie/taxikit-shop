-- Definition audited read-only; synthetic fixture table only.
create table private.sick_certs(id bigint generated always as identity primary key, report_id bigint, path text, mime text, created_at timestamptz default now(), uploaded_by text, uploaded boolean default true);
CREATE OR REPLACE FUNCTION public.sjuk_svc_cert_list(p_token text, p_report bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_report);
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'path', c.path, 'mime', c.mime, 'created_at', c.created_at,
      'mine', c.uploaded_by = a.driver_id) order by c.created_at)
    from private.sick_certs c where c.report_id = r.id and c.uploaded), '[]'::jsonb);
end $function$;
revoke all on function public.sjuk_svc_cert_list(text,bigint) from public,anon,authenticated;
