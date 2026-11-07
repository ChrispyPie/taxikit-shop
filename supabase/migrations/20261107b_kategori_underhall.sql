-- UTKAST (PR, ej körd i databasen): flytta en anmälan till Underhåll som förslag. Bara admin/ägare/superadmin.
-- Bara tillägg: en ny kolumn (car_maintenance.from_issue_id) och en ny funktion. Ingenting raderas:
--   * underhållsförslaget skapas med status 'forslag', mtype väljs, anmälans text blir anteckning (max 500 tecken)
--   * fotona flyttas (car_issue_photos.issue_id -> maint_id, samma fil i lagringen)
--   * tråden (car_issue_messages) och notiserna (event_notices case_kind='issue') ligger kvar på den stängda anmälan,
--     eftersom event_notices bara tillåter case_kind issue/wh/task/sjuk/wish. Anmälan får ett meddelande med länk-text.
--   * anmälan stängs (status 'klar', status_comment 'Flyttad till Underhåll').
-- Ångra: se docs/kategori-byte/UNDO-underhall.md
alter table public.car_maintenance add column if not exists from_issue_id bigint references public.car_issues(id) on delete set null;

create or replace function public.move_car_issue_to_maint(p_token text, p_id bigint, p_type text, p_title text default null)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; o public.car_issues; m public.car_maintenance; v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'not_editable' using errcode = '42501'; end if;
  if coalesce(p_type, '') not in ('service','dack_sommar','dack_vinter','bromsar','besiktning','annat') then raise exception 'bad_type' using errcode = '22023'; end if;
  if p_type = 'annat' and v_title is null then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(coalesce(v_title, '')) > 80 then raise exception 'too_long' using errcode = '22023'; end if;
  select * into o from public.car_issues where id = p_id and company_id = a.company_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.status = 'klar' then raise exception 'not_editable' using errcode = '42501'; end if;
  if o.car_id is null then raise exception 'bad_car' using errcode = '22023'; end if;
  insert into public.car_maintenance (company_id, car_id, mtype, title, note, status, suggested_by, created_by, from_issue_id)
  values (a.company_id, o.car_id, p_type, v_title, left(nullif(btrim(coalesce(o.body, '')), ''), 500), 'forslag', o.reported_by, a.driver_id, o.id)
  returning * into m;
  update public.car_issue_photos set issue_id = null, maint_id = m.id where issue_id = o.id;
  insert into public.car_issue_messages (issue_id, sender_id, sender_role, body)
    values (o.id, a.driver_id, 'owner', 'Kategori ändrad från ' ||
      case when o.kind = 'fault' then 'Felanmälan' else 'Behövs: ' || private.bil_supply_label(o.supply_type) end ||
      ' till Underhåll: ' || private.bil_mtype_label(p_type, v_title) || '. Finns nu under Underhåll som förslag.');
  update public.car_issues set status = 'klar', blocking = false, status_by = a.driver_id, status_at = now(), closed_at = now(),
    status_comment = 'Flyttad till Underhåll', updated_at = now() where id = o.id;
  insert into public.car_issue_updates (issue_id, status, comment, by_driver) values (o.id, 'klar', 'Flyttad till Underhåll', a.driver_id);
  perform private.log(a.driver_id, a.category, 'bil_issue_to_maint', o.reported_by,
    jsonb_build_object('issue', o.id, 'maint', m.id, 'from', o.kind, 'from_supply', o.supply_type, 'from_status', o.status, 'from_blocking', o.blocking, 'type', p_type), a.via_master);
  return json_build_object('maint_id', m.id, 'issue_id', o.id);
end $$;
revoke all on function public.move_car_issue_to_maint(text, bigint, text, text) from public;
grant execute on function public.move_car_issue_to_maint(text, bigint, text, text) to anon, authenticated;
