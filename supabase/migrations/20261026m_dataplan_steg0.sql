-- 20261026m_dataplan_steg0.sql
-- Dataplan steg 0: serverbyggda fakta- och dagstabeller (bara tillägg, ingen app ändras).
--
--   private.trip_fact    en rad per resa (efter samma dubblett-/ersatt-kvitto-regler som appen)
--   private.shift_fact   en rad per pass (samma dubblettnyckel som appen)
--   private.day_summary  förare × dag × bil: pass, tid, km, antal, belopp per betalsätt, BOM, dricks, inkört
--   private.dataplan_state  när tabellerna senast byggdes och hur lång tid det tog
--   private.dataplan_refresh(company_id)  bygger om allt för ett åkeri (körs manuellt; ingen cron, ingen hook)
--
-- Källor: public.trips/public.shifts (dataset 'current') och private.arkiv_trips/arkiv_shifts (dataset 'arkiv').
-- Regler (samma som TaxiData/script.js):
--   * Dubbletter: pass på (passnr|förare|startdatum 8 siffror), resor på (kvittonr|förare|startdatum);
--     första förekomsten vinner, current före arkiv, sedan ord.
--   * Ersatta kvitton (private.ersatta_kvitton, samma dataset) räknas inte.
--   * BOM = kredittyp '999': räknas inte i antal/inkört/dricks, summeras separat.
--   * Inkört = kort(160)+kredit(283)+swish(163)+kontant(1)+faktura(161)+övrigt(185)+uber(164)*(1-0.26).
--   * Resa i ett pass räknas på passets startdag, resa utanför alla pass på sin egen dag.
--   * Belopp tolkas som appens parseAmount, km som appens parseFloat, tid som appens parseTime.
--   * Passtider tolkas med private.shift_ts (samma som get_trip_data/topplistor); den klarar hårt
--     mellanslag (U+00A0) i "YYYYMMDD HH:MM" precis som appens parseShiftTime.
--     start_app_ok = false markerar pass som appen (JS) inte skulle kunna tolka.
-- Inga rättigheter till anon/authenticated. Inget anropar detta automatiskt.

-- ---------- hjälpfunktioner (JS-tolkning) ----------
create or replace function private.dp_parse_amount(p text)
returns numeric language sql immutable set search_path = '' as $$
  -- JS: parseFloat((str || '0').replace(/\s/g, '').replace(',', '.')) || 0
  select coalesce(substring(
           regexp_replace(
             regexp_replace(coalesce(nullif(p, ''), '0'), '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]', '', 'g'),
             ',', '.')
           from '^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?')::numeric, 0)
$$;

create or replace function private.dp_parse_km(p text)
returns numeric language sql immutable set search_path = '' as $$
  -- JS: parseFloat((km || '0').replace(',', '.'))  -> null betyder NaN i appen
  select substring(
           regexp_replace(
             regexp_replace(coalesce(nullif(p, ''), '0'), ',', '.'),
             '^[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', '')
           from '^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?')::numeric
$$;

create or replace function private.dp_parse_minutes(p text)
returns integer language sql immutable set search_path = '' as $$
  -- JS: parseInt(parts[0]) * 60 + parseInt(parts[1] || 0); tom -> 0; null betyder NaN
  select case
    when p is null or p = '' then 0
    else substring(split_part(p, ':', 1) from '^\s*([+-]?\d+)')::int * 60
       + case when position(':' in p) = 0 or split_part(p, ':', 2) = '' then 0
              else substring(split_part(p, ':', 2) from '^\s*([+-]?\d+)')::int end
  end
$$;

