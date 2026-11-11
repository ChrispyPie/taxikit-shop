-- Ägaren kan skicka ett meddelande på en verkstadstid utan att öppna ett beslut igen.
-- Additive: ny RPC workshop_owner_message. workshop_reply tillåter svar även på avgjord tid
-- (status, rate och beslut lämnas orörda). Inga nya tabeller eller kolumner.

create or replace function public.workshop_owner_message(p_token text, p_id bigint, p_body text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare a record; o public.workshop_hours; w public.workshop_hours; v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_body is null then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v_body) > 1000 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  select * into o from public.workshop_hours where id = p_id
    and private.actor_company(driver_id) = a.company_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) from public.workshop_messages m where m.sender_id = a.driver_id and m.created_at > now() - interval '1 day') >= 100 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body)
    values (o.id, a.driver_id, 'owner', 'msg', v_body);
  if o.status = 'pending' then
    update public.workshop_hours set waiting_on = 'driver', updated_at = now()
     where id = p_id returning * into w;
  else
    -- Avgjord tid: rör inte status, rate, decided_by, decided_at, decision_comment eller waiting_on.
    update public.workshop_hours set updated_at = now()
     where id = p_id returning * into w;
  end if;
  if w.driver_id is distinct from a.driver_id then
    insert into public.event_notices (company_id, driver_id, kind, body, case_kind, case_id)
    values (private.actor_company(w.driver_id), w.driver_id, 'bil_wh_msg',
            left('💬 Meddelande om din verkstadstid ' || to_char(w.start_at at time zone 'Europe/Stockholm', 'DD/MM HH24:MI') || ' (bil ' || w.car_label || '): ' || v_body, 300),
            'wh', w.id);
  end if;
  perform private.log(a.driver_id, a.category, 'workshop_message', w.driver_id,
    jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'minutes', private.wh_minutes(w), 'car', w.car_label,
      'status', w.status, 'comment', left(v_body, 200)), a.via_master);
  return private.wh_json(w, private.workshop_rate())::json;
end $function$;

grant execute on function public.workshop_owner_message(text, bigint, text) to anon, authenticated;

create or replace function public.workshop_reply(p_token text, p_id bigint, p_body text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare a record; o public.workshop_hours; w public.workshop_hours; v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_who text;
begin
  select * into a from private.session_actor(p_token);
  if a.category is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_body is null then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v_body) > 1000 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  select * into o from public.workshop_hours where id = p_id and driver_id = a.driver_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) from public.workshop_messages m where m.sender_id = a.driver_id and m.created_at > now() - interval '1 day') >= 100 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body) values (o.id, a.driver_id, 'driver', 'msg', v_body);
  if o.status = 'pending' then
    update public.workshop_hours set waiting_on = 'owner', updated_at = now() where id = p_id returning * into w;
  else
    -- Avgjord tid: svaret läggs i tråden, beslutet lämnas orört.
    update public.workshop_hours set updated_at = now() where id = p_id returning * into w;
  end if;
  v_who := coalesce(private.bil_driver_name(a.driver_id), a.driver_id);
  perform private.bil_notify_admins(private.actor_company(a.driver_id), 'bil_wh_reply',
    '💬 ' || v_who || ' svarade om verkstadstid ' || to_char(w.start_at at time zone 'Europe/Stockholm', 'DD/MM HH24:MI') || ' (bil ' || w.car_label || '): ' || v_body,
    a.driver_id);
  perform private.log(a.driver_id, a.category, 'workshop_reply', a.driver_id,
    jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'minutes', private.wh_minutes(w), 'car', w.car_label, 'status', w.status, 'comment', left(v_body, 200)), a.via_master);
  return private.wh_json(w, private.workshop_rate())::json;
end $function$;
