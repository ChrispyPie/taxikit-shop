-- Ångra 20261029f_sjukanmalan.sql. OBS: raderar alla sjukperioder och intyg (rader). Filerna i bucketen
-- "sjuk-intyg" måste tömmas först (Supabase Dashboard → Storage, eller storage-API:t) innan bucketen kan tas bort.
drop function if exists public.sjuk_svc_take_pushes();
drop function if exists public.sjuk_svc_cert_delete(text, bigint);
drop function if exists public.sjuk_svc_cert_list(text, bigint);
drop function if exists public.sjuk_svc_cert_finish(text, bigint, boolean);
drop function if exists public.sjuk_svc_cert_begin(text, bigint, text);
drop function if exists public.sjuk_svc_delete(text, bigint);
drop function if exists public.sjuk_set_sjuklon(text, bigint, text);
drop function if exists public.sjuk_decide(text, bigint, text, text);
drop function if exists public.sjuk_recover(text, bigint, date);
drop function if exists public.sjuk_report(text, date, text);
drop function if exists public.sjuk_get(text);
drop function if exists private.sjuk_json(private.sick_reports, boolean);
drop function if exists private.sjuk_days(private.sick_reports);
drop function if exists private.sjuk_push_driver(text, text, text, text, text);
drop function if exists private.sjuk_push_bosses(text, text, text, text);
drop function if exists private.sjuk_fmt_date(date);
drop function if exists private.sjuk_report_for(text, boolean, bigint);
drop function if exists private.sjuk_actor(text);
drop function if exists private.sjuk_today();
drop function if exists public.get_my_features(text);
drop function if exists private.has_feature(text, text);
drop table if exists private.sjuk_push_queue;
drop table if exists private.sick_certs;
drop table if exists private.sick_reports;
drop table if exists private.feature_flags;
-- delete from storage.buckets where id = 'sjuk-intyg';   -- först när bucketen är tom
