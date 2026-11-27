-- 2026-11-27bilaga1 (ändrad regel 20:49): bilagor (läkarintyg + foton på felanmälan/underhåll) tas bort på RIKTIGT ur lagringen.
-- Uppladdaren får alltid ta bort sin egen bilaga (även i stängd tråd / beviljad sjuklön), ägare/admin får ta bort alla.
-- I databasen finns bara en markering kvar (deleted_at/deleted_by) så tråden kan visa "Bilaga borttagen av <namn>". Filen raderas av edge-funktionen
-- (sjuk / bil-foto) direkt efter markeringen. Går något fel vid raderingen backas markeringen (unmark) så att läget är konsistent och användaren kan försöka igen.
-- Ersätter mjukraderingen i 20261127e (den släpper ingen fil). Undo: supabase/migrations/undo/20261127f_bilaga_riktig_radering.sql

ALTER TABLE public.car_issue_photos ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by text;

-- ===== Läkarintyg =====
CREATE OR REPLACE FUNCTION public.sjuk_svc_cert_delete(p_token text, p_cert bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; c private.sick_certs; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  select * into c from private.sick_certs where id = p_cert;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := private.sjuk_report_for(a.driver_id, a.boss, c.report_id);
  -- Ingen låsning: den som laddat upp får alltid ta bort sin fil, ägare/admin alla.
  if c.uploaded_by <> a.driver_id and not a.boss then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.deleted_at is null then
    update private.sick_certs set deleted_at = now(), deleted_by = a.driver_id where id = c.id;
    perform private.log(a.driver_id, a.category, 'bil_sjuk_cert_delete', r.driver_id, jsonb_build_object('id', r.id), a.via_master);
  end if;
  return jsonb_build_object('ok', true, 'path', c.path);   -- path returneras även vid omförsök så att filen säkert raderas
end $function$;

CREATE OR REPLACE FUNCTION public.sjuk_svc_cert_unmark(p_cert bigint)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$ update private.sick_certs set deleted_at = null, deleted_by = null where id = p_cert; $function$;
REVOKE ALL ON FUNCTION public.sjuk_svc_cert_unmark(bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sjuk_svc_cert_unmark(bigint) TO service_role;

DO $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.sjuk_json(private.sick_reports, boolean)'::regprocedure);
  n := replace(d, E'''certs'', (select count(*) from private.sick_certs c where c.report_id = r.id and c.uploaded and c.deleted_at is null),',
    E'''certs'', (select count(*) from private.sick_certs c where c.report_id = r.id and c.uploaded and c.deleted_at is null),\n    ''certs_deleted'', (select count(*) from private.sick_certs c where c.report_id = r.id and c.uploaded and c.deleted_at is not null),');
  if n = d then raise exception 'sjuk_json: mönster saknas'; end if; execute n;
end $$;

-- ===== Foton på felanmälan / underhåll =====
CREATE OR REPLACE FUNCTION public.bil_photo_delete_svc(p_token text, p_photo_id bigint)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; p public.car_issue_photos;
begin
  select * into a from private.bil_actor(p_token);
  select * into p from public.car_issue_photos where id = p_photo_id and company_id = a.company_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not a.is_admin and p.created_by <> a.driver_id then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.deleted_at is null then
    update public.car_issue_photos set deleted_at = now(), deleted_by = a.driver_id where id = p_photo_id;
  end if;
  return json_build_object('ok', true, 'path', p.path);
end $function$;

CREATE OR REPLACE FUNCTION public.bil_photo_unmark(p_photo_id bigint)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$ update public.car_issue_photos set deleted_at = null, deleted_by = null where id = p_photo_id; $function$;
REVOKE ALL ON FUNCTION public.bil_photo_unmark(bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bil_photo_unmark(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.bil_photo_list(p_token text, p_issue_id bigint, p_maint_id bigint DEFAULT NULL::bigint)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; o public.car_issues; m public.car_maintenance;
begin
  select * into a from private.bil_actor(p_token);
  if p_issue_id is not null then
    select * into o from public.car_issues where id = p_issue_id and company_id = a.company_id;
    if not found or not private.bil_issue_ok(o, a.driver_id, a.is_admin) then raise exception 'not_found' using errcode = 'P0002'; end if;
    return coalesce((select json_agg(json_build_object('id', id, 'path', case when deleted_at is null then path end, 'created_at', created_at,
                       'can_delete', (a.is_admin or created_by = a.driver_id) and deleted_at is null, 'deleted', deleted_at is not null,
                       'deleted_by', case when deleted_at is not null then private.bil_driver_name(deleted_by) end, 'deleted_at', deleted_at) order by id)
                       from public.car_issue_photos where issue_id = p_issue_id and uploaded), '[]');
  end if;
  select * into m from public.car_maintenance where id = p_maint_id and company_id = a.company_id;
  if not found or not private.bil_maint_ok(m, a.driver_id, a.is_admin) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return coalesce((select json_agg(json_build_object('id', id, 'path', case when deleted_at is null then path end, 'created_at', created_at,
                     'can_delete', (a.is_admin or created_by = a.driver_id) and deleted_at is null, 'deleted', deleted_at is not null,
                     'deleted_by', case when deleted_at is not null then private.bil_driver_name(deleted_by) end, 'deleted_at', deleted_at) order by id)
                     from public.car_issue_photos where maint_id = p_maint_id and uploaded), '[]');
end $function$;

DO $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.bil_photo_begin(text, bigint, bigint)'::regprocedure);
  n := replace(d, 'where issue_id = p_issue_id) >= 3', 'where issue_id = p_issue_id and deleted_at is null) >= 3');
  n := replace(n, 'where maint_id = p_maint_id) >= 3', 'where maint_id = p_maint_id and deleted_at is null) >= 3');
  if n = d then raise exception 'photo_begin: mönster saknas'; end if; execute n;
  d := pg_get_functiondef('private.bil_issue_json(public.car_issues, text, boolean, boolean)'::regprocedure);
  n := replace(d, E'''photos'', (select count(*) from public.car_issue_photos p where p.issue_id = i.id and p.uploaded),',
    E'''photos'', (select count(*) from public.car_issue_photos p where p.issue_id = i.id and p.uploaded and p.deleted_at is null),\n    ''photos_deleted'', (select count(*) from public.car_issue_photos p where p.issue_id = i.id and p.uploaded and p.deleted_at is not null),');
  if n = d then raise exception 'bil_issue_json: mönster saknas'; end if; execute n;
  d := pg_get_functiondef('private.bil_maint_json(public.car_maintenance, integer, boolean)'::regprocedure);
  n := replace(d, E'''photos'', (select count(*) from public.car_issue_photos p where p.maint_id = m.id and p.uploaded),',
    E'''photos'', (select count(*) from public.car_issue_photos p where p.maint_id = m.id and p.uploaded and p.deleted_at is null),\n    ''photos_deleted'', (select count(*) from public.car_issue_photos p where p.maint_id = m.id and p.uploaded and p.deleted_at is not null),');
  if n = d then raise exception 'bil_maint_json: mönster saknas'; end if; execute n;
end $$;
