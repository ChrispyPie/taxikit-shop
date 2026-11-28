# Ekonomi › Resultat: tjänar åkeriet pengar? (plan)

Christian 2026-11-28: fokus ska vara hur mycket åkeriet tjänar, plus eller minus per månad eller år. Alla fasta och rörliga avgifter in, förarlöner, semester, arbetsgivaravgift, sjuklön, moms, skatt och allt annat. Bygget är en **utkast-PR**, inget live och ingen migration i prod före hans kör.

## Så ser räkningen ut (en månad eller ett år)
```
 Intäkter (inkört + Uber, exkl. moms)                        +
 − Avgifter: Uberavgift 25 %, adm.avgift 1,3 %, inpassering 2 500 kr/förare/mån, Taxi Göteborg-avgift
 − Förarlöner (provision 37 % av lönegrund)
 − Semesterersättning 13 %
 − Arbetsgivaravgift 31,42 % (+ pension, löneskatt, övriga försäkringar, samma som bilkalkylen)
 − Sjuklön (Beviljad/Utbetald) och verkstadstimmar (förarnas verkstadstid)
 − Bilkostnader: avskrivning, räntor, fordonsskatt, service, försäkring, tvätt, taxiavgift, bränsle/el
 − Övriga kostnader (manuellt inlagda)
 = Resultat före skatt                                       ± (plus grönt, minus rött)
 Moms att redovisa (utgående 6 % − ingående moms på kostnader)  visas separat, räknas inte som intäkt eller kostnad
 Skatt (uppskattad, ska bekräftas av Berra/revisor)           −
 = Resultat efter skatt
```

## Vad vi redan har i TaxiData (automatiskt, ingen inmatning)
| Post | Källa |
|---|---|
| Inkört, Uber brutto, körda dagar, inpasseringsandel | `private.day_summary` via `forar_lon_period` / `ekonomi_loneunderlag` (per månad och förare, fas 2) |
| Uberavgift, adm.avgift, inpassering | Samma formler som Lönekoll och bilkalkylen (`BK` i admin.html): 25 %, 1,3 %, 2 500 kr |
| Förarlön, semester | `ekonomi_loneunderlag` (provision × lönegrund, 13 %) |
| Arbetsgivaravgift 31,42 %, pension 4,4 %, löneskatt 1,067 %, övriga försäkringar 0,26 % | Inställningen `lonekost_settings` (Bilar › Lönekostnad och sjuklön) |
| Sjuklön, verkstadstimmar | `ekonomi_period` (fas 1) |
| Bilkostnader per år (avskrivning, räntor, skatt, service, försäkring, tvätt, taxiavgift) | Kolumnerna i `public.cars` som redan fylls i under Bilar (delas på 12 per månad, bara månader bilen är i trafik) |
| Moms 6 % (taxi) | Räknas från intäkterna |

## Vad som måste matas in manuellt (Christian/Berra)
1. **Bilkostnaderna per bil** om de inte redan är ifyllda under Bilar (inköpspris, livslängd, räntor, fordonsskatt, service, försäkring, tvätt, Taxi Göteborg-avgift per år). Saknas de visar Resultat "saknas för bil X".
2. **Bränsle och el per månad** (tankning, laddning). Bilkalkylen har en uppskattning per mil men inte verkliga kvitton. Kan läggas in som månadspost eller engångspost. Senare: räkna automatiskt från mil och drivmedelspriser.
3. **Övriga fasta kostnader**: lokal/kontor, bokföring/revisor, bank, telefon, system/prenumerationer, leasing om bilar leasas i stället för ägs, åkeriavgifter/tillstånd, TCO/Taxi Göteborg-medlemsavgift.
4. **Rörliga engångskostnader**: skador/självrisk, böter, extra reparationer som inte är verkstadstimmar, nya däck.
5. **Skatt**: Berra måste säga bolagsform (aktiebolag 20,6 % bolagsskatt, eller enskild firma med egenavgifter). Tills dess visas "Skatt (uppskattad)" med en procentsats som kan ändras och är av som standard.
6. **Ingående moms** per post (6 %, 12 %, 25 % eller 0 %) anges på varje kostnad. Förvalt 25 %, bränsle 25 %, försäkring 0 %.

## Kostnadstabell (utkast, ej i prod)
`private.ekonomi_kostnad`: id, company_id, kategori (`bil`, `brasle`, `lokal`, `forsakring`, `administration`, `skador`, `ovrigt`), namn, belopp (exkl. moms), moms_pct (0/6/12/25), typ (`engang`, `manad`, `ar`), fran (datum), till (datum, tom = pågår), bil (bilnummer, valfritt), anteckning, skapad av och när, borttagen (mjuk radering).
- Återkommande poster (typ månad/år) fördelas per månad mellan fran och till (år delas på 12). Engångsposter hamnar i månaden för fran.
- RLS på, ingen policy: allt går via `SECURITY DEFINER`-funktioner som kollar `private.bil_actor`: **bara ägare och superadmin**, inte demo, bara det egna åkeriet (samma som `ekonomi_period`).
- Funktioner: `ekonomi_kostnader(token)` (lista + bilkostnader), `ekonomi_kostnad_spara(token, ...)`, `ekonomi_kostnad_ta_bort(token, id)`.
- Ångra: egen undo-fil som tar bort funktionerna och tabellen. Inget i befintliga tabeller ändras.

## Skiss (mobil, Resultat överst)
```
 Åkeriekonomi            [Månad | År]
 ‹        November 2026        ›
 ┌────────────────────────────────┐
 │ RESULTAT · november 2026       │
 │        + 41 280 kr   (grön)    │  röd och minus om förlust
 │ Intäkter 257 831  Kostnader 216 551 │
 └────────────────────────────────┘
 [ diagram: stapel per månad, grön plus / röd minus ]
 ▸ Intäkter                       257 831
 ▸ Avgifter                       −12 480
 ▸ Förarlöner och lönebikostnader −121 600   (lön, semester, arbetsgivaravgift …)
 ▸ Sjuklön och verkstad           −  1 900
 ▸ Bilkostnader                   − 52 100
 ▸ Övriga kostnader               − 18 000   [+ Lägg till kostnad]
 ▸ Moms att redovisa (info)        14 600
 ▸ Verkstad / Sjuklön / Löneunderlag (som i dag)
```
Varje ▸ öppnas för specifikation (per förare, per bil, per post). Ladda ner (CSV) och Kopiera tar med Resultat.

## Etapper
1. Plan (den här filen).
2. SQL: tabell + funktioner + undo (utkast, ej applicerad).
3. UI: Resultat överst, diagram, specifikation, formulär för kostnader. Demo-data och skärmbilder.
4. Efter Christians kör: applicera migrationen, cache-bust, Nyheter, merge.
5. Senare: bränsle automatiskt, bokföringsexport, budget mot utfall, moms- och skatterapport.

## Frågor till Christian/Berra
- Bolagsform och skatt (se 5)? Är bilarna köpta eller leasade (leasing är då en månadsskostnad)?
- Vilka fasta avgifter betalar åkeriet till Taxi Göteborg, och är de per bil eller per månad?
- Ska förarnas verkstadstimmar räknas som kostnad (de betalas ut till förarna) eller bara redovisas?
