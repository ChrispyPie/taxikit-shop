-- Bilar: besiktning, plombering och alkolås med påminnelse + Önskemål: bilder (t653u).
-- Bara tillägg. Ångra: supabase/migrations/undo/20261029k_besiktning_bildbilaga_undo.sql
-- Backup av funktionerna före bytet: branch backup/pre-besiktning-20261029 (20261029h/j-migrationerna = live 29 okt 18:45).
--
-- Del 1. Kontrolldatum per bil (Admin › Bilar).
--   Kolumnerna besiktning, plombering, alkotest (från 20261029h) = senaste datum, som i Berras program (Bilar i Taxitrafik).
--   Nya kolumner *_nasta = nästa datum om ägaren vill ange det själv. Annars räknas nästa ut: senaste + 12 månader.
--     Bilbesiktning: taxi kontrollbesiktas varje år (Transportstyrelsen/Bilprovningen, yrkesfordon).
--     Plombering (taxameter): kontroll senast ett år efter förra (Taxitrafikförordningen 2012:238 5 kap. 3 §).
--     Alkolås/alkotest: ingen fast regel hittad, 12 månader som standard. Ägaren kan ange nästa datum själv.
--   private.car_kontroll_check() körs varje morgon (cron 'taxikit-bil-kontroll'): notis till ägare och S admin
--   30 dagar före, 7 dagar före och när datumet har passerat. Samma notiser som Underhåll (typ bil_maint),
--   så mejl skickas om ägaren valt mejl för "Underhåll snart/försenat". Det som skickats sparas i
--   private.car_kontroll_notices, så samma påminnelse aldrig skickas två gånger.
--
-- Del 2. Bilder i Önskemål och idéer.
--   Privat bucket 'onskemal-foton' (bara jpeg, högst 1 MB), tabell public.dev_wish_photos.
--   Allt går via edge-funktionen onskemal-foto (service_role), som kontrollerar inloggningen här.
--   Bara den som skrev önskemålet och S admin ser bilderna. Högst 4 bilder per önskemål.

-- ===================== Del 1 =====================
alter table public.cars add column if not exists besiktning_nasta date;
alter table public.cars add column if not exists plombering_nasta date;
alter table public.cars add column if not exists alkotest_nasta date;

