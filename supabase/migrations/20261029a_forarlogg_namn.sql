-- 20261029a: Logg över vem som ändrar föraruppgifter + kort namn med förar-id (t604u).
-- A) admin_save_driver loggar 'driver_edit' med vilka fält som ändrades (aldrig värdena), bara när något faktiskt ändrats.
--    forum_set_name och demo_activate loggar 'profile_update' (föraren ändrar själv) på samma sätt.
-- B) admin_list_drivers: admin och S admin får nu förnamn + första bokstaven i efternamnet (last_initial).
--    Ägaren får allt som förut. Inga nya fält som efternamn, telefon, e-post eller adress till andra roller.
--    Forumet skickar förar-id (aid) för inlägg och kommentarer så att appen kan visa "Anna S · 179890".
--    I demo-läget skickas inget förar-id.
-- Samma signaturer och returtyper. Ingen tabell ändras. Ångra: undo/20261029a_forarlogg_namn_undo.sql

-- Fält som räknas som föraruppgifter (samma som i profilen + anteckningar)
create or replace function private.driver_fields()
 returns text[]
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select array['first_name','last_name','address','postal_code','city','email','phone',
    'emergency_first_name','emergency_last_name','emergency_address','emergency_postal','emergency_city',
    'emergency_phone','emergency_relation','notes']
$function$;

-- Vilka fält skiljer sig mellan två versioner av en förare? Tomt och null räknas som samma.
create or replace function private.driver_changed(o public.drivers, n public.drivers)
 returns text[]
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(array_agg(f order by i), '{}')
    from unnest(private.driver_fields()) with ordinality u(f, i)
   where nullif(btrim(coalesce(to_jsonb(o)->>f, '')), '') is distinct from nullif(btrim(coalesce(to_jsonb(n)->>f, '')), '')
$function$;

revoke all on function private.driver_fields() from public, anon, authenticated;
revoke all on function private.driver_changed(public.drivers, public.drivers) from public, anon, authenticated;

create or replace function public.admin_save_driver(p_token text, p_id text, p_data jsonb)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a record;
  v_old text;
  v_exists boolean;
  v_target_cat text;
  v_new_cat text;
  v_did boolean := false;
  o public.drivers;
  n public.drivers;
  v_fields text[];
begin
  select * into a from private.require_admin(p_token);
  if p_id !~ '^[A-Za-z0-9_-]{1,32}$' then raise exception 'bad_id' using errcode = '22023'; end if;
  perform private.sadmin_guard(a.driver_id, p_id, case when p_data ? 'category' then p_data->>'category' end);
  select category, true into v_old, v_exists from public.drivers where id = p_id;
  v_target_cat := private.norm_cat(v_old);
  if not coalesce(v_exists, false) then
    insert into public.drivers(id, category) values (p_id, 'standard');
  end if;

  if a.category = 'agare' then
    select * into o from public.drivers where id = p_id for update;
    update public.drivers set
      first_name = coalesce(p_data->>'first_name', first_name),
      last_name = coalesce(p_data->>'last_name', last_name),
      address = coalesce(p_data->>'address', address),
      postal_code = coalesce(p_data->>'postal_code', postal_code),
      city = coalesce(p_data->>'city', city),
      email = coalesce(p_data->>'email', email),
      phone = coalesce(p_data->>'phone', phone),
      emergency_first_name = coalesce(p_data->>'emergency_first_name', emergency_first_name),
      emergency_last_name = coalesce(p_data->>'emergency_last_name', emergency_last_name),
      emergency_address = coalesce(p_data->>'emergency_address', emergency_address),
      emergency_postal = coalesce(p_data->>'emergency_postal', emergency_postal),
      emergency_city = coalesce(p_data->>'emergency_city', emergency_city),
      emergency_phone = coalesce(p_data->>'emergency_phone', emergency_phone),
      emergency_relation = coalesce(p_data->>'emergency_relation', emergency_relation),
      notes = coalesce(p_data->>'notes', notes)
    where id = p_id
    returning * into n;
    v_did := true;
    -- 20261029a: vem ändrade vad (bara fältnamn, aldrig värden)
    v_fields := private.driver_changed(o, n);
    if cardinality(v_fields) > 0 then
      perform private.log(a.driver_id, a.category, 'driver_edit', p_id,
        jsonb_build_object('fields', to_jsonb(v_fields)) || case when coalesce(v_exists, false) then '{}'::jsonb else '{"new":true}'::jsonb end,
        a.via_master);
    end if;
  end if;

  if p_data ? 'category' then
    v_new_cat := p_data->>'category';
    if v_new_cat is distinct from v_old then
      if v_new_cat not in ('superadmin','agare','admin','standard','semester','avslutad')
         or not private.can_edit_cat(a.category, v_target_cat)
         or not private.can_edit_cat(a.category, v_new_cat) then
        raise exception 'forbidden' using errcode = '42501';
      end if;
      update public.drivers set category = v_new_cat where id = p_id;
      perform private.log(a.driver_id, a.category, 'category_change', p_id,
        jsonb_build_object('from', v_old, 'to', v_new_cat), a.via_master);
    end if;
    v_did := true;
  end if;
  if not v_did then raise exception 'forbidden' using errcode = '42501'; end if;
  return json_build_object('ok', true);
