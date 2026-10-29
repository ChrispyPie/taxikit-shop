-- Ångra 20261029i_tagnotiser: återställ bevakning_tick som den var och ta bort tågnotiserna.
-- OBS: förarnas sparade tågnotiser försvinner.
CREATE OR REPLACE FUNCTION private.bevakning_tick() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_key text; resp extensions.http_response;
begin
  delete from public.arrival_watches where expires_at < now() - interval '1 hour';
  if not exists (select 1 from public.arrival_watches where expires_at > now()) then return 0; end if;
  v_key := private.vault_secret('BEVAKNING_TICK_KEY');
  if coalesce(v_key,'') = '' then return -1; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  resp := extensions.http(('POST', 'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/bevakning',
     array[extensions.http_header('x-tick-key', v_key)], 'application/json', '{"action":"tick"}')::extensions.http_request);
  return resp.status;
exception when others then return -2;
end $function$;

drop function if exists public.tw_svc_active();
drop function if exists public.tw_svc_mark(text, text, timestamptz, jsonb);
drop function if exists private.tw_active_now();
drop function if exists public.train_watch_list(text);
drop function if exists public.train_watch_save(text, bigint, jsonb);
drop function if exists public.train_watch_delete(text, bigint);
drop function if exists private.tw_json(public.train_watches);
drop function if exists private.tw_in_window(int[], int, int, timestamptz);
drop table if exists public.train_watch_sent;
drop table if exists public.train_watches;
