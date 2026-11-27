-- 2026-11-27bilnr2: åkeriets bilar saknades i Meddelande-formuläret. public.cars.company_id är NULL för alla riktiga bilar
-- (resten av appen läser coalesce(company_id,'default'), t.ex. bil_car_ok/get_bil/save_car_issue), men mailbox-dispatch 'cars' och resolve_car jämförde rakt av.
-- Undo: supabase/migrations/undo/20261127g_cars_company_null.sql
DO $$
declare d text; n text; o oid;
begin
  select p.oid into o from pg_proc p where p.proname = 'dispatch' and p.pronamespace = 'inbox_private'::regnamespace;
  d := pg_get_functiondef(o);
  n := replace(d, 'from public.cars c where c.company_id=a.company_id and char_length', 'from public.cars c where coalesce(c.company_id,''default'')=a.company_id and char_length');
  if n = d then raise exception 'dispatch: mönster saknas'; end if; execute n;
  select p.oid into o from pg_proc p where p.proname = 'resolve_car' and p.pronamespace = 'inbox_private'::regnamespace;
  d := pg_get_functiondef(o);
  n := replace(d, 'c.company_id=p_company and char_length', 'coalesce(c.company_id,''default'')=p_company and char_length');
  if n = d then raise exception 'resolve_car: mönster saknas'; end if; execute n;
end $$;
