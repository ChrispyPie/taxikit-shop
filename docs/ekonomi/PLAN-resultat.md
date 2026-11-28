# Ekonomi › Resultat: tjänar åkeriet pengar? (plan)

Christian 2026-11-28: fokus ska vara hur mycket åkeriet tjänar, plus eller minus per månad eller år. Alla fasta och rörliga avgifter in, förarlöner, semester, arbetsgivaravgift, sjuklön, moms, skatt och allt annat. Bygget är en **utkast-PR**, inget live och ingen migration i prod före hans kör.

Svar från Christian 28 nov (morgon): bolaget är ett **aktiebolag** (bolagsskatt 20,6 %). **Mirai** leasas (3 år, fast månadskostnad, allt utom däck ingår). **Storbilar** är oklart, troligen avbetalning. **Taxi Göteborg-avgift** ca 13 000 kr per bil och månad.

## Så ser räkningen ut (en månad eller ett år)
```
 Intäkter (inkört + Uber, exkl. moms)                        +
 − Avgifter: Uberavgift 25 %, adm.avgift 1,3 %, inpassering 2 500 kr/förare/mån,
             Taxi Göteborg-avgift (förvalt 13 000 kr per aktiv bil och månad)
 − Förarlöner (provision 37 % av lönegrund)
 − Semesterersättning 13 %
 − Arbetsgivaravgift 31,42 % (+ pension, löneskatt, övriga försäkringar, samma som bilkalkylen)
 − Sjuklön (Beviljad/Utbetald) och verkstadstimmar (förarnas verkstadstid)
 − Bilkostnader, beroende på finansiering:
     Mirai: leasing (fast månadskostnad). Service, försäkring, avskrivning och liknande ingår, inte däck.
     Storbil: avbetalning (fast månadskostnad, antagande). Vad som ingår är oklart.
     Övriga ägda bilar: avskrivning, räntor, fordonsskatt, service, försäkring, tvätt (från Bilar)
 − Däck och övriga kostnader (manuellt inlagda)
 = Resultat före skatt                                       ± (plus grönt, minus rött)
 − Bolagsskatt 20,6 % av positivt resultat före skatt (0 kr vid förlust). Procentsatsen kan ändras.
 = Resultat efter skatt
 Moms att redovisa (utgående 6 % − ingående moms på kostnader)  visas separat, räknas inte som intäkt eller kostnad
```

## Vad vi redan har i TaxiData (automatiskt, ingen inmatning)
| Post | Källa |
|---|---|
| Inkört, Uber brutto, körda dagar, inpasseringsandel | `private.day_summary` via `forar_lon_period` / `ekonomi_loneunderlag` |
| Uberavgift, adm.avgift, inpassering | Samma formler som Lönekoll och bilkalkylen: 25 %, 1,3 %, 2 500 kr |
| Förarlön, semester | `ekonomi_loneunderlag` (provision × lönegrund, 13 %) |
| Arbetsgivaravgift 31,42 %, pension 4,4 %, löneskatt 1,067 %, övriga försäkringar 0,26 % | `lonekost_settings` (Bilar › Lönekostnad och sjuklön) |
| Sjuklön, verkstadstimmar | `ekonomi_period` (fas 1) |
| Vilka bilar som är i trafik, modell och bildtyp (Mirai / storbil) | `public.cars` |
| Bolagsskatt 20,6 % | Förvalt i Resultat, kan ändras i appen |
| Taxi Göteborg-avgift 13 000 kr/bil/mån | Förvalt per aktiv bil, kan ändras. Märkt "kolla med Berra" tills beloppet är bekräftat |
| Moms 6 % (taxi) | Räknas från intäkterna |

