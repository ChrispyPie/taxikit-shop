-- 20261106e: Topplistor + Rekordtavlan (Christian 2026-11-06).
-- Additivt: två nya RPC, inget befintligt ändras (gamla get_leaderboard* kvar tills frontend byter).
--  * public.get_topplista_metric — ranking för vald period (Dag/Vecka/Månad/År/Egen).
--  * public.get_rekord_metric — varje förares (eller bils) bästa period sedan 2025-01-01.
-- Mått: inkort, dricks, krmil, krtimme, km, antal, snitt, langst, belopp, passresor, flyg, dricks_pct, inkort_pass.
-- Borttaget i UI (inte här): timmar, verkstad, perskift. Andel tomkörning finns inte i STIG-datan (inga tomkm-fält).
-- Outliers: 0 km + belopp ≥ 500 räknas bort; pass > 16 h räknas bort.
-- Snittmått (Kr/körning, Kr/pass, Dricks %, Kr/mil, Kr/timme) kräver i REKORD minst: dag 5, vecka 15, månad 20, år 100 resor.
-- I TOPPLISTA finns ingen resegräns (bara skydd mot division: kr/mil ≥1 mil, kr/timme ≥30 min, dricks % inkört ≥100 kr).
-- Rekord visar inga datum (integritet) — bara värde och placering.
-- Bil: samma own-regel som get_leaderboard_bil (vanlig förare = bara egen bil).
-- Ångra: supabase/migrations/undo/20261106e_topplistor_rekord_undo.sql

create or replace function public.get_topplista_metric(
  p_token text, p_from date, p_to date,
  p_metric text, p_sort text default 'desc', p_entity text default 'forare'
) returns json
language plpgsql security definer
set search_path to 'pg_catalog', 'public'
set work_mem to '64MB'
as $function$
declare
  a record; v_def text; v_upd timestamptz; r jsonb;
  v_owner boolean; v_demo boolean; v_old boolean; v_all boolean; v_car text;
  v_metric text; v_sort text; v_entity text; v_asc boolean;
  v_metrics text[] := array['inkort','dricks','krmil','krtimme','km','antal','snitt','langst','belopp','passresor','flyg','dricks_pct','inkort_pass'];
