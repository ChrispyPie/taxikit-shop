-- 20261029d Säkerhetslogg: IP-adress, webbläsare (user agent) och enhets-id på varje loggrad.
-- Bara tillägg: tre nya kolumner i activity_log, en trigger som fyller dem från anropets HTTP-huvuden,
-- en ny läsfunktion admin_log_page_v2 (gamla admin_log_page är orörd) och ett nattligt cron-jobb
-- som rensar loggrader äldre än 13 månader (private.log_prune finns redan).
-- Allt som skriver till loggen går via private.log -> insert i activity_log, så triggern täcker
-- inloggning (lyckad/misslyckad), aktivering, glömt lösenord, nytt lösenord, utloggning och alla
-- ändringar som redan loggas. Cron/system har inga HTTP-huvuden och får tomma fält.
-- Ångra: undo/20261029d_sakerhetslogg_undo.sql

alter table public.activity_log
  add column if not exists ip text,
  add column if not exists user_agent text,
  add column if not exists device_id text;

create index if not exists activity_log_ip_idx on public.activity_log (ip, created_at desc) where ip is not null;
create index if not exists activity_log_device_idx on public.activity_log (device_id, created_at desc) where device_id is not null;

-- IP, user agent och enhets-id ur PostgREST:s request.headers (tomt utanför ett API-anrop).
-- IP: cf-connecting-ip (sätts av Cloudflare och kan inte förfalskas av klienten), annars första
-- adressen i x-forwarded-for, annars x-real-ip. Enhets-id: huvudet x-taxi-enhet som appen skickar.
create or replace function private.request_meta(out ip text, out user_agent text, out device_id text)
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $$
declare h json; v text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is null or json_typeof(h) <> 'object' then return; end if;
  v := coalesce(nullif(btrim(h->>'cf-connecting-ip'), ''),
                nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''),
                nullif(btrim(h->>'x-real-ip'), ''));
  if v is not null then
    begin
      ip := host(v::inet);
    exception when others then
      ip := null;
    end;
  end if;
  user_agent := left(nullif(btrim(h->>'user-agent'), ''), 300);
  v := h->>'x-taxi-enhet';
  if v ~ '^[A-Za-z0-9-]{8,64}$' then device_id := v; end if;
end $$;

create or replace function private.activity_log_meta()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $$
declare m record;
begin
  if new.ip is null and new.user_agent is null and new.device_id is null then
    select * into m from private.request_meta();
    new.ip := m.ip;
    new.user_agent := m.user_agent;
    new.device_id := m.device_id;
  end if;
  return new;
end $$;

revoke all on function private.request_meta() from public;
revoke all on function private.activity_log_meta() from public;

drop trigger if exists activity_log_meta on public.activity_log;
create trigger activity_log_meta before insert on public.activity_log
  for each row execute function private.activity_log_meta();

-- Loggen för adminpanelen, som admin_log_page men med IP/enhet/webbläsare och sökning.
-- IP-adressen visas bara för ägare och S admin. Admin ser enhet och webbläsare men inte IP.
-- p_sok: IP-adress (ägare/S admin) eller enhets-id; början räcker.
create or replace function public.admin_log_page_v2(p_token text, p_limit integer default 200,
  p_before timestamp with time zone default null, p_before_id bigint default null,
  p_hide text[] default null, p_driver text default null, p_sok text default null)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $$
declare a record; v_all boolean; v_ip boolean; v_lim int := least(greatest(coalesce(p_limit, 200), 1), 500); v_rows json; v_n int;
  v_exact text[]; v_pref text[]; v_sok text; v_like text;
begin
  select * into a from private.require_admin(p_token);
  v_all := a.category = any (private.workshop_roles());
  v_ip := a.category in ('agare', 'superadmin');
  v_sok := nullif(btrim(left(coalesce(p_sok, ''), 64)), '');
  v_like := replace(replace(replace(v_sok, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  select coalesce(array_agg(h) filter (where right(h, 1) <> '*'), '{}'),
         coalesce(array_agg(replace(left(h, -1), '_', '\_') || '%') filter (where right(h, 1) = '*'), '{}')
    into v_exact, v_pref
    from unnest(coalesce(p_hide, '{}')) h where coalesce(h, '') <> '';
  select json_agg(json_build_object('id', l.id, 'time', l.created_at, 'actor_id', l.actor_id, 'actor_role', l.actor_role,
      'action', l.action, 'target_id', l.target_id, 'details', l.details, 'via_master', l.via_master,
      'ip', case when v_ip then l.ip end, 'device', l.device_id, 'ua', l.user_agent) order by l.created_at desc, l.id desc),
         count(*)
    into v_rows, v_n
    from (select * from public.activity_log x
           where (v_all or not (x.action like 'bil\_%' or x.action like 'workshop\_%'))
             and (p_before is null or (x.created_at, x.id) < (p_before, coalesce(p_before_id, 0)))
             and not (x.action = any (v_exact))
             and not (x.action like any (v_pref))
             and (p_driver is null or x.actor_id = p_driver or x.target_id = p_driver)
             and (v_sok is null or x.device_id like v_like or (v_ip and x.ip like v_like))
           order by created_at desc, id desc
           limit v_lim + 1) l;
  return json_build_object('rows', coalesce((select json_agg(e) from (select e from json_array_elements(coalesce(v_rows, '[]'::json)) with ordinality t(e, i) where i <= v_lim order by i) z), '[]'::json),
                           'more', coalesce(v_n, 0) > v_lim, 'ip', v_ip);
end $$;

revoke all on function public.admin_log_page_v2(text, integer, timestamp with time zone, bigint, text[], text, text) from public;
grant execute on function public.admin_log_page_v2(text, integer, timestamp with time zone, bigint, text[], text, text) to anon, authenticated;

-- Rensa loggrader äldre än 13 månader varje natt 03:40 (UTC). log_prune() har 13 månader som standard.
select cron.schedule('taxikit-log-prune', '40 3 * * *', 'select private.log_prune()');
