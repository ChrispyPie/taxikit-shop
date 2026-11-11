# Mina bevakningar – utkast (inte driftsatt)

Ny ruta för alla roller på hemskärmen. Ett personligt flöde grupperat per svensk dag,
med effektiv ankomsttid (faktisk/beräknad/planerad) eller evenemangets starttid.
Avslutade poster försvinner efter två timmar. Evenemang med sluttid ligger kvar till
sluttid + två timmar, även när de började tidigare. Svenska tider: Europe/Stockholm.

## Befintliga datakällor – ingen SQL

- Enskilda tåg och flyg: `watch_list(p_token)` med `kind`, `ident`, `sched`,
  `label`, `state`, `expires_at`. Liveuppgifter återanvänder Ankomsters normalisering
  och datakällor via `ANKOMSTER.watchItems`: `/api/trains` med `tag.json` som reserv,
  respektive `skiftlogg/feed/got.json`. Nummer + planerad tid identifierar rätt ankomst.
- Återkommande tågnotiser: `train_watch_list(p_token)`. Påslagna regler matchas med
  befintliga `TAGNOTIS.matches`. Dag/tidsfönster beräknas för tågets ankomsttid i
  Stockholm (inklusive nattpass). Samma tåg visas bara en gång. Regelnamnen syns.
- Kalender: `get_events(p_token, p_from, p_to, p_city)` och bara poster med egna
  `subs`. Kalenderns kategori-filter begränsar inte det personliga flödet.
  Företagets tillgängliga städer hämtas via samma RPC och läses var för sig.
- Avbevaka: befintliga `watch_set(p_on:false)`, `set_event_subscription(p_on:false)`
  för samtliga egna påminnelser på evenemanget, eller `train_watch_save(enabled:false)`.
  Inga evenemang, ankomster eller andra förares data raderas. Tågnotis stängs av som
  hel regel (inte en enskild körning); detta förklaras i bekräftelsen innan ändringen.

Alla privata anrop bär aktuell `taxi_session` som `p_token`, som i befintliga verktyg.
Befintlig serverkontroll avgör vilken förares bevakningar som får läsas/ändras;
klienten läser inga privata tabeller direkt. Ingen ny RLS-policy eller migration.
Svar som tillhör en utbytt session kastas. Privata listor skrivs inte till localStorage.

## Kalender

`Visa mina bevakningar` lägger till enskilda och regelmatchade tåg/flyg i dag/vecka
samt prickar i månad/år. Dessa har egna mål till Ankomster, aldrig kalender-id:n.
Valet sparas per enhet i `taxi_kal_watches` (bara ett på/av-val, ingen personlig data).
Klick i flödet öppnar rätt kalenderhändelse inklusive datum och stad, eller rätt rad i
Ankomster med markering. Saknas ankomsten i tidtabellen visas ett tydligt besked.

## Avgränsningar

- Kalenderflödet hämtar från i går till ett år framåt, för de städer som kontot får se.
  Äldre evenemang som pågått mer än ett dygn kan ändå hämtas om de överlappar perioden.
- Tågnotiser är återkommande filter, inte bokningar med egna datum. Flödet visar bara
  matchande tåg som redan finns i den offentliga tidtabellen och inom regelns
  tidsfönster vid ankomst. Serverns pushutskick kontrollerar i stället arbetsfönstret
  vid utskickstid. Funktionen lovar inte att visa tågtider flera dagar i förväg.
- Befintlig notistjänst tar normalt bort enskild ankomstbevakning 30 minuter efter
  sista händelsen (flyg: sista bagaget). Då försvinner den tidigare än två timmar.
- Inget offline-arkiv. Flödet uppdateras varje minut när det är öppet och synligt.
  Kalendern läser bevakningar när den öppnas/slås på; öppna den igen för nya tider.
- Delkällor som misslyckas ger en varning, inte en missvisande tomlista.
- Övriga notistyper (t.ex. Prognos och forum) ingår inte i detta planeringsflöde.

## Test och skärmbilder

Installera befintliga testberoenden med `cd tests/meddelanden && npm ci`.
Kör från repo-roten:

```sh
node --check TaxiData/mina-bevakningar.js
node --check TaxiData/ankomster.js
node --check TaxiData/kalender.js
node --check TaxiData/changelog.js
node tests/bevakningar/logic.cjs
node tests/bevakningar/browser.cjs
(cd tests/meddelanden && npm test)
(cd tests/meddelanden && node intyg.cjs)
env -i PATH="$PATH" HOME="$HOME" deno test --allow-read=. --allow-write=/tmp/notis_test_out.json --allow-env supabase/functions/_test supabase/functions/prognos-sync/plan_test.ts
```

Browsertestet kör riktiga index.html och produktionsmoduler i en isolerad profil,
390 × 844 CSS-pixlar, med enbart syntetiska data. Alla externa anrop fångas.
Fyra skärmbilder sparas i `/workspace/taxidata-cleanup/screenshots/bevakningar/`.
Testar blandad lista, ordning, försening/bagage, rätt mål, tomvy, felvy, avbevaka,
tågnotisbekräftelse, sparad kalenderknapp och prickar i månad/år.

