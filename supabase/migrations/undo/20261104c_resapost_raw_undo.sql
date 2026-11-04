-- Ångra 20261104c: tar bort rådata-tabellen, laddfunktionen och triggern.
-- Källfilerna i private.probe_reports och alla trips/arkiv_trips är orörda.
drop trigger if exists resapost_raw_after_put on private.probe_reports;
drop function if exists private.resapost_raw_trg();
drop function if exists private.resapost_raw_load(bigint);
drop table if exists private.resapost_raw;
