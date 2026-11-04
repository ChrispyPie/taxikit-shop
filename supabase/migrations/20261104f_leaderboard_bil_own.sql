-- 20261104f: Integritetsfix för Topplistor per bil (t880u). Ersätter get_leaderboard_bil från 20261104e.
--  * Vanliga förare: bara den egna bilen (pågående pass, annars senaste passet/resan) med plats och antal bilar
--    ('n') i varje lista. Inga andra bilnummer, modeller eller värden skickas.
--  * S admin (drivers.category = 'superadmin', inte master, inte demo): alla bilar som förut.
--  * Demokonto: anonyma "Bil N" som förut.
-- Ångra: supabase/migrations/undo/20261104f_leaderboard_bil_own_undo.sql

create or replace function public.get_leaderboard_bil(p_token text, p_from date, p_to date)
 returns json
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
 set work_mem to '32MB'
as $function$
declare a record; v_def text; v_upd timestamptz; r jsonb; v_old boolean; v_demo boolean; v_all boolean; v_car text;
begin
  select * into a from private.session_actor(p_token);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 or p_from < date '2000-01-01' then
    raise exception 'bad_period' using errcode = '22023';
  end if;
  v_demo := coalesce(current_setting('taxi.demo', true), '') <> '';
  -- Integritet (t880u): vanliga förare ser bara sin egen bil (pågående eller senaste passets bil).
  -- Bara riktig S admin (inte master, inte demo) ser alla bilar. Demokonto ser anonyma "Bil N" som förut.
  v_all := not v_demo and not private.is_demo() and not coalesce(a.via_master, true) and a.category = 'superadmin'
           and not exists (select 1 from private.demo_accounts d where d.driver_id = a.driver_id);
  if not v_demo then
    select upper(btrim(s.data->>'taxi')) into v_car from public.shifts s
     where s.dataset = 'current' and coalesce(s.forar, s.data->>'forar', v_def) = a.driver_id
       and coalesce(btrim(s.data->>'taxi'), '') <> ''
     order by private.shift_ts(s.data->>'start') desc nulls last, s.ord desc limit 1;
    if v_car is null then
      select upper(btrim(t.data->>'taxi')) into v_car from public.trips t
       where t.dataset = 'current' and coalesce(t.forar, t.data->>'forar', v_def) = a.driver_id
         and coalesce(btrim(t.data->>'taxi'), '') <> ''
       order by t.startdatum desc, t.data->>'starttid' desc, t.ord desc limit 1;
    end if;
  end if;
  v_old := extract(year from p_from) < extract(year from current_date);
  select meta->>'forar' into v_def from public.trip_datasets where name = 'current';
  v_upd := (select updated_at from public.trip_datasets where name = 'current');
  if v_old then v_upd := greatest(v_upd, (select updated_at from private.arkiv_datasets where name = 'arkiv')); end if;

  with sraw as (
    select 0 src, s.ord, coalesce(s.forar, s.data->>'forar', v_def) f, coalesce(s.passnr, s.data->>'passnr', '') pn, s.data
      from public.shifts s where s.dataset = 'current'
    union all
    select 1, s.ord, coalesce(s.forar, s.data->>'forar', v_def), coalesce(s.passnr, s.data->>'passnr', ''), s.data
      from private.arkiv_shifts s
     where v_old and s.dataset = 'arkiv' and s.start >= to_char(p_from - 8, 'YYYYMMDD') and s.start < to_char(p_to + 9, 'YYYYMMDD')
  ), sh0 as (
    select distinct on (f, pn, sd) f, c, st, en, km, mins from (
      select src, ord, f, pn, upper(btrim(coalesce(data->>'taxi', ''))) c, left(regexp_replace(coalesce(data->>'start', ''), '\D', '', 'g'), 8) sd,
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
     where v_old and t.dataset = 'arkiv' and t.startdatum >= to_char(p_from - 1, 'YYYY-MM-DD') and t.startdatum <= to_char(p_to + 8, 'YYYY-MM-DD')
  ), tr as (
    select distinct on (f, kn, sdt) f, c, ts, typ, amt, tip from (
      select src, ord, f, kn, upper(btrim(coalesce(data->>'taxi', ''))) c, coalesce(data->>'startdatum', '') sdt,
             case when data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$' and data->>'starttid' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                  then (data->>'startdatum' || ' ' || (data->>'starttid'))::timestamp end ts,
             coalesce(data->>'kredittyp', '') typ,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'belopp', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) amt,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'dricks', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) tip
        from traw
    ) y order by f, kn, sdt, src, ord
  ), st as (   -- per bil: pass, tid, km
    select c, count(*) skift, sum(mins) mins, sum(km) km from sh where c <> '' group by c
  ), tp as (   -- samma urval av resor som get_leaderboard, men med resans bil (eller passets om resan saknar bil)
    select coalesce(nullif(tr.c, ''), sh.c) c, tr.f, tr.typ, tr.amt, tr.tip
      from sh join tr on tr.f = sh.f and tr.ts is not null and sh.st is not null and sh.en is not null
                     and tr.ts between sh.st and sh.en and tr.typ <> '999'
    union all
    select tr.c, tr.f, tr.typ, tr.amt, tr.tip
      from tr
     where coalesce(tr.f, '') <> '' and tr.ts is not null and tr.typ <> '999'
       and tr.ts >= p_from::timestamp and tr.ts < (p_to + 1)::timestamp
       and not exists (select 1 from sh0 where sh0.f = tr.f and sh0.st is not null and sh0.en is not null
                                          and tr.ts between sh0.st and sh0.en)
  ), tt as (
    select c, count(*) antal,
           sum(case when typ in ('160','283','163','1','161','185') then amt when typ = '164' then amt * 0.74 else 0 end) inkort,
           sum(tip) dricks
      from tp where coalesce(c, '') <> '' group by c
  ), per as (
    select coalesce(st.c, tt.c) c, coalesce(st.skift, 0) skift, coalesce(st.mins, 0) mins, coalesce(st.km, 0) km,
           coalesce(tt.antal, 0) antal, coalesce(tt.inkort, 0) inkort, coalesce(tt.dricks, 0) dricks
      from st full join tt on tt.c = st.c
  ), mine as (   -- bilar som den inloggade föraren har kört i perioden
    select c from sh where sh.f = a.driver_id and c <> ''
    union select c from tp where tp.f = a.driver_id and coalesce(c, '') <> ''
  ), wk as (
    select upper(btrim(w.car_label)) c, sum(round(extract(epoch from (w.end_at - w.start_at)) / 60)) mins
      from public.workshop_hours w
     where w.status = 'approved' and coalesce(btrim(w.car_label), '') <> ''
       and (w.start_at at time zone 'Europe/Stockholm')::date between p_from and p_to
     group by 1
  ), vals as (
    select 'inkort' k, c, round(inkort) v from per
    union all select 'dricks', c, round(dricks) from per
    union all select 'krmil', c, round(inkort / (km / 10)) from per where km >= 10
    union all select 'krtimme', c, round(inkort / (mins / 60.0)) from per where mins >= 30
    union all select 'antal', c, antal from per
    union all select 'snitt', c, round(inkort / antal) from per where antal > 0
    union all select 'perskift', c, round(inkort / skift) from per where skift > 0
    union all select 'verkstad', c, mins from wk where mins > 0
  ), alias as (   -- demokonto: fasta "Bil N" efter bilnummer, samma i alla listor
    select c, 'Bil ' || row_number() over (order by c) lbl
      from (select distinct c from vals) z
  ), ranked as (
    select k, v, vals.c c, case when v_all or v_demo then exists (select 1 from mine m where m.c = vals.c) else vals.c = v_car end me,
           case when v_demo then al.lbl else vals.c end fid,
           case when v_demo then null else (select max(cr.modell) from public.cars cr where upper(btrim(cr.bilnummer)) = vals.c) end modell,
           rank() over (partition by k order by v desc) pos,
           row_number() over (partition by k order by v desc, vals.c) rn
      from vals join alias al on al.c = vals.c
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'mode', 'bil', 'updated', v_upd, 'arkiv', v_old, 'demo', v_demo, 'scope', case when v_all or v_demo then 'all' else 'own' end,
    'own', case when v_demo then null else v_car end,
    'cars', (select count(*) from per),
    'workshop_cars', (select count(*) from wk where mins > 0),
    'lists', coalesce((select jsonb_object_agg(k, obj) from (
        select k, jsonb_build_object(
          'n', count(*),
          'me', (select jsonb_build_object('pos', r2.pos, 'v', r2.v) from ranked r2 where r2.k = ranked.k and r2.me order by r2.pos limit 1),
          'rows', coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('pos', pos, 'v', v, 'du', case when me then true end, 'id', fid, 'modell', modell)) order by rn)
                   filter (where v_all or v_demo or ranked.c = v_car), '[]'::jsonb)
        ) obj
        from ranked group by k) q), '{}'::jsonb)
  ) into r;
  return r::json;
end $function$;

revoke all on function public.get_leaderboard_bil(text, date, date) from public;
grant execute on function public.get_leaderboard_bil(text, date, date) to anon, authenticated;
