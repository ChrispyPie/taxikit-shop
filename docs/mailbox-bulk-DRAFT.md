# Steg 2 – utkast, INTE driftsatt

Checkbox före varje rad i Admin › Ärenden och Meddelanden. Upp till 100 valda rader per åtgärd.
Nåla fast, Ta bort nål, Markera som oläst och Radera. Radera är bara en privat dold-flagga – inga meddelanden, ärenden, sjukuppgifter eller intyg tas bort. Motparten påverkas inte. Återställ under Papperskorg. Fastnålade visas överst före grupperna. Dolda rader räknas inte i personliga aktivitetssiffran.

Migration: `20261107191742_mailbox_bulk_preferences.sql`. Ska INTE köras i produktion före godkännande.
Undo SQL: `supabase/migrations/undo/20261107191742_mailbox_bulk_preferences.sql` återställer steg-1-funktionen och bevarar metadata för återställning.
UI undo: `git revert <step-2-commit>`.

Testa på iPhone: välj flera rader, filtrera, nåla fast/ta bort nål, markera oläst, radera och återställ från Papperskorg. Logga in som motpart och kontrollera att raderna är kvar. Testa sekretess med rätt respektive fel roll. Inga skärmbilder från riktiga personuppgifter används.
