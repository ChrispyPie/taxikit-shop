-- t379u/t380u: Arkiv för äldre STIG-år (2025 först). Lagring + import. KÖRS LIVE för att kunna hålla datan.
--
-- Äldre år ligger HELT utanför appens tabeller: private.arkiv_trips / private.arkiv_shifts (schema private
-- syns inte i API:t). Ingen befintlig RPC läser dem (get_trip_data, get_leaderboard, admin_list_drivers,
-- list_trip_datasets, bil_current_car m.fl. läser public.trips/shifts/trip_datasets). Appen kan bara nå
-- arkivet via public.get_trip_archive (separat migration 20261026l, i PR, inte live förrän "kör").
--
-- Import: private.arkiv_import_month / private.arkiv_fill_shifts = exakt samma logik som
-- private.bf_import_month / bf_fill_shifts (samma resenyckel, passnyckel, rättade kvitton) men
-- tabellerna utbytta och en spärr som bara tillåter dataset som börjar på 'arkiv'.
-- Checkpoint (private.backfill_checkpoint) och ersatta kvitton (private.ersatta_kvitton) får dataset 'arkiv'.
--
-- Additivt: nya tabeller och funktioner. Inga ALTER/DROP. Ångra: /workspace/backups/UNDO-arkiv-2026-10-26.md

create table if not exists private.arkiv_trips (like public.trips including defaults including constraints including indexes);
create table if not exists private.arkiv_shifts (like public.shifts including defaults including constraints including indexes);
create index if not exists arkiv_trips_dataset_startdatum on private.arkiv_trips (dataset, startdatum);
create index if not exists arkiv_shifts_dataset_start on private.arkiv_shifts (dataset, start);
create table if not exists private.arkiv_datasets (
  name text primary key, trip_count int not null default 0, shift_count int not null default 0,
  updated_at timestamptz not null default now(), note text);
insert into private.arkiv_datasets(name, note) values ('arkiv', 'Äldre STIG-år (före 2026), importerade månad för månad')
  on conflict do nothing;
