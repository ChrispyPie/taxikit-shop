-- Ångra 20261028b_akeridata_valjare.sql (Åkeridata-väljaren Åkeri / Bil / Chaufför).
-- Tar bara bort de två nya funktionerna. Inga tabeller eller befintliga funktioner påverkas.
-- Appen faller då tillbaka till get_company_period (hela åkeriet) om frontend också återställs.
drop function if exists public.get_company_period_scoped(text, date, date, text, text, boolean, text);
drop function if exists private.company_period_scoped(text, date, date, text, text, boolean, text, text, text);