begin
  select * into a from private.session_actor(p_token);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 or p_from < date '2000-01-01' then
    raise exception 'bad_period' using errcode = '22023';
  end if;
  v_metric := lower(btrim(coalesce(p_metric, '')));
  if not (v_metric = any (v_metrics)) then raise exception 'bad_metric' using errcode = '22023'; end if;
  v_sort := case when lower(coalesce(p_sort,'desc')) in ('asc','minst','min') then 'asc' else 'desc' end;
  v_asc := v_sort = 'asc';
  v_entity := case when lower(coalesce(p_entity,'forare')) in ('bil','car') then 'bil' else 'forare' end;
  v_owner := coalesce(a.category, '') = 'agare';
  v_demo := coalesce(current_setting('taxi.demo', true), '') <> '';
  v_old := extract(year from p_from) < extract(year from current_date);
  select meta->>'forar' into v_def from public.trip_datasets where name = 'current';
  v_upd := (select updated_at from public.trip_datasets where name = 'current');
  if v_old then v_upd := greatest(v_upd, (select updated_at from private.arkiv_datasets where name = 'arkiv')); end if;

  v_all := true;
  if v_entity = 'bil' then
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
  end if;

  with sraw as (
    select 0 src, s.ord, coalesce(s.forar, s.data->>'forar', v_def) f, coalesce(s.passnr, s.data->>'passnr', '') pn, s.data
      from public.shifts s where s.dataset = 'current'
    union all
    select 1, s.ord, coalesce(s.forar, s.data->>'forar', v_def), coalesce(s.passnr, s.data->>'passnr', ''), s.data
      from private.arkiv_shifts s
     where v_old and s.dataset = 'arkiv'
       and s.start >= to_char(p_from - 8, 'YYYYMMDD') and s.start < to_char(p_to + 9, 'YYYYMMDD')
  ), sh0 as (
    select distinct on (f, pn, sd) f, c, st, en, km, mins from (
      select src, ord, f, pn, upper(btrim(coalesce(data->>'taxi', ''))) c,
             left(regexp_replace(coalesce(data->>'start', ''), '\D', '', 'g'), 8) sd,
             private.shift_ts(data->>'start') st, private.shift_ts(data->>'slut') en,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'km', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) km,
             case when coalesce(data->>'tid', '') ~ '^\d+:\d{1,2}'
                  then split_part(data->>'tid', ':', 1)::int * 60 + substring(split_part(data->>'tid', ':', 2) from '^\d+')::int else 0 end mins
        from sraw
    ) x
    where st >= (p_from - 8)::timestamp and st < (p_to + 9)::timestamp
    order by f, pn, sd, src, ord
  ), sh as (
    select * from sh0
     where coalesce(f, '') <> '' and st >= p_from::timestamp and st < (p_to + 1)::timestamp
       and mins <= 960   -- outlier: pass > 16 h
  ), traw as (
    select 0 src, t.ord, coalesce(t.forar, t.data->>'forar', v_def) f, coalesce(t.kvittonr, t.data->>'kvittonr', '') kn, t.data
      from public.trips t
     where t.dataset = 'current'
       and t.startdatum >= to_char(p_from - 1, 'YYYY-MM-DD') and t.startdatum <= to_char(p_to + 8, 'YYYY-MM-DD')
    union all
    select 1, t.ord, coalesce(t.forar, t.data->>'forar', v_def), coalesce(t.kvittonr, t.data->>'kvittonr', ''), t.data
      from private.arkiv_trips t
     where v_old and t.dataset = 'arkiv'
       and t.startdatum >= to_char(p_from - 1, 'YYYY-MM-DD') and t.startdatum <= to_char(p_to + 8, 'YYYY-MM-DD')
  ), tr as (
    select distinct on (f, kn, sdt) f, c, ts, typ, amt, tip, tkm, sz, ez from (
      select src, ord, f, kn, upper(btrim(coalesce(data->>'taxi', ''))) c, coalesce(data->>'startdatum', '') sdt,
             case when data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$' and data->>'starttid' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                  then (data->>'startdatum' || ' ' || (data->>'starttid'))::timestamp end ts,
             coalesce(data->>'kredittyp', '') typ,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'belopp', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) amt,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'dricks', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) tip,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'kilometer', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) tkm,
             coalesce(data->>'startzon', '') sz, coalesce(data->>'slutzon', '') ez
        from traw
    ) y order by f, kn, sdt, src, ord
  ), tp as (
    -- resor kopplade till pass, minus BOM 999 och 0 km mega-fares
    select coalesce(nullif(tr.c, ''), sh.c) c, tr.f, tr.ts, tr.typ, tr.amt, tr.tip, tr.tkm, tr.sz, tr.ez, sh.st as sh_st
      from sh join tr on tr.f = sh.f and tr.ts is not null and sh.st is not null and sh.en is not null
                     and tr.ts between sh.st and sh.en and tr.typ <> '999'
     where not (tr.tkm < 0.05 and tr.amt >= 500)
    union all
    select tr.c, tr.f, tr.ts, tr.typ, tr.amt, tr.tip, tr.tkm, tr.sz, tr.ez, tr.ts
      from tr
     where coalesce(tr.f, '') <> '' and tr.ts is not null and tr.typ <> '999'
       and tr.ts >= p_from::timestamp and tr.ts < (p_to + 1)::timestamp
       and not (tr.tkm < 0.05 and tr.amt >= 500)
       and not exists (select 1 from sh0 where sh0.f = tr.f and sh0.st is not null and sh0.en is not null
                                          and tr.ts between sh0.st and sh0.en)
  ), st as (
    select case when v_entity = 'bil' then c else f end ent,
           count(*) skift, sum(mins) mins, sum(km) km
      from sh where (v_entity = 'forare' or c <> '')
     group by 1
  ), tt as (
    select case when v_entity = 'bil' then coalesce(c, '') else f end ent,
           count(*) antal,
           sum(case when typ in ('160','283','163','1','161','185') then amt when typ = '164' then amt * 0.74 else 0 end) inkort,
           sum(tip) dricks,
           sum(case when sz in ('291','292','293') or ez in ('291','292','293') then 1 else 0 end) flyg
      from tp where (v_entity = 'forare' or coalesce(c, '') <> '')
     group by 1
  ), per as (
    select coalesce(st.ent, tt.ent) ent,
           coalesce(st.skift, 0) skift, coalesce(st.mins, 0) mins, coalesce(st.km, 0) km,
           coalesce(tt.antal, 0) antal, coalesce(tt.inkort, 0) inkort, coalesce(tt.dricks, 0) dricks,
           coalesce(tt.flyg, 0) flyg
      from st full join tt on tt.ent = st.ent
     where coalesce(st.ent, tt.ent) <> ''
  ), trip_best as (
    select case when v_entity = 'bil' then coalesce(c, '') else f end ent,
           max(tkm) filter (where tkm >= 0.5) langst,
           max(case when typ in ('160','283','163','1','161','185') then amt when typ = '164' then amt * 0.74 else 0 end) belopp
      from tp where (v_entity = 'forare' or coalesce(c, '') <> '')
     group by 1
  ), pass_best as (
    select case when v_entity = 'bil' then coalesce(nullif(tr.c,''), sh.c) else sh.f end ent,
           max(cnt) passresor
      from (
        select sh.f, sh.c, sh.st, count(*) cnt
          from sh join tr on tr.f = sh.f and tr.ts between sh.st and sh.en and tr.typ <> '999'
                           and not (tr.tkm < 0.05 and tr.amt >= 500)
         group by sh.f, sh.c, sh.st
      ) x
     where (v_entity = 'forare' or coalesce(c, '') <> '')
     group by 1
  ), vals0 as (
    select per.ent,
      case v_metric
        when 'inkort' then round(per.inkort)
        when 'dricks' then round(per.dricks)
        when 'krmil' then case when per.km >= 10 then round(per.inkort / (per.km / 10)) end
        when 'krtimme' then case when per.mins >= 30 then round(per.inkort / (per.mins / 60.0)) end
        when 'km' then round(per.km)
        when 'antal' then per.antal
        when 'snitt' then case when per.antal > 0 then round(per.inkort / per.antal) end
        when 'flyg' then per.flyg
        when 'dricks_pct' then case when per.inkort >= 100 then round(100.0 * per.dricks / per.inkort, 1) end
        when 'inkort_pass' then case when per.skift > 0 then round(per.inkort / per.skift) end
        when 'langst' then round(coalesce(tb.langst, 0) * 10) / 10.0
        when 'belopp' then round(coalesce(tb.belopp, 0))
        when 'passresor' then coalesce(pb.passresor, 0)
      end::numeric v
    from per
    left join trip_best tb on tb.ent = per.ent
    left join pass_best pb on pb.ent = per.ent
  ), vals as (
    select * from vals0 where v is not null and (v_metric not in ('langst','belopp','passresor','flyg') or v > 0)
  ), mine as (
    select distinct case when v_entity = 'bil' then c else f end ent from sh where f = a.driver_id and (v_entity = 'forare' or c <> '')
    union
    select distinct case when v_entity = 'bil' then coalesce(c,'') else f end from tp where f = a.driver_id and (v_entity = 'forare' or coalesce(c,'') <> '')
  ), alias as (
    select ent, 'Bil ' || row_number() over (order by ent) lbl from (select distinct ent from vals) z
  ), ranked as (
    select v, vals.ent,
           case when v_entity = 'bil' then exists (select 1 from mine m where m.ent = vals.ent)
                else vals.ent = a.driver_id end me,
           case
             when v_entity = 'bil' and v_demo then al.lbl
             when v_entity = 'bil' then vals.ent
             when v_owner then vals.ent
           end fid,
           case
             when v_entity = 'forare' and v_owner then coalesce((select coalesce(nullif(btrim(coalesce(d.first_name,'')||' '||coalesce(d.last_name,'')),''), nullif(btrim(d.name),'')) from public.drivers d where d.id = vals.ent), vals.ent)
           end fname,
           case when v_entity = 'bil' and not v_demo then (select max(cr.modell) from public.cars cr where upper(btrim(cr.bilnummer)) = vals.ent) end modell,
           rank() over (order by case when v_asc then v end asc nulls last, case when not v_asc then v end desc nulls last) pos,
           row_number() over (order by case when v_asc then v end asc nulls last, case when not v_asc then v end desc nulls last, vals.ent) rn
      from vals
      left join alias al on al.ent = vals.ent
     where v_entity = 'forare'
        or v_all or v_demo
        or vals.ent = v_car
  ), filtered as (
    -- own-scope: skicka bara egen bilrad, men n = totala antalet i vals
    select * from ranked
     where v_entity = 'forare' or v_all or v_demo or me
  )
  select jsonb_build_object(
    'view', 'topplista',
    'metric', v_metric,
    'sort', v_sort,
    'entity', v_entity,
    'from', p_from, 'to', p_to,
    'named', v_owner and v_entity = 'forare',
    'demo', v_demo,
    'arkiv', v_old,
    'scope', case when v_entity = 'bil' and not v_all and not v_demo then 'own' else 'all' end,
    'own', case when v_entity = 'bil' then v_car end,
    'updated', v_upd,
    'n', (select count(*) from vals),
    'me', (select jsonb_build_object('pos', f.pos, 'v', f.v) from filtered f where f.me order by f.pos limit 1),
    'rows', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'pos', pos, 'v', v, 'du', case when me then true end,
              'id', fid, 'namn', fname, 'modell', modell
            )) order by rn)
            from filtered), '[]'::jsonb),
    'note', 'Dricks räknas bara kort (kontantdricks saknas). 0 km-megafärder och pass över 16 h filtreras bort.'
  ) into r;
  return r::json;
