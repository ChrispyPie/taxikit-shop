# Utkast för Verkstadstimmar, Sjuk och Föreslå ny tid (2026-11-27utkast2)
**Bara UI, ingen SQL.** Samma nyckelschema som #263: `taxi_mx_draft:<förar-id>:<a|d>:<sammanhang>`, 30 dagars utgång, rensas vid skickat/slängt/utloggning, visas i "Utkast (N)".
- `mailbox-ui.js`: delat API `MAILBOX.draft.get/put/drop` (förarens scope `d`) för andra moduler. Ombokning: sammanhang `rebook:<bokning>` (datum, tid, meddelande). Utkastraden öppnar verkstadstimmar/sjuk/omboka.
- `verkstad.js`: ny verkstadstid sparas (start, stopp, bil, felanmälan, kommentar) bara när något ändrats, sammanhang `timmar`. Ändring av befintlig tid sparas inte. Töms när den skickas.
- `sjuk.js`: ny sjukanmälan (första dag, kommentar), sammanhang `sjuk`. Sparas inte om den är orörd. Friskanmälan sparas inte. Töms när den skickas.
- Tester: `tests/arenden-20261127/utkast2.py` (Chromium 390 px, ljust + mörkt), övriga tester gröna.
**Backup:** `backup/main-before-utkast2-20261127`. **Cache:** `20261127utkast2` (mailbox-ui, verkstad, sjuk, changelog). Nyhet `2026-11-27utkast2`.
## Ångra
`git revert -m 1 <merge-commit>`, höj cache, PR + merge. Ingen SQL. Kvarliggande utkast i localStorage är ofarliga; rensa med `Object.keys(localStorage).filter(k=>k.startsWith('taxi_mx_draft:')).forEach(k=>localStorage.removeItem(k))`.
