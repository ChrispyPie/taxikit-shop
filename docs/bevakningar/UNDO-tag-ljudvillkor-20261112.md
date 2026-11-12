# Ljud- och notisvillkor för tåg (20261112ljud1) – driftsättning och ångra

Gren `feat/tag-ljudvillkor`, worktree `/workspace/taxikit-shop-tagljud`, byggd från
`origin/main` `bc5c9f71`. Säkerhetsgren: `backup/pre-tag-ljudvillkor-20261112` (= `bc5c9f71`).
Nyheter: id `2026-11-12ljud1` (utan `tid`). Cache-tagg: `?v=20261112ljud1`.

## Vad som ändras

- Ankomster, tåg: bara rutan *Ljud för tåg* och länken *Specificera villkor i Mina bevakningar*.
- Mina bevakningar: kortet *Ljud och notiser för tåg* (standard) och 🔔 per avgång
  (bara den här avgången `t<nr>|<planerad UTC>` eller varje gång för fast bevakning `rw<id>`).
- Regler (samma i edge-funktionen och i appen, `villkor.ts` = `TaxiData/tag-villkor.js`):
  standard `lead_min 30`, `small_min 15`, `big_min 30`, `jump_min 15`, ljud på.
  Under liten försening: ingen notis, inget ljud. Stor försening, plötsligt hopp, inställt,
  ankommit: alltid notis (ljud om ljud är på). Inom X min före beräknad ankomst: notis.
  Små ändringar däremellan: bara i appen (state uppdateras tyst).
- Push: servern skickar `silent: true|false, v: 1`. `sw.js` visar tyst notis (ingen vibration)
  när `silent`. Appens ljud (`bevakning-ljud.js`) spelar bara om `silent` inte är satt.
- Saknas inställningar (eller migrationen) används standardvärdena ovan.

## Driftsättning (görs av föräldern, inte i PR:en)

1. Merga PR:en (GitHub Pages tar klientdelen; fallback i appen och SW gör att små
   "ny tid"-förseningar blir tysta redan innan edge-funktionen är uppdaterad).
2. Valfri men rekommenderad SQL: `supabase/migrations/20261112e_bev_villkor.sql`
   (additiv: tabell `private.bev_villkor`, RPC `bev_villkor_get/save`, `bev_svc_villkor`).
   Utan den sparas villkoren bara i telefonen och servern använder standardvärdena.
3. Deploya edge-funktionen `bevakning` (filer: `index.ts`, `villkor.ts`, `tagnotis.ts`,
   `routewatch.ts`, `flygnotis.ts`, `notis.ts`). Det är detta som stoppar push-notiserna.

## Ångra

- Klient: `git revert <merge-commit>` i en ny PR (ingen force-push, ingen reset av main).
  Höj cache-taggar igen om det behövs.
- Edge-funktionen: deploya föregående version. Kopior av `origin/main`-versionerna före
  ändringen ligger i `docs/bevakningar/bevakning-edge-pre-ljud1-rollback/`
  (`index.ts`, `tagnotis.ts`, `routewatch.ts`; `villkor.ts` är ny och kan tas bort).
  Kontrollera mot den faktiskt deployade versionen innan återställning.
- SQL: `supabase/migrations/undo/20261112e_bev_villkor_undo.sql` (tar bort de tre
  funktionerna och tabellen; sparade villkor försvinner). Gamla edge-funktionen anropar inte
  `bev_svc_villkor`, och ny edge-funktion klarar att den saknas (standardvärden).
- Lokalt sparade villkor `taxi_bev_villkor:<förare>` i telefonen är ofarliga utan funktionen.
- Gammal state per avgång (`seen`, `late`) ignoreras av äldre kod.

## Tester

- `deno test --allow-all --import-map=_test/import_map.json _test/` i `supabase/functions`
  (`villkor_test.ts`, `villkor_tick_test.ts`, uppdaterad `tagnotis_test.ts`).
- `node tests/bevakningar/villkor-browser.cjs` (mörkt) och `THEME=light ...` (ljust),
  bilder i `/workspace/anim-preview/tag-ljudvillkor/`.
- `node tests/bevakningar/villkor-sw.cjs`, `node tests/bevakningar/villkor-sql.cjs` (PGlite).
