-- Ångra offentlig förarprofil (20261106d). Kör EFTER frontend backats.
drop function if exists public.profile_forum_list(text, text, text);
drop function if exists public.profile_get(text);
drop function if exists public.profile_get(text, text);
drop function if exists public.profile_save(text, jsonb);
drop function if exists public.profile_gallery_list(text, text);
drop function if exists public.profile_gallery_begin(text);
drop function if exists public.profile_gallery_finish(bigint, boolean);
drop function if exists public.profile_gallery_delete_svc(text, bigint);
drop function if exists public.profile_guestbook_list(text, text);
drop function if exists public.profile_guestbook_add(text, text, text);
drop function if exists public.profile_guestbook_delete(text, bigint);
drop function if exists private.profile_field(jsonb, text, text, boolean, boolean);
drop function if exists private.profile_vis_ok(jsonb, text, boolean);
drop table if exists public.profile_guestbook;
drop table if exists public.profile_gallery;
drop table if exists public.driver_profiles;
-- Bucket behålls (kan innehålla filer); ta bort manuellt om önskat:
-- delete from storage.objects where bucket_id = 'profile-gallery';
-- delete from storage.buckets where id = 'profile-gallery';