-- ---------- tabeller ----------
create table if not exists private.shift_fact (
  shift_id      bigint generated always as identity unique,
  company_id    text not null,
  source        text not null check (source in ('current', 'archive')),
  src_ord       integer not null,
  forar         text not null,
  passnr        text not null,
  start_key     text not null,                 -- 8 första siffrorna i start (appens nyckel)
  start_raw     text,
  slut_raw      text,
  st            timestamp,                     -- private.shift_ts(start)
  en            timestamp,                     -- private.shift_ts(slut)
  start_app_ok  boolean not null,              -- false = appen (JS) ser passet som ogiltigt
  day           date,                          -- st::date
  taxi          text not null default '',
  km            numeric,                       -- null = NaN i appen
  minutes       integer,
  data          jsonb not null,
  primary key (company_id, forar, passnr, start_key)
);
create index if not exists shift_fact_drv_st on private.shift_fact (company_id, forar, st);
create index if not exists shift_fact_day on private.shift_fact (company_id, day);

create table if not exists private.trip_fact (
  company_id    text not null,
  source        text not null check (source in ('current', 'archive')),
  src_ord       integer not null,
  forar         text not null,
  kvittonr      text not null,
  startdatum    text not null,
  ts            timestamp,                     -- startdatum + starttid
  taxi          text not null default '',
  kredittyp     text not null default '',
  amount        numeric not null,              -- parseAmount(belopp)
  tip           numeric not null,              -- parseAmount(dricks)
  is_bom        boolean not null,              -- kredittyp '999'
  shift_id      bigint,                        -- första passet (current före arkiv, lägst ord) resan ligger i
  shift_matches integer not null default 0,    -- antal pass resan ligger i (appen räknar resan en gång per pass)
  attr_day      date,                          -- passets startdag, annars resans egen dag
  data          jsonb not null,
  primary key (company_id, forar, kvittonr, startdatum)
);
create index if not exists trip_fact_day on private.trip_fact (company_id, attr_day, forar);
create index if not exists trip_fact_shift on private.trip_fact (shift_id);

create table if not exists private.day_summary (
  company_id    text not null,
  forar         text not null,
  day           date not null,
  taxi          text not null default '',
  shifts        integer not null default 0,
  minutes       integer not null default 0,
  km            numeric not null default 0,
  km_nan        integer not null default 0,    -- pass där appen skulle få NaN km
  trips         integer not null default 0,    -- utan BOM (= appens "antal")
  shift_trips   integer not null default 0,
  orphan_trips  integer not null default 0,
  bom_trips     integer not null default 0,
  kort          numeric not null default 0,
  kredit        numeric not null default 0,
  swish         numeric not null default 0,
  kontant       numeric not null default 0,
  uber_gross    numeric not null default 0,
  faktura       numeric not null default 0,
  ovrigt        numeric not null default 0,
  other_kr      numeric not null default 0,    -- övriga koder (räknas i antal men inte i inkört)
  bom_kr        numeric not null default 0,
  dricks        numeric not null default 0,
  inkort        numeric generated always as
                  (kort + kredit + swish + kontant + faktura + ovrigt + uber_gross * (1 - 0.26)) stored,
  primary key (company_id, forar, day, taxi)
);
create index if not exists day_summary_day on private.day_summary (company_id, day);

create table if not exists private.dataplan_state (
  company_id          text primary key,
  refreshed_at        timestamptz not null,
  ms                  integer not null,
  counts              jsonb not null,
  current_updated_at  timestamptz,
  arkiv_updated_at    timestamptz
);

alter table private.shift_fact     enable row level security;
alter table private.trip_fact      enable row level security;
alter table private.day_summary    enable row level security;
alter table private.dataplan_state enable row level security;
revoke all on private.shift_fact, private.trip_fact, private.day_summary, private.dataplan_state
  from public, anon, authenticated;

