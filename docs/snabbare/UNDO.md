# Ångra "Snabbare sidbyten" (2026-10-28, t540u)

Backup av main före ändringen: gren `backup/main-before-speed-20261028` (45df34b).

## Appen
Återställ PR:en (GitHub "Revert"), eller kopiera tillbaka `TaxiData/script.js`, `TaxiData/index.html`
och `TaxiData/changelog.js` från backupgrenen. Appen faller automatiskt tillbaka till `get_trip_data`
om `get_my_trip_data` saknas, så serverdelen kan ligga kvar.

## Supabase (bara om funktionen ska bort)
Kör först när appen inte längre anropar den (annars används reservvägen, som är långsammare men fungerar):

```sql
drop function if exists public.get_my_trip_data(text, text);
```

Inga tabeller eller index ändrades. `get_trip_data` är orörd.
