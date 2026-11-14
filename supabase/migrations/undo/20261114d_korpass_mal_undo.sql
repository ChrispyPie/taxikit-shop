-- Ångra 20261114d_korpass_mal.sql
-- Tar bort RPC:erna och tabellen (sparade mål försvinner från servern).
-- Appen faller då tillbaka på målen i telefonen, eller standard 4000/25000/100000/1200000.
drop function if exists public.korpass_mal_set(text, numeric, numeric, numeric, numeric);
drop function if exists public.korpass_mal_get(text);
drop table if exists private.korpass_mal;
