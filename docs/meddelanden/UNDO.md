# Ångra Meddelanden/rapporter

## Före merge
PR:en är inte mergad. Ingen befintlig sida ändras av den additiva SQL-migrationen. Låt den ligga kvar om PR:en väntar.
Vill du även stänga nya API:er: kör SQL-filerna nedan. Skickade meddelanden och läskvitton bevaras.

## Efter framtida merge
1. Christian måste godkänna merge. Skapa före merge backup `backup/pre-meddelanden-merge-20261106` från den då aktuella main-grenen. Skriv merge-SHA här då.
2. Ångra PR:ens merge med en ny revert-commit (`git revert -m 1 MERGE_SHA` för en vanlig merge-commit). Ingen force push, ingen reset av main.
3. Publicera återställningen genom befintliga Pages-flödet och kontrollera att körningen inte avbröts av GOT-cache-commit. Ladda om appen.
4. Vid behov, kör först `supabase/migrations/undo/20261106g2_meddelanden_tradar_undo.sql`, sedan `supabase/migrations/undo/20261106g_meddelanden_loner_undo.sql`. De återkallar execute/usage för nya API:er men tar inte bort tabellen, något meddelande, läskvitto eller gammalt ärende. Ingen gammal funktion behöver återställas.
5. För att återaktivera efter mjuk undo: ge tillbaka schema-USAGE och EXECUTE-grants från slutet av de två migrationsfilerna (inte hela CREATE-migrationerna igen).

Arbetsbackup: `backup/pre-meddelanden-20261106` pekar på `040dd24b`. Denna backup är en referens, inte något som ska force-pushas till main.
