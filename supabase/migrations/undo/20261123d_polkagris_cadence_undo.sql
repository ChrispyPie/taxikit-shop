-- Ångra 20261123d_polkagris_cadence.sql.
-- Återställer en-klubba-i-taget från 20261123b/c. Ingen force-push behövs för appen;
-- den här filen ångrar bara databasen. Kör efter en app-revert, eller innan.
-- Om flera oclaimade klubbor finns tas alla utom den senaste delade bort så att
-- unique-indexet polkagris_one_open kan återskapas.

-- 1) Återställ funktioner som klienten anropar, innan nya kolumner tas bort.
create or replace function private.polkagris_maybe_spawn(p_season smallint, p_now timestamptz)
returns public.polkagris_canes
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_open public.polkagris_canes;
  v_last public.polkagris_canes;
  v_places text[] := private.polkagris_places();
  v_place text;
  v_next timestamptz;
  v_mins integer;
begin
  perform pg_advisory_xact_lock(87202301, p_season::integer);
  select * into v_open from public.polkagris_canes
   where season = p_season and claimed_by is null
   order by id desc limit 1;
  if v_open.id is not null then return v_open; end if;

  select * into v_last from public.polkagris_canes
   where season = p_season
   order by id desc limit 1;
  if v_last.id is not null and v_last.next_at > p_now then
    return null;
  end if;

  v_places := array(select p from unnest(v_places) p where p is distinct from v_last.place_key);
  if coalesce(array_length(v_places, 1), 0) = 0 then
    v_places := private.polkagris_places();
  end if;
  v_place := v_places[1 + floor(random() * array_length(v_places, 1))::int];
  -- 5–60 minuter till nästa klubba, slumpat, efter att den här tas.
  v_mins := 5 + floor(random() * 56)::int;
  v_next := p_now + make_interval(mins => v_mins);

  insert into public.polkagris_canes (season, place_key, appears_at, next_at)
  values (p_season, v_place, p_now, v_next)
  returning * into v_open;
  return v_open;
end;
$$;

create or replace function private.polkagris_board(p_season smallint)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.antal desc, x.sist asc, x.driver_id), '[]'::jsonb)
  from (
    select c.claimed_by as driver_id,
           private.polkagris_display_name(c.claimed_by) as namn,
           count(*)::int as antal,
           max(c.claimed_at) as sist
      from public.polkagris_canes c
     where c.season = p_season and c.claimed_by is not null
     group by c.claimed_by
  ) x;
$$;

create or replace function public.polkagris_state(p_token text, p_as_of date default null)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  a record;
  v_today date;
  v_month int;
  v_day int;
  v_season smallint;
  v_hunt boolean;
  v_show_win boolean;
  v_now timestamptz := now();
  v_cane public.polkagris_canes;
  v_board jsonb;
  v_mine int := 0;
  v_my_rank int := 1;
  v_collectors int := 0;
  v_total_ranked int := 1;
  v_max_antal int := 0;
  v_tied_top int := 0;
  v_winner jsonb;
begin
  select * into a from private.session_actor(p_token);
  if not private.advent_may_use(a.driver_id) then
    raise exception 'not_open_yet' using errcode = '42501';
  end if;
  perform private.advent_purge_prelive();
  v_today := private.advent_today(p_as_of, a.driver_id);
  v_month := extract(month from v_today)::int;
  v_day := extract(day from v_today)::int;
  v_season := private.advent_season_year(v_today, p_as_of, a.driver_id);
  v_hunt := (v_month = 12);
  v_show_win := (v_month = 12 and v_day >= 31) or (v_month = 1 and v_day <= 6);

  if v_hunt then
    v_cane := private.polkagris_maybe_spawn(v_season, v_now);
    if v_cane.id is null then
      select * into v_cane from public.polkagris_canes
       where season = v_season and claimed_by is null
       order by id desc limit 1;
    end if;
  end if;

  v_board := private.polkagris_board(v_season);
  with ranked as (
    select x.driver_id, x.namn, x.antal, x.sist,
           row_number() over (order by x.antal desc, x.sist asc, x.driver_id) as rn
      from jsonb_to_recordset(v_board) as x(driver_id text, namn text, antal int, sist timestamptz)
  )
  select
    coalesce((select count(*)::int from ranked), 0),
    coalesce((select r.antal from ranked r where r.driver_id = a.driver_id), 0),
    (select r.rn::int from ranked r where r.driver_id = a.driver_id)
  into v_collectors, v_mine, v_my_rank;

  if v_my_rank is null then
    v_my_rank := v_collectors + 1;
  end if;
  v_total_ranked := case when v_mine > 0 then v_collectors else v_collectors + 1 end;

  if v_show_win then
    select coalesce(max(x.antal), 0) into v_max_antal
      from jsonb_to_recordset(v_board) as x(driver_id text, namn text, antal int, sist timestamptz);
    if v_max_antal > 0 then
      select count(*)::int into v_tied_top
        from jsonb_to_recordset(v_board) as x(driver_id text, namn text, antal int, sist timestamptz)
       where x.antal = v_max_antal;
      select jsonb_build_object(
        'namn', x.namn,
        'antal', x.antal,
        'tied_count', v_tied_top
      ) into v_winner
      from jsonb_to_recordset(v_board) as x(driver_id text, namn text, antal int, sist timestamptz)
      order by x.antal desc, x.sist asc, x.driver_id
      limit 1;
    elsif v_season = 0 and a.driver_id = '710022' then
      v_winner := jsonb_build_object(
        'namn', private.polkagris_display_name(a.driver_id),
        'antal', 0,
        'tied_count', 1,
        'test_preview', true
      );
    end if;
  end if;

  return json_build_object(
    'season', v_season,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'hunt', v_hunt,
    'show_winner', v_show_win,
    'cane', case
      when v_hunt and v_cane.id is not null and v_cane.claimed_by is null and v_cane.appears_at <= v_now
      then json_build_object('id', v_cane.id, 'place_key', v_cane.place_key, 'appears_at', v_cane.appears_at)
      else null end,
    'waiting_until', case
      when v_hunt and (v_cane.id is null or v_cane.claimed_by is not null)
      then (select c.next_at from public.polkagris_canes c where c.season = v_season order by c.id desc limit 1)
      else null end,
    'mine', v_mine,
    'my_rank', v_my_rank,
    'collectors', v_collectors,
    'total_ranked', v_total_ranked,
    'board', '[]'::jsonb,
    'winner', v_winner,
    'me', a.driver_id
  );
