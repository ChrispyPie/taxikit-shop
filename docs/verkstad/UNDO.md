# Ångra: Verkstadstimmar – dialog + månadssumma (2026-10-26)

## Kod (GitHub Pages)
- PR-grenen: `feature/verkstad-dialog`. Är PR:en inte mergad räcker det att stänga den.
- Är den mergad: `git revert -m 1 <merge-commit>` på main, sedan push (ingen force push).
- Backup-grenar: `backup/main-pre-verkstad-dialog-2026-10-26` (511d3b2) och `backup/main-4bb5c43-pre-verkstad-dialog-2026-10-26` (main när grenen skapades).
- Cache-bust: `verkstad.js?v=20261026vd1` (index.html), `verkstad-admin.js?v=20261026vd1` (admin.html). Före: `20261026lk2` / `20261026tm1`.

## Databas (Supabase, redan körd – bara tillägg)
Körda migreringar: `supabase/migrations/20261026g_verkstad_dialog.sql`, `20261026h_verkstad_dialog_ask_reopen.sql`.
- Ny kolumn `workshop_hours.waiting_on` (null = ingen dialog).
- Ny tabell `workshop_messages` (RLS på, inga policies – bara via RPC).
- Nya RPC:er `workshop_ask`, `workshop_reply`.
- Ändrade: `private.wh_json`, `admin_workshop_decide`, `bil_badge`, `workshop_pending_count` (samma fält som förut + nya).

Ångra databasen: kör `docs/verkstad/ROLLBACK-verkstad-dialog.sql` (en transaktion). Den återställer de gamla funktionerna
och tar bort tabellen/kolumnen. Obs: då försvinner alla dialog-meddelanden. Kör först koden tillbaka (revert), annars
får appen fel när den anropar `workshop_ask`/`workshop_reply`. Gammal kod fungerar med den nya databasen (bara nya fält).

Testat: rollback-skriptet kördes i en transaktion som rullades tillbaka – fungerade.
