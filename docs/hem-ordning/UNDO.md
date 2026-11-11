Ångra hemskärmens verktygsordning 2026-11-11

Backup-gren: `backup/pre-hem-ordning-20261111`.
Kod: `git revert` av merge för PR:en, eller återställ main till backup-grenen (tvinga inte fram en push).
Databas: kör `supabase/migrations/undo/20261111g_home_tool_order_undo.sql`.
Det tar bort tabellen `private.home_tool_order` och RPC:erna `home_tool_order_get` / `home_tool_order_set`. Övriga tabeller påverkas inte. Förare som bara hade ordningen i localStorage (`taxi_home_order:<förar-id>`) kan rensa den nyckeln i webbläsaren.