end;
$$;

create or replace function public.polkagris_claim(p_token text, p_cane_id bigint, p_as_of date default null)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  a record;
  v_today date;
  v_month int;
  v_season smallint;
  v_row public.polkagris_canes;
  v_ok boolean := false;
  v_board jsonb;
  v_mine int := 0;
  v_my_rank int := 1;
  v_collectors int := 0;
  v_total_ranked int := 1;
begin
  select * into a from private.session_actor(p_token);
  if not private.advent_may_use(a.driver_id) then
    raise exception 'not_open_yet' using errcode = '42501';
  end if;
  if coalesce(current_setting('taxi.demo', true), '') <> '' or coalesce(a.via_master, false) then
    raise exception 'demo_read_only' using errcode = '42501';
  end if;
  perform private.advent_purge_prelive();
  v_today := private.advent_today(p_as_of, a.driver_id);
  v_month := extract(month from v_today)::int;
  if v_month <> 12 then
    raise exception 'not_in_season' using errcode = '42501';
  end if;
  v_season := private.advent_season_year(v_today, p_as_of, a.driver_id);
  if p_cane_id is null then
    raise exception 'bad_cane' using errcode = '22023';
  end if;

  update public.polkagris_canes
     set claimed_by = a.driver_id, claimed_at = now()
   where id = p_cane_id
     and season = v_season
     and claimed_by is null
     and appears_at <= now()
  returning * into v_row;
  v_ok := v_row.id is not null;

  if not v_ok then
    select * into v_row from public.polkagris_canes where id = p_cane_id;
  end if;

  v_board := private.polkagris_board(v_season);
  with ranked as (
    select x.driver_id, x.antal, x.sist,
           row_number() over (order by x.antal desc, x.sist asc, x.driver_id) as rn
      from jsonb_to_recordset(v_board) as x(driver_id text, namn text, antal int, sist timestamptz)
  )
  select
    coalesce((select count(*)::int from ranked), 0),
    coalesce((select r.antal from ranked r where r.driver_id = a.driver_id), 0),
    (select r.rn::int from ranked r where r.driver_id = a.driver_id)
  into v_collectors, v_mine, v_my_rank;

  if v_my_rank is null then
    v_my_rank := v_collectors + 1;
  end if;
  v_total_ranked := case when v_mine > 0 then v_collectors else v_collectors + 1 end;

  return json_build_object(
    'ok', v_ok,
    'already', (not v_ok and v_row.claimed_by is not null),
    'cane_id', v_row.id,
    'namn', null,
    'mine', v_mine,
    'my_rank', v_my_rank,
    'collectors', v_collectors,
    'total_ranked', v_total_ranked,
    'board', '[]'::jsonb
  );
end;
$$;

drop function if exists private.polkagris_maybe_spawn(smallint, timestamptz, text, date);
drop function if exists private.polkagris_maybe_spawn_shared(smallint, timestamptz, date);
drop function if exists private.polkagris_maybe_spawn_personal(smallint, timestamptz, text);
drop function if exists private.polkagris_visible_canes(smallint, timestamptz, text);
drop function if exists private.polkagris_pick_place(smallint, timestamptz);
drop function if exists private.polkagris_pick_place_common(smallint, timestamptz);
drop function if exists private.polkagris_touch(smallint, text, text, timestamptz);
drop function if exists private.polkagris_retire(smallint, timestamptz);
drop function if exists private.polkagris_recent_rush(timestamptz, timestamptz, text);
drop function if exists private.polkagris_golden_quota(date, text);
drop function if exists private.polkagris_shift(timestamptz);

-- 2) Lämna högst en oclaimad klubba per säsong.
delete from public.polkagris_canes c
 where c.claimed_by is null
   and c.id not in (
     select distinct on (s.season) s.id
       from public.polkagris_canes s
      where s.claimed_by is null
        and (s.kind is null or s.kind = 'shared')
      order by s.season, s.id desc
   );

drop index if exists public.polkagris_one_open_personal;
drop index if exists public.polkagris_one_open_golden;
drop index if exists public.polkagris_canes_open_lookup;

create unique index if not exists polkagris_one_open
  on public.polkagris_canes (season) where claimed_by is null;

drop table if exists public.polkagris_driver_state;

alter table public.polkagris_canes drop constraint if exists polkagris_canes_kind_check;
alter table public.polkagris_canes drop column if exists kind;
alter table public.polkagris_canes drop column if exists for_driver;
alter table public.polkagris_canes drop column if exists expires_at;
alter table public.polkagris_canes drop column if exists points;
alter table public.polkagris_canes drop column if exists retired_at;
