-- Restore pre-feature RPCs. Leave additive month column/data intact.
CREATE OR REPLACE FUNCTION public.profile_get(p_token text, p_driver_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; v_id text; d public.drivers; pr public.driver_profiles;
        v_same boolean; v_mine boolean; v_co text; v_roles text[];
        v_threads int; v_replies int; cc record;
begin
  select * into a from private.forum_actor(p_token);
  v_id := coalesce(nullif(btrim(p_driver_id), ''), a.driver_id);
  select * into d from public.drivers where id = v_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_co := private.actor_company(d.id);
  v_mine := d.id = a.driver_id;
  v_same := v_co = a.company_id or a.is_sadmin;
  select * into pr from public.driver_profiles where driver_id = d.id;
  -- Räknare: bara trådar/svar i sektioner tittaren får läsa (Admin syns aldrig för förare).
  v_roles := private.fx_roles(a.is_admin, a.is_sadmin);
  select count(*)::int into v_threads
    from public.forum_threads t
    join public.forum_sections s on s.id = t.section_id
   where t.author_id = d.id
     and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id);
  select count(*)::int into v_replies
    from public.forum_replies r
    join public.forum_threads t on t.id = r.thread_id
    join public.forum_sections s on s.id = t.section_id
   where r.author_id = d.id and not r.hidden
     and private.fx_thread_visible(t, s, a.company_id, v_roles, a.is_sadmin, a.driver_id);
  select * into cc from private.bil_current_car(d.id, v_co);

  return jsonb_build_object(
    'id', d.id,
    'name', private.forum_name(d.id),
    'ak', private.forum_avatar(d.id),
    'co', private.forum_co_name(v_co),
    'co_id', v_co,
    'mine', v_mine,
    'is_admin', a.is_admin,
    'is_sadmin', a.is_sadmin,
    'can_edit', v_mine and not coalesce(a.via_master, false),
    'can_delete_guestbook', v_mine or a.is_admin or a.is_sadmin,
    'taxi_start_year', case when v_mine or private.profile_vis_ok(coalesce(pr.visibility,'{}'::jsonb),'taxi_start_year', v_same)
                            then pr.taxi_start_year end,
    'years_taxi', case when pr.taxi_start_year is not null
                         and (v_mine or private.profile_vis_ok(coalesce(pr.visibility,'{}'::jsonb),'taxi_start_year', v_same))
                       then greatest(0, extract(year from now())::int - pr.taxi_start_year) end,
    'home_zone', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'home_zone', pr.home_zone, v_same, v_mine),
    'fav_zone', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'fav_zone', pr.fav_zone, v_same, v_mine),
    'shift', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'shift', pr.shift, v_same, v_mine),
    'languages', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'languages', pr.languages, v_same, v_mine),
    'bio', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'bio', pr.bio, v_same, v_mine),
    'hobbies', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'hobbies', pr.hobbies, v_same, v_mine),
    'permits', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'permits', pr.permits, v_same, v_mine),
    'also_uber_bolt', case when v_mine or private.profile_vis_ok(coalesce(pr.visibility,'{}'::jsonb),'also_uber_bolt', v_same)
                           then coalesce(pr.also_uber_bolt, false) end,
    'fun_tip', private.profile_field(coalesce(pr.visibility,'{}'::jsonb),'fun_tip', pr.fun_tip, v_same, v_mine),
    'visibility', case when v_mine then coalesce(pr.visibility, '{}'::jsonb) else null end,
    'stats', jsonb_build_object(
      'forum_threads', v_threads,
      'forum_replies', v_replies
    ),
    'car', case when cc.car_id is not null then jsonb_build_object(
             'id', cc.car_id, 'label', cc.label, 'source', cc.source, 'at', cc.at
           ) end,
    'gallery_n', (select count(*)::int from public.profile_gallery g where g.driver_id = d.id and g.uploaded),
    'guestbook_n', (select count(*)::int from public.profile_guestbook g where g.profile_id = d.id and not g.hidden)
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.profile_save(p_token text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; v jsonb := coalesce(p_data, '{}'::jsonb); v_vis jsonb;
        v_year int; v_shift text;
begin
  select * into a from private.forum_actor(p_token);
  if coalesce(a.via_master, false) then raise exception 'via_master' using errcode = '42501'; end if;
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;

  v_year := nullif(v->>'taxi_start_year','')::int;
  if v_year is not null and (v_year < 1970 or v_year > extract(year from now())::int + 1) then
    raise exception 'bad_year' using errcode = '22023';
  end if;
  v_shift := nullif(btrim(coalesce(v->>'shift','')), '');
  if v_shift is not null and v_shift not in ('dag','natt','extra') then
    raise exception 'bad_shift' using errcode = '22023';
  end if;
  v_vis := coalesce(v->'visibility', '{}'::jsonb);

  insert into public.driver_profiles as p (
    driver_id, taxi_start_year, home_zone, fav_zone, shift, languages, bio, hobbies, permits,
    also_uber_bolt, fun_tip, visibility, updated_at
  ) values (
    a.driver_id, v_year,
    nullif(btrim(coalesce(v->>'home_zone','')), ''),
    nullif(btrim(coalesce(v->>'fav_zone','')), ''),
    v_shift,
    nullif(left(btrim(coalesce(v->>'languages','')), 200), ''),
    nullif(left(btrim(coalesce(v->>'bio','')), 500), ''),
    nullif(left(btrim(coalesce(v->>'hobbies','')), 300), ''),
    nullif(left(btrim(coalesce(v->>'permits','')), 400), ''),
    coalesce((v->>'also_uber_bolt')::boolean, false),
    nullif(left(btrim(coalesce(v->>'fun_tip','')), 300), ''),
    v_vis, clock_timestamp()
  )
  on conflict (driver_id) do update set
    taxi_start_year = excluded.taxi_start_year,
    home_zone = excluded.home_zone,
    fav_zone = excluded.fav_zone,
    shift = excluded.shift,
    languages = excluded.languages,
    bio = excluded.bio,
    hobbies = excluded.hobbies,
    permits = excluded.permits,
    also_uber_bolt = excluded.also_uber_bolt,
    fun_tip = excluded.fun_tip,
    visibility = excluded.visibility,
    updated_at = clock_timestamp();

  return public.profile_get(p_token, a.driver_id);
end $function$
;
