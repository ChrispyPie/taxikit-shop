-- Tillåt tillfälliga båtbevakningar (kind 'bat') i watch_set.
-- Additive: samma funktion som tidigare, plus 'bat' i kind-listan.
-- Inga nya tabeller. arrival_watches har ingen kind-check på tabellen.

create or replace function public.watch_set(p_token text, p_kind text, p_ident text, p_sched timestamp with time zone, p_on boolean, p_label text DEFAULT NULL::text, p_sub text DEFAULT NULL::text, p_state jsonb DEFAULT '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if p_kind not in ('flyg','tag','bat') or coalesce(p_ident,'') = '' or length(p_ident) > 20 or p_sched is null then
    raise exception 'bad_input' using errcode = '22023'; end if;
  if not p_on then
    delete from public.arrival_watches where driver_id = a.driver_id and kind = p_kind and ident = p_ident and sched = p_sched;
    return public.watch_list(p_token);
  end if;
  if p_sched < now() - interval '12 hours' or p_sched > now() + interval '2 days' then
    raise exception 'bad_input' using errcode = '22023'; end if;
  if (select count(*) from public.arrival_watches where driver_id = a.driver_id and expires_at > now()) >= 20 then
    raise exception 'too_many' using errcode = '54000'; end if;
  insert into public.arrival_watches (driver_id, kind, ident, sched, label, sub, state, expires_at)
  values (a.driver_id, p_kind, p_ident, p_sched, left(p_label, 60), left(p_sub, 60),
          case when jsonb_typeof(p_state) = 'object' and length(p_state::text) < 2000 then p_state else '{}'::jsonb end,
          greatest(p_sched, now()) + interval '3 hours')
  on conflict (driver_id, kind, ident, sched) do update set expires_at = greatest(excluded.expires_at, arrival_watches.expires_at);
  return public.watch_list(p_token);
end
$function$;
