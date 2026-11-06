# Meddelanden, Ärenden och Löner

## Vad ändras?
- Förarnas separata Anmälningar & ärenden-ikon tas bort. Gamla rapportlänkar fungerar fortfarande.
- Under profilikonen: separata **Meddelanden** och **Ärenden**. Båda öppnar samma sida, med rätt sida förvald i växlaren Meddelanden | Ärenden. Klockan behåller notiser. Ingen Inkorg/Utkorg.
- Nytt ärende återanvänder `verkstad.js` och `sjuk.js`, inklusive befintliga foton, validering och RPC:er. Ingen ny rapportsparlogik.
- Nytt meddelande startar en privat samtalstråd med ämne mellan två personer. Mottagarlistan visar förnamn + efternamnsinitial. Adminmottagare märks med Admin; det är en bestämd person, inte en delad brevlåda.
- Alla aktiva förare kan väljas (även över åkerigränser, precis som offentliga profiler). Huvudlösenord och demo ger inte tillgång till privata meddelanden.
- Samtalslistan visar ämne, motpart, senaste text, ↙ inkommande eller ↗ utgående och olästmarkering. En tråd öppnar hela samtalet med svarsruta; utgående bubblor visar läskvitto. Listan hämtas 50 samtal i taget med Visa fler. Ingen radering.
- Ärendesidan har Nytt ärende överst, Pågående och hopfällda Avslutade. Varje rad öppnar den befintliga ärendetypens detaljvy och verktyg.
- Admin har en kompakt Ärenden-lista med typ och status. Behövs/fel, verkstadstid, uppgifter, sjukanmälningar och Berras önskemål finns kvar. Underhåll har egen typvy och länkar till samma underhållsverktyg.
- Fråga föraren, Neka och Godkänn finns i detaljvyn för verkstadstid, med motivering. Klara ärenden ligger ihopfällda under Visa klara och försvinner inte.
- `admin.html#verkstad` och `openMenu('verkstad')` pekar till Ärenden.
- **Admin › Löner**, med underrubriken **(verktyg & underlag)**, har timpris, månadsbyte, verkstadstid per förare, godkänt belopp, väntande tid och CSV/kopiera. Fler löneposter kan läggas till senare. Själva verkstadstidsärendena och deras frågor/godkännanden stannar i Ärenden, både hos föraren och i Admin.

## Databas och behörighet
Migrationer: `supabase/migrations/20261106g_meddelanden_loner.sql` och den additiva designändringen `20261106g2_meddelanden_tradar.sql`.

**Applicerad i Supabase 6 november 2026 under PR-arbetet.** Den är rent additiv: nya tabeller/index, nytt privat schema, en ny nullable conversation_id-kolumn och nya RPC:er. Inga befintliga funktioner, roller, data eller sidbeteenden ersätts. Christian godkände publicering 6 november kl. 20:26 (Europe/Stockholm). PR #79 mergades som `38948deacc35113aeb79d3e02760854f0e5a980c`; första lyckade Pages-deploy blev klar kl. 20:29 (Europe/Stockholm), körning `42279911551`. Ingen ytterligare SQL behövdes vid publiceringen.

- `public.direct_messages` och `public.message_conversations`: RLS aktiverad och inga direkta tabell-/sekvensrättigheter för anon/authenticated. Avsiktligt inga RLS-policies: custom session-auth sker i RPC:erna.
- `messaging_private`: ej ett exponerat API-schema. SECURITY DEFINER med tom `search_path` och kvalificerade objektnamn. Publika funktioner är SECURITY INVOKER-wrappers.
- `message_recipients`, `conversation_list`, `conversation_get`, `conversation_create`, `conversation_reply`: kontrollerar en riktig, aktiv session med `private.session_actor`. Identiteten kommer aldrig från klientens avsändar-ID.
- Endast avsändare/mottagare får läsa. Inte ens ägare, vanlig admin eller superadmin får läsa andras meddelanden. Huvudlösenord nekas. Bara mottagaren kan sätta läskvitto. Ämne 1–120 tecken, text 1–2000 tecken, högst 100 skickade per rullande dygn, serialiserat per avsändare.
- `payroll_month`: explicit ägare/S admin-kontroll och åkeriscope. Räknar godkänd tid med priset vid godkännandet. Månadsgränser i Europe/Stockholm; startdatum avgör månaden. Väntande/nekad tid räknas separat.
- Befintliga `workshop_roles()` och `bil_admin_roles()` är redan bara agare/superadmin, verifierat i Supabase. Befintlig `sjuk_actor`, `sjuk_report_for`, `sjuk_get`, `case_get` och `case_admin_list` behåller sin kontroll: förare får se sin egen anmälan, ägare/S admin andras. Vanlig admin får varken löneunderlag eller andras sjukanmälningar.
- **Icke-ägaradmins behörighet är inte beslutad. Fråga Berra innan den utökas.** Ingen utökning görs här.

