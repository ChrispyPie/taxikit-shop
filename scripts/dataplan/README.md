# Dataplan steg 0 – kontroll av private.day_summary

`check.js` jämför serverns dagssummering (`private.day_summary`, byggd av `private.dataplan_refresh()`)
med appens egen uträkning för varje förare × månad och för hela åkeriet. Appens funktioner
(`parseAmount`, `parseShiftTime`, `getShiftsInRange`, `getTripsForShift`, `getOrphanTripsInRange`,
dubblettfiltret och summeringen i `render()`) läses ordagrant ur `TaxiData/script.js`, så kontrollen
följer med om appens logik ändras. Avvikelser rapporteras per fält, avrundat till hela kronor.

Inga nycklar används. De tre JSON-filerna tas fram med SQL (t.ex. SQL-editorn) och sparas lokalt:

```sql
-- current.json
select jsonb_build_object(
  'trips',  (select jsonb_agg(data order by ord) from public.trips  where dataset = 'current'),
  'shifts', (select jsonb_agg(data order by ord) from public.shifts where dataset = 'current'));
-- arkiv.json
select jsonb_build_object(
  'trips',  (select jsonb_agg(data order by ord) from private.arkiv_trips  where dataset = 'arkiv'),
  'shifts', (select jsonb_agg(data order by ord) from private.arkiv_shifts where dataset = 'arkiv'));
-- day_summary_month.json
select json_agg(r) from (
  select forar, to_char(day, 'YYYY-MM') ym, sum(shifts) shifts, sum(minutes) minutes, sum(km) km,
         sum(trips) antal, sum(kort) kort, sum(kredit) kredit, sum(swish) swish, sum(kontant) kontant,
         sum(uber_gross) uber, sum(faktura) faktura, sum(ovrigt) ovrigt, sum(bom_kr) bom,
         sum(dricks) dricks, sum(inkort) inkort
    from private.day_summary where company_id = 'default' group by 1, 2) r;
```

Kör (efter `select private.dataplan_refresh('default');`, och utanför :03–:12 när timhämtningen går):

```
TZ=Europe/Stockholm node scripts/dataplan/check.js TaxiData/script.js current.json arkiv.json day_summary_month.json
```

`avvikelser: 0` betyder att servern och appen ger samma siffror. `current_vs_merged` listar månader där
appens siffror skiljer sig beroende på om arkivet är laddat (pass som börjar 31 dec och slutar 1 jan).
