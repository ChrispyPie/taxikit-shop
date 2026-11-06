# Topplistor + Rekordtavlan (2026-11-06)

Branch: `feat/topplistor-rekord` · Backup: `backup/pre-rekord-20261106` (= main @ `992ee47a`)

**Status:** PR — applicera **inte** SQL i prod och merga **inte** förrän Christian sagt kör.

## Design
- Växel **Topplista | Rekord** (rubrik Rekord: *Rekordtavlan*).
- Väljare: **Vad** (mått), **Period** (Dag/Vecka/Månad/År; Egen period i Topplista via 📅), **Förare/Bil**. Listan visas **helt expanderad**, alltid störst först (läs nerifrån för minst).
- **Topplista + period** = ranking för aktuell dag/vecka/månad/år (eller egen period).
- **Rekord + period** = varje förares bästa sådan period sedan **2025-01-01**.
- Anonym ranking; egen rad som "Du: plats X av N".
- Bil: vanliga förare ser bara egen bil (samma regel som idag).

### Rekord utan datum
Rekordlistan visar **bara värde och placering** — ingen månad/dag. RPC returnerar inte perioddatum (integritet).

## Mått (korta namn)
| Nyckel | Rubrik | Kommentar |
|--------|--------|-----------|
| inkort | Inkört | |
| dricks | Dricks | bara kort (kontant saknas) |
| krmil | Kr/mil | ≥ 1 mil |
| krtimme | Kr/timme | ≥ 30 min |
| km | Km | pass-km |
| antal | Antal resor | |
| snitt | Kr/körning | snitt; resegräns bara i Rekord |
| inkort_pass | Kr/pass | snitt inkört per pass |
| dricks_pct | Dricks % | inkört ≥ 100 kr |
| flyg | Flygresor | start- eller slutzon 291–293 |
| langst | Km/körning | enskild resa, ≥ 0,5 km; botten = kortaste |
| belopp | Belopp/körning | enskild resa (skilt från Kr/körning = snitt) |
| passresor | Körningar/pass | enskilt pass |

### Borttaget / utelämnat
- **Timmar** — Berra vill inte uppmuntra långa pass.
- **Verkstadstimmar** — ingen historik i arkivet.
- **Högst snitt per pass** — ersatt av Kr/pass.
- **Andel tomkörning** — STIG-data har inget tomkm-/ledig-fält. Utelämnad.
- Sorteringsknappar Störst/Minst — alltid störst först, hela listan.

### Antal inom parentes
Snittmåtten (Kr/körning, Kr/pass, Dricks %, Kr/mil, Kr/timme) visar antal resor bakom värdet: `312 kr (25 st)`, i både Topplista och Rekord. RPC-fält `c`. Km/körning, Belopp/körning, Körningar/pass är enskilda värden och får inget antal.

### Trösklar — bara i Rekord, aldrig i Topplista
Gäller snittmåtten Kr/körning, Kr/pass, Dricks %, Kr/mil, Kr/timme. Topplista har ingen resegräns.
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
- Harness: `docs/topplistor/harness.html` (eller `/workspace/taxidata-cleanup/harness/rekord/`)
- Bilder v3: `/workspace/taxidata-cleanup/screenshots/rekord/v3/` och `docs/topplistor/real/`
