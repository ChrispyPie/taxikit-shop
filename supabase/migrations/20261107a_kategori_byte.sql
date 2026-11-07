-- Byt kategori (Felanmälan <-> Behövs) på en anmälan. Bara admin/ägare/superadmin.
-- Bara tillägg: en ny funktion. Ångra: drop function public.set_car_issue_kind(text, bigint, text, text);
create or replace function public.set_car_issue_kind(p_token text, p_id bigint, p_kind text, p_supply text default null)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; o public.car_issues; i public.car_issues; v_from text; v_to text;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'not_editable' using errcode = '42501'; end if;
  if p_kind not in ('fault','supply') then raise exception 'bad_kind' using errcode = '22023'; end if;
  if p_kind = 'supply' and coalesce(p_supply, '') not in ('kvitto','spolar','rengoring','annat') then raise exception 'bad_supply' using errcode = '22023'; end if;
  select * into o from public.car_issues where id = p_id and company_id = a.company_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.kind = p_kind and o.supply_type is not distinct from (case when p_kind = 'supply' then p_supply end) then
    return private.bil_issue_json(o, a.driver_id, a.is_admin, a.is_admin)::json; end if;
  if p_kind = 'fault' and nullif(btrim(coalesce(o.body, '')), '') is null then raise exception 'need_text' using errcode = '22023'; end if;
  if p_kind = 'fault' and o.car_label is null and o.car_id is null then raise exception 'bad_car' using errcode = '22023'; end if;
  v_from := case when o.kind = 'fault' then 'Felanmälan' else 'Behövs: ' || private.bil_supply_label(o.supply_type) end;
  v_to   := case when p_kind = 'fault' then 'Felanmälan' else 'Behövs: ' || private.bil_supply_label(p_supply) end;
  update public.car_issues set kind = p_kind, supply_type = case when p_kind = 'supply' then p_supply end,
    blocking = case when p_kind = 'supply' then false else blocking end, updated_at = now()
    where id = p_id returning * into i;
  insert into public.car_issue_messages (issue_id, sender_id, sender_role, body)
    values (p_id, a.driver_id, 'owner', 'Kategori ändrad från ' || v_from || ' till ' || v_to);
  perform private.log(a.driver_id, a.category, 'bil_issue_kind', a.driver_id,
    jsonb_build_object('id', p_id, 'from', o.kind, 'from_supply', o.supply_type, 'to', p_kind, 'to_supply', i.supply_type), a.via_master);
  return private.bil_issue_json(i, a.driver_id, a.is_admin, a.is_admin)::json;
end $$;
revoke all on function public.set_car_issue_kind(text, bigint, text, text) from public;
grant execute on function public.set_car_issue_kind(text, bigint, text, text) to anon, authenticated;
