# S admin-panel och bokningshistorik: ångra (4 nov 2026)

Backup-grenar: `backup/pre-sadmin-merge-20261104` (main precis före merge, 2b4398bf) och `backup/pre-sadmin-20261104` (a4c7be64, när arbetet började).

## Appen (GitHub Pages)
1. Revert av merge-commiten för PR "S admin-panel": `git revert -m 1 <merge-sha>` och pusha via en ny PR (ingen force push).
2. Det tar tillbaka Zonguiden i Admin för ägaren och tar bort sadmin.html och menyrutan.

## Databasen (Supabase, lpfdryvukqmjlgenuzpb)
Kör i den här ordningen om allt ska bort:
1. `supabase/migrations/undo/20261104b_sadmin_undo.sql`
   - stänger av RLS på prognos_snapshots, prognos_bookings, prognos_meta, prognos_watches
   - återställer zonguide till can_view_company (ägaren och admin ser den igen)
   - tar bort sadmin_prognos_trips, prognos_cat_ok, sadmin_me, require_sadmin
2. `supabase/migrations/undo/20261104a_prognos_history_undo.sql` (bara om historiken ska bort)
   - tar bort cron-jobbet prognos-history-prune, triggern prognos_history_trg, funktionerna och tabellen prognos_booking_history
   - OBS: då försvinner den sparade historiken.

Om bara Zonguiden ska tillbaka till ägaren: kör bara delen i 20261104b-undo som återställer zonguide.

## Berra som S admin senare
Inget kodbyte behövs: sätt hans kategori till 'superadmin' i drivers (görs först när Christian säger till).

## Prognostid: utskick eller kund? (20261104d, PR feat/prognos-kundtid)
Backup-gren: `backup/pre-prognos-kundtid-20261104` (eb53291d).
- Appen: `git revert -m 1 <merge-sha>` i en ny PR (ingen force push). Förarnas vy påverkas inte av ändringen, testknappen syns bara för S admin.
- Databasen: `supabase/migrations/undo/20261104d_prognos_kundtid_eval_undo.sql` (tar bort sadmin_prognos_kundtid_eval, sadmin_truth_add, sadmin_kundtid_set/get, private.prognos_truth, private.prognos_kundtid_cfg). Sparade fall och offsets försvinner.
- Ordning: revert av appen först (annars visar S admin-sidan bara fel), sedan undo-SQL.
