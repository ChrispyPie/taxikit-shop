# Ångra sidhistorik för swipe bakåt/framåt (2026-11-12swipe1)

Christians önskemål (t1521u): bakåt-swipen ska gå till föregående sida, inte alltid till startskärmen, och
dra åt vänster från mitten ska gå framåt igen om det finns en sida framåt. Notiskanten är som förut.

- Backup av main före ändringen: `backup/pre-swipe-historik-20261112` (= `c28370835`).
- Ny fil: `TaxiData/nav-historik.js` (sidhistoriken, laddas före `swipe-back.js` i `index.html`).
- Ändrat: `TaxiData/swipe-back.js` (framåt-gest + bakåt via NAV), `TaxiData/index.html` (popstate via
  `NAV.handlePop`, `navPush` i openItem/goHome/openProfile/openInbox, Inställningar och Körpassdata får egna steg),
  cache-taggar `?v=20261112swipe1` i `index.html`, `admin.html`, `akeridata.html`, `sadmin.html`, `lazy-views.js`.
- Nyheter: `2026-11-12swipe1` i `TaxiData/changelog.js`.
- Tester: `tests/swipe-historik/` (stack.cjs, gesture.cjs, browser.cjs).

## Återställ
1. Ta en ny backup från då aktuell main.
2. `git revert -m 1 <merge-commit>` på main och pusha (ingen force push).
3. Ladda om appen (stäng helt och öppna igen).

Inga databasändringar. sessionStorage-nyckeln `taxi_nav_v1` (bara vy-id) försvinner när fliken stängs.
