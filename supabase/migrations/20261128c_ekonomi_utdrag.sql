-- Ekonomi › Resultat (utkast, EJ applicerad): månadsutdrag för bränsle/el.
-- Filen sparas i private.ekonomi_utdrag (bytea). RLS på, ingen policy. Bara ägare + superadmin, ej demo, bara eget åkeri.
-- CSV-tolkning sker i appen; servern sparar fil + ev. föreslagen summa. Bekräftelse skapar en kostnad (kategori bransle).
-- Ångra: supabase/migrations/undo/20261128c_ekonomi_utdrag_undo.sql

create table if not exists private.ekonomi_utdrag (
  id bigint generated always as identity primary key,
  company_id text not null,
  typ text not null default 'bransle' check (typ = 'bransle'),
  mon date not null,
  filnamn text not null check (length(btrim(filnamn)) between 1 and 120),
  mime text not null check (mime in (
    'text/csv', 'text/plain', 'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  innehall bytea not null,
  storlek int not null check (storlek > 0 and storlek <= 8388608),
  parsad_summa numeric(12, 2),
  parsad jsonb,
  status text not null default 'foreslagen' check (status in ('foreslagen', 'bekraftad')),
  kostnad_id bigint,
  skapad_av text,
  skapad timestamptz not null default now(),
  borttagen timestamptz
);
create index if not exists ekonomi_utdrag_co on private.ekonomi_utdrag (company_id, mon) where borttagen is null;
alter table private.ekonomi_utdrag enable row level security;
revoke all on private.ekonomi_utdrag from public, anon, authenticated;

-- Utökad lista: samma som förut + utdrag (utan filinnehåll).
create or replace function private.ekonomi_kostnader(p_company text)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select jsonb_build_object(
    'manuella', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'kategori', k.kategori, 'namn', k.namn, 'belopp', k.belopp,
        'moms_pct', k.moms_pct, 'typ', k.typ, 'fran', k.fran, 'till', k.till, 'bil', k.bil, 'anteckning', k.anteckning) order by k.fran, k.id)
        from private.ekonomi_kostnad k where k.company_id = p_company and k.borttagen is null), '[]'::jsonb),
    'bilar', coalesce((select jsonb_agg(jsonb_build_object('bilnummer', c.bilnummer, 'modell', c.modell, 'bildtyp', c.bildtyp,
        'i_trafik', c.i_trafik, 'ur_trafik', c.ur_trafik,
        'inkopspris', c.inkopspris, 'livslangd_ar', c.livslangd_ar, 'rantor_ar', c.rantor_ar, 'skatt_ar', c.skatt_ar, 'service_ar', c.service_ar,
        'taxiavg_ar', c.taxiavg_ar, 'forsakring_ar', c.forsakring_ar, 'tvatt_ar', c.tvatt_ar) order by c.bilnummer) from public.cars c), '[]'::jsonb),
    'utdrag', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'typ', u.typ, 'mon', u.mon, 'filnamn', u.filnamn, 'mime', u.mime,
        'storlek', u.storlek, 'parsad_summa', u.parsad_summa, 'parsad', u.parsad, 'status', u.status, 'kostnad_id', u.kostnad_id, 'skapad', u.skapad)
        order by u.mon desc, u.id desc)
        from private.ekonomi_utdrag u where u.company_id = p_company and u.borttagen is null), '[]'::jsonb))
$function$;
revoke all on function private.ekonomi_kostnader(text) from public, anon, authenticated;

create or replace function messaging_private.ekonomi_utdrag_ladda(p_token text, p_mon date, p_filnamn text, p_mime text, p_base64 text, p_forslag numeric, p_parsad jsonb)
 returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_co text := private.ekonomi_actor(p_token); a record; r private.ekonomi_utdrag; b bytea; n int;
begin
  select * into a from private.bil_actor(p_token);
  if p_mon is null or p_filnamn is null or p_mime is null or p_base64 is null then raise exception 'invalid_cost' using errcode = '22023'; end if;
  begin
    b := decode(p_base64, 'base64');
  exception when others then raise exception 'invalid_cost' using errcode = '22023'; end;
  n := length(b);
  if n is null or n = 0 or n > 8388608 then raise exception 'invalid_cost' using errcode = '22023'; end if;
  begin
    insert into private.ekonomi_utdrag (company_id, mon, filnamn, mime, innehall, storlek, parsad_summa, parsad, skapad_av)
    values (v_co, date_trunc('month', p_mon)::date, btrim(p_filnamn), p_mime, b, n, p_forslag, p_parsad, a.driver_id)
    returning * into r;
  exception when check_violation or not_null_violation or invalid_datetime_format then
    raise exception 'invalid_cost' using errcode = '22023';
  end;
  perform private.log(a.driver_id, a.category, 'ekonomi_utdrag', v_co, jsonb_build_object('id', r.id, 'filnamn', r.filnamn, 'storlek', r.storlek, 'mon', r.mon), a.via_master);
  return jsonb_build_object('id', r.id, 'mon', r.mon, 'filnamn', r.filnamn, 'mime', r.mime, 'storlek', r.storlek,
    'parsad_summa', r.parsad_summa, 'parsad', r.parsad, 'status', r.status);
end $function$;

