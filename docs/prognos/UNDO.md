# Ångra Prognos (2026-10-26)

Backup-gren: `backup/pre-prognos-2026-10-26` (pekar på main före feature).
Feature-gren: `feature/prognos`. PR ska **inte** mergas förrän skärmdumpar godkänts.

## Git (appen)

```bash
# Om PR inte mergats: stäng PR, ta bort feature-grenen.
git checkout main
git branch -D feature/prognos
git push origin --delete feature/prognos   # normalt push, ingen force

# Om PR redan mergats till main:
git checkout main
git revert -m 1 <merge-commit-sha>   # skapar revert-commit, ingen force
# eller återställ filer från backup:
git checkout backup/pre-prognos-2026-10-26 -- TaxiData/
```

Berörda appfiler: `TaxiData/prognos.js` (ny), `TaxiData/index.html`, `TaxiData/style.css`, `TaxiData/sw.js`.

## Supabase (endast additivt skapat – exakt undo-SQL)

Edge-funktion `prognos-sync`: ta bort i Dashboard → Edge Functions → prognos-sync → Delete
(eller CLI: `supabase functions delete prognos-sync`).

Vault-hemligheter (värden syns inte här med flit):

```sql
-- Ta bort cron-jobbet
select cron.unschedule('prognos-sync');
-- Om unschedule vill ha jobid:
-- select cron.unschedule(jobid) from cron.job where jobname = 'prognos-sync';

-- Ta bort tick-funktion
drop function if exists private.prognos_tick();

-- Ta bort förar-RPC
drop function if exists public.prognos_status(text);
drop function if exists public.prognos_submit_code(text, text);
drop function if exists public.prognos_list_bookings(text, timestamptz, timestamptz);
drop function if exists public.prognos_morgon(text);
drop function if exists public.prognos_zones(text);
drop function if exists public.prognos_watch_list(text);
drop function if exists public.prognos_watch_set(text, text, text, boolean);

-- Ta bort service-RPC
drop function if exists public.prognos_svc_secret(text);
drop function if exists public.prognos_svc_set_status(text, text);
drop function if exists public.prognos_svc_latest_payload();
drop function if exists public.prognos_svc_insert_snapshot(jsonb, boolean, int, text);
drop function if exists public.prognos_svc_insert_booking(text, text, text, timestamptz, timestamptz, int, bigint);
drop function if exists public.prognos_svc_cancel_n(text, text, int);
drop function if exists public.prognos_svc_prune();
drop function if exists public.prognos_svc_watch_drivers(text, text);

-- Privata hjälpfunktioner
drop function if exists private.prognos_meta_get(text);
drop function if exists private.prognos_meta_set(text, jsonb);

-- Tabeller
drop table if exists public.prognos_watches;
drop table if exists public.prognos_bookings;
drop table if exists public.prognos_snapshots;
drop table if exists public.prognos_meta;

-- Vault-hemligheter (radera via id)
delete from vault.secrets where name in ('PROGNOS_PIN', 'PROGNOS_TICK_KEY');
```

**Rörde inte:** befintliga tabeller/funktioner, `bevakning`, VAPID-nycklar, cron-job.org, DNS.

## Verifiering efter undo

- Ingen ruta "Prognos" på startsidan.
- `select jobname from cron.job where jobname = 'prognos-sync';` → 0 rader.
- Edge list saknar `prognos-sync`.

## t335 (2026-10-26) – hotfix "ingen data" + globala notiser + spaltlinjer

### Hotfix PR #6 (`hotfix/prognos-apikey`, EJ mergad)
- `prognos.js` läste `window.TRIP_API_KEY` (odefinierad, eftersom den är en `const` i script.js) → alla anrop fick 401 → ingen data.
- Commit 2: Prognos ritar bara när Prognos-sidan är öppen (60 s-pollen skrev annars över startsidan efter att man lämnat Prognos).
- **Ångra efter merge:** `git revert -m 1 <merge-sha>` (ingen force push). Före merge: stäng PR #6.

### Feature PR (`feature/prognos-global-notis`, EJ mergad, bygger på #6)
- Ny `TaxiData/prognos-notis.js` (global koll var 60 s + ljud/toast via `BEVAKNING.ring`), ändringar i `bevakning.js`, `sw.js`, `prognos.js`, `style.css`, `index.html` (cache `?v=20261026pg6`).
- **Ångra efter merge:** `git revert -m 1 <merge-sha>`.

### SQL (REDAN APPLICERAD live, additiv, oanvänd tills edge v6 deployas)
- `public.prognos_svc_watch_drivers_active(text, text)` – som `prognos_svc_watch_drivers` men bara förare med giltig session (ingen push när utloggad). Grant: endast service_role.
- **Ångra:** `drop function if exists public.prognos_svc_watch_drivers_active(text, text);`
  (Gör först edge-rollback till v5 om v6 är deployad, annars får sync-funktionen fel.)

### Edge `prognos-sync` v6 (EJ deployad – görs efter merge)
- v6: använder `prognos_svc_watch_drivers_active`, push-tid i svensk tid (Europe/Stockholm; v5 visade UTC = 1 h fel).
- **Rulla tillbaka till v5:** Supabase MCP `deploy_edge_function`, projekt `lpfdryvukqmjlgenuzpb`, namn `prognos-sync`, entrypoint `index.ts`, verify_jwt=false,
  files=[index.ts = innehållet i `/workspace/backups/prognos-sync-v5-index.ts`] (= `main:supabase/functions/prognos-sync/index.ts` vid 2f965dd).

### t335 LIVE 2026-10-26 ca 15:12 (CET)
- PR #6 mergad → merge-commit `0d585af3663c6d39a5a5f8a47000fcaa5084d269`
- PR #7 mergad → merge-commit `6b276690643e6c2813618c54d131940ed93a6124`
- Edge `prognos-sync` v6 deployad 15:12 CET (verify_jwt=false). Deployad v5 kontrollerad identisk med `/workspace/backups/prognos-sync-v5-index.ts` före deploy.

**Ångra frontend (ingen force push), i ordning:**
```
git checkout main && git pull
git revert -m 1 6b276690643e6c2813618c54d131940ed93a6124   # globala notiser/linjer/zonantal (#7)
git revert -m 1 0d585af3663c6d39a5a5f8a47000fcaa5084d269   # hotfix nyckel + rit-skydd (#6) – OBS: då försvinner datan igen (401)
git push origin main
```
(Helst via en revert-branch + PR.) Endast #7 bör normalt återställas; #6 är en ren buggfix.

**Ångra edge till v5:** `deploy_edge_function` projekt `lpfdryvukqmjlgenuzpb`, namn `prognos-sync`, entrypoint `index.ts`, verify_jwt=false, files=[index.ts = `/workspace/backups/prognos-sync-v5-index.ts`]. Därefter kan `drop function if exists public.prognos_svc_watch_drivers_active(text, text);` köras.
