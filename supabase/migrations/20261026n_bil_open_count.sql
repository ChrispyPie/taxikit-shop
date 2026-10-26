-- 20261026n: Admin › Bil & verkstad – antal nya (obehandlade) anmälningar för siffran på Admin-rutan.
-- Bara tillägg: en ny läsfunktion. Inga tabeller ändras.
-- Ägaren och S admin får antalet anmälningar (behövs + fel) med status 'ny' i sitt åkeri. Alla andra (även demokonton) får 0.
-- Ångra: drop function if exists public.bil_open_count(text);
create or replace function public.bil_open_count(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare a record;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin or private.is_demo() then
    return json_build_object('supply', 0, 'fault', 0);
  end if;
  return json_build_object(
    'supply', (select count(*) from public.car_issues i where i.company_id = a.company_id and i.kind = 'supply' and i.status = 'ny'),
    'fault',  (select count(*) from public.car_issues i where i.company_id = a.company_id and i.kind = 'fault'  and i.status = 'ny'));
end $function$;

revoke all on function public.bil_open_count(text) from public;
grant execute on function public.bil_open_count(text) to anon, authenticated;
