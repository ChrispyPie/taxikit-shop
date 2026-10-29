-- Tillfälligt (t619u): Christian (710022) ser ALLA sjukperioder i ägarlistan, även sina egna, för att testa båda sidorna.
-- Styrs av funktionsflaggan 'sjuk_se_allt'. Utan flaggan är svaret från sjuk_get exakt som förut (ingen ny nyckel).
-- Servern hindrar inte en chef från att besluta om sin egen period (det var bara appen som dolde dem), så inga andra ändringar.
-- Ta bort åtkomsten senare (en rad):
--   delete from private.feature_flags where feature = 'sjuk_se_allt';
insert into private.feature_flags (feature, driver_id) values ('sjuk_se_allt', '710022') on conflict do nothing;

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
                       where r.end_date is null or r.id in (select x.id from private.sick_reports x order by x.start_date desc, x.id desc limit 300)), '[]'::jsonb) end)
    || case when a.boss and private.has_feature(a.driver_id, 'sjuk_se_allt') then jsonb_build_object('se_allt', true) else '{}'::jsonb end;
end $$;