## Säkerhetskontroll
Supabase Security Advisors körd efter migration. Nya objekt: endast informationsnotisen `rls_enabled_no_policy` för den RPC-skyddade `direct_messages`/`message_conversations` (avsiktlig deny-all). Inga andra nya fynd för dessa objekt. Äldre fynd i projektet ändras inte av denna PR.
Information: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Test
`tests/meddelanden/` innehåller isolerade tester med enbart påhittade exempel; inga riktiga sessioner, personuppgifter, kunduppgifter eller meddelanden används.

```sh
npm ci --prefix tests/meddelanden
npm test --prefix tests/meddelanden
```

SQL-testet kör migrationsfilerna i PGlite/PostgreSQL. **84 SQL-kontroller godkända.** Testar deltagarnas åtkomst, nekad tredjepart/ägar/admin-läsning, huvudlösenord, läskvitto, rå tabellåtkomst för anon/authenticated, validering, paginering, spamgräns, ägarbegränsad månadssumma, åkeriscope, månadsgräns och icke-destruktiv undo.

**38 mobilkontroller godkända, 17 mobilbilder sparade.** Testberoenden: npm audit utan sårbarheter.

Mobiltestet kontrollerar också profilmenyns förval, båda sidorna, nytt ämne, hela samtalet/svar, bevarat utkast, de fyra rapportformulären, adminbeslut, underhåll, önskemål, äldre route och att vanlig admin inte ser Löner.

Mobiltestet startar en egen isolerad headless Chrome utan sparade webbläsarsessioner och laddar PR:ens riktiga index.html/admin.html och JS. API-svar är mockade och märkta TESTVY i bilderna. Inga testmeddelanden skickas live. `CHROME_BIN` och `SCREENSHOT_DIR` kan anges. Bilder: `/workspace/taxidata-cleanup/screenshots/meddelanden/`.

## Återställning
Se [UNDO.md](UNDO.md). Backup före arbetet: `backup/pre-meddelanden-20261106` från main `040dd24b`.
Backup precis före merge: `backup/pre-meddelanden-merge-20261106` = `05c7b1a5f6d360b174b90ed6f5ab42ea9384fd90`, pushad före merge.


## Intyg i Ärenden – 6 november 2026

Orsak: den nya gemensamma `ARENDE.view` visade endast `Intyg: N` och uppladdningsknappen, men hämtade aldrig filförteckningen. Den gamla `sjuk.js`-vyn hade redan **Visa intyg**, bildminiatyrer och PDF-länkar.

- Filerna ligger kvar i **privata** Storage-bucketen `sjuk-intyg`, med mönstret `<driver_id>/<report_id>/<slump-id>.jpg` eller `.pdf`. Metadata finns i `private.sick_certs`. Inga riktiga filnamn, sökvägar eller intyg behöver läsas för felsökningen.
- Livekontroll av enbart aggregerad metadata: två uppladdade intyg, två lagrade objekt och två matchande poster; bucketen är inte publik. Inga Storage-policies ger direkt klientåtkomst. `anon`/`authenticated` får inte anropa `sjuk_svc_cert_list` direkt.
- Båda ärendevyerna visar nu **Intyg 1 · Bild**, **Intyg 2 · PDF** osv. Inga intyg laddas ner automatiskt som miniatyrer.
- Samma befintliga Edge-funktion `sjuk`, action `list`, används. Databasen validerar aktuell session, funktionsflagga, demo samt rapportägarskap/rollen `agare` eller `superadmin` **före** signering. Vanlig admin och annan förare nekas. Den aktiva Edge-funktionens källkod jämfördes med repot och var identisk.
- En ny serverkontroll och nya **900 sekunders** signerade URL:er begärs vid varje öppning, så gamla länkar inte används. Ingen session eller signerad URL lagras av komponenten. Popupskydd har en klickbar reservlänk. Endast HTTPS från projektets privata signerade intygssökväg accepteras.
- Inga SQL-, Storage-, roll- eller Edge-ändringar behövdes. All befintlig serverkontroll behålls; bucketen är fortsatt privat.

### Testa intygsfixen

`node tests/meddelanden/intyg.cjs`: 56 kontroller med riktig produktions-HTML/JS, befintlig Edge-handler och befintliga SQL-behörighetsfunktioner i isolerad PGlite. Sessioner och metadata är syntetiska, Storage-signeringen är stubbat. Testar egen förare, ägare/superadmin, annan förare, vanlig admin, ogiltig session, funktionsflagga, demo, upprepade öppningar, popupskydd, återkallad behörighet och farlig URL. Tre mobilskärmbilder. Inget riktigt intyg, ingen riktig användarsession och ingen riktig signerad URL har öppnats.

Befintliga sviter: `node tests/meddelanden/db.cjs` och `node tests/meddelanden/browser.cjs`.
