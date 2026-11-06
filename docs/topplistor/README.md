# Topplistor + Rekordtavlan (2026-11-06)

Branch: `feat/topplistor-rekord` · Backup: `backup/pre-rekord-20261106` (= main @ `992ee47a`)

**Status:** PR — applicera **inte** SQL i prod och merga **inte** förrän Christian sagt kör.

## Design
- Växel **Topplista | Rekord** (rubrik Rekord: *Rekordtavlan*).
- Väljare: **Vad** (mått), **Period** (Dag/Vecka/Månad/År; Egen period i Topplista via 📅), **Sortera** (Störst/Minst först), **Förare/Bil**.
- **Topplista + period** = ranking för aktuell dag/vecka/månad/år (eller egen period).
- **Rekord + period** = varje förares bästa sådan period sedan **2025-01-01**.
- Anonym ranking; egen rad som "Du: plats X av N".
- Bil: vanliga förare ser bara egen bil (samma regel som idag).

### Rekord-datum (integritetsval)
Datum på rekord visas som **månad + år** (t.ex. `sep -26`), även när grain är Dag eller Vecka. Motivering: ~29 förare — exakt dag kan identifiera personen. Flaggat här och i RPC-fältet `privacy_when: month_year`.

## Mått
| Nyckel | Rubrik | Kommentar |
|--------|--------|-----------|
| inkort | Inkört | |
| dricks | Dricks | bara kort (kontant saknas) |
| krmil | Kr/mil | ≥ 1 mil |
| krtimme | Kr/timme | ≥ 30 min |
| km | Km | pass-km |
| antal | Antal resor | |
| snitt | Snitt per körning | Rekord: minsta antal resor (se trösklar) |
| inkort_pass | Inkört per pass | |
| dricks_pct | Dricks i % av inkört | inkört ≥ 100 kr |
| flyg | Flygresor | start- eller slutzon 291–293 |
| langst | Längsta körningen | ≥ 0,5 km; Minst först = kortaste |
| belopp | Högsta enskilda belopp | enskild resa |
| passresor | Flest körningar per pass | enskilt pass |

### Borttaget / utelämnat
- **Timmar** — Berra vill inte uppmuntra långa pass.
- **Verkstadstimmar** — ingen historik i arkivet.
- **Högst snitt per pass** — ersatt av Inkört per pass.
- **Andel tomkörning** — STIG-data har inget tomkm-/ledig-fält (bara `kilometer` på resa och `km` på pass). Utelämnad.

### Trösklar (snitt i Rekord)
| Grain | Minsta antal resor |
|-------|--------------------|
| Dag | 5 |
| Vecka | 15 |
| Månad | 20 |
| År | 100 |

### Outliers
- Resor med ≈0 km och belopp ≥ 500 kr filtreras bort.
- Pass längre än 16 h filtreras bort.

## SQL (additivt)
- `supabase/migrations/20261106e_topplistor_rekord.sql`
- Ångra: `supabase/migrations/undo/20261106e_topplistor_rekord_undo.sql`
- Nya RPC: `get_topplista_metric`, `get_rekord_metric`
- Gamla `get_leaderboard*` orörda (kan städas senare).

## Frontend
- `TaxiData/topplistor.js` (cache-bust `?v=20261106rekord1`)
- `TaxiData/style.css` — dropdown / växlar
- Mock-referens: `docs/halloffame/`

## Gå live (när Christian sagt kör)
1. Applicera SQL `20261106e_topplistor_rekord.sql` i prod.
2. Merga PR till main (Pages/Actions deployar frontend).
3. Höj cache-bust om telefonerna inte plockar upp filen.
4. Skriv Nyheter-rad.

## Skärmdumpar
- Harness: `/workspace/taxidata-cleanup/harness/rekord/`
- Bilder: `/workspace/taxidata-cleanup/screenshots/rekord/` och `docs/topplistor/real/`
