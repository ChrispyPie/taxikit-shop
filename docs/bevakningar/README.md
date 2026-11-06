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
- Nya logiktester: 14 kontroller godkända.
- Nya mobiltester: 25 kontroller godkända, fyra skärmbilder i 390 × 844 pixlar.
- Befintliga meddelandetester: 84 databaskontroller + 38 webbläsarkontroller godkända.
- Befintliga intygstester: 56 kontroller godkända.
- Deno: 16 tester godkända, 3 tick-integrationstester ger `forbidden` i sina gamla
  auth-fixtures. Exakt samma 3 fel bekräftade på oförändrad main; ingen backendkod
  ändras i denna PR. Testerna kördes utan ärvda hemligheter eller verkliga API-anrop.
