-- 20261027b: Demokonton visar inte vems data det är.
-- Demo läser fortfarande den riktiga förarens siffror (private.demo_source()), men i allt som skickas till
-- en demosession byts förarens namn ut mot "Demoförare", förar-id mot "Demoförare", bilnummer mot
-- "Demobil 1, 2 …" (samma bil får alltid samma nummer), regnummer mot "Demoreg 1, 2 …" och åkerinamnet mot "Demoåkeriet".
-- Maskningen görs här på servern, så den syns inte heller i nätverkstrafiken (devtools).
-- Allt annat (inte demo) är helt oförändrat: private.demo_mask() returnerar indata direkt när sessionen inte är demo.
-- Bara tillägg: två nya hjälpfunktioner + nya versioner (create or replace) av befintliga funktioner. Inga tabeller ändras.
-- Ångra: kör supabase/migrations/undo/20261027b_demo_anonym_undo.sql (gamla funktionsdefinitionerna + drop av de nya).

-- Bilnummer (och regnummer) som demo kan se → "Demobil N", i fast ordning efter bilnummer.
create or replace function private.demo_car_map()
returns table(label text, alias text, kind text)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with l as (
    select upper(btrim(c.bilnummer)) l from public.cars c where coalesce(btrim(c.bilnummer), '') <> ''
    union select upper(btrim(s.taxi)) from private.day_summary s where s.forar = private.demo_source() and coalesce(btrim(s.taxi), '') <> ''
    union select upper(btrim(f.taxi)) from private.shift_fact f where f.forar = private.demo_source() and coalesce(btrim(f.taxi), '') <> ''
  ), l2 as (select l.l from l where l.l ~ '[A-Z]' and length(l.l) >= 2)   -- bara riktiga bilnummer, aldrig rena siffror
  , n as (select count(*) c from l2)
  select l.l, case when n.c = 1 then 'Demobil' else 'Demobil ' || row_number() over (order by length(l.l), l.l) end, 'car'
    from l2 l, n
  union all
  select r.r, 'Demoreg ' || row_number() over (order by r.r), 'reg'
    from (select distinct upper(btrim(c.regnr)) r from public.cars c where coalesce(btrim(c.regnr), '') ~ '[A-Za-z]' and length(btrim(c.regnr)) >= 4) r
$function$;
revoke all on function private.demo_car_map() from public, anon, authenticated;

