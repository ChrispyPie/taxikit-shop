-- Återställer polkagris_state och polkagris_claim till 20261124e och tar bort findable-hjälparen.

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
  v_shift record;
  v_quota_date date;
  v_canes jsonb := '[]'::jsonb;
  v_board jsonb;
  v_mine int := 0;
  v_my_rank int := 1;
  v_collectors int := 0;
  v_total_ranked int := 1;
  v_max_antal int := 0;
  v_tied_top int := 0;
  v_winner jsonb;
  v_standings jsonb := '[]'::jsonb;
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
    select * into v_shift from private.polkagris_shift(v_now);
    perform private.polkagris_touch(v_season, a.driver_id, v_shift.shift_key, v_now);
    if private.advent_is_test(p_as_of, a.driver_id) and p_as_of is not null then
      v_quota_date := p_as_of;
    else
      v_quota_date := (v_shift.start_at at time zone 'Europe/Stockholm')::date;
    end if;
    perform private.polkagris_maybe_spawn(v_season, v_now, a.driver_id, v_quota_date);
    v_canes := private.polkagris_visible_canes(v_season, v_now, a.driver_id);
  end if;

  v_board := private.polkagris_board(v_season);
  v_standings := private.polkagris_standings(v_season, a.driver_id, v_now);

  select
    coalesce((select count(*)::int from jsonb_array_elements(v_standings) e
               where coalesce((e->>'points')::int, 0) > 0), 0),
    coalesce((select (e->>'points')::int from jsonb_array_elements(v_standings) e
               where (e->>'mine')::boolean limit 1), 0),
    (select (e->>'rank')::int from jsonb_array_elements(v_standings) e
      where (e->>'mine')::boolean limit 1),
    coalesce(jsonb_array_length(v_standings), 0)
  into v_collectors, v_mine, v_my_rank, v_total_ranked;

  if v_my_rank is null then
    v_my_rank := greatest(v_total_ranked, 1);
  end if;
  if v_total_ranked < 1 then
    v_total_ranked := 1;
  end if;

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
    'canes', v_canes,
    'cane', case
      when v_hunt and jsonb_typeof(v_canes) = 'array' and jsonb_array_length(v_canes) > 0
      then v_canes->0
      else null end,
    'waiting_until', case
      when v_hunt then (
        select c.next_at from public.polkagris_canes c
         where c.season = v_season and c.kind in ('shared', 'golden')
         order by c.id desc limit 1
      )
      else null end,
    'mine', v_mine,
    'my_rank', v_my_rank,
    'collectors', v_collectors,
    'total_ranked', v_total_ranked,
    'board', '[]'::jsonb,
    'standings', v_standings,
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
  v_now timestamptz := now();
  v_shift record;
  v_row public.polkagris_canes;
  v_ok boolean := false;
  v_reason text := 'missing';
  v_seen timestamptz;
  v_shared_n int := 0;
  v_golden_n int := 0;
  v_board jsonb;
  v_mine int := 0;
  v_my_rank int := 1;
  v_collectors int := 0;
  v_total_ranked int := 1;
  v_standings jsonb := '[]'::jsonb;
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

  perform pg_advisory_xact_lock(87202301, v_season::integer);
  perform private.polkagris_retire(v_season, v_now);
  select * into v_shift from private.polkagris_shift(v_now);

  select s.last_seen_at into v_seen
    from public.polkagris_driver_state s
   where s.season = v_season
     and s.driver_id = a.driver_id
     and s.shift_key = v_shift.shift_key;
  if v_seen is null or v_seen < v_now - interval '2 minutes' then
    v_reason := 'stale';
  else
    select * into v_row from public.polkagris_canes where id = p_cane_id;
    if v_row.id is null or v_row.season is distinct from v_season then
      v_reason := 'missing';
    elsif v_row.claimed_by is not null then
      v_reason := 'already';
    elsif v_row.retired_at is not null
       or (v_row.expires_at is not null and v_row.expires_at <= v_now)
       or v_row.appears_at > v_now then
      v_reason := 'expired';
    elsif v_row.kind = 'personal' and v_row.for_driver is distinct from a.driver_id then
      v_reason := 'not_yours';
    else
      if v_row.kind = 'shared' then
        select count(*)::int into v_shared_n
          from public.polkagris_canes c
         where c.season = v_season
           and c.claimed_by = a.driver_id
           and c.kind = 'shared'
           and c.claimed_at >= v_shift.start_at
           and c.claimed_at < v_shift.end_at;
        if v_shared_n >= 3 then
          v_reason := 'cap_shared';
        end if;
      elsif v_row.kind = 'golden' then
        select count(*)::int into v_golden_n
          from public.polkagris_canes c
         where c.season = v_season
           and c.claimed_by = a.driver_id
           and c.kind = 'golden'
           and (c.claimed_at at time zone 'Europe/Stockholm')::date
             = (v_now at time zone 'Europe/Stockholm')::date;
        if v_golden_n >= 1 then
          v_reason := 'cap_golden';
        end if;
      end if;

      if v_reason is distinct from 'cap_shared' and v_reason is distinct from 'cap_golden' then
        update public.polkagris_canes
           set claimed_by = a.driver_id, claimed_at = v_now
         where id = p_cane_id
           and season = v_season
           and claimed_by is null
           and retired_at is null
           and appears_at <= v_now
           and (expires_at is null or expires_at > v_now)
           and (kind <> 'personal' or for_driver = a.driver_id)
        returning * into v_row;
        if found then
          v_ok := true;
          v_reason := 'ok';
        else
          select * into v_row from public.polkagris_canes where id = p_cane_id;
          if v_row.claimed_by is not null then
            v_reason := 'already';
          else
            v_reason := 'missing';
          end if;
        end if;
      end if;
    end if;
  end if;

  if not v_ok and v_row.id is null then
    select * into v_row from public.polkagris_canes where id = p_cane_id;
  end if;

  v_board := private.polkagris_board(v_season);
  v_standings := private.polkagris_standings(v_season, a.driver_id, v_now);

  select
    coalesce((select count(*)::int from jsonb_array_elements(v_standings) e
               where coalesce((e->>'points')::int, 0) > 0), 0),
    coalesce((select (e->>'points')::int from jsonb_array_elements(v_standings) e
               where (e->>'mine')::boolean limit 1), 0),
    (select (e->>'rank')::int from jsonb_array_elements(v_standings) e
      where (e->>'mine')::boolean limit 1),
    coalesce(jsonb_array_length(v_standings), 0)
  into v_collectors, v_mine, v_my_rank, v_total_ranked;

  if v_my_rank is null then
    v_my_rank := greatest(v_total_ranked, 1);
  end if;
  if v_total_ranked < 1 then
    v_total_ranked := 1;
  end if;

  return json_build_object(
    'ok', v_ok,
    'already', (not v_ok and v_reason = 'already'),
    'reason', v_reason,
    'cane_id', v_row.id,
    'kind', v_row.kind,
    'points', v_row.points,
    'namn', null,
    'mine', v_mine,
    'my_rank', v_my_rank,
    'collectors', v_collectors,
    'total_ranked', v_total_ranked,
    'board', '[]'::jsonb,
    'standings', v_standings
  );
end;
$$;

drop function if exists private.polkagris_findable(smallint, timestamptz, text);
