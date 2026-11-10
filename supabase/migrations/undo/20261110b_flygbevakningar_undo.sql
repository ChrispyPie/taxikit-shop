-- Ångra 20261110b_flygbevakningar: tar bort flyg-Bevakningar och återställer private.bevakning_tick
-- till versionen som bara såg arrival_watches och tåg-Bevakningar.

create or replace function private.bevakning_tick()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_key text; resp extensions.http_response;
begin
  delete from public.arrival_watches where expires_at < now() - interval '1 hour';
  delete from public.train_watch_sent where sched < now() - interval '2 days';
  if not exists (select 1 from public.arrival_watches where expires_at > now())
     and not exists (select 1 from private.tw_active_now()) then return 0; end if;
  v_key := private.vault_secret('BEVAKNING_TICK_KEY');
  if coalesce(v_key,'') = '' then return -1; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  resp := extensions.http(('POST', 'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/bevakning',
     array[extensions.http_header('x-tick-key', v_key)], 'application/json', '{"action":"tick"}')::extensions.http_request);
  return resp.status;
exception when others then return -2;
end $function$;

drop function if exists public.fw_svc_mark(text, text, timestamptz, jsonb);
drop function if exists public.fw_svc_active();
drop function if exists public.flight_watch_delete(text, bigint);
drop function if exists public.flight_watch_save(text, bigint, jsonb);
drop function if exists public.flight_watch_list(text);
drop function if exists private.fw_active_now();
drop table if exists public.flight_watch_sent;
drop table if exists public.flight_watches;