-- Byter ut allt som pekar ut den riktiga föraren i ett svar till en demosession. Inte demo: indata tillbaka orört.
create or replace function private.demo_mask(p jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare t text; t2 text; src public.drivers; m record; v_id text;
  esc constant text := '([.*+?^${}()|\[\]\\-])';
begin
  if p is null or not private.is_demo() then return p; end if;
  v_id := private.demo_source();
  select * into src from public.drivers where id = v_id;
  t := p::text;
  -- förar-id som hel textvärde ("710022" → "Demoförare")
  t := replace(t, '"' || v_id || '"', '"Demoförare"');
  -- namn (helt namn först, sedan för- och efternamn var för sig), var som helst i texten
  if nullif(btrim(coalesce(src.first_name, '')), '') is not null and nullif(btrim(coalesce(src.last_name, '')), '') is not null then
    t := regexp_replace(t, '\m' || regexp_replace(btrim(src.first_name), esc, '\\\1', 'g') || '\s+' || regexp_replace(btrim(src.last_name), esc, '\\\1', 'g') || '\M', 'Demoförare', 'gi');
  end if;
  if length(btrim(coalesce(src.first_name, ''))) >= 2 then
    t := regexp_replace(t, '\m' || regexp_replace(btrim(src.first_name), esc, '\\\1', 'g') || '\M', 'Demoförare', 'gi');
  end if;
  if length(btrim(coalesce(src.last_name, ''))) >= 2 then
    t := regexp_replace(t, '\m' || regexp_replace(btrim(src.last_name), esc, '\\\1', 'g') || '\M', 'Demoförare', 'gi');
  end if;
  if nullif(btrim(coalesce(src.email, '')), '') is not null then
    t := replace(t, btrim(src.email), 'demo@example.com');
  end if;
  -- bilnummer och regnummer
  for m in select * from private.demo_car_map() loop
    t := regexp_replace(t, '\m' || regexp_replace(m.label, esc, '\\\1', 'g') || '\M', m.alias, 'gi');
  end loop;
  -- åkerinamn (bara som helt textvärde)
  for m in select c.name from public.companies c where coalesce(btrim(c.name), '') <> '' loop
    t := replace(t, to_jsonb(m.name)::text, '"Demoåkeriet"');
  end loop;
  -- förar-id inne i text (t.ex. "lt:123|<id>|…"); blir svaret ogiltigt tas det steget bort
  t2 := regexp_replace(t, '(?<![0-9])' || regexp_replace(v_id, esc, '\\\1', 'g') || '(?![0-9])', 'Demoförare', 'g');
  begin
    return t2::jsonb;
  exception when others then
    begin
      return t::jsonb;
    exception when others then
      return null;   -- hellre tomt än läcka
    end;
  end;
end $function$;
revoke all on function private.demo_mask(jsonb) from public, anon, authenticated;

create or replace function private.demo_mask(p json)
returns json
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$ select private.demo_mask(p::jsonb)::json $function$;
revoke all on function private.demo_mask(json) from public, anon, authenticated;

-- Demo-alias: den riktiga föraren heter alltid "Demoförare" (övriga förare fortfarande "Förare N").
CREATE OR REPLACE FUNCTION private.demo_alias(p_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when p_id = private.demo_source() then 'Demoförare'
              else 'Förare ' || coalesce((select count(*) from public.drivers d where d.id <= p_id), 0)::text end
$function$;


-- get_me / get_my_profile i demo: id och namn byts ut (demo_first_name/demo_last_name är fortfarande demokontots eget namn).
CREATE OR REPLACE FUNCTION public.get_me(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; d public.drivers; dm private.demo_accounts; me public.drivers;
begin
  select * into a from private.session_actor(p_token);
  select * into d from public.drivers where id = a.driver_id;
  if private.is_demo() then
    select * into dm from private.demo_accounts where driver_id = current_setting('taxi.demo', true);
    select * into me from public.drivers where id = dm.driver_id;
    -- 20261027b: demo ser aldrig förarens riktiga id eller namn
    return json_build_object('id', 'Demoförare', 'category', a.category, 'via_master', false,
      'first_name', 'Demoförare', 'last_name', '', 'needs_profile', false, 'must_change_password', false,
      'demo', true, 'demo_id', dm.driver_id, 'demo_role', dm.role, 'demo_expires_at', dm.expires_at,
      'demo_first_name', me.first_name, 'demo_last_name', me.last_name);
  end if;
  return json_build_object('id', a.driver_id, 'category', a.category, 'via_master', a.via_master,
                           'first_name', d.first_name, 'last_name', d.last_name,
                           'needs_profile', d.id is not null and cardinality(private.profile_missing(d)) > 0,
                           -- huvudlösenords-inloggning tvingas aldrig byta förarens lösenord
                           'must_change_password', coalesce(d.must_change_password, false) and not a.via_master);
end $function$;


CREATE OR REPLACE FUNCTION public.get_my_profile(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; d public.drivers;
begin
  select * into a from private.session_actor(p_token);
  select * into d from public.drivers where id = a.driver_id;
  if d.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if private.is_demo() then
    return json_build_object('id', 'Demoförare', 'via_master', true, 'demo', true, 'first_name', 'Demoförare', 'last_name', null,
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
end $function$;


-- Svar som kan innehålla förar-id, namn eller bilnummer går genom private.demo_mask() (gör inget utanför demo).
CREATE OR REPLACE FUNCTION public.get_trip_data(p_token text, p_dataset text DEFAULT 'current'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET work_mem TO '32MB'
AS $function$
declare a record; v_cat text; v_meta jsonb; v_def text; r json;
  -- Ägaren: allt. private.company_view_roles() (tillfälligt S admin): allt utan förar-id. Övriga (även admin): bara egen data.
begin
  select * into a from private.session_actor(p_token);
  v_cat := coalesce(a.category, '');
  select meta into v_meta from public.trip_datasets where name = p_dataset;
  if not found then return null; end if;
  if v_cat = 'agare' then
    select (v_meta || jsonb_build_object(
      'trips', coalesce((select jsonb_agg(t.data order by t.ord) from public.trips t where t.dataset = p_dataset), '[]'::jsonb),
      'shifts', coalesce((select jsonb_agg(s.data order by s.ord) from public.shifts s where s.dataset = p_dataset), '[]'::jsonb)
    ))::json into r;
  elsif v_cat = any (private.company_view_roles()) then
    v_def := v_meta->>'forar';
    with sh as materialized (
      select s.ord, s.data, coalesce(s.forar, s.data->>'forar', v_def) f,
             private.shift_ts(s.data->>'start') st, private.shift_ts(s.data->>'slut') en
        from public.shifts s where s.dataset = p_dataset
    ), tr as materialized (
      select t.ord, t.data, coalesce(t.forar, t.data->>'forar', v_def) f,
             case when t.data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$' and t.data->>'starttid' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                  then (t.data->>'startdatum' || ' ' || (t.data->>'starttid'))::timestamp end ts
        from public.trips t where t.dataset = p_dataset
    ), shd as ( -- korpassfix 2026-10-25: passet per kalenderdag, så att joinen går på förare+dag (snabb) i stället för bara förare
      select sh.ord, sh.f, sh.st, sh.en, d::date d
        from sh, generate_series(sh.st::date, sh.en::date, interval '1 day') d
       where sh.st is not null and sh.en is not null and sh.en >= sh.st and sh.en < sh.st + interval '7 days'
    ), m as (   -- första passet (lägst ord) som resan ligger i; join per förare i stället för delfråga per resa
      select distinct on (tr.ord) tr.ord, 'p' || shd.ord k
        from tr join shd on shd.f = tr.f and shd.d = tr.ts::date and tr.ts between shd.st and shd.en
       where tr.ts is not null
       order by tr.ord, shd.ord
    ), trk as (
      select tr.ord, tr.data, tr.f, m.k from tr left join m on m.ord = tr.ord
    )
    select ((v_meta - 'forar') || jsonb_build_object(
      'trips', coalesce((select jsonb_agg(case when trk.f = a.driver_id then trk.data || jsonb_build_object('forar', trk.f)
                                               else trk.data || jsonb_build_object('forar', coalesce(trk.k, 'n' || trk.ord)) end
                                          order by trk.ord) from trk), '[]'::jsonb),
      'shifts', coalesce((select jsonb_agg(case when sh.f = a.driver_id then sh.data || jsonb_build_object('forar', sh.f)
                                                else sh.data || jsonb_build_object('forar', 'p' || sh.ord) end
                                           order by sh.ord) from sh), '[]'::jsonb)
    ))::json into r;
  else
    select (v_meta || jsonb_build_object(
      'trips', coalesce((select jsonb_agg(t.data order by t.ord) from public.trips t
                         where t.dataset = p_dataset and t.forar = a.driver_id), '[]'::jsonb),
      'shifts', coalesce((select jsonb_agg(s.data order by s.ord) from public.shifts s
                         where s.dataset = p_dataset and s.forar = a.driver_id), '[]'::jsonb)
    ))::json into r;
  end if;
  return private.demo_mask(r);   -- 20261027b: demo får namn, förar-id och bilnummer utbytta
end $function$;


CREATE OR REPLACE FUNCTION public.get_trip_archive(p_token text, p_year integer, p_month integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET work_mem TO '32MB'
AS $function$
declare a record; v_cat text; v_all boolean; v_anon boolean; v_lo date; v_hi date; r json;
begin
  select * into a from private.session_actor(p_token);
  v_cat := coalesce(a.category, '');
  if p_year is null or p_year < 2000 or p_year > 2100 then raise exception 'bad_year' using errcode = '22023'; end if;
  if p_month is not null and (p_month < 1 or p_month > 12) then raise exception 'bad_month' using errcode = '22023'; end if;
  v_anon := v_cat <> 'agare' and v_cat = any (private.company_view_roles());
  v_all := v_cat = 'agare' or v_anon;
  v_lo := make_date(p_year, coalesce(p_month, 1), 1);
  v_hi := case when p_month is null then make_date(p_year + 1, 1, 1) else (v_lo + interval '1 month')::date end;

  with sh as materialized (   -- pass i biten + 7 dagar före (bara för att koppla resor, skickas inte)
    select s.ord, s.data, coalesce(s.forar, s.data->>'forar') f,
           private.shift_ts(s.data->>'start') st, private.shift_ts(s.data->>'slut') en,
           (s.start >= to_char(v_lo, 'YYYYMMDD') and s.start < to_char(v_hi, 'YYYYMMDD')) inp
      from private.arkiv_shifts s
     where s.dataset = 'arkiv' and s.start >= to_char(v_lo - 7, 'YYYYMMDD') and s.start < to_char(v_hi, 'YYYYMMDD')
       and (v_all or s.forar = a.driver_id)
  ), tr as materialized (      -- resor i biten + 7 dagar efter (pass som går över månadsskiftet)
    select t.ord, t.data, coalesce(t.forar, t.data->>'forar') f, t.startdatum sd,
           case when t.data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$' and t.data->>'starttid' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                then (t.data->>'startdatum' || ' ' || (t.data->>'starttid'))::timestamp end ts
      from private.arkiv_trips t
     where t.dataset = 'arkiv' and t.startdatum >= to_char(v_lo, 'YYYY-MM-DD') and t.startdatum < to_char(v_hi + 7, 'YYYY-MM-DD')
       and (v_all or t.forar = a.driver_id)
  ), shd as (
    select sh.ord, sh.f, sh.st, sh.en, sh.inp, d::date d
      from sh, generate_series(sh.st::date, sh.en::date, interval '1 day') d
     where sh.st is not null and sh.en is not null and sh.en >= sh.st and sh.en < sh.st + interval '7 days'
  ), m as (   -- första passet (lägst ord) som resan ligger i, som i get_trip_data
    select distinct on (tr.ord) tr.ord, shd.ord sord, shd.inp
      from tr join shd on shd.f = tr.f and shd.d = tr.ts::date and tr.ts between shd.st and shd.en
     where tr.ts is not null
     order by tr.ord, shd.ord
  ), trk as (
    select tr.ord, tr.data, tr.f, m.sord
      from tr left join m on m.ord = tr.ord
     where (m.ord is not null and m.inp)
        or (m.ord is null and tr.sd >= to_char(v_lo, 'YYYY-MM-DD') and tr.sd < to_char(v_hi, 'YYYY-MM-DD'))
  )
  select json_build_object(
    'arkiv', true, 'year', p_year, 'month', p_month,
    'arkiv_updated', (select updated_at from private.arkiv_datasets where name = 'arkiv'),
    'trips', coalesce((select jsonb_agg(case when not v_anon then trk.data
                                             when trk.f = a.driver_id then trk.data || jsonb_build_object('forar', trk.f)
                                             else trk.data || jsonb_build_object('forar', coalesce('ap' || trk.sord, 'an' || trk.ord)) end
                                        order by trk.ord) from trk), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(case when not v_anon then sh.data
                                              when sh.f = a.driver_id then sh.data || jsonb_build_object('forar', sh.f)
                                              else sh.data || jsonb_build_object('forar', 'ap' || sh.ord) end
                                         order by sh.ord) from sh where sh.inp), '[]'::jsonb)
  ) into r;
  return private.demo_mask(r);   -- 20261027b: demo får namn, förar-id och bilnummer utbytta
end $function$;


CREATE OR REPLACE FUNCTION public.get_company_period(p_token text, p_from date, p_to date, p_detail boolean DEFAULT true, p_group text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET work_mem TO '32MB'
AS $function$
declare a record; v_cat text; v_scope text;
begin
  select * into a from private.session_actor(p_token);
  if p_from is null or p_to is null or p_to < p_from or p_from < date '2000-01-01' or p_to > date '2100-12-31'
     or p_to - p_from > 400 then
    raise exception 'bad_range' using errcode = '22023';
  end if;
  if p_group is not null and p_group not in ('day', 'month') then
    raise exception 'bad_group' using errcode = '22023';
  end if;
  v_cat := coalesce(a.category, '');
  v_scope := case when v_cat = 'agare' then 'all'
                  when v_cat = any (private.company_view_roles()) then 'anon'
                  else 'own' end;
  -- Resorna skickas med direkt bara för korta perioder (≤ 62 dagar); annars hämtas de per pass.
  return private.demo_mask(private.company_period('default', p_from, p_to, v_scope, a.driver_id,
                                coalesce(p_detail, true) and p_to - p_from <= 62, p_group)::json);
end $function$;


CREATE OR REPLACE FUNCTION public.get_bil(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; v_own boolean; cc record;
begin
  select * into a from private.bil_actor(p_token);
  v_own := a.is_admin;
  select * into cc from private.bil_current_car(a.driver_id, a.company_id);
  return private.demo_mask(json_build_object(
    'me', a.driver_id, 'is_admin', v_own, 'is_owner', v_own, 'can_approve_hours', a.category = any (private.workshop_roles()),
    'unread', (select count(*) from public.event_notices n where n.driver_id = a.driver_id and n.read_at is null and n.kind like 'bil%'),
    'cars', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'bilnummer', c.bilnummer, 'modell', c.modell,
                 'km', o.km, 'km_at', o.created_at,
                 'open_faults', (select count(*) from public.car_issues i where i.car_id = c.id and i.kind = 'fault' and i.status <> 'klar'
                                   and (v_own or i.reported_by = a.driver_id)),
                 'blocking', exists (select 1 from public.car_issues i where i.car_id = c.id and i.kind = 'fault' and i.status <> 'klar' and i.blocking
                                   and (v_own or i.reported_by = a.driver_id)),
                 'maint_level', case when v_own then coalesce((select max(private.bil_maint_level(m, o.km)) from public.car_maintenance m
                                   where m.car_id = c.id and m.status = 'plan'), 0) else 0 end)
               order by c.bilnummer)
          from public.cars c
          left join lateral (select km, created_at from public.car_odometer x where x.car_id = c.id order by created_at desc, id desc limit 1) o on true
         where coalesce(c.company_id, 'default') = a.company_id), '[]'::jsonb),
    -- listorna: ägaren ser allt, föraren bara sina egna (uppgifter visas separat under "Uppgifter")
    'issues', coalesce((select jsonb_agg(private.bil_issue_json(i, a.driver_id, v_own, v_own)
                 order by (i.status <> 'klar') desc, (i.status <> 'klar' and i.blocking) desc, (i.status = 'ny') desc, i.created_at desc)
          from public.car_issues i
         where i.company_id = a.company_id and (v_own or i.reported_by = a.driver_id)
           and (i.status <> 'klar' or i.closed_at > now() - case when v_own then interval '60 days' else interval '14 days' end)), '[]'::jsonb),
    'maint', coalesce((select jsonb_agg(private.bil_maint_json(m, private.bil_car_km(m.car_id), v_own)
                   || jsonb_build_object('mine', m.suggested_by is not distinct from a.driver_id and m.suggested_by is not null)
                 order by (m.status = 'klar'), m.due_date nulls last, m.id)
          from public.car_maintenance m
         where m.company_id = a.company_id and (v_own or (m.suggested_by = a.driver_id))
           and (m.status <> 'klar' or m.done_date > (now() at time zone 'Europe/Stockholm')::date - case when v_own then 365 else 30 end)), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(private.bil_task_json(t, a.driver_id, v_own)
                 order by (t.status = 'klar'), t.booked_at nulls last, t.created_at desc)
          from public.car_tasks t
         where t.company_id = a.company_id and (v_own or t.assigned_to = a.driver_id)
           and (t.status <> 'klar' or t.done_at > now() - case when v_own then interval '60 days' else interval '30 days' end)), '[]'::jsonb),
    'drivers', case when v_own then coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', coalesce(private.bil_driver_name(d.id), d.id))
                 order by coalesce(private.bil_driver_name(d.id), d.id))
          from public.drivers d where coalesce(d.activated, false) and private.norm_cat(d.category) <> 'avslutad'
           and private.actor_company(d.id) = a.company_id), '[]'::jsonb) end,
    'prefs', case when v_own then coalesce((select prefs from public.bil_notice_prefs where driver_id = a.driver_id), '{}'::jsonb) end,
    'has_email', case when v_own then (select nullif(btrim(coalesce(email, '')), '') is not null from public.drivers where id = a.driver_id) end,
    -- bilen jag kör nu (senaste resekvitto med taxinummer, annars senaste pass) – bara för den inloggade föraren
    'current_car_id', cc.car_id, 'current_car_label', cc.label, 'current_car_source', cc.source, 'current_car_at', cc.at));
