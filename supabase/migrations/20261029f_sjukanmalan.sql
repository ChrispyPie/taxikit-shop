-- Sjukanmälan (t611u) – bakom funktionsflagga 'sjuk'. Bara tillägg: nya tabeller i private-schemat,
-- nya funktioner och en ny privat bucket. Inga befintliga funktioner eller tabeller ändras.
-- Ångra: supabase/migrations/undo/20261029f_sjukanmalan_undo.sql
--
-- Integritet (GDPR art. 9, hälsouppgifter):
--  * Tabellerna ligger i private-schemat (nås inte via REST). All åtkomst går via SECURITY DEFINER-funktioner.
--  * Läsa: bara föraren själv, ägaren och S admin – och bara de som har flaggan 'sjuk'. Vanliga admin ser inget.
--  * Ingen diagnos eller orsak frågas efter. Kommentaren är frivillig och syns bara för föraren och ägaren.
--  * Loggen (activity_log) får bara händelsetyp och datum – aldrig kommentarer. Händelserna heter bil_sjuk_*,
--    så de syns bara för ägare/S admin i adminloggen (befintligt filter på bil_* i admin_log_page*/admin_get_log).
--  * Demosessioner nekas alltid (en demo av en flaggad förare får inte se något).

-- ── Funktionsflaggor ─────────────────────────────────────────────────────────
create table if not exists private.feature_flags (
  feature    text not null,
  driver_id  text not null references public.drivers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (feature, driver_id)
);
revoke all on private.feature_flags from public, anon, authenticated;
insert into private.feature_flags (feature, driver_id) values ('sjuk', '710022'), ('sjuk', '693340')
  on conflict do nothing;

create or replace function private.has_feature(p_driver text, p_feature text)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select not private.is_demo()
     and exists (select 1 from private.feature_flags f where f.driver_id = p_driver and f.feature = p_feature)
$$;
revoke all on function private.has_feature(text, text) from public, anon, authenticated;

-- Appen frågar vilka flaggor den inloggade har. Tom lista för alla andra (och för demo / ogiltig session).
create or replace function public.get_my_features(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  begin
    select * into a from private.session_actor(p_token);
  exception when others then
    return '[]'::jsonb;
  end;
  if private.is_demo() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(f.feature order by f.feature) from private.feature_flags f where f.driver_id = a.driver_id), '[]'::jsonb);
end $$;
revoke all on function public.get_my_features(text) from public;
grant execute on function public.get_my_features(text) to anon, authenticated;

