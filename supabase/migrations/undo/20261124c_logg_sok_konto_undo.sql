-- Ångra 20261124c_logg_sok_konto: återställ admin_log_page_v2 till 20261029d
-- (p_sok bara IP/enhet, ingen p_exkludera).

drop function if exists public.admin_log_page_v2(text, integer, timestamp with time zone, bigint, text[], text, text, text[]);

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
