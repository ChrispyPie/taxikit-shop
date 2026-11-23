-- Adventskalender (öppnade luckor per förare och år) och polkagrisjakt
-- (en klubba i taget för alla, först till kvarn, nästa 5–60 min senare).
-- Topplistan visar namn medvetet: det är en tävling, inte taxidata.
-- Applicera inte förrän Christian ger kör. Klienten är grindad till 710022
-- tills dess; p_as_of (testdatum) godkänns bara för 710022.
-- Ångra: undo/20261123b_advent_polkagris_undo.sql

create table if not exists public.advent_opens (
  year smallint not null,
  day smallint not null check (day between 1 and 24),
  driver_id text not null,
  opened_at timestamptz not null default now(),
  primary key (year, day, driver_id)
);

create table if not exists public.polkagris_canes (
  id bigserial primary key,
  season smallint not null,
  place_key text not null,
  appears_at timestamptz not null default now(),
  next_at timestamptz not null,
  claimed_by text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists polkagris_canes_season_claimed
  on public.polkagris_canes (season, claimed_by, claimed_at);

-- Högst en oöppnad klubba per säsong.
create unique index if not exists polkagris_one_open
  on public.polkagris_canes (season) where claimed_by is null;

alter table public.advent_opens enable row level security;
alter table public.polkagris_canes enable row level security;
revoke all on public.advent_opens from anon, authenticated;
revoke all on public.polkagris_canes from anon, authenticated;
revoke all on sequence public.polkagris_canes_id_seq from anon, authenticated;

create or replace function private.advent_today(p_as_of date, p_driver text)
returns date
language plpgsql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
begin
  if p_as_of is not null and p_driver = '710022' then
    return p_as_of;
  end if;
  return (now() at time zone 'Europe/Stockholm')::date;
end;
$$;

create or replace function private.polkagris_places()
returns text[]
language sql
immutable
as $$
  select array[
    'hem','kordata','lonekoll','ankomster','prognos','kalender',
    'topplistor','forum','installningar','om','vader','nyheter',
    'advent','inkorg','hb'
  ]::text[];
$$;

create or replace function private.polkagris_display_name(p_driver text)
returns text
language sql
stable
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
  select coalesce(
    nullif(btrim(coalesce(d.first_name,'') || case
      when nullif(btrim(d.last_name),'') is null then ''
      else ' ' || btrim(d.last_name)
    end), ''),
    'Förare'
  )
  from public.drivers d where d.id = p_driver;
$$;

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

create or replace function public.advent_state(p_token text, p_as_of date default null)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  a record;
  v_today date;
  v_year smallint;
  v_opens jsonb;
begin
  select * into a from private.session_actor(p_token);
  v_today := private.advent_today(p_as_of, a.driver_id);
  v_year := extract(year from v_today)::smallint;
  if extract(month from v_today)::int = 1 and extract(day from v_today)::int <= 6 then
    v_year := (v_year - 1)::smallint;
  end if;
  select coalesce(jsonb_agg(o.day order by o.day), '[]'::jsonb) into v_opens
    from public.advent_opens o
   where o.year = v_year and o.driver_id = a.driver_id;
  return json_build_object(
    'year', v_year,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'month', extract(month from v_today)::int,
    'day', extract(day from v_today)::int,
    'opens', v_opens
  );
end;
$$;

create or replace function public.advent_open(p_token text, p_day integer, p_as_of date default null)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  a record;
  v_today date;
  v_year smallint;
  v_already boolean := false;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(current_setting('taxi.demo', true), '') <> '' or coalesce(a.via_master, false) then
    raise exception 'demo_read_only' using errcode = '42501';
  end if;
  if p_day is null or p_day < 1 or p_day > 24 then
    raise exception 'bad_day' using errcode = '22023';
  end if;
  v_today := private.advent_today(p_as_of, a.driver_id);
  v_year := extract(year from v_today)::smallint;
  if extract(month from v_today)::int <> 12 or p_day > extract(day from v_today)::int then
    raise exception 'too_early' using errcode = '42501';
  end if;
  insert into public.advent_opens (year, day, driver_id)
  values (v_year, p_day, a.driver_id)
  on conflict do nothing;
  if not found then v_already := true; end if;
  return json_build_object('ok', true, 'year', v_year, 'day', p_day, 'already', v_already);
end;
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
  v_winner jsonb;
begin
  select * into a from private.session_actor(p_token);
  v_today := private.advent_today(p_as_of, a.driver_id);
  v_month := extract(month from v_today)::int;
  v_day := extract(day from v_today)::int;
  if v_month = 12 then
    v_season := extract(year from v_today)::smallint;
  elsif v_month = 1 then
    v_season := (extract(year from v_today)::int - 1)::smallint;
  else
    v_season := extract(year from v_today)::smallint;
  end if;
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
  select coalesce(max(x.antal), 0) into v_mine
    from jsonb_to_recordset(v_board) as x(driver_id text, namn text, antal int, sist timestamptz)
   where x.driver_id = a.driver_id;
  if v_show_win then
    select jsonb_build_object(
      'driver_id', x.driver_id,
      'namn', x.namn,
      'antal', x.antal
    ) into v_winner
    from jsonb_to_recordset(v_board) as x(driver_id text, namn text, antal int, sist timestamptz)
    order by x.antal desc, x.sist asc, x.driver_id
    limit 1;
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
    'board', v_board,
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
  v_name text;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(current_setting('taxi.demo', true), '') <> '' or coalesce(a.via_master, false) then
    raise exception 'demo_read_only' using errcode = '42501';
  end if;
  v_today := private.advent_today(p_as_of, a.driver_id);
  v_month := extract(month from v_today)::int;
  if v_month <> 12 then
    raise exception 'not_in_season' using errcode = '42501';
  end if;
  v_season := extract(year from v_today)::smallint;
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
  if v_row.claimed_by is not null then
    v_name := private.polkagris_display_name(v_row.claimed_by);
  end if;

  return json_build_object(
    'ok', v_ok,
    'already', (not v_ok and v_row.claimed_by is not null),
    'cane_id', v_row.id,
    'claimed_by', v_row.claimed_by,
    'namn', v_name,
    'mine', (select count(*)::int from public.polkagris_canes c
              where c.season = v_season and c.claimed_by = a.driver_id),
    'board', private.polkagris_board(v_season)
  );
end;
$$;

grant execute on function public.advent_state(text, date) to anon, authenticated;
grant execute on function public.advent_open(text, integer, date) to anon, authenticated;
grant execute on function public.polkagris_state(text, date) to anon, authenticated;
grant execute on function public.polkagris_claim(text, bigint, date) to anon, authenticated;
