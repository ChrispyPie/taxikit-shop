-- Ångra 20261104e: tar bort topplistor per bil. Inget annat påverkas.
drop function if exists public.get_leaderboard_bil(text, date, date);
