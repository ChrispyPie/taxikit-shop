-- Ekonomi › Resultat (utkast, EJ applicerad i prod): kostnadstabell för det som inte finns i TaxiData i dag.
-- Se docs/ekonomi/PLAN-resultat.md. Bara nya objekt, inget befintligt ändras.
-- Behörighet som ekonomi_period: bara ägare + superadmin, ej demo, bara det egna åkeriet. RLS på, ingen policy
-- (anon/authenticated når inte tabellen direkt, bara via SECURITY DEFINER-funktionerna nedan).
-- Ångra: supabase/migrations/undo/20261128b_ekonomi_resultat_undo.sql

create table if not exists private.ekonomi_kostnad (
  id bigint generated always as identity primary key,
  company_id text not null,
  kategori text not null check (kategori in ('bil', 'bransle', 'lokal', 'forsakring', 'administration', 'skador', 'avgift', 'ovrigt')),
  namn text not null check (length(btrim(namn)) between 1 and 80),
  belopp numeric(12, 2) not null check (belopp >= 0 and belopp <= 100000000),   -- exkl. moms
  moms_pct numeric(4, 1) not null default 25 check (moms_pct in (0, 6, 12, 25)),
  typ text not null check (typ in ('engang', 'manad', 'ar')),
  fran date not null,
  till date,
  bil text check (bil is null or length(bil) <= 20),
  anteckning text check (anteckning is null or length(anteckning) <= 300),
  skapad_av text, skapad timestamptz not null default now(),
  andrad timestamptz not null default now(), borttagen timestamptz,
  check (till is null or till >= fran)
);
create index if not exists ekonomi_kostnad_co on private.ekonomi_kostnad (company_id, fran) where borttagen is null;
alter table private.ekonomi_kostnad enable row level security;
revoke all on private.ekonomi_kostnad from public, anon, authenticated;

-- Allt som Resultat behöver utöver fas 1 och 2: manuella poster + bilarnas årskostnader (public.cars, ifyllda under Bilar).
create or replace function private.ekonomi_kostnader(p_company text)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select jsonb_build_object(
    'manuella', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'kategori', k.kategori, 'namn', k.namn, 'belopp', k.belopp,
        'moms_pct', k.moms_pct, 'typ', k.typ, 'fran', k.fran, 'till', k.till, 'bil', k.bil, 'anteckning', k.anteckning) order by k.fran, k.id)
        from private.ekonomi_kostnad k where k.company_id = p_company and k.borttagen is null), '[]'::jsonb),
    'bilar', coalesce((select jsonb_agg(jsonb_build_object('bilnummer', c.bilnummer, 'i_trafik', c.i_trafik, 'ur_trafik', c.ur_trafik,
        'inkopspris', c.inkopspris, 'livslangd_ar', c.livslangd_ar, 'rantor_ar', c.rantor_ar, 'skatt_ar', c.skatt_ar, 'service_ar', c.service_ar,
        'taxiavg_ar', c.taxiavg_ar, 'forsakring_ar', c.forsakring_ar, 'tvatt_ar', c.tvatt_ar) order by c.bilnummer) from public.cars c), '[]'::jsonb))
$function$;
revoke all on function private.ekonomi_kostnader(text) from public, anon, authenticated;

create or replace function private.ekonomi_actor(p_token text) returns text
 language plpgsql stable security definer set search_path = '' as $function$
declare a record;
begin
  select * into a from private.bil_actor(p_token);
  if a.category is null or a.category not in ('agare', 'superadmin') or private.is_demo() then
    raise exception 'forbidden' using errcode = '42501'; end if;
  return a.company_id;
end $function$;
revoke all on function private.ekonomi_actor(text) from public, anon, authenticated;

create or replace function messaging_private.ekonomi_kostnader(p_token text) returns jsonb
 language sql security definer set search_path = '' as $$ select private.ekonomi_kostnader(private.ekonomi_actor(p_token)) $$;

