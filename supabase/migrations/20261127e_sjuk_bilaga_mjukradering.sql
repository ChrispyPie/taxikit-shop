-- 2026-11-27bilaga1: mjukradering av läkarintyg (bilagor i Sjuk-tråden).
-- Intyget flaggas som borttaget (deleted_at/deleted_by) i stället för att raden raderas; filen ligger kvar i den privata hinken "sjuk-intyg"
-- så att det kan återställas. Föraren får ta bort sitt eget intyg, utom när tråden är stängd (thread_closed) eller sjuklönen är beviljad/utbetald
-- (cert_locked) – då bara ägare/admin. Undo: supabase/migrations/undo/20261127e_sjuk_bilaga_mjukradering.sql

ALTER TABLE private.sick_certs ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE OR REPLACE FUNCTION public.sjuk_svc_cert_delete(p_token text, p_cert bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; c private.sick_certs; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  select * into c from private.sick_certs where id = p_cert;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := private.sjuk_report_for(a.driver_id, a.boss, c.report_id);
  if not a.boss and private.sjuk_locked(r.id) then raise exception 'thread_closed' using errcode = '42501'; end if;
  if c.uploaded_by <> a.driver_id and not a.boss then raise exception 'forbidden' using errcode = '42501'; end if;
  if not a.boss and r.sjuklon in ('beviljad', 'utbetald') then raise exception 'cert_locked' using errcode = '42501'; end if;
  if c.deleted_at is null then
    update private.sick_certs set deleted_at = now(), deleted_by = a.driver_id where id = c.id;
    perform private.log(a.driver_id, a.category, 'bil_sjuk_cert_delete', r.driver_id, jsonb_build_object('id', r.id, 'soft', true), a.via_master);
  end if;
  return jsonb_build_object('ok', true);
end $function$;

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
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'path', case when c.deleted_at is null then c.path end, 'mime', c.mime, 'created_at', c.created_at,
      'mine', c.uploaded_by = a.driver_id, 'deleted', c.deleted_at is not null,
      'deleted_by', case when c.deleted_at is not null then private.bil_driver_name(c.deleted_by) end, 'deleted_at', c.deleted_at) order by c.created_at, c.id)
    from private.sick_certs c where c.report_id = r.id and c.uploaded), '[]'::jsonb);
end $function$;

-- Antal intyg (kort, Ekonomi, begränsning 10) räknar inte borttagna.
DO $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.sjuk_json(private.sick_reports, boolean)'::regprocedure);
  n := replace(d, 'c.report_id = r.id and c.uploaded)', 'c.report_id = r.id and c.uploaded and c.deleted_at is null)');
  if n = d then raise exception 'sjuk_json: mönster saknas'; end if; execute n;
  d := pg_get_functiondef('private.ekonomi_calc(text, date, date)'::regprocedure);
  n := replace(d, 'q.report_id = r.id and q.uploaded)', 'q.report_id = r.id and q.uploaded and q.deleted_at is null)');
  if n = d then raise exception 'ekonomi_calc: mönster saknas'; end if; execute n;
  d := pg_get_functiondef('public.sjuk_svc_cert_begin(text, bigint, text)'::regprocedure);
  n := replace(d, 'where c.report_id = r.id) >= 10', 'where c.report_id = r.id and c.deleted_at is null) >= 10');
  if n = d then raise exception 'cert_begin: mönster saknas'; end if; execute n;
end $$;
