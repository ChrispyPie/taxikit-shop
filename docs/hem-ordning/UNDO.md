Ångra hemskärmens verktygsordning och tillägg/borttag 2026-11-11

Backup-gren för tillägg/borttag och layout: `backup/pre-hem-moduler-20261111`.
Backup-gren för den ursprungliga ordningen: `backup/pre-hem-ordning-20261111`.
Kod: `git revert` av merge för PR:en, eller återställ main till backup-grenen (tvinga inte fram en push).

Databas, bara tillägg/borttag (kolumnen `hidden` och 3-arg-RPC):
kör `supabase/migrations/undo/20261111h_home_tool_hidden_undo.sql`.
Tabellen och den äldre 2-arg-RPC:en lämnas kvar.

Databas, hela funktionen (ordning + tillägg/borttag):
kör först undo för 20261111h, därefter `supabase/migrations/undo/20261111g_home_tool_order_undo.sql`.
Det tar bort tabellen `private.home_tool_order` och RPC:erna. Övriga tabeller påverkas inte.

Förare som bara hade valet i localStorage (`taxi_home_order:<förar-id>`) kan rensa den nyckeln i webbläsaren.
