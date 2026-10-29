-- 20261029c: Huvudlösenordet tas bort + två små säkerhetsfixar (t606u).
-- 1) login: huvudlösenordet kontrolleras inte längre. Bara förarens eget lösenord fungerar.
--    Raden i private.app_secrets lämnas orörd (används inte längre) så att ångra blir exakt; den kan tas bort senare.
-- 2) login: samma svar "wrong" för okänt förar-id, konto utan lösenord (ej aktiverat) och fel lösenord.
--    "inactive" och "ended" visas bara när rätt lösenord har angetts. Orsaken loggas som förut.
-- 3) request_password_reset: den gemensamma gränsen räknar bara mejl som faktiskt skickats (max 100/timme),
--    så försök med påhittade förar-id kan inte längre fylla gränsen. Max 3 per förar-id och timme som förut.
-- Samma signaturer, returtyper och rättigheter. Ingen tabell ändras.
-- Ångra: undo/20261029c_ta_bort_huvudlosenord_undo.sql

create or replace function public.login(p_id text, p_password text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id text := regexp_replace(coalesce(p_id, ''), '^\s+|\s+$', '', 'g');
  d public.drivers; v_fails int; v_token text; v_role text; v_pw_ok boolean;
begin
  if v_id !~ '^[A-Za-z0-9_-]{1,32}$' then return json_build_object('ok', false, 'error', 'bad_id'); end if;
  if upper(v_id) ~ '^DEMO[0-9]+$' then v_id := upper(v_id); end if;   -- demo-ID:n skrivs med versaler
  select count(*) into v_fails from public.activity_log
   where action = 'login_failed' and target_id = v_id and created_at > now() - interval '15 minutes';
  if v_fails >= 10 then return json_build_object('ok', false, 'error', 'locked'); end if;

  -- Demokonto som gått ut eller avslutats: neka direkt (t371u)
  if exists (select 1 from private.demo_accounts x where upper(x.driver_id) = upper(v_id) and (x.ended_at is not null or x.expires_at <= now())) then
    perform private.log(v_id, null, 'login_failed', v_id, '{"reason":"demo_ended"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'demo_ended');
  end if;

  select * into d from public.drivers where id = v_id;
  v_role := case when d.id is null then null else private.norm_cat(d.category) end;
  v_pw_ok := d.id is not null and d.password_hash is not null and coalesce(p_password, '') <> ''
             and extensions.crypt(private.norm_pw(p_password), d.password_hash) = d.password_hash;

  -- Fel lösenord, okänt id eller konto utan lösenord: samma svar, så att ingen kan se om ett konto finns.
  if not v_pw_ok then
    perform private.log(v_id, v_role, 'login_failed', v_id, jsonb_build_object('reason',
      case when d.id is null then 'unknown_id'
           when d.password_hash is null and coalesce(d.activated, false) then 'pending'
           when d.password_hash is null then 'inactive'
           else 'wrong_password' end), false);
    return json_build_object('ok', false, 'error', 'wrong');
  elsif not coalesce(d.activated, false) then
    perform private.log(v_id, v_role, 'login_failed', v_id, '{"reason":"inactive"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'inactive');
  elsif d.category = 'avslutad' then
    perform private.log(v_id, v_role, 'login_failed', v_id, '{"reason":"ended"}'::jsonb, false);
    return json_build_object('ok', false, 'error', 'ended');
  end if;

  delete from private.sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.sessions(token_hash, driver_id, via_master) values (private.token_hash(v_token), v_id, false);
  update public.drivers set logged_in = true, last_login_at = now() where id = v_id;
  perform private.log(v_id, v_role, 'login', v_id, '{}'::jsonb, false);
  return json_build_object('ok', true, 'token', v_token, 'via_master', false,
    'driver', json_build_object('id', v_id, 'category', v_role, 'first_name', d.first_name, 'last_name', d.last_name));
end $function$;

create or replace function public.request_password_reset(p_id text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_id text := btrim(coalesce(p_id, '')); d public.drivers; v_role text;
        v_per_id int; v_total int; v_sent int; v_result text; v_token text;
        v_neutral json := json_build_object('ok', true, 'message', 'Om kontot finns och har en e-postadress har vi skickat en länk.');
begin
  if v_id !~ '^[A-Za-z0-9_-]{1,32}$' then return v_neutral; end if;
  select count(*), count(*) filter (where details->>'result' = 'sent') into v_total, v_sent from public.activity_log
   where action = 'password_reset_request' and created_at > now() - interval '1 hour';
  select count(*) into v_per_id from public.activity_log
   where action = 'password_reset_request' and target_id = v_id and created_at > now() - interval '1 hour';
  select * into d from public.drivers where id = v_id;
  v_role := case when d.id is null then null else private.norm_cat(d.category) end;
  if v_sent >= 100 then
    v_result := 'rate_limited_total';
  elsif v_per_id >= 3 then
    v_result := 'rate_limited_id';
  elsif d.id is null then
    v_result := 'unknown_id';
  elsif not coalesce(d.activated, false) or d.password_hash is null or v_role = 'avslutad' then
    v_result := 'inactive';
  elsif not private.email_ok(d.email) then
    v_result := 'no_email';
  else
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    -- äldre oanvända länkar slutar gälla
    update private.password_resets set used_at = now() where driver_id = d.id and used_at is null;
    insert into private.password_resets(token_hash, driver_id, expires_at)
      values (private.token_hash(v_token), d.id, now() + interval '1 hour');
    v_result := private.send_reset_mail(btrim(d.email), 'https://taxikit.shop/TaxiData/aterstall.html#t=' || v_token, d.first_name);
    if v_result <> 'sent' then
      delete from private.password_resets where token_hash = private.token_hash(v_token);
    end if;
  end if;
  -- loggen fylls inte på obegränsat vid massförsök, men skickade mejl och riktiga förar-id loggas alltid
  -- (gränserna ovan bygger på dem)
  if v_total < 200 or d.id is not null then
    perform private.log(coalesce(d.id, v_id), v_role, 'password_reset_request', coalesce(d.id, v_id), jsonb_build_object('result', v_result), false);
  end if;
  return v_neutral;
end $function$;

-- Eventuella sessioner som startats med huvudlösenordet avslutas (det fanns inga när detta skrevs).
delete from private.sessions where via_master;
