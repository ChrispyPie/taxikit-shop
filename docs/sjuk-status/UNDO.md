# Sjukanmälan-historik + neutrala adminknappar (2026-11-07b)
Backup-gren: backup/pre-sjuk-status-20261107 (origin/main före ändringen).
- Frontend: `git revert <commit>` på main (eller återställ TaxiData/arende-status.js, arenden-admin.js, changelog.js, index.html, admin.html från backup-grenen).
- Supabase: kör supabase/migrations/undo/20261107b_sjuk_historik_undo.sql (tar bort triggrar, private.sick_events, återställer sjuk_json).
- Testärendet id 1 (Christians egen) före ändringen: status=intyg_begart, status_by=693340, status_comment="Krya på dig!", status_at=updated_at=2026-10-30 01:10:43.458855+00. Undo-filen återställer detta.
