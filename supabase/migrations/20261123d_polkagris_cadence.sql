-- Polkagrisjakt: egna, delade (flera samtidigt) och gyllene klubbor.
-- Godkänd kadens 2026-11-23: 2 egna/pass, max 3 delade ute, natt/dag-intervall,
-- 45 min utgång, tak 3 delade/pass/förare, guld 3 poäng med högtid + rusning
-- 17:15/21:00/00:00/03:00, tak 1 guld/dygn, färskhetsskydd 2 min.
-- Testdatum (?adventdatum=) gäller bara 710022; testtrafik skrivs i säsong 0.
-- Ångra: undo/20261123d_polkagris_cadence_undo.sql

alter table public.polkagris_canes
  add column if not exists kind text not null default 'shared',
  add column if not exists for_driver text,
  add column if not exists expires_at timestamptz,
  add column if not exists points smallint not null default 1,
  add column if not exists retired_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'polkagris_canes_kind_check'
       and conrelid = 'public.polkagris_canes'::regclass
  ) then
    alter table public.polkagris_canes
      add constraint polkagris_canes_kind_check
      check (kind in ('shared', 'personal', 'golden'));
  end if;
end
$$;

drop index if exists public.polkagris_one_open;

create unique index if not exists polkagris_one_open_personal
  on public.polkagris_canes (season, for_driver)
  where claimed_by is null and retired_at is null and kind = 'personal';

create unique index if not exists polkagris_one_open_golden
  on public.polkagris_canes (season)
  where claimed_by is null and retired_at is null and kind = 'golden';

create index if not exists polkagris_canes_open_lookup
  on public.polkagris_canes (season, kind, claimed_by, retired_at, expires_at);

-- Befintliga oclaimade klubbor ska inte ligga kvar för evigt.
update public.polkagris_canes
   set expires_at = appears_at + interval '45 minutes'
 where claimed_by is null
   and retired_at is null
   and expires_at is null
   and kind = 'shared';

create table if not exists public.polkagris_driver_state (
  season smallint not null,
  driver_id text not null,
  shift_key text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (season, driver_id, shift_key)
);

alter table public.polkagris_driver_state enable row level security;
revoke all on public.polkagris_driver_state from anon, authenticated;

create or replace function private.polkagris_shift(p_now timestamptz)
returns table (
  kind text,
  shift_key text,
  start_at timestamptz,
  end_at timestamptz,
  local_date date
)
language plpgsql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_local timestamp;
  v_date date;
  v_time time;
begin
  v_local := p_now at time zone 'Europe/Stockholm';
  v_date := v_local::date;
  v_time := v_local::time;
  if v_time >= time '17:00' then
    kind := 'night';
    shift_key := to_char(v_date, 'YYYY-MM-DD') || 'n';
    start_at := timezone('Europe/Stockholm', v_date + time '17:00');
    end_at := timezone('Europe/Stockholm', (v_date + 1) + time '06:00');
    local_date := v_date;
  elsif v_time < time '06:00' then
    kind := 'night';
    shift_key := to_char(v_date - 1, 'YYYY-MM-DD') || 'n';
    start_at := timezone('Europe/Stockholm', (v_date - 1) + time '17:00');
    end_at := timezone('Europe/Stockholm', v_date + time '06:00');
    local_date := v_date;
  else
    kind := 'day';
    shift_key := to_char(v_date, 'YYYY-MM-DD') || 'd';
    start_at := timezone('Europe/Stockholm', v_date + time '06:00');
    end_at := timezone('Europe/Stockholm', v_date + time '17:00');
    local_date := v_date;
  end if;
  return next;
end;
$$;

create or replace function private.polkagris_golden_quota(p_start_date date, p_kind text)
returns integer
language plpgsql
immutable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_q int := 0;
  v_month int;
  v_day int;
  v_dow int;
begin
  if p_kind is distinct from 'night' then
    return 0;
  end if;
  v_q := 1;
  v_month := extract(month from p_start_date)::int;
  v_day := extract(day from p_start_date)::int;
  v_dow := extract(dow from p_start_date)::int;
  if v_month = 12 and v_day in (1, 13, 25, 31) then
    v_q := v_q + 1;
  end if;
  if v_month = 12 and v_day = 24 then
    v_q := v_q + 2;
  end if;
  if v_dow in (5, 6) then
    v_q := v_q + 1;
  end if;
  return v_q;
end;
$$;

create or replace function private.polkagris_recent_rush(p_now timestamptz, p_start_at timestamptz, p_kind text)
returns timestamptz
language plpgsql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_start_date date;
  v_rush timestamptz;
  v_times time[] := array['17:15','21:00','00:00','03:00']::time[];
  v_t time;
  v_day date;
