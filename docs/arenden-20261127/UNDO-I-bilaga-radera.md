# Ta bort egen bilaga (läkarintyg + foton) – 2026-11-27bilaga1
**Fanns det förut?** Läkarintyg: ja, kryss + bekräfta fanns i Sjuk (hård radering, men blockerad i stängd tråd, ingen markering). Foton på felanmälan/underhåll: servern (`bil-foto` `delete_photo`) kunde men ingen knapp fanns i appen (bara hela ärendet kunde raderas). Meddelandetrådar har inga bilagor (bara text).

## Regel (Christian 20:49, integritet)
- Den som laddat upp får ALLTID ta bort sin bilaga (även stängd tråd/beviljad eller utbetald sjuklön). Ägare/admin får ta bort alla. Meddelandetexten ligger kvar.
- Filen raderas PÅ RIKTIGT ur lagringen (inga återställningsbara kopior). Kvar i databasen: bara markering `deleted_at/deleted_by` → tråden visar "Bilaga borttagen av <namn> · tid".
- Bekräftelse före radering (`confirm`). Misslyckas lagringsraderingen backas markeringen (`*_unmark`, bara service_role) så inget "borttaget" ligger kvar i lagringen.

## Ändringar
- SQL `20261127e` (mjukradering, ersatt) + `20261127f` (gäller): kolumner `private.sick_certs.deleted_at/deleted_by`, `public.car_issue_photos.deleted_at/deleted_by`; `sjuk_svc_cert_delete`, `sjuk_svc_cert_list`, `sjuk_svc_cert_unmark`, `bil_photo_delete_svc`, `bil_photo_list`, `bil_photo_unmark`; `sjuk_json`/`bil_issue_json`/`bil_maint_json` (räknar inte borttagna, nya `certs_deleted`/`photos_deleted`); `ekonomi_calc`, `sjuk_svc_cert_begin`, `bil_photo_begin` (borttagna räknas inte mot gränsen).
- Edge-funktioner `sjuk` (v3) och `bil-foto` (v3): raderar filen efter markeringen; `list` ger markeringar utan länk. Källa i `supabase/functions/{sjuk,bil-foto}/index.ts`.
- UI: `sjuk.js` (kryss även låst tråd, markering, tidigare perioder stängs inte längre), `verkstad.js` + `verkstad-admin.js` (kryss på foton, markering).

## Ångra
1. `git revert -m 1 <merge>` för UI, höj cache.
2. Edge: deploya tillbaka `/workspace/backups/sjuk-edge-before-bilaga.ts` (sjuk) och `/workspace/backups/bil-foto-edge-before.ts` (bil-foto) via Supabase.
3. SQL: kör `undo/20261127f_bilaga_riktig_radering.sql` och därefter `undo/20261127e_sjuk_bilaga_mjukradering.sql`.
**OBS:** redan raderade filer kan inte återskapas (avsiktligt).

## Verifierat (syntetiskt, rullat tillbaka/städat)
`tests/arenden-20261127/`: `sjuk-lock-rollback.sql` (16 kontroller), `bilaga-ui.cjs`, `bilaga.py` (390 px ljust+mörkt), `bilaga-e2e-sjuk.py` + `bilaga-e2e-foto.py` (riktiga edge-anrop mot syntetiska förare: uppladdare tar bort egen fil i stängd tråd med utbetald sjuklön → filen borta ur lagringen, ägare tar bort andras, annan förare nekas 403; testdata städad).
