# Ändra kategori i Admin › Ärenden – ångra
Backup-gren: `backup/pre-admin-kategori-20261107`. Ingen databasändring (använder set_car_issue_kind / move_car_issue_to_maint).
Ångra: `git revert <commit>` (arenden-admin.js, admin.html ?v=, changelog.js 2026-11-07e, index.html ?v=). Ingen force push.

## Ändra i alla ärendetyper (2026-11-07f)
Samma backup-gren. Ingen databasändring. Ändrat: arenden-admin.js (R.edit, Ändra-knappar, #arende= tillbaka), verkstad.js (openPendingEdit, bil_edit/ara_return i localStorage), changelog.js 2026-11-07f, ?v= i index.html/admin.html. Ångra: `git revert <commit>`.