end $function$;


CREATE OR REPLACE FUNCTION public.get_my_workshop(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; v_rate numeric := private.workshop_rate(); v_m0 timestamptz;
begin
  select * into a from private.session_actor(p_token);
  if a.category is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_m0 := date_trunc('month', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm';
  return private.demo_mask(json_build_object(
    'rate', v_rate,
    'can_approve', a.category = any (private.workshop_roles()),
    'cars', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'bilnummer', c.bilnummer, 'modell', c.modell) order by c.bilnummer) from public.cars c), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(private.wh_json(w, v_rate) order by w.start_at desc)
                           from (select * from public.workshop_hours where driver_id = a.driver_id order by start_at desc limit 300) w), '[]'::jsonb),
    'summary', (select jsonb_build_object(
        'pending_n', count(*) filter (where status = 'pending'),
        'pending_min', coalesce(sum(private.wh_minutes(w)) filter (where status = 'pending'), 0),
        'approved_month_min', coalesce(sum(private.wh_minutes(w)) filter (where status = 'approved' and start_at >= v_m0), 0),
        'approved_month_kr', coalesce(round(sum(private.wh_minutes(w) / 60.0 * w.rate) filter (where status = 'approved' and start_at >= v_m0)), 0),
        'rejected_recent', count(*) filter (where status = 'rejected' and decided_at > now() - interval '7 days'))
      from public.workshop_hours w where w.driver_id = a.driver_id)));
