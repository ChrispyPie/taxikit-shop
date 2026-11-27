# Ekonomi fas 2 (löneunderlag) – status

Uppdaterad 2026-11-27 ca 23:55 (Stockholm). Gren `feat/ekonomi-fas2-20261127` (från main efter fas 1). **Christian sa 'Kör live' 2026-11-27 ca 23:48. Fas 2 är live (PR #270), migrationen applicerad.**

## Klart
- SQL `supabase/migrations/20261128a_ekonomi_fas2_loneunderlag.sql`: `ekonomi_loneunderlag(p_token, p_from, p_to)` (public → messaging_private → private). Bara ägare + superadmin, ej demo, bara eget åkeri, bara läsning. Per förare med körda dagar i perioden: `private.forar_lon_period` (inkört, Uber, lönegrund, lön = provision × lönegrund, semesterersättning 13 %). **Inte applicerad i prod än.** Provkörd i en transaktion som rullades tillbaka mot prod (oktober: bl.a. Adilio lön 5 811,72 kr, lönegrund 15 707,36, provision 37,000 %).
- Undo: `supabase/migrations/undo/20261128a_ekonomi_fas2_loneunderlag_undo.sql` (tar bara bort de tre nya funktionerna).
- UI: ny fällbar sektion **🧾 Löneunderlag** i `TaxiData/ekonomi.js` (under Totalt per chaufför). Laddas först när den öppnas, följer vald månad/år, per förare: inkört, Uber, lönegrund, lön, semester, plus sjuklön och verkstad för samma period. `ekonomi.js?v=20261128eko2` i admin.html.
- Test: `node tests/ekonomi/unit.cjs`, `node tests/ekonomi/unit2.cjs` (PASS), browsertestet för fas 1 går fortfarande igenom.

## Klart sedan förra uppdateringen
- Punkt 2: demo.js har påhittad data för `ekonomi_loneunderlag` (3 förare, per månad), `demo.js?v=20261128eko2`.
- Punkt 5: årsvyn visar per månad och förare. SQL-funktionen returnerar nu även `manader` (samma uträkning per kalendermånad). Provkörd i en rullad transaktion mot prod: månadssummorna stämmer med periodsumman (t.ex. Adilio 10 145,42 + 5 811,72 = 15 957,14 mot 15 957,15, avrundning). Migrationen är fortfarande inte applicerad.
- Punkt 6: Ladda ner (CSV) och Kopiera tar med löneunderlaget (ett block under verkstad/sjuk). De hämtar det automatiskt om sektionen inte öppnats. Månad: en rad per förare + total. År: en rad per månad och förare + en summarad per förare + total.
- Tester: `unit.cjs`, `unit2.cjs` (löneunderlag, årsvy, CSV månad/år) och `browser.cjs` går igenom.

## Återstår (nästa steg i ordning)
1. Applicera migrationen (`apply_migration`) när Christian sagt ok. Före dess visar sektionen (utom i demon) "Det här finns inte på servern ännu".
2. (skärmbild av sektionen i demon saknas ännu, lägg i docs/ekonomi/bilder/)
3. Jämför mot en riktig lönespec (t.ex. avi 1777) och bestäm vad som ska ingå i totalen (idag lön + semester; sjuklön och verkstad visas som egna rader). Hantera manuella överstyrningar (maj/juni/aug 2025 hade handjusterad lön) – kräver att Berra kan skriva över lön per förare och månad (ny tabell + RLS + undo).
4. Före merge: bumpa `CACHE_VER` i sw.js och `?v` för lazy-views/index om de ändrats, ny Nyheter-post (agare, svenska), rebase på senaste main, undo-notering i docs/ekonomi/UNDO.md och /workspace/backups/.
5. Senare faser: intäkter, utgifter, resultat (se docs/ekonomi/README.md).