end $function$;

create or replace function public.forum_set_name(p_token text, p_first text, p_last text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare a record; v_f text := btrim(coalesce(p_first, '')); v_l text := nullif(btrim(coalesce(p_last, '')), '');
  o public.drivers; n public.drivers; v_fields text[];
begin
  select * into a from private.forum_actor(p_token);
  perform private.forum_can_write(a.via_master);
  if v_f = '' then raise exception 'need_first_name' using errcode = '22023'; end if;
  if char_length(v_f) > 50 or char_length(coalesce(v_l, '')) > 50 then raise exception 'name_too_long' using errcode = '22023'; end if;
  if private.forum_has_name(a.driver_id) then raise exception 'has_name' using errcode = '22023'; end if;
  select * into o from public.drivers where id = a.driver_id for update;
  update public.drivers set first_name = v_f, last_name = coalesce(v_l, last_name),
         name = btrim(v_f || ' ' || coalesce(v_l, last_name, ''))
   where id = a.driver_id
   returning * into n;
  -- 20261029a: föraren skrev in sitt namn i forumet
  v_fields := private.driver_changed(o, n);
  if cardinality(v_fields) > 0 then
    perform private.log(a.driver_id, private.norm_cat(o.category), 'profile_update', a.driver_id,
      jsonb_build_object('fields', to_jsonb(v_fields), 'via', 'forum'), a.via_master);
  end if;
  return jsonb_build_object('name', private.forum_name(a.driver_id));
end $function$;

create or replace function public.demo_activate(p_link text, p_first_name text, p_last_name text, p_password text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare l private.activation_links; dm private.demo_accounts; v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, '')); r json; o public.drivers; n public.drivers; v_fields text[];
begin
  select * into l from private.activation_links where token_hash = private.token_hash(coalesce(p_link, ''));
  if l.token_hash is null then return json_build_object('ok', false, 'error', 'invalid_link'); end if;
  select * into dm from private.demo_accounts where driver_id = l.driver_id;
  if dm.driver_id is null then return json_build_object('ok', false, 'error', 'invalid_link'); end if;
  if dm.ended_at is not null or dm.expires_at <= now() then return json_build_object('ok', false, 'error', 'expired_link'); end if;
  if char_length(v_first) < 1 or char_length(v_last) < 1 then return json_build_object('ok', false, 'error', 'need_name'); end if;
  if char_length(v_first) > 40 or char_length(v_last) > 40 then return json_build_object('ok', false, 'error', 'name_too_long'); end if;
  select * into o from public.drivers where id = dm.driver_id;
  update public.drivers set first_name = v_first, last_name = v_last where id = dm.driver_id returning * into n;
  r := public.activate_account(p_link, dm.driver_id, p_password);
  if coalesce((r->>'ok')::boolean, false) then
    update private.demo_accounts set activated_at = now() where driver_id = dm.driver_id;
    perform private.log(dm.driver_id, 'standard', 'demo_activated', dm.driver_id, jsonb_build_object('role', dm.role), false);
    v_fields := private.driver_changed(o, n);
    if cardinality(v_fields) > 0 then
      perform private.log(dm.driver_id, 'standard', 'profile_update', dm.driver_id,
        jsonb_build_object('fields', to_jsonb(v_fields), 'via', 'demo'), false);
    end if;
  end if;
  return r;
end $function$;

