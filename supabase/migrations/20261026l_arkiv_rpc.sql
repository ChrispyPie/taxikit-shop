-- t379u/t380u/t381u: Arkivet för äldre år (2025 …) – hämtas AUTOMATISKT men bara när man bläddrar till en
-- period som är äldre än innevarande år (t.ex. Månad: jan 2026 → dec 2025). Inget hämtas vid start eller i år.
-- INTE körd live förrän Christian säger "kör". Kräver 20261026k_arkiv_lagring.sql (körd 26 okt).
--
-- public.get_trip_archive(p_token, p_year, p_month default null)
--   → samma format som get_trip_data ({ trips:[…], shifts:[…], arkiv, year, month, arkiv_updated }),
--   men bara för ETT år (förare, Körpassdata) eller ETT år + månad (ägaren och Åkeridata, så att varje svar blir litet).
--   Varje resa hör till exakt en bit: till samma månad som sitt pass (även om passet går över midnatt in i nästa
--   månad), annars till sin egen månad. Då blir det inga dubbletter när flera månader hämtas.
-- public.get_leaderboard_archive(p_token, p_from, p_to)
--   → samma svar som get_leaderboard, men räknat på servern över arkivet + nuvarande data (för perioder som går
--   in i äldre år, t.ex. vecka 1 som börjar 29 dec). Litet svar (bara placeringar och värden).
--   Listan 'timmar' (Flest jobbade timmar) räknas inte alls (borttagen 2026-10-26).
--
-- Samma behörighet och anonymisering som get_trip_data / get_leaderboard:
--   * ägaren: allt (med förar-id); topplistor med namn
--   * private.company_view_roles(): allt, men andra förares id ersatt (prefix 'ap'/'an' i stället för
--     'p'/'n', så att de inte krockar med nycklarna från 'current' när appen lägger ihop dem)
--   * övriga: bara egen data; topplistor utan namn och id (bara den egna raden markerad).
--     Demokonton har alltid kategori 'standard' och driver_id = private.demo_source() via private.session_actor →
--     förar-demot ser 710022:s arkiv (bara läsning, 710022 har 0 resor 2025), ägar-demot får heller ingen
--     riktig åkeridata (kategori standard = bara 710022:s egna rader) och topplistor utan namn.
-- Additivt: två nya funktioner. Inga ALTER/DROP/ändringar av befintliga funktioner.

create or replace function public.get_trip_archive(p_token text, p_year int, p_month int default null)
returns json language plpgsql stable security definer
set search_path to 'pg_catalog', 'public'
set work_mem to '32MB' as $$
declare a record; v_cat text; v_all boolean; v_anon boolean; v_lo date; v_hi date; r json;
begin
  select * into a from private.session_actor(p_token);
  v_cat := coalesce(a.category, '');
  if p_year is null or p_year < 2000 or p_year > 2100 then raise exception 'bad_year' using errcode = '22023'; end if;
  if p_month is not null and (p_month < 1 or p_month > 12) then raise exception 'bad_month' using errcode = '22023'; end if;
  v_anon := v_cat <> 'agare' and v_cat = any (private.company_view_roles());
  v_all := v_cat = 'agare' or v_anon;
  v_lo := make_date(p_year, coalesce(p_month, 1), 1);
  v_hi := case when p_month is null then make_date(p_year + 1, 1, 1) else (v_lo + interval '1 month')::date end;

  with sh as materialized (   -- pass i biten + 7 dagar före (bara för att koppla resor, skickas inte)
    select s.ord, s.data, coalesce(s.forar, s.data->>'forar') f,
           private.shift_ts(s.data->>'start') st, private.shift_ts(s.data->>'slut') en,
           (s.start >= to_char(v_lo, 'YYYYMMDD') and s.start < to_char(v_hi, 'YYYYMMDD')) inp
      from private.arkiv_shifts s
     where s.dataset = 'arkiv' and s.start >= to_char(v_lo - 7, 'YYYYMMDD') and s.start < to_char(v_hi, 'YYYYMMDD')
       and (v_all or s.forar = a.driver_id)
  ), tr as materialized (      -- resor i biten + 7 dagar efter (pass som går över månadsskiftet)
    select t.ord, t.data, coalesce(t.forar, t.data->>'forar') f, t.startdatum sd,
           case when t.data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$' and t.data->>'starttid' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                then (t.data->>'startdatum' || ' ' || (t.data->>'starttid'))::timestamp end ts
      from private.arkiv_trips t
     where t.dataset = 'arkiv' and t.startdatum >= to_char(v_lo, 'YYYY-MM-DD') and t.startdatum < to_char(v_hi + 7, 'YYYY-MM-DD')
       and (v_all or t.forar = a.driver_id)
  ), shd as (
    select sh.ord, sh.f, sh.st, sh.en, sh.inp, d::date d
      from sh, generate_series(sh.st::date, sh.en::date, interval '1 day') d
     where sh.st is not null and sh.en is not null and sh.en >= sh.st and sh.en < sh.st + interval '7 days'
  ), m as (   -- första passet (lägst ord) som resan ligger i, som i get_trip_data
    select distinct on (tr.ord) tr.ord, shd.ord sord, shd.inp
      from tr join shd on shd.f = tr.f and shd.d = tr.ts::date and tr.ts between shd.st and shd.en
     where tr.ts is not null
     order by tr.ord, shd.ord
  ), trk as (
    select tr.ord, tr.data, tr.f, m.sord
      from tr left join m on m.ord = tr.ord
     where (m.ord is not null and m.inp)
        or (m.ord is null and tr.sd >= to_char(v_lo, 'YYYY-MM-DD') and tr.sd < to_char(v_hi, 'YYYY-MM-DD'))
  )
  select json_build_object(
    'arkiv', true, 'year', p_year, 'month', p_month,
    'arkiv_updated', (select updated_at from private.arkiv_datasets where name = 'arkiv'),
    'trips', coalesce((select jsonb_agg(case when not v_anon then trk.data
                                             when trk.f = a.driver_id then trk.data || jsonb_build_object('forar', trk.f)
                                             else trk.data || jsonb_build_object('forar', coalesce('ap' || trk.sord, 'an' || trk.ord)) end
                                        order by trk.ord) from trk), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(case when not v_anon then sh.data
                                              when sh.f = a.driver_id then sh.data || jsonb_build_object('forar', sh.f)
                                              else sh.data || jsonb_build_object('forar', 'ap' || sh.ord) end
                                         order by sh.ord) from sh where sh.inp), '[]'::jsonb)
  ) into r;
  return r;
