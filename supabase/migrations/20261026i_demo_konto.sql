-- t369u–t373u: Demokonton (inbjudan från adminpanelen, gäller 3 dygn, endast läsning).
--
-- Hur det fungerar
--  * Ett demokonto är en vanlig rad i public.drivers (id DEMO1, DEMO2 …, kategori standard) + en rad i
--    private.demo_accounts (roll 'forare' eller 'agare', vems data som visas, när kontot går ut).
--  * Ägaren/S admin skapar inbjudan med public.admin_create_demo → engångslänk (aktivera.html#t=…).
--    Den inbjudna skriver sitt namn och väljer själv lösenord (public.demo_activate). Inget lösenord
--    skapas eller visas av oss.
--  * private.session_actor (den enda sessionskontrollen som alla RPC:er går via) känner igen demokonton:
--      - utgånget/avslutat demokonto → invalid_session (28000), ingen cron behövs
--      - annars: läser som private.demo_source() (710022) med kategori 'standard' (aldrig admin/ägare)
--        och via_master = true (alla befintliga "titta men inte röra"-spärrar gäller),
--        och sätter transaktionsflaggan taxi.demo = demokontots id.
--  * Spärr på servern: triggers på alla användartabeller kastar demo_read_only (42501) när taxi.demo är satt.
--    Läs-/sett-markeringar (event_notices, prognos_seen, changelog_seen) hoppas tyst över.
--  * Anonymisering för demosessioner: förarnamn → "Förare N", inga profilbilder, inga notistexter.
--    Topplistor skickar redan inga namn/id till kategori standard (bara ägaren ser namn).
--  * Adminfunktioner (require_admin m.fl.) nekas eftersom kategorin alltid är standard; ägar-demot
--    visar adminpanelen med påhittade exempeldata i webbläsaren (demo.js) – inga admin-RPC:er anropas.
--
-- Additivt: ny tabell, nya funktioner/triggers, CREATE OR REPLACE av befintliga funktioner med samma
-- signatur (originalen sparade i /workspace/backups/UNDO-demo-konto-2026-10-26.md). Inga ALTER/DROP.

-- ---------- tabell ----------
create table if not exists private.demo_accounts (
  driver_id   text primary key references public.drivers(id) on delete cascade,
  role        text not null default 'forare' check (role in ('forare', 'agare')),
  demo_of     text not null references public.drivers(id),
  created_by  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '3 days',
  activated_at timestamptz,
  ended_at    timestamptz,
  ended_by    text
);
revoke all on private.demo_accounts from public, anon, authenticated;

-- Vems data demokonton visar (Christian, enligt t369u). Ändra här om det ska bytas.
create or replace function private.demo_source() returns text language sql immutable as $$ select '710022'::text $$;

-- Sant i en transaktion där en demosession har kontrollerats (sätts av private.session_actor).
create or replace function private.is_demo() returns boolean language sql stable as $$
  select coalesce(current_setting('taxi.demo', true), '') <> ''
$$;

-- Anonymt förarnamn för demosessioner: "Förare N" (N = stabil löpnummer per förar-id).
create or replace function private.demo_alias(p_id text) returns text
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select 'Förare ' || coalesce((select count(*) from public.drivers d where d.id <= p_id), 0)::text
$$;

-- ---------- skrivspärr ----------
create or replace function private.demo_write_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('taxi.demo', true), '') <> '' then
    raise exception 'demo_read_only' using errcode = '42501', hint = 'Demokonto: endast läsning';
  end if;
  return null;   -- statement-trigger: returvärdet används inte
end $$;

