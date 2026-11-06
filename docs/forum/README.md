# Klassiskt forum (2026-11-06)

Branch: `feat/forum-classic` · Backup: `backup/pre-forum-classic-20261106`

## Vad
Forumet är ombyggt till klassisk layout: **sektioner → trådar → svar**.
Fem standardsektioner (inga admin-skapade sektioner i v1):

| Id | Titel | Scope | Status |
|----|-------|-------|--------|
| `allmant` | Allmänt | global | nej |
| `onskemal` | Önskemål & förslag | global | Ny/Pågår/Planerad/Klar |
| `buggar` | Buggar | global | Ny/Pågår/Planerad/Klar |
| `akeri` | Mitt åkeri | eget åkeri | nej |
| `admin` | Admin | ägare + S admin | nej (låst för förare) |

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