end $function$;


CREATE OR REPLACE FUNCTION public.get_events(p_token text, p_from date, p_to date, p_city text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; c public.cities; t0 timestamptz; t1 timestamptz;
begin
  select * into a from private.kal_actor(p_token);
  c := private.kal_city(a.company_id, p_city);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  t0 := p_from::timestamp at time zone c.timezone;
  t1 := (p_to + 1)::timestamp at time zone c.timezone;
  return private.demo_mask(jsonb_build_object(
    'city', jsonb_build_object('slug', c.slug, 'name', c.name, 'country', c.country, 'timezone', c.timezone),
    'cities', (select jsonb_agg(jsonb_build_object('slug', ci.slug, 'name', ci.name, 'timezone', ci.timezone) order by ci.name)
                 from public.cities ci join public.company_cities cc on cc.city = ci.slug and cc.company_id = a.company_id
                where ci.active),
    'can_approve', a.is_admin,
    'me', a.driver_id,
    'unread_notices', (select count(*) from public.event_notices n where n.driver_id = a.driver_id and n.read_at is null and n.kind not like 'bil%' and n.kind not like 'forum%'),
    'venues', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name) order by v.name), '[]')
                 from public.venues v where v.city = c.slug),
    'events', coalesce((
      select jsonb_agg(private.kal_event_json(e, a.driver_id, a.is_admin, a.company_id) order by e.starts_at, e.id)
        from public.events e
       where e.city = c.slug
         and e.starts_at < t1 and coalesce(e.ends_at, e.starts_at) >= t0
         and private.kal_visible(e, a.company_id, a.driver_id, a.is_admin)
         -- skrapat evenemang som forsvunnit fran kallan i 3 dygn = troligen installt
         and (e.company_id is not null or e.last_seen_at > now() - interval '3 days')
    ), '[]')));
