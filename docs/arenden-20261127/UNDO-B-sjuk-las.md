# B – Sjuk och intyg låses med tråden (2026-11-27)

**Beslut (Christian 27 nov):** när admin/ägare raderar en tråd (Papperskorg) ska sjuk/intyg i tråden också låsas för föraren. Hård radering av sjukuppgifter förblir avstängd.

**Ändring**
- SQL `supabase/migrations/20261127b_sjuk_lock.sql` (applicerad i produktion 27 nov, före UI): ny hjälpfunktion `private.sjuk_locked(report)` (läser `inbox_private.party_deletions`, `owner_hidden` eller `owner_permanent`).
  Förare nekas med `thread_closed` (42501) i `sjuk_recover`, `sjuk_svc_cert_begin`, `sjuk_svc_cert_finish` (slutföra uppladdning), `sjuk_svc_cert_delete` och `sjuk_svc_delete`. Ägare/superadmin/admin med sjukbehörighet (boss) berörs inte.
  `sjuk_json` skickar nu `locked`. En låst, öppen period hindrar inte längre en ny sjukanmälan (`sjuk_report`), annars hade föraren fastnat.
  `private.mailbox_secret_hard_delete_enabled()` är oförändrad (false).
- UI `TaxiData/sjuk.js`: i en låst tråd döljs Friskanmäl, Läkarintyg-uppladdning, Ta bort och ×-knappen på intyg för föraren. En notis "Tråden är stängd" visas. Låsta perioder hamnar under Tidigare sjukperioder.
- Test: `tests/arenden-20261127/sjuk-lock-rollback.sql` (16 kontroller mot riktiga produktionsfunktioner med syntetiska förare/ägare/admin, allt rullas tillbaka) och `node tests/arenden-20261127/sjuk-ui.cjs`.

**Backup:** `backup/main-before-sjuk-las-20261127`. **Cache:** `20261127sjuklas1`. Nyhet `2026-11-27sjuklas1` (bara admin).

## Ångra
1. SQL: kör `supabase/migrations/undo/20261127b_sjuk_lock.sql` i produktion (återställer de sju funktionerna exakt som före, tar bort `sjuk_locked`). Inga rader ändras.
2. UI: `git revert -m 1 <merge-commit>`, höj cache, PR + merge. Ingen force-push.
Ordning spelar ingen roll: gammalt UI fungerar mot ny SQL (extrafältet `locked` ignoreras), ny UI fungerar mot gammal SQL (inget `locked` = inget lås i UI).
