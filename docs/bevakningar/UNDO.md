# Ångra Mina bevakningar

## Live (PR #81)

- Merge-commit: `76e40ad5023edf476be4c3b65b68e9ed331bd04c` (2026-11-06 ~23:09 Europe/Stockholm)
- Nyheter: id `2026-11-06m`, tid `23:09`
- Cache-bust: `mina-bevakningar.css/js`, `ankomster.js`, `kalender.js`, `changelog.js` → `?v=20261106m`
- Ingen SQL eller serverändring

## Säkerhetsgrenar

- `backup/pre-bevakningar-merge-20261106` = `origin/main` precis före merge (`fc52564b`)
- `backup/pre-bevakningar-20261106` = äldre säkerhetsgren från innan feature-arbetet

Arbetet byggdes i worktree `/workspace/tk-bevakningar` på `feature/mina-bevakningar`.

## Ångra efter merge

Gör en ny revert-commit av merge-committen och skicka genom vanlig granskning:

```bash
git revert -m 1 76e40ad5023edf476be4c3b65b68e9ed331bd04c
```

Återställ inte hela main till säkerhetsgrenen: det skulle ta bort senare ändringar.
Ingen force-push och ingen destruktiv reset.

Reverten tar bort rutan, modulen, kalenderintegrationen och Nyheter-posten. Höj vid
behov cacheversioner igen så att telefoner hämtar återställda filer.

Ingen SQL eller serverändring finns att återställa. Befintliga bevakningar är kvar.
På/av-valet `taxi_kal_watches` kan lämnas kvar; det är ofarligt utan funktionen.
Avbevakningar som användaren själv gjort från listan ångras genom att bevaka igen i
Ankomster/Kalender. En pausad tågnotis slås på igen i Ankomster → Mina tågnotiser.