create or replace function private.demo_quiet_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('taxi.demo', true), '') <> '' then return null; end if;   -- hoppa tyst över raden
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'public.drivers','public.companies','public.company_goals','public.company_cities','public.cities','public.venues',
    'public.cars','public.car_models','public.car_maintenance','public.car_odometer','public.car_issues','public.car_issue_updates',
    'public.car_issue_photos','public.car_tasks','public.car_task_items','public.car_task_log','public.bil_notice_prefs',
    'public.workshop_settings','public.workshop_hours','public.workshop_messages',
    'public.profile_photos','public.forum_posts','public.forum_comments','public.forum_likes','public.forum_photos','public.forum_rules_accept',
    'public.events','public.event_comments','public.event_subscriptions',
    'public.arrival_watches','public.push_subscriptions','public.prognos_watches','public.prognos_meta',
    'public.fuel_company_prices','public.fuel_config',
    'private.activation_links','private.password_resets','private.company_members','private.app_secrets','private.bil_mail_outbox',
    'private.demo_accounts']
  loop
    if not exists (select 1 from pg_trigger where tgname = 'zz_demo_write_guard' and tgrelid = t::regclass) then
      execute format('create trigger zz_demo_write_guard before insert or update or delete on %s for each statement execute function private.demo_write_guard()', t);
    end if;
  end loop;
  foreach t in array array['public.event_notices','public.prognos_seen','public.changelog_seen']
  loop
    if not exists (select 1 from pg_trigger where tgname = 'zz_demo_quiet_guard' and tgrelid = t::regclass) then
      execute format('create trigger zz_demo_quiet_guard before insert or update or delete on %s for each row execute function private.demo_quiet_guard()', t);
    end if;
  end loop;
end $$;

-- ---------- sessionskontrollen ----------
create or replace function private.session_actor(p_token text, OUT driver_id text, OUT category text, OUT via_master boolean)
returns record language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare s private.sessions; v_cat text; v_act boolean; v_found boolean; dm private.demo_accounts; t_cat text; t_act boolean;
begin
  select * into s from private.sessions
   where token_hash = private.token_hash(p_token) and expires_at > now();
  if not found then raise exception 'invalid_session' using errcode = '28000'; end if;
  select d.category, coalesce(d.activated, false), true into v_cat, v_act, v_found
    from public.drivers d where d.id = s.driver_id;
  select * into dm from private.demo_accounts x where x.driver_id = s.driver_id;
  if dm.driver_id is not null then
    -- Demokonto: måste vara aktiverat, inte avslutat och inte äldre än expires_at. Inget undantag för huvudlösenordet.
    if dm.ended_at is not null or dm.expires_at <= now() or not coalesce(v_found, false) or not v_act then
      raise exception 'invalid_session' using errcode = '28000', hint = 'demo_ended';
    end if;
    select d.category, coalesce(d.activated, false) into t_cat, t_act from public.drivers d where d.id = dm.demo_of;
    if t_cat is null or not t_act or t_cat = 'avslutad' then
      raise exception 'invalid_session' using errcode = '28000';
    end if;
    if s.expires_at < now() + interval '24 hours' - interval '1 minute' then
      update private.sessions set expires_at = least(now() + interval '24 hours', dm.expires_at) where token_hash = s.token_hash;
    end if;
    perform set_config('taxi.demo', dm.driver_id, true);   -- gäller resten av transaktionen (skrivspärr + anonymisering)
    driver_id := dm.demo_of;
    via_master := true;          -- befintliga "bara titta"-spärrar (forum, profilbild, prognos m.m.)
    category := 'standard';      -- aldrig admin/ägare på servern, oavsett demoroll
    return;
  end if;
  if not s.via_master and (not coalesce(v_found, false) or not v_act or v_cat = 'avslutad') then
    raise exception 'invalid_session' using errcode = '28000';
  end if;
  -- glidande utgång: 24 h efter senaste aktivitet (skrivs högst en gång per minut)
  if s.expires_at < now() + interval '24 hours' - interval '1 minute' then
    update private.sessions set expires_at = now() + interval '24 hours' where token_hash = s.token_hash;
  end if;
  driver_id := s.driver_id;
  via_master := s.via_master;
  category := case when coalesce(v_found, false) then private.norm_cat(v_cat) else null end;