alter table private.arkiv_trips enable row level security;
alter table private.arkiv_shifts enable row level security;
alter table private.arkiv_datasets enable row level security;
revoke all on private.arkiv_trips, private.arkiv_shifts, private.arkiv_datasets from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.arkiv_import_month(p_month text, p_dataset text DEFAULT 'arkiv'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_pass int; v_resa int; v_ym text := replace(p_month,'-',''); r jsonb;
  n_src int; n_srcs int; n_add int; n_adds int; n_taxi int; n_rep int; v_kr numeric;
begin
  if p_dataset !~ '^arkiv' then raise exception 'arkiv_only'; end if;  -- skriver aldrig till appens dataset
  if p_month !~ '^20\d\d-(0[1-9]|1[0-2])$' then raise exception 'bad_month'; end if;
  if exists (select 1 from private.backfill_checkpoint where month = p_month and dataset = p_dataset) then
    return jsonb_build_object('month', p_month, 'skipped', 'redan importerad');
  end if;
  select max(id) into v_pass from private.probe_reports where month = p_month and kind = 'bf_pass';
  select max(id) into v_resa from private.probe_reports where month = p_month and kind = 'bf_resa';
  if v_pass is null or v_resa is null then raise exception 'saknar staging för %', p_month; end if;

  create temp table s_trips on commit drop as
  with l as (select line, n from private.probe_reports r, regexp_split_to_table(r.body, E'\r?\n') with ordinality x(line, n) where r.id = v_resa),
  p as (select string_to_array(line, ';') a, n from l where n > 1 and line <> '')
  select n, a[1] kvittonr, a[6] forar, nullif(a[8],'') taxi,
    substr(a[2],1,4)||'-'||substr(a[2],5,2)||'-'||substr(a[2],7,2) startdatum,
    jsonb_strip_nulls(jsonb_build_object(
      'kvittonr', a[1], 'forar', a[6], 'taxi', nullif(a[8],''), 'startzon', nullif(a[20],''), 'slutzon', nullif(a[21],''),
      'kilometer', replace(to_char(coalesce(nullif(a[18],'')::numeric,0)/10,'FM999990.0'),'.',','),
      'dricks', replace(to_char(coalesce(nullif(a[15],'')::numeric,0),'FM999990.00'),'.',','),
      'kredittyp', nullif(a[19],''),
      'belopp', replace(to_char(coalesce(nullif(a[10],'')::numeric,0),'FM999990.00'),'.',','),
      'starttid', case when length(a[3])>=4 then substr(a[3],1,2)||':'||substr(a[3],3,2) else '00:00' end,
      'sluttid', case when length(a[5])>=12 then substr(a[5],9,2)||':'||substr(a[5],11,2) else '00:00' end,
      'startdatum', substr(a[2],1,4)||'-'||substr(a[2],5,2)||'-'||substr(a[2],7,2))) d
  from p where length(a[1]) >= 5 and length(a[6]) >= 5 and a[2] like v_ym||'%';
  select count(*), sum(replace(d->>'belopp',',','.')::numeric) into n_src, v_kr from s_trips;

  -- 1) fyll bara tomma fält på befintliga rader (skriv aldrig över ifyllda värden);
  --    taxi fylls bara när resan tydligt stämmer (förare, kvitto, datum, starttid, belopp)
  with m as (select t.dataset, t.ord, t.data old, s.d new,
       (t.data->>'startdatum' = s.startdatum and t.data->>'starttid' = s.d->>'starttid' and t.data->>'belopp' = s.d->>'belopp') clear
     from private.arkiv_trips t join s_trips s on t.dataset = p_dataset and t.kvittonr = s.kvittonr and t.forar = s.forar
      and (coalesce(t.data->>'startdatum','') = '' or t.data->>'startdatum' = s.startdatum)),
  f as (select m.*, (select coalesce(jsonb_object_agg(k, v), '{}') from jsonb_each(m.new) e(k, v)
          where coalesce(m.old->>k, '') = '' and (k <> 'taxi' or m.clear)) fill from m)
  update private.arkiv_trips t set data = t.data || f.fill from f where f.fill <> '{}' and t.dataset = f.dataset and t.ord = f.ord;
  get diagnostics n_taxi = row_count;

  -- 2) nya rader enligt nyckeln taxi + förare + kvittonr + startdatum (taxi/datum som saknas = jokertecken)
  create temp table s_new on commit drop as
  select s.* from s_trips s where not exists (
    select 1 from private.arkiv_trips t where t.dataset = p_dataset and t.kvittonr = s.kvittonr and t.forar = s.forar
      and (coalesce(t.data->>'startdatum','') = '' or t.data->>'startdatum' = s.startdatum)
      and (coalesce(t.data->>'taxi','') = '' or s.taxi is null or t.data->>'taxi' = s.taxi))
  and not exists (select 1 from private.ersatta_kvitton e where e.dataset = p_dataset and e.kvittonr = s.kvittonr and e.forar = s.forar and e.startdatum = s.startdatum);
  insert into private.arkiv_trips(dataset, ord, forar, startdatum, kvittonr, data)
    select p_dataset, (select coalesce(max(ord),-1) from private.arkiv_trips x where x.dataset = p_dataset) + row_number() over (order by n),
           forar, startdatum, kvittonr, d from s_new;
  get diagnostics n_add = row_count;

  -- 3) rättade kvitton: lägre löpnummer ersätts av högre (samma grundnummer, förare, taxi om båda har, 0–31 dagar)
  create temp table s_rep on commit drop as
  select t.dataset, t.ord, t.kvittonr, t.forar, t.data,
    (select o.kvittonr from private.arkiv_trips o where o.dataset = t.dataset and o.forar = t.forar and o.kvittonr ~ '^\d+-\d+$'
       and split_part(o.kvittonr,'-',1) = split_part(t.kvittonr,'-',1)
       and split_part(o.kvittonr,'-',2)::int > split_part(t.kvittonr,'-',2)::int
       and (coalesce(o.data->>'taxi','') = '' or coalesce(t.data->>'taxi','') = '' or o.data->>'taxi' = t.data->>'taxi')
       and (coalesce(o.data->>'startdatum','') !~ '^\d{4}-\d\d-\d\d$' or coalesce(t.data->>'startdatum','') !~ '^\d{4}-\d\d-\d\d$'
            or ((o.data->>'startdatum')::date - (t.data->>'startdatum')::date) between 0 and 31)
     order by split_part(o.kvittonr,'-',2)::int desc limit 1) hi
  from private.arkiv_trips t where t.dataset = p_dataset and t.kvittonr ~ '^\d+-\d+$'
    and split_part(t.kvittonr,'-',1) in (select split_part(kvittonr,'-',1) from s_trips where kvittonr !~ '-0?1$'
                                          union select split_part(kvittonr,'-',1) from private.arkiv_trips where dataset = p_dataset and kvittonr !~ '-0?1$');
  insert into private.ersatta_kvitton(dataset, kvittonr, forar, startdatum, taxi, ersatt_av, data)
    select dataset, kvittonr, forar, coalesce(data->>'startdatum',''), data->>'taxi', hi, data || jsonb_build_object('ersatt_av', hi)
    from s_rep where hi is not null on conflict do nothing;
  delete from private.arkiv_trips t using s_rep r where r.hi is not null and t.dataset = r.dataset and t.ord = r.ord;
  get diagnostics n_rep = row_count;

  -- 4) pass som saknas (passnr + förare)
  with l as (select line, n from private.probe_reports r, regexp_split_to_table(r.body, E'\r?\n') with ordinality x(line, n) where r.id = v_pass),
  p as (select string_to_array(line, ';') a, n from l where n > 1 and line <> ''),
  src as (select n, jsonb_build_object('taxi', a[1], 'passnr', a[2], 'forar', a[3],
      'start', substr(a[4],1,8)||' '||substr(a[4],9,2)||':'||substr(a[4],11,2),
      'slut',  substr(a[5],1,8)||' '||substr(a[5],9,2)||':'||substr(a[5],11,2),
      'tid', (select (m/60)::text||':'||lpad((m%60)::text,2,'0') from (select (((substr(a[5],9,2)::int*60+substr(a[5],11,2)::int) - (substr(a[4],9,2)::int*60+substr(a[4],11,2)::int)) + 1440) % 1440 m) z),
      'resor', a[16], 'inkort', a[17], 'km', a[19]) d
    from p where a[2] <> '' and length(a[3]) >= 5 and length(a[4]) >= 12 and length(a[5]) >= 12)
  select count(*) into n_srcs from src;
  with l as (select line, n from private.probe_reports r, regexp_split_to_table(r.body, E'\r?\n') with ordinality x(line, n) where r.id = v_pass),
  p as (select string_to_array(line, ';') a, n from l where n > 1 and line <> ''),
  src as (select n, jsonb_build_object('taxi', a[1], 'passnr', a[2], 'forar', a[3],
      'start', substr(a[4],1,8)||' '||substr(a[4],9,2)||':'||substr(a[4],11,2),
      'slut',  substr(a[5],1,8)||' '||substr(a[5],9,2)||':'||substr(a[5],11,2),
      'tid', (select (m/60)::text||':'||lpad((m%60)::text,2,'0') from (select (((substr(a[5],9,2)::int*60+substr(a[5],11,2)::int) - (substr(a[4],9,2)::int*60+substr(a[4],11,2)::int)) + 1440) % 1440 m) z),
      'resor', a[16], 'inkort', a[17], 'km', a[19]) d
    from p where a[2] <> '' and length(a[3]) >= 5 and length(a[4]) >= 12 and length(a[5]) >= 12),
  todo as (select * from src where not exists (select 1 from private.arkiv_shifts s where s.dataset = p_dataset and s.passnr = src.d->>'passnr' and s.forar = src.d->>'forar' and left(regexp_replace(coalesce(s.start,''), '\D', '', 'g'), 8) = left(src.d->>'start', 8)))
  insert into private.arkiv_shifts(dataset, ord, forar, start, passnr, data)
    select p_dataset, (select coalesce(max(ord),-1) from private.arkiv_shifts x where x.dataset = p_dataset) + row_number() over (order by n),
           d->>'forar', d->>'start', d->>'passnr', d from todo;
  get diagnostics n_adds = row_count;

  update private.arkiv_datasets d set trip_count = (select count(*) from private.arkiv_trips t where t.dataset = d.name),
    shift_count = (select count(*) from private.arkiv_shifts s where s.dataset = d.name) where name = p_dataset;
  insert into private.backfill_checkpoint(month, dataset, src_trips, src_shifts, trips_added, shifts_added, taxi_filled, replaced, src_kr)
    values (p_month, p_dataset, n_src, n_srcs, n_add, n_adds, n_taxi, n_rep, v_kr);
  return jsonb_build_object('month', p_month, 'src_trips', n_src, 'src_shifts', n_srcs, 'trips_added', n_add,
    'shifts_added', n_adds, 'taxi_filled', n_taxi, 'replaced', n_rep, 'src_kr', v_kr);
