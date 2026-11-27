# Bil nr-listan tom i Meddelande (2026-11-27bilnr2)
**Orsak:** `public.cars.company_id` är NULL för alla 7 riktiga bilar. Resten av appen läser `coalesce(company_id,'default')`, men mailbox `dispatch` (action `cars`) och `inbox_private.resolve_car` jämförde `company_id = bolag` rakt av → tom lista (bara Välj/Nej) och valet av bil hade också nekats. Gällde alla förare (även Meddelande utan Bokad tid sedan PR #257; testerna använde syntetiskt bolag med bilar).
**Fix:** migration `20261127g_cars_company_null.sql` (ersätter jämförelsen med `coalesce(c.company_id,'default')` i de två funktionerna). Ingen UI-ändring. Det finns bara EN bilväljare i formuläret (Bil nr längst ner); bokad-tid-rutan har ingen egen.
**Ångra:** `supabase/migrations/undo/20261127g_cars_company_null.sql` (återställer jämförelsen; då blir listan tom igen).
**Verifierat:** `tests/arenden-20261127/bilnr-cars-rollback.sql` – syntetisk förare i bolag `default`: `cars` ger 7 bilar och `create` med vald bil lyckas (allt rullas tillbaka).
**Backup:** `backup/main-before-bilnr2-20261127`. Cache `20261127bilnr2`.
