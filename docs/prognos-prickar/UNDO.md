Ångra aktivitetsprickar i Prognos 2026-11-13 (prick1)

Kod: `git revert` av merge-commiten för PR:en (ingen force-push).
Ändrat: `TaxiData/prognos.js` (updateNewIds, zoneHasNew, prick på zonflikar och rutor, besökstid i localStorage).
Lokalt per förare: `prognos_visit_<id>` (senaste besök), `prognos_since_<id>` (serverns since från prognos_new_count), `prognos_newids_<id>` (nya bokningar som har prick). Kan lämnas kvar efter ångring.
Cache: `prognos.js`, `lazy-views.js`, `changelog.js` → `?v=20261113prick1`.
Nyheter: raden `2026-11-13prick1` i `TaxiData/changelog.js` (`tid:` sätts vid go-live).
Ingen databasändring.
