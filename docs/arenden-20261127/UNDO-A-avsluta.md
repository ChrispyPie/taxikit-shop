# A – Avsluta felanmälan i Admin › Ärenden (2026-11-27)

**Orsak (rotorsaken):** efter Inkorg v2 (7 nov) visar `mailbox-ui.js` en felanmälan/Bilen står/Behövs (kind `issue`) bara med svarsruta och Bokad tid.
De gamla statusknapparna (Pågår / Klar / Öppna igen) finns bara i Admin › Bil och verkstad (`verkstad-admin.js`) och i Bil & verkstad (`verkstad.js`), så Berra och Christian hittade inget sätt att avsluta i Ärenden.
Servern var inte problemet: `set_car_issue_status` släpper redan igenom admin/ägare (klar, pagar, ny). Förare får inte sätta status, det är ursprunglig design.

**Ändring:** bara UI. `TaxiData/mailbox-ui.js`: raden Status (Pågår, ✓ Avsluta (Klar), Öppna igen) under svarsrutan för admin, via `set_car_issue_status`. Kommentar (valfri, max 500 tecken) tas från rutan.
Test: `node tests/admin-arenden/avsluta.cjs`. Ingen SQL, ingen migration.

**Backup:** `backup/main-before-arende-avsluta-20261127`.
**Cache:** `20261127avslut1` (sw.js, lazy-views.js, index.html, admin.html, changelog.js). Nyhet `2026-11-27avslut1` (bara admin).

## Ångra
```sh
git fetch origin && git checkout -b revert/arende-avsluta-20261127 origin/main
git revert -m 1 <merge-commit>      # ingen force-push
# höj CACHE_VER och ?v= igen, PR + merge
```
Ingen databasändring att ångra. Själva ärendets status ändras bara när någon trycker på knappen (ärende 21 har inte rörts).
