-- Prognoshistorik per kategori (t1835u): samma summerade antal som 20261124b, men uppdelade på
-- bokningens kategori (c: app/elbil/storbil/ovrigt/barnstol/babyskydd) och tillval (a: 'barnstol', 'babyskydd' eller '').
-- Appen räknar en bokning om dess kategori eller något tillval finns bland förarens valda kategorier.
-- Bara aggregat, inga boknings-id eller förare. De gamla tabellerna/RPC:erna lämnas orörda.
-- Bakåtfyllt från rådata (prognos_booking_history finns kvar från 3 nov, rensas efter 90 dagar).
-- Ångra: undo/20261124d_prognos_historik_kategori_undo.sql

create table if not exists public.prognos_hist_hourly_cat (
  zone_id text not null, d date not null, h int not null, c text not null, a text not null default '', n int not null,
  primary key (zone_id, d, h, c, a)
);
create table if not exists public.prognos_hist_flyg_cat (
  d date not null, flight text not null, sched timestamptz not null, c text not null, a text not null default '',
  origin text, landed timestamptz, n numeric not null,
  primary key (d, flight, sched, c, a)
);
create table if not exists public.prognos_hist_flyg_cov_cat (
  d date not null, c text not null, a text not null default '', bookings int not null, matched numeric not null, flights int not null,
  primary key (d, c, a)
);
revoke all on table public.prognos_hist_hourly_cat, public.prognos_hist_flyg_cat, public.prognos_hist_flyg_cov_cat from public, anon, authenticated;
grant all on table public.prognos_hist_hourly_cat, public.prognos_hist_flyg_cat, public.prognos_hist_flyg_cov_cat to service_role;

create or replace function private.prognos_hist_hours_cat_live(p_zone text, p_from date)
returns table (d date, h int, c text, a text, n int) language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select (b.estimated_at at time zone 'Europe/Stockholm')::date,
         extract(hour from b.estimated_at at time zone 'Europe/Stockholm')::int,
         coalesce(b.category, 'ovrigt'), coalesce(array_to_string(b.addons, '+'), ''), count(*)::int
  from public.prognos_booking_history b
  where b.zone_id = p_zone and (b.estimated_at at time zone 'Europe/Stockholm')::date >= p_from
  group by 1, 2, 3, 4
$$;

create or replace function private.prognos_hist_flyg_cat_live(p_from date)
returns table (d date, flight text, sched timestamptz, c text, a text, origin text, landed timestamptz, n numeric)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with bk as (
    select b.booking_id, b.estimated_at, coalesce(b.category, 'ovrigt') as c, coalesce(array_to_string(b.addons, '+'), '') as a,
           ((b.estimated_at at time zone 'Europe/Stockholm') - interval '6 hours')::date as d
    from public.prognos_booking_history b
    where b.zone_id = '293' and ((b.estimated_at at time zone 'Europe/Stockholm') - interval '6 hours')::date >= p_from
  ), m as (
    select bk.booking_id, bk.d, bk.c, bk.a, f.flight, f.sched, f.origin, f.landed,
           count(*) over (partition by bk.booking_id) as k
    from bk join private.got_arrivals_live() f
      on f.landed between bk.estimated_at - interval '50 minutes' and bk.estimated_at - interval '10 minutes'
  )
  select m.d, m.flight, m.sched, m.c, m.a, max(m.origin), max(m.landed), round(sum(1.0 / m.k), 2)
  from m group by m.d, m.flight, m.sched, m.c, m.a
$$;

create or replace function private.prognos_hist_flyg_cov_cat_live(p_from date)
returns table (d date, c text, a text, bookings int, matched numeric, flights int)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with fa as (select * from private.got_arrivals_live()),
  bk as (
    select b.booking_id, b.estimated_at, coalesce(b.category, 'ovrigt') as c, coalesce(array_to_string(b.addons, '+'), '') as a,
           ((b.estimated_at at time zone 'Europe/Stockholm') - interval '6 hours')::date as d
    from public.prognos_booking_history b
    where b.zone_id = '293' and ((b.estimated_at at time zone 'Europe/Stockholm') - interval '6 hours')::date >= p_from
  ), fl as (
    select ((landed at time zone 'Europe/Stockholm') - interval '6 hours')::date as d, count(*)::int as n from fa group by 1
  )
  select bk.d, bk.c, bk.a, count(*)::int,
         count(*) filter (where exists (select 1 from fa f
           where f.landed between bk.estimated_at - interval '50 minutes' and bk.estimated_at - interval '10 minutes'))::numeric,
         coalesce(max(fl.n), 0)
  from bk left join fl on fl.d = bk.d group by bk.d, bk.c, bk.a
$$;