## Bilar och Ekonomi (beslut 28 nov)
**Bilar förblir en egen modul.** Ekonomi läser bara bilkostnaderna därifrån och visar dem som en post i Resultat, med länken **Redigera i Bilar**. Ingen bildata redigeras eller sparas i Ekonomi (ingen extra tabell för leasing eller avgifter).
- Mirai, storbil och Taxi Göteborg-avgift hör hemma på respektive bil under Bilar. Tills fälten för finansiering (leasing / avbetalning / ägd) och månadsbelopp finns i Bilar-formuläret gissar Resultat typen från modell/bildtyp och använder ifyllda belopp om de finns, annars ett förvalt värde märkt "kolla med Berra".
- Däck, bränsle, lokal och andra poster som inte ligger på en bil läggs in i Ekonomi.

## Vad som måste matas in manuellt (Christian/Berra)
1. **Exakt leasingbelopp per Mirai** (kr/mån, exkl. moms). Avtalet är 3 år och täcker allt utom däck, men beloppet saknas ännu. Beloppet fylls i under Bilar. Tills det finns märks raden "kolla med Berra". I demon visas ett exempelbelopp.
2. **Storbilarnas finansiering**: troligen avbetalning, men det ska bekräftas. Vilket månadsbelopp, och vad ingår (försäkring, skatt, service)? Fylls i under Bilar. Märks "kolla med Berra" tills det är klart.
3. **Taxi Göteborg-avgiften exakt**: förvalt 13 000 kr per aktiv bil och månad (läses från Bilar, fältet taxiavgift, eller som förval om det saknas), märkt "kolla med Berra" tills Berra säger det rätta beloppet.
4. **Bränsle och el per månad:** Berra laddar upp månadens konto- eller kortutdrag (CSV, PDF eller bild) i Ekonomi. Filen sparas privat (bara ägare/superadmin, kan tas bort). CSV tolkas generiskt och en föreslagen summa visas; Berra bekräftar (eller ändrar) innan den sparas som månadens bränsle/el. PDF och bild sparas med belopp som fylls i för hand. Kortutgivare och filformat är ännu okända.
5. **Däck** (ingår inte i Mirai-leasing): säsong eller engång, läggs in som kostnad.
6. **Övriga fasta kostnader**: lokal/kontor, bokföring/revisor, bank, telefon, system/prenumerationer, tillstånd.
7. **Rörliga engångskostnader**: skador/självrisk, böter, extra reparationer som inte är verkstadstimmar.
8. **Ingående moms** per post (6 %, 12 %, 25 % eller 0 %). Förvalt 25 %, bränsle 25 %, försäkring och leasing oftast 0 % (bekräftas).

## Kostnadstabell (utkast, ej i prod)
`private.ekonomi_kostnad`: id, company_id, kategori (`bil`, `bransle`, `lokal`, `forsakring`, `administration`, `skador`, `avgift`, `dack`, `ovrigt`), namn, belopp (exkl. moms), moms_pct (0/6/12/25), typ (`engang`, `manad`, `ar`), fran, till (tom = pågår), bil, anteckning, skapad av och när, borttagen (mjuk radering).
- Återkommande poster (typ månad/år) fördelas per månad mellan fran och till (år delas på 12). Engångsposter hamnar i månaden för fran.
- RLS på, ingen policy: allt går via `SECURITY DEFINER`-funktioner som kollar `private.bil_actor`: **bara ägare och superadmin**, inte demo, bara det egna åkeriet.
- Funktioner: `ekonomi_kostnader` (lista + bilar + förvalda inställningar), `ekonomi_kostnad_spara` (ny eller ändra), `ekonomi_kostnad_ta_bort`.
- Ångra: `supabase/migrations/undo/20261128b_ekonomi_resultat_undo.sql`. Inget i befintliga tabeller ändras.

