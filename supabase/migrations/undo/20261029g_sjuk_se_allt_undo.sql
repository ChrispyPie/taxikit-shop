-- Ångra 20261029g_sjuk_se_allt.sql. Räcker oftast med första raden (appen faller tillbaka av sig själv).
delete from private.feature_flags where feature = 'sjuk_se_allt';
-- Full återställning av sjuk_get (samma som i 20261029f_sjukanmalan.sql):
create or replace function public.sjuk_get(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  select * into a from private.sjuk_actor(p_token);
  return jsonb_build_object(
    'me', a.driver_id, 'boss', a.boss, 'today', private.sjuk_today(),
    'mine', coalesce((select jsonb_agg(private.sjuk_json(r, a.boss) order by r.start_date desc, r.id desc)
                        from private.sick_reports r where r.driver_id = a.driver_id), '[]'::jsonb),
    'all', case when a.boss then coalesce((select jsonb_agg(private.sjuk_json(r, true) order by (r.end_date is null) desc, r.start_date desc, r.id desc)
                        from private.sick_reports r
                       where r.end_date is null or r.id in (select x.id from private.sick_reports x order by x.start_date desc, x.id desc limit 300)), '[]'::jsonb) end);
end $$;
