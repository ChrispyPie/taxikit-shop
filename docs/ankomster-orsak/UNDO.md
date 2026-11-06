# Ångra Ankomster-orsak (2026-11-06)

Live efter Christians "kör" (t1002u).

- Backup av main före feature-arbetet: `backup/pre-ankomster-orsak-20261106`.
- Backup av main före merge: `backup/pre-ankomster-orsak-merge-20261106` (= origin/main tip 49158750, efter PR #81 Mina bevakningar).
- Worktree: `/workspace/tk-orsak`, branch `feature/ankomster-orsak`, PR #82.
- Merge-SHA: `7750ac5a52e0b98163f6361cd4d9d139ec6fdac6` (Merge pull request #82).
- Ändrade filer:
  - `api/trains.js` – INCLUDE Deviation/OtherInformation/Booking, fälten `reason` och `info` i JSON.
  - `scripts/fetch_got_flights.py` – fältet `reason` (samma som `rawStatus`/remarks).
  - `TaxiData/ankomster.js` – orsakspanel vid tryck på inställt/borttaget/omdirigerat.
  - `TaxiData/style.css` – `.ank-reason`.
  - `TaxiData/changelog.js` + cache-bust `?v=20261106n` i `TaxiData/index.html` (style.css, ankomster.js, changelog.js).
- Nyheter: `2026-11-06n`, tid `23:15` (Europe/Stockholm).

## Återställ
1. Ta en ny backup från då aktuell main.
2. `git revert` av merge-committen på main (ingen force push), eller återställ till `backup/pre-ankomster-orsak-merge-20261106` via revert-kedja.
3. Ladda om appen. Stationslistan för tåg fungerar som tidigare utan orsakspanelen.
4. Vercel: api/trains.js följer main – en revert tar bort reason/info där också.

Inga databasändringar.
