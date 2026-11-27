# Klickbart namn i ärende filtrerar listan (2026-11-27person1)
**Ändring (bara UI, ingen SQL):** `mailbox-ui.js`. I öppen tråd/ärende (bara admin) visas raden "Chaufför: Namn" där namnet är en knapp. Den lägger `st.person`, återgår till listan med kategori Alla och filtrerar rader på samma namn (trådens `name`, ärendets `who`, båda från `bil_driver_name`, jämförs utan versaler/blanksteg). Chip "Ärenden: Namn ✕" rensar. Kategoriknapparna fungerar ihop med filtret. Filtret nollställs när man går in i Ärenden på nytt (`enter()`/`show()`), så "alltid lista" från #261 gäller. Djuplänkar rörs inte.
**Förare:** ingen knapp, alla förarens trådar är med Admin så ett filter ger ingenting.
**Tester:** `node tests/arenden-20261127/person.cjs`, `tests/arenden-20261127/person.py` (Chromium 390 px, ljust + mörkt).
**Backup:** `backup/main-before-arenden-person-20261127`. **Cache:** `20261127person1`.
## Ångra
`git revert -m 1 <merge-commit>`, höj cache, PR + merge. Ingen force-push. Ingen SQL.
