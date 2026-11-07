# Admin › Ärenden / Meddelanden, steg 1

Backup: `backup/pre-admin-arenden-filter-20261107`.
UI: återställ steg-1-committen med `git revert <step-1-commit>` och `git push origin HEAD:main`.
Databas: kör `supabase/migrations/undo/20261107191553_admin_arenden_filters_unread.sql`.
Undo återställer föregående dispatch men bevarar tabellen med personliga oläst-flaggor. Inget innehåll tas bort.

## Gruppering (nyast först i varje grupp)
- Äldre ärenden: `st=klar` → Avslutade (även om needs). Annars `st=ny`, `st=vantar` eller `needs=true` → Ohanterade / väntar på svar. Övriga (`pagar`) → Pågående.
- Nya trådar: någon bokning `pending_driver`/`pending_admin` eller senaste meddelandet från andra sidan → första gruppen.
- En avböjningsmotivering som hör till senaste bokningsbeslut räknas inte som en obesvarad ny fråga.
- Endast avböjda bokningar och inget obesvarat meddelande → Avslutade. Accepterad bokning (`accepted`) eller vanlig besvarad tråd → Pågående.
- En tråd kan ha flera bokningar: väntande/obesvarat prioriteras, därefter accepterat, sist enbart avböjt.
- Äldre privata samtal är läsarkiv. Alla gamla typer utom sjuk/wh filtreras som Meddelanden.

Markera som oläst sparar bara en flagga för inloggad förare, efter samma behörighetskontroll som öppning. Den återställs när just den användaren öppnar tråden igen. Ingen bakgrundsöppning av trådar för listningen.
Sekretess, tillfällig superadmin-behörighet och intyg lämnas orörda. Ingen åtgärd på bilärende 21.

Verifiering: `node tests/admin-arenden/ui.cjs`; produktionens riktiga RPC:er testas med `tests/admin-arenden/production-rollback.sql` (syntetiska roller, allt rollback).
