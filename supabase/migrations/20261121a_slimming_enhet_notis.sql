-- 20261121a: Enhetsnamn, bättre platta-igenkänning, per-enhet push-inställningar och kopiera notisval.
--
-- Ändringar (helt bakåtkompatibla; ångra med undo/20261121a_slimming_enhet_notis_undo.sql):
--  1) private.driver_devices: sparar användarens eget enhetsnamn (t.ex. "Plattan i bilen") och modell/typ per (driver_id, enhet_id)
--     så namnet överlever utloggning och syns på alla förarens enheter.
--  2) private.session_device_label: korrigerar ordning på UA + skärmmått så Android-plattor (även med "Mobile" i reducerad UA)
--     klassas som "🚕 Platta" i stället för "📱 Telefon", och använder modellnamn (t.ex. från userAgentData) när det finns.
--  3) public.session_set_device(..., p_model, p_kind) + public.session_rename_device(p_token, p_device_id, p_name)
--     + utökad public.list_my_sessions.
--  4) public.push_subscriptions.prefs (jsonb): per-enhet notisval {tag, flyg, bat, prognos} + push_save_prefs + bev_svc_targets.
--  5) private.driver_notis_settings + notis_device_settings_save / notis_device_settings_list för "Kopiera inställningar från annan enhet".

create table if not exists private.driver_devices (
  driver_id text not null references public.drivers(id) on delete cascade,
  enhet_id text not null,
  custom_name text,
  auto_label text,
  device_kind text,
  updated_at timestamptz not null default now(),
  primary key (driver_id, enhet_id),
  constraint driver_devices_name_len check (custom_name is null or length(custom_name) <= 40),
  constraint driver_devices_kind_ok check (device_kind is null or device_kind in ('platta', 'telefon', 'dator'))
);
revoke all on table private.driver_devices from public, anon, authenticated;

comment on table private.driver_devices is
  'Sparat enhetsnamn och automatisk enhetsetikett per förare och webbläsarens x-taxi-enhet.';

create or replace function private.clean_device_model(p_model text)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  m text;
begin
  m := regexp_replace(coalesce(p_model, ''), '[\x00-\x1f\x7f<>]+', '', 'g');
  m := btrim(regexp_replace(m, '\s+', ' ', 'g'));
  if m = '' or upper(m) = 'K' or lower(m) in ('android', 'mobile', 'linux', 'unknown', 'generic') then
    return null;
  end if;
  return left(m, 32);
end
$$;

create or replace function private.session_device_label(
  p_ua text,
  p_width integer,
  p_height integer,
  p_delad boolean,
  p_model text default null,
  p_kind text default null
)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  ua text := lower(coalesce(p_ua, ''));
  w int := coalesce(p_width, 0);
  h int := coalesce(p_height, 0);
  short int := least(w, h);
  big int := greatest(w, h);
  kind text := null;
  ico text;
  mdl text;
  type_name text;
begin
  if coalesce(p_delad, false) then
    kind := 'platta';
  elsif p_kind in ('platta', 'telefon', 'dator') then
    kind := p_kind;
  elsif ua ~ 'ipad|tablet|kindle|playbook|silk' then
    kind := 'platta';
  elsif ua ~ 'android' and ua !~ 'mobile' then
    kind := 'platta';
  elsif w > 0 and h > 0 and short >= 580 and big >= 800 and (ua ~ 'android|ipad|tablet|mobile' or short < 900) then
    kind := 'platta';
  elsif ua ~ 'iphone|ipod|mobile|android' then
    kind := 'telefon';
  elsif w >= 1024 and h >= 680 then
    kind := 'dator';
  elsif ua ~ 'windows|macintosh|linux' and ua !~ 'mobile|android|iphone' then
    kind := 'dator';
  elsif short >= 580 and big >= 800 then
    kind := 'platta';
  else
    kind := 'telefon';
  end if;

  ico := case kind when 'platta' then '🚕' when 'dator' then '💻' else '📱' end;
  type_name := case kind when 'platta' then 'Platta' when 'dator' then 'Dator' else 'Telefon' end;
  mdl := private.clean_device_model(p_model);
  return ico || ' ' || coalesce(mdl, type_name);
