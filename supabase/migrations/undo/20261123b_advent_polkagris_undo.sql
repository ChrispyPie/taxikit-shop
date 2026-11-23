-- Ångra 20261123b_advent_polkagris. Tar bort RPC och tabeller.

drop function if exists public.polkagris_claim(text, bigint, date);
drop function if exists public.polkagris_state(text, date);
drop function if exists public.advent_open(text, integer, date);
drop function if exists public.advent_state(text, date);
drop function if exists private.polkagris_maybe_spawn(smallint, timestamptz);
drop function if exists private.polkagris_board(smallint);
drop function if exists private.polkagris_display_name(text);
drop function if exists private.polkagris_places();
drop function if exists private.advent_purge_prelive();
drop function if exists private.advent_season_year(date, date, text);
drop function if exists private.advent_is_test(date, text);
drop function if exists private.advent_may_use(text);
drop function if exists private.advent_is_live();
drop function if exists private.advent_live_at();
drop function if exists private.advent_today(date, text);
drop table if exists public.polkagris_canes;
drop table if exists public.advent_opens;
