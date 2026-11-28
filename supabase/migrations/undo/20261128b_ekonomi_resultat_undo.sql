-- Ångrar 20261128b_ekonomi_resultat.sql. Tar bort funktionerna och kostnadstabellen (tabellen förlorar sina rader: exportera först om de behövs).
drop function if exists public.ekonomi_kostnad_ta_bort(text, bigint);
drop function if exists public.ekonomi_kostnad_spara(text, bigint, jsonb);
drop function if exists public.ekonomi_kostnader(text);
drop function if exists messaging_private.ekonomi_kostnad_ta_bort(text, bigint);
drop function if exists messaging_private.ekonomi_kostnad_spara(text, bigint, jsonb);
drop function if exists messaging_private.ekonomi_kostnader(text);
drop function if exists private.ekonomi_actor(text);
drop function if exists private.ekonomi_kostnader(text);
drop table if exists private.ekonomi_kostnad;
