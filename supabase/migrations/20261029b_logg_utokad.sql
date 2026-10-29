-- 20261029b: Utökad logg (t604u, Christians tillägg).
-- Loggar nästan allt som händer: utloggning, forum (inlägg, kommentarer, ändringar, borttag, dölj, status),
-- forumregler, åkerinamn, kalender (förslag, beslut, kommentarer, påminnelser), pushnotiser på/av,
-- bevakningar (flyg/tåg, prognos), profilbild och dataimport.
-- Loggar ALDRIG lösenord, nycklar, personnummer, kontaktuppgifter eller texten i inlägg och kommentarer.
-- Bara vad som hände, vem, mot vad (id) och vilka fält som ändrades. Forumrubriker (redan synliga för förarna) kortas till 60 tecken.
--
-- Hur: session_actor sparar vem som är inloggad i en variabel som bara gäller transaktionen (taxi.actor).
-- AFTER-triggrar på tabellerna skriver en loggrad bara när en inloggad person gjort ändringen
-- (system och cron loggas inte, utom import av körningar och pushnotiser som slutat fungera).
-- Ny läsfunktion admin_log_page med filter och "Visa fler". admin_get_log finns kvar oförändrad.
-- Två nya index. Funktion för att rensa gammal logg (private.log_prune), inte schemalagd.
-- Ingen tabell ändras. Kräver 20261029a. Ångra: undo/20261029b_logg_utokad_undo.sql

