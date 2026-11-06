# Ångra offentlig förarprofil (20261106d)

## Live
- Merge: `fe6747c0` (PR #76, 2026-11-06 18:48 Europe/Stockholm)
- Backup före feature: `backup/pre-profil-sida-20261106` (= `2fa27ad8`)
- Backup före merge: `backup/pre-profil-sida-merge-20261106` (= `84c88920`)
- SQL: `20261106d_driver_profile` applicerad i prod
- Edge: `profil-galleri` v1 (verify_jwt=false)
- Nyheter: `2026-11-06b` tid 18:48

## Om frontend ska backas
1. Återställ `TaxiData/profil-sida.js` + `index.html`-ändringar från `backup/pre-profil-sida-merge-20261106`.
2. Höj cache-bust.
3. Kör `supabase/migrations/undo/20261106d_driver_profile_undo.sql`.
4. Ta bort edge-funktionen `profil-galleri` om den ska bort.
5. Bucket `profile-gallery` behålls (kan innehålla filer) — ta bort manuellt om önskat.

## Om PR inte hade mergats
Radera branchen `feat/profil-sida`. Backup finns: `backup/pre-profil-sida-20261106`.
