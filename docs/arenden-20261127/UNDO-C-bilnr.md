# C – Bil nr i Meddelande/Bokad tid (2026-11-27)

**Beslut (Christian 27 nov):** Nej ska vara förvalt. Man ska kunna välja åkeriets bilar. Väljer man en bil man inte kört den senaste veckan får man en fråga om det är rätt bil.

**Ändring**
- UI `TaxiData/mailbox-ui.js`: `car_choice` förvalt till `none` (Nej) i nytt Meddelande och ny Bokad tid. Bokad tid från en felanmälan behåller felanmälans bil. När en förare väljer en bil som inte finns i de senaste 7 dagarnas körpass visas "Du har inte kört bil X senaste veckan. Är det rätt bil?" med Ja / Byt bil. Skicka blockeras tills man svarat. Admin får aldrig frågan. Om körhistoriken inte går att läsa visas ingen fråga.
- SQL `supabase/migrations/20261127c_recent_cars.sql` (applicerad i produktion 27 nov): `public.my_recent_cars(p_token, p_days default 7)` ger inloggad förares egna bilnummer (`private.shift_fact.taxi`, dag ≥ idag−7, svensk tid). Bara läsning.
- Tester: `node tests/arenden-20261127/bil-nr.cjs`, `tests/arenden-20261127/recent-cars-rollback.sql` (syntetiskt, rullas tillbaka). `tests/inkorg-v2/browser.py` uppdaterad för förvalt Nej (rad 70, 77).
- Obs: ett pågående pass finns i körpassdata först när det är avslutat, så mitt i ett pass kan frågan komma för bilen man kör just nu. Ja löser det.

**Backup:** `backup/main-before-bilnr-20261127`. **Cache:** `20261127bil1`. Nyhet `2026-11-27bil1`.

## Ångra
1. UI: `git revert -m 1 <merge-commit>`, höj cache, PR + merge. Ingen force-push.
2. SQL (valfritt, inget beror på funktionen efter revert): kör `supabase/migrations/undo/20261127c_recent_cars.sql` (`drop function public.my_recent_cars`).
