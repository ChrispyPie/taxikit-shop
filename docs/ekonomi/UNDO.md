# Ångra Ekonomi fas 1 (2026-11-27)

Backup-gren: `backup/main-before-ekonomi-20261127` (= origin/main a37177b94 före ändringen). Utan force-push.

## Appen
    git fetch origin && git checkout -b revert-ekonomi origin/main
    git revert -m 1 <merge-commit-för-PR-Ekonomi-fas-1>
    # bumpa CACHE_VER i TaxiData/sw.js och ?v på ändrade filer (admin.html, hem-sidor.js, lazy-views.js)
    git push origin revert-ekonomi && gh pr create ... && gh pr merge --merge
Gamla Löner-sidan (verkstad-admin.js, payroll_month) ligger kvar och fungerar då igen.

## Databasen
Kör `supabase/migrations/undo/20261127e_ekonomi_fas1_undo.sql` (i ordning). Det tar bort de nya funktionerna och triggern, tar bort provision-kolumnen (förvalt 37 gäller som förut) och återställer `lonekost_cfg`, `save_lonekost` och `forar_lon_period` exakt som de låg i databasen före. Sparade sjuklön-belopp (`sjuklon_belopp`, `sjuklon_calc`) ligger kvar tills steg 3 körs (valfritt).
Gör appen-reverten först, annars visar Ekonomi-sidan "Det här finns inte på servern ännu".

## Fas 2 (löneunderlag), live 2026-11-27/28
Backup-gren: `backup/main-before-ekonomi-fas2-20261128` (main före merge av PR #270).
- Appen: `git revert -m 1 <merge-commit för PR #270>` på en ny gren från origin/main, bumpa `CACHE_VER` i sw.js, PR + merge (ingen force-push). Då försvinner sektionen Löneunderlag; resten av Ekonomi (fas 1) ligger kvar.
- Databasen: kör `supabase/migrations/undo/20261128a_ekonomi_fas2_loneunderlag_undo.sql`. Den tar bara bort tre nya funktioner (`public/messaging_private/private.ekonomi_loneunderlag`). Inga data eller kolumner berörs. Gör appen-reverten först.

## Fas Resultat (PR live 2026-11-28)
Backup-gren: `backup/main-before-ekonomi-resultat-20261128` (main före merge av Ekonomi › Resultat).
- Appen: `git revert -m 1 <merge-commit>` på en ny gren från origin/main, bumpa `CACHE_VER` i sw.js, PR + merge (ingen force-push). Då försvinner Resultat, kostnadsläggning och bränsleutdrag. Fas 1 och 2 (verkstad, sjuklön, löneunderlag) ligger kvar.
- Databasen, i denna ordning:
  1. `supabase/migrations/undo/20261128c_ekonomi_utdrag_undo.sql` (tar bort utdragsfunktioner och tabellen `private.ekonomi_utdrag` – filerna försvinner, exportera först om de behövs; återställer `ekonomi_kostnader` till 20261128b).
  2. `supabase/migrations/undo/20261128b_ekonomi_resultat_undo.sql` (tar bort kostnadsfunktionerna och tabellen `private.ekonomi_kostnad` – inlagda kostnader försvinner, exportera först).
- Gör appen-reverten först. Inga kolumner i befintliga tabeller (`cars` m.fl.) har ändrats.
