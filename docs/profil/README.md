# Offentlig förarprofil (2026-11-06)

Branch: `feat/profil-sida` · Backup: `backup/pre-profil-sida-20261106` (= main @ `2fa27ad8`)

**Status:** PR — applicera **inte** SQL i prod och merga **inte** förrän Christian sagt kör.

## Vad
- Menyn **Profil** öppnar en social profilsida (inte personuppgiftsformuläret).
- **Redigera profil** → frivilliga fält. Därifrån: **Personuppgifter & lösenord** (befintliga fält).
- Namn alltid förnamn + efternamnsinitial (samma som `private.forum_name`). Inga smeknamn.
- Profilbild valfri (befintlig `profilbild`-edge).
- Automatiskt: nuvarande/senaste bil (`private.bil_current_car`), forum-trådar/svar-räknare.
- Forum-räknare är klickbara → lista över den personens trådar/svar. **Serverfiltrering** via `private.fx_thread_visible` (Admin syns aldrig för förare). Räknare och lista räknar samma läsbara poster.
- RPC: `profile_forum_list(p_token, p_driver_id, p_kind)` där `p_kind` = `threads` | `replies`.
- Galleri (bucket `profile-gallery` + edge `profil-galleri`), gästbok (ägare + admin kan ta bort).
- Synlighet per fält: Alla / Bara mitt åkeri.
- **Skicka meddelande** = platshållare (ingen inkorg ännu).
- Inga poäng eller badges.

## SQL (additivt)
- `supabase/migrations/20261106d_driver_profile.sql`
- Ångra: `supabase/migrations/undo/20261106d_driver_profile_undo.sql`

Tabeller: `driver_profiles`, `profile_gallery`, `profile_guestbook`.
RPC: `profile_get`, `profile_save`, `profile_gallery_*`, `profile_guestbook_*`.

## Edge
- `supabase/functions/profil-galleri` (verify_jwt = false), samma mönster som `onskemal-foto`.
- Deployas **efter** SQL, innan frontend används i prod.

## Frontend
- `TaxiData/profil-sida.js`
- `TaxiData/index.html` — `renderProfile` → `PROFIL_SIDA`; personuppgifter kvar som `renderPersonalData`
- Cache-bust: `profil-sida.js?v=20261106p1`

## Gå live (när Christian sagt kör)
1. Applicera SQL `20261106d_driver_profile.sql` i prod.
2. Deploya edge `profil-galleri` (verify_jwt=false).
3. Merga PR till main (Pages/Actions deployar frontend).
4. Höj cache-bust om telefonerna inte plockar upp filen.

## Skärmdumpar (harness 390px)
- Repo: `docs/profil/real/`
- Kopia: `/workspace/taxidata-cleanup/screenshots/profil-real/`
- Harness: `/workspace/taxidata-cleanup/harness/profil/` (`?view=page|edit|gallery|guestbook|menu|forum-threads|forum-replies`)

| Fil | Vy |
|-----|-----|
| `01-profil.png` | Profilöversikt |
| `02-redigera.png` | Redigera profil |
| `03-galleri.png` | Galleri |
| `04-gastbok.png` | Gästbok |
| `05-meny.png` | Profilmeny |
| `06-forum-tradar.png` | Klickbar lista: forum-trådar |
| `07-forum-svar.png` | Klickbar lista: forum-svar |
