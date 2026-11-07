# Inkorg v4 – godkänd driftsättning 2026-11-07

PR #85, `feature/inkorg-steg1`, separat worktree. **Christian sade kör 2026-11-07 16:17 (Stockholm/CET).**
Produktionsmigreringarna applicerades och rollverifierades före merge. PR #85 mergades 16:22:28 Stockholm/CET, merge `c46ec7e10cfaffd21d61b6828fe85c6c4507e792`. Merge/deploy och exakt undo dokumenteras i [GO-LIVE-20261107.md](GO-LIVE-20261107.md).
Historisk beskrivning: [6 november](README-20261106.md). Driftsättning/återställning: [UNDO.md](UNDO.md).

## Byggt

- Förarens **Inkorg**: Alla, Meddelande, Sjuk, Verkstadstimmar. Kategoriikonerna ligger på en rad även vid 320 px; vald kategori blir rubrik över listan. Nytt ärende väljer mellan de tre formulären.
- Meddelande går till åkeriets admin. Ingen mottagarväljare för föraren. **Bil nr:** är en väljare med åkeriets registrerade bilar och **Nej**. Ingen bil är förvald; ett aktivt val krävs även för Meddelande.
- Samma tråd visar in- och utgående meddelanden, svar och tidsstämplad historik. Ingen privat förare-till-förare-sändning från profil eller RPC.
- Äldre privata samtal går fortfarande att läsa, inte besvara. Äldre bilärenden/underhåll är arkiv; inga nya separata fel-/förbruknings-/underhållsformulär i Inkorg eller Bil & verkstad.
- Sjuk/intyg och registrering av faktiskt arbetade verkstadstimmar återanvänder befintliga specialflöden.
- **Bokad tid** i varje ny meddelandetråd: ett **Typ**-fält (blir bokningens rubrik), en **kalenderknapp** med svensk kalender, skrivskyddat datum **ÅÅÅÅ-MM-DD**, **24-timmarstid** och ett valfritt meddelande. **Bil nr:** väljs från åkeriets bilar eller **Nej**; inget alternativ är förvalt. Timme (00–23) och minut (00–59) är vanliga väljare utan regional AM/PM-klocka, även på iPhone/Android. Servern kontrollerar svensk tidszon och bilens tillhörighet.
  Förarförslag väntar på admin; adminbokningar väntar på förarens svar. Avböj tar orsaken från **trådens vanliga svarsruta**. Inget extra orsaksfält eller instruktion visas före klicket. Tom ruta ger röd text **Vänligen specificera orsak**, utan nätanrop; servern nekar också tom orsak. Orsaken sparas som ett normalt meddelande och bokningsbeslut i samma transaktion (högst 2000 tecken). Beslut sparas, inte raderas.
- **Mina bevakningar** visar väntande tider grå/streckade och godkända solida. Avböjda tider ligger kvar i ärendet, men inte i schemat.
  Bokningar har ingen påhittad varaktighet; de visas som korta markörer, inte arbetspass. De kan inte tas bort via Sluta bevaka.
- **Admin › Ärenden** har Meddelande och Bokad tid, med chaufförsväljare begränsad till åkeriet. Vanlig admin hanterar allt där utom sekretess.
- Ägare/superadmin får inga nya ärenden i den personliga inkorgen, men kan starta ett där och hamnar sedan i Admin › Ärenden.
  En ägare som själv kör besvarar sina egna bokningar från adminpanelen. Gamla personliga samtal är fortfarande läsbara.
- **Önskemål och idéer** finns bara som separat adminmeny, inte i Inkorg/Ärenden. `dev_wishes` ändras inte.
- Enkel mobil UI, neutrala adminverktyg, befintlig swipe-back, tidsstämplar och inga kategori-/bilikoner i trådrubriken.

## Telefon och bilar

