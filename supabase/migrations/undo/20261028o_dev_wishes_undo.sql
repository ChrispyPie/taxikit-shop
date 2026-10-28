-- Ångra 20261028o_dev_wishes (Önskemål och idéer i Admin).
-- Gör frontend-ångringen först (annars visar appen fel när den anropar dev_wish_*).
-- Steg 1 tar bort funktionerna (önskemålen ligger kvar i tabellen).
begin;
drop function if exists public.dev_wish_list(text);
drop function if exists public.dev_wish_add(text, text);
drop function if exists public.dev_wish_delete(text, bigint);
commit;

-- Steg 2 (valfritt, RADERAR alla önskemål – kör bara om ni verkligen vill ta bort dem):
-- begin;
-- drop function if exists private.dev_wish_json(public.dev_wishes, text);
-- drop table if exists public.dev_wishes;
-- drop function if exists private.dev_wish_touch();
-- commit;
