-- Sjukanmälan: historik med tid + intyg skickar tillbaka ärendet till ägaren (Christian t1009u, 2026-11-07)
-- Additivt: ny tabell private.sick_events, två triggrar, sjuk_json får nyckeln 'events'. Undo: undo/20261107b_sjuk_historik_undo.sql
create table if not exists private.sick_events (
  id          bigint generated always as identity primary key,
  report_id   bigint not null references private.sick_reports(id) on delete cascade,
  at          timestamptz not null default now(),
  by_driver   text,
  kind        text not null check (kind in ('created', 'status', 'cert')),
  from_status text,
  to_status   text,
  comment     text
);
create index if not exists sick_events_report_idx on private.sick_events (report_id, at);
revoke all on private.sick_events from public, anon, authenticated;

-- Ny sjukanmälan → händelse "Anmäld"
create or replace function private.sick_ev_ins() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  insert into private.sick_events (report_id, at, by_driver, kind, to_status) values (new.id, new.created_at, new.driver_id, 'created', new.status);
  return null;
end $$;
drop trigger if exists sick_ev_ins on private.sick_reports;
create trigger sick_ev_ins after insert on private.sick_reports for each row execute function private.sick_ev_ins();

-- Statusbyte → händelse (vem, från, till, kommentar)
create or replace function private.sick_ev_status() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if new.status is distinct from old.status then
    insert into private.sick_events (report_id, at, by_driver, kind, from_status, to_status, comment)
    values (new.id, coalesce(new.status_at, now()), new.status_by, 'status', old.status, new.status, new.status_comment);
  end if;
  return null;
end $$;
drop trigger if exists sick_ev_status on private.sick_reports;
create trigger sick_ev_status after update of status on private.sick_reports for each row execute function private.sick_ev_status();

-- Intyg färdiguppladdat → händelse. Laddar FÖRAREN upp när ägaren väntar på intyg → status tillbaka till 'ny'
-- (= "Behöver ditt svar" hos admin). Statusbytet loggas av triggern ovan.
create or replace function private.sick_ev_cert() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare r private.sick_reports;
begin
  if new.uploaded and not coalesce(old.uploaded, false) then
    insert into private.sick_events (report_id, by_driver, kind) values (new.report_id, new.uploaded_by, 'cert');
    select * into r from private.sick_reports where id = new.report_id;
    if r.status = 'intyg_begart' and new.uploaded_by = r.driver_id then
      update private.sick_reports set status = 'ny', status_by = new.uploaded_by, status_comment = null,
             status_at = now() + interval '1 millisecond', updated_at = now() where id = r.id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists sick_ev_cert on private.sick_certs;
create trigger sick_ev_cert after update of uploaded on private.sick_certs for each row execute function private.sick_ev_cert();

-- Bakåtfyll: befintliga perioder, statusbeslut och intyg (bara om tabellen är tom)
insert into private.sick_events (report_id, at, by_driver, kind, to_status)
  select id, created_at, driver_id, 'created', 'ny' from private.sick_reports
   where not exists (select 1 from private.sick_events);
insert into private.sick_events (report_id, at, by_driver, kind, from_status, to_status, comment)
  select id, status_at, status_by, 'status', 'ny', status, status_comment from private.sick_reports
   where status <> 'ny' and status_at is not null and not exists (select 1 from private.sick_events where kind <> 'created');
insert into private.sick_events (report_id, at, by_driver, kind)
  select report_id, created_at, uploaded_by, 'cert' from private.sick_certs
   where uploaded and not exists (select 1 from private.sick_events where kind = 'cert');

-- sjuk_json: samma som förut + 'events' (tid, vem, typ, från/till, kommentar). Inga fillänkar här.
create or replace function private.sjuk_json(r private.sick_reports, p_boss boolean)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', r.id, 'driver_id', r.driver_id, 'name', private.bil_driver_name(r.driver_id),
    'start', r.start_date, 'end', r.end_date, 'open', r.end_date is null, 'days', private.sjuk_days(r),
    'comment', r.comment, 'status', r.status, 'status_comment', r.status_comment,
    'status_by', case when r.status_by is not null then private.bil_driver_name(r.status_by) end, 'status_at', r.status_at,
    'recovered_at', r.recovered_at, 'sjuklon', r.sjuklon, 'sjuklon_at', r.sjuklon_at,
    'created_at', r.created_at,
    'certs', (select count(*) from private.sick_certs c where c.report_id = r.id and c.uploaded),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'from', e.from_status, 'to', e.to_status,
                 'comment', e.comment, 'who', private.bil_driver_name(e.by_driver), 'self', e.by_driver = r.driver_id) order by e.at, e.id)
               from private.sick_events e where e.report_id = r.id), '[]'::jsonb))
$function$;
