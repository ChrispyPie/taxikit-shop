# Ångra hjälpbotens hopp ut genom hemknappen (2026-11-11)

Backup-gren: `backup/pre-bot-hopp-ut-20261111` (pekar på main före ändringen).
Feature-gren: `feat/bot-hopp-ut`.

Ingen Supabase-ändring. Ingen ångra-SQL behövs.

## Git (appen)

```bash
# Om PR inte mergats: stäng PR, ta bort feature-grenen.
git checkout main
git branch -D feat/bot-hopp-ut
git push origin --delete feat/bot-hopp-ut   # normalt push, ingen force

# Om PR redan mergats till main:
git checkout main
git revert -m 1 <merge-commit-sha>   # skapar revert-commit, ingen force
# eller återställ filerna från backup:
git checkout backup/pre-bot-hopp-ut-20261111 -- \
  TaxiData/hjalpbot.js TaxiData/changelog.js TaxiData/index.html \
  TaxiData/lazy-views.js docs/bot-hopp-ut
```

Berörda appfiler: `TaxiData/hjalpbot.js`, `TaxiData/changelog.js`, `TaxiData/index.html`, `TaxiData/lazy-views.js`.
