# Inkorg – steg 1 (utkast, inte live)

Tidigare version: [historisk beskrivning 6 november](README-20261106.md) och [dess undo](UNDO-20261106.md).

Byggt i `feature/inkorg-steg1`, separat worktree. **Ingen merge eller produktionsändring.**
Steg 2 (admin skapar ett ärende åt en vald förare, acceptera/avböja, grå/solid schemapost) ingår inte.

## Gränssnitt

- Ett menyval **Inkorg**, i stället för två separata menyval.
- **Alla** blandar privata samtal och egna ärenden i senaste-aktivitet-ordning, både öppna och avslutade.
- Filter: Meddelanden, Felanmälan, Förbrukning, Underhåll, Sjukanmälan, Önskemål, Verkstadstid och Uppgifter.
  Kategorin kommer från servern; den gissas inte från rubriken.
- Fler meddelanden och avslutade ärenden hämtas vid behov, utan att några poster raderas.
- **Nytt ärende** öppnar en mobil dialog och sedan befintligt formulär/sparflöde.
  Underhåll återanvänder förslagsformuläret för förare och planeringsformuläret för admin.
- Privat meddelande startas från personens profil (befintlig mottagarförvald knapp). Svar skrivs direkt i tråden.
- Ägare och superadmin har bara privata samtal i sin inkorg; deras ärenden går via **Admin › Ärenden**.
  Vanlig admin har kvar sina egna ärenden i sin personliga inkorg och hanterar åkeriets vanliga ärenden i adminpanelen.
- Adminlistan inkluderar även Underhåll under Alla, inte bara i en separat speciallista.
- Befintlig swipe-back används. En ärendetråd har `‹ Ärenden`, inga kategoriikoner i rubriken,
  neutral adminverktygsstil och befintlig tidsstämplad historik. Meddelanden visar också klockslag.

## Behörigheter och databas

Migration: `supabase/migrations/20261107074022_inkorg_steg1.sql`.
Filnamnet skapades med Supabase CLI och kolliderar inte med `20261107a/b/c`.
Migrationen är **inte applicerad**. Ändringarna är funktionsdefinitioner och en ny privat rollhjälpare;
nya tabellkolumner, tabellbehörigheter, datakopior och radändringar behövs inte.

Viktig upptäckt vid läsning av produktionsdefinitionerna: vanlig `admin` ingick inte i
`private.bil_admin_roles()`, och Admin › Ärenden var även dolt i HTML. Det räckte alltså inte att flytta menyknappar.
Migrationen lägger till admin i **icke-sekretess**-bil/ärendeadministrationen. Det ger även rätt att använda
befintliga bil- och underhållsverktyg. Åkeridata, Löner och superadminmenyn öppnas inte.
`private.workshop_roles()` lämnas oförändrad: den används också av lönefunktioner.
Verkstadstidens beslut/frågor får en separat adminbehörighet och explicit åkerikontroll.

Sekretess ligger kvar bakom serverkontroller:

- `private.sjuk_actor` och den nya centrala `private.sjuk_boss_roles()` avgör vilka som får vara sjuk-admin.
  Just nu: ägare och **tillfälligt superadmin**. Vanlig admin kan bara läsa sin egen sjukperiod som förare.
- `case_admin_list` skickar inte sjukanmälningar till vanlig admin, inte ens som tomma sammanfattningar.
- `case_get` och intygs-Edge-funktionen går genom `sjuk_actor` / `sjuk_report_for`.
- Individuella sjukperioder/intyg, sjuklistan och nya sjuk-pushar begränsas till rätt åkeri.
  Vid granskningen saknade de äldre sjuk-hjälparna en konsekvent åkerigräns; utkastet täpper till det.
- Enbart service-rollen kan anropa intygens interna list-/uppladdnings-RPC:er.
  Edge-funktionen kontrollerar ändå förarens session innan den signerar länkar.
- Läsbehörigheter kontrollerades endast via systemkatalogen: `sick_reports`, `sick_certs` och `sick_events`
  ligger i privat schema utan SELECT för anon/authenticated. Bilärenden, underhåll, verkstadstid och case_reads
  har RLS och inga direkta SELECT-grants till dessa roller. Inga intyg, personliga texter eller riktiga sessioner hämtades.

**Avstängning av superadmins tillfälliga sekretessåtkomst:** se [UNDO.md](UNDO.md).

## Avgränsningar / beslut kvar

- Önskemål är fortfarande den befintliga typen **Önskemål till Christian** (skapande för admin/ägare/superadmin).
  Knappen återanvänder befintligt formulär på `admin.html#onskemal`.
  Att ge alla förare en ny sorts önskemål till åkeriet kräver ett separat beslut och ändrat mottagar-/svarsflöde.
- Uppgifter som redan finns visas i inkorgen. Ny uppgift åt en förare från admin är inte en ny funktion i denna PR.
- Sjukintyg, uppgiftssvar och underhåll använder sina befintliga specialflöden, inte en ny generell texttråd.
  Historik som inte tidigare lagrades (t.ex. varje äldre underhållsredigering) går inte att återskapa här.
- Ändra-knappen för någon annans verkstadstid använder fortfarande det äldre personliga verkstadstidsformuläret;
  fråge-/beslutsverktygen fungerar med den nya adminrollen, men själva redigeringsflödet är inte ombyggt i steg 1.
- Ingen produktionsinloggning eller verklig meddelandesändning användes i testerna.

## Tester och bilder

Alla testpersoner, fordon, texter och sessioner är syntetiska.

```sh
# Installera lokala testberoenden om de inte finns:
npm install --prefix /tmp/inkorg-test --no-save @electric-sql/pglite@0.5.15
NODE_PATH=/tmp/inkorg-test/node_modules node tests/inkorg/db.cjs
NODE_PATH=/tmp/inkorg-test/node_modules node tests/meddelanden/db.cjs
# Pythonmiljö med playwright och separat installerad Chromium/Chrome:
python tests/inkorg/browser.py
```

På byggboxen användes befintlig PGlite och `/workspace/pwenv/bin/python`, med `/usr/bin/google-chrome`.
Webbtestet startar en **egen headless-profil**, endast mot lokala produktionsfiler och mockade RPC:er.
Det använder inte desktopwebbläsarens profil eller inloggningar och blockerar externa nätanrop.

Resultat:

- 68 databasassertioner: migrering, kategorier, egen/annan förare, åkerigräns,
  admin/ägare/superadmin, intyg, avstängningsflagga och undo.
- 84 befintliga databasassertioner för privata meddelanden, svarstrådar och lönebehörighet.
- 46 Playwright-assertioner: blandad kronologi, filter, återanvända formulär, profilknapp,
  svar i tråd, sena svar efter navigering, ägarinkorg och adminmeny; ingen horisontell överrinning vid 320/390 px.
- JS syntaxkontroll och `git diff --check`.

19 skärmbilder i `/workspace/taxidata-cleanup/screenshots/inkorg/` (inte incheckade):
`01-profilmeny.png`, `02-alla.png`, `03-forbrukning.png`, `04-underhall.png`, `05-nytt-arende.png`,
`06-form-felanmalan.png`, `07-form-forbrukning.png`, `08-form-underhall.png`, `09-form-verkstadstid.png`,
`10-form-sjukanmalan.png`, `11-profil-meddelande.png`, `12-meddelandetrad.png`, `13-arendetrad.png`,
`14-agare-inkorg.png`, `15-onskemal-befintligt-formular.png`, `16-admin-arenden.png`,
`17-admin-verkstadstid.png`, `18-admin-meny.png`, `19-320px.png`.
