# Ångra Topplistor + Rekordtavlan (20261106e) — LIVE 2026-11-06 19:45

## Läge
- PR #77 mergad: merge-commit `257299e7` (main), Nyheter `2026-11-06d`
- SQL applicerad i prod 2026-11-06 ~19:43 (migration `20261106e_topplistor_rekord` + `20261106e_topplistor_rekord_fix1`)

## Backups
- `backup/pre-rekord-merge-20261106` = main före merge @ `b364a285`
- `backup/pre-rekord-20261106` = main när PR startade @ `992ee47a`

## Ångra frontend (gör först)
1. Återställ `TaxiData/topplistor.js`, `TaxiData/style.css` och cache-bust i `TaxiData/index.html` från `backup/pre-rekord-merge-20261106` i en ny commit (ingen force push), eller `git revert -m 1 257299e7` plus revert av Nyheter-commiten.
2. Höj cache-bust på `topplistor.js` så telefonerna hämtar om.

## Ångra SQL (efter frontend)
Kör `supabase/migrations/undo/20261106e_topplistor_rekord_undo.sql` (droppar bara `get_topplista_metric` och `get_rekord_metric`). Gamla `get_leaderboard*` är orörda och fungerar med gammal frontend.
