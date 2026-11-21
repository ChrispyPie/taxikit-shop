-- Ångra 20261121a_slimming_enhet_notis.sql: återställ exakt tillstånd före 2026-11-21 slimming.

drop function if exists public.notis_device_settings_list(text);
drop function if exists public.notis_device_settings_save(text, text, text, jsonb);
drop table if exists private.driver_notis_settings;

drop function if exists public.push_save_prefs(text, text, jsonb);
drop function if exists public.push_save(text, text, text, text, text, jsonb);

create or replace function public.push_save(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(p_endpoint,'') !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = ''
     or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'bad_input' using errcode = '22023'; end if;
  insert into public.push_subscriptions (driver_id, endpoint, p256dh, auth, ua, token_hash)
  values (a.driver_id, p_endpoint, p_p256dh, p_auth, left(p_ua, 200), private.token_hash(p_token))
  on conflict (endpoint) do update set driver_id = excluded.driver_id, p256dh = excluded.p256dh, auth = excluded.auth,
    ua = excluded.ua, fail_count = 0, token_hash = excluded.token_hash;
  delete from public.push_subscriptions where driver_id = a.driver_id and id not in
    (select id from public.push_subscriptions where driver_id = a.driver_id order by created_at desc limit 5);
  return json_build_object('ok', true, 'devices', (select count(*) from public.push_subscriptions where driver_id = a.driver_id));
end
$$;

revoke all on function public.push_save(text, text, text, text, text) from public;
grant execute on function public.push_save(text, text, text, text, text) to anon, authenticated;

create or replace function public.bev_svc_targets(p_driver text)
returns json
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(json_agg(json_build_object('id', id, 'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::json)
  from public.push_subscriptions where driver_id = p_driver and fail_count < 5
$$;

revoke all on function public.bev_svc_targets(text) from public, anon, authenticated;
grant execute on function public.bev_svc_targets(text) to service_role;

drop function if exists private.clean_push_prefs(jsonb);
alter table public.push_subscriptions drop column if exists prefs;

drop function if exists public.session_rename_device(text, uuid, text);
drop function if exists public.session_set_device(text, text, integer, integer, text, text);
drop function if exists private.session_device_label(text, integer, integer, boolean, text, text);
drop function if exists private.clean_device_model(text);
drop table if exists private.driver_devices;

create or replace function private.session_device_label(p_ua text, p_width integer, p_height integer, p_delad boolean)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  ua text := lower(coalesce(p_ua, ''));
  w int := coalesce(p_width, 0);
  h int := coalesce(p_height, 0);
  short int;
begin
  if coalesce(p_delad, false) then
    return '🚕 Platta';
  end if;
  if ua ~ 'ipad|tablet|kindle|playbook' then
    return '🚕 Platta';
  end if;
  if ua ~ 'android' and ua !~ 'mobile' then
    return '🚕 Platta';
  end if;
  if ua ~ 'iphone|ipod|mobile|android' then
    return '📱 Telefon';
  end if;
  short := least(w, h);
  if w > 0 and h > 0 and ((w >= 800 and h <= 800) or (h >= 800 and w <= 800)) and greatest(w, h) >= 800 then
    return '🚕 Platta';
  end if;
  if (w > 0 and w <= 700) or (short > 0 and short <= 500) then
    return '📱 Telefon';
  end if;
  if w >= 1100 and h >= 700 then
    return '💻 Dator';
  end if;
  if ua ~ 'windows|macintosh|linux' and ua !~ 'mobile|android|iphone' then
    return '💻 Dator';
  end if;
  return '📱 Telefon';
end
$$;

create or replace function public.session_set_device(p_token text, p_ua text default null, p_width integer default null, p_height integer default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s_hash text;
  v_label text;
  v_delad boolean;
  v_id uuid;
begin
  perform private.session_actor(p_token);
  s_hash := private.token_hash(p_token);
  select delad_enhet into v_delad from private.sessions where token_hash = s_hash;
  v_label := private.session_device_label(p_ua, p_width, p_height, coalesce(v_delad, false));
  update private.sessions
     set device_ua = left(nullif(btrim(coalesce(p_ua, '')), ''), 200),
         device_label = v_label,
         last_seen_at = now()
   where token_hash = s_hash
   returning device_id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'label', v_label);
end
$$;

revoke all on function public.session_set_device(text, text, integer, integer) from public;
grant execute on function public.session_set_device(text, text, integer, integer) to anon, authenticated;

create or replace function public.list_my_sessions(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s_hash text;
  v_driver text;
  v_list json;
begin
  perform private.session_actor(p_token);
  s_hash := private.token_hash(p_token);
  select driver_id into v_driver from private.sessions where token_hash = s_hash;
  select coalesce(json_agg(x.o order by (x.o->>'current')::boolean desc, (x.o->>'last_seen') desc), '[]'::json)
    into v_list
    from (
      select json_build_object(
               'id', se.device_id,
               'label', coalesce(nullif(se.device_label, ''), private.session_device_label(se.device_ua, null, null, se.delad_enhet)),
               'last_seen', coalesce(se.last_seen_at, se.created_at),
               'current', (se.token_hash = s_hash),
               'delad', coalesce(se.delad_enhet, false)
             ) as o
        from private.sessions se
       where se.driver_id = v_driver
         and se.expires_at > now()
    ) x;
  return json_build_object('ok', true, 'devices', v_list);
end
$$;

revoke all on function public.list_my_sessions(text) from public;
grant execute on function public.list_my_sessions(text) to anon, authenticated;
