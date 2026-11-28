# Ekonomi › Resultat – status (utkast, 2026-11-28)

Gren `feat/ekonomi-resultat-20261128`, PR #272. **Ingen merge, ingen migration i prod före Christians kör.**

## Klart
- Plan: `docs/ekonomi/PLAN-resultat.md` (Christians svar 28 nov inarbetade).
- SQL `20261128b` kostnadstabell + `20261128c` bränsleutdrag, båda med undo. **Inte applicerade.** Provkörning av 20261128b skedde tidigare i en rullad transaktion. 20261128c är inte körd mot prod.
- UI: Resultat överst (efter bolagsskatt 20,6 % på vinst, 0 kr vid förlust, procentsatsen kan ändras). Stapeldiagram före skatt. Fällbara poster.
- **Bilar är källan:** Ekonomi läser bara bilkostnader (Mirai = leasing, storbil = avbetalning, TG-avgift förvalt 13 000 kr/bil/mån) och har länken **Redigera i Bilar**. Ingen bildata sparas i Ekonomi.
- Övriga kostnader kan läggas till, ändras och tas bort.
- **Bränsleutdrag:** ladda upp CSV/PDF/bild (max 8 MB). CSV tolkas generiskt och en summa föreslås; Berra bekräftar innan den sparas som Bränsle och el. PDF/bild sparas, beloppet fylls i för hand. Filen är privat och kan tas bort.
- Demo-data: två Mirai (exempel 10 000 kr/mån), en storbil (exempel 8 000 kr/mån), TG 13 000 × 3. Skärmbilder i `docs/ekonomi/bilder-resultat/` och `/workspace/taxidata-cleanup/screenshots/ekonomi-resultat/`.
- Tester: `tests/ekonomi/csv.cjs`, `resultat.cjs`, plus fas 1/2-testerna.

## Återstår
1. Berra: exakt Mirai-leasing, storbilarnas finansiering, TG-avgift, samt kort/konto och format för bränsleutdrag (gärna ett exempelutdrag).
2. Bilar-formuläret: fält för finansiering och månadsbelopp, förvald TG-avgift 13 000 kr/mån (Ekonomi ska bara läsa).
3. Exakt CSV/PDF-tolkning när exempelutdrag finns.
4. CSV/Kopiera ska ta med Resultat.
5. Verifiera mot Berras siffror (arbetsgivaravgift på lön + semester + sjuklön är ett antagande).
6. Före merge: applicera 20261128b och 20261128c, bumpa `CACHE_VER` i sw.js, Nyheter (ägare), undo-noteringar, rebase på main.
