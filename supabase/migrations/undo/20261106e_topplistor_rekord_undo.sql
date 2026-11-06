-- Ångra 20261106e: ta bort de två nya RPC:erna. Gamla get_leaderboard* påverkas inte.
drop function if exists public.get_topplista_metric(text, date, date, text, text, text);
drop function if exists public.get_rekord_metric(text, text, text, text, text);
