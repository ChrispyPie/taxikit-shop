-- t379u: Hämta ett äldre år från arkivet – bara när föraren själv trycker på knappen i appen.
-- INTE körd live förrän Christian säger "kör". Kräver 20261026k_arkiv_lagring.sql (körd 26 okt).
--
-- public.get_trip_archive_years(p_token) → [{ "year": 2025, "trips": 1234 }, …]  (litet svar, bara antal)
-- public.get_trip_archive(p_token, p_year) → samma format som get_trip_data ({ trips:[…], shifts:[…], … })
--   men bara för ETT år ur private.arkiv_trips / private.arkiv_shifts (dataset 'arkiv').
--
-- Samma behörighet och anonymisering som get_trip_data:
--   * ägaren: allt (med förar-id)
--   * private.company_view_roles(): allt, men andra förares id ersatt (prefix 'ap'/'an' i stället för
--     'p'/'n', så att de inte krockar med nycklarna från 'current' när appen lägger ihop dem)
--   * övriga: bara egen data. Demokonton har alltid kategori 'standard' och driver_id = private.demo_source()
--     via private.session_actor → förar-demot ser 710022:s arkiv (bara läsning), ägar-demot får heller
--     ingen åkeridata (kategori standard = bara 710022:s egna rader, som i current).
-- Additivt: två nya funktioner. Inga ALTER/DROP/ändringar av befintliga funktioner.

create or replace function public.get_trip_archive_years(p_token text)
returns json language plpgsql stable security definer
set search_path to 'pg_catalog', 'public' as $$
declare a record; v_cat text;
begin
  select * into a from private.session_actor(p_token);
  v_cat := coalesce(a.category, '');
  return coalesce((
    select json_agg(json_build_object('year', y, 'trips', n) order by y desc) from (
      select left(t.startdatum, 4)::int y, count(*) n from private.arkiv_trips t
       where t.dataset = 'arkiv' and t.startdatum ~ '^\d{4}-'
         and (v_cat = 'agare' or v_cat = any (private.company_view_roles()) or t.forar = a.driver_id)
       group by 1) x), '[]'::json);
end $$;

create or replace function public.get_trip_archive(p_token text, p_year int)
returns json language plpgsql stable security definer
set search_path to 'pg_catalog', 'public'
set work_mem to '32MB' as $$
declare a record; v_cat text; v_y text; v_meta jsonb; r json;
begin
  select * into a from private.session_actor(p_token);
  v_cat := coalesce(a.category, '');
  if p_year is null or p_year < 2000 or p_year > 2100 then raise exception 'bad_year' using errcode = '22023'; end if;
  v_y := p_year::text;
  v_meta := jsonb_build_object('arkiv', true, 'year', p_year,
    'arkiv_updated', (select updated_at from private.arkiv_datasets where name = 'arkiv'));
  if v_cat = 'agare' then
    select (v_meta || jsonb_build_object(
      'trips', coalesce((select jsonb_agg(t.data order by t.ord) from private.arkiv_trips t
                          where t.dataset = 'arkiv' and t.startdatum like v_y || '-%'), '[]'::jsonb),
      'shifts', coalesce((select jsonb_agg(s.data order by s.ord) from private.arkiv_shifts s
                          where s.dataset = 'arkiv' and left(s.start, 4) = v_y), '[]'::jsonb)
    ))::json into r;
  elsif v_cat = any (private.company_view_roles()) then
    with sh as materialized (
      select s.ord, s.data, coalesce(s.forar, s.data->>'forar') f,
             private.shift_ts(s.data->>'start') st, private.shift_ts(s.data->>'slut') en
        from private.arkiv_shifts s where s.dataset = 'arkiv' and left(s.start, 4) = v_y
    ), tr as materialized (
      select t.ord, t.data, coalesce(t.forar, t.data->>'forar') f,
             case when t.data->>'startdatum' ~ '^\d{4}-\d{2}-\d{2}$' and t.data->>'starttid' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                  then (t.data->>'startdatum' || ' ' || (t.data->>'starttid'))::timestamp end ts
        from private.arkiv_trips t where t.dataset = 'arkiv' and t.startdatum like v_y || '-%'
    ), shd as (
      select sh.ord, sh.f, sh.st, sh.en, d::date d
        from sh, generate_series(sh.st::date, sh.en::date, interval '1 day') d
       where sh.st is not null and sh.en is not null and sh.en >= sh.st and sh.en < sh.st + interval '7 days'
    ), m as (
      select distinct on (tr.ord) tr.ord, 'ap' || shd.ord k
        from tr join shd on shd.f = tr.f and shd.d = tr.ts::date and tr.ts between shd.st and shd.en
       where tr.ts is not null
       order by tr.ord, shd.ord
    ), trk as (
      select tr.ord, tr.data, tr.f, m.k from tr left join m on m.ord = tr.ord
    )
    select (v_meta || jsonb_build_object(
      'trips', coalesce((select jsonb_agg(case when trk.f = a.driver_id then trk.data || jsonb_build_object('forar', trk.f)
                                               else trk.data || jsonb_build_object('forar', coalesce(trk.k, 'an' || trk.ord)) end
                                          order by trk.ord) from trk), '[]'::jsonb),
      'shifts', coalesce((select jsonb_agg(case when sh.f = a.driver_id then sh.data || jsonb_build_object('forar', sh.f)
                                                else sh.data || jsonb_build_object('forar', 'ap' || sh.ord) end
                                           order by sh.ord) from sh), '[]'::jsonb)
    ))::json into r;
  else
    select (v_meta || jsonb_build_object(
      'trips', coalesce((select jsonb_agg(t.data order by t.ord) from private.arkiv_trips t
                          where t.dataset = 'arkiv' and t.forar = a.driver_id and t.startdatum like v_y || '-%'), '[]'::jsonb),
      'shifts', coalesce((select jsonb_agg(s.data order by s.ord) from private.arkiv_shifts s
                          where s.dataset = 'arkiv' and s.forar = a.driver_id and left(s.start, 4) = v_y), '[]'::jsonb)
    ))::json into r;
  end if;
  return r;
end $$;

revoke all on function public.get_trip_archive_years(text) from public;
revoke all on function public.get_trip_archive(text, int) from public;
grant execute on function public.get_trip_archive_years(text) to anon, authenticated;
grant execute on function public.get_trip_archive(text, int) to anon, authenticated;

-- Ångra:
-- drop function if exists public.get_trip_archive(text, int);
-- drop function if exists public.get_trip_archive_years(text);
