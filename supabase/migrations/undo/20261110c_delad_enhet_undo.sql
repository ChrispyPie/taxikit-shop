-- Ångra 20261110c_delad_enhet.sql (tar bara bort den tillagda RPC:n).
drop function if exists public.pass_ended_since(text, timestamptz);
