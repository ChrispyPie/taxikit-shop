# Ångra / driftsättning / tillfällig sekretessåtkomst

Den tidigare versionens återställningsnotering är bevarad i [UNDO-20261106.md](UNDO-20261106.md).

## Status

Utkast i PR. **Inget i denna ändring är applicerat i produktionsdatabasen eller mergat.**
Backupbranch: `backup/pre-inkorg-20261107` vid `96bd944977d23341ade4b41d31571089cfb82c4e`.
Extra backup före v2: `backup/pre-inkorg-v2-20261107` vid `e7391c128530fb6fa62563998f5c7cbbe5c773bd`.
Ingen force-push behövs. Inga rader, filer i lagring eller historiska meddelanden raderas av migreringen.
Bilärende 21 har inte lästs eller ändrats.

## Före ett eventuellt kör

1. Christian godkänner den större ändringen och granskar särskilt adminbehörigheterna.
2. Ta ny backup av funktionsdefinitionerna om de ändrats sedan detta utkast skapades.
   Undo-filen återställer de definitioner som lästes vid bygget, inte eventuella senare ändringar.
3. Applicera först `supabase/migrations/20261107074022_inkorg_steg1.sql`, sedan `supabase/migrations/20261107135140_inkorg_v2_bookings_contacts.sql`, var och en i en transaktion efter befintliga migreringar.
   Detta är inte en instruktion att köra `supabase db push` på hela den historiska mappen.
   V2 seedar bara bolagskopplingar för de åkerier som finns vid tillfället; verifiera att de hör till Taxi Göteborg.
4. Kontrollera med riktiga testroller: egna/andras ärenden, admin, ägare och superadmin, särskilt nekad sekretess.
   Kontrollera även intyg via Edge, utan att visa intyg eller personuppgifter i loggar.
5. Sätt verklig svensk go-live-tid i Nyheter `2026-11-07g` (byt datum/id om dagen ändrats), och merge först därefter.
   JS-cachebustarna i index/admin är redan uppdaterade. Om något ändras igen: bumpa dem igen.

## Ångra efter en driftsättning

- **App:** skapa en vanlig revert-commit av PR:ens ändringar. Återställ inte hela main till backupen,
  eftersom andra ändringar och GOT-cache kan ha tillkommit. Ingen `reset --hard` eller force-push.
- **Databas:** kör först `supabase/migrations/undo/20261107135140_inkorg_v2_bookings_contacts_undo.sql`, sedan (om hela PR återställs) `supabase/migrations/undo/20261107074022_inkorg_steg1_undo.sql`, var och en som en transaktion.
  V2-undo stänger nya RPC:er och återger de tidigare klientgrants som lästes före bygget. **Alla nya trådar, bokningar, kontaktval och bolagskopplingar lämnas kvar**, med RLS och utan direkta klientgrants.
  Undo tar inte bort nya tabeller eller kopierar meddelanden till den gamla modellen; ny v2-data går därför inte att se i det återställda äldre UI:t men finns kvar för senare återaktivering.

  Den återställer tidigare funktionsdefinitioner/rollgränser och lämnar alla data kvar.
  Den lilla privata hjälpfunktionen `sjuk_boss_roles()` får ligga kvar, oexponerad och utan klientgrants.
- Undo återställer även de äldre sjuk-funktionernas tidigare åkeriavgränsning. Om den nya säkerhetshärdningen
  ska behållas trots återställning av UI: granska och behåll åkerikontrollerna i `sjuk_report_for`, `sjuk_get`
  och `sjuk_push_bosses`, i stället för att köra hela undo-filen blint.

## Ta bort superadmins TILLFÄLLIGA sekretessåtkomst efter testning

Behåll superadmin nu. När Christian säger att testningen är klar: ändra **en central funktion**:

```sql
begin;
create or replace function private.sjuk_boss_roles()
returns text[] language sql immutable set search_path = ''
as $$ select array['agare']::text[] $$;
revoke all on function private.sjuk_boss_roles() from public, anon, authenticated;
commit;
```