end $function$;

revoke all on function public.get_topplista_metric(text, date, date, text, text, text) from public;
grant execute on function public.get_topplista_metric(text, date, date, text, text, text) to anon, authenticated;

create or replace function public.get_rekord_metric(
  p_token text, p_grain text,
  p_metric text, p_sort text default 'desc', p_entity text default 'forare'
) returns json
language plpgsql security definer
set search_path to 'pg_catalog', 'public'
set work_mem to '128MB'
as $function$
declare
  a record; v_def text; v_upd timestamptz; r jsonb;
  v_owner boolean; v_demo boolean; v_all boolean; v_car text;
  v_metric text; v_sort text; v_entity text; v_asc boolean; v_grain text;
  v_since date := date '2025-01-01';
  v_min_trips int;
  v_metrics text[] := array['inkort','dricks','krmil','krtimme','km','antal','snitt','langst','belopp','passresor','flyg','dricks_pct','inkort_pass'];
  v_trip_metrics text[] := array['langst','belopp','passresor'];
begin
  select * into a from private.session_actor(p_token);
  v_grain := lower(btrim(coalesce(p_grain, 'manad')));
  if v_grain not in ('dag','vecka','manad','ar') then raise exception 'bad_grain' using errcode = '22023'; end if;
  v_metric := lower(btrim(coalesce(p_metric, '')));
  if not (v_metric = any (v_metrics)) then raise exception 'bad_metric' using errcode = '22023'; end if;
  v_sort := case when lower(coalesce(p_sort,'desc')) in ('asc','minst','min') then 'asc' else 'desc' end;
  v_asc := v_sort = 'asc';
  v_entity := case when lower(coalesce(p_entity,'forare')) in ('bil','car') then 'bil' else 'forare' end;
  v_owner := coalesce(a.category, '') = 'agare';
  v_demo := coalesce(current_setting('taxi.demo', true), '') <> '';
  v_min_trips := case v_grain when 'dag' then 5 when 'vecka' then 15 when 'manad' then 20 else 100 end;
  select meta->>'forar' into v_def from public.trip_datasets where name = 'current';
  v_upd := greatest(
    (select updated_at from public.trip_datasets where name = 'current'),
    (select updated_at from private.arkiv_datasets where name = 'arkiv')
  );

  v_all := true;
  if v_entity = 'bil' then
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
  end if;

  with sraw as (
    select 0 src, s.ord, coalesce(s.forar, s.data->>'forar', v_def) f, coalesce(s.passnr, s.data->>'passnr', '') pn, s.data
      from public.shifts s where s.dataset = 'current'
    union all
    select 1, s.ord, coalesce(s.forar, s.data->>'forar', v_def), coalesce(s.passnr, s.data->>'passnr', ''), s.data
      from private.arkiv_shifts s where s.dataset = 'arkiv'
  ), sh0 as (
    select distinct on (f, pn, sd) f, c, st, en, km, mins from (
      select src, ord, f, pn, upper(btrim(coalesce(data->>'taxi', ''))) c,
             left(regexp_replace(coalesce(data->>'start', ''), '\D', '', 'g'), 8) sd,
             private.shift_ts(data->>'start') st, private.shift_ts(data->>'slut') en,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'km', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) km,
             case when coalesce(data->>'tid', '') ~ '^\d+:\d{1,2}'
                  then split_part(data->>'tid', ':', 1)::int * 60 + substring(split_part(data->>'tid', ':', 2) from '^\d+')::int else 0 end mins
        from sraw
    ) x
    where st is not null and st >= v_since::timestamp
    order by f, pn, sd, src, ord
  ), sh as (
    select *, (st::date) d,
           case v_grain
             when 'dag' then to_char(st, 'YYYY-MM-DD')
             when 'vecka' then to_char(st, 'IYYY') || '-W' || to_char(st, 'IW')
             when 'manad' then to_char(st, 'YYYY-MM')
             else to_char(st, 'YYYY')
           end bucket
      from sh0
     where coalesce(f, '') <> '' and mins <= 960
  ), traw as (
    select 0 src, t.ord, coalesce(t.forar, t.data->>'forar', v_def) f, coalesce(t.kvittonr, t.data->>'kvittonr', '') kn, t.data
      from public.trips t where t.dataset = 'current' and t.startdatum >= '2024-12-31'
    union all
    select 1, t.ord, coalesce(t.forar, t.data->>'forar', v_def), coalesce(t.kvittonr, t.data->>'kvittonr', ''), t.data
      from private.arkiv_trips t where t.dataset = 'arkiv' and t.startdatum >= '2024-12-31'
  ), tr as (
    select distinct on (f, kn, sdt) f, c, ts, typ, amt, tip, tkm, sz, ez from (
      select src, ord, f, kn, upper(btrim(coalesce(data->>'taxi', ''))) c, coalesce(data->>'startdatum', '') sdt,
             case when data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$' and data->>'starttid' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                  then (data->>'startdatum' || ' ' || (data->>'starttid'))::timestamp end ts,
             coalesce(data->>'kredittyp', '') typ,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'belopp', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) amt,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'dricks', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) tip,
             coalesce((substring(replace(regexp_replace(coalesce(data->>'kilometer', ''), '\s', '', 'g'), ',', '.') from '^-?\d+(?:\.\d+)?'))::numeric, 0) tkm,
             coalesce(data->>'startzon', '') sz, coalesce(data->>'slutzon', '') ez
        from traw
    ) y
    where ts is not null and ts >= v_since::timestamp
    order by f, kn, sdt, src, ord
  ), tp as (
    select coalesce(nullif(tr.c, ''), sh.c) c, tr.f, tr.ts, tr.typ, tr.amt, tr.tip, tr.tkm, tr.sz, tr.ez, sh.bucket
      from sh join tr on tr.f = sh.f and tr.ts between sh.st and sh.en and tr.typ <> '999'
     where not (tr.tkm < 0.05 and tr.amt >= 500)
    union all
    select tr.c, tr.f, tr.ts, tr.typ, tr.amt, tr.tip, tr.tkm, tr.sz, tr.ez,
           case v_grain
             when 'dag' then to_char(tr.ts, 'YYYY-MM-DD')
             when 'vecka' then to_char(tr.ts, 'IYYY') || '-W' || to_char(tr.ts, 'IW')
             when 'manad' then to_char(tr.ts, 'YYYY-MM')
             else to_char(tr.ts, 'YYYY')
           end
      from tr
     where coalesce(tr.f, '') <> '' and tr.typ <> '999'
       and not (tr.tkm < 0.05 and tr.amt >= 500)
       and not exists (select 1 from sh0 where sh0.f = tr.f and sh0.st is not null and sh0.en is not null
                                          and tr.ts between sh0.st and sh0.en)
  ),
  -- period-aggregat (för summor)
  st as (
    select case when v_entity = 'bil' then c else f end ent, bucket,
           count(*) skift, sum(mins) mins, sum(km) km
      from sh where (v_entity = 'forare' or c <> '')
     group by 1, 2
  ), tt as (
    select case when v_entity = 'bil' then coalesce(c,'') else f end ent, bucket,
           count(*) antal,
           sum(case when typ in ('160','283','163','1','161','185') then amt when typ = '164' then amt * 0.74 else 0 end) inkort,
           sum(tip) dricks,
           sum(case when sz in ('291','292','293') or ez in ('291','292','293') then 1 else 0 end) flyg
      from tp where (v_entity = 'forare' or coalesce(c,'') <> '')
     group by 1, 2
  ), per as (
    select coalesce(st.ent, tt.ent) ent, coalesce(st.bucket, tt.bucket) bucket,
           coalesce(st.skift, 0) skift, coalesce(st.mins, 0) mins, coalesce(st.km, 0) km,
           coalesce(tt.antal, 0) antal, coalesce(tt.inkort, 0) inkort, coalesce(tt.dricks, 0) dricks,
           coalesce(tt.flyg, 0) flyg
      from st full join tt on tt.ent = st.ent and tt.bucket = st.bucket
     where coalesce(st.ent, tt.ent) <> ''
  ),
  -- enskilda händelser (langst/belopp/passresor): bästa någonsin, bucket = månaden för when-etikett
  trip_evt as (
    select case when v_entity = 'bil' then coalesce(c,'') else f end ent,
           tkm, amt, tip, typ, ts,
           to_char(ts, 'YYYY-MM') bucket
      from tp
     where (v_entity = 'forare' or coalesce(c,'') <> '')
  ), pass_evt as (
    select case when v_entity = 'bil' then coalesce(nullif(tr.c,''), sh.c) else sh.f end ent,
           count(*) cnt, to_char(sh.st, 'YYYY-MM') bucket
      from sh join tr on tr.f = sh.f and tr.ts between sh.st and sh.en and tr.typ <> '999'
                       and not (tr.tkm < 0.05 and tr.amt >= 500)
     where (v_entity = 'forare' or coalesce(sh.c,'') <> '')
     group by 1, sh.st, 3
  ),
  cand as (
    select ent, bucket, v from (
      select ent, bucket,
        case v_metric
          when 'inkort' then round(inkort)
          when 'dricks' then round(dricks)
          when 'krmil' then case when km >= 10 and antal >= v_min_trips then round(inkort / (km / 10)) end
          when 'krtimme' then case when mins >= 30 and antal >= v_min_trips then round(inkort / (mins / 60.0)) end
          when 'km' then round(km)
          when 'antal' then antal
          when 'snitt' then case when antal >= v_min_trips then round(inkort / antal) end
          when 'flyg' then flyg
          when 'dricks_pct' then case when inkort >= 100 and antal >= v_min_trips then round(100.0 * dricks / inkort, 1) end
          when 'inkort_pass' then case when skift > 0 and antal >= v_min_trips then round(inkort / skift) end
        end::numeric v
      from per
      where not (v_metric = any (v_trip_metrics))
    ) x where v is not null and (v_metric not in ('flyg') or v > 0)
    union all
    select ent, bucket, v from (
      select ent, bucket, round(tkm * 10) / 10.0 v,
             row_number() over (partition by ent order by tkm desc, ts) rn
        from trip_evt where v_metric = 'langst' and tkm >= 0.5
    ) z where rn = 1
    union all
    select ent, bucket, v from (
      select ent, bucket,
             round(case when typ in ('160','283','163','1','161','185') then amt when typ = '164' then amt * 0.74 else 0 end) v,
             row_number() over (partition by ent order by
               case when typ in ('160','283','163','1','161','185') then amt when typ = '164' then amt * 0.74 else 0 end desc, ts) rn
        from trip_evt where v_metric = 'belopp'
    ) z where rn = 1 and v > 0
    union all
    select ent, bucket, v from (
      select ent, bucket, cnt::numeric v,
             row_number() over (partition by ent order by cnt desc, bucket desc) rn
        from pass_evt where v_metric = 'passresor'
    ) z where rn = 1 and v > 0
  ),
  -- bästa perioden per entitet
  best as (
    select distinct on (ent) ent, bucket, v
      from cand
     order by ent,
              case when v_asc then v end asc nulls last,
              case when not v_asc then v end desc nulls last,
              bucket desc
  ), mine as (
    select distinct case when v_entity = 'bil' then c else f end ent from sh where f = a.driver_id and (v_entity = 'forare' or c <> '')
  ), alias as (
    select ent, 'Bil ' || row_number() over (order by ent) lbl from (select distinct ent from best) z
  ), ranked as (
    select b.v, b.ent, b.bucket,
           case when v_entity = 'bil' then exists (select 1 from mine m where m.ent = b.ent)
                else b.ent = a.driver_id end me,
           case
             when v_entity = 'bil' and v_demo then al.lbl
             when v_entity = 'bil' then b.ent
             when v_owner then b.ent
           end fid,
           case
             when v_entity = 'forare' and v_owner then coalesce((select coalesce(nullif(btrim(coalesce(d.first_name,'')||' '||coalesce(d.last_name,'')),''), nullif(btrim(d.name),'')) from public.drivers d where d.id = b.ent), b.ent)
           end fname,
           case when v_entity = 'bil' and not v_demo then (select max(cr.modell) from public.cars cr where upper(btrim(cr.bilnummer)) = b.ent) end modell,
           rank() over (order by case when v_asc then b.v end asc nulls last, case when not v_asc then b.v end desc nulls last) pos,
           row_number() over (order by case when v_asc then b.v end asc nulls last, case when not v_asc then b.v end desc nulls last, b.ent) rn
      from best b
      left join alias al on al.ent = b.ent
     where v_entity = 'forare' or v_all or v_demo or b.ent = v_car
  ), filtered as (
    select * from ranked where v_entity = 'forare' or v_all or v_demo or me
  )
  select jsonb_build_object(
    'view', 'rekord',
    'metric', v_metric,
    'sort', v_sort,
    'entity', v_entity,
    'grain', v_grain,
    'since', v_since,
    'named', v_owner and v_entity = 'forare',
    'demo', v_demo,
    'scope', case when v_entity = 'bil' and not v_all and not v_demo then 'own' else 'all' end,
    'own', case when v_entity = 'bil' then v_car end,
    'updated', v_upd,
    'min_trips', case when v_metric in ('snitt','inkort_pass','dricks_pct','krmil','krtimme') then v_min_trips end,
    'n', (select count(*) from best),
    'me', (select jsonb_build_object('pos', f.pos, 'v', f.v) from filtered f where f.me order by f.pos limit 1),
    'rows', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'pos', pos, 'v', v, 'du', case when me then true end,
              'id', fid, 'namn', fname, 'modell', modell
            )) order by rn)
            from filtered), '[]'::jsonb),
    'note', 'Rekord sedan jan 2025. Dricks = kort. 0 km-megafärder och pass > 16 h bortfiltreras.'
      || case when v_metric in ('snitt','inkort_pass','dricks_pct','krmil','krtimme') then ' Rekord kräver minst ' || v_min_trips || ' resor i perioden.' else '' end
  ) into r;
  return r::json;
end $function$;

revoke all on function public.get_rekord_metric(text, text, text, text, text) from public;
grant execute on function public.get_rekord_metric(text, text, text, text, text) to anon, authenticated;