begin
  if p_kind is distinct from 'night' then
    return null;
  end if;
  v_start_date := (p_start_at at time zone 'Europe/Stockholm')::date;
  foreach v_t in array v_times loop
    if v_t >= time '17:00' then
      v_day := v_start_date;
    else
      v_day := v_start_date + 1;
    end if;
    v_rush := timezone('Europe/Stockholm', v_day + v_t);
    if p_now >= v_rush and p_now < v_rush + interval '20 minutes' then
      return v_rush;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function private.polkagris_retire(p_season smallint, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
begin
  update public.polkagris_canes
     set retired_at = p_now
   where season = p_season
     and claimed_by is null
     and retired_at is null
     and expires_at is not null
     and expires_at <= p_now;
end;
$$;

create or replace function private.polkagris_touch(
  p_season smallint, p_driver text, p_shift_key text, p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
begin
  insert into public.polkagris_driver_state (season, driver_id, shift_key, first_seen_at, last_seen_at)
  values (p_season, p_driver, p_shift_key, p_now, p_now)
  on conflict (season, driver_id, shift_key)
  do update set last_seen_at = excluded.last_seen_at;
end;
$$;

create or replace function private.polkagris_pick_place(p_season smallint, p_now timestamptz)
returns text
language plpgsql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_all text[] := private.polkagris_places();
  v_common text[] := array['hem','ankomster','prognos','kordata'];
  v_used text[];
  v_pool text[];
  v_common_pool text[];
begin
  select coalesce(array_agg(distinct c.place_key), array[]::text[])
    into v_used
    from public.polkagris_canes c
   where c.season = p_season
     and c.claimed_by is null
     and c.retired_at is null
     and (c.expires_at is null or c.expires_at > p_now);

  v_common_pool := array(select p from unnest(v_common) p
                          where p is not null
                            and not (p = any (v_used)));
  v_pool := array(select p from unnest(v_all) p
                   where p is not null
                     and not (p = any (v_used)));

  if random() < 0.67 and coalesce(array_length(v_common_pool, 1), 0) > 0 then
    v_pool := v_common_pool;
  elsif coalesce(array_length(v_pool, 1), 0) = 0 then
    v_pool := v_all;
  end if;

  return v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
end;
$$;


create or replace function private.polkagris_pick_place_common(p_season smallint, p_now timestamptz)
returns text
language plpgsql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_common text[] := array['hem','ankomster','prognos','kordata'];
  v_used text[];
  v_pool text[];
begin
  select coalesce(array_agg(distinct c.place_key), array[]::text[])
    into v_used
    from public.polkagris_canes c
   where c.season = p_season
     and c.claimed_by is null
     and c.retired_at is null
     and (c.expires_at is null or c.expires_at > p_now);

  v_pool := array(select p from unnest(v_common) p
                   where p is not null
                     and not (p = any (v_used)));
  if coalesce(array_length(v_pool, 1), 0) = 0 then
    v_pool := v_common;
  end if;
  return v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
end;
$$;

create or replace function private.polkagris_maybe_spawn_shared(
  p_season smallint,
  p_now timestamptz,
  p_quota_date date
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_shift record;
  v_open int := 0;
  v_last public.polkagris_canes;
  v_due boolean := false;
  v_rush timestamptz;
  v_kind text := 'shared';
  v_points smallint := 1;
  v_exp interval;
  v_mins integer;
  v_quota int;
  v_gold_out int;
  v_gold_made int;
  v_place text;
  v_last_shift text;
begin
  select * into v_shift from private.polkagris_shift(p_now);

  select count(*)::int into v_open
    from public.polkagris_canes c
   where c.season = p_season
     and c.kind = 'shared'
     and c.claimed_by is null
     and c.retired_at is null
     and (c.expires_at is null or c.expires_at > p_now);
  if v_open >= 3 then
    return;
  end if;

  select * into v_last
    from public.polkagris_canes c
   where c.season = p_season
     and c.kind in ('shared', 'golden')
   order by c.id desc
   limit 1;

  if v_last.id is not null then
    select s.shift_key into v_last_shift from private.polkagris_shift(v_last.appears_at) s;
  end if;

  v_due := (v_last.id is null)
        or (v_last.next_at <= p_now)
        or (v_last_shift is distinct from v_shift.shift_key);

  v_rush := private.polkagris_recent_rush(p_now, v_shift.start_at, v_shift.kind);
  if v_rush is not null then
    if exists (
      select 1 from public.polkagris_canes c
       where c.season = p_season
         and c.kind in ('shared', 'golden')
         and c.appears_at >= v_rush
    ) then
      v_rush := null;
    end if;
  end if;

  if not v_due and v_rush is null then
    return;
  end if;

  v_quota := private.polkagris_golden_quota(p_quota_date, v_shift.kind);
  select count(*)::int into v_gold_out
    from public.polkagris_canes c
   where c.season = p_season
     and c.kind = 'golden'
     and c.claimed_by is null
     and c.retired_at is null
     and (c.expires_at is null or c.expires_at > p_now);
  select count(*)::int into v_gold_made
    from public.polkagris_canes c
   where c.season = p_season
     and c.kind = 'golden'
     and c.appears_at >= v_shift.start_at
     and c.appears_at < v_shift.end_at;

  if v_quota > 0 and v_gold_out = 0 and v_gold_made < v_quota then
    v_kind := 'golden';
    v_points := 3;
    v_exp := interval '90 minutes';
  else
    v_kind := 'shared';
    v_points := 1;
    v_exp := interval '45 minutes';
  end if;

  if v_shift.kind = 'night' then
    v_mins := 15 + floor(random() * 16)::int;
  else
    v_mins := 30 + floor(random() * 21)::int;
  end if;

  v_place := private.polkagris_pick_place(p_season, p_now);

  insert into public.polkagris_canes (
    season, place_key, appears_at, next_at, kind, for_driver, expires_at, points
  ) values (
    p_season,
    v_place,
    p_now,
    p_now + make_interval(mins => v_mins),
    v_kind,
    null,
    p_now + v_exp,
    v_points
  );
end;
$$;

create or replace function private.polkagris_maybe_spawn_personal(
  p_season smallint,
  p_now timestamptz,
  p_driver text
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_shift record;
  v_state public.polkagris_driver_state;
  v_made int := 0;
  v_open int := 0;
  v_last_at timestamptz;
  v_delay int;
  v_place text;
  v_exp timestamptz;
begin
  if p_driver is null or p_driver = '' then
    return;
  end if;
  select * into v_shift from private.polkagris_shift(p_now);
  if p_now >= v_shift.end_at then
    return;
  end if;

  select * into v_state
    from public.polkagris_driver_state s
   where s.season = p_season and s.driver_id = p_driver and s.shift_key = v_shift.shift_key;
  if v_state.driver_id is null then
    return;
  end if;

  select count(*)::int, max(c.appears_at)
    into v_made, v_last_at
    from public.polkagris_canes c
   where c.season = p_season
     and c.kind = 'personal'
     and c.for_driver = p_driver
     and c.appears_at >= v_shift.start_at
     and c.appears_at < v_shift.end_at;
  if v_made >= 2 then
    return;
  end if;

  select count(*)::int into v_open
    from public.polkagris_canes c
   where c.season = p_season
     and c.kind = 'personal'
     and c.for_driver = p_driver
     and c.claimed_by is null
     and c.retired_at is null
     and (c.expires_at is null or c.expires_at > p_now);
  if v_open > 0 then
    return;
  end if;

  v_delay := 3 + (mod(abs(hashtext(p_driver || v_shift.shift_key)::bigint), 8))::int;
  if v_made = 0 then
    if p_now < v_state.first_seen_at + make_interval(mins => v_delay) then
      return;
    end if;
  else
    if v_last_at is not null and p_now < v_last_at + interval '90 minutes' then
      return;
    end if;
  end if;

  v_exp := least(p_now + interval '3 hours', v_shift.end_at);
  if v_exp <= p_now then
    return;
  end if;

  -- Egna klubbor bara på sidor förarna faktiskt använder, så två per pass går att hitta.
  v_place := private.polkagris_pick_place_common(p_season, p_now);

  insert into public.polkagris_canes (
    season, place_key, appears_at, next_at, kind, for_driver, expires_at, points
  ) values (
    p_season,
    v_place,
    p_now,
    p_now + interval '90 minutes',
    'personal',
    p_driver,
    v_exp,
    1
  );
end;
$$;

drop function if exists private.polkagris_maybe_spawn(smallint, timestamptz);

create or replace function private.polkagris_maybe_spawn(
  p_season smallint,
  p_now timestamptz,
  p_driver text,
  p_quota_date date
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
begin
  perform pg_advisory_xact_lock(87202301, p_season::integer);
  perform private.polkagris_retire(p_season, p_now);
  perform private.polkagris_maybe_spawn_shared(p_season, p_now, p_quota_date);
  perform private.polkagris_maybe_spawn_personal(p_season, p_now, p_driver);
end;
$$;

create or replace function private.polkagris_visible_canes(
  p_season smallint, p_now timestamptz, p_driver text
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'place_key', c.place_key,
           'appears_at', c.appears_at,
           'expires_at', c.expires_at,
           'kind', c.kind,
           'points', c.points
         ) order by c.id), '[]'::jsonb)
    from public.polkagris_canes c
   where c.season = p_season
     and c.claimed_by is null
     and c.retired_at is null
     and c.appears_at <= p_now
     and (c.expires_at is null or c.expires_at > p_now)
     and (
       c.kind in ('shared', 'golden')
       or (c.kind = 'personal' and c.for_driver = p_driver)
     );
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
           coalesce(sum(c.points), 0)::int as antal,
           max(c.claimed_at) as sist
      from public.polkagris_canes c
     where c.season = p_season
       and c.claimed_by is not null
       and c.retired_at is null
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
    'board', '[]'::jsonb
  );
end;
$$;