Detta är dokumentation, inte en redan körd ändring. Med superadmin avstängd:

- `sjuk_actor` ger inte längre superadmin sjuk-adminrättigheter.
- Ärendelistan och `case_seen` släpper inte igenom andras sjukanmälningar till superadmin.
- Intygens list-/uppladdningsfunktioner använder samma actor och nekar därför också andras intyg.
- Den gamla sjukfliken (`sjuk_get`) visar bara superadmins egna eventuella sjukperioder.
- Nya sjuk-pushar läggs inte längre i kön till superadmin.
- Vanliga adminärenden, bilärenden och privata meddelanden påverkas inte.
- En superadmin som själv är sjuk har, som varje förare, fortfarande rätt att läsa sin egen anmälan och sina egna intyg.

**Ändra inte `workshop_roles()` eller `bil_admin_roles()` för detta.** De styr andra, icke-sekretessflöden.

Testa därefter med syntetiska roller att superadmin nekas en annan förares sjukperiod och intyg,
att ägaren fortfarande tillåts och att vanlig admin fortfarande nekas. Detta provas redan i databasens testsuite.
Redan öppna sidor, levererade pushnotiser och redan signerade intygslänkar kan inte tas tillbaka av en rolländring;
länkarna löper ut efter högst 15 minuter. Granska eventuella redan köade pushar separat med användarens godkännande,
eller vänta tills den befintliga kön är tom innan behörigheten stängs av.

För att återaktivera tillfälligt vid fortsatt testning, efter godkännande, ändra funktionen tillbaka till
`array['agare','superadmin']::text[]`. Ingen tabell eller persondata behöver ändras.

## Bolag och telefonsekretess

`inbox_private.contacts` innehåller bara förar-ID, bilnummer och synlighetsval, **inte en kopia av privat telefon**.
Befintliga `public.drivers.phone` används. Standard `owner`, därefter `company` eller `bolag`. Synlighetsval och befintlig kontaktsparning görs atomiskt via `mailbox_v2('profile_save')`.

`inbox_private.bolag` lagrar stabil slug och namn; `operator_companies` kopplar åkeriets befintliga company_id till bolaget.
Migrationen kopplar alla nuvarande åkerier till `taxi-goteborg`. **Framtida åkerier måste mappas explicit** av administratör med databasbehörighet, efter kontroll.
En saknad koppling ger ingen delning över åkerigränsen. Ett annat bolag ges egen slug/rad; koppla aldrig automatiskt alla framtida åkerier till Taxi Göteborg.
UI-valets etikett hämtas från det aktuella bolagsnamnet. `bolag` betyder aldrig alla inloggade i TaxiData.

Undo lämnar dessa inställningar kvar men gör dem oåtkomliga via den nya klient-RPC:n. Äldre UI har inget nytt kontaktvisningskort, så privat telefon exponeras inte därigenom vid återställning.
Om systemets åkeri–bolag-tillhörighet ändras senare påverkar det vilka som får se redan delade `bolag`-telefoner; granska tillhörigheten före en sådan ändring.

## Säker driftsättningskontroll

Testa efter kör med riktiga testkonton utan att skriva personuppgifter i loggar: båda bokningsriktningarna, radlåst dubbelbeslut, svensk tidszon, grå/solid bevakning,
ägarens adminlänk, nekat annat åkeri, ingen privat förare-till-förare-sändning även från gammal cache och telefonval över åkeri-/bolagsgräns.
Verifiera att `inbox_private` inte är exponerat i Data API och att klientroller saknar tabell-/sekvensgrants. Kör Supabase advisors på staging efter applicering.
Gamla klienter kan inte skapa/svara på privata direktmeddelanden efter grantändringen; cache-bustar kräver omladdning.
Ingen tjänst, Edge-funktion, kö eller notifieringsdata raderas eller deployas av detta utkast.
