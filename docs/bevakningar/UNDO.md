# Ångra Mina bevakningar

Säkerhetsgren: `backup/pre-bevakningar-20261106` från `origin/main` före ändringen.
Arbetet ligger i separat worktree `/workspace/tk-bevakningar`, på
`feature/mina-bevakningar`. Huvudutcheckningen ändras inte.

## Före merge

Stäng PR:n. Ingen produktion eller databas har ändrats av denna PR.

## Efter godkänd merge

Gör en ny revert-commit av feature-/merge-committen och skicka genom vanlig granskning.
För merge-commit: `git revert -m 1 <merge-sha>`; för squash: `git revert <squash-sha>`.
Återställ inte hela main till säkerhetsgrenen: det skulle ta bort senare ändringar.
Ingen force-push och ingen destruktiv reset.

Reverten tar bort rutan, modulen, kalenderintegrationen och Nyheter-posten. Höj vid
behov cacheversioner igen så att telefoner hämtar återställda filer.

Ingen SQL eller serverändring finns att återställa. Befintliga bevakningar är kvar.
På/av-valet `taxi_kal_watches` kan lämnas kvar; det är ofarligt utan funktionen.
Avbevakningar som användaren själv gjort från listan ångras genom att bevaka igen i
Ankomster/Kalender. En pausad tågnotis slås på igen i Ankomster → Mina tågnotiser.
