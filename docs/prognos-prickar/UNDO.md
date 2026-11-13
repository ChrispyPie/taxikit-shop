Ångra aktivitetsprickar i Prognos 2026-11-13 (prick2)

Kod: `git revert` av merge-commiten för PR:en (ingen force-push).
Ändrat: `TaxiData/prognos.js` (updateNewIds, zoneHasNew, prick på zonflikar och rutor, besökstid i localStorage).
Lokalt per förare: `prognos_visit_<id>` (senaste besök), `prognos_since_<id>` (serverns since från prognos_new_count), `prognos_newids_<id>` (nya bokningar som har prick). Kan lämnas kvar efter ångring.
Cache: `prognos.js`, `lazy-views.js`, `changelog.js` → `?v=20261113prick2`.
Nyheter: raden `2026-11-13prick2` i `TaxiData/changelog.js` (`tid: '16:03'`).
Ingen databasändring.

Tomrummet ovanför rutnätet i liggande läge (spacer) togs bort i samma ändring: `pinLandGrid` i `TaxiData/prognos.js` tar nu bara bort en eventuell gammal `.pg-land-spacer`. Ångra genom att återställa funktionen från `backup/pre-prognos-prickar-20261113`.

## Sedda prickar (2026-11-13sedd1, t1583u)
Öppnar man en zon och lämnar den (byter zon/flik, lämnar Prognos, stänger appen) flyttas zonens nya bokningar från `prognos_newids_<förare>` till `prognos_seenids_<förare>` (localStorage). Ångra: återställ `TaxiData/prognos.js` från `backup/pre-prick-sedd-20261113` och sätt tillbaka cache-strängarna; nyckeln `prognos_seenids_` kan lämnas kvar (ofarlig).
