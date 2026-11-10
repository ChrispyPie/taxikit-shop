-- Ångra kvittokopia-RPC (20261111a). Tar bara bort det som migrationen lade till.
drop function if exists public.get_trip_receipt(text, text, text, text);
drop function if exists private.receipt_safe_map(jsonb);