CREATE OR REPLACE FUNCTION private.session_actor(p_token text, OUT driver_id text, OUT category text, OUT via_master boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- 20261029b: vem som gör anropet, för loggtriggrarna (gäller bara den här transaktionen)
  perform set_config('taxi.actor', driver_id, true);
  perform set_config('taxi.actor_role', coalesce(category, ''), true);
  perform set_config('taxi.via_master', case when via_master then 'on' else 'off' end, true);
end $function$;

-- Loggrad från en tabelltrigger. Vem = den inloggade (taxi.actor). Aldrig i demo-läget.
create or replace function private.audit_row()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor text := nullif(current_setting('taxi.actor', true), '');
  v_role text := nullif(current_setting('taxi.actor_role', true), '');
  v_master boolean := coalesce(current_setting('taxi.via_master', true), '') = 'on';
  v_t text := tg_table_name;
  v_op text := tg_op;
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  v_fields text[];
begin
  if private.is_demo() then return null; end if;

  -- Import av körningar: loggas även utan inloggad person (system), men bara när antalet ändrats
  if v_t = 'trip_datasets' then
    if v_op = 'DELETE' then
      perform private.log(v_actor, coalesce(v_role, 'system'), 'data_delete', null, jsonb_build_object('dataset', o->>'name'), v_master);
    elsif v_op = 'INSERT' or (o->>'trip_count') is distinct from (n->>'trip_count') or (o->>'shift_count') is distinct from (n->>'shift_count') then
      perform private.log(v_actor, coalesce(v_role, 'system'), 'data_import', null,
        jsonb_build_object('dataset', n->>'name', 'trips', (n->>'trip_count')::int, 'shifts', (n->>'shift_count')::int,
          'trips_before', (o->>'trip_count')::int, 'shifts_before', (o->>'shift_count')::int), v_master);
    end if;
    return null;
  end if;

  -- Pushnotis som slutat fungera tas bort av systemet
  if v_t = 'push_subscriptions' and v_actor is null and v_op = 'DELETE' then
    perform private.log(null, 'system', 'push_expired', o->>'driver_id', '{}'::jsonb, false);
    return null;
  end if;

  if v_actor is null then return null; end if;   -- system, cron, import: loggas inte

  if v_t = 'forum_posts' then
    if v_op = 'INSERT' then
      perform private.log(v_actor, v_role, 'forum_post_add', n->>'author_id',
        jsonb_build_object('post', (n->>'id')::bigint, 'cat', n->>'category', 'title', left(n->>'title', 60)), v_master);
    elsif v_op = 'DELETE' then
      perform private.log(v_actor, v_role, 'forum_post_delete', o->>'author_id',
        jsonb_build_object('post', (o->>'id')::bigint, 'cat', o->>'category', 'title', left(o->>'title', 60)), v_master);
    else
      if (o->>'hidden') is distinct from (n->>'hidden') then
        perform private.log(v_actor, v_role, case when (n->>'hidden')::boolean then 'forum_post_hide' else 'forum_post_unhide' end,
          n->>'author_id', jsonb_build_object('post', (n->>'id')::bigint, 'title', left(n->>'title', 60)), v_master);
      end if;
      if (o->>'status') is distinct from (n->>'status') then
        perform private.log(v_actor, v_role, 'forum_status', n->>'author_id',
          jsonb_build_object('post', (n->>'id')::bigint, 'title', left(n->>'title', 60), 'from', o->>'status', 'to', n->>'status'), v_master);
      end if;
      select coalesce(array_agg(f), '{}') into v_fields from unnest(array['title','body','category']) f
       where (o->>f) is distinct from (n->>f);
      if cardinality(v_fields) > 0 then
        perform private.log(v_actor, v_role, 'forum_post_edit', n->>'author_id',
          jsonb_build_object('post', (n->>'id')::bigint, 'title', left(n->>'title', 60), 'fields', to_jsonb(v_fields)), v_master);
      end if;
    end if;

  elsif v_t = 'forum_comments' then
    if v_op = 'INSERT' then
      perform private.log(v_actor, v_role, 'forum_comment_add', n->>'author_id',
        jsonb_build_object('post', (n->>'post_id')::bigint, 'comment', (n->>'id')::bigint), v_master);
    elsif v_op = 'DELETE' then
      -- inte när hela inlägget tas bort (då loggas forum_post_delete)
      if exists (select 1 from public.forum_posts p where p.id = (o->>'post_id')::bigint) then
        perform private.log(v_actor, v_role, 'forum_comment_delete', o->>'author_id',
          jsonb_build_object('post', (o->>'post_id')::bigint, 'comment', (o->>'id')::bigint), v_master);
      end if;
    else
      if (o->>'hidden') is distinct from (n->>'hidden') then
        perform private.log(v_actor, v_role, case when (n->>'hidden')::boolean then 'forum_comment_hide' else 'forum_comment_unhide' end,
          n->>'author_id', jsonb_build_object('post', (n->>'post_id')::bigint, 'comment', (n->>'id')::bigint), v_master);
      end if;
      if (o->>'body') is distinct from (n->>'body') then
        perform private.log(v_actor, v_role, 'forum_comment_edit', n->>'author_id',
          jsonb_build_object('post', (n->>'post_id')::bigint, 'comment', (n->>'id')::bigint), v_master);
      end if;
    end if;

  elsif v_t = 'forum_rules_accept' then
    if v_op <> 'DELETE' and (o is null or (o->>'rules_version') is distinct from (n->>'rules_version')) then
      perform private.log(v_actor, v_role, 'forum_rules', n->>'driver_id', jsonb_build_object('version', (n->>'rules_version')::int), v_master);
    end if;

  elsif v_t = 'companies' then
    if v_op = 'UPDATE' and (o->>'name') is distinct from (n->>'name') then
      perform private.log(v_actor, v_role, 'company_rename', null, jsonb_build_object('company', n->>'id', 'name', n->>'name'), v_master);
    end if;

  elsif v_t = 'events' then
    if v_op = 'INSERT' then
      perform private.log(v_actor, v_role, case when n->>'status' = 'pending' then 'event_suggest' else 'event_add' end, null,
        jsonb_build_object('event', (n->>'id')::bigint, 'title', left(n->>'title', 60)), v_master);
    elsif v_op = 'DELETE' then
      perform private.log(v_actor, v_role, 'event_delete', o->>'created_by',
        jsonb_build_object('event', (o->>'id')::bigint, 'title', left(o->>'title', 60)), v_master);
    else
      if (o->>'status') is distinct from (n->>'status') then
        perform private.log(v_actor, v_role, 'event_decide', n->>'created_by',
          jsonb_build_object('event', (n->>'id')::bigint, 'title', left(n->>'title', 60), 'to', n->>'status'), v_master);
      end if;
      select coalesce(array_agg(f), '{}') into v_fields
        from unnest(array['title','category','venue_id','venue_name','starts_at','ends_at','comment','address','url']) f
       where (o->>f) is distinct from (n->>f);
      if cardinality(v_fields) > 0 then
        perform private.log(v_actor, v_role, 'event_edit', n->>'created_by',
          jsonb_build_object('event', (n->>'id')::bigint, 'title', left(n->>'title', 60), 'fields', to_jsonb(v_fields)), v_master);
      end if;
    end if;

  elsif v_t = 'event_comments' then
    if v_op = 'INSERT' then
      perform private.log(v_actor, v_role, 'event_comment_add', n->>'driver_id',
        jsonb_build_object('event', (n->>'event_id')::bigint, 'comment', (n->>'id')::bigint), v_master);
    elsif v_op = 'DELETE' or ((o->>'deleted_at') is null and (n->>'deleted_at') is not null) then
      perform private.log(v_actor, v_role, 'event_comment_delete', r->>'driver_id',
        jsonb_build_object('event', (r->>'event_id')::bigint, 'comment', (r->>'id')::bigint), v_master);
    end if;

  elsif v_t = 'event_subscriptions' then
    if v_op in ('INSERT','DELETE') then
      perform private.log(v_actor, v_role, case when v_op = 'INSERT' then 'event_remind_on' else 'event_remind_off' end, r->>'driver_id',
        jsonb_build_object('event', (r->>'event_id')::bigint, 'kind', r->>'remind_kind', 'min', (r->>'offset_min')::int), v_master);
    end if;

  elsif v_t = 'push_subscriptions' then
    if v_op = 'INSERT' or (v_op = 'UPDATE' and (o->>'driver_id') is distinct from (n->>'driver_id')) then
      perform private.log(v_actor, v_role, 'push_on', n->>'driver_id', '{}'::jsonb, v_master);
    elsif v_op = 'DELETE' then
      perform private.log(v_actor, v_role, 'push_off', o->>'driver_id', '{}'::jsonb, v_master);
    end if;

  elsif v_t = 'arrival_watches' then
    if v_op in ('INSERT','DELETE') then
      perform private.log(v_actor, v_role, case when v_op = 'INSERT' then 'watch_on' else 'watch_off' end, r->>'driver_id',
        jsonb_build_object('kind', r->>'kind', 'ident', r->>'ident'), v_master);
    end if;

  elsif v_t = 'prognos_watches' then
    if v_op in ('INSERT','DELETE') then
      perform private.log(v_actor, v_role, case when v_op = 'INSERT' then 'prognos_watch_on' else 'prognos_watch_off' end, r->>'driver_id',
        jsonb_build_object('zone', r->>'zone_id', 'cat', r->>'category'), v_master);
    end if;

  elsif v_t = 'profile_photos' then
    if v_op = 'DELETE' then
      perform private.log(v_actor, v_role, 'photo_delete', o->>'driver_id', '{}'::jsonb, v_master);
    elsif v_op = 'INSERT' or (o->>'path') is distinct from (n->>'path') then
      perform private.log(v_actor, v_role, 'photo_set', n->>'driver_id', '{}'::jsonb, v_master);
    end if;
  end if;
  return null;
end $function$;

revoke all on function private.audit_row() from public, anon, authenticated;

create trigger zz_audit_log after insert or update or delete on public.forum_posts for each row execute function private.audit_row();
create trigger zz_audit_log after insert or update or delete on public.forum_comments for each row execute function private.audit_row();
create trigger zz_audit_log after insert or update on public.forum_rules_accept for each row execute function private.audit_row();
create trigger zz_audit_log after update of name on public.companies for each row execute function private.audit_row();
create trigger zz_audit_log after insert or update or delete on public.events for each row execute function private.audit_row();
create trigger zz_audit_log after insert or update of deleted_at or delete on public.event_comments for each row execute function private.audit_row();
create trigger zz_audit_log after insert or delete on public.event_subscriptions for each row execute function private.audit_row();
create trigger zz_audit_log after insert or update of driver_id or delete on public.push_subscriptions for each row execute function private.audit_row();
create trigger zz_audit_log after insert or delete on public.arrival_watches for each row execute function private.audit_row();
create trigger zz_audit_log after insert or delete on public.prognos_watches for each row execute function private.audit_row();
create trigger zz_audit_log after insert or update of path or delete on public.profile_photos for each row execute function private.audit_row();
create trigger zz_audit_log after insert or update or delete on public.trip_datasets for each row execute function private.audit_row();

-- Utloggning loggas
create or replace function public.logout(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare s private.sessions; v_cat text;
begin
  delete from private.sessions where token_hash = private.token_hash(p_token) returning * into s;
  if s.driver_id is not null and not exists (select 1 from private.demo_accounts d where d.driver_id = s.driver_id) then
    select private.norm_cat(category) into v_cat from public.drivers where id = s.driver_id;
    perform private.log(s.driver_id, v_cat, 'logout', s.driver_id, '{}'::jsonb, s.via_master);
  end if;
  return json_build_object('ok', true);
end $function$;

-- Index för filter och "visa fler"
create index if not exists activity_log_action_created_idx on public.activity_log (action, created_at desc);
create index if not exists activity_log_target_created_idx on public.activity_log (target_id, created_at desc);

-- Läs loggen med filter och sidor. p_hide = händelsetyper som ska döljas ('forum_*' = alla som börjar så).
-- p_before + p_before_id = hämta rader äldre än den sista som visas (för "Visa fler"). p_driver = bara rader där föraren är utförare eller berörd.
create or replace function public.admin_log_page(p_token text, p_limit integer default 200, p_before timestamptz default null,
                                                  p_before_id bigint default null, p_hide text[] default null, p_driver text default null)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare a record; v_all boolean; v_lim int := least(greatest(coalesce(p_limit, 200), 1), 500); v_rows json; v_n int;
  v_exact text[]; v_pref text[];
begin
  select * into a from private.require_admin(p_token);
  v_all := a.category = any (private.workshop_roles());
  select coalesce(array_agg(h) filter (where right(h, 1) <> '*'), '{}'),
         coalesce(array_agg(replace(left(h, -1), '_', '\_') || '%') filter (where right(h, 1) = '*'), '{}')
    into v_exact, v_pref
    from unnest(coalesce(p_hide, '{}')) h where coalesce(h, '') <> '';
  select json_agg(json_build_object('id', l.id, 'time', l.created_at, 'actor_id', l.actor_id, 'actor_role', l.actor_role,
      'action', l.action, 'target_id', l.target_id, 'details', l.details, 'via_master', l.via_master) order by l.created_at desc, l.id desc),
         count(*)
    into v_rows, v_n
    from (select * from public.activity_log x
           where (v_all or not (x.action like 'bil\_%' or x.action like 'workshop\_%'))
             and (p_before is null or (x.created_at, x.id) < (p_before, coalesce(p_before_id, 0)))
             and not (x.action = any (v_exact))
             and not (x.action like any (v_pref))
             and (p_driver is null or x.actor_id = p_driver or x.target_id = p_driver)
           order by created_at desc, id desc
           limit v_lim + 1) l;
  -- en extra rad hämtas bara för att veta om det finns fler
  return json_build_object('rows', coalesce((select json_agg(e) from (select e from json_array_elements(coalesce(v_rows, '[]'::json)) with ordinality t(e, i) where i <= v_lim order by i) z), '[]'::json),
                           'more', coalesce(v_n, 0) > v_lim);
end $function$;

revoke all on function public.admin_log_page(text, integer, timestamptz, bigint, text[], text) from public;
grant execute on function public.admin_log_page(text, integer, timestamptz, bigint, text[], text) to anon, authenticated;

-- Rensa gammal logg (körs bara för hand eller av ett schemalagt jobb om ni vill det senare)
create or replace function private.log_prune(p_keep interval default interval '13 months')
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v int;
begin
  if p_keep < interval '30 days' then raise exception 'keep_too_short' using errcode = '22023'; end if;
  delete from public.activity_log where created_at < now() - p_keep;
  get diagnostics v = row_count;
  return v;
end $function$;

revoke all on function private.log_prune(interval) from public, anon, authenticated;