Nyheter-posten har `tid: ''` tills Christian godkänt och faktisk driftsättning sker.
Ingen merge före hans **kör**. Se UNDO.md för återställning.

## Testresultat för utkastet

- Syntaxkontroll inklusive inline-script i index.html: godkänd.
- Nya logiktester: 26 kontroller godkända (inklusive tidslinjens kolumner och midnatt).
- Nya mobiltester: 25 list-/bevakningskontroller + 23 tidslinjekontroller godkända. Åtta skärmbilder i 390 × 844 pixlar.
- Befintliga meddelandetester: 84 databaskontroller + 38 webbläsarkontroller godkända.
- Befintliga intygstester: 56 kontroller godkända.
- Deno: 16 tester godkända, 3 tick-integrationstester ger `forbidden` i sina gamla
  auth-fixtures. Exakt samma 3 fel bekräftade på oförändrad main; ingen backendkod
  ändras i denna PR. Testerna kördes utan ärvda hemligheter eller verkliga API-anrop.

## Tidslinje (uppföljning på PR #81)

Tidslinje är standard. `Tidslinje | Lista` sparas per enhet som `taxi_mb_view`;
bara visningsvalet sparas, aldrig bevakningsdata. Listan behåller alla dagar i ordning.

Tidslinjen har en egen skrollyta med **00–24**, timstreck och svagare halvtimmesstreck.
Skalan är 90 pixlar per timme. Vid öppning visas nuvarande tid ungefär en timme ned
från skrollytans topp. En röd **nu**-linje visas bara på dagens datum. På andra dagar
visas den första bevakningen med en timmes marginal, eller 08 om dagen är tom.
Dagvalet har I dag, I morgon, föregående/nästa dag samt prickar där det finns poster.
Uppdateringar behåller skrollpositionen och flyttar inte tillbaka användaren till nu.

Kalenderhändelser får höjd efter start/slut. Händelser över midnatt delas visuellt
på båda dagarna och märks med ↔. Tåg/flyg är korta markörer (32 minuter på skalan),
**inte arbetspass eller beräknad körtid**. Mycket korta kalenderhändelser får minst
24 minuter på skalan för att gå att läsa och trycka på. Flera samtidiga block delas
upp i kolumner. Ledigt-etiketter visas för luckor på minst 45 minuter mellan de
ritade blocken; de tar inte hänsyn till resväg, bagageväntan eller andra åtaganden.

Tryck på blocket öppnar källan. ⋯ öppnar en meny med Sluta bevaka och Avbryt;
ändringen kräver samma bekräftelse som i listan. Tangentbord kan stänga med Escape.
Menyn håller kvar samma post även om en pågående datahämtning ändrar ordningen.

### Avgränsningar i tidslinjen

- Nattpass visas som två civila dygn. Byt till I morgon för efter-midnatt-poster.
- Skalan är lokal väggklocka i Stockholm, alltid 00–24. På dagen då vintertid
  börjar delar de två förekomsterna av klockan 02 samma plats på skalan.
- Många samtidiga bevakningar ger smala kolumner på en telefon. Full rubrik finns
  i knappens tillgängliga namn och via källan eller Lista.
- Gamla poster som källan redan har tagit bort kan inte visas som historik.

Nya syntetiska mobilbilder, 390×844:
`05-tidslinje-blandat.png`, `06-tidslinje-overlapp.png`,
`07-tidslinje-imorgon.png`, `08-listval.png`, i samma skärmbildsmapp som ovan.

```sh
node tests/bevakningar/logic.cjs    # 26 kontroller, inklusive kolumner och midnatt
node tests/bevakningar/browser.cjs
node tests/bevakningar/timeline.cjs
```

Kvällens main-ändringar integrerades med en vanlig merge-commit på feature-grenen,
inte genom omskrivning av redan publicerade commits. Ingen force-push behövs.
PR #81 är fortfarande ett utkast och får inte mergas utan Christians kör.

## Fasta ruttbevakningar (20261111d, PR senare)

Tillfällig bevakning (silverstjärna) skapas med ☆ på Ankomster och ligger kvar i
`arrival_watches` som förut, cirka 30–60 min efter ankomst. Fast bevakning
(guldstjärna) skapas bara i Mina bevakningar med ett långt tryck och gäller
samma tur och klockslag (±15 min, svensk tid), inte tåg- eller flygnummer.
Tabell `route_watches` + RPC `route_watch_*`. Edge-funktionen `bevakning` tickar
även `rw_svc_active`. Befintliga `train_watches` och `flight_watches` lämnas kvar
och matchas fortfarande, men korten på Ankomster är borttagna.

Ljudfiler: `TaxiData/ljud/{tag,flyg,bat}.mp3` (valda av Christian). Saknas fil
spelas reservton. Toggles finns på Ankomster och i Mina bevakningar, inte under
Inställningar. Ångra SQL: `supabase/migrations/undo/20261111d_route_watches_undo.sql`.