end
$$;

create or replace function private.session_device_label(p_ua text, p_width integer, p_height integer, p_delad boolean)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select private.session_device_label(p_ua, p_width, p_height, p_delad, null, null)
$$;

drop function if exists public.session_set_device(text, text, integer, integer);
create or replace function public.session_set_device(
  p_token text,
  p_ua text default null,
  p_width integer default null,
  p_height integer default null,
  p_model text default null,
  p_kind text default null
)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s_hash text;
  v_driver text;
  v_delad boolean;
  v_enhet text;
  v_id uuid;
  v_auto text;
  v_custom text;
  v_label text;
  v_kind text;
  v_hdr text;
begin
  perform private.session_actor(p_token);
  s_hash := private.token_hash(p_token);
  select driver_id, coalesce(delad_enhet, false), client_enhet
    into v_driver, v_delad, v_enhet
    from private.sessions where token_hash = s_hash;

  if coalesce(v_enhet, '') = '' then
    begin
      v_hdr := current_setting('request.headers', true);
      if v_hdr is not null and v_hdr <> '' then
        v_enhet := nullif(btrim(coalesce(v_hdr::jsonb ->> 'x-taxi-enhet', '')), '');
      end if;
    exception when others then
      v_enhet := null;
    end;
  end if;

  v_kind := case
    when v_delad then 'platta'
    when p_kind in ('platta', 'telefon', 'dator') then p_kind
    else null
  end;
  v_auto := private.session_device_label(p_ua, p_width, p_height, v_delad, p_model, v_kind);
  if v_kind is null then
    v_kind := case
      when left(v_auto, 1) = '🚕' then 'platta'
      when left(v_auto, 1) = '💻' then 'dator'
      else 'telefon'
    end;
  end if;

  if coalesce(v_enhet, '') <> '' and not private.is_demo() then
    insert into private.driver_devices (driver_id, enhet_id, auto_label, device_kind, updated_at)
    values (v_driver, left(v_enhet, 64), v_auto, v_kind, now())
    on conflict (driver_id, enhet_id) do update
      set auto_label = excluded.auto_label,
          device_kind = excluded.device_kind,
          updated_at = now();
    select custom_name into v_custom
      from private.driver_devices
     where driver_id = v_driver and enhet_id = left(v_enhet, 64);
  end if;

  v_label := coalesce(nullif(btrim(coalesce(v_custom, '')), ''), v_auto);
  update private.sessions
     set device_ua = left(nullif(btrim(coalesce(p_ua, '')), ''), 200),
         device_label = v_label,
         client_enhet = coalesce(client_enhet, left(nullif(v_enhet, ''), 64)),
         last_seen_at = now()
   where token_hash = s_hash
   returning device_id into v_id;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'label', v_label,
    'auto_label', v_auto,
    'custom_name', nullif(btrim(coalesce(v_custom, '')), ''),
    'kind', v_kind
  );
end
$$;

revoke all on function public.session_set_device(text, text, integer, integer, text, text) from public;
grant execute on function public.session_set_device(text, text, integer, integer, text, text) to anon, authenticated;

