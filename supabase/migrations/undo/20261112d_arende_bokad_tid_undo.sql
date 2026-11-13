-- Ångra 20261112d_arende_bokad_tid. Bokningar och trådar ligger kvar i inbox_private och syns
-- som vanliga Meddelande-trådar i Ärenden (kopplingen till felanmälan försvinner).
begin;
drop function if exists public.issue_booking(text, text, jsonb);
drop table if exists inbox_private.issue_threads;
commit;
