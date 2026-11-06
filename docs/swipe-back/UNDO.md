# Ångra bakåt-swipe (2026-11-06)

**Live 2026-11-06 22:27 (Europe/Stockholm).** Christians "Kan vi lägga in…" (t984u).

- Backup av main före ändringen: `backup/pre-swipe-back-20261106` (= `799eba0c87d128eab0a647a57d1d8092d443ccae`).
- Ny fil: `TaxiData/swipe-back.js`
- Inkluderad med `?v=20261106sb1` i: `TaxiData/index.html`, `TaxiData/admin.html`, `TaxiData/akeridata.html`, `TaxiData/sadmin.html`
- Commit på main: `895162daadc02d31fdcf161dbf7fa3fb40a1fc0c`.
- Nyheter: `2026-11-06i` i `TaxiData/changelog.js` (och cache-bust `changelog.js?v=20261106i` i index.html)

## Återställ
1. Ta en ny backup från då aktuell main.
2. `git revert 895162daadc02d31fdcf161dbf7fa3fb40a1fc0c` på main och pusha (ingen force push). Alternativt ta bort `swipe-back.js`, script-taggarna, Nyheter-raden och återställ changelog-cache-bust.
3. Ladda om appen. Högerkantens notis-swipe påverkas inte.

Inga databasändringar.
