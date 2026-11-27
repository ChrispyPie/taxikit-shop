-- Undo för 20261127e. OBS: kör först (valfritt) återställning av borttagna intyg:
--   update private.sick_certs set deleted_at = null, deleted_by = null where deleted_at is not null;
-- (gör det INNAN kolumnerna släpps, annars försvinner uppgiften om vilka som var borttagna; filerna ligger kvar i hinken).
DO $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.sjuk_json(private.sick_reports, boolean)'::regprocedure);
  n := replace(d, 'c.uploaded and c.deleted_at is null)', 'c.uploaded)'); execute n;
  d := pg_get_functiondef('private.ekonomi_calc(text, date, date)'::regprocedure);
  n := replace(d, 'q.uploaded and q.deleted_at is null)', 'q.uploaded)'); execute n;
  d := pg_get_functiondef('public.sjuk_svc_cert_begin(text, bigint, text)'::regprocedure);
  n := replace(d, 'where c.report_id = r.id and c.deleted_at is null) >= 10', 'where c.report_id = r.id) >= 10'); execute n;
end $$;

CREATE OR REPLACE FUNCTION public.sjuk_svc_cert_list(p_token text, p_report bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_report);
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'path', c.path, 'mime', c.mime, 'created_at', c.created_at,
      'mine', c.uploaded_by = a.driver_id) order by c.created_at)
    from private.sick_certs c where c.report_id = r.id and c.uploaded), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.sjuk_svc_cert_delete(p_token text, p_cert bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; c private.sick_certs; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  select * into c from private.sick_certs where id = p_cert;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := private.sjuk_report_for(a.driver_id, a.boss, c.report_id);
  if not a.boss and private.sjuk_locked(r.id) then raise exception 'thread_closed' using errcode = '42501'; end if;
  if c.uploaded_by <> a.driver_id and not a.boss then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from private.sick_certs where id = c.id;
  perform private.log(a.driver_id, a.category, 'bil_sjuk_cert_delete', r.driver_id, jsonb_build_object('id', r.id), a.via_master);
  return jsonb_build_object('path', c.path);
end $function$;

ALTER TABLE private.sick_certs DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS deleted_by;
-- Edge-funktionen sjuk måste också läggas tillbaka (git: supabase/functions/sjuk/index.ts före PR; kopia /workspace/backups/sjuk-edge-before-bilaga.ts).
