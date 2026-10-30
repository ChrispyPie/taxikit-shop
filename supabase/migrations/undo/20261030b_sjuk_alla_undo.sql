-- Ångra 20261030b_sjuk_alla.sql och borttagningen av testflaggan sjuk_se_allt.
-- 1) Sjukanmälan bara för Christian och Berra igen (räcker oftast, appen följer med av sig själv):
delete from private.feature_global where feature = 'sjuk';

-- 2) Valfritt: lägg tillbaka testflaggan "se även dina egna" för Christian (raden som togs bort 30 okt):
-- insert into private.feature_flags (feature, driver_id, created_at)
--   values ('sjuk_se_allt', '710022', '2026-10-29T03:24:28.226111+00:00') on conflict do nothing;

-- 3) Valfritt: funktionerna exakt som före 30 okt, och ta bort tabellen.
create or replace function private.has_feature(p_driver text, p_feature text)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select not private.is_demo()
     and exists (select 1 from private.feature_flags f where f.driver_id = p_driver and f.feature = p_feature)
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
  return coalesce((select jsonb_agg(f.feature order by f.feature) from private.feature_flags f where f.driver_id = a.driver_id), '[]'::jsonb);
end $$;
revoke all on function public.get_my_features(text) from public;
grant execute on function public.get_my_features(text) to anon, authenticated;
-- drop table if exists private.feature_global;  -- bara efter ja
