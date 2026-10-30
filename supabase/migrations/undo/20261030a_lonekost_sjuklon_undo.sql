-- Ångra 20261030a_lonekost_sjuklon.sql. Inget befintligt ändrades, så det räcker att ta bort det nya.
-- Appen klarar sig utan: Admin › Bilar använder då standardvärdena och Sjukanmälan visar "kunde inte räkna".
-- Steg 1: ta bort funktionerna.
drop function if exists public.sjuk_lon_calc(text, bigint);
drop function if exists private.forar_lon_period(text, text, date, date);
drop function if exists public.save_lonekost(text, jsonb);
drop function if exists public.get_lonekost(text);
drop function if exists private.lonekost_cfg(text);
-- Steg 2 (valfritt, raderar ägarens sparade procentsatser, kör bara efter ja från Christian):
-- drop table if exists private.lonekost_settings;
