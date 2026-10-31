-- Ångra 20261031a_zonguide.sql: ta bort Zonguide-RPC:n. Inga tabeller eller data påverkas.
drop function if exists public.zonguide(text, int, int, int);