- Profilens **Lägg till bil** sparar flera bilnummer, 1–3 siffror. Dubbletter normaliseras. Biltelefon härleds på servern från den fasta serien och bilnumret utfyllt till tre siffror.
- Biltelefonerna visas alltid för inloggade förare i samma åkeri (och superadmin), oberoende av privat telefonval. Klickbara `tel:`/`sms:`-länkar.
- Det privata numret är **befintliga obligatoriska `drivers.phone` i Kontaktinformation/Personuppgifter**. Inget dubblerat privat telefonfält eller kopierat telefonvärde.
- Synlighetsvalet ligger direkt efter det befintliga telefonfältet: **Ägare / Åkeriet / Alla (inom Taxi Göteborg)**. Standard: **Ägare**. Bolagsnamnet är dynamiskt; servervärdena är oförändrade.
- Servervärden: `owner` / `company` / `bolag`. Ägare för rätt åkeri och superadmin får alltid se numret, liksom föraren själv.
  Vanlig admin får inte automatiskt se privata kontakttelefoner.
- `bolag` är samma taxibolag, **inte alla TaxiData-användare**. Separat explicit bolag–åkeri-koppling; nuvarande åkerier kopplas till Taxi Göteborg vid migreringen.
  Framtida åkerier utan koppling ger ingen delning över åkerigränsen. Bolagsnamnet i valet hämtas från servern. Se UNDO för administration.
- Kontaktsparning anropar befintlig `save_my_profile(text,jsonb)` med dess obligatoriska validering och sparar synligheten i **samma transaktion**.
  Ett misslyckat telefonsparande kan inte lämna ändrad synlighet eller tvärtom. Huvudlösenordsinloggning får inte ändra profilens kontaktval/bilar.

## Databas / säkerhet

Applicera efter godkännande, i denna ordning (inte hela historiska migrationsmappen):

1. `supabase/migrations/20261107074022_inkorg_steg1.sql`
2. `supabase/migrations/20261107135140_inkorg_v2_bookings_contacts.sql`

Båda namnen skapades med CLI, utan kollision med `20261107a/b/c`. De är fortfarande **inte applicerade**.

Första migrationen ger vanlig admin icke-sekretessbehörighet, åkeriavgränsar sjukflöden/intyg/push och centraliserar sekretess i `private.sjuk_boss_roles()`.
`private.workshop_roles()` för lönefunktioner lämnas oförändrad. Önskemål tas ur de sammanslagna ärendelistorna, utan att ändra raderna.

V2 lägger till ett oexponerat `inbox_private`-schema med `threads`, `messages`, `reads`, `bookings`, `contacts`, `bolag`, `operator_companies`.
Alla tabeller har RLS och saknar klienters tabell-/sekvensbehörigheter. Publika `mailbox_v2` är security invoker; en privat security-definer dispatcher med tom search_path
verifierar aktiv session, roll, åkeri, ägarskap, motpart, datum, fältlängder och frekvens. Ingen tillit till klientens rollflagga eller user_metadata.
Bokningsbeslut tar radlås och kan inte göras två gånger. Servern nekar fel åkeri, förarens rollförfalskning, bekräftelse av den egna förarsidans förslag och sommarluckor.

Äldre direktmeddelandens skriv-RPC:er (även underliggande privata funktioner) får sina klientgrants återkallade.
Äldre bilärendens normala skriv-RPC:er stängs också. Alla befintliga rader, foton och tabeller bevaras. Intyg använder fortfarande det befintliga skyddade Edge-flödet.
Vanlig admin får inte ens sammanfattningar av andras sjukärenden. Tillfällig superadminåtkomst styrs **bara av `private.sjuk_boss_roles()`**; stäng av efter testning enligt UNDO.

## Tester

Endast syntetiska personer, sessioner och texter. Inga live-meddelanden, kunduppgifter eller intyg hämtades. Bilärende 21 berörs inte.

```sh
# PGlite (lokal PostgreSQL-motor): npm install --prefix /tmp/inkorg-test --no-save @electric-sql/pglite@0.5.15
NODE_PATH=/tmp/inkorg-test/node_modules node tests/inkorg-v2/db.cjs
NODE_PATH=/tmp/inkorg-test/node_modules node tests/inkorg/db.cjs
NODE_PATH=/tmp/inkorg-test/node_modules node tests/meddelanden/db.cjs
node tests/bevakningar/logic.cjs
# Separat Pythonmiljö med playwright och Chromium/Chrome:
python tests/inkorg-v2/browser.py
# Äldre UI-regressioner behöver tests/meddelanden/package.json installerat lokalt:
node tests/bevakningar/browser.cjs
node tests/bevakningar/timeline.cjs
# Tidigare UI-testentrypoints delegerar nu till v2 (samma Pythonberoende):
# PYTHON=/sökväg/till/playwright-venv/bin/python npm test --prefix tests/meddelanden
```

