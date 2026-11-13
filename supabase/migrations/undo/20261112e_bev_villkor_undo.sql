-- Ångra 20261112e_bev_villkor.sql
-- Tar bort RPC:erna och tabellen. Appen faller då tillbaka på villkoren i telefonen och edge-funktionen
-- på standardvillkoren (inga fel, bev_svc_villkor saknas => standard).
drop function if exists public.bev_svc_villkor(text[]);
drop function if exists public.bev_villkor_save(text, jsonb);
drop function if exists public.bev_villkor_get(text);
drop table if exists private.bev_villkor;
