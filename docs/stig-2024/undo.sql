-- Manual undo ONLY. Removes calendar-year 2024 archive data, not 2025/current.
-- Includes January-June left by the interrupted run. Does not drop schema/functions.
BEGIN;
DELETE FROM private.arkiv_trips WHERE dataset='arkiv' AND startdatum >= '2024-01-01' AND startdatum < '2025-01-01';
DELETE FROM private.arkiv_shifts WHERE dataset='arkiv' AND left(regexp_replace(start, '\D', '', 'g'),4)='2024';
DELETE FROM private.ersatta_kvitton WHERE dataset='arkiv' AND startdatum >= '2024-01-01' AND startdatum < '2025-01-01';
DELETE FROM private.backfill_checkpoint WHERE dataset='arkiv' AND month >= '2024-01' AND month < '2025-01';
UPDATE private.arkiv_datasets d SET
 trip_count=(SELECT count(*) FROM private.arkiv_trips t WHERE t.dataset=d.name),
 shift_count=(SELECT count(*) FROM private.arkiv_shifts s WHERE s.dataset=d.name)
WHERE name='arkiv';
-- Preserve original staged files as evidence; optional removal is restricted to 2024:
-- DELETE FROM private.probe_reports WHERE month >= '2024-01' AND month < '2025-01' AND kind IN ('bf_pass','bf_resa');
COMMIT;