create or replace function messaging_private.ekonomi_kostnad_spara(p_token text, p_id bigint, p jsonb) returns jsonb
 language plpgsql security definer set search_path = '' as $function$
declare v_co text := private.ekonomi_actor(p_token); a record; r private.ekonomi_kostnad;
begin
  select * into a from private.bil_actor(p_token);
  begin
    if p_id is null then
      insert into private.ekonomi_kostnad (company_id, kategori, namn, belopp, moms_pct, typ, fran, till, bil, anteckning, skapad_av)
      values (v_co, p->>'kategori', btrim(p->>'namn'), (p->>'belopp')::numeric, coalesce((p->>'moms_pct')::numeric, 25), p->>'typ',
              (p->>'fran')::date, nullif(p->>'till', '')::date, nullif(btrim(p->>'bil'), ''), nullif(btrim(p->>'anteckning'), ''), a.driver_id)
      returning * into r;
    else
      update private.ekonomi_kostnad set kategori = p->>'kategori', namn = btrim(p->>'namn'), belopp = (p->>'belopp')::numeric,
        moms_pct = coalesce((p->>'moms_pct')::numeric, 25), typ = p->>'typ', fran = (p->>'fran')::date, till = nullif(p->>'till', '')::date,
        bil = nullif(btrim(p->>'bil'), ''), anteckning = nullif(btrim(p->>'anteckning'), ''), andrad = now()
       where id = p_id and company_id = v_co and borttagen is null returning * into r;
      if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    end if;
  exception when check_violation or invalid_text_representation or not_null_violation or invalid_datetime_format then
    raise exception 'invalid_cost' using errcode = '22023';
  end;
  perform private.log(a.driver_id, a.category, 'ekonomi_kostnad', v_co, jsonb_build_object('id', r.id, 'namn', r.namn, 'belopp', r.belopp, 'typ', r.typ), a.via_master);
  return to_jsonb(r) - 'company_id' - 'skapad_av';
end $function$;

create or replace function messaging_private.ekonomi_kostnad_ta_bort(p_token text, p_id bigint) returns jsonb
 language plpgsql security definer set search_path = '' as $function$
declare v_co text := private.ekonomi_actor(p_token); a record; n int;
begin
  select * into a from private.bil_actor(p_token);
  update private.ekonomi_kostnad set borttagen = now() where id = p_id and company_id = v_co and borttagen is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log(a.driver_id, a.category, 'ekonomi_kostnad_bort', v_co, jsonb_build_object('id', p_id), a.via_master);
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function messaging_private.ekonomi_kostnader(text), messaging_private.ekonomi_kostnad_spara(text, bigint, jsonb),
  messaging_private.ekonomi_kostnad_ta_bort(text, bigint) from public;
grant execute on function messaging_private.ekonomi_kostnader(text), messaging_private.ekonomi_kostnad_spara(text, bigint, jsonb),
  messaging_private.ekonomi_kostnad_ta_bort(text, bigint) to anon, authenticated;

create or replace function public.ekonomi_kostnader(p_token text) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.ekonomi_kostnader(p_token) $$;
create or replace function public.ekonomi_kostnad_spara(p_token text, p_id bigint, p jsonb) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.ekonomi_kostnad_spara(p_token, p_id, p) $$;
create or replace function public.ekonomi_kostnad_ta_bort(p_token text, p_id bigint) returns jsonb
 language sql security invoker set search_path = '' as $$ select messaging_private.ekonomi_kostnad_ta_bort(p_token, p_id) $$;
revoke all on function public.ekonomi_kostnader(text), public.ekonomi_kostnad_spara(text, bigint, jsonb), public.ekonomi_kostnad_ta_bort(text, bigint) from public;
grant execute on function public.ekonomi_kostnader(text), public.ekonomi_kostnad_spara(text, bigint, jsonb), public.ekonomi_kostnad_ta_bort(text, bigint) to anon, authenticated;