create or replace function public.session_rename_device(p_token text, p_device_id uuid, p_name text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s_hash text;
  v_driver text;
  t private.sessions;
  v_name text;
  v_auto text;
  v_label text;
begin
  perform private.session_actor(p_token);
  if private.is_demo() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  s_hash := private.token_hash(p_token);
  select driver_id into v_driver from private.sessions where token_hash = s_hash;
  select * into t from private.sessions
   where device_id = p_device_id and driver_id = v_driver and expires_at > now();
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  v_name := regexp_replace(coalesce(p_name, ''), '[\x00-\x1f\x7f<>]+', '', 'g');
  v_name := btrim(regexp_replace(v_name, '\s+', ' ', 'g'));
  v_name := left(v_name, 40);
  if v_name = '' then
    v_name := null;
  end if;

  if coalesce(t.client_enhet, '') <> '' then
    select auto_label into v_auto
      from private.driver_devices
     where driver_id = v_driver and enhet_id = t.client_enhet;
    insert into private.driver_devices (driver_id, enhet_id, custom_name, auto_label, updated_at)
    values (
      v_driver,
      t.client_enhet,
      v_name,
      coalesce(v_auto, private.session_device_label(t.device_ua, null, null, t.delad_enhet)),
      now()
    )
    on conflict (driver_id, enhet_id) do update
      set custom_name = excluded.custom_name,
          updated_at = now();
  end if;

  v_label := coalesce(
    v_name,
    nullif(v_auto, ''),
    private.session_device_label(t.device_ua, null, null, t.delad_enhet)
  );
  update private.sessions
     set device_label = v_label
   where token_hash = t.token_hash;

  return json_build_object('ok', true, 'id', t.device_id, 'label', v_label, 'custom_name', v_name);
end
$$;

revoke all on function public.session_rename_device(text, uuid, text) from public;
grant execute on function public.session_rename_device(text, uuid, text) to anon, authenticated;

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
               'label', coalesce(
                 nullif(dd.custom_name, ''),
                 nullif(se.device_label, ''),
                 nullif(dd.auto_label, ''),
                 private.session_device_label(se.device_ua, null, null, se.delad_enhet)
               ),
               'custom_name', nullif(dd.custom_name, ''),
               'auto_label', coalesce(nullif(dd.auto_label, ''), private.session_device_label(se.device_ua, null, null, se.delad_enhet)),
               'kind', coalesce(dd.device_kind, case when coalesce(se.delad_enhet, false) then 'platta' else null end),
               'last_seen', coalesce(se.last_seen_at, se.created_at),
               'current', (se.token_hash = s_hash),
               'delad', coalesce(se.delad_enhet, false)
             ) as o
        from private.sessions se
        left join private.driver_devices dd
          on dd.driver_id = se.driver_id and dd.enhet_id = se.client_enhet
       where se.driver_id = v_driver
         and se.expires_at > now()
    ) x;
  return json_build_object('ok', true, 'devices', v_list);
end
$$;

revoke all on function public.list_my_sessions(text) from public;
grant execute on function public.list_my_sessions(text) to anon, authenticated;

-- ---------- Per-enhet push-val & kopiera notisinställningar ----------

alter table public.push_subscriptions
  add column if not exists prefs jsonb not null default '{"tag":true,"flyg":true,"bat":true,"prognos":true}'::jsonb;

create or replace function private.clean_push_prefs(p_prefs jsonb)
returns jsonb
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'tag', case when jsonb_typeof(p_prefs) = 'object' and p_prefs ? 'tag' then coalesce((p_prefs->>'tag')::boolean, true) else true end,
    'flyg', case when jsonb_typeof(p_prefs) = 'object' and p_prefs ? 'flyg' then coalesce((p_prefs->>'flyg')::boolean, true) else true end,
    'bat', case when jsonb_typeof(p_prefs) = 'object' and p_prefs ? 'bat' then coalesce((p_prefs->>'bat')::boolean, true) else true end,
    'prognos', case when jsonb_typeof(p_prefs) = 'object' and p_prefs ? 'prognos' then coalesce((p_prefs->>'prognos')::boolean, true) else true end
  )
$$;

drop function if exists public.push_save(text, text, text, text, text);
create or replace function public.push_save(
  p_token text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_ua text default null,
  p_prefs jsonb default null
)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_prefs jsonb;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(p_endpoint,'') !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = ''
     or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'bad_input' using errcode = '22023';
  end if;
  v_prefs := private.clean_push_prefs(p_prefs);
  insert into public.push_subscriptions (driver_id, endpoint, p256dh, auth, ua, token_hash, prefs)
  values (a.driver_id, p_endpoint, p_p256dh, p_auth, left(p_ua, 200), private.token_hash(p_token), v_prefs)
  on conflict (endpoint) do update set
    driver_id = excluded.driver_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    ua = excluded.ua,
    fail_count = 0,
    token_hash = excluded.token_hash,
    prefs = case when p_prefs is not null then excluded.prefs else public.push_subscriptions.prefs end;
  delete from public.push_subscriptions where driver_id = a.driver_id and id not in
    (select id from public.push_subscriptions where driver_id = a.driver_id order by created_at desc limit 5);
  return json_build_object('ok', true, 'devices', (select count(*) from public.push_subscriptions where driver_id = a.driver_id));
