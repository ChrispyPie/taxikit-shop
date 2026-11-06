# Ångra Inkorg + Ärenden (2026-11-06)

**Live 2026-11-06 19:39 (svensk tid).** Christians "kör" 19:36.

- Merge PR #78: `d7beaf147863bd9abce9bff3eb1948d333702b40`
- Backup av main före featuren: `backup/pre-inkorg-20261106` (= `913fb3e8`)
- Backup av main precis före merge: `backup/pre-inkorg-merge-20261106` (= `363568da`)
- SQL körd i prod 19:38: `supabase/migrations/20261106f_inkorg_arenden.sql` (migration `20261106f_inkorg_arenden`)
- Nyheter: `2026-11-06c` (changelog.js)

## Appen
`git revert -m 1 d7beaf147863bd9abce9bff3eb1948d333702b40` på main och pusha (ingen force push).
Revertera även Nyheter-commiten om raden ska bort.

## Databasen
Kör `supabase/migrations/undo/20261106f_inkorg_arenden_undo.sql` i Supabase SQL editor.
Den tar bort triggern, de nya funktionerna, tabellen `case_reads` och kolumnerna `case_kind/case_id`,
och lägger tillbaka `notis_feed` exakt som den var 6 nov 2026. Inga ärenden, meddelanden eller notiser tas bort.

Ordning om båda ska ångras: först appen (revert), sedan SQL. Gamla appen behöver inte den nya SQL:en.
