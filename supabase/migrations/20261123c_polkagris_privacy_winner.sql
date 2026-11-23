-- Polkagrisjakt: bara egen placering och eget antal i topplistan (inga andras namn).
-- På nyårsafton presenteras vinnaren för alla som Förnamn E. (första bokstaven i efternamnet).
-- Ångra: undo/20261123c_polkagris_privacy_winner_undo.sql

create or replace function private.polkagris_display_name(p_driver text)
returns text
language sql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
  select coalesce(
    nullif(btrim(
      coalesce(nullif(btrim(d.first_name), ''), split_part(btrim(coalesce(d.name, '')), ' ', 1)) ||
      case
        when nullif(btrim(d.last_name), '') is not null
          then ' ' || left(btrim(d.last_name), 1) || '.'
        when position(' ' in btrim(coalesce(d.name, ''))) > 0
          then ' ' || left(btrim(substr(btrim(d.name), position(' ' in btrim(d.name)) + 1)), 1) || '.'
        else ''
      end
    ), ''),
    'Förare'
  )
  from public.drivers d where d.id = p_driver;
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
