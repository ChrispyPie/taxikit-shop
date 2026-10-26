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

## t336 (2026-10-26) – Morgonprognos i appen

- **Backup-branch:** `backup/pre-morgon-2026-10-26` = `6b27669` (pushad).
- **Feature PR** (`feature/prognos-morgon`, EJ mergad): ny flik "Morgon" i Prognos + teaser under Schema.
  Filer: `TaxiData/prognos.js`, `TaxiData/style.css`, `TaxiData/index.html` (cache `?v=20261026pg8`; t337: markering av pågående timme "pågår · N kvar", klara timmar "klar", "I dag" under pågående morgon), skärmdumpar `docs/prognos/v6_morgon-*.png`.
  - **Ångra före merge:** stäng PR:n. **Efter merge:** `git revert -m 1 <merge-sha>` + push (ingen force push).
- **SQL (REDAN APPLICERAD live, additiv):** `supabase/migrations/20261026c_prognos_morgon_log.sql`
  - Tabell `public.prognos_morgon_log` (historik per datum när morgonprognosen ändras; RLS på, ingen anon/authenticated-åtkomst).
  - Funktion `private.prognos_morgon_log_capture()` + trigger `prognos_morgon_log_trg` AFTER INSERT på `public.prognos_snapshots` (felhantering: blockerar aldrig sync).
  - **Ångra (i ordning):**
    ```sql
    drop trigger if exists prognos_morgon_log_trg on public.prognos_snapshots;
    drop function if exists private.prognos_morgon_log_capture();
    drop table if exists public.prognos_morgon_log;
    ```
- Edge `prognos-sync` oförändrad (v6). Appen läser `prognos_morgon(p_token)` som redan fanns.

## t338–t340 (2026-10-26) – "babyskydd utan bil" + filternotis
- Orsak: inget spårningsfel. Zon 293 hade 3 öppna Kombi-bokningar 16:35 (id 38–40) + babyskydd 16:35 (id 42), samma block. Kombi var bortvald i användarens Filter. Ingen data rensad, ingen edge-ändring.
- **Backup-branch:** `backup/pre-filternotis-2026-10-26` = origin/main före ändringen.
- **Feature PR** (`feature/prognos-filter-notis`, EJ mergad): notis "Filter aktivt: Kombi dold" överst i Schema (tryck → Filter), cache `?v=20261026pg9`.
  - **Ångra:** stäng PR:n; efter ev. merge `git revert -m 1 <merge-sha>` + push.

## t342/t343 – Varning "Tiderna är uppskattade och ungefärliga" + Rapportera fel (PR #11, ej mergad)
- prognos.js: `renderWarn()` (Schema under statusraden + under Morgon-kortet), `reportBug()`, `appVersion()`, tryckbara celler (`data-pg-slot`, `st.repSlot`).
- forum.js: `openEditor(p, pre)` + `F.compose(pre)` (öppnar Forum → Nytt inlägg, kategori Buggar, rubrik/text förifyllda; inget skickas förrän Publicera). Ingen ny backend.
- style.css: `.pg-warn*`, `.pg-rep-*`, `.pg-n-sel`. index.html: style/prognos/forum.js `?v=20261026pg10`.
- Ångra: `git revert <commit>` på grenen, eller stäng PR #11. Ingen Supabase-ändring.

## t344 – Allmän "Rapportera fel" + bokningshistorik (ersätter tryck-på-siffra)
- prognos.js: `renderWarn()` (allmän knapp), `reportBug()` hämtar `prognos_report_history` (zon, 60 min) → `historyLines()`; cellval borttaget. Cache-bust pg11 (style/prognos/forum).
- SQL (applicerad live 2026-10-26 ~15:48, additiv): `supabase/migrations/20261026d_prognos_report_history.sql` – tabell `public.prognos_bookings_gone`, trigger `prognos_bookings_gone_trg` (after update of status på prognos_bookings), `private.prognos_bookings_gone_capture()`, RPC `public.prognos_report_history(text,text,int)`.
- Ångra SQL: se slutet av migrationsfilen (drop function/trigger/function/table i den ordningen).
