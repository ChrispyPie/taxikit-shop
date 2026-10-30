-- Sjukanmälan för alla förare (Christians "kör" 30 okt 2026, t719u). Bara tillägg + två utökade funktioner.
-- Ny tabell private.feature_global: en flagga här gäller alla inloggade förare (inte demo).
-- has_feature och get_my_features gör exakt som förut, plus att de räknar med feature_global.
-- Ångra: supabase/migrations/undo/20261030b_sjuk_alla_undo.sql
create table if not exists private.feature_global (
  feature    text primary key,
  created_at timestamptz not null default now()
);
revoke all on private.feature_global from public, anon, authenticated;
insert into private.feature_global (feature) values ('sjuk') on conflict do nothing;

create or replace function private.has_feature(p_driver text, p_feature text)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select not private.is_demo()
     and (exists (select 1 from private.feature_flags f where f.driver_id = p_driver and f.feature = p_feature)
          or (p_driver is not null and exists (select 1 from private.feature_global g where g.feature = p_feature)))
$$;
revoke all on function private.has_feature(text, text) from public, anon, authenticated;

create or replace function public.get_my_features(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record;
begin
  begin
    select * into a from private.session_actor(p_token);
  exception when others then
    return '[]'::jsonb;
  end;
  if private.is_demo() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x.feature order by x.feature) from (
      select f.feature from private.feature_flags f where f.driver_id = a.driver_id
      union
      select g.feature from private.feature_global g where a.driver_id is not null
    ) x), '[]'::jsonb);
end $$;
revoke all on function public.get_my_features(text) from public;
grant execute on function public.get_my_features(text) to anon, authenticated;
