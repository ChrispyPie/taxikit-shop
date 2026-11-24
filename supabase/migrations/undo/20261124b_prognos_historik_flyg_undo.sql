-- Ångrar 20261124b_prognos_historik_flyg.sql och återställer den enkla prognos_historik från 20261124a.
-- Ska hela Historik bort: kör sedan undo/20261124a_prognos_historik_undo.sql.
select cron.unschedule('got-arrivals-pull');
select cron.unschedule('prognos-hist-rollup');
drop function if exists public.prognos_historik_flyg(text);
-- Enkla versionen först (den nya pekar på hjälpfunktionerna nedan)
create or replace function public.prognos_historik(p_token text, p_zone text)
returns json
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if p_zone = 'morgon' then
    -- Lämning Landvetter (292): senaste versionen som syntes före 04:00 samma morgon
    return json_build_object('zone', 'morgon', 'rows', coalesce((
      select json_agg(json_build_object('d', m.date_iso, 'b', m.buckets, 't', m.total) order by m.date_iso)
      from (
        select distinct on (l.date_iso) l.date_iso, l.buckets, l.total
        from public.prognos_morgon_log l
        where (l.first_seen at time zone 'Europe/Stockholm') < (l.date_iso + time '04:00')
        order by l.date_iso, l.first_seen desc
      ) m
    ), '[]'::json));
  end if;
  if p_zone not in ('293', '161', '163', '406', '432', '15') then
    raise exception 'unknown_zone' using errcode = '22023';
  end if;
  return json_build_object('zone', p_zone, 'rows', coalesce((
    select json_agg(json_build_object('d', x.d, 'h', x.h, 'n', x.n) order by x.d, x.h)
    from (
      select (h.estimated_at at time zone 'Europe/Stockholm')::date as d,
             extract(hour from h.estimated_at at time zone 'Europe/Stockholm')::int as h,
             count(*)::int as n
      from public.prognos_booking_history h
      where h.zone_id = p_zone
      group by 1, 2
    ) x
  ), '[]'::json));
end $$;

revoke all on function public.prognos_historik(text, text) from public;
grant execute on function public.prognos_historik(text, text) to anon, authenticated, service_role;

drop function if exists private.prognos_hist_rollup(int);
drop function if exists private.prognos_hist_flyg_cov_live(date);
drop function if exists private.prognos_hist_flyg_live(date);
drop function if exists private.prognos_hist_hours_live(text, date);
drop function if exists private.got_arrivals_pull();
drop function if exists private.got_arrivals_live();
-- Tabellerna innehåller bara aggregat/flygtider. Ta bort först när du är säker:
-- drop table if exists public.prognos_hist_flyg_cov, public.prognos_hist_flyg, public.prognos_hist_hourly, public.got_arrivals_hist;
