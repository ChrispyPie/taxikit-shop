-- Kvittokopia: smal RPC som lämnar ut EN resa som den inloggade föraren får se,
-- plus tillåtna råfält från private.resapost_raw och private.trip_scrape_raw.
-- Additivt: EN ny publik funktion + en liten privat hjälpare. Inga ALTER/DROP.
-- Inga kunduppgifter (namn, telefon, kort, adress, e-post). Saknade fält utelämnas.
-- Förare ser bara egna resor. Ägare och S admin ser åkeriets resor (samma regel som Körpassdata).
-- Ångra: supabase/migrations/undo/20261111a_get_trip_receipt_undo.sql

-- Hjälpare: behåll bara nycklar som rör resa/taxa/betalning, aldrig kundliknande namn.
create or replace function private.receipt_safe_map(p jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $$
  with kv as (
    select key, value
      from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end)
     where key <> '_dropped'
  ), ok as (
    select key, value from kv
     where key ~* '(kvitto|booknr|bokn|taxi|regn|forar|zon|start|slut|tid|km|kilo|restid|belopp|taxameter|debiter|kredittyp|moms|netto|eur|euro|valuta|taxa|kmdeb|tideb|adm|avgift|palagg|extra|egenavg|dricks|tabell|version|ordinar|startavg)'
       and key !~* '(kund|namn|name|tel|mobil|phone|adress|address|gata|street|postnr|postort|zip|card|kortnr|kortnum|kreditkort|betalkort|emvref|medlem|member|e-?post|mail|personn|resen|passag|bestall|beställ|kommentar|meddel|notering|note|fritext)'
       and jsonb_typeof(value) in ('string', 'number', 'boolean')
       and value is not null
       and value <> '""'::jsonb
       and value <> 'null'::jsonb
       and (jsonb_typeof(value) <> 'string' or (
             length(btrim(value #>> '{}')) > 0
         and length(btrim(value #>> '{}')) < 80
         and value #>> '{}' !~ '@'
       ))
  )
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from ok
$$;

revoke all on function private.receipt_safe_map(jsonb) from public, anon, authenticated;

create or replace function public.get_trip_receipt(
  p_token text,
  p_kvittonr text,
  p_startdatum text default null,
  p_forar text default null
)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_forar text;
  v_kvitto text;
  v_start text;
  v_trip jsonb;
  v_raw jsonb := '{}'::jsonb;
  v_detail jsonb := '{}'::jsonb;
  v_list jsonb := '{}'::jsonb;
  v_car jsonb := '{}'::jsonb;
  v_taxi text;
  r record;
begin
  select * into a from private.session_actor(p_token);
  v_kvitto := btrim(coalesce(p_kvittonr, ''));
  if v_kvitto = '' then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  v_forar := nullif(btrim(coalesce(p_forar, '')), '');
  if v_forar is null then
    v_forar := a.driver_id;
  end if;
  v_start := nullif(btrim(coalesce(p_startdatum, '')), '');

  -- Samma synlighet som Körpassdata: egna resor, eller åkeriets för ägare/S admin.
  if v_forar is distinct from a.driver_id then
    if coalesce(a.category, '') not in ('agare', 'superadmin')
       or private.actor_company(v_forar) is distinct from private.actor_company(a.driver_id) then
      return json_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;

  -- Hitta resan: current först, sedan övriga dataset, ersatta kvitton, arkiv.
  select t.data, t.forar, t.kvittonr, t.startdatum
    into r
    from (
      select data, forar, kvittonr, startdatum, 0 pri
        from public.trips
       where kvittonr = v_kvitto and forar = v_forar
         and (v_start is null or startdatum = v_start or coalesce(data->>'startdatum','') = v_start)
       order by case when dataset = 'current' then 0 else 1 end, ord
       limit 1
    ) t;
  if r.data is null then
    select e.data, e.forar, e.kvittonr, e.startdatum
      into r
      from private.ersatta_kvitton e
     where e.kvittonr = v_kvitto and e.forar = v_forar
       and (v_start is null or e.startdatum = v_start)
     order by e.startdatum desc
     limit 1;
  end if;
  if r.data is null and to_regclass('private.arkiv_trips') is not null then
    select t.data, t.forar, t.kvittonr, t.startdatum
      into r
      from private.arkiv_trips t
     where t.kvittonr = v_kvitto and t.forar = v_forar
       and (v_start is null or t.startdatum = v_start or coalesce(t.data->>'startdatum','') = v_start)
     order by t.ord
     limit 1;
  end if;
  if r.data is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  v_trip := r.data;
  v_forar := r.forar;
  v_kvitto := r.kvittonr;
  v_start := coalesce(nullif(r.startdatum, ''), v_trip->>'startdatum', v_start);

  -- Tillåtna kolumner från månadsfilen (aldrig medlemsnr/emv-ref).
  select private.receipt_safe_map(jsonb_strip_nulls(jsonb_build_object(
           'BOOKNR', raw->>'BOOKNR',
           'MOMSTYP', raw->>'MOMSTYP',
           'EGENAVGIFT', raw->>'EGENAVGIFT',
           'PALAGG', raw->>'PALAGG',
           'EXTRA', raw->>'EXTRA',
           'TAXAMETERBELOPP', raw->>'TAXAMETERBELOPP',
           'DEBITERAS', raw->>'DEBITERAS',
           'DRICKS', raw->>'DRICKS',
           'RESTID', raw->>'RESTID',
           'KILOMETER', raw->>'KILOMETER',
           'KREDITTYP', raw->>'KREDITTYP',
           'STARTZON', raw->>'STARTZON',
           'SLUTZON', raw->>'SLUTZON',
           'TAXINR', raw->>'TAXINR',
           'DAT_START', raw->>'DAT_START',
           'TID_START', raw->>'TID_START',
           'DAT_SLUT', raw->>'DAT_SLUT',
           'TID_SLUT', raw->>'TID_SLUT',
           'TABELL', raw->>'TABELL',
           'ARBPASSNR', raw->>'ARBPASSNR'
         )))
    into v_raw
    from private.resapost_raw
   where kvittonr = v_kvitto and forar = v_forar
     and (v_start is null
          or (length(dat_start) >= 8 and (substr(dat_start,1,4)||'-'||substr(dat_start,5,2)||'-'||substr(dat_start,7,2)) = v_start)
          or dat_start = replace(v_start, '-', ''))
   order by updated_at desc nulls last
   limit 1;

  if to_regclass('private.trip_scrape_raw') is not null then
    select private.receipt_safe_map(s.detail), private.receipt_safe_map(s.list_row)
      into v_detail, v_list
      from private.trip_scrape_raw s
     where s.forar = v_forar and s.kvittonr = v_kvitto
       and (v_start is null or s.startdatum = v_start or s.startdatum = 'nodate')
     order by case when s.startdatum = v_start then 0 else 1 end, s.updated_at desc nulls last
     limit 1;
  end if;

  v_taxi := coalesce(nullif(btrim(v_trip->>'taxi'), ''), nullif(btrim(v_raw->>'TAXINR'), ''));
  if v_taxi is not null then
    select jsonb_strip_nulls(jsonb_build_object(
             'bilnummer', c.bilnummer,
             'regnr', nullif(btrim(c.regnr), '')
           ))
      into v_car
      from public.cars c
     where upper(replace(btrim(c.bilnummer), ' ', '')) in (
             upper(replace(v_taxi, ' ', '')),
             upper(replace(regexp_replace(v_taxi, '^[A-Za-z]', ''), ' ', ''))
           )
        or upper(replace(btrim(coalesce(c.regnr,'')), ' ', '')) = upper(replace(v_taxi, ' ', ''))
     limit 1;
  end if;

  return private.demo_mask(jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'kvittonr', v_kvitto,
    'forar', v_forar,
    'startdatum', v_start,
    'trip', private.receipt_safe_map(v_trip),
    'raw', nullif(v_raw, '{}'::jsonb),
    'detail', nullif(coalesce(v_detail, '{}'::jsonb), '{}'::jsonb),
    'list', nullif(coalesce(v_list, '{}'::jsonb), '{}'::jsonb),
    'car', nullif(coalesce(v_car, '{}'::jsonb), '{}'::jsonb)
  )));
end
$$;

revoke all on function public.get_trip_receipt(text, text, text, text) from public;
grant execute on function public.get_trip_receipt(text, text, text, text) to anon, authenticated;
