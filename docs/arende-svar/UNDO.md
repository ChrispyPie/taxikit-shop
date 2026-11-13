# Ärenden › Felanmälan går att svara på (2026-11-12svar1) – ångra

Backup-gren före ändringen: `backup/pre-arende-felanmalan-svar-20261112` (= origin/main 593473163).

## JS (räcker för att få tillbaka det gamla utseendet)
```
git revert <merge-commit>      # eller: git checkout backup/pre-arende-felanmalan-svar-20261112 -- TaxiData/mailbox-ui.js
```
Byt sedan tillbaka cachetaggen `mailbox-ui.js?v=20261112svar1` i `TaxiData/admin.html` och `TaxiData/lazy-views.js`
till en ny tagg (inte den gamla `20261111whmsg1`, så att telefoner hämtar om filen). Ta bort raden `2026-11-12svar1`
i `TaxiData/changelog.js` och `CHANGELOG.md` om den inte ska synas.

## DB (bara om 20261112c har körts)
`supabase/migrations/undo/20261112c_arende_felanmalan_svar_undo.sql` tar bort execute på `car_issue_message`, `set_car_issue_status`, `set_car_issue_kind`, `move_car_issue_to_maint`, `save_car_issue` och `save_car_maintenance` igen
(samma läge som efter 20261107135140). Inga tabeller eller data ändras; meddelanden som skrivits ligger kvar i
`car_issue_messages` och syns fortfarande i ärendet.

---

# Bokad tid på felanmälan (2026-11-12svar2) – ångra

Ingen ny backup-gren: läget före är origin/main efter merge av #160.

## JS
Reverta PR-commiten (`git revert <merge-commit>`). Det tar bort knappen Bokad tid, bokningarna på ärendesidan och
länk-uppslaget i listan. Sätt en NY cachetagg (inte `20261112svar2` eller `svar1`) på `mailbox-ui.js` och `changelog.js`
i `TaxiData/admin.html` och `TaxiData/lazy-views.js`. Ta bort raden `2026-11-12svar2` i `changelog.js`/`CHANGELOG.md`.
JS:en tål att `issue_booking` saknas (knappen döljs, svarsrutan fungerar), så JS och DB kan ångras i valfri ordning.

## DB (bara om 20261112d har körts)
`supabase/migrations/undo/20261112d_arende_bokad_tid_undo.sql` tar bort `public.issue_booking` och
`inbox_private.issue_threads`. Bokningar och deras trådar ligger kvar i `inbox_private` (inget raderas) och syns då
som vanliga Meddelande-trådar i Ärenden, med samma bokade tider i schemat.
