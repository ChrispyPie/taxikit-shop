# Steg 2 – utkast, INTE driftsatt

Checkbox före varje rad i Admin › Ärenden och Meddelanden. Upp till 100 valda rader per åtgärd.
Nåla fast, Ta bort nål, Markera som oläst och Radera.

## Radera enligt Christian 20:20
- Förare: bara en privat dold-flagga. Ingen papperskorg/återställning i förarvyn.
- Vanlig admin: privat dold-flagga, ingen papperskorg. Räknas inte som ägarens permanenta radering.
- Ägare: Radera lägger ärendet i åkeriets Papperskorg under Admin › Ärenden. Där finns Återställ och Radera på riktigt.
- Radera på riktigt tar bort det från ägarsidan, men föraren behåller sin kopia tills föraren också raderar.
- När båda parter raderat en vanlig v2-meddelandetråd raderas trådens meddelanden, bokningar och läsmarkeringar atomiskt. Båda ordningarna stöds via radlås.
- Äldre ärendetyper bevaras fysiskt tills deras beroenden granskats; båda sidors dold-flaggor gäller fortfarande. Inga bilärenden hårdraderas av detta utkast.
- `private.mailbox_secret_hard_delete_enabled()` är uttryckligen **false**. Ingen hårdraderingskod finns för sjukuppgifter, intyg eller storage-filer. Att slå på flaggan ensamt aktiverar inte sådan radering; kräver separat granskad implementation.

## Tillfällig superadmin
`private.mailbox_trash_roles()` delegerar till `private.sjuk_boss_roles()`. Nu får ägare och tillfälligt superadmin testa papperskorgen i sitt åkeri. När superadmin tas bort centralt från sjuk_boss_roles försvinner även papperskorgsrätten. Ingen hårdkodning av Christians ID och ingen utökning av sjuksekretessen.

Migration: `20261107191742_mailbox_bulk_preferences.sql`. Ska INTE köras i produktion före godkännande.
Undo SQL: `supabase/migrations/undo/20261107191742_mailbox_bulk_preferences.sql` återställer steg-1-funktionen och bevarar metadata. Redan ömsesidigt hårdraderat innehåll kan inte återställas av undo; kräver backup. Detta är ett viktigt beslut före kör.
UI undo: `git revert <step-2-commit>`.

Testa på iPhone: välj flera rader, filtrera, nåla fast/ta bort nål, markera oläst. Förare och vanlig admin ska inte se papperskorg. Ägare och tillfällig superadmin testar återställning och permanent radering. Motparten ska behålla innehållet fram till sin radering. Testa båda raderingsordningarna med påhittade trådar, aldrig riktiga sjukuppgifter.