end $$;

-- ---------- inloggning: utgånget demokonto får tydligt besked ----------
create or replace function public.login(p_id text, p_password text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_id text := regexp_replace(coalesce(p_id, ''), '^\s+|\s+$', '', 'g');
  d public.drivers; v_master boolean := false; v_master_hash text; v_fails int; v_token text; v_role text;
begin
  if v_id !~ '^[A-Za-z0-9_-]{1,32}$' then return json_build_object('ok', false, 'error', 'bad_id'); end if;
  if upper(v_id) ~ '^DEMO[0-9]+$' then v_id := upper(v_id); end if;   -- demo-ID:n skrivs med versaler
  select count(*) into v_fails from public.activity_log
   where action = 'login_failed' and target_id = v_id and created_at > now() - interval '15 minutes';
  if v_fails >= 10 then return json_build_object('ok', false, 'error', 'locked'); end if;

  -- Demokonto som gått ut eller avslutats: neka direkt (t371u)
  if exists (select 1 from private.demo_accounts x where upper(x.driver_id) = upper(v_id) and (x.ended_at is not null or x.expires_at <= now())) then
    perform private.log(v_id, null, 'login_failed', v_id, '{"reason":"demo_ended"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'demo_ended');
  end if;

  select * into d from public.drivers where id = v_id;
  v_role := case when d.id is null then null else private.norm_cat(d.category) end;
  select value_hash into v_master_hash from private.app_secrets where key = 'master_password';

  if v_master_hash is not null and coalesce(p_password, '') <> ''
     and extensions.crypt(p_password, v_master_hash) = v_master_hash then
    v_master := true;
  -- Avaktiverad förare: tydligt besked (inget lösenordsbyte, ingen profil). Om ett gammalt lösenord
  -- finns kvar måste det stämma, annars "fel lösenord" som vanligt.
  elsif d.id is not null and not coalesce(d.activated, false)
     and (d.password_hash is null or extensions.crypt(private.norm_pw(p_password), d.password_hash) = d.password_hash) then
    perform private.log(v_id, v_role, 'login_failed', v_id, '{"reason":"inactive"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'inactive');
  elsif d.id is not null and coalesce(d.activated, false) and d.password_hash is null then
    perform private.log(v_id, v_role, 'login_failed', v_id, '{"reason":"pending"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'pending');
  elsif d.id is null or d.password_hash is null
     or extensions.crypt(private.norm_pw(p_password), d.password_hash) <> d.password_hash then
    perform private.log(v_id, v_role, 'login_failed', v_id, '{"reason":"wrong_password"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'wrong');
  elsif not coalesce(d.activated, false) then
    perform private.log(v_id, v_role, 'login_failed', v_id, '{"reason":"inactive"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'inactive');
  elsif d.category = 'avslutad' then
    perform private.log(v_id, v_role, 'login_failed', v_id, '{"reason":"ended"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'ended');
  end if;

  delete from private.sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.sessions(token_hash, driver_id, via_master) values (private.token_hash(v_token), v_id, v_master);
  if not v_master then
    update public.drivers set logged_in = true, last_login_at = now() where id = v_id;
  end if;
  perform private.log(v_id, v_role, 'login', v_id, '{}'::jsonb, v_master);
  return json_build_object('ok', true, 'token', v_token, 'via_master', v_master,
    'driver', json_build_object('id', v_id, 'category', v_role, 'first_name', d.first_name, 'last_name', d.last_name));
end $$;

-- ---------- get_me: demo-info till appen ----------
create or replace function public.get_me(p_token text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; d public.drivers; dm private.demo_accounts; me public.drivers;
begin
  select * into a from private.session_actor(p_token);
  select * into d from public.drivers where id = a.driver_id;
  if private.is_demo() then
    select * into dm from private.demo_accounts where driver_id = current_setting('taxi.demo', true);
    select * into me from public.drivers where id = dm.driver_id;
    return json_build_object('id', a.driver_id, 'category', a.category, 'via_master', false,
      'first_name', d.first_name, 'last_name', d.last_name, 'needs_profile', false, 'must_change_password', false,
      'demo', true, 'demo_id', dm.driver_id, 'demo_role', dm.role, 'demo_expires_at', dm.expires_at,
      'demo_first_name', me.first_name, 'demo_last_name', me.last_name);
  end if;
  return json_build_object('id', a.driver_id, 'category', a.category, 'via_master', a.via_master,
                           'first_name', d.first_name, 'last_name', d.last_name,
                           'needs_profile', d.id is not null and cardinality(private.profile_missing(d)) > 0,
                           -- huvudlösenords-inloggning tvingas aldrig byta förarens lösenord
                           'must_change_password', coalesce(d.must_change_password, false) and not a.via_master);
end $$;

-- ---------- profil: demo ser inga personuppgifter (adress, telefon, anhörig) ----------
create or replace function public.get_my_profile(p_token text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; d public.drivers;
begin
  select * into a from private.session_actor(p_token);
  select * into d from public.drivers where id = a.driver_id;
  if d.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if private.is_demo() then
    return json_build_object('id', d.id, 'via_master', true, 'demo', true, 'first_name', private.demo_alias(d.id), 'last_name', null,
      'address', null, 'postal_code', null, 'city', null, 'email', null, 'phone', null,
      'emergency_first_name', null, 'emergency_last_name', null, 'emergency_address', null, 'emergency_postal', null,
      'emergency_city', null, 'emergency_phone', null, 'emergency_relation', null, 'missing', '[]'::json);
  end if;
  return json_build_object('id', d.id, 'via_master', a.via_master,
    'first_name', d.first_name, 'last_name', d.last_name, 'address', d.address, 'postal_code', d.postal_code,
    'city', d.city, 'email', d.email, 'phone', d.phone,
    'emergency_first_name', d.emergency_first_name, 'emergency_last_name', d.emergency_last_name,
    'emergency_address', d.emergency_address, 'emergency_postal', d.emergency_postal,
    'emergency_city', d.emergency_city, 'emergency_phone', d.emergency_phone,
    'emergency_relation', d.emergency_relation,
    'missing', to_json(private.profile_missing(d)));
end $$;

-- ---------- anonymisering (namn/bilder) ----------
create or replace function private.forum_name(p_id text)
returns text language sql stable security definer set search_path to 'public','pg_temp' as $$
  select case when private.is_demo() then private.demo_alias(p_id) else
    coalesce((select nullif(btrim(d.first_name), '') ||
                     coalesce(' ' || upper(left(nullif(btrim(d.last_name), ''), 1)) || '.', '')
                from public.drivers d where d.id = p_id), 'Förare') end
$$;

create or replace function private.forum_avatar(p_id text)
returns text language sql stable security definer set search_path to 'public','pg_temp' as $$
  select case when private.is_demo() then null else (select path from public.profile_photos where driver_id = p_id) end
$$;

create or replace function private.bil_driver_name(p_id text)
returns text language sql stable security definer set search_path to 'public','pg_temp' as $$
  select case when private.is_demo() then private.demo_alias(p_id) else
    (select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') from public.drivers where id = p_id) end
$$;

create or replace function public.profile_photo_get_svc(p_token text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_path text;
begin
  select * into a from private.session_actor(p_token);
  if a.driver_id is null then raise exception 'invalid_session' using errcode = '28000'; end if;
  if not private.is_demo() then
    select path into v_path from public.profile_photos where driver_id = a.driver_id;
  end if;
  return json_build_object('path', v_path, 'via_master', coalesce(a.via_master, false));
end $$;

create or replace function public.get_event_comments(p_token text, p_event_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; e public.events; v_demo boolean;
begin
  select * into a from private.kal_actor(p_token);
  v_demo := private.is_demo();
  select * into e from public.events where id = p_event_id;
  if not found or not private.kal_visible(e, a.company_id, a.driver_id, a.is_admin) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at,
             'author', case when v_demo then private.demo_alias(c.driver_id) else
                       coalesce(nullif(trim(coalesce(d.first_name,'') || ' ' || left(coalesce(d.last_name,''),1)), ''), d.name, c.driver_id) end,
             'mine', c.driver_id = a.driver_id, 'can_delete', not v_demo and (c.driver_id = a.driver_id or a.is_admin))
             order by c.created_at)
      from public.event_comments c left join public.drivers d on d.id::text = c.driver_id
     where c.event_id = p_event_id and c.company_id = a.company_id and c.deleted_at is null), '[]');
end $$;

-- Notistexter kan innehålla namn ("Berra kommenterade …"): demo får en tom lista och inget markeras som läst.
create or replace function public.forum_notices(p_token text, p_mark_read boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; r jsonb;
begin
  select * into a from private.forum_actor(p_token);
  if private.is_demo() then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'post_id', n.forum_post_id, 'kind', n.kind, 'body', n.body,
           'created_at', n.created_at, 'read', n.read_at is not null) order by n.created_at desc), '[]')
    into r from (select * from public.event_notices where driver_id = a.driver_id and kind like 'forum%' order by created_at desc limit 50) n;
  if p_mark_read then
    update public.event_notices set read_at = now() where driver_id = a.driver_id and read_at is null and kind like 'forum%';
  end if;
  return r;
end $$;

create or replace function public.get_bil_notices(p_token text, p_mark_read boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; r jsonb;
begin
  select * into a from private.bil_actor(p_token);
  if private.is_demo() then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'body', n.body, 'created_at', n.created_at,
           'read', n.read_at is not null) order by n.created_at desc), '[]') into r
    from (select * from public.event_notices where driver_id = a.driver_id and kind like 'bil%' order by created_at desc limit 50) n;
  if p_mark_read then
    update public.event_notices set read_at = now() where driver_id = a.driver_id and read_at is null and kind like 'bil%';
  end if;
  return r;
end $$;

create or replace function public.get_my_event_notices(p_token text, p_mark_read boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; r jsonb;
begin
  select * into a from private.kal_actor(p_token);
  if private.is_demo() then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'event_id', n.event_id, 'body', n.body,
           'created_at', n.created_at, 'read', n.read_at is not null) order by n.created_at desc), '[]')
    into r
    from (select * from public.event_notices where driver_id = a.driver_id and kind not like 'bil%' and kind not like 'forum%'
           order by created_at desc limit 50) n;
  if p_mark_read then
    update public.event_notices set read_at = now() where driver_id = a.driver_id and read_at is null and kind not like 'bil%' and kind not like 'forum%';
  end if;
  return r;
end $$;

-- ---------- övriga spärrar ----------
-- Bevakning (edge function) får inte registrera eller testa notiser mot Christians telefon.
create or replace function public.bev_svc_driver(p_token text)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  return a.driver_id;
end $$;

-- Prognoskoden skrivs till vault (ingen trigger där): neka demo uttryckligen.
create or replace function public.prognos_submit_code(p_token text, p_code text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_id uuid; v_code text;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  v_code := trim(coalesce(p_code, ''));
  if length(v_code) < 4 or length(v_code) > 32 then
    raise exception 'invalid_code' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = 'PROGNOS_PIN' order by created_at desc limit 1;
  if v_id is null then
    perform vault.create_secret(v_code, 'PROGNOS_PIN', 'Prognos-åtkomstkod (endast server)');
  else
    perform vault.update_secret(v_id, v_code);
  end if;
  perform public.prognos_svc_set_status('ok', null);
  return json_build_object('ok', true);
end $$;

-- ---------- inbjudningslänken ----------
create or replace function public.check_activation_link(p_link text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare l private.activation_links; dm private.demo_accounts;
begin
  select * into l from private.activation_links where token_hash = private.token_hash(coalesce(p_link, ''));
  if l.token_hash is null or l.used_at is not null or l.fails >= 5 then return json_build_object('ok', false, 'error', 'invalid_link'); end if;
  if l.expires_at < now() then return json_build_object('ok', false, 'error', 'expired_link'); end if;
  select * into dm from private.demo_accounts where driver_id = l.driver_id;
  if dm.driver_id is not null then
    if dm.ended_at is not null or dm.expires_at <= now() then return json_build_object('ok', false, 'error', 'expired_link'); end if;
    -- Demolänken visar demo-ID:t (kontot är bara läsning och gäller högst 3 dygn)
    return json_build_object('ok', true, 'expires_at', least(l.expires_at, dm.expires_at),
      'demo', true, 'demo_id', dm.driver_id, 'demo_role', dm.role, 'demo_expires_at', dm.expires_at);
  end if;
  return json_build_object('ok', true, 'expires_at', l.expires_at);
end $$;

-- Den inbjudna: namn + eget lösenord. Använder public.activate_account för själva aktiveringen.
create or replace function public.demo_activate(p_link text, p_first_name text, p_last_name text, p_password text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare l private.activation_links; dm private.demo_accounts; v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, '')); r json;
begin
  select * into l from private.activation_links where token_hash = private.token_hash(coalesce(p_link, ''));
  if l.token_hash is null then return json_build_object('ok', false, 'error', 'invalid_link'); end if;
  select * into dm from private.demo_accounts where driver_id = l.driver_id;
  if dm.driver_id is null then return json_build_object('ok', false, 'error', 'invalid_link'); end if;
  if dm.ended_at is not null or dm.expires_at <= now() then return json_build_object('ok', false, 'error', 'expired_link'); end if;
  if char_length(v_first) < 1 or char_length(v_last) < 1 then return json_build_object('ok', false, 'error', 'need_name'); end if;
  if char_length(v_first) > 40 or char_length(v_last) > 40 then return json_build_object('ok', false, 'error', 'name_too_long'); end if;
  update public.drivers set first_name = v_first, last_name = v_last where id = dm.driver_id;
  r := public.activate_account(p_link, dm.driver_id, p_password);
  if coalesce((r->>'ok')::boolean, false) then
    update private.demo_accounts set activated_at = now() where driver_id = dm.driver_id;
    perform private.log(dm.driver_id, 'standard', 'demo_activated', dm.driver_id, jsonb_build_object('role', dm.role), false);
  end if;
  return r;
end $$;

-- ---------- ägare/S admin: skapa, lista, avsluta ----------
create or replace function public.admin_create_demo(p_token text, p_role text default 'forare')
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_role text := case when p_role = 'agare' then 'agare' else 'forare' end;
  v_src text := private.demo_source(); v_id text; n int := 1; v_exp timestamptz := now() + interval '3 days'; l json;
begin
  select * into a from private.require_admin(p_token);
  if not (a.category = any (private.workshop_roles())) or private.is_demo() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  if not exists (select 1 from public.drivers where id = v_src and coalesce(activated, false) and category <> 'avslutad') then
    raise exception 'demo_source_missing' using errcode = '22023';
  end if;
  if (select count(*) from private.demo_accounts where ended_at is null and expires_at > now()) >= 10 then   -- högst 10 samtidiga
    raise exception 'too_many_demos' using errcode = '22023';
  end if;
  loop
    v_id := 'DEMO' || n;
    exit when not exists (select 1 from public.drivers where upper(id) = v_id);
    n := n + 1;
  end loop;
  insert into public.drivers(id, category, activated, logged_in, password_hash, password, activated_at)
  values (v_id, 'standard', true, false, null, null, now());
  insert into private.demo_accounts(driver_id, role, demo_of, created_by, expires_at)
  values (v_id, v_role, v_src, a.driver_id, v_exp);
  l := private.new_activation_link(v_id, a.driver_id);
  update private.activation_links set expires_at = least(expires_at, v_exp) where driver_id = v_id;
  perform private.log(a.driver_id, a.category, 'demo_create', v_id, jsonb_build_object('role', v_role, 'expires_at', v_exp), false);
  return json_build_object('ok', true, 'id', v_id, 'role', v_role, 'link_token', l->>'link_token', 'expires_at', v_exp);
end $$;

-- Ny engångslänk för ett demokonto som inte aktiverats än (samma utgång som kontot)
create or replace function public.admin_demo_link(p_token text, p_id text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; dm private.demo_accounts; d public.drivers; l json;
begin
  select * into a from private.require_admin(p_token);
  if not (a.category = any (private.workshop_roles())) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into dm from private.demo_accounts where driver_id = p_id;
  if dm.driver_id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if dm.ended_at is not null or dm.expires_at <= now() then raise exception 'demo_ended' using errcode = '22023'; end if;
  select * into d from public.drivers where id = p_id;
  if not coalesce(d.activated, false) or d.password_hash is not null then raise exception 'not_pending' using errcode = '22023'; end if;
  l := private.new_activation_link(p_id, a.driver_id);
  update private.activation_links set expires_at = least(expires_at, dm.expires_at) where driver_id = p_id;
  perform private.log(a.driver_id, a.category, 'demo_link', p_id, '{}'::jsonb, a.via_master);
  return json_build_object('ok', true, 'id', p_id, 'role', dm.role, 'link_token', l->>'link_token', 'expires_at', dm.expires_at);
end $$;

create or replace function public.admin_list_demos(p_token text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  select * into a from private.require_admin(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', x.driver_id, 'role', x.role, 'demo_of', x.demo_of,
      'first_name', d.first_name, 'last_name', d.last_name,
      'created_by', x.created_by, 'created_at', x.created_at, 'expires_at', x.expires_at,
      'activated_at', x.activated_at, 'ended_at', coalesce(x.ended_at, case when x.expires_at <= now() then x.expires_at end),
      'last_login_at', d.last_login_at,
      'status', case when x.ended_at is not null or x.expires_at <= now() then 'ended'
                     when d.password_hash is null then 'pending' else 'active' end) order by x.created_at desc, x.driver_id desc)
    from private.demo_accounts x join public.drivers d on d.id = x.driver_id), '[]'::json);
end $$;

create or replace function public.admin_end_demo(p_token text, p_id text)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; dm private.demo_accounts;
begin
  select * into a from private.require_admin(p_token);
  if not (a.category = any (private.workshop_roles())) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into dm from private.demo_accounts where driver_id = p_id;
  if dm.driver_id is null then raise exception 'not_found' using errcode = '22023'; end if;
  update private.demo_accounts set ended_at = coalesce(ended_at, now()), ended_by = coalesce(ended_by, a.driver_id) where driver_id = p_id;
  perform private.deactivate_driver(p_id);   -- lösenord + alla inloggningar + länkar bort
  perform private.log(a.driver_id, a.category, 'demo_end', p_id, '{}'::jsonb, a.via_master);
  return json_build_object('ok', true);
end $$;

-- ---------- behörigheter ----------
revoke all on function private.demo_source() from public, anon, authenticated;
revoke all on function private.is_demo() from public, anon, authenticated;
revoke all on function private.demo_alias(text) from public, anon, authenticated;
revoke all on function private.demo_write_guard() from public, anon, authenticated;
revoke all on function private.demo_quiet_guard() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.demo_activate(text,text,text,text)','public.admin_create_demo(text,text)',
                           'public.admin_demo_link(text,text)','public.admin_list_demos(text)','public.admin_end_demo(text,text)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
