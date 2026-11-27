DO $$
declare d text; n text; o oid;
begin
  select p.oid into o from pg_proc p where p.proname = 'dispatch' and p.pronamespace = 'inbox_private'::regnamespace;
  d := pg_get_functiondef(o);
  n := replace(d, 'where coalesce(c.company_id,''default'')=a.company_id and char_length', 'where c.company_id=a.company_id and char_length'); execute n;
  select p.oid into o from pg_proc p where p.proname = 'resolve_car' and p.pronamespace = 'inbox_private'::regnamespace;
  d := pg_get_functiondef(o);
  n := replace(d, 'coalesce(c.company_id,''default'')=p_company and char_length', 'c.company_id=p_company and char_length'); execute n;
end $$;
