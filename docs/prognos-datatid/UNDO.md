# Ångra rätt tid för flygdata i Prognos (2026-11-11)

Backup-gren: `backup/pre-prognos-datatid-20261111` (pekar på main före ändringen).
Feature-gren: `fix/prognos-datatid`.

Ingen Supabase-ändring. Ingen ångra-SQL behövs. Hämtningsskripten (got.json m.fl.) är oförändrade – fälten `arrivalsUpdated` / `updated` fanns redan.

## Git (appen)

```bash
# Om PR inte mergats: stäng PR, ta bort feature-grenen.
git checkout main
git branch -D fix/prognos-datatid
git push origin --delete fix/prognos-datatid   # normalt push, ingen force

# Om PR redan mergats till main:
git checkout main
git revert -m 1 <merge-commit-sha>   # skapar revert-commit, ingen force
# eller återställ filerna från backup:
git checkout backup/pre-prognos-datatid-20261111 -- \
  TaxiData/prognos.js TaxiData/arrival-data.js TaxiData/ankomster.js \
  TaxiData/hjalp.js TaxiData/changelog.js TaxiData/index.html \
  TaxiData/lazy-views.js docs/prognos-datatid \
  tests/prognos/datatid.cjs tests/train-stations/source-updated.cjs
```

Berörda appfiler: `TaxiData/prognos.js`, `TaxiData/arrival-data.js`, `TaxiData/ankomster.js`, `TaxiData/hjalp.js`, `TaxiData/changelog.js`, `TaxiData/index.html`, `TaxiData/lazy-views.js`.
