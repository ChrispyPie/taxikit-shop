# PR #86 – godkänd för drift 2026-11-07

Checkbox före varje rad i Admin › Ärenden och Meddelanden. Upp till 100 valda rader. Nåla fast, Ta bort nål och Markera som oläst är personliga inställningar som tidigare.

## Radera enligt Christian 20:29
- **Användaren raderar:** tråden döljs bara för användaren. Ingen papperskorg. Admin ser fortfarande tråden. Ett nytt svar/meddelande från adminsidan tar bort användarens dold-flagga så hela den befintliga historiken visas igen, utan kopiering.
- **Admin eller ägare raderar:** tråden flyttas till åkeriets gemensamma Papperskorg. Vanlig admin får lägga där men inte öppna papperskorgen. Användaren kan läsa hela tråden, men den är låst: ”Tråden är stängd”.
- **Papperskorg:** bara ägare och tillfälligt superadmin. Återställ visar åter ärendet på adminsidan och låser upp det. Radera på riktigt döljer permanent på adminsidan; användaren behåller läsrätt, inte svarsrätt. Permanent radering kräver bekräftelse.
- **Fysisk radering:** vanliga v2-trådar raderas helt först när användaren har raderat OCH ägaren permanent raderat från Papperskorg. Båda ordningarna stöds via radlås. Meddelanden, bokningar och läsmarkeringar raderas då atomiskt.
- **RPC-spärr:** låsta användartrådar avvisar reply, book och decide på servern med `thread_closed` (42501), även om någon försöker kringgå UI. Permanent stängda trådar avvisar också nya adminmeddelanden.

## Äldre ärenden och sekretess – gränser
Äldre ärenden bevaras fysiskt tills deras beroenden granskats. Sidornas dold-/permanent-flaggor stöds. Låsstatus hämtas efter samma behörighetskontroll som öppning. Verkstadstid har dessutom ett servertrigger-skydd mot användarsvar medan tråden är låst; ett ägarsvar visar åter en användardold verkstadstråd. Övriga gamla bilärenden/privata samtal är redan läsarkiv.

Sjukanmälan och intyg kan fortfarande läsas av behörig person. UI döljer ändringsknappar i en låst sjuktråd, men separata medicinska rapporterings-/intygsflöden spärras inte globalt: detta kräver separat beslut. `private.mailbox_secret_hard_delete_enabled()` är **false**, och ingen hårdraderingskod finns för sjukuppgifter, intyg eller storage-filer. Att slå på flaggan ensam aktiverar inte sådan radering. Bilärende 21 lämnas orört.

## Tillfällig superadmin
`private.mailbox_trash_roles()` delegerar till `private.sjuk_boss_roles()`. Ägare och tillfälligt superadmin får testa Papperskorg inom sitt åkeri. Tas superadmin bort centralt där försvinner även papperskorgsrätten. Ingen hårdkodning av Christians ID och ingen utökning av sjuksekretessen.

## Migration och undo
Migration: `20261107191742_mailbox_bulk_preferences.sql`. Applicerad i produktion efter Christians kör 20:37 Stockholm (CET). Alla gamla källrader kontrolleras oförändrade med transaktionslokala fingeravtryck före/efter migreringen. Se GO-LIVE-dokumentet för verifierad drifttid.
Undo: `supabase/migrations/undo/20261107191742_mailbox_bulk_preferences.sql` återställer steg-1-funktionen, tar bort den nya verkstadstriggern och bevarar metadata.
UI undo: `git revert <step-2-commit>`.
Redan ömsesidigt hårdraderat innehåll kan inte återställas av undo SQL; backup krävs.

## Testa på iPhone före kör
1. Användaren raderar → bara användarens rad försvinner. Admin svarar → hela historiken visas igen.
2. Vanlig admin raderar → ärendet lämnar Ärenden, men vanlig admin ser ingen Papperskorg. Användaren kan läsa men inte svara/boka/besluta.
3. Ägare/tillfällig superadmin återställer → användaren kan svara igen.
4. Ägare raderar permanent → användaren kan fortfarande läsa, men inte svara. När användaren också raderar försvinner vanliga testtråden helt. Testa även omvänd ordning med påhittade trådar.
5. Prova flerval, nålar, oläst och långa rubriker på liten skärm. Använd aldrig riktiga sjukuppgifter för raderingstest.

Verifiering: syntetiska admin/förar-UI-tester och 159 isolerade PostgreSQL/PGlite-assertioner. Ingen riktig iPhone eller skärmbildsverifiering ännu.
