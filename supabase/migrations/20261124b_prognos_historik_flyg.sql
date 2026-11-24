-- Prognoshistorik del 2:
--  * public.got_arrivals_hist: Landvetter-ankomster (flygnr, ursprung, tider) – hämtas var 30:e min
--    från appens publika GOT-cache (skiftlogg/feed/got.json), bakåtfyllt ur git-historiken från 24 okt.
--  * public.prognos_hist_hourly / public.prognos_hist_flyg: summerade dygnsrader som sparas permanent,
--    så historiken växer även när rådata (prognos_booking_history) rensas efter 90 dagar.
--  * Uppskattad flygkoppling (zon 293): en förbokning kopplas till flyg som landade 10–50 min före
--    bokningens tid; finns flera delas bokningen lika. Bara aggregat, inga boknings-id eller förare.
--  * prognos_historik(p_token, p_zone) ersätts: rollup för äldre dygn + live för senaste 10 dygnen.
-- Ångra: undo/20261124b_prognos_historik_flyg_undo.sql

create table if not exists public.got_arrivals_hist (
  flight text not null,
  sched timestamptz not null,
  est timestamptz,
  act timestamptz,
  origin text,
  airline text,
  status text,
  updated_at timestamptz not null default now(),
  primary key (flight, sched)
);
create index if not exists got_arrivals_hist_land_idx on public.got_arrivals_hist ((coalesce(act, est, sched)));
revoke all on table public.got_arrivals_hist from public, anon, authenticated;
grant all on table public.got_arrivals_hist to service_role;

create table if not exists public.prognos_hist_hourly (
  zone_id text not null, d date not null, h int not null, n int not null,
  primary key (zone_id, d, h)
);
create table if not exists public.prognos_hist_flyg (
  d date not null, flight text not null, sched timestamptz not null,
  origin text, landed timestamptz, n numeric not null,
  primary key (d, flight, sched)
);
create table if not exists public.prognos_hist_flyg_cov (
  d date primary key, bookings int not null, matched numeric not null, flights int not null
);
revoke all on table public.prognos_hist_hourly, public.prognos_hist_flyg, public.prognos_hist_flyg_cov from public, anon, authenticated;
grant all on table public.prognos_hist_hourly, public.prognos_hist_flyg, public.prognos_hist_flyg_cov to service_role;

