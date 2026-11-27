-- Undo för 20261127f (återgår till tillståndet efter 20261127e = mjukradering av intyg, foton helt utan markering).
-- OBS: filer som redan raderats ur lagringen kan INTE återskapas. Markerade rader blir "vanliga" rader utan fil (länk saknas) – ta bort dem först om de stör:
--   delete from public.car_issue_photos where deleted_at is not null;
DO $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.sjuk_json(private.sick_reports, boolean)'::regprocedure);
  n := replace(d, E'\n    ''certs_deleted'', (select count(*) from private.sick_certs c where c.report_id = r.id and c.uploaded and c.deleted_at is not null),', ''); execute n;
  d := pg_get_functiondef('private.bil_issue_json(public.car_issues, text, boolean, boolean)'::regprocedure);
  n := replace(d, E'\n    ''photos_deleted'', (select count(*) from public.car_issue_photos p where p.issue_id = i.id and p.uploaded and p.deleted_at is not null),', '');
  n := replace(n, 'p.uploaded and p.deleted_at is null),', 'p.uploaded),'); execute n;
  d := pg_get_functiondef('private.bil_maint_json(public.car_maintenance, integer, boolean)'::regprocedure);
  n := replace(d, E'\n    ''photos_deleted'', (select count(*) from public.car_issue_photos p where p.maint_id = m.id and p.uploaded and p.deleted_at is not null),', '');
  n := replace(n, 'p.uploaded and p.deleted_at is null),', 'p.uploaded),'); execute n;
  d := pg_get_functiondef('public.bil_photo_begin(text, bigint, bigint)'::regprocedure);
  n := replace(replace(d, 'where issue_id = p_issue_id and deleted_at is null) >= 3', 'where issue_id = p_issue_id) >= 3'), 'where maint_id = p_maint_id and deleted_at is null) >= 3', 'where maint_id = p_maint_id) >= 3'); execute n;
end $$;
DROP FUNCTION IF EXISTS public.sjuk_svc_cert_unmark(bigint);
DROP FUNCTION IF EXISTS public.bil_photo_unmark(bigint);

CREATE OR REPLACE FUNCTION public.bil_photo_list(p_token text, p_issue_id bigint, p_maint_id bigint DEFAULT NULL::bigint)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; o public.car_issues; m public.car_maintenance;
begin
  select * into a from private.bil_actor(p_token);
  if p_issue_id is not null then
    select * into o from public.car_issues where id = p_issue_id and company_id = a.company_id;
    if not found or not private.bil_issue_ok(o, a.driver_id, a.is_admin) then raise exception 'not_found' using errcode = 'P0002'; end if;
    return coalesce((select json_agg(json_build_object('id', id, 'path', path) order by id)
                       from public.car_issue_photos where issue_id = p_issue_id and uploaded), '[]');
  end if;
  select * into m from public.car_maintenance where id = p_maint_id and company_id = a.company_id;
  if not found or not private.bil_maint_ok(m, a.driver_id, a.is_admin) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return coalesce((select json_agg(json_build_object('id', id, 'path', path) order by id)
                     from public.car_issue_photos where maint_id = p_maint_id and uploaded), '[]');
end $function$;

CREATE OR REPLACE FUNCTION public.bil_photo_delete_svc(p_token text, p_photo_id bigint)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; p public.car_issue_photos;
begin
  select * into a from private.bil_actor(p_token);
  select * into p from public.car_issue_photos where id = p_photo_id and company_id = a.company_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not a.is_admin and p.created_by <> a.driver_id then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.car_issue_photos where id = p_photo_id;
  return json_build_object('ok', true, 'path', p.path);
end $function$;

-- Intyg: tillbaka till mjukradering enligt 20261127e (med låsregler)
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
  if not a.boss and r.sjuklon in ('beviljad', 'utbetald') then raise exception 'cert_locked' using errcode = '42501'; end if;
  if c.deleted_at is null then
    update private.sick_certs set deleted_at = now(), deleted_by = a.driver_id where id = c.id;
    perform private.log(a.driver_id, a.category, 'bil_sjuk_cert_delete', r.driver_id, jsonb_build_object('id', r.id, 'soft', true), a.via_master);
  end if;
  return jsonb_build_object('ok', true);
end $function$;
ALTER TABLE public.car_issue_photos DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS deleted_by;
-- Lägg även tillbaka edge-funktionerna sjuk och bil-foto (kopior: /workspace/backups/sjuk-edge-before-bilaga.ts, bil-foto-edge-before.ts). Fortsätt sedan med undo/20261127e.
