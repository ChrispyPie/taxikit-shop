# Ångra Topplistor + Rekordtavlan (20261106e)

## Om PR inte mergats
Radera branchen `feat/topplistor-rekord`. Backup: `backup/pre-rekord-20261106` (= main @ `992ee47a`).

## Om frontend är live men SQL inte
1. Återställ `TaxiData/topplistor.js` + `style.css` + cache-bust i `index.html` från backup-branchen.
2. Höj cache-bust.

## Om SQL är applicerad
1. Backa frontend först (annars 404 på RPC).
2. Kör `supabase/migrations/undo/20261106e_topplistor_rekord_undo.sql`.
3. Gamla `get_leaderboard*` lämnas orörda av både migration och undo.