-- Nattlig rollup: som förut, plus kategoritabellerna
create or replace function private.prognos_hist_rollup(p_days int default 10)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_from date := (now() at time zone 'Europe/Stockholm')::date - p_days; z text;
begin
  foreach z in array array['293', '161', '163', '406', '432', '15'] loop
    delete from public.prognos_hist_hourly where zone_id = z and d >= v_from;
    insert into public.prognos_hist_hourly (zone_id, d, h, n) select z, x.d, x.h, x.n from private.prognos_hist_hours_live(z, v_from) x;
    delete from public.prognos_hist_hourly_cat where zone_id = z and d >= v_from;
    insert into public.prognos_hist_hourly_cat (zone_id, d, h, c, a, n) select z, x.d, x.h, x.c, x.a, x.n from private.prognos_hist_hours_cat_live(z, v_from) x;
  end loop;
  delete from public.prognos_hist_flyg where d >= v_from;
  insert into public.prognos_hist_flyg select * from private.prognos_hist_flyg_live(v_from);
  delete from public.prognos_hist_flyg_cov where d >= v_from;
  insert into public.prognos_hist_flyg_cov select * from private.prognos_hist_flyg_cov_live(v_from);
  delete from public.prognos_hist_flyg_cat where d >= v_from;
  insert into public.prognos_hist_flyg_cat select * from private.prognos_hist_flyg_cat_live(v_from);
  delete from public.prognos_hist_flyg_cov_cat where d >= v_from;
  insert into public.prognos_hist_flyg_cov_cat select * from private.prognos_hist_flyg_cov_cat_live(v_from);
end $$;

revoke all on function private.prognos_hist_hours_cat_live(text, date), private.prognos_hist_flyg_cat_live(date),
  private.prognos_hist_flyg_cov_cat_live(date), private.prognos_hist_rollup(int) from public, anon, authenticated;

-- Läs-RPC:er per kategori (rollup för dygn äldre än 10 dagar, live för resten)
create or replace function public.prognos_historik_kat(p_token text, p_zone text)
returns json language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_cut date := (now() at time zone 'Europe/Stockholm')::date - 10;
begin
  select * into a from private.session_actor(p_token);
  if p_zone not in ('293', '161', '163', '406', '432', '15') then
    raise exception 'unknown_zone' using errcode = '22023';
  end if;
  return json_build_object('zone', p_zone, 'rows', coalesce((
    select json_agg(json_build_object('d', x.d, 'h', x.h, 'c', x.c, 'a', x.a, 'n', x.n) order by x.d, x.h) from (
      select r.d, r.h, r.c, r.a, r.n from public.prognos_hist_hourly_cat r where r.zone_id = p_zone and r.d < v_cut
      union all
      select l.d, l.h, l.c, l.a, l.n from private.prognos_hist_hours_cat_live(p_zone, v_cut) l
    ) x), '[]'::json));
end $$;
revoke all on function public.prognos_historik_kat(text, text) from public;
grant execute on function public.prognos_historik_kat(text, text) to anon, authenticated, service_role;

create or replace function public.prognos_historik_flyg_kat(p_token text)
returns json language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_cut date := (now() at time zone 'Europe/Stockholm')::date - 10;
begin
  select * into a from private.session_actor(p_token);
  return json_build_object(
    'rows', coalesce((select json_agg(json_build_object('d', x.d, 'f', x.flight, 'o', x.origin, 'c', x.c, 'a', x.a,
        'l', to_char(x.landed at time zone 'Europe/Stockholm', 'HH24:MI'),
        's', to_char(x.sched at time zone 'Europe/Stockholm', 'HH24:MI'), 'n', x.n) order by x.d, x.landed)
      from (
        select f.d, f.flight, f.sched, f.c, f.a, f.origin, f.landed, f.n from public.prognos_hist_flyg_cat f where f.d < v_cut
        union all
        select l.d, l.flight, l.sched, l.c, l.a, l.origin, l.landed, l.n from private.prognos_hist_flyg_cat_live(v_cut) l
      ) x), '[]'::json),
    'cov', coalesce((select json_agg(json_build_object('d', c.d, 'c', c.c, 'a', c.a, 'b', c.bookings, 'm', c.matched, 'fl', c.flights) order by c.d)
      from (
        select * from public.prognos_hist_flyg_cov_cat where d < v_cut
        union all
        select * from private.prognos_hist_flyg_cov_cat_live(v_cut)
      ) c), '[]'::json));
end $$;
revoke all on function public.prognos_historik_flyg_kat(text) from public;
grant execute on function public.prognos_historik_flyg_kat(text) to anon, authenticated, service_role;

-- Bakåtfyllning av kategoritabellerna (bara dem): alla dygn som finns i rådata
do $$ declare z text; begin
  foreach z in array array['293', '161', '163', '406', '432', '15'] loop
    delete from public.prognos_hist_hourly_cat where zone_id = z;
    insert into public.prognos_hist_hourly_cat (zone_id, d, h, c, a, n) select z, x.d, x.h, x.c, x.a, x.n from private.prognos_hist_hours_cat_live(z, date '2026-01-01') x;
  end loop;
  delete from public.prognos_hist_flyg_cat;
  insert into public.prognos_hist_flyg_cat select * from private.prognos_hist_flyg_cat_live(date '2026-01-01');
  delete from public.prognos_hist_flyg_cov_cat;
  insert into public.prognos_hist_flyg_cov_cat select * from private.prognos_hist_flyg_cov_cat_live(date '2026-01-01');
end $$;