-- B) Chaufförslistan: admin och S admin får förnamn + initial (inte efternamn, kontakt eller anhörig)
create or replace function public.admin_list_drivers(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare a record;
begin
  select * into a from private.require_admin(p_token);
  return coalesce((
    select json_agg(x.j order by x.id) from (
      select d.id, (case when a.category = 'agare' then
        jsonb_build_object('id', d.id, 'category', d.category, 'activated', coalesce(d.activated, false), 'logged_in', d.logged_in,
          'first_name', d.first_name, 'last_name', d.last_name, 'address', d.address, 'postal_code', d.postal_code,
          'city', d.city, 'email', d.email, 'phone', d.phone,
          'emergency_first_name', d.emergency_first_name, 'emergency_last_name', d.emergency_last_name,
          'emergency_address', d.emergency_address, 'emergency_postal', d.emergency_postal,
          'emergency_city', d.emergency_city, 'emergency_phone', d.emergency_phone,
          'emergency_relation', d.emergency_relation, 'notes', d.notes)
      else
        -- 20261029a: förnamn + första bokstaven i efternamnet, inget mer
        jsonb_build_object('id', d.id, 'category', d.category, 'activated', coalesce(d.activated, false), 'logged_in', d.logged_in,
          'first_name', nullif(btrim(d.first_name), ''), 'last_initial', nullif(upper(left(btrim(coalesce(d.last_name, '')), 1)), ''))
      end) || jsonb_build_object(
          'pending', coalesce(d.activated, false) and d.password_hash is null,
          'link_expires_at', (select max(l.expires_at) from private.activation_links l where l.driver_id = d.id and l.used_at is null),
          'last_login_at', d.last_login_at, 'must_change_password', coalesce(d.must_change_password, false), 'activated_at', d.activated_at) j
        from public.drivers d
      union all
      select u.id, jsonb_build_object('id', u.id, 'registered', false) from (
        select distinct coalesce(t.forar, t.data->>'forar', ds.meta->>'forar') id
          from public.trips t join public.trip_datasets ds on ds.name = t.dataset
        union
        select distinct coalesce(s.forar, s.data->>'forar', ds.meta->>'forar')
          from public.shifts s join public.trip_datasets ds on ds.name = s.dataset
      ) u where u.id is not null and u.id not in (select id from public.drivers)
    ) x), '[]'::json);
end $function$;

-- B) Forum: förar-id för inlägget (aid). Inget id i demo-läget.
create or replace function private.forum_post_json(p forum_posts, p_me text, p_co text, p_admin boolean, p_sadmin boolean, p_full boolean)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', p.id, 'cat', p.category, 'title', p.title,
    'body', case when p_full then p.body else left(p.body, 160) end,
    'author', private.forum_name(p.author_id), 'ak', private.forum_avatar(p.author_id),
    'aid', case when not private.is_demo() then p.author_id end,
    'co', case when p.category <> 'akeri' then private.forum_co_name(p.company_id) end,
    'sec', case when p.category = 'akeri' then private.forum_co_name(p.company_id) end,
    'sec_id', case when p.category = 'akeri' then p.company_id end,
    'mine', p.author_id = p_me, 'hidden', p.hidden,
    'can_mod', private.forum_mods(p.company_id, p_co, p_admin, p_sadmin),
    'created_at', p.created_at, 'edited', p.edited_at is not null, 'last_activity_at', p.last_activity_at,
    'status', p.status, 'status_comment', case when p_full then p.status_comment end,
    'status_by', case when p_full and p.status_by is not null then private.forum_name(p.status_by) end, 'status_at', p.status_at,
    'likes', (select count(*) from public.forum_likes l where l.post_id = p.id),
    'liked', exists (select 1 from public.forum_likes l where l.post_id = p.id and l.driver_id = p_me),
    'comments', (select count(*) from public.forum_comments c where c.post_id = p.id
                  and (not c.hidden or c.author_id = p_me or private.forum_mods(c.company_id, p_co, p_admin, p_sadmin))),
    'photos', (select count(*) from public.forum_photos f where f.post_id = p.id and f.uploaded))
$function$;

create or replace function public.forum_get(p_token text, p_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare a record; p public.forum_posts; v_demo boolean;
begin
  select * into a from private.forum_actor(p_token);
  v_demo := private.is_demo();
  p := private.forum_get_post(p_id, a.driver_id, a.company_id, a.is_admin, a.is_sadmin);
  update public.event_notices set read_at = now() where driver_id = a.driver_id and forum_post_id = p_id and read_at is null;
  return private.demo_mask(private.forum_post_json(p, a.driver_id, a.company_id, a.is_admin, a.is_sadmin, true) || jsonb_build_object(
    'is_admin', a.is_admin, 'mod_ok', not coalesce(a.via_master, false),
    'can_write', not coalesce(a.via_master, false) and private.forum_writes(p.category, p.company_id, a.company_id),
    'has_name', private.forum_has_name(a.driver_id), 'my_name', private.forum_name(a.driver_id),
    'comment_list', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'author', private.forum_name(c.author_id), 'ak', private.forum_avatar(c.author_id),
        'aid', case when not v_demo then c.author_id end,
        'co', case when p.category <> 'akeri' then private.forum_co_name(c.company_id) end,
        'can_mod', private.forum_mods(c.company_id, a.company_id, a.is_admin, a.is_sadmin),
        'mine', c.author_id = a.driver_id, 'body', c.body, 'created_at', c.created_at, 'edited', c.edited_at is not null, 'hidden', c.hidden) order by c.created_at, c.id)
       from public.forum_comments c where c.post_id = p.id
        and (not c.hidden or c.author_id = a.driver_id or private.forum_mods(c.company_id, a.company_id, a.is_admin, a.is_sadmin))), '[]')));
end $function$;
