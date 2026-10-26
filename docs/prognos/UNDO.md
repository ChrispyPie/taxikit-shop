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
