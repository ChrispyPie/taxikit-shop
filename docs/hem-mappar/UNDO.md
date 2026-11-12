Ångra mappar på startskärmen och borttagen skiftnyckel 2026-11-12 (mapp1)

Backup-gren: `backup/pre-hem-mappar-20261112` (origin/main före ändringen).
Kod: `git revert` av merge-commiten för PR:en (tvinga inte fram en push).
Cache: ändrade filer har `?v=20261112mapp1` (hem-ordning.js, hjalp.js, lazy-views.js, changelog.js).
Nyheter: raden `2026-11-12mapp1` i `TaxiData/changelog.js`.

Databas (bara om migrationen körts): `supabase/migrations/undo/20261112b_home_tool_folders_undo.sql`.
Den tar bort kolumnen `folders`, 4-arg-RPC:en och hjälpfunktionen. `ids` och `hidden` lämnas orörda.
Mapp-id (`mapp-...`) som ligger kvar i `ids` ignoreras av den äldre klienten; ikonerna i mapparna
hamnar då på sina standardplatser.

Lokalt: förare som bara har mapparna i localStorage (`taxi_home_order:<förar-id>`, fältet `folders`)
påverkas inte av den gamla klienten, som läser `ids` och `hidden` och struntar i resten.
