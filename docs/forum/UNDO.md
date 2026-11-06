# Forum – klassiskt (2026-11-06) + tidigare god ton

## Klassiskt forum (den här PR:en)
- Branch: `feat/forum-classic`
- Backup-branch: `backup/pre-forum-classic-20261106` (= main före ändringen)
- Filer: `TaxiData/forum.js`, `TaxiData/index.html` (cache-bust `forum.js?v=20261106fc1`),
  `supabase/migrations/20261106a_forum_classic.sql`, `docs/forum/*`
- SQL är **additivt**. Applicera inte i prod förrän PR är godkänd.
- Undo SQL: `supabase/migrations/undo/20261106a_forum_classic_undo.sql`
  (kör undo av SQL först efter att frontend backats, annars får förare RPC-fel).

### Backa frontend
- Ej mergad: stäng PR:en.
- Mergad: `git revert -m 1 <merge-commit>` på main och push (ingen force), eller återställ
  från `backup/pre-forum-classic-20261106`. Höj cache-bust.

### Obs
- `dev_wishes` / Admin › Önskemål orörd.
- Gamla `forum_posts` / `forum_comments` / `forum_*` RPC:er orörda (tomma).

## Tidigare: god ton + godkännande (2026-10-26)
- Tabell `forum_rules_accept` + `forum_rules_status` / `forum_rules_accept` — behålls.
- Konstanter i forum.js: `COMPLAINT_SYSTEM = 'Roxx'`, `RULES_VERSION = 1`.
