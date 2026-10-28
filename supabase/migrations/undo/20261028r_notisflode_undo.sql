-- Ångra 20261028r_notisflode.sql: tar bort de tre RPC:erna och tabellen push_notices (sparade push-notiser försvinner).
-- event_notices rörs inte (bara läst-markeringar som föraren gjort i flödet ligger kvar, precis som från klockorna i appen).
drop function if exists public.notis_read(text, text, bigint);
drop function if exists public.notis_feed(text, integer);
drop function if exists public.notis_add(text, jsonb);
drop table if exists public.push_notices;
