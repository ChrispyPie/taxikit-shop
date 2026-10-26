# Forum – god ton + godkännande av regler (t353/t354, 2026-10-26)

- Branch: `feature/forum-god-ton` (från main `5375f50`)
- Backup-branch: `backup/pre-forum-god-ton-2026-10-26` (= main före ändringen)
- Filer: `TaxiData/forum.js`, `TaxiData/index.html` (cache-bust `forum.js?v=20261026pg16`),
  `supabase/migrations/20261026f_forum_rules_accept.sql`, `docs/forum/*`
- Konstanter i forum.js: `COMPLAINT_SYSTEM = 'Roxx'` (namnet på ärendesystemet), `RULES_VERSION = 1`
  (höj för att tvinga nytt godkännande när regeltexten ändras).
- localStorage: `forum_rule_hidden` (infobox i listan ihopfälld), `forum_rules_ok_<förar-id>` (cache, värde = version).

## Supabase (additivt, redan applicerat live i lpfdryvukqmjlgenuzpb)
Ny tabell `public.forum_rules_accept` (RLS på, ingen direkt åtkomst) + RPC:er
`forum_rules_status(p_token, p_version)` och `forum_rules_accept(p_token, p_version)`.
Befintliga forum-RPC:er är oförändrade (spärren är alltså bara i appen).

Undo:
```sql
drop function if exists public.forum_rules_accept(text, int);
drop function if exists public.forum_rules_status(text, int);
drop table if exists public.forum_rules_accept;
```
(Gör undo av SQL först efter att frontend-ändringen backats, annars fastnar förare i spärren med felmeddelande.)

## Backa frontend
- Ej mergad: stäng PR:en.
- Mergad: `git revert -m 1 <merge-commit>` på main och push (ingen force), eller återställ filerna från
  `backup/pre-forum-god-ton-2026-10-26`. Höj cache-bust igen (t.ex. pg17) så telefonerna laddar om.

## Konflikt
PR #15 sätter samma rad i index.html till `forum.js?v=20261026pg15`. Behåll `pg16` (eller högre) oavsett vilken som mergas sist.