end $function$;
revoke all on function private.arkiv_import_month(text, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.arkiv_fill_shifts(p_month text, p_dataset text DEFAULT 'arkiv'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_pass int; n_adds int;
begin
  if p_dataset !~ '^arkiv' then raise exception 'arkiv_only'; end if;  -- skriver aldrig till appens dataset
  select max(id) into v_pass from private.probe_reports where month = p_month and kind = 'bf_pass';
  if v_pass is null then raise exception 'saknar staging för %', p_month; end if;
  with l as (select line, n from private.probe_reports r, regexp_split_to_table(r.body, E'\r?\n') with ordinality x(line, n) where r.id = v_pass),
  p as (select string_to_array(line, ';') a, n from l where n > 1 and line <> ''),
  src as (select n, jsonb_build_object('taxi', a[1], 'passnr', a[2], 'forar', a[3],
      'start', substr(a[4],1,8)||' '||substr(a[4],9,2)||':'||substr(a[4],11,2),
      'slut',  substr(a[5],1,8)||' '||substr(a[5],9,2)||':'||substr(a[5],11,2),
      'tid', (select (m/60)::text||':'||lpad((m%60)::text,2,'0') from (select (((substr(a[5],9,2)::int*60+substr(a[5],11,2)::int) - (substr(a[4],9,2)::int*60+substr(a[4],11,2)::int)) + 1440) % 1440 m) z),
      'resor', a[16], 'inkort', a[17], 'km', a[19]) d
    from p where a[2] <> '' and length(a[3]) >= 5 and length(a[4]) >= 12 and length(a[5]) >= 12),
  todo as (select * from src where not exists (select 1 from private.arkiv_shifts s where s.dataset = p_dataset and s.passnr = src.d->>'passnr' and s.forar = src.d->>'forar' and left(regexp_replace(coalesce(s.start,''), '\D', '', 'g'), 8) = left(src.d->>'start', 8)))
  insert into private.arkiv_shifts(dataset, ord, forar, start, passnr, data)
    select p_dataset, (select coalesce(max(ord),-1) from private.arkiv_shifts x where x.dataset = p_dataset) + row_number() over (order by n),
           d->>'forar', d->>'start', d->>'passnr', d from todo;
  get diagnostics n_adds = row_count;
  update private.arkiv_datasets d set shift_count = (select count(*) from private.arkiv_shifts s where s.dataset = d.name) where name = p_dataset;
  update private.backfill_checkpoint set shifts_added = shifts_added + n_adds,
    note = coalesce(note || '; ', '') || 'pass med återanvänt passnr: ' || n_adds where month = p_month and dataset = p_dataset;
  return n_adds;
end $function$;
revoke all on function private.arkiv_fill_shifts(text, text) from public, anon, authenticated;
