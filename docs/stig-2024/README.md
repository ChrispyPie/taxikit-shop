# STIG 2024 archive resume — 2026-11-07

All times below: CET / Europe/Stockholm.

## Result
- Calendar-year 2024: **12,048 active trips, 1,916 shifts**.
- 478 superseded receipts preserved in `private.ersatta_kvitton` (`dataset=arkiv`).
- All 12,526 source trip rows reconcile: 12,048 active + 478 superseded.
- Zero missing trips/shifts, zero imported-field value mismatches, zero duplicate trip/shift keys.
- Zero stored trips without source evidence.
- 344 out-of-file-month rows also found: 325 in later 2024 months, 19 in existing 2025 archive.
- 2025 archive fingerprints unchanged (12,869 trips / 1,980 shifts).
- Entire archive dataset now 24,917 trips / 3,896 shifts.
- All 12 monthly checkpoints present; re-invoking importer returned `skipped` for every month.

## What was already done overnight
No local 2024 script/log/undo artifact found in scraper checkout or TaxiData docs before this resume.
Actual surviving evidence was GitHub Actions logs, staged source reports, and DB checkpoints.

- Run [42324780732](https://github.com/ChrispyPie/taxi-goteborg-data/actions/runs/42324780732): Jan–Jun fetched successfully 02:35–02:49, logged out normally.
- Jan–Jun DB checkpoints: 02:42:30, 02:42:35, 02:42:40, 02:45:49, 02:48:55, 02:51:04.
- Existing archive before resume: **6,012 active 2024 trips / 915 shifts**, 238 superseded receipts.
- Run [42328188414](https://github.com/ChrispyPie/taxi-goteborg-data/actions/runs/42328188414): Jul–Dec fetched successfully 03:15–03:29, logged out normally.
- Both GitHub runs are `success`; all 24 original report files (IDs 66–89) survived in private staging, one version per month/kind. HTTP 200 throughout, sub-second file downloads, no login or stop errors.
- Missing step: Jul–Dec staged files had **not been imported**; no Jul–Dec checkpoints/rows existed.

The evidence does NOT show a STIG failure at 02:45: work demonstrably continued past that time (imports through 02:51, downloads through 03:29). No trace establishing why the coordinating routine stopped before the Jul–Dec import was found. The exact orchestration interruption cause remains unknown; do not attribute it to STIG or claim an observed timeout.

## Resume
Used existing `private.arkiv_import_month(month,'arkiv')` and `private.arkiv_fill_shifts` unchanged, exactly the 2025 import route documented in `/workspace/backups/UNDO-arkiv-2026-10-26.md` and `supabase/migrations/20261026k_arkiv_lagring.sql`.

- Undo saved before import at 06:12:16.
- Imported only missing Jul–Dec at **06:13:09–06:13:41**.
- Added 6,036 active trips and 1,001 shifts; 240 more superseded receipts preserved.
- Shift fill check returned 0 for each resumed month.
- **Zero new requests to STIG**: reused verified existing source files rather than logging in or downloading again.
- No schema changes, no public/current data writes, no deployment, no credential/customer data output or local source-data copies.
- Existing importer retains corrected receipts in the superseded-receipts table using the established 2025 logic; no source evidence discarded.

## Verification and reversal
`verify.sql`: aggregate-only row-by-row comparison against staged STIG reports. Trip key = car + receipt + date (driver additionally checked). Shift key = shift number + driver + start date. Checks every imported data field, and matches superseded rows against their retained source values.

`undo.sql`: manual-only transaction removing **only calendar-year 2024** archive trips/shifts, superseded receipts, and checkpoints, then recalculating dataset counts. Does not alter 2025/current/schema/functions. Original staged evidence remains preserved. Undo was NOT executed.

| Month | Source trips | Active trips | Superseded | Shifts | Missing/value mismatches |
|---|---:|---:|---:|---:|---:|
| 2024-01 | 789 | 743 | 46 | 116 | 0 |
| 2024-02 | 934 | 897 | 37 | 137 | 0 |
| 2024-03 | 808 | 779 | 29 | 131 | 0 |
| 2024-04 | 1129 | 1083 | 46 | 152 | 0 |
| 2024-05 | 1271 | 1225 | 46 | 176 | 0 |
| 2024-06 | 1319 | 1285 | 34 | 203 | 0 |
| 2024-07 | 971 | 943 | 28 | 161 | 0 |
| 2024-08 | 923 | 909 | 14 | 148 | 0 |
| 2024-09 | 1169 | 1123 | 46 | 174 | 0 |
| 2024-10 | 1272 | 1211 | 61 | 202 | 0 |
| 2024-11 | 1100 | 1052 | 48 | 169 | 0 |
| 2024-12 | 841 | 798 | 43 | 147 | 0 |

2025 fingerprints before/after (aggregate hashes, no personal data):
- Trips: `ee5cbbbbfa91c13128c12f90361909b0`
- Shifts: `2ad4e890947fc880203a900d66007a35`

Final verification recorded: 2026-11-07 06:15:15 CET (Europe/Stockholm)