end $function$;


CREATE OR REPLACE FUNCTION public.get_event_comments(p_token text, p_event_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; e public.events; v_demo boolean;
begin
  select * into a from private.kal_actor(p_token);
  v_demo := private.is_demo();
  select * into e from public.events where id = p_event_id;
  if not found or not private.kal_visible(e, a.company_id, a.driver_id, a.is_admin) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  return private.demo_mask(coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at,
             'author', case when v_demo then private.demo_alias(c.driver_id) else
                       coalesce(nullif(trim(coalesce(d.first_name,'') || ' ' || left(coalesce(d.last_name,''),1)), ''), d.name, c.driver_id) end,
             'mine', c.driver_id = a.driver_id, 'can_delete', not v_demo and (c.driver_id = a.driver_id or a.is_admin))
             order by c.created_at)
      from public.event_comments c left join public.drivers d on d.id::text = c.driver_id
     where c.event_id = p_event_id and c.company_id = a.company_id and c.deleted_at is null), '[]'));
end $function$;


CREATE OR REPLACE FUNCTION public.forum_list(p_token text, p_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; v_cat text := nullif(btrim(coalesce(p_category, '')), ''); v_sec text;
begin
  select * into a from private.forum_actor(p_token);
  if v_cat like 'akeri:%' then
    v_sec := substr(v_cat, 7); v_cat := 'akeri';
    if v_sec <> a.company_id and not a.is_sadmin then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif v_cat = 'akeri' then v_sec := a.company_id;
  elsif v_cat is not null and v_cat not in ('allmant','hjalp','forslag','buggar') then
    raise exception 'bad_category' using errcode = '22023';
  end if;
  return private.demo_mask(jsonb_build_object(
    'is_admin', a.is_admin, 'is_sadmin', a.is_sadmin, 'can_write', not coalesce(a.via_master, false),
    'has_name', private.forum_has_name(a.driver_id), 'my_name', private.forum_name(a.driver_id),
    'company', jsonb_build_object('id', a.company_id, 'name', private.forum_co_name(a.company_id), 'can_rename', a.is_admin and not coalesce(a.via_master, false)),
    'companies', case when a.is_sadmin then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                    from public.companies c where c.id <> a.company_id), '[]') end,
    'unread', (select count(*) from public.event_notices n where n.driver_id = a.driver_id and n.read_at is null and n.kind like 'forum%'),
    'posts', coalesce((select jsonb_agg(private.forum_post_json(p, a.driver_id, a.company_id, a.is_admin, a.is_sadmin, false) order by p.last_activity_at desc, p.id desc)
       from (select * from public.forum_posts p
              where (v_cat is null or p.category = v_cat) and (v_sec is null or p.company_id = v_sec)
                and private.forum_sees(p.category, p.company_id, a.company_id, a.is_sadmin)
                and (not p.hidden or p.author_id = a.driver_id or private.forum_mods(p.company_id, a.company_id, a.is_admin, a.is_sadmin))
              order by p.last_activity_at desc, p.id desc limit 100) p), '[]')));
