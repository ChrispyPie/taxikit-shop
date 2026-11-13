Ångra flyttbar Moduler-ikon på startskärmen 2026-11-13 (mod2)

Backup-gren: `backup/pre-moduler-flytta-20261113` (origin/main före ändringen).
Kod: `git revert` av merge-commiten för PR:en (tvinga inte fram en push).
Cache: ändrade filer har `?v=20261113mod2` (hem-ordning.js, hjalp.js, lazy-views.js, changelog.js, moduler.js).
Nyheter: raden `2026-11-13mod2` i `TaxiData/changelog.js` (med `tid:` = go-live-tid, Stockholm).

Ingen databasändring. `private.home_tool_ids_clean` godtar redan id `moduler` (`^[a-z0-9-]{1,40}$`).
Efter en återgång till den äldre klienten ignoreras `moduler` i sparad `ids` (den äldre rutan är en särskild sista plats, inte ett verktygs-id). Ikonerna i övrigt behåller sin ordning.

Lokalt: `taxi_home_order:<förar-id>` kan innehålla `moduler` i `ids`. Den äldre klienten hoppar över okända id när den ritar rutnätet.