-- ---------- ombyggnad ----------
create or replace function private.dataplan_refresh(p_company text default 'default')
returns jsonb language plpgsql set search_path = '' as $$
declare
  t0 timestamptz := clock_timestamp();
  v_maxlen interval;
  v_sh int; v_tr int; v_ds int; v_ms int; v_counts jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('private.dataplan_refresh'), hashtext(p_company));

  delete from private.day_summary where company_id = p_company;
  delete from private.trip_fact   where company_id = p_company;
  delete from private.shift_fact  where company_id = p_company;

  -- Pass (ett åkeri idag: allt i current/arkiv hör till p_company)
  insert into private.shift_fact (company_id, source, src_ord, forar, passnr, start_key, start_raw, slut_raw,
                                  st, en, start_app_ok, day, taxi, km, minutes, data)
  select distinct on (f, pn, sk)
         p_company, src, ord, f, pn, sk, data->>'start', data->>'slut',
         st, en,
         -- JS: split(' '), del 2 utan U+00A0 ska vara HH:MM
         coalesce(replace(data->>'start', chr(160), '') ~ '^\d{8} \d{2}:\d{2}(:\d{2})?$', false)
           and coalesce(replace(data->>'slut', chr(160), '') ~ '^\d{8} \d{2}:\d{2}(:\d{2})?$', false),
         st::date, coalesce(data->>'taxi', ''),
         private.dp_parse_km(data->>'km'), private.dp_parse_minutes(data->>'tid'), data
    from (
      select s.*, coalesce(nullif(s.data->>'forar', ''), '710022') f,
             coalesce(s.data->>'passnr', '') pn,
             left(regexp_replace(coalesce(s.data->>'start', ''), '\D', '', 'g'), 8) sk,
             private.shift_ts(s.data->>'start') st, private.shift_ts(s.data->>'slut') en
        from (select 'current'::text src, 0 rk, ord, data from public.shifts where dataset = 'current'
              union all
              select 'archive', 1, ord, data from private.arkiv_shifts where dataset = 'arkiv') s
    ) x
   order by f, pn, sk, rk, ord;
  get diagnostics v_sh = row_count;

  select coalesce(max(en - st), interval '0') into v_maxlen
    from private.shift_fact where company_id = p_company and en >= st;

  -- Resor
  insert into private.trip_fact (company_id, source, src_ord, forar, kvittonr, startdatum, ts, taxi, kredittyp,
                                 amount, tip, is_bom, shift_id, shift_matches, attr_day, data)
  select p_company, y.src, y.ord, y.f, y.kv, y.sd, y.ts, coalesce(y.data->>'taxi', ''), coalesce(y.data->>'kredittyp', ''),
         private.dp_parse_amount(y.data->>'belopp'), private.dp_parse_amount(y.data->>'dricks'),
         coalesce(y.data->>'kredittyp', '') = '999',
         m.shift_id, coalesce(m.n, 0),
         case when m.shift_id is not null then m.day else y.ts::date end,
         y.data
    from (
      select distinct on (f, kv, sd) *
        from (
          select t.*, coalesce(nullif(t.data->>'forar', ''), '710022') f,
                 coalesce(t.data->>'kvittonr', '') kv, coalesce(t.data->>'startdatum', '') sd,
                 case when t.data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$'
                       and t.data->>'starttid' ~ '^\d{2}:\d{2}(:\d{2})?$'
                      then (t.data->>'startdatum' || ' ' || (t.data->>'starttid'))::timestamp end ts
            from (select 'current'::text src, 0 rk, 'current'::text ds, ord, data from public.trips where dataset = 'current'
                  union all
                  select 'archive', 1, 'arkiv', ord, data from private.arkiv_trips where dataset = 'arkiv') t
        ) x
       where not exists (select 1 from private.ersatta_kvitton e
                          where e.dataset = x.ds and e.kvittonr = x.kv and e.forar = x.f and e.startdatum = x.sd)
       order by f, kv, sd, rk, ord
    ) y
    left join lateral (
      select (array_agg(s.shift_id order by (s.source <> 'current'), s.src_ord))[1] as shift_id,
             (array_agg(s.day      order by (s.source <> 'current'), s.src_ord))[1] as day,
             count(*)::int as n
        from private.shift_fact s
       where s.company_id = p_company and s.forar = y.f
         and s.st is not null and s.en is not null
         and s.st <= y.ts and s.st >= y.ts - v_maxlen and s.en >= y.ts
      having count(*) > 0
    ) m on y.ts is not null;
  get diagnostics v_tr = row_count;

  -- Dagssummering
  insert into private.day_summary (company_id, forar, day, taxi, shifts, minutes, km, km_nan,
                                   trips, shift_trips, orphan_trips, bom_trips,
                                   kort, kredit, swish, kontant, uber_gross, faktura, ovrigt, other_kr, bom_kr, dricks)
  select p_company, forar, day, taxi,
         sum(shifts), sum(minutes), sum(km), sum(km_nan),
         sum(trips), sum(shift_trips), sum(orphan_trips), sum(bom_trips),
         sum(kort), sum(kredit), sum(swish), sum(kontant), sum(uber_gross), sum(faktura), sum(ovrigt),
         sum(other_kr), sum(bom_kr), sum(dricks)
    from (
      select forar, day, taxi, count(*) shifts, coalesce(sum(minutes), 0) minutes, coalesce(sum(km), 0) km,
             count(*) filter (where km is null) km_nan,
             0 trips, 0 shift_trips, 0 orphan_trips, 0 bom_trips,
             0 kort, 0 kredit, 0 swish, 0 kontant, 0 uber_gross, 0 faktura, 0 ovrigt, 0 other_kr, 0 bom_kr, 0 dricks
        from private.shift_fact
       where company_id = p_company and day is not null
       group by 1, 2, 3
      union all
      select forar, attr_day, taxi, 0, 0, 0, 0,
             count(*) filter (where not is_bom),
             count(*) filter (where not is_bom and shift_id is not null),
             count(*) filter (where not is_bom and shift_id is null),
             count(*) filter (where is_bom),
             coalesce(sum(amount) filter (where kredittyp = '160'), 0),
             coalesce(sum(amount) filter (where kredittyp = '283'), 0),
             coalesce(sum(amount) filter (where kredittyp = '163'), 0),
             coalesce(sum(amount) filter (where kredittyp = '1'), 0),
             coalesce(sum(amount) filter (where kredittyp = '164'), 0),
             coalesce(sum(amount) filter (where kredittyp = '161'), 0),
             coalesce(sum(amount) filter (where kredittyp = '185'), 0),
             coalesce(sum(amount) filter (where not is_bom and kredittyp not in ('160','283','163','1','164','161','185')), 0),
             coalesce(sum(amount) filter (where is_bom), 0),
             coalesce(sum(tip) filter (where not is_bom), 0)
        from private.trip_fact
       where company_id = p_company and attr_day is not null
       group by 1, 2, 3
    ) u
   group by forar, day, taxi;
  get diagnostics v_ds = row_count;

  v_ms := (extract(epoch from clock_timestamp() - t0) * 1000)::int;
  v_counts := jsonb_build_object(
    'shift_fact', v_sh, 'trip_fact', v_tr, 'day_summary', v_ds,
    'shifts_app_invalid', (select count(*) from private.shift_fact where company_id = p_company and not start_app_ok),
    'trips_multi_shift',  (select count(*) from private.trip_fact  where company_id = p_company and shift_matches > 1),
    'trips_no_time',      (select count(*) from private.trip_fact  where company_id = p_company and ts is null));

  insert into private.dataplan_state (company_id, refreshed_at, ms, counts, current_updated_at, arkiv_updated_at)
  values (p_company, now(), v_ms, v_counts,
          (select updated_at from public.trip_datasets where name = 'current'),
          (select updated_at from private.arkiv_datasets where name = 'arkiv'))
  on conflict (company_id) do update
     set refreshed_at = excluded.refreshed_at, ms = excluded.ms, counts = excluded.counts,
         current_updated_at = excluded.current_updated_at, arkiv_updated_at = excluded.arkiv_updated_at;

  return v_counts || jsonb_build_object('ms', v_ms);
end $$;

revoke all on function private.dp_parse_amount(text)    from public, anon, authenticated;
revoke all on function private.dp_parse_km(text)        from public, anon, authenticated;
revoke all on function private.dp_parse_minutes(text)   from public, anon, authenticated;
revoke all on function private.dataplan_refresh(text)   from public, anon, authenticated;