end $$;

create or replace function public.get_leaderboard_archive(p_token text, p_from date, p_to date)
returns json language plpgsql stable security definer
set search_path to 'pg_catalog', 'public'
set work_mem to '32MB' as $$
declare a record; v_def text; v_upd timestamptz; r jsonb; v_owner boolean;
begin
  select * into a from private.session_actor(p_token);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 or p_from < date '2000-01-01' then
    raise exception 'bad_period' using errcode = '22023';
  end if;
  v_owner := coalesce(a.category, '') = 'agare';   -- demokonton har alltid kategori 'standard' → inga namn
  select meta->>'forar' into v_def from public.trip_datasets where name = 'current';
  v_upd := greatest((select updated_at from public.trip_datasets where name = 'current'),
                    (select updated_at from private.arkiv_datasets where name = 'arkiv'));

  with sraw as (   -- pass från nuvarande data + arkivet, i ett fönster runt perioden (resor kan ligga i pass ±7 dagar)
    select 0 src, s.ord, coalesce(s.forar, s.data->>'forar', v_def) f, coalesce(s.passnr, s.data->>'passnr', '') pn, s.data
      from public.shifts s where s.dataset = 'current'
    union all
    select 1, s.ord, coalesce(s.forar, s.data->>'forar', v_def), coalesce(s.passnr, s.data->>'passnr', ''), s.data
      from private.arkiv_shifts s
     where s.dataset = 'arkiv' and s.start >= to_char(p_from - 8, 'YYYYMMDD') and s.start < to_char(p_to + 9, 'YYYYMMDD')
  ), sh0 as (
    select distinct on (f, pn, sd) f, st, en, km, mins from (
      select src, ord, f, pn, left(regexp_replace(coalesce(data->>'start', ''), '\D', '', 'g'), 8) sd,
             private.shift_ts(data->>'start') st, private.shift_ts(data->>'slut') en,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'km', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) km,
             case when coalesce(data->>'tid', '') ~ '^\d+:\d{1,2}'
                  then split_part(data->>'tid', ':', 1)::int * 60 + substring(split_part(data->>'tid', ':', 2) from '^\d+')::int else 0 end mins
        from sraw
    ) x
    where st >= (p_from - 8)::timestamp and st < (p_to + 9)::timestamp
    order by f, pn, sd, src, ord
  ), sh as (
    select sh0.* from sh0
     where coalesce(sh0.f, '') <> '' and sh0.st >= p_from::timestamp and sh0.st < (p_to + 1)::timestamp
  ), traw as (
    select 0 src, t.ord, coalesce(t.forar, t.data->>'forar', v_def) f, coalesce(t.kvittonr, t.data->>'kvittonr', '') kn, t.data
      from public.trips t
     where t.dataset = 'current' and t.startdatum >= to_char(p_from - 1, 'YYYY-MM-DD') and t.startdatum <= to_char(p_to + 8, 'YYYY-MM-DD')
    union all
    select 1, t.ord, coalesce(t.forar, t.data->>'forar', v_def), coalesce(t.kvittonr, t.data->>'kvittonr', ''), t.data
      from private.arkiv_trips t
     where t.dataset = 'arkiv' and t.startdatum >= to_char(p_from - 1, 'YYYY-MM-DD') and t.startdatum <= to_char(p_to + 8, 'YYYY-MM-DD')
  ), tr as (
    select distinct on (f, kn, sdt) f, ts, typ, amt, tip from (
      select src, ord, f, kn, coalesce(data->>'startdatum', '') sdt,
             case when data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$' and data->>'starttid' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                  then (data->>'startdatum' || ' ' || (data->>'starttid'))::timestamp end ts,
             coalesce(data->>'kredittyp', '') typ,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'belopp', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) amt,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'dricks', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) tip
        from traw
    ) y order by f, kn, sdt, src, ord
  ), st as (
    select f, count(*) skift, sum(mins) mins, sum(km) km from sh group by f
  ), tp as (   -- som get_leaderboard: resor i förarens pass i perioden, utom BOM (999)
    select tr.f, tr.typ, tr.amt, tr.tip
      from sh join tr on tr.f = sh.f and tr.ts is not null and sh.st is not null and sh.en is not null
                     and tr.ts between sh.st and sh.en and tr.typ <> '999'
    union all  -- resor som inte ligger i något pass: räknas på resans datum
    select tr.f, tr.typ, tr.amt, tr.tip
      from tr
     where coalesce(tr.f, '') <> '' and tr.ts is not null and tr.typ <> '999'
       and tr.ts >= p_from::timestamp and tr.ts < (p_to + 1)::timestamp
       and not exists (select 1 from sh0 where sh0.f = tr.f and sh0.st is not null and sh0.en is not null
                                          and tr.ts between sh0.st and sh0.en)
  ), tt as (
    select f, count(*) antal,
           sum(case when typ in ('160','283','163','1','161','185') then amt when typ = '164' then amt * 0.74 else 0 end) inkort,
           sum(tip) dricks
      from tp group by f
  ), per as (
    select coalesce(st.f, tt.f) f, coalesce(st.skift, 0) skift, coalesce(st.mins, 0) mins, coalesce(st.km, 0) km,
           coalesce(tt.antal, 0) antal, coalesce(tt.inkort, 0) inkort, coalesce(tt.dricks, 0) dricks
      from st full join tt on tt.f = st.f
  ), wk as (
    select w.driver_id f, sum(round(extract(epoch from (w.end_at - w.start_at)) / 60)) mins
      from public.workshop_hours w
     where w.status = 'approved'
       and (w.start_at at time zone 'Europe/Stockholm')::date between p_from and p_to
     group by w.driver_id
  ), vals as (   -- samma listor som get_leaderboard, men utan 'timmar'
    select 'inkort' k, f, round(inkort) v from per
    union all select 'dricks', f, round(dricks) from per
    union all select 'krmil', f, round(inkort / (km / 10)) from per where km >= 10
    union all select 'krtimme', f, round(inkort / (mins / 60.0)) from per where mins >= 30
    union all select 'antal', f, antal from per
    union all select 'snitt', f, round(inkort / antal) from per where antal > 0
    union all select 'perskift', f, round(inkort / skift) from per where skift > 0
    union all select 'verkstad', f, mins from wk where mins > 0
  ), ranked as (
    select k, v, (f = a.driver_id) me,
           case when v_owner then f end fid,
           case when v_owner then coalesce((select coalesce(nullif(btrim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')), ''), nullif(btrim(d.name), ''))
                                     from public.drivers d where d.id = vals.f), vals.f) end fname,
           rank() over (partition by k order by v desc) pos,
           row_number() over (partition by k order by v desc, random()) rn
      from vals
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'named', v_owner, 'updated', v_upd, 'arkiv', true,
    'drivers', (select count(*) from per),
    'workshop_drivers', (select count(*) from wk where mins > 0),
    'lists', coalesce((select jsonb_object_agg(k, obj) from (
        select k, jsonb_build_object(
          'n', count(*),
          'me', (select jsonb_build_object('pos', r2.pos, 'v', r2.v) from ranked r2 where r2.k = ranked.k and r2.me limit 1),
          'rows', jsonb_agg(jsonb_strip_nulls(jsonb_build_object('pos', pos, 'v', v, 'du', case when me then true end, 'id', fid, 'namn', fname)) order by rn)
        ) obj
        from ranked group by k) q), '{}'::jsonb)
  ) into r;
  return r::json;
end $$;

revoke all on function public.get_trip_archive(text, int, int) from public;
revoke all on function public.get_leaderboard_archive(text, date, date) from public;
grant execute on function public.get_trip_archive(text, int, int) to anon, authenticated;
grant execute on function public.get_leaderboard_archive(text, date, date) to anon, authenticated;

-- Ångra:
-- drop function if exists public.get_leaderboard_archive(text, date, date);
-- drop function if exists public.get_trip_archive(text, int, int);
