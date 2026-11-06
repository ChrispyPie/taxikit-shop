-- Ångra seedade guider i Hjälp & guider (20261106c). Tar bort trådar med dessa titlar i sektion hjalp.
-- Kör före eller efter 20261106a-undo (a-undo droppar hela tabellerna).
delete from public.forum_threads
 where section_id = 'hjalp'
   and title in (
     'Guide: Prognos',
     'Guide: Zonguide och Topplistor',
     'Guide: Anmälningar & ärenden',
     'FAQ — vanliga frågor'
   );
