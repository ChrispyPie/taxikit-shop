# Inkorg v2 – utkast, inte live

PR #85, `feature/inkorg-steg1`, separat worktree. **Ingen merge och inga produktionsmigreringar. Christian måste säga kör.**
Historisk beskrivning: [6 november](README-20261106.md). Driftsättning/återställning: [UNDO.md](UNDO.md).

## Byggt

- Förarens **Inkorg**: Alla, Meddelande, Sjuk, Verkstadstimmar. Nytt ärende väljer mellan de tre formulären.
- Meddelande går till åkeriets admin. Ingen mottagarväljare för föraren. Valfritt **Bilnummer**, vanlig inmatning med 1–3 siffror.
- Samma tråd visar in- och utgående meddelanden, svar och tidsstämplad historik. Ingen privat förare-till-förare-sändning från profil eller RPC.
- Äldre privata samtal går fortfarande att läsa, inte besvara. Äldre bilärenden/underhåll är arkiv; inga nya separata fel-/förbruknings-/underhållsformulär i Inkorg eller Bil & verkstad.
- Sjuk/intyg och registrering av faktiskt arbetade verkstadstimmar återanvänder befintliga specialflöden.
- **Bokad tid** i varje ny meddelandetråd: typ, rubrik, datum, tid och valfritt bilnummer. Svensk tidszon kontrolleras på servern.
  Förarförslag väntar på admin; adminbokningar väntar på förarens svar. Avböj kräver motivering. Beslut sparas, inte raderas.
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
- Synlighetsvalet ligger direkt efter det befintliga telefonfältet: **Ägaren / Åkeriet / Taxi Göteborg**. Standard: **Ägaren**.
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

Resultat: **81 v2 DB-assertioner**, **68 sekretess-/intyg-/ärendeassertioner**, **84 meddelande-/löneassertioner**,
**26 tidslinjelogikassertioner**, **48 v2 Playwright-assertioner** samt **25 + 23** befintliga bevaknings-/tidslinjeassertioner.
V2 provar även migrationens återkörning och undo med bevarade rader, bolagsgränser, standardsekretess, atomisk kontaktsparning, nekade direktgrants,
båda förslagssidorna, avböj/motivering, sommartidslucka, arkiv, sena svar efter navigering och 320/390 px utan sidöverrinning.

Sju mobilbilder i `/workspace/taxidata-cleanup/screenshots/inkorg-v2/`, inte incheckade. Bäst för granskning:
`01-inkorg.png`, `03-trad-bokad-tid.png`, `04-tidslinje-gra-solid.png`, `05-kontaktinformation.png`, `06-admin-bokad-tid.png`.
Browserproven kör en ny isolerad headless-profil med verkliga lokala HTML/JS-filer, mockade RPC:er och blockerad extern trafik, inte en riktig förarinloggning.

## Avgränsningar / kvar före live

- Godkännande, produktions-/stagingmigrering och test med riktiga testroller återstår. PGlite + mockade browserprov är inte verifiering av en driftsatt Supabase/PostgREST/Edge-miljö.
- Bokningar och nya meddelanden har olästa-markering i Inkorg (uppdateras vid öppning och pollning), men inga nya mejl-/pushleveranser byggs här.
- Äldre privata samtal/bilärenden är arkiv och får inte nya bokningsknappar; nya ärenden startas som Meddelande.
- Befintliga äldre Uppgifter under Bil & verkstad behålls; nya bokningar använder inte den tabellen eller dess tidigare schemalogik.
- Bokning har ingen sluttid eller avboknings-/ombokningsfunktion. Föreslå en ny tid i tråden efter avböj; redan fattat beslut bevaras.
- Biltelefoner skapas från de bilnummer föraren lagt till; inga äldre fordons-/persondata masskopieras till nya kontaktlagret.
