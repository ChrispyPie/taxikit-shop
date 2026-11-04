-- Ångra 20261104d_prognos_kundtid_eval.sql (OBS: sparade verifierade fall och offsets försvinner)
drop function if exists public.sadmin_prognos_kundtid_eval(text, integer, integer);
drop function if exists public.sadmin_truth_add(text, text, text, timestamptz, timestamptz, timestamptz, text);
drop function if exists public.sadmin_kundtid_set(text, text, integer);
drop function if exists public.sadmin_kundtid_get(text);
drop table if exists private.prognos_truth;
drop table if exists private.prognos_kundtid_cfg;
