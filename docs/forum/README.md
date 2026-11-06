# Klassiskt forum (2026-11-06)

Branch: `feat/forum-classic` · Backup: `backup/pre-forum-classic-20261106`

## Vad
Forumet är ombyggt till klassisk layout: **sektioner → trådar → svar**.
Fem standardsektioner (inga admin-skapade sektioner i v1):

| Id | Titel | Scope | Skriva | Extra |
|----|-------|-------|--------|-------|
| `hjalp` | Hjälp & guider | global | ägare + superadmin | sticky/pin, grupp HJÄLP |
| `fragor` | Frågor & svar | global | alla | Löst ✓ på svar, grupp HJÄLP |
| `allmant` | Allmänt | global | alla | |
| `onskemal` | Önskemål & förslag | global | alla | status Ny/Pågår/Planerad/Klar |
| `buggar` | Buggar | global | alla | status |
| `akeri` | Mitt åkeri | eget åkeri | eget åkeri | |
| `admin` | Admin | ägare + superadmin | ägare + superadmin | låst för förare |

Guider-seed (ej applicerad): `supabase/migrations/20261106c_forum_guides_seed.sql`.

## Datamigrering
**Ingen.** Forumet var tomt (`forum_posts` = 0). Gamla tabeller/RPC:er lämnas kvar orörda.
**Admin › Önskemål (`dev_wishes`) lämnas orörd.** Forum › Önskemål startar tomt (håll det enkelt).

## SQL (additivt — applicera INTE i prod förrän PR är godkänd)
- `supabase/migrations/20261106a_forum_classic.sql`
- Ångra: `supabase/migrations/undo/20261106a_forum_classic_undo.sql`

Nya tabeller: `forum_sections`, `forum_threads`, `forum_replies`, `forum_reads`.
(`forum_replies` heter så för att inte krocka med befintliga `forum_posts`.)

Nya RPC:er: `forum_home`, `forum_section_threads`, `forum_thread_get`, `forum_thread_new`,
`forum_thread_reply`, `forum_thread_status`, `forum_classic_badge`.

## Frontend
- `TaxiData/forum.js` (omskriven)
- Cache-bust i `TaxiData/index.html`: `forum.js?v=20261106fc1`
- API oförändrat utåt: `FORUM.render` / `back` / `compose` / `openPost` / `refreshBadge`
- `FORUM.compose({cat:'buggar',...})` fungerar (Prognos → Rapportera fel). `forslag` mappas till `onskemal`.

## Nyheter
Utkast i `docs/forum/NYHETER-DRAFT.md` — lägg in i `changelog.js` först när SQL+frontend är live.

## Skärmdumpar (mock)
`/workspace/taxidata-cleanup/screenshots/forum/` och `docs/forum/v1_*.png` (gamla regel-skärmdumpar).