-- ── Tabeller ────────────────────────────────────────────────────────────────
create table if not exists private.sick_reports (
  id             bigint generated always as identity primary key,
  driver_id      text not null references public.drivers(id) on delete cascade,
  start_date     date not null,
  end_date       date,                       -- sista sjukdagen; null = fortfarande sjuk
  comment        text check (comment is null or char_length(comment) <= 500),
  status         text not null default 'ny' check (status in ('ny', 'godkand', 'intyg_begart', 'avslagen')),
  status_comment text check (status_comment is null or char_length(status_comment) <= 500),
  status_by      text,
  status_at      timestamptz,
  recovered_at   timestamptz,
  sjuklon        text not null default 'ej' check (sjuklon in ('ej', 'beviljad', 'utbetald')),
  sjuklon_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists sick_reports_driver_idx on private.sick_reports (driver_id, start_date desc);
revoke all on private.sick_reports from public, anon, authenticated;

create table if not exists private.sick_certs (
  id          bigint generated always as identity primary key,
  report_id   bigint not null references private.sick_reports(id) on delete cascade,
  path        text not null unique,
  mime        text not null check (mime in ('image/jpeg', 'application/pdf')),
  uploaded    boolean not null default false,
  uploaded_by text not null,
  created_at  timestamptz not null default now()
);
create index if not exists sick_certs_report_idx on private.sick_certs (report_id);
revoke all on private.sick_certs from public, anon, authenticated;

-- Kö för pushnotiser. Edge-funktionen "sjuk" (action flush) skickar och markerar dem.
create table if not exists private.sjuk_push_queue (
  id         bigint generated always as identity primary key,
  recipient  text not null,
  title      text not null,
  body       text,
  tag        text not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists sjuk_push_queue_open_idx on private.sjuk_push_queue (created_at) where sent_at is null;
revoke all on private.sjuk_push_queue from public, anon, authenticated;

-- ── Hjälpfunktioner ─────────────────────────────────────────────────────────
create or replace function private.sjuk_today() returns date language sql stable as $$
  select (now() at time zone 'Europe/Stockholm')::date
$$;

-- Inloggad + flagga 'sjuk' + inte demo. boss = ägare eller S admin.
create or replace function private.sjuk_actor(p_token text, out driver_id text, out category text, out via_master boolean, out boss boolean)
returns record language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() or not private.has_feature(a.driver_id, 'sjuk') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  driver_id := a.driver_id; category := a.category; via_master := a.via_master;
  boss := a.category = any (private.workshop_roles());
end $$;

-- Får aktören se/ändra den här rapporten? (föraren själv eller ägare/S admin)
create or replace function private.sjuk_report_for(p_driver text, p_boss boolean, p_id bigint)
returns private.sick_reports language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare r private.sick_reports;
begin
  select * into r from private.sick_reports where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.driver_id <> p_driver and not p_boss then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return r;
end $$;

create or replace function private.sjuk_fmt_date(d date) returns text language sql immutable as $$
  select (array['sön','mån','tis','ons','tor','fre','lör'])[extract(dow from d)::int + 1] || ' ' || extract(day from d)::int || ' ' ||
         (array['jan','feb','mars','april','maj','juni','juli','aug','sep','okt','nov','dec'])[extract(month from d)::int]
$$;

-- Push till flaggade ägare/S admin (utom den som gjorde ändringen).
create or replace function private.sjuk_push_bosses(p_except text, p_title text, p_body text, p_tag text)
returns void language sql security definer set search_path to 'public','pg_temp' as $$
  insert into private.sjuk_push_queue (recipient, title, body, tag)
  select d.id, p_title, p_body, p_tag
    from public.drivers d join private.feature_flags f on f.driver_id = d.id and f.feature = 'sjuk'
   where d.category = any (private.workshop_roles()) and coalesce(d.activated, false) and d.id <> coalesce(p_except, '')
$$;

-- Push till föraren (om det inte är föraren själv som ändrade).
create or replace function private.sjuk_push_driver(p_driver text, p_except text, p_title text, p_body text, p_tag text)
returns void language sql security definer set search_path to 'public','pg_temp' as $$
  insert into private.sjuk_push_queue (recipient, title, body, tag)
  select p_driver, p_title, p_body, p_tag where p_driver <> coalesce(p_except, '')
$$;

create or replace function private.sjuk_days(r private.sick_reports) returns int language sql stable as $$
  select greatest(0, coalesce(r.end_date, private.sjuk_today()) - r.start_date + 1)
$$;

create or replace function private.sjuk_json(r private.sick_reports, p_boss boolean) returns jsonb
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'id', r.id, 'driver_id', r.driver_id, 'name', private.bil_driver_name(r.driver_id),
    'start', r.start_date, 'end', r.end_date, 'open', r.end_date is null, 'days', private.sjuk_days(r),
    'comment', r.comment, 'status', r.status, 'status_comment', r.status_comment,
    'status_by', case when r.status_by is not null then private.bil_driver_name(r.status_by) end, 'status_at', r.status_at,
    'recovered_at', r.recovered_at, 'sjuklon', r.sjuklon, 'sjuklon_at', r.sjuklon_at,
    'created_at', r.created_at,
    'certs', (select count(*) from private.sick_certs c where c.report_id = r.id and c.uploaded))
$$;

revoke all on function private.sjuk_today() from public, anon, authenticated;
revoke all on function private.sjuk_actor(text) from public, anon, authenticated;
revoke all on function private.sjuk_report_for(text, boolean, bigint) from public, anon, authenticated;
revoke all on function private.sjuk_fmt_date(date) from public, anon, authenticated;
revoke all on function private.sjuk_push_bosses(text, text, text, text) from public, anon, authenticated;
revoke all on function private.sjuk_push_driver(text, text, text, text, text) from public, anon, authenticated;

-- ── Appens funktioner ───────────────────────────────────────────────────────
-- Mina sjukperioder + (för ägare/S admin) alla förares.
create or replace function public.sjuk_get(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  select * into a from private.sjuk_actor(p_token);
  return jsonb_build_object(
    'me', a.driver_id, 'boss', a.boss, 'today', private.sjuk_today(),
    'mine', coalesce((select jsonb_agg(private.sjuk_json(r, a.boss) order by r.start_date desc, r.id desc)
                        from private.sick_reports r where r.driver_id = a.driver_id), '[]'::jsonb),
    'all', case when a.boss then coalesce((select jsonb_agg(private.sjuk_json(r, true) order by (r.end_date is null) desc, r.start_date desc, r.id desc)
                        from private.sick_reports r
                       where r.end_date is null or r.id in (select x.id from private.sick_reports x order by x.start_date desc, x.id desc limit 300)), '[]'::jsonb) end);
end $$;

-- Anmäl sjuk. Startdatum: högst 14 dagar bakåt, högst i morgon. Bara en öppen sjukperiod åt gången.
create or replace function public.sjuk_report(p_token text, p_start date default null, p_comment text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_start date := coalesce(p_start, private.sjuk_today()); v_c text := nullif(btrim(coalesce(p_comment, '')), '');
  r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  if v_start < private.sjuk_today() - 14 or v_start > private.sjuk_today() + 1 then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  if char_length(coalesce(v_c, '')) > 500 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  if exists (select 1 from private.sick_reports x where x.driver_id = a.driver_id and x.end_date is null) then
    raise exception 'already_sick' using errcode = '23505';
  end if;
  if (select count(*) from private.sick_reports x where x.driver_id = a.driver_id and x.created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into private.sick_reports (driver_id, start_date, comment) values (a.driver_id, v_start, v_c) returning * into r;
  perform private.sjuk_push_bosses(a.driver_id, '🤒 Ny sjukanmälan',
    coalesce(private.bil_driver_name(a.driver_id), a.driver_id) || ' är sjuk från ' || private.sjuk_fmt_date(v_start) || '.', 'sjuk-' || r.id);
  perform private.log(a.driver_id, a.category, 'bil_sjuk_add', a.driver_id,
    jsonb_build_object('id', r.id, 'start', v_start), a.via_master);
  return private.sjuk_json(r, a.boss);
end $$;

-- Friskanmäl: p_back = första dagen föraren kan jobba igen (standard i dag). Sista sjukdag = p_back - 1.
create or replace function public.sjuk_recover(p_token text, p_id bigint, p_back date default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; r private.sick_reports; v_back date := coalesce(p_back, private.sjuk_today()); v_days int;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_id);
  if r.end_date is not null then raise exception 'already_recovered' using errcode = '23505'; end if;
  if v_back <= r.start_date or v_back > private.sjuk_today() + 1 then raise exception 'bad_date' using errcode = '22023'; end if;
  update private.sick_reports set end_date = v_back - 1, recovered_at = now(), updated_at = now() where id = r.id returning * into r;
  v_days := private.sjuk_days(r);
  perform private.sjuk_push_bosses(a.driver_id, '💪 Friskanmälan',
    coalesce(private.bil_driver_name(r.driver_id), r.driver_id) || ' är frisk från ' || private.sjuk_fmt_date(v_back) || ' (' || v_days || ' sjukdag' || case when v_days = 1 then '' else 'ar' end || ').', 'sjuk-' || r.id);
  perform private.sjuk_push_driver(r.driver_id, a.driver_id, '💪 Friskanmäld',
    'Du är friskanmäld från ' || private.sjuk_fmt_date(v_back) || '.', 'sjuk-' || r.id);
  perform private.log(a.driver_id, a.category, 'bil_sjuk_recover', r.driver_id,
    jsonb_build_object('id', r.id, 'start', r.start_date, 'end', r.end_date, 'days', v_days), a.via_master);
  return private.sjuk_json(r, a.boss);
end $$;

-- Ägaren: godkänn / begär läkarintyg / avslå (valfri kommentar).
create or replace function public.sjuk_decide(p_token text, p_id bigint, p_status text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; r private.sick_reports; v_c text := nullif(btrim(coalesce(p_comment, '')), ''); v_old text; v_t text;
begin
  select * into a from private.sjuk_actor(p_token);
  if not a.boss then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('godkand', 'intyg_begart', 'avslagen', 'ny') then raise exception 'bad_status' using errcode = '22023'; end if;
  if char_length(coalesce(v_c, '')) > 500 then raise exception 'comment_too_long' using errcode = '22023'; end if;
  r := private.sjuk_report_for(a.driver_id, a.boss, p_id);
  v_old := r.status;
  update private.sick_reports set status = p_status, status_comment = v_c, status_by = a.driver_id, status_at = now(), updated_at = now()
   where id = r.id returning * into r;
  v_t := case p_status when 'godkand' then '✅ Sjukanmälan godkänd' when 'intyg_begart' then '📄 Läkarintyg behövs'
                       when 'avslagen' then '❌ Sjukanmälan avslagen' else '🤒 Sjukanmälan öppnad igen' end;
  perform private.sjuk_push_driver(r.driver_id, a.driver_id, v_t,
    case p_status when 'intyg_begart' then 'Ladda upp ett läkarintyg i appen.' else 'Sjukperioden från ' || private.sjuk_fmt_date(r.start_date) || '.' end
      || case when v_c is not null then ' Öppna appen för att läsa kommentaren.' else '' end, 'sjuk-' || r.id);
  perform private.log(a.driver_id, a.category, 'bil_sjuk_status', r.driver_id,
    jsonb_build_object('id', r.id, 'from', v_old, 'to', p_status), a.via_master);
  return private.sjuk_json(r, a.boss);
end $$;

-- Ägaren: sjuklön ej / beviljad / utbetald.
create or replace function public.sjuk_set_sjuklon(p_token text, p_id bigint, p_value text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; r private.sick_reports; v_old text;
begin
  select * into a from private.sjuk_actor(p_token);
  if not a.boss then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_value not in ('ej', 'beviljad', 'utbetald') then raise exception 'bad_value' using errcode = '22023'; end if;
  r := private.sjuk_report_for(a.driver_id, a.boss, p_id);
  v_old := r.sjuklon;
  if v_old = p_value then return private.sjuk_json(r, a.boss); end if;
  update private.sick_reports set sjuklon = p_value, sjuklon_at = case when p_value = 'ej' then null else now() end, updated_at = now()
   where id = r.id returning * into r;
  if p_value in ('beviljad', 'utbetald') then
    perform private.sjuk_push_driver(r.driver_id, a.driver_id,
      case p_value when 'beviljad' then '💰 Sjuklön beviljad' else '💰 Sjuklön utbetald' end,
      'Sjukperioden från ' || private.sjuk_fmt_date(r.start_date) || '.', 'sjuk-' || r.id);
  end if;
  perform private.log(a.driver_id, a.category, 'bil_sjuk_lon', r.driver_id,
    jsonb_build_object('id', r.id, 'from', v_old, 'to', p_value), a.via_master);
  return private.sjuk_json(r, a.boss);
end $$;

revoke all on function public.sjuk_get(text) from public;
revoke all on function public.sjuk_report(text, date, text) from public;
revoke all on function public.sjuk_recover(text, bigint, date) from public;
revoke all on function public.sjuk_decide(text, bigint, text, text) from public;
revoke all on function public.sjuk_set_sjuklon(text, bigint, text) from public;
grant execute on function public.sjuk_get(text) to anon, authenticated;
grant execute on function public.sjuk_report(text, date, text) to anon, authenticated;
grant execute on function public.sjuk_recover(text, bigint, date) to anon, authenticated;
grant execute on function public.sjuk_decide(text, bigint, text, text) to anon, authenticated;
grant execute on function public.sjuk_set_sjuklon(text, bigint, text) to anon, authenticated;

-- ── Edge-funktionen "sjuk" (bara service_role) ──────────────────────────────
-- Ta bort en sjukperiod: föraren själv så länge den är obehandlad (status ny), ägare/S admin alltid.
-- Returnerar sökvägarna till intygen så att edge-funktionen kan radera filerna.
create or replace function public.sjuk_svc_delete(p_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; r private.sick_reports; v_paths jsonb;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_id);
  if not a.boss and r.status <> 'ny' then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(c.path), '[]'::jsonb) into v_paths from private.sick_certs c where c.report_id = r.id;
  delete from private.sick_reports where id = r.id;
  delete from private.sjuk_push_queue where tag = 'sjuk-' || r.id and sent_at is null;
  perform private.log(a.driver_id, a.category, 'bil_sjuk_delete', r.driver_id, jsonb_build_object('id', r.id, 'start', r.start_date), a.via_master);
  return jsonb_build_object('paths', v_paths);
end $$;

-- Läkarintyg: ny rad + sökväg i bucketen. Föraren (egen period) eller ägare/S admin. Högst 10 intyg per period.
create or replace function public.sjuk_svc_cert_begin(p_token text, p_report bigint, p_mime text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; r private.sick_reports; v_id bigint; v_path text;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_report);
  if p_mime not in ('image/jpeg', 'application/pdf') then raise exception 'bad_mime' using errcode = '22023'; end if;
  if (select count(*) from private.sick_certs c where c.report_id = r.id) >= 10 then raise exception 'too_many' using errcode = '54000'; end if;
  v_path := r.driver_id || '/' || r.id || '/' || replace(gen_random_uuid()::text, '-', '') || case when p_mime = 'application/pdf' then '.pdf' else '.jpg' end;
  insert into private.sick_certs (report_id, path, mime, uploaded_by) values (r.id, v_path, p_mime, a.driver_id) returning id into v_id;
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;

create or replace function public.sjuk_svc_cert_finish(p_token text, p_cert bigint, p_ok boolean)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; c private.sick_certs; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  select * into c from private.sick_certs where id = p_cert and uploaded_by = a.driver_id;
  if not found then return; end if;
  if not p_ok then delete from private.sick_certs where id = c.id; return; end if;
  update private.sick_certs set uploaded = true where id = c.id;
  select * into r from private.sick_reports where id = c.report_id;
  perform private.sjuk_push_bosses(a.driver_id, '📄 Läkarintyg uppladdat',
    coalesce(private.bil_driver_name(r.driver_id), r.driver_id) || ' – sjukperioden från ' || private.sjuk_fmt_date(r.start_date) || '.', 'sjuk-' || r.id);
  perform private.sjuk_push_driver(r.driver_id, a.driver_id, '📄 Läkarintyg uppladdat',
    'Ett intyg lades till på din sjukperiod från ' || private.sjuk_fmt_date(r.start_date) || '.', 'sjuk-' || r.id);
  perform private.log(a.driver_id, a.category, 'bil_sjuk_cert', r.driver_id, jsonb_build_object('id', r.id), a.via_master);
end $$;

create or replace function public.sjuk_svc_cert_list(p_token text, p_report bigint)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  r := private.sjuk_report_for(a.driver_id, a.boss, p_report);
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'path', c.path, 'mime', c.mime, 'created_at', c.created_at,
      'mine', c.uploaded_by = a.driver_id) order by c.created_at)
    from private.sick_certs c where c.report_id = r.id and c.uploaded), '[]'::jsonb);
end $$;

-- Radera ett intyg: den som laddade upp, eller ägare/S admin.
create or replace function public.sjuk_svc_cert_delete(p_token text, p_cert bigint)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; c private.sick_certs; r private.sick_reports;
begin
  select * into a from private.sjuk_actor(p_token);
  select * into c from private.sick_certs where id = p_cert;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := private.sjuk_report_for(a.driver_id, a.boss, c.report_id);
  if c.uploaded_by <> a.driver_id and not a.boss then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from private.sick_certs where id = c.id;
  perform private.log(a.driver_id, a.category, 'bil_sjuk_cert_delete', r.driver_id, jsonb_build_object('id', r.id), a.via_master);
  return jsonb_build_object('path', c.path);
end $$;

-- Pushkön: hämtar och markerar som skickade (högst 50 åt gången, bara de senaste 24 h).
create or replace function public.sjuk_svc_take_pushes()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v jsonb;
begin
  update private.sjuk_push_queue set sent_at = now() where sent_at is null and created_at < now() - interval '24 hours';
  with t as (
    select id from private.sjuk_push_queue where sent_at is null order by id limit 50 for update skip locked
  ), u as (
    update private.sjuk_push_queue q set sent_at = now() from t where q.id = t.id
    returning q.id, q.recipient, q.title, q.body, q.tag
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'recipient', recipient, 'title', title, 'body', body, 'tag', tag) order by id), '[]'::jsonb)
    into v from u;
  delete from private.sjuk_push_queue where sent_at < now() - interval '7 days';
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.sjuk_svc_delete(text,bigint)', 'public.sjuk_svc_cert_begin(text,bigint,text)',
    'public.sjuk_svc_cert_finish(text,bigint,boolean)', 'public.sjuk_svc_cert_list(text,bigint)',
    'public.sjuk_svc_cert_delete(text,bigint)', 'public.sjuk_svc_take_pushes()'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $$;

-- ── Privat bucket för läkarintyg (bara service_role når den; inga policyer för andra) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sjuk-intyg', 'sjuk-intyg', false, 3145728, array['image/jpeg', 'application/pdf'])
on conflict (id) do nothing;
