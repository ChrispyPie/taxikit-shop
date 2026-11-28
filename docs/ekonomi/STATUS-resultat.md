# Ekonomi › Resultat – status (utkast, 2026-11-28)

Gren `feat/ekonomi-resultat-20261128`. **Ingen merge, ingen migration i prod före Christians kör.**

## Klart
- `docs/ekonomi/PLAN-resultat.md`: vad som finns, vad som måste matas in, skiss, frågor.
- SQL `supabase/migrations/20261128b_ekonomi_resultat.sql` (+ undo): tabell `private.ekonomi_kostnad` (RLS på, ingen policy), `ekonomi_kostnader`, `ekonomi_kostnad_spara`, `ekonomi_kostnad_ta_bort` (bara ägare + superadmin, ej demo). Provkörd i en rullad transaktion mot prod. **Inte applicerad.**
- UI `TaxiData/ekonomi-resultat.js`: Resultat överst i Ekonomi (± i grönt/rött, stapeldiagram per månad, fällbara poster Intäkter, Avgifter, Förarlöner, Sjuklön/verkstad, Bilkostnader, Övriga kostnader med formulär, Moms och skatt), månad och år.
- Demo-data i demo.js, skärmbilder i `docs/ekonomi/bilder-resultat/` (och `/workspace/taxidata-cleanup/screenshots/ekonomi-resultat/`), test `tests/ekonomi/resultat.cjs`.
- Löneunderlaget visar nu "inga resor registrerade i Taxi Göteborgs data" när en förare har pass men 0 kr (Petrus W).

## Återstår
1. Christians svar på frågorna i planen (bolagsform/skatt, leasing, fasta avgifter till Taxi Göteborg).
2. Bränsle/el automatiskt (idag manuell månadspost). Bilkostnader kommer från Bilar.
3. Redigera en befintlig kostnad (idag bara lägga till och ta bort).
4. CSV/Kopiera ska ta med Resultat.
5. Verifiera mot Berras siffror för en månad. Jämför lönekostnad mot riktiga lönespecar (arbetsgivaravgift på lön + semester + sjuklön är ett antagande).
6. Före merge: applicera migrationen, bumpa `CACHE_VER` i sw.js, Nyheter (ägare), undo-noteringar i docs/ekonomi/UNDO.md och /workspace/backups/, rebase på main.
