-- Ångra 20261028t_arende_avsandare: återställ private.bil_issue_json som den var före (live-version 2026-10-28)
-- och ta bort hjälpfunktionen. Appen klarar sig utan de nya fälten (visar då som förut).
create or replace function private.bil_issue_json(i car_issues, p_me text, p_admin boolean, p_named boolean)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object('id', i.id, 'kind', i.kind, 'car_id', i.car_id,
    'car', coalesce((select c.bilnummer from public.cars c where c.id = i.car_id), i.car_label),
    'supply', i.supply_type, 'body', i.body, 'blocking', i.blocking, 'status', i.status,
    'mine', i.reported_by = p_me, 'created_at', i.created_at, 'updated_at', i.updated_at,
    'status_at', i.status_at, 'status_comment', i.status_comment, 'closed_at', i.closed_at,
    'reporter', case when p_admin then i.reported_by end,
    'reporter_name', case when p_named then private.bil_driver_name(i.reported_by) end,
    'photos', (select count(*) from public.car_issue_photos p where p.issue_id = i.id and p.uploaded),
    'workshop_min', (select coalesce(sum(private.wh_minutes(w)), 0) from public.workshop_hours w where w.issue_id = i.id and w.status <> 'rejected'),
    'tasks', case when p_admin then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'status', t.status,
                  'name', coalesce(private.bil_driver_name(t.assigned_to), t.assigned_to)) order by t.id)
               from public.car_tasks t where t.issue_id = i.id), '[]'::jsonb) end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', u.status, 'comment', u.comment, 'at', u.created_at,
                  'by', case when p_admin then u.by_driver end) order by u.created_at)
               from public.car_issue_updates u where u.issue_id = i.id), '[]'::jsonb),
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.sender_role, 'body', m.body, 'at', m.created_at,
                  'mine', m.sender_id = p_me,
                  'who', case when m.sender_role = 'owner' then coalesce(private.bil_driver_name(m.sender_id), 'Ägaren')
                              else coalesce(private.bil_driver_name(m.sender_id), 'Föraren') end)
                  order by m.created_at, m.id)
               from public.car_issue_messages m where m.issue_id = i.id), '[]'::jsonb),
    'unread', private.bil_issue_unread(i.id, i.reported_by, p_me))
$function$;

drop function if exists private.bil_person_cat(text);