-- Nästa datum: det ägaren angett (om det är efter senaste), annars senaste + 12 månader.
CREATE OR REPLACE FUNCTION private.car_kontroll_next(p_last date, p_manual date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p_manual is not null and (p_last is null or p_manual > p_last) then p_manual
              when p_last is not null then (p_last + interval '12 months')::date end
$function$;

CREATE OR REPLACE FUNCTION private.car_kalkyl_json(c cars)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object('bildtyp', c.bildtyp, 'specialfordon', c.specialfordon,
    'i_trafik', c.i_trafik, 'ur_trafik', c.ur_trafik, 'besiktning', c.besiktning, 'plombering', c.plombering, 'alkotest', c.alkotest,
    'besiktning_nasta', c.besiktning_nasta, 'plombering_nasta', c.plombering_nasta, 'alkotest_nasta', c.alkotest_nasta,
    'livslangd_ar', c.livslangd_ar, 'inkopspris', c.inkopspris, 'rantor_ar', c.rantor_ar, 'skatt_ar', c.skatt_ar,
    'service_ar', c.service_ar, 'taxiavg_ar', c.taxiavg_ar, 'forsakring_ar', c.forsakring_ar, 'tvatt_ar', c.tvatt_ar,
    'mil_ar', c.mil_ar, 'intakt_mode', c.intakt_mode, 'intakt_ar', c.intakt_ar)
$function$;

-- save_car_full: som 20261029j, plus de tre fälten *_nasta.
CREATE OR REPLACE FUNCTION public.save_car_full(p_token text, p_id bigint, p_car jsonb, p_kalkyl jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; k jsonb := coalesce(p_kalkyl, '{}'::jsonb); r json; o public.cars; n public.cars; v_id bigint;
  v_typ text; v_sp boolean; v_it date; v_ut date; v_bes date; v_plo date; v_alk date; v_liv numeric; v_ink numeric;
  v_ran numeric; v_ska numeric; v_ser numeric; v_avg numeric; v_for numeric; v_tva numeric; v_mil int;
  v_im text; v_ia numeric; v_besn date; v_plon date; v_alkn date;
begin
  select * into a from private.session_actor(p_token);
  if not private.can_edit_cars(a.category) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(k) <> 'object' then raise exception 'invalid_kalkyl' using errcode = '22023'; end if;
  begin
    v_typ := nullif(k->>'bildtyp', '');
    if v_typ = 'special' then v_typ := 'miljobil'; end if;   -- äldre sparad adminsida skickar 'special'
    v_sp := case when nullif(k->>'specialfordon', '') is null then null else (k->>'specialfordon')::boolean end;
    v_it := nullif(k->>'i_trafik', '')::date;   v_ut := nullif(k->>'ur_trafik', '')::date;
    v_bes := nullif(k->>'besiktning', '')::date; v_plo := nullif(k->>'plombering', '')::date; v_alk := nullif(k->>'alkotest', '')::date;
    v_besn := nullif(k->>'besiktning_nasta', '')::date; v_plon := nullif(k->>'plombering_nasta', '')::date; v_alkn := nullif(k->>'alkotest_nasta', '')::date;
    v_liv := round(nullif(k->>'livslangd_ar', '')::numeric, 1);
    v_ink := round(nullif(k->>'inkopspris', '')::numeric, 2);
    v_ran := round(nullif(k->>'rantor_ar', '')::numeric, 2);
    v_ska := round(nullif(k->>'skatt_ar', '')::numeric, 2);
    v_ser := round(nullif(k->>'service_ar', '')::numeric, 2);
    v_avg := round(nullif(k->>'taxiavg_ar', '')::numeric, 2);
    v_for := round(nullif(k->>'forsakring_ar', '')::numeric, 2);
    v_tva := round(nullif(k->>'tvatt_ar', '')::numeric, 2);
    v_mil := round(nullif(k->>'mil_ar', '')::numeric)::int;
    v_im := coalesce(nullif(k->>'intakt_mode', ''), 'data');
    v_ia := case when v_im = 'manual' then round(nullif(k->>'intakt_ar', '')::numeric, 2) end;
  exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
    raise exception 'invalid_kalkyl' using errcode = '22023';
  end;
  if (v_typ is not null and v_typ not in ('sedan','kombi','storbil','miljobil','executive','mirai','trafic'))
     or (v_it is not null and v_it not between date '1990-01-01' and date '2100-01-01')
     or (v_ut is not null and v_ut not between date '1990-01-01' and date '2100-01-01')
     or (v_it is not null and v_ut is not null and v_ut < v_it)
     or (v_bes is not null and v_bes not between date '1990-01-01' and date '2100-01-01')
     or (v_plo is not null and v_plo not between date '1990-01-01' and date '2100-01-01')
     or (v_alk is not null and v_alk not between date '1990-01-01' and date '2100-01-01')
     or (v_besn is not null and v_besn not between date '1990-01-01' and date '2100-01-01')
     or (v_plon is not null and v_plon not between date '1990-01-01' and date '2100-01-01')
     or (v_alkn is not null and v_alkn not between date '1990-01-01' and date '2100-01-01')
     or (v_liv is not null and (v_liv <= 0 or v_liv > 30))
     or least(v_ink, v_ran, v_ska, v_ser, v_avg, v_for, v_tva, v_ia) < 0
     or greatest(v_ink, v_ran, v_ska, v_ser, v_avg, v_for, v_tva, v_ia) > 50000000
     or (v_mil is not null and (v_mil <= 0 or v_mil > 100000))
     or v_im not in ('data','manual') or (v_im = 'manual' and v_ia is null) then
    raise exception 'invalid_kalkyl' using errcode = '22023';
  end if;
  r := public.save_car(p_token, p_id, p_car);   -- kontrollerar och loggar bilfälten som förut
  v_id := (r->>'id')::bigint;
  select * into o from public.cars where id = v_id;
  update public.cars set bildtyp = v_typ, specialfordon = v_sp, i_trafik = v_it, ur_trafik = v_ut, besiktning = v_bes,
      plombering = v_plo, alkotest = v_alk, livslangd_ar = v_liv, inkopspris = v_ink, rantor_ar = v_ran, skatt_ar = v_ska,
      service_ar = v_ser, taxiavg_ar = v_avg, forsakring_ar = v_for, tvatt_ar = v_tva, mil_ar = v_mil,
      intakt_mode = v_im, intakt_ar = v_ia,
      -- Nästa datum (valfritt). Skickar en äldre sparad adminsida inte fälten behålls det som finns.
      besiktning_nasta = case when k ? 'besiktning_nasta' then v_besn else besiktning_nasta end,
      plombering_nasta = case when k ? 'plombering_nasta' then v_plon else plombering_nasta end,
      alkotest_nasta = case when k ? 'alkotest_nasta' then v_alkn else alkotest_nasta end
    where id = v_id returning * into n;
  if private.car_kalkyl_json(o) is distinct from private.car_kalkyl_json(n) then
    update public.cars set kalkyl_updated_at = now(), kalkyl_updated_by = a.driver_id where id = v_id returning * into n;
    perform private.log(a.driver_id, a.category, 'car_kalkyl', n.bilnummer,
      jsonb_build_object('from', private.car_kalkyl_json(o), 'to', private.car_kalkyl_json(n), 'ny', p_id is null), a.via_master);
  end if;
  return (private.car_json(n) || jsonb_build_object('calc', private.car_cost(n), 'kalkyl', private.car_kalkyl_json(n)))::json;
end $function$
;
revoke all on function public.save_car_full(text, bigint, jsonb, jsonb) from public;
grant execute on function public.save_car_full(text, bigint, jsonb, jsonb) to anon, authenticated;

-- Logg över skickade påminnelser. level 1 = 30 dagar före, 2 = 7 dagar före, 3 = datumet har passerat.
create table if not exists private.car_kontroll_notices (
  car_id bigint not null references public.cars(id) on delete cascade,
  kind text not null check (kind in ('besiktning','plombering','alkotest')),
  due date not null,
  level smallint not null check (level between 1 and 3),
  sent_at timestamptz not null default now(),
  recipients int,
  primary key (car_id, kind, due, level)
);
revoke all on private.car_kontroll_notices from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.car_kontroll_check()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.cars; v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_kind text; v_due date; v_days int; v_lvl int; v_ins int; v_cnt int; v_n int := 0; v_body text; v_name text; v_car text;
begin
  for c in select * from public.cars where ur_trafik is null or ur_trafik > v_today order by bilnummer loop
    v_car := 'Bil ' || c.bilnummer || coalesce(' (' || nullif(btrim(c.regnr), '') || ')', '');
    foreach v_kind in array array['besiktning','plombering','alkotest'] loop
      v_due := case v_kind when 'besiktning' then private.car_kontroll_next(c.besiktning, c.besiktning_nasta)
                           when 'plombering' then private.car_kontroll_next(c.plombering, c.plombering_nasta)
                           else private.car_kontroll_next(c.alkotest, c.alkotest_nasta) end;
      continue when v_due is null;
      v_days := v_due - v_today;
      v_lvl := case when v_days < 0 then 3 when v_days <= 7 then 2 when v_days <= 30 then 1 else 0 end;
      continue when v_lvl = 0;
      insert into private.car_kontroll_notices (car_id, kind, due, level) values (c.id, v_kind, v_due, v_lvl)
        on conflict do nothing;
      get diagnostics v_ins = row_count;
      continue when v_ins = 0;   -- redan skickad
      -- Lägre nivåer räknas som klara (t.ex. datum inlagt 5 dagar före: bara 7-dagarsnotisen)
      insert into private.car_kontroll_notices (car_id, kind, due, level, recipients)
        select c.id, v_kind, v_due, g, 0 from generate_series(1, v_lvl - 1) g on conflict do nothing;
      v_name := case v_kind when 'besiktning' then 'Bilbesiktning' when 'plombering' then 'Plombering av taxametern' else 'Alkolås/alkotest' end;
      v_body := case when v_lvl = 3
        then '⛔ ' || v_car || ': ' || v_name || ' skulle ha gjorts senast ' || to_char(v_due, 'YYYY-MM-DD') || '. Datumet har passerat. Skriv in det nya datumet under Admin › Bilar när det är klart.'
        else '📋 ' || v_car || ': ' || v_name || ' ska göras senast ' || to_char(v_due, 'YYYY-MM-DD') || ' (om ' || v_days || case when v_days = 1 then ' dag' else ' dagar' end || ').' end;
      v_cnt := private.bil_notify_admins(coalesce(c.company_id, 'default'), 'bil_maint', v_body, null);
      update private.car_kontroll_notices set recipients = v_cnt
        where car_id = c.id and kind = v_kind and due = v_due and level = v_lvl;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $function$;
revoke all on function private.car_kontroll_check() from public, anon, authenticated;

-- Varje morgon 05:15 UTC (06:15 vintertid, 07:15 sommartid). Underhåll körs 05:00.
select cron.unschedule('taxikit-bil-kontroll') where exists (select 1 from cron.job where jobname = 'taxikit-bil-kontroll');
select cron.schedule('taxikit-bil-kontroll', '15 5 * * *', 'select private.car_kontroll_check()');

-- ===================== Del 2 =====================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onskemal-foton', 'onskemal-foton', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create table if not exists public.dev_wish_photos (
  id bigserial primary key,
  wish_id bigint not null references public.dev_wishes(id) on delete cascade,
  company_id text not null,
  path text not null unique,
  created_by text not null,
  uploaded boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists dev_wish_photos_wish_idx on public.dev_wish_photos (wish_id);
alter table public.dev_wish_photos enable row level security;   -- inga policyer: bara via funktionerna nedan
revoke all on public.dev_wish_photos from public, anon, authenticated;
drop trigger if exists zz_demo_write_guard on public.dev_wish_photos;
create trigger zz_demo_write_guard before insert or delete or update on public.dev_wish_photos
  for each statement execute function private.demo_write_guard();

-- Får se bilderna: den som skrev önskemålet och S admin.
CREATE OR REPLACE FUNCTION private.dev_wish_photo_ok(w dev_wishes, p_me text, p_cat text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ select w.author_id = p_me or private.norm_cat(p_cat) = 'superadmin' $function$;

-- dev_wish_json: som förut plus 'photos' (antal bilder) för den som får se dem.
CREATE OR REPLACE FUNCTION private.dev_wish_json(w dev_wishes, p_me text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('id', w.id, 'body', w.body, 'status', w.status, 'reply', w.reply,
    'created_at', w.created_at, 'updated_at', w.updated_at, 'mine', w.author_id = p_me,
    'author', (select nullif(btrim(coalesce(d.first_name, '') || ' ' || left(coalesce(d.last_name, ''), 1)), '')
                 from public.drivers d where d.id = w.author_id),
    'photos', case when private.dev_wish_photo_ok(w, p_me, (select d.category from public.drivers d where d.id = p_me))
                   then (select count(*) from public.dev_wish_photos p where p.wish_id = w.id and p.uploaded) end)
$function$;

CREATE OR REPLACE FUNCTION public.dev_wish_photo_begin(p_token text, p_wish_id bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; w public.dev_wishes; v_id bigint; v_path text;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  select * into w from public.dev_wishes where id = p_wish_id and company_id = a.company_id for update;
  if not found or not private.dev_wish_photo_ok(w, a.driver_id, a.category) then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.dev_wish_photos where wish_id = p_wish_id and not uploaded and created_at < now() - interval '1 hour';
  if (select count(*) from public.dev_wish_photos where wish_id = p_wish_id) >= 4 then raise exception 'too_many_photos' using errcode = '22023'; end if;
  v_path := a.company_id || '/' || p_wish_id || '/' || replace(gen_random_uuid()::text, '-', '') || '.jpg';
  insert into public.dev_wish_photos (wish_id, company_id, path, created_by) values (p_wish_id, a.company_id, v_path, a.driver_id) returning id into v_id;
  perform private.log(a.driver_id, a.category, 'dev_wish_photo_add', null, jsonb_build_object('id', w.id, 'text', left(w.body, 120)), a.via_master);
  return json_build_object('id', v_id, 'path', v_path);
end $function$;

CREATE OR REPLACE FUNCTION public.dev_wish_photo_finish(p_photo_id bigint, p_ok boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update public.dev_wish_photos set uploaded = true where id = p_photo_id and p_ok;
  delete from public.dev_wish_photos where id = p_photo_id and not p_ok;
$function$;

CREATE OR REPLACE FUNCTION public.dev_wish_photo_list(p_token text, p_wish_id bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; w public.dev_wishes;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from public.dev_wishes where id = p_wish_id and company_id = a.company_id;
  if not found or not private.dev_wish_photo_ok(w, a.driver_id, a.category) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return coalesce((select json_agg(json_build_object('id', id, 'path', path) order by id)
                     from public.dev_wish_photos where wish_id = p_wish_id and uploaded), '[]');
end $function$;

-- Ta bort en bild: den som skrev (medan önskemålet är Ny) eller S admin.
CREATE OR REPLACE FUNCTION public.dev_wish_photo_delete_svc(p_token text, p_photo_id bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a record; p public.dev_wish_photos; w public.dev_wishes;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  if private.is_demo() then raise exception 'demo_read_only' using errcode = '42501'; end if;
  select * into p from public.dev_wish_photos where id = p_photo_id and company_id = a.company_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into w from public.dev_wishes where id = p.wish_id;
  if not (private.norm_cat(a.category) = 'superadmin' or (w.author_id = a.driver_id and w.status = 'ny')) then
    raise exception 'not_editable' using errcode = '22023';
  end if;
  delete from public.dev_wish_photos where id = p_photo_id;
  perform private.log(a.driver_id, a.category, 'dev_wish_photo_delete', null, jsonb_build_object('id', w.id, 'text', left(w.body, 120)), a.via_master);
  return json_build_object('ok', true, 'path', p.path);
end $function$;

-- Ta bort önskemålet (samma regler som dev_wish_delete) och lämna sökvägarna så att edge-funktionen kan radera filerna.
CREATE OR REPLACE FUNCTION public.dev_wish_delete_svc(p_token text, p_id bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_paths text[];
begin
  select coalesce(array_agg(path), '{}') into v_paths from public.dev_wish_photos where wish_id = p_id;
  perform public.dev_wish_delete(p_token, p_id);   -- kontrollerar behörighet, tar bort (bilderna följer med) och loggar
  return json_build_object('ok', true, 'paths', to_json(v_paths));
end $function$;

revoke all on function public.dev_wish_photo_begin(text, bigint) from public, anon, authenticated;
revoke all on function public.dev_wish_photo_finish(bigint, boolean) from public, anon, authenticated;
revoke all on function public.dev_wish_photo_list(text, bigint) from public, anon, authenticated;
revoke all on function public.dev_wish_photo_delete_svc(text, bigint) from public, anon, authenticated;
revoke all on function public.dev_wish_delete_svc(text, bigint) from public, anon, authenticated;
grant execute on function public.dev_wish_photo_begin(text, bigint) to service_role;
grant execute on function public.dev_wish_photo_finish(bigint, boolean) to service_role;
grant execute on function public.dev_wish_photo_list(text, bigint) to service_role;
grant execute on function public.dev_wish_photo_delete_svc(text, bigint) to service_role;
grant execute on function public.dev_wish_delete_svc(text, bigint) to service_role;
