-- Ångra 20261111k_workshop_owner_message: ta bort den nya RPC:n och återställ
-- workshop_reply så att föraren bara kan svara när status är pending.

drop function if exists public.workshop_owner_message(text, bigint, text);

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
  if o.status <> 'pending' then raise exception 'not_editable' using errcode = '42501'; end if;
  if (select count(*) from public.workshop_messages m where m.sender_id = a.driver_id and m.created_at > now() - interval '1 day') >= 100 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  insert into public.workshop_messages (hours_id, sender_id, sender_role, kind, body) values (o.id, a.driver_id, 'driver', 'msg', v_body);
  update public.workshop_hours set waiting_on = 'owner', updated_at = now() where id = p_id returning * into w;
  v_who := coalesce(private.bil_driver_name(a.driver_id), a.driver_id);
  perform private.bil_notify_admins(private.actor_company(a.driver_id), 'bil_wh_reply',
    '💬 ' || v_who || ' svarade om verkstadstid ' || to_char(w.start_at at time zone 'Europe/Stockholm', 'DD/MM HH24:MI') || ' (bil ' || w.car_label || '): ' || v_body,
    a.driver_id);
  perform private.log(a.driver_id, a.category, 'workshop_reply', a.driver_id,
    jsonb_build_object('id', w.id, 'start', w.start_at, 'end', w.end_at, 'minutes', private.wh_minutes(w), 'car', w.car_label, 'comment', left(v_body, 200)), a.via_master);
  return private.wh_json(w, private.workshop_rate())::json;
end $function$;