create or replace function messaging_private.ekonomi_utdrag_hamta(p_token text, p_id bigint)
 returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_co text := private.ekonomi_actor(p_token); r private.ekonomi_utdrag;
begin
  select * into r from private.ekonomi_utdrag where id = p_id and company_id = v_co and borttagen is null;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', r.id, 'filnamn', r.filnamn, 'mime', r.mime, 'storlek', r.storlek, 'base64', encode(r.innehall, 'base64'));
end $function$;

create or replace function messaging_private.ekonomi_utdrag_ta_bort(p_token text, p_id bigint)
 returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_co text := private.ekonomi_actor(p_token); a record; n int;
begin
  select * into a from private.bil_actor(p_token);
  update private.ekonomi_utdrag set borttagen = now(), innehall = '\x'::bytea, storlek = 0
   where id = p_id and company_id = v_co and borttagen is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log(a.driver_id, a.category, 'ekonomi_utdrag_bort', v_co, jsonb_build_object('id', p_id), a.via_master);
  return jsonb_build_object('ok', true);
end $function$;

create or replace function messaging_private.ekonomi_utdrag_bekrafta(p_token text, p_id bigint, p_belopp numeric, p_moms_pct numeric)
 returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_co text := private.ekonomi_actor(p_token); a record; u private.ekonomi_utdrag; k private.ekonomi_kostnad;
  v_moms numeric := coalesce(p_moms_pct, 25);
begin
  select * into a from private.bil_actor(p_token);
  if p_belopp is null or p_belopp < 0 or p_belopp > 100000000 then raise exception 'invalid_cost' using errcode = '22023'; end if;
  if v_moms not in (0, 6, 12, 25) then raise exception 'invalid_cost' using errcode = '22023'; end if;
  select * into u from private.ekonomi_utdrag where id = p_id and company_id = v_co and borttagen is null;
  if u.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if u.kostnad_id is not null then
    update private.ekonomi_kostnad set belopp = p_belopp, moms_pct = v_moms, andrad = now()
     where id = u.kostnad_id and company_id = v_co and borttagen is null returning * into k;
  end if;
  if k.id is null then
    insert into private.ekonomi_kostnad (company_id, kategori, namn, belopp, moms_pct, typ, fran, till, anteckning, skapad_av)
    values (v_co, 'bransle', 'Bränsle och el', p_belopp, v_moms, 'engang', u.mon,
            (u.mon + interval '1 month')::date - 1, 'Från utdrag ' || u.filnamn, a.driver_id)
    returning * into k;
  end if;
  update private.ekonomi_utdrag set status = 'bekraftad', parsad_summa = p_belopp, kostnad_id = k.id
   where id = u.id;
  perform private.log(a.driver_id, a.category, 'ekonomi_utdrag_bekrafta', v_co, jsonb_build_object('id', u.id, 'kostnad_id', k.id, 'belopp', p_belopp), a.via_master);
  return jsonb_build_object('ok', true, 'kostnad_id', k.id, 'belopp', k.belopp);
end $function$;

revoke all on function messaging_private.ekonomi_utdrag_ladda(text, date, text, text, text, numeric, jsonb),
  messaging_private.ekonomi_utdrag_hamta(text, bigint), messaging_private.ekonomi_utdrag_ta_bort(text, bigint),
  messaging_private.ekonomi_utdrag_bekrafta(text, bigint, numeric, numeric) from public;
grant execute on function messaging_private.ekonomi_utdrag_ladda(text, date, text, text, text, numeric, jsonb),
  messaging_private.ekonomi_utdrag_hamta(text, bigint), messaging_private.ekonomi_utdrag_ta_bort(text, bigint),
  messaging_private.ekonomi_utdrag_bekrafta(text, bigint, numeric, numeric) to anon, authenticated;

create or replace function public.ekonomi_utdrag_ladda(p_token text, p_mon date, p_filnamn text, p_mime text, p_base64 text, p_forslag numeric, p_parsad jsonb) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.ekonomi_utdrag_ladda(p_token, p_mon, p_filnamn, p_mime, p_base64, p_forslag, p_parsad) $$;
create or replace function public.ekonomi_utdrag_hamta(p_token text, p_id bigint) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.ekonomi_utdrag_hamta(p_token, p_id) $$;
create or replace function public.ekonomi_utdrag_ta_bort(p_token text, p_id bigint) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.ekonomi_utdrag_ta_bort(p_token, p_id) $$;
create or replace function public.ekonomi_utdrag_bekrafta(p_token text, p_id bigint, p_belopp numeric, p_moms_pct numeric) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.ekonomi_utdrag_bekrafta(p_token, p_id, p_belopp, p_moms_pct) $$;
revoke all on function public.ekonomi_utdrag_ladda(text, date, text, text, text, numeric, jsonb),
  public.ekonomi_utdrag_hamta(text, bigint), public.ekonomi_utdrag_ta_bort(text, bigint),
  public.ekonomi_utdrag_bekrafta(text, bigint, numeric, numeric) from public;
grant execute on function public.ekonomi_utdrag_ladda(text, date, text, text, text, numeric, jsonb),
  public.ekonomi_utdrag_hamta(text, bigint), public.ekonomi_utdrag_ta_bort(text, bigint),
  public.ekonomi_utdrag_bekrafta(text, bigint, numeric, numeric) to anon, authenticated;
