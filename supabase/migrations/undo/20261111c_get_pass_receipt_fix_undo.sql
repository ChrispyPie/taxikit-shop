-- Ångra 20261111c: återställ get_pass_receipt till kroppen från 20261111b.
-- Tar inte bort funktionen (den kom i 20261111b; den ångras av 20261111b_get_pass_receipt_undo.sql).

-- Passrapport: smal RPC som lämnar ut ETT körpass som den inloggade föraren får se,
-- plus tillåtna fält från private.pass_raw, resorna i passet och ev. resapost_raw.
-- Additivt: EN ny publik funktion. Inga ALTER/DROP av befintliga objekt.
-- Inga kunduppgifter. Saknade fält utelämnas. Förare ser egna pass; ägare och S admin åkeriets.
-- Ångra: supabase/migrations/undo/20261111b_get_pass_receipt_undo.sql

create or replace function public.get_pass_receipt(
  p_token text,
  p_passnr text,
  p_start text default null,
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
  v_pass text;
  v_start text;
  v_start_key text;
  v_shift jsonb := '{}'::jsonb;
  v_file jsonb := '{}'::jsonb;
  v_list jsonb := '{}'::jsonb;
  v_typed jsonb := '{}'::jsonb;
  v_car jsonb := '{}'::jsonb;
  v_trips jsonb := '[]'::jsonb;
  v_taxi text;
  r record;
  v_ps timestamp;
  v_pe timestamp;
begin
  select * into a from private.session_actor(p_token);
  v_pass := btrim(coalesce(p_passnr, ''));
  if v_pass = '' then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  v_forar := nullif(btrim(coalesce(p_forar, '')), '');
  if v_forar is null then
    v_forar := a.driver_id;
  end if;
  v_start := nullif(btrim(coalesce(p_start, '')), '');
  if v_forar is distinct from a.driver_id then
    if coalesce(a.category, '') not in ('agare', 'superadmin')
       or private.actor_company(v_forar) is distinct from private.actor_company(a.driver_id) then
      return json_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;

  v_start_key := left(regexp_replace(coalesce(v_start, ''), '\D', '', 'g'), 12);

  select s.data, s.forar, s.data->>'passnr', s.data->>'start'
    into r
    from public.shifts s
   where s.forar = v_forar
     and coalesce(s.passnr, s.data->>'passnr') = v_pass
     and (
       v_start is null
       or s.data->>'start' = v_start
       or left(regexp_replace(coalesce(s.data->>'start',''), '\D', '', 'g'), 12) = v_start_key
       or left(regexp_replace(coalesce(s.data->>'start',''), '\D', '', 'g'), 8) = left(v_start_key, 8)
     )
   order by case when s.dataset = 'current' then 0 else 1 end, s.ord
   limit 1;
  if r.data is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  v_shift := private.receipt_safe_map(r.data);
  v_forar := r.forar;
  v_pass := coalesce(nullif(r.data->>'passnr', ''), v_pass);
  v_start := coalesce(nullif(r.data->>'start', ''), v_start);
  v_start_key := left(regexp_replace(coalesce(v_start, ''), '\D', '', 'g'), 12);
  v_ps := private.shift_ts(r.data->>'start');
  v_pe := private.shift_ts(r.data->>'slut');

  if to_regclass('private.pass_raw') is not null then
    select jsonb_strip_nulls(jsonb_build_object(
             'TAXINR', p.file_row->>'TAXINR',
             'ARBPASSNR', p.file_row->>'ARBPASSNR',
             'ForarNr', p.file_row->>'ForarNr',
             'PassStart', p.file_row->>'PassStart',
             'PassSlut', p.file_row->>'PassSlut',
             'Ack_Inkort_tot_st', p.file_row->>'Ack_Inkort_tot_st',
             'Ack_Tot_km_tot_st', p.file_row->>'Ack_Tot_km_tot_st',
             'Ack_Taxi_km_tot_st', p.file_row->>'Ack_Taxi_km_tot_st',
             'Ack_Bet_km_tot_st', p.file_row->>'Ack_Bet_km_tot_st',
             'Ack_Dricks_tot_st', p.file_row->>'Ack_Dricks_tot_st',
             'Ack_Inkort_tot_sl', p.file_row->>'Ack_Inkort_tot_sl',
             'Ack_Tot_km_tot_sl', p.file_row->>'Ack_Tot_km_tot_sl',
             'Ack_Taxi_km_tot_sl', p.file_row->>'Ack_Taxi_km_tot_sl',
             'Ack_Bet_km_tot_sl', p.file_row->>'Ack_Bet_km_tot_sl',
             'Ack_Dricks_tot_sl', p.file_row->>'Ack_Dricks_tot_sl',
             'Antal_resor_i_passet', p.file_row->>'Antal_resor_i_passet',
             'InkortPass', p.file_row->>'InkortPass',
             'AntalPass', p.file_row->>'AntalPass',
             'TotKmPass', p.file_row->>'TotKmPass',
             'TaxiKmPass', p.file_row->>'TaxiKmPass',
             'BetKmPass', p.file_row->>'BetKmPass',
             'DricksPass', p.file_row->>'DricksPass',
             'KmBeforePass', p.file_row->>'KmBeforePass',
             'Rasttid_minuter', p.file_row->>'Rasttid_minuter',
             'NoLon', p.file_row->>'NoLon',
             'InaktivTid', p.file_row->>'InaktivTid'
           )),
           jsonb_strip_nulls(jsonb_build_object(
             'TaxiNr', p.list_row->>'TaxiNr',
             'PassNr', p.list_row->>'PassNr',
             'Förar ID', p.list_row->>'Förar ID',
             'Pass Start', p.list_row->>'Pass Start',
             'Pass Slut', p.list_row->>'Pass Slut',
             'Ant.resor', p.list_row->>'Ant.resor',
             'Rasttid', p.list_row->>'Rasttid',
             'Inaktiv tid', p.list_row->>'Inaktiv tid',
             'Arbetad tid', p.list_row->>'Arbetad tid',
             'Aktiv tid körpass', p.list_row->>'Aktiv tid körpass'
           )),
           jsonb_strip_nulls(jsonb_build_object(
             'taxi', p.taxi,
             'pass_start', p.pass_start,
             'pass_slut', p.pass_slut,
             'antal_resor', p.antal_resor,
             'inkort', p.inkort,
             'tot_km', p.tot_km,
             'taxi_km', p.taxi_km,
             'bet_km', p.bet_km,
             'dricks', p.dricks,
             'rasttid_min', p.rasttid_min,
             'nolon', p.nolon,
             'inaktiv_min', p.inaktiv_min
           ))
      into v_file, v_list, v_typed
      from private.pass_raw p
     where p.forar = v_forar
       and p.arbpassnr = v_pass
       and (
         v_start_key is null or v_start_key = ''
         or p.start_key = v_start_key
         or p.start_key = left(v_start_key, 12)
         or left(p.start_key, 8) = left(v_start_key, 8)
       )
     order by case when p.start_key = v_start_key then 0 else 1 end, p.updated_at desc nulls last
     limit 1;
  end if;

  v_taxi := coalesce(nullif(btrim(v_shift->>'taxi'), ''), nullif(btrim(v_typed->>'taxi'), ''), nullif(btrim(v_file->>'TAXINR'), ''));
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

  -- Resor i passets tidsfönster (samma koppling som Körpassdata).
  if v_ps is not null and v_pe is not null then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'trip', private.receipt_safe_map(t.data),
             'raw', (
               select private.receipt_safe_map(jsonb_strip_nulls(jsonb_build_object(
                        'BOOKNR', raw->>'BOOKNR',
                        'MOMSTYP', raw->>'MOMSTYP',
                        'DRICKS', raw->>'DRICKS',
                        'RESTID', raw->>'RESTID',
                        'KILOMETER', raw->>'KILOMETER',
                        'KREDITTYP', raw->>'KREDITTYP',
                        'TAXAMETERBELOPP', raw->>'TAXAMETERBELOPP',
                        'DEBITERAS', raw->>'DEBITERAS',
                        'DAT_START', raw->>'DAT_START',
                        'TID_START', raw->>'TID_START',
                        'DAT_SLUT', raw->>'DAT_SLUT',
                        'TID_SLUT', raw->>'TID_SLUT',
                        'TABELL', raw->>'TABELL'
                      )))
                 from private.resapost_raw rr
                where rr.kvittonr = t.kvittonr and rr.forar = t.forar
                order by rr.updated_at desc nulls last
                limit 1
             )
           )) order by t.ord), '[]'::jsonb)
      into v_trips
      from public.trips t
     where t.forar = v_forar
       and t.data->>'startdatum' is not null
       and t.data->>'starttid' is not null
       and (t.data->>'startdatum' || 'T' || t.data->>'starttid')::timestamp >= v_ps
       and (t.data->>'startdatum' || 'T' || t.data->>'starttid')::timestamp <= v_pe;
  end if;

  return private.demo_mask(jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'passnr', v_pass,
    'forar', v_forar,
    'start', v_start,
    'shift', nullif(v_shift, '{}'::jsonb),
    'file', nullif(coalesce(v_file, '{}'::jsonb), '{}'::jsonb),
    'list', nullif(coalesce(v_list, '{}'::jsonb), '{}'::jsonb),
    'raw', nullif(coalesce(v_typed, '{}'::jsonb), '{}'::jsonb),
    'car', nullif(coalesce(v_car, '{}'::jsonb), '{}'::jsonb),
    'trips', nullif(coalesce(v_trips, '[]'::jsonb), '[]'::jsonb)
  )));
end
$$;

revoke all on function public.get_pass_receipt(text, text, text, text) from public;
grant execute on function public.get_pass_receipt(text, text, text, text) to anon, authenticated;
