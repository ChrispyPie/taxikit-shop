# Ångra scroll-fix + bakåt-swipe från vänstra halvan (2026-11-06)

**Live 2026-11-06 22:39 (Europe/Stockholm).** Christians "Visa alla" / Ankomster "Tidigare" (t985u) och fodral-fix för bakåt-swipe.

- Backup av main före ändringen: `backup/pre-scroll-fix-20261106` (= `3019f16f7ec40fd3d301e65ff44539bd524fb837`).
- Ändrade filer:
  - `TaxiData/om.js` – behåller scrollY när Nyheter › Visa alla expanderar.
  - `TaxiData/ankomster.js` – scroll-ankare vid Visa tidigare (tåg + flyg).
  - `TaxiData/swipe-back.js` – startzon = vänstra 50 %, längre/tydligare horisontell dragning.
  - `TaxiData/changelog.js` – Nyheter `2026-11-06j`.
  - Cache-bust i `TaxiData/index.html` (om/ankomster/changelog/swipe-back), plus swipe-back i `admin.html`, `akeridata.html`, `sadmin.html`.
- Commit på main: `5e2f44dbc5f4f4885874be80c500a8131a8d31e2`.

## Återställ
1. Ta en ny backup från då aktuell main.
2. `git revert <commit-sha>` på main och pusha (ingen force push). Eller checkout filerna från `backup/pre-scroll-fix-20261106` och committa.
3. Ladda om appen. Notis-swipen från höger påverkas inte.

Inga databasändringar.
