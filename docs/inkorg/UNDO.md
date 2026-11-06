# Ångra Inkorg + Ärenden (2026-11-06)

Backup av main före ändringen: `backup/pre-inkorg-20261106` (= `913fb3e8`).

## Appen
- Före merge: stäng PR:en, inget annat behövs.
- Efter merge: `git revert -m 1 <merge-commit>` på main (ingen force push).

## Databasen
Kör `supabase/migrations/undo/20261106e_inkorg_arenden_undo.sql` i Supabase SQL editor.
Den tar bort triggern, de nya funktionerna, tabellen `case_reads` och kolumnerna `case_kind/case_id`,
och lägger tillbaka `notis_feed` exakt som den var 6 nov 2026. Inga ärenden, meddelanden eller notiser tas bort.

Ordning om båda ska ångras: först appen (revert), sedan SQL. Appen klarar sig utan SQL:en
(Inkorgen visar då "Kunde inte hämta"), men gamla appen behöver inte den nya SQL:en alls.
