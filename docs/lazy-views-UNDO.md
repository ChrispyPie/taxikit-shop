# Ladda verktyg vid behov – UTKAST, inte live

Bas: `36477ce9`. Säkerhetskopia (pushad): `backup/pre-lazy-views-20261107`.
Arbetsgren: `feat/lazy-views-20261107`. Inga produktionsändringar eller migreringar har körts.

## Vad ändras?

- Huvudmenyn laddar bara skal, verifierad session/roll, meny och små badge-svar. Den neutrala laddningsbilden och behörighetsförsöket från tidigare rättning finns kvar.
- `lazy-views.js` har en fast lista över tillåtna moduler. Samtidiga öppningar delar import; ett nätfel kan provas igen. En sen import tar inte över ett nyare menyval. Skalets badge-pollning har en enda 60-sekunderstimer och körs bara när sidan är synlig och inloggad.
- Kördata hämtas först när Kördata öppnas. Lönekoll har en liten separat dataadapter, inte Kördatas renderare. Delade ankomstfunktioner är separerade från Ankomsters vy så att Mina bevakningar och Prognos inte behöver ladda den vyn.
- Profilens språklista, fotoverktyg och kontakthjälp laddas först när profilen öppnas. Notispanelen och hjälpboten laddas vid öppning (hjälpboten via Inställningar), inte i bakgrunden från start.
- Admin och S admin är fortfarande egna HTML-sidor: deras kod hämtas först vid navigering dit. Deras interna underverktyg delas inte upp ytterligare i detta utkast. Admins tidigare sparade sökväg och nya ärendefilter/trådmetadata behålls.
- `#view=...` och `taxi_view_state:<förar-id>:...` minns navigation. Kördata: datum/egen period; Lönekoll: månad; Kalender: datum; Topplistor: datum/egen period; Forum: sektion/tråd; Mina bevakningar: dag; Meddelanden/Ärenden: filter/öppen tråd. Befintliga flik/filter-inställningar fortsätter användas. Ändrade formulär och skrivna meddelanden sparas **inte**. Trådar läses alltid på nytt via serverns vanliga behörighetskontroll.
- Ingen ändring av rättigheter, sekretess, läkarintyg, raderingsregler eller bilärende 21. Ingen kundinformation finns i testresultaten.

## Ny badge-RPC – endast för granskning

`supabase/migrations/20261107204952_shell_badge_counts.sql` skapar en **SECURITY INVOKER**-funktion med tom `search_path`. Den återanvänder de redan behörighetskontrollerade funktionerna och returnerar bara antal + läst Nyheter-id, aldrig trådinnehåll eller personuppgifter. Inga tabeller eller befintliga rader ändras.

**Inte applicerad i produktion.** Den behöver granskas och testas i staging före eventuell merge. Frontend får inte publiceras utan endpointen (saknad endpoint ger inga skalbadges, inte en inloggningsspärr).

Detta minskar nätanrop och klientpayload, men löser inte underliggande historikskanningar i DB. Funktionen använder samma listgränser som nuvarande mailbox (äldre meddelandetrådar: senaste 50; case-listans avslutade del: 5000). Att mäta verklig DB-tid, särskilt för ägare med många ärenden, är ett krav före merge. Ingen påstådd DB-hastighetsvinst.

## Mätning

Se `tests/lazy-views/measurements.json` och `tests/lazy-views/measure.cjs`.
Baslinje `36477ce9`, kall huvudmeny som vanlig förare, syntetiska svar:

| Mätning | Före | Efter |
|---|---:|---:|
| Lokala JS-filer i första sidladdningen | 32 | 9 |
| Avkodad JS | 928 458 byte | 36 999 byte |
| JS gzip, summerat per fil | 297 679 byte | 15 062 byte |
| Initiala RPC-anrop i offline DOM-test | 13 | 3 |

JS minskar cirka **96 %** avkodat / **95 %** gzip. Tre anrop: `get_me`, `get_my_features` och `shell_badge_counts` (de senare två blockerar inte menyn).

Överföringsmodell vid 1,6 Mbit/s: cirka 1,488 → 0,075 sekunder **enbart för gzip-JS**, utan latens, CPU, HTML/CSS, anslutningar eller DB. Det är **inte** en uppmätt Slow-4G-sidladdning eller en Android-tid.

Godkänd browser/desktop-exekvering saknades i denna körning. Därför finns inga Chromium-waterfalls, verkliga Slow-4G-tider eller mobilskärmbilder. Ett äldre browser-test kunde inte starta; det återkördes inte via en alternativ browserväg. DOM-tester är inte visuella tester. PR ska förbli draft tills de delarna och telefonkontrollen är gjorda.

## Tester

```sh
npm ci --prefix tests/lazy-views
npm test --prefix tests/lazy-views
node tests/lazy-views/measure.cjs
node tests/boot/admin.cjs
node tests/admin-arenden/unread.cjs
node tests/admin-arenden/ui.cjs
# Installera befintligt PGlite-testberoende enligt tests/meddelanden vid behov:
NODE_PATH=/workspace/taxikit-shop/tests/meddelanden/node_modules node tests/lazy-views/badges.cjs
node tests/bevakningar/logic.cjs
```

Offline DOM: samtliga 13 huvudvyer öppnas första gången och efter omladdning; inga JS-fel i syntetiska svar. Importdeduplicering, fel/omförsök, URL-återställning, per-användar-isolering, ärendefilter och egen period testas. Separat löneadapter jämförs med Kördatas faktiska matchning över natt, resor utan pass och dubbletter. Isolerad PostgreSQL: 172 assertions inklusive befintliga bulk/RLS/sekretess-/undo-tester och nya skalbadges med läst/oläst/dolt/återvisat. Tidigare admin-session/omförsök och oläst-regressioner passerar.

## Testa på Christians telefon före merge

1. Kall omladdning med långsam uppkoppling: neutral laddning, ingen inloggningsblinkning, ingen falsk nekad Admin.
2. Öppna varje menyval + profilen/Meddelanden/notispanelen, sedan hem och öppna igen. Testa även Admin och S admin som rätt roll.
3. Ändra datum/egen period, filter och underflik, öppna en tråd, uppdatera sidan. Kontrollera att samma läge kommer tillbaka och att data är färsk.
4. Läs en tråd i Meddelanden och Admin › Ärenden: aktuell användares prick ska försvinna. Markera oläst och läs igen. Kontrollera också profil-/menybadges.
5. Notiser/länkar till Prognos, Forum, Ankomster, Kalender och ärenden ska öppna rätt innehåll. Prova misslyckad modulhämtning offline → Försök igen online.
6. Kontrollera lönesiffror och kördata mot samma period som före ändringen. Kontrollera eventuell vald annan förare och äldre arkivår separat.

Nyheter-raden är förberedd med `tid: ''`. Fyll i först vid framtida go-live.

## Ångra

Nu: inget live att återställa; låt PR vara draft. Behåll säkerhetskopian.
Om ändringen senare publiceras: `git pull --rebase`, `git revert <merge-eller-squash-commit-för-denna-PR>`, pusha normalt och invänta Pages. Kontrollera att föregående HTML/JS är live. Ingen force push eller reset.
Därefter kan endpointen tas bort med `supabase/migrations/undo/20261107204952_shell_badge_counts_undo.sql`. Frontend först, SQL sedan. Undo rör inga användarrader. Navigationsnycklarna kan ligga kvar; tidigare frontend använder dem inte.
