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

**Applicerad i Supabase 6 november 2026 under PR-arbetet.** Den är rent additiv: nya tabeller/index, nytt privat schema, en ny nullable conversation_id-kolumn och nya RPC:er. Inga befintliga funktioner, roller, data eller sidbeteenden ersätts. Frontend går inte live förrän Christian säger kör.

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
Vid framtida merge: skapa först `backup/pre-meddelanden-merge-20261106` från dåvarande origin/main. Ingen merge är gjord i denna PR.