end $function$;


CREATE OR REPLACE FUNCTION public.forum_get(p_token text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; p public.forum_posts;
begin
  select * into a from private.forum_actor(p_token);
  p := private.forum_get_post(p_id, a.driver_id, a.company_id, a.is_admin, a.is_sadmin);
  update public.event_notices set read_at = now() where driver_id = a.driver_id and forum_post_id = p_id and read_at is null;
  return private.demo_mask(private.forum_post_json(p, a.driver_id, a.company_id, a.is_admin, a.is_sadmin, true) || jsonb_build_object(
    'is_admin', a.is_admin, 'mod_ok', not coalesce(a.via_master, false),
    'can_write', not coalesce(a.via_master, false) and private.forum_writes(p.category, p.company_id, a.company_id),
    'has_name', private.forum_has_name(a.driver_id), 'my_name', private.forum_name(a.driver_id),
    'comment_list', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'author', private.forum_name(c.author_id), 'ak', private.forum_avatar(c.author_id),
        'co', case when p.category <> 'akeri' then private.forum_co_name(c.company_id) end,
        'can_mod', private.forum_mods(c.company_id, a.company_id, a.is_admin, a.is_sadmin),
        'mine', c.author_id = a.driver_id, 'body', c.body, 'created_at', c.created_at, 'edited', c.edited_at is not null, 'hidden', c.hidden) order by c.created_at, c.id)
       from public.forum_comments c where c.post_id = p.id
        and (not c.hidden or c.author_id = a.driver_id or private.forum_mods(c.company_id, a.company_id, a.is_admin, a.is_sadmin))), '[]')));
end $function$;


