# Forum klassiskt — ångra (live 2026-11-06)

## Live
- PR: https://github.com/ChrispyPie/taxikit-shop/pull/75
- Merge-sha: `ab8230eb0ff9b43b6567b38ec4ba0241e379d7bd`
- SQL applicerad: `20261106a_forum_classic` (tabeller + RPC:er) + seed `20261106c` (4 fästa guider/FAQ i Hjälp & guider)
- Nyheter: `2026-11-06a` tid `17:35` (Europe/Stockholm)
- Backup före feature: `backup/pre-forum-classic-20261106` (= main @ `b2f018b4`)
- Backup före merge: `backup/pre-forum-classic-merge-20261106` (= main @ `e52c0853`)

## Ångra frontend
1. `git revert -m 1 ab8230eb0ff9b43b6567b38ec4ba0241e379d7bd` på main och push (ingen force), **eller** återställ `TaxiData/forum.js` + `index.html` + `om-data.js` + `changelog.js` från `backup/pre-forum-classic-merge-20261106`.
2. Höj cache-bust i `TaxiData/index.html` så telefonerna laddar om.

## Ångra SQL (efter frontend backats)
1. Seed först (valfritt om du kör hela a-undo):  
   `supabase/migrations/undo/20261106c_forum_guides_seed_undo.sql`
2. Sedan hela klassiska forumet:  
   `supabase/migrations/undo/20261106a_forum_classic_undo.sql`  
   (droppar RPC:er + `forum_sections` / `forum_threads` / `forum_replies` / `forum_reads`)

Gamla `forum_posts` / `forum_comments` / gamla `forum_*`-RPC:er och `dev_wishes` påverkas **inte**.