Resultat: **105 v2/v3/v4 DB-assertioner**, **68 sekretess-/intyg-/ärendeassertioner**, **84 meddelande-/löneassertioner**,
**26 tidslinjelogikassertioner**, **102 v2/v3/v4 Playwright-assertioner** samt **25 + 23** befintliga bevaknings-/tidslinjeassertioner.
V2 provar även migrationens återkörning och undo med bevarade rader, bolagsgränser, standardsekretess, atomisk kontaktsparning, nekade direktgrants,
båda förslagssidorna, avböj/motivering, sommartidslucka, arkiv, sena svar efter navigering och 320/390 px utan sidöverrinning.

Tio mobilbilder i `/workspace/taxidata-cleanup/screenshots/inkorg-v4/`, inte incheckade. Bäst för granskning:
`10-kalenderval.png`, `06-admin-bokad-tid.png`, `08-avboj-orsak.png`, `02-meddelande-formular.png`.
Browserproven kör en ny isolerad headless-profil med verkliga lokala HTML/JS-filer, mockade RPC:er och blockerad extern trafik, inte en riktig förarinloggning.

## Avgränsningar / verifieringsgränser

- Godkännande, produktionsmigrering och produktions-RPC med isolerade syntetiska testroller är klara; se driftsättningsprotokollet. Befintliga personers inloggningar, fysisk mobil/Safari och signerade intyg genom hela Edge/Storage-flödet är inte provade.
- Bokningar och nya meddelanden har olästa-markering i Inkorg (uppdateras vid öppning och pollning), men inga nya mejl-/pushleveranser byggs här.
- Äldre privata samtal/bilärenden är arkiv och får inte nya bokningsknappar; nya ärenden startas som Meddelande.
- Befintliga äldre Uppgifter under Bil & verkstad behålls; nya bokningar använder inte den tabellen eller dess tidigare schemalogik.
- Bokning har ingen sluttid eller avboknings-/ombokningsfunktion. Föreslå en ny tid i tråden efter avböj; redan fattat beslut bevaras.
- Biltelefoner skapas från de bilnummer föraren lagt till; inga äldre fordons-/persondata masskopieras till nya kontaktlagret.

## V4-migrationsnotering

V2-migrationen justerades före första applicering och applicerades vid godkänd driftsättning 2026-11-07. Inga äldre produktionsmigrationer skrevs över. Samma undo stänger hela nya RPC-flödet och bevarar alla rader och meddelanden.
Typ används som rubrik på servern. `cars` returnerar endast ID och bilnummer för sessionens åkeri. Den privata `resolve_car`-hjälparen nekar klienternas direktanrop och verifierar bilens company_id.
Både Meddelande och Bokad tid kräver `car_choice`: ett ID från åkeriets bilregister eller exakt `none` (= Nej). Tomt/ogiltigt val och annan åkeris bil nekas. Inskickade fria bilnummer ignoreras; numret härleds från den verifierade bilen.
Nya trådar/bokningar sparar car_id och bilnummer som historisk text. Om själva bilregisterposten tas bort senare sätts bara länken till null, medan historikens bilnummer bevaras. Inga sådana rader har ändrats nu.
Profilens egna bilnummer/biltelefoner är fortfarande separata kontaktuppgifter och skapar inga poster i åkeriets bilregister.

Avböj sparar texten från vanliga svarsrutan som meddelande tillsammans med det radlåsta beslutet; inget separat orsaksfält finns. Ett osänt svar bevaras om användaren i stället accepterar tiden.

Browserprovet väljer dagar i den riktiga kalenderdialogen och timmar/minuter i 24-timmarsväljarna, utan att skriva datum manuellt. Det omfattar iPhone 13- och Pixel 7-skärm-/UA-profiler i Chromium.
Detta är emulering, inte verifiering på fysiska iPhone-/Android-enheter eller i verklig Safari. Datum och tid beror inte längre på deras regionala datum-/klockväljare.
