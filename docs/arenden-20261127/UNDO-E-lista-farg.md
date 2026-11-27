# Ärenden/Meddelanden: alltid lista, färger per kategori, statussymbol (2026-11-27lista1)

**Ändring (bara UI, ingen SQL)**
- `mailbox-ui.js`: ny `enter()` som nollställer öppen tråd/ärende när man går in (admin: `openMenu('arenden')` i `admin.html`, förare: `openInbox()` i `index.html`). Vald kategori behålls. Pågående öppning från notis/länk (`mode==='loading'`) lämnas orörd. Sidladdning återställer inte längre öppen tråd, bara kategori. Djuplänken `#arende=…` i `admin.html` öppnar nu menyn först och sedan ärendet.
- Färger: blå Meddelande/felanmälan/övrigt, gul Verkstadstimmar, rosa Sjuk, grön Bokad tid (tråd med bokning). Kant på varje rad + färgade kategoriknappar. Ljust/mörkt via `:root` / `html[data-theme=dark]`.
- Statussymbol uppe till höger på raden: ✓ godkänd/beviljad, ✕ nekad/avböjd/avbokad, ? väntar. Bokad tid: väntande förslag = ?, annars ✓ om en godkänd tid finns, annars ✕; `rebooked` räknas inte (ersatt av nytt förslag). Verkstadstid: pending ?, approved ✓, rejected ✕. Sjuk: ny/intyg_begart ?, godkand ✓, avslagen ✕. Felanmälan visar symbol bara om dess Bokade tid finns. Inget för vanliga meddelanden, uppgifter, underhåll, önskemål.
- Tester: `node tests/arenden-20261127/verdict.cjs`, `tests/arenden-20261127/lista-farg.py` (Chromium 390 px, ljust + mörkt, förare + admin, notislänk). `tests/inkorg-v2/fixtures.js` ger nu `booking_states` i listan.

**Backup:** `backup/main-before-arenden-ui-20261127`. **Cache:** `20261127lista1`. Nyhet `2026-11-27lista1`.

## Ångra
`git revert -m 1 <merge-commit>`, höj cache, PR + merge. Ingen force-push. Ingen SQL.