-- Flyg som faktiskt fanns (landat/planerat; inte inställda eller strukna i förväg)
create or replace function private.got_arrivals_live()
returns table (flight text, sched timestamptz, origin text, landed timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select a.flight, a.sched, a.origin, coalesce(a.act, a.est, a.sched)
  from public.got_arrivals_hist a
  where a.act is not null or coalesce(a.status, '') in ('LAN', 'SCH', 'DEL_LIVE')
$$;

-- Hämtar GOT-cachen och sparar ankomster (upsert). Körs av cron var 30:e minut.
create or replace function private.got_arrivals_pull()
returns int language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare j jsonb; v int;
begin
  j := private.http_text('https://raw.githubusercontent.com/ChrispyPie/taxikit-shop/main/skiftlogg/feed/got.json')::jsonb;
  insert into public.got_arrivals_hist as g (flight, sched, est, act, origin, airline, status, updated_at)
  select a->>'id', (a->>'sched')::timestamptz, nullif(a->>'est', '')::timestamptz, nullif(a->>'act', '')::timestamptz,
         nullif(a->>'other', ''), nullif(a->>'airline', ''), nullif(a->>'status', ''), now()
  from jsonb_array_elements(coalesce(j->'arrivals', '[]'::jsonb)) a
  where coalesce(a->>'dir', 'ANK') = 'ANK' and nullif(a->>'id', '') is not null and nullif(a->>'sched', '') is not null
  on conflict (flight, sched) do update set
    est = coalesce(excluded.est, g.est), act = coalesce(excluded.act, g.act),
    origin = coalesce(excluded.origin, g.origin), airline = coalesce(excluded.airline, g.airline),
    -- en strykning efter att flyget varit live räknas som live
    status = case when excluded.status = 'DEL' and g.status in ('LAN', 'SCH', 'DEL_LIVE') then 'DEL_LIVE' else coalesce(excluded.status, g.status) end,
    updated_at = now();
  get diagnostics v = row_count;
  return v;
end $$;

-- Timaggregat per zon och kalenderdatum (svensk tid) från rådata
create or replace function private.prognos_hist_hours_live(p_zone text, p_from date)
returns table (d date, h int, n int) language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select (b.estimated_at at time zone 'Europe/Stockholm')::date,
         extract(hour from b.estimated_at at time zone 'Europe/Stockholm')::int, count(*)::int
  from public.prognos_booking_history b
  where b.zone_id = p_zone and (b.estimated_at at time zone 'Europe/Stockholm')::date >= p_from
  group by 1, 2
$$;

-- Uppskattad flygkoppling för zon 293 per dygn (06–06)
create or replace function private.prognos_hist_flyg_live(p_from date)
returns table (d date, flight text, sched timestamptz, origin text, landed timestamptz, n numeric)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with bk as (
    select b.booking_id, b.estimated_at,
           ((b.estimated_at at time zone 'Europe/Stockholm') - interval '6 hours')::date as d
    from public.prognos_booking_history b
    where b.zone_id = '293' and ((b.estimated_at at time zone 'Europe/Stockholm') - interval '6 hours')::date >= p_from
  ), m as (
    select bk.booking_id, bk.d, f.flight, f.sched, f.origin, f.landed,
           count(*) over (partition by bk.booking_id) as k
    from bk join private.got_arrivals_live() f
      on f.landed between bk.estimated_at - interval '50 minutes' and bk.estimated_at - interval '10 minutes'
  )
  select m.d, m.flight, m.sched, max(m.origin), max(m.landed), round(sum(1.0 / m.k), 2)
  from m group by m.d, m.flight, m.sched
$$;

create or replace function private.prognos_hist_flyg_cov_live(p_from date)
returns table (d date, bookings int, matched numeric, flights int)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with bk as (
    select b.booking_id, b.estimated_at, ((b.estimated_at at time zone 'Europe/Stockholm') - interval '6 hours')::date as d
    from public.prognos_booking_history b
    where b.zone_id = '293' and ((b.estimated_at at time zone 'Europe/Stockholm') - interval '6 hours')::date >= p_from
  ), fl as (
    select ((landed at time zone 'Europe/Stockholm') - interval '6 hours')::date as d, count(*)::int as n
    from private.got_arrivals_live() group by 1
  )
  select bk.d, count(*)::int,
         count(*) filter (where exists (select 1 from private.got_arrivals_live() f
           where f.landed between bk.estimated_at - interval '50 minutes' and bk.estimated_at - interval '10 minutes'))::numeric,
         coalesce(max(fl.n), 0)
  from bk left join fl on fl.d = bk.d group by bk.d
$$;

-- Nattlig rollup: räknar om de senaste 10 dygnen och sparar permanent (äldre rader rörs inte)
create or replace function private.prognos_hist_rollup(p_days int default 10)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_from date := (now() at time zone 'Europe/Stockholm')::date - p_days; z text;
begin
  foreach z in array array['293', '161', '163', '406', '432', '15'] loop
    delete from public.prognos_hist_hourly where zone_id = z and d >= v_from;
    insert into public.prognos_hist_hourly (zone_id, d, h, n) select z, x.d, x.h, x.n from private.prognos_hist_hours_live(z, v_from) x;
  end loop;
  delete from public.prognos_hist_flyg where d >= v_from;
  insert into public.prognos_hist_flyg select * from private.prognos_hist_flyg_live(v_from);
  delete from public.prognos_hist_flyg_cov where d >= v_from;
  insert into public.prognos_hist_flyg_cov select * from private.prognos_hist_flyg_cov_live(v_from);
end $$;

revoke all on function private.got_arrivals_live(), private.got_arrivals_pull(), private.prognos_hist_hours_live(text, date),
  private.prognos_hist_flyg_live(date), private.prognos_hist_flyg_cov_live(date), private.prognos_hist_rollup(int) from public, anon, authenticated;

-- Läs-RPC: rollup för dygn äldre än 10 dagar, live för resten. Bara summerade antal.
create or replace function public.prognos_historik(p_token text, p_zone text)
returns json language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_cut date := (now() at time zone 'Europe/Stockholm')::date - 10;
begin
  select * into a from private.session_actor(p_token);
  if p_zone = 'morgon' then
    return json_build_object('zone', 'morgon', 'rows', coalesce((
      select json_agg(json_build_object('d', m.date_iso, 'b', m.buckets, 't', m.total) order by m.date_iso)
      from (
        select distinct on (l.date_iso) l.date_iso, l.buckets, l.total
        from public.prognos_morgon_log l
        where (l.first_seen at time zone 'Europe/Stockholm') < (l.date_iso + time '04:00')
        order by l.date_iso, l.first_seen desc
      ) m), '[]'::json));
  end if;
  if p_zone not in ('293', '161', '163', '406', '432', '15') then
    raise exception 'unknown_zone' using errcode = '22023';
  end if;
  return json_build_object('zone', p_zone, 'rows', coalesce((
    select json_agg(json_build_object('d', x.d, 'h', x.h, 'n', x.n) order by x.d, x.h) from (
      select r.d, r.h, r.n from public.prognos_hist_hourly r where r.zone_id = p_zone and r.d < v_cut
      union all
      select l.d, l.h, l.n from private.prognos_hist_hours_live(p_zone, v_cut) l
    ) x), '[]'::json));
end $$;
revoke all on function public.prognos_historik(text, text) from public;
grant execute on function public.prognos_historik(text, text) to anon, authenticated, service_role;

-- Läs-RPC för flygtopplistan (laddas bara när den visas). Per dygn och flyg, uppskattat antal.
create or replace function public.prognos_historik_flyg(p_token text)
returns json language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_cut date := (now() at time zone 'Europe/Stockholm')::date - 10;
begin
  select * into a from private.session_actor(p_token);
  return json_build_object(
    'rows', coalesce((select json_agg(json_build_object('d', x.d, 'f', x.flight, 'o', x.origin,
        'l', to_char(x.landed at time zone 'Europe/Stockholm', 'HH24:MI'),
        's', to_char(x.sched at time zone 'Europe/Stockholm', 'HH24:MI'), 'n', x.n) order by x.d, x.landed)
      from (
        select f.d, f.flight, f.sched, f.origin, f.landed, f.n from public.prognos_hist_flyg f where f.d < v_cut
        union all
        select l.d, l.flight, l.sched, l.origin, l.landed, l.n from private.prognos_hist_flyg_live(v_cut) l
      ) x), '[]'::json),
    'cov', coalesce((select json_agg(json_build_object('d', c.d, 'b', c.bookings, 'm', c.matched, 'fl', c.flights) order by c.d)
      from (
        select * from public.prognos_hist_flyg_cov where d < v_cut
        union all
        select * from private.prognos_hist_flyg_cov_live(v_cut)
      ) c), '[]'::json));
end $$;
revoke all on function public.prognos_historik_flyg(text) from public;
grant execute on function public.prognos_historik_flyg(text) to anon, authenticated, service_role;

-- Schemalagda jobb
select cron.schedule('got-arrivals-pull', '7,37 * * * *', $c$set statement_timeout = '60s'; select private.got_arrivals_pull()$c$);
select cron.schedule('prognos-hist-rollup', '25 3 * * *', $c$set statement_timeout = '120s'; select private.prognos_hist_rollup(10)$c$);