end
$$;

revoke all on function public.push_save(text, text, text, text, text, jsonb) from public;
grant execute on function public.push_save(text, text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.push_save_prefs(p_token text, p_endpoint text, p_prefs jsonb)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_prefs jsonb;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'bad_input' using errcode = '22023';
  end if;
  v_prefs := private.clean_push_prefs(p_prefs);
  update public.push_subscriptions
     set prefs = v_prefs
   where driver_id = a.driver_id and endpoint = p_endpoint;
  return json_build_object('ok', true, 'prefs', v_prefs);
end
$$;

revoke all on function public.push_save_prefs(text, text, jsonb) from public;
grant execute on function public.push_save_prefs(text, text, jsonb) to anon, authenticated;

create or replace function public.bev_svc_targets(p_driver text)
returns json
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(json_agg(json_build_object(
    'id', id,
    'endpoint', endpoint,
    'p256dh', p256dh,
    'auth', auth,
    'prefs', coalesce(prefs, '{"tag":true,"flyg":true,"bat":true,"prognos":true}'::jsonb)
  )), '[]'::json)
  from public.push_subscriptions where driver_id = p_driver and fail_count < 5
$$;

revoke all on function public.bev_svc_targets(text) from public, anon, authenticated;
grant execute on function public.bev_svc_targets(text) to service_role;

create table if not exists private.driver_notis_settings (
  driver_id text not null references public.drivers(id) on delete cascade,
  device_key text not null,
  device_name text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (driver_id, device_key),
  constraint driver_notis_obj check (jsonb_typeof(data) = 'object'),
  constraint driver_notis_size check (pg_column_size(data) <= 32768)
);
revoke all on table private.driver_notis_settings from public, anon, authenticated;

comment on table private.driver_notis_settings is
  'Senaste notis- och ljudinställningar per enhet för knappen Kopiera inställningar från annan enhet.';

create or replace function public.notis_device_settings_save(
  p_token text,
  p_device_key text,
  p_device_name text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_key text;
  v_name text;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then return p_data; end if;
  v_key := left(nullif(btrim(coalesce(p_device_key, '')), ''), 64);
  if v_key is null or v_key !~ '^[A-Za-z0-9_-]{4,64}$' then
    raise exception 'bad_device' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'bad_data' using errcode = '22023';
  end if;
  if pg_column_size(p_data) > 32768 then
    raise exception 'too_big' using errcode = '22023';
  end if;
  v_name := left(nullif(btrim(regexp_replace(coalesce(p_device_name, ''), '[\x00-\x1f\x7f<>]+', '', 'g')), ''), 50);
  insert into private.driver_notis_settings (driver_id, device_key, device_name, data, updated_at)
  values (a.driver_id, v_key, coalesce(v_name, 'Enhet'), p_data, now())
  on conflict (driver_id, device_key) do update
    set device_name = coalesce(excluded.device_name, private.driver_notis_settings.device_name),
        data = excluded.data,
        updated_at = now();
  return jsonb_build_object('ok', true, 'device_key', v_key);
end
$$;

revoke all on function public.notis_device_settings_save(text, text, text, jsonb) from public;
grant execute on function public.notis_device_settings_save(text, text, text, jsonb) to anon, authenticated;

create or replace function public.notis_device_settings_list(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_rows json;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then return '[]'::json; end if;
  select coalesce(json_agg(json_build_object(
    'device_key', s.device_key,
    'device_name', coalesce(nullif(dd.custom_name, ''), nullif(s.device_name, ''), nullif(dd.auto_label, ''), 'Enhet'),
    'data', s.data,
    'updated_at', s.updated_at
  ) order by s.updated_at desc), '[]'::json)
    into v_rows
    from private.driver_notis_settings s
    left join private.driver_devices dd
      on dd.driver_id = s.driver_id and dd.enhet_id = s.device_key
   where s.driver_id = a.driver_id;
  return v_rows;
end
$$;

revoke all on function public.notis_device_settings_list(text) from public;
grant execute on function public.notis_device_settings_list(text) to anon, authenticated;
