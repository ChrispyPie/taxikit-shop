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
