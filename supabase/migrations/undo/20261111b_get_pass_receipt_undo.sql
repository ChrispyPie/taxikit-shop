-- Ångra passrapport-RPC (20261111b). Tar bara bort det som migrationen lade till.
drop function if exists public.get_pass_receipt(text, text, text, text);