## Skiss (mobil, Resultat överst)
```
 Åkeriekonomi            [Månad | År]
 ‹        November 2026        ›
 ┌────────────────────────────────┐
 │ RESULTAT · november 2026       │
 │        + 1 807 kr   (grön)     │  efter bolagsskatt; röd vid förlust
 │ Före skatt +2 274  · Skatt 20,6 % −467 │
 │ Intäkter …  Kostnader …        │
 └────────────────────────────────┘
 [ diagram: stapel per månad, före skatt, grön plus / röd minus ]
 ▸ Intäkter
 ▸ Avgifter          (Uber, adm, inpassering, Taxi Göteborg 13 000 kr × bilar)
 ▸ Förarlöner och lönebikostnader
 ▸ Sjuklön och verkstad
 ▸ Bilkostnader      (läses från Bilar: Mirai leasing, storbil avbetalning)  [Redigera i Bilar]
 ▸ Bränsle och el     [Ladda upp utdrag] (CSV föreslår summa, PDF/bild = belopp för hand)
 ▸ Övriga kostnader  [+ Lägg till / Ändra]
 ▸ Moms och skatt
 ▸ Verkstad / Sjuklön / Löneunderlag (som i dag)
```

## Etapper
1. Plan (den här filen).
2. SQL: tabell + funktioner + undo (utkast, ej applicerad).
3. UI: Resultat överst, diagram, specifikation, formulär (lägga till och ändra). Demo-data och skärmbilder.
4. Christians svar inarbetade (bolagsskatt, Mirai-leasing, storbil avbetalning, TG-avgift).
5. Efter Christians kör: applicera migrationen, cache-bust, Nyheter, merge.
6. Bilar-formuläret: fält för finansiering (leasing / avbetalning / ägd) och månadsbelopp, plus förvald Taxi Göteborg-avgift 13 000 kr/mån. Ekonomi läser bara.
7. När Berra skickat exempelutdrag: exakt CSV/PDF-tolkning för det kortet.
8. Senare: bränsle även från mil och drivmedelspriser, bokföringsexport, budget mot utfall, moms- och skatterapport.

## Bränsleutdrag (beslut 28 nov)
Ett fält i Ekonomi där Berra laddar upp **månadens utdrag** för bränsle och el.
- Tillåtna filer: CSV, PDF, JPEG/PNG/WebP, max 8 MB.
- Filen ligger i `private.ekonomi_utdrag` (bytea, RLS på, ingen policy). Bara ägare och superadmin via `SECURITY DEFINER`. Kan tas bort (filinnehållet släpps). Ångra: drop av tabell och funktioner.
- CSV: generisk tolkning i appen (avgränsare `;`, `,` eller tabb; kolumn som heter belopp/summa/amount/debit mer). Föreslagen summa visas, Berra bekräftar innan den blir kostnad.
- PDF/bild: ingen automatisk tolkning tills vi vet formatet. Filen sparas, Berra skriver beloppet.
- Bekräftad summa blir en kostnad i kategorin Bränsle och el för den månaden. Ett nytt utdrag kan ersätta efter bekräftelse.

## Öppna frågor till Berra
- **Mirai-leasing:** exakt belopp per bil och månad (exkl. moms)? Samma för alla Mirai? När började avtalet, och löper det exakt 3 år?
- **Storbilar:** är det avbetalning? Vilket månadsbelopp, hur länge, och vad ingår (försäkring, fordonsskatt, service)? Annars ägda?
- **Taxi Göteborg-avgift:** stämmer ca 13 000 kr per bil och månad? Ingår allt (beställningscentral, tillstånd, övrigt) i den summan, eller finns fler poster?
- Ingående moms på leasing och avbetalning (0 % eller 25 %)?
- Ska förarnas verkstadstimmar räknas som kostnad (de betalas ut till förarna) eller bara redovisas? (I utkastet räknas de som kostnad.)
- **Bränsle/el-utdrag:** vilket kort eller konto använder åkeriet (t.ex. OKQ8, Circle K, Preem, bankens företagskort)? Vilket format kommer månadsutdraget i (CSV, PDF, Excel, bild)? Finns ett exempelutdrag att bygga en exakt tolkning mot? Ingående moms – är beloppet inkl. eller exkl. moms, och vilken momssats (25 %)?
