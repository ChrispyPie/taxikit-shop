-- Ekonomi fas 2 (utkast): löneunderlag per förare för en period (inkört, Uber, lönegrund, lön, semesterersättning).
-- Samma behörighet som ekonomi_period (bara ägare + superadmin, ej demo, bara eget åkeri). Bara läsning, ändrar inga data.
-- Ångra: supabase/migrations/undo/20261128a_ekonomi_fas2_loneunderlag_undo.sql
create or replace function private.ekonomi_loneunderlag(p_company text, p_from date, p_to date)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare v jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then raise exception 'bad_period' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('driver_id', f.forar, 'namn', private.forum_name(f.forar),
           'l', private.forar_lon_period(p_company, f.forar, p_from, p_to),
           'manader', (select coalesce(jsonb_agg(jsonb_build_object('mon', g.m, 'l', private.forar_lon_period(p_company, f.forar,
                         greatest(p_from, g.m), least(p_to, (g.m + interval '1 month')::date - 1))) order by g.m), '[]'::jsonb)
                       from (select distinct date_trunc('month', d2.day)::date m from private.day_summary d2
                              where d2.company_id = p_company and d2.forar = f.forar and d2.day between p_from and p_to) g)) order by private.forum_name(f.forar), f.forar), '[]'::jsonb)
    into v
    from (select distinct d.forar from private.day_summary d
           where d.company_id = p_company and d.day between p_from and p_to) f;
  return jsonb_build_object('from', p_from, 'to', p_to, 'forare', v,
    'provision', (select (private.lonekost_cfg(p_company)->>'provision')::numeric));
end $function$;
revoke all on function private.ekonomi_loneunderlag(text, date, date) from public, anon, authenticated;

create or replace function messaging_private.ekonomi_loneunderlag(p_token text, p_from date, p_to date)
 returns jsonb language plpgsql security definer set search_path = '' as $function$
declare a record;
begin
  select * into a from private.bil_actor(p_token);
  if a.category is null or a.category not in ('agare', 'superadmin') or private.is_demo() then
    raise exception 'forbidden' using errcode = '42501'; end if;
  return private.ekonomi_loneunderlag(a.company_id, p_from, p_to);
end $function$;
revoke all on function messaging_private.ekonomi_loneunderlag(text, date, date) from public;
grant execute on function messaging_private.ekonomi_loneunderlag(text, date, date) to anon, authenticated;
create or replace function public.ekonomi_loneunderlag(p_token text, p_from date, p_to date) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.ekonomi_loneunderlag(p_token, p_from, p_to) $$;
revoke all on function public.ekonomi_loneunderlag(text, date, date) from public;
grant execute on function public.ekonomi_loneunderlag(text, date, date) to anon, authenticated;
