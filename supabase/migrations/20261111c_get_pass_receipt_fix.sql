-- Rättar get_pass_receipt: tidsjämförelsen (data->>'startdatum' || 'T' || data->>'starttid')
-- parsas av PostgreSQL som text ->> på grund av att || binder tätare än ->>, så anropet
-- kraschade och appen visade "Kunde inte hämta passrapporten." Samma signatur, bara kroppen.
-- Additivt: CREATE OR REPLACE av befintlig funktion. Inga DROP av andra objekt.
-- Ångra: supabase/migrations/undo/20261111c_get_pass_receipt_fix_undo.sql
-- (återställer kroppen från 20261111b).

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
  v_shift_data jsonb;
  v_shift_forar text;
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

  select s.data, s.forar
    into v_shift_data, v_shift_forar
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
  if v_shift_data is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  v_shift := private.receipt_safe_map(v_shift_data);
  v_forar := v_shift_forar;
  v_pass := coalesce(nullif(v_shift_data->>'passnr', ''), v_pass);
  v_start := coalesce(nullif(v_shift_data->>'start', ''), v_start);
  v_start_key := left(regexp_replace(coalesce(v_start, ''), '\D', '', 'g'), 12);
  v_ps := private.shift_ts(v_shift_data->>'start');
  v_pe := private.shift_ts(v_shift_data->>'slut');

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

  -- Resor i passets tidsfönster. Parenteser kring ->> krävs: annars binder ||
  -- tätare än ->> och PostgreSQL kastar "operator does not exist: text ->> unknown".
  if v_ps is not null and v_pe is not null then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'trip', private.receipt_safe_map(trip_row.data),
             'raw', (
               select private.receipt_safe_map(jsonb_strip_nulls(jsonb_build_object(
                        'BOOKNR', rr.raw->>'BOOKNR',
                        'MOMSTYP', rr.raw->>'MOMSTYP',
                        'DRICKS', rr.raw->>'DRICKS',
                        'RESTID', rr.raw->>'RESTID',
                        'KILOMETER', rr.raw->>'KILOMETER',
                        'KREDITTYP', rr.raw->>'KREDITTYP',
                        'TAXAMETERBELOPP', rr.raw->>'TAXAMETERBELOPP',
                        'DEBITERAS', rr.raw->>'DEBITERAS',
                        'DAT_START', rr.raw->>'DAT_START',
                        'TID_START', rr.raw->>'TID_START',
                        'DAT_SLUT', rr.raw->>'DAT_SLUT',
                        'TID_SLUT', rr.raw->>'TID_SLUT',
                        'TABELL', rr.raw->>'TABELL'
                      )))
                 from private.resapost_raw rr
                where rr.kvittonr = trip_row.kvittonr and rr.forar = trip_row.forar
                order by rr.updated_at desc nulls last
                limit 1
             )
           )) order by trip_row.ord), '[]'::jsonb)
      into v_trips
      from public.trips trip_row
     where trip_row.forar = v_forar
       and trip_row.data->>'startdatum' is not null
       and trip_row.data->>'starttid' is not null
       and trip_row.data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$'
       and trip_row.data->>'starttid' ~ '^\d{1,2}:\d{2}'
       and ((trip_row.data->>'startdatum') || 'T' || (trip_row.data->>'starttid'))::timestamp >= v_ps
       and ((trip_row.data->>'startdatum') || 'T' || (trip_row.data->>'starttid'))::timestamp <= v_pe;
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
exception when others then
  return json_build_object('ok', false, 'error', 'fetch_failed');
end
$$;

revoke all on function public.get_pass_receipt(text, text, text, text) from public;
grant execute on function public.get_pass_receipt(text, text, text, text) to anon, authenticated;
