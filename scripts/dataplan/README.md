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

# Dataplan steg 1 – Åkeridata per period

Migration `supabase/migrations/20261027a_dataplan_steg1.sql` (ångra-SQL längst ner i filen):

- `private.dataplan_tick()` körs varje minut av pg_cron-jobbet `taxikit-dataplan-refresh`. Det bygger om
  faktatabellerna bara när `trip_datasets` (current/arkiv) har ändrats eller var 3:e timme, i en egen
  deltransaktion med låstidsgräns 5 s och `statement_timeout` 120 s. Timhämtningen rörs inte: misslyckas
  ombyggnaden sparas felet i `private.dataplan_state` (`last_error`, `last_error_at`) och gamla siffror ligger kvar.
- `private.dataplan_status()` visar om faktatabellerna är aktuella (`stale`).
- `public.get_company_period(p_token, p_from, p_to, p_detail, p_group)` ger Åkeridata för en period
  (högst 400 dagar; resorna följer med för högst 62 dagar). Samma roller som förut: ägaren ser namn, S admin
  ser åkeriet med påhittade id, övriga bara sin egen data.
- `public.get_company_shift_trips(p_token, p_ids)` ger resorna för pass när de fälls ut i långa perioder.
- Passens id är stabila mellan ombyggnader (`private.dp_shift_key`).

`check_period.js` jämför appens gamla uträkning (script.js från main före steg 1, hela året + arkivet)
med servern för varje period. Serverns siffror tas fram med t.ex.:

```sql
select json_agg(json_build_object('label', to_char(m,'YYYY-MM'), 'from', m::date, 'to', (m + interval '1 month - 1 day')::date,
  'totals', j->'totals',
  'shifts', (select json_agg(json_build_array(s->>'passnr', s->>'forar', s->>'start', s->'inkort', s->'n'))
               from jsonb_array_elements(j->'shifts') s)))
from generate_series('2025-01-01'::date, '2026-10-01', '1 month') m,
     lateral (select private.company_period('default', m::date, (m + interval '1 month - 1 day')::date, 'all', null, false) j) x;
```
