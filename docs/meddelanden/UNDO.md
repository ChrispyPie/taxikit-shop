# Ångra Meddelanden och Ärenden

## Publicering
Christian godkände PR #79 med ”Ser fint ut kör” den 6 november 2026 kl. 20:26 (Europe/Stockholm).
- Merge: `38948deacc35113aeb79d3e02760854f0e5a980c` (vanlig merge-commit).
- Första lyckade Pages-deploy: `42279911551`, klar 6 november 2026 kl. 20:29 (Europe/Stockholm).
- Backup före arbetet: `backup/pre-meddelanden-20261106` = `040dd24bef8996faae9ec566abd20f5bab00571f`.
- Backup precis före merge: `backup/pre-meddelanden-merge-20261106` = `05c7b1a5f6d360b174b90ed6f5ab42ea9384fd90`.
Båda backupgrenarna är pushade. Inga force pushes har gjorts.

## Återställ frontend
1. Ta en ny backup från då aktuell main.
2. Skapa en ny revert-commit: `git revert -m 1 38948deacc35113aeb79d3e02760854f0e5a980c`. Återställ även vid behov den separata Nyheter/publiceringsnoteringen. Ingen reset av main och ingen force push.
3. Publicera genom befintliga Pages-flödet och kontrollera att körningen inte avbröts av GOT-cache-commit. Ladda om appen.

## Stäng nya API:er utan att förlora data
Kör vid behov först `supabase/migrations/undo/20261106g2_meddelanden_tradar_undo.sql`, sedan `supabase/migrations/undo/20261106g_meddelanden_loner_undo.sql`.
De återkallar execute/usage för nya API:er men tar inte bort trådar, meddelanden, läskvitton eller gamla ärenden. Ingen gammal funktion behöver återställas.
För återaktivering: ge tillbaka schema-USAGE och EXECUTE-grants från de två migrationsfilerna, inte hela CREATE-migrationerna igen.
