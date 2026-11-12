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
