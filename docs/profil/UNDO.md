# Ångra offentlig förarprofil (20261106d)

## Om PR inte mergats
Radera branchen `feat/profil-sida`. Backup finns: `backup/pre-profil-sida-20261106`.

## Om frontend är live men SQL inte
1. Återställ `TaxiData/profil-sida.js` + `index.html`-ändringar från backup-branchen.
2. Höj cache-bust.

## Om SQL är applicerad
1. Backa frontend först.
2. Kör `supabase/migrations/undo/20261106d_driver_profile_undo.sql`.
3. Bucket `profile-gallery` behålls (kan innehålla filer) — ta bort manuellt om önskat.
4. Ta bort edge-funktionen `profil-galleri` om den deployats.
