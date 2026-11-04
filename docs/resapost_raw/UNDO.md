# Rådata från resapost (2026-11-04)
Ny tabell private.resapost_raw: hela raden (alla 28 kolumner, inkl. BOOKNR) från månadsfilen resapost.
Inga ändringar i trips/arkiv_trips eller appen. Ingen åtkomst för anon/authenticated, RLS på.
Fylls bakåt från redan sparade filer i private.probe_reports och framåt via trigger när probe_put sparar bf_resa/resa.
Ångra: kör supabase/migrations/undo/20261104c_resapost_raw_undo.sql. Backup-gren: backup/pre-resapost-raw-20261104.
