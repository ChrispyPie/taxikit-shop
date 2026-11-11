# Ångra stjärna i Prognos, hjälpbot bara på startskärmen och scroll-fix i Ankomster (2026-11-11)

Backup-gren: `backup/pre-plan-stjarna-bot-hem-20261111` (pekar på main före ändringen, `8f55a74da`).
Feature-gren: `feat/plan-stjarna-bot-hem`.

Ingen Supabase-ändring. Ingen ångra-SQL behövs.

## Git (appen)

```bash
# Om PR inte mergats: stäng PR, ta bort feature-grenen.
git checkout main
git branch -D feat/plan-stjarna-bot-hem
git push origin --delete feat/plan-stjarna-bot-hem   # normalt push, ingen force

# Om PR redan mergats till main:
git checkout main
git revert -m 1 <merge-commit-sha>   # skapar revert-commit, ingen force
# eller återställ filerna från backup:
git checkout backup/pre-plan-stjarna-bot-hem-20261111 -- \
  TaxiData/bevakning.js TaxiData/prognos.js TaxiData/ankomster.js \
  TaxiData/hjalpbot.js TaxiData/hjalp.js TaxiData/style.css \
  TaxiData/changelog.js TaxiData/om-data.js TaxiData/index.html \
  TaxiData/lazy-views.js docs/plan-stjarna-bot-hem
```

Berörda appfiler: `TaxiData/bevakning.js`, `TaxiData/prognos.js`, `TaxiData/ankomster.js`, `TaxiData/hjalpbot.js`, `TaxiData/hjalp.js`, `TaxiData/style.css`, `TaxiData/changelog.js`, `TaxiData/om-data.js`, `TaxiData/index.html`, `TaxiData/lazy-views.js`.
