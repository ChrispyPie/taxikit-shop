# D – Avbokning och ombokning av Bokad tid (2026-11-27)

**Beslut (Christian 27 nov, punkt 5 = Ja):** förare och admin ska kunna avboka och boka om Bokad tid, även redan godkänd tid. Orsak till avbokning skrivs i vanliga meddelanderutan med samma röda varning som Avböj. Ny tid går tillbaka till att väntas godkännas.

**Ändring**
- SQL `supabase/migrations/20261127d_omboka.sql` (applicerad i produktion 27 nov): `bookings_status_check` utökad med `cancelled` och `rebooked`. `inbox_private.dispatch` (via `public.mailbox_v2`) fick åtgärderna
  - `cancel` (`booking_id`, `reason` obligatorisk, `need_reason` annars): väntande eller godkänd tid i framtiden. Status `cancelled`, systemrad "Bokad tid avbokad av föraren/admin: …" plus orsaken som vanligt meddelande från den som avbokar.
  - `rebook` (`booking_id`, `date`, `time`, `body` valfri): gamla tiden blir `rebooked`, ny bokning (samma typ/rubrik/bil) skapas som `pending_admin` (föraren föreslår) eller `pending_driver` (admin föreslår). Samma datumregler som vid ny bokad tid. Går även från avböjd tid.
  - Låst tråd (admin/ägare raderat) nekar föraren (`thread_closed`) på båda. Hemlig radering är fortsatt avstängd.
  - Tidslinjen (Mina bevakningar) döljer `cancelled`/`rebooked`. Orsaksmeddelandet vid avbokning räknas som svar (`decision_reply`), så motparten får oläst-prick men tråden hamnar inte som obesvarad fråga.
- UI `TaxiData/mailbox-ui.js`: knapparna Föreslå ny tid och Avboka på varje väntande/godkänd framtida tid (förare och admin, även i felanmälningsvyn), ombokningsformulär (datum, tid, valfritt meddelande), statusarna Avbokad/Ombokad, avbokade/ombokade tider räknas som avslutade i grupperingen.
- Tester: `tests/arenden-20261127/omboka-rollback.sql` (22 kontroller mot produktion, syntetiskt, rullas tillbaka), `node tests/arenden-20261127/omboka-ui.cjs`.

**Backup:** `backup/main-before-omboka-20261127`. **Cache:** `20261127omboka1`. Nyhet `2026-11-27omboka1`.

## Ångra
1. UI: `git revert -m 1 <merge-commit>`, höj cache, PR + merge. Ingen force-push. (Gammal UI visar okända statusar som tomma, men servern döljer dem i tidslinjen.)
2. SQL: kör `supabase/migrations/undo/20261127d_omboka.sql`. Den återställer `dispatch` exakt som före och constrainten. Rader som blivit `cancelled`/`rebooked` blir `declined` (meddelanden rörs inte). Kör SQL-ångra efter UI-revert eller samtidigt.
