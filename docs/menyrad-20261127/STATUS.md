# Menyrad som i Mina bevakningar (Christian 21:07) – status
Mål: samma menyrad-stil som Mina bevakningar (`.mb-toolbar`: enhetsknapp som växlar vy, ‹ datum ›, "idag"-knapp, ikonknapp, och chips) på sidor med flik-/menyrad.

## Gjort
1. **Topplista/Rekord** (PR #266, cache `20261127menyrad1`): tre flikrader ersatta av en verktygsrad (enhetsknapp Dag→Vecka→Månad→År, ‹ datum ›, »-idag, 📅 egen period) + chips (Topplista/Rekord | Förare/Bil). Rekord döljer datum/idag/period. Ny delad `TaxiData/menyrad.css` (kopia av `.mb-toolbar`-reglerna; laddas via `lazy-views.js` för vyn `topplistor`). Test: `tests/arenden-20261127/menyrad.py` (390 px ljust+mörkt).

2. **Körpassdata** (PR #268, cache `20261127menyrad2`): samma verktygsrad i `index.html` (enhetsknapp `#kp-unit`, ‹ datum ›, »-idag, 📅). De gamla flikarna ligger kvar dolda (`#kp-tabs`) eftersom `script.js` styr dem; enhetsknappen klickar nästa flik. `menyrad.css` länkas statiskt i `index.html`. Test `tests/arenden-20261127/menyrad2.py`.

## Kvar (fortsätt i morgon)
3. Övriga sidor (Kalender återanvänder `.tabs`/`.date-nav` från Körpassdata, gör den först) med flik-/menyrad: Prognos (flikrad + Filter/Bevakningar), Ankomster (chips `.ank-chips`), Lönekoll, Verkstad (flikar), Forum, Kalender – kolla vilka som har datum-/vynav och byt dem som i steg 1.
4. Städning: låt `mina-bevakningar.css` använda `menyrad.css` i stället för egen kopia av `.mb-toolbar`.

## Ångra
`git revert -m 1 <merge>` (tar bort ändringarna i `topplistor.js`, `lazy-views.js`, `menyrad.css`), höj cache. Ingen SQL. Backup: `backup/main-before-menyrad1-20261127` (Topplista), `backup/main-before-menyrad2-20261127` (Körpassdata).
