-- Ärenden: visa vem som faktiskt skrev/ändrade (2026-10-28)
-- Förut stod det alltid "Ägaren" på statusändringar och kommentarer, och "(ägare)" på meddelanden från
-- alla med admin-behörighet (även S admin på sitt eget ärende). Nu skickas avsändarens namn (eller förar-id
-- om namn saknas) och användarkategori med i tråden. Bara tillägg:
--   * ny hjälpfunktion private.bil_person_cat(text)
--   * private.bil_issue_json byts ut med samma signatur och samma fält som förut + nya fält:
--       history[].who, history[].cat, msgs[].cat (msgs[].who finns redan, faller nu tillbaka på förar-id)
-- Inga tabeller ändras. Befintliga meddelanden och statusändringar får avsändare från sender_id / by_driver.
-- Ångra: supabase/migrations/undo/20261028t_arende_avsandare_undo.sql

create or replace function private.bil_person_cat(p_id text)
 returns text language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select d.category from public.drivers d where d.id = p_id
$function$;
revoke all on function private.bil_person_cat(text) from public, anon, authenticated;

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
                  'by', case when p_admin then u.by_driver end,
                  'mine', u.by_driver = p_me,
                  'who', coalesce(private.bil_driver_name(u.by_driver), u.by_driver),
                  'cat', private.bil_person_cat(u.by_driver)) order by u.created_at)
               from public.car_issue_updates u where u.issue_id = i.id), '[]'::jsonb),
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.sender_role, 'body', m.body, 'at', m.created_at,
                  'mine', m.sender_id = p_me,
                  'who', coalesce(private.bil_driver_name(m.sender_id), m.sender_id),
                  'cat', private.bil_person_cat(m.sender_id))
                  order by m.created_at, m.id)
               from public.car_issue_messages m where m.issue_id = i.id), '[]'::jsonb),
    'unread', private.bil_issue_unread(i.id, i.reported_by, p_me))
$function$;
