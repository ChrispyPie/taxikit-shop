-- Sparar HELA råraden (alla kolumner) från månadsfilen resapost, additivt.
-- Påverkar inte trips/arkiv_trips eller appens tolkade fält.
-- Skydd: schema private (ingen åtkomst för anon/authenticated), RLS på utan policyer.
create table if not exists private.resapost_raw (
  kvittonr   text not null,
  forar      text not null,
  dat_start  text not null,
  tid_start  text not null default '',
  month      text,
  booknr     text,
  raw        jsonb not null,           -- {"KVITTONR": "...", ..., "BOOKNR": "..."} enligt filens rubrikrad
  report_id  bigint,                   -- private.probe_reports.id som raden kom från
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kvittonr, forar, dat_start, tid_start)
);
create index if not exists resapost_raw_booknr on private.resapost_raw(booknr) where booknr is not null;
create index if not exists resapost_raw_month on private.resapost_raw(month);
alter table private.resapost_raw enable row level security;
revoke all on private.resapost_raw from public, anon, authenticated;

create or replace function private.resapost_raw_load(p_report_id bigint)
returns int language plpgsql security definer set search_path = private, public as $$
declare v_n int;
begin
  with r as (select id, month, body from private.probe_reports where id = p_report_id),
  l as (select r.id, r.month, x.line, x.n from r,
          regexp_split_to_table(replace(r.body, E'\r', ''), E'\n') with ordinality x(line, n)),
  h as (select string_to_array(line, ';') hdr from l where n = 1),
  rw as (select l.id, l.month, string_to_array(l.line, ';') a from l where n > 1 and line <> ''),
  j as (select rw.id, rw.month, rw.a,
          (select jsonb_object_agg(h.hdr[i], rw.a[i]) from generate_subscripts(h.hdr, 1) i
            where h.hdr[i] <> '' and i <= array_length(rw.a, 1)) raw
        from rw, h where h.hdr[1] = 'KVITTONR'),
  d as (select distinct on (raw->>'KVITTONR', raw->>'FORAR_ID', raw->>'DAT_START', coalesce(raw->>'TID_START',''))
          * from j where length(raw->>'KVITTONR') >= 5 and length(raw->>'FORAR_ID') >= 5)
  insert into private.resapost_raw(kvittonr, forar, dat_start, tid_start, month, booknr, raw, report_id)
  select raw->>'KVITTONR', raw->>'FORAR_ID', raw->>'DAT_START', coalesce(raw->>'TID_START',''),
         month, nullif(btrim(raw->>'BOOKNR'), ''), raw, id from d
  on conflict (kvittonr, forar, dat_start, tid_start) do update
    set raw = excluded.raw, booknr = coalesce(excluded.booknr, resapost_raw.booknr),
        month = excluded.month, report_id = excluded.report_id, updated_at = now()
    where resapost_raw.raw is distinct from excluded.raw;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function private.resapost_raw_load(bigint) from public, anon, authenticated;

-- Framåt: varje ny resapost-fil som sparas via probe_put läses in automatiskt.
create or replace function private.resapost_raw_trg() returns trigger
language plpgsql security definer set search_path = private, public as $$
begin
  begin
    perform private.resapost_raw_load(new.id);
  exception when others then
    raise warning 'resapost_raw_load misslyckades för rapport %: %', new.id, sqlerrm;  -- probe_put får aldrig fallera
  end;
  return null;
end $$;
drop trigger if exists resapost_raw_after_put on private.probe_reports;
create trigger resapost_raw_after_put after insert on private.probe_reports
  for each row when (new.kind in ('bf_resa', 'resa')) execute function private.resapost_raw_trg();

-- Bakåt: redan hämtade filer (inga nya hämtningar), äldst först så nyaste vinner.
do $$ declare r record; begin
  for r in select id from private.probe_reports where kind in ('bf_resa','resa') order by id loop
    perform private.resapost_raw_load(r.id);
  end loop;
end $$;
