-- fix1: workshop_ask sparar äldre beslut i tråden och nollar decision_comment vid återöppning
-- 4) Ägaren (eller S admin) frågar/svarar föraren. Öppnar igen en beslutad post om det behövs.
create or replace function public.workshop_ask(p_token text, p_id bigint, p_body text)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; o public.workshop_hours; w public.workshop_hours; v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_reopen boolean;
begin
  select * into a from private.session_actor(p_token);
  if not (coalesce(a.category, '') = any (private.workshop_roles())) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_body is null then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v_body) > 1000 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  select * into o from public.workshop_hours where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_reopen := o.status <> 'pending';
  if v_reopen then
    perform pg_advisory_xact_lock(hashtext('workshop:' || o.driver_id));
    if o.status = 'rejected' and exists (select 1 from public.workshop_hours x where x.driver_id = o.driver_id and x.status <> 'rejected'
                 and x.id <> o.id and x.start_at < o.end_at and x.end_at > o.start_at) then
      raise exception 'overlap' using errcode = '23P01';
    end if;
    -- äldre beslut (före tråden fanns) sparas i tråden så motiveringen inte försvinner
    if not exists (select 1 from public.workshop_messages m where m.hours_id = o.id and m.kind = o.status) then
      insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body, created_at)
      values (o.id, coalesce(o.decided_by, a.driver_id), 'owner', o.status, o.decision_comment, coalesce(o.decided_at, now()));
    end if;
    insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body) values (o.id, a.driver_id, 'owner', 'reopen', null);
  end if;
  insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body) values (o.id, a.driver_id, 'owner', 'msg', v_body);
  update public.workshop_hours set status = 'pending', rate = null,
         decided_by = case when v_reopen then null else decided_by end, decided_at = case when v_reopen then null else decided_at end,
         decision_comment = case when v_reopen then null else decision_comment end,
         waiting_on = 'driver', updated_at = now()
   where id = p_id returning * into w;
  if w.driver_id is distinct from a.driver_id then
    insert into public.event_notices (company_id, driver_id, kind, body)
    values (private.actor_company(w.driver_id), w.driver_id, 'bil_wh_q',
            left('❓ Fråga om din verkstadstid ' || to_char(w.start_at at time zone 'Europe/Stockholm', 'DD/MM HH24:MI') || ' (bil ' || w.car_label || '): ' || v_body, 300));
  end if;
  perform private.log(a.driver_id, a.category, 'workshop_ask', w.driver_id,
    jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'minutes', private.wh_minutes(w), 'car', w.car_label,
      'from', o.status, 'comment', left(v_body, 200)), a.via_master);
  return private.wh_json(w, private.workshop_rate())::json;
end $function$;

