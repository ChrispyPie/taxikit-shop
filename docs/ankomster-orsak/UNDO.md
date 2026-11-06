# Ångra Ankomster-orsak (2026-11-06)

Utkast i PR – får inte mergas förrän Christian säger kör.

- Backup av main före ändringen: `backup/pre-ankomster-orsak-20261106` (= tippen på origin/main när arbetet startade).
- Worktree: `/workspace/tk-orsak`, branch `feature/ankomster-orsak`.
- Ändrade filer:
  - `api/trains.js` – INCLUDE Deviation/OtherInformation/Booking, fälten `reason` och `info` i JSON.
  - `scripts/fetch_got_flights.py` – fältet `reason` (samma som `rawStatus`/remarks).
  - `TaxiData/ankomster.js` – orsakspanel vid tryck på inställt/borttaget/omdirigerat.
  - `TaxiData/style.css` – `.ank-reason`.
  - `TaxiData/changelog.js` + cache-bust i `TaxiData/index.html`.
- Nyheter: `2026-11-06m` (tom `tid` tills live).

## Återställ
1. Ta en ny backup från då aktuell main.
2. Stäng PR:n utan merge, eller `git revert` av merge-committen på main (ingen force push).
3. Ladda om appen. Stationslistan för tåg fungerar som tidigare utan orsakspanelen.

Inga databasändringar.
