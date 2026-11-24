-- Ångra 20261124d_prognos_historik_kategori: ta bort kategori-RPC:er, funktioner och tabeller,
-- och återställ nattliga rollupen till versionen i 20261124b (utan kategoritabeller).
drop function if exists public.prognos_historik_kat(text, text);
drop function if exists public.prognos_historik_flyg_kat(text);
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
revoke all on function private.prognos_hist_rollup(int) from public, anon, authenticated;
drop function if exists private.prognos_hist_hours_cat_live(text, date);
drop function if exists private.prognos_hist_flyg_cat_live(date);
drop function if exists private.prognos_hist_flyg_cov_cat_live(date);
drop table if exists public.prognos_hist_hourly_cat;
drop table if exists public.prognos_hist_flyg_cat;
drop table if exists public.prognos_hist_flyg_cov_cat;
