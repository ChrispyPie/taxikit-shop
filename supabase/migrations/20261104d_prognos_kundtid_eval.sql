-- 20261104d: Prognostid = utskick eller kundens tid? Bara S admin. Påverkar inte förarnas vy, notiser eller prognos-sync.
--  * private.prognos_kundtid_cfg: offset per zon (min) för testvyn "kundtid" (293 = 0, övriga 10). Ändras i S admin.
--  * private.prognos_truth: verifierade fall (prognostid, beställd tid, när bilen fick bokningen). Seed: 06475.
--  * public.sadmin_kundtid_get / sadmin_kundtid_set / sadmin_truth_add / sadmin_prognos_kundtid_eval (require_sadmin, loggas).
--  Landvetter (293) styrs manuellt efter flygen och redovisas för sig. Stan redovisas samlat och per zon.
-- Ångra: supabase/migrations/undo/20261104d_prognos_kundtid_eval_undo.sql

create table if not exists private.prognos_kundtid_cfg (
  zone_id text primary key,
  offset_min int not null check (offset_min between 0 and 45),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table private.prognos_kundtid_cfg enable row level security;
revoke all on private.prognos_kundtid_cfg from public, anon, authenticated;
insert into private.prognos_kundtid_cfg(zone_id, offset_min) values
  ('293', 0), ('15', 10), ('161', 10), ('163', 10), ('406', 10), ('432', 10)
on conflict (zone_id) do nothing;

create table if not exists private.prognos_truth (
  id bigserial primary key,
  zone_id text not null,
  booknr text,
  prognos_at timestamptz not null,   -- tiden prognosen visade
  booked_at timestamptz,             -- kundens beställda tid
  received_at timestamptz,           -- när bilen fick bokningen (utskick)
  note text,
  created_at timestamptz not null default now(),
  created_by text
);
alter table private.prognos_truth enable row level security;
revoke all on private.prognos_truth from public, anon, authenticated;
insert into private.prognos_truth(zone_id, booknr, prognos_at, booked_at, received_at, note, created_by)
select '293', '06475', '2026-11-03 22:45 Europe/Stockholm', '2026-11-03 22:50 Europe/Stockholm', '2026-11-03 22:49 Europe/Stockholm',
       'Landvetter, verifierat av Christian. Trolig prognosrad: bokning 1067 (borta 22:48).', 'seed'
where not exists (select 1 from private.prognos_truth where booknr = '06475');

create or replace function public.sadmin_kundtid_get(p_token text)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record;
begin
  select * into a from private.require_sadmin(p_token);
  return json_build_object('ok', true,
    'offsets', (select json_object_agg(zone_id, offset_min) from private.prognos_kundtid_cfg));
end $$;
revoke all on function public.sadmin_kundtid_get(text) from public;
grant execute on function public.sadmin_kundtid_get(text) to anon, authenticated;

create or replace function public.sadmin_kundtid_set(p_token text, p_zone text, p_offset integer)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record;
begin
  select * into a from private.require_sadmin(p_token);
  if p_zone not in ('293','15','161','163','406','432') or p_offset is null or p_offset not between 0 and 45 then
    raise exception 'ogiltigt värde' using errcode = '22023';
  end if;
  insert into private.prognos_kundtid_cfg(zone_id, offset_min, updated_at, updated_by) values (p_zone, p_offset, now(), a.driver_id)
  on conflict (zone_id) do update set offset_min = excluded.offset_min, updated_at = now(), updated_by = a.driver_id;
  perform private.log(a.driver_id, a.category, 'sadmin_kundtid_set', null, jsonb_build_object('zone', p_zone, 'offset', p_offset), false);
  return public.sadmin_kundtid_get(p_token);
end $$;
revoke all on function public.sadmin_kundtid_set(text, text, integer) from public;
grant execute on function public.sadmin_kundtid_set(text, text, integer) to anon, authenticated;

create or replace function public.sadmin_truth_add(p_token text, p_zone text, p_booknr text, p_prognos timestamptz,
  p_booked timestamptz, p_received timestamptz, p_note text)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record;
begin
  select * into a from private.require_sadmin(p_token);
  if p_zone is null or p_prognos is null then raise exception 'zon och prognostid krävs' using errcode = '22023'; end if;
  insert into private.prognos_truth(zone_id, booknr, prognos_at, booked_at, received_at, note, created_by)
  values (btrim(p_zone), nullif(btrim(p_booknr), ''), p_prognos, p_booked, p_received, left(p_note, 500), a.driver_id);
  perform private.log(a.driver_id, a.category, 'sadmin_truth_add', null, jsonb_build_object('zone', p_zone), false);
  return json_build_object('ok', true);
end $$;
revoke all on function public.sadmin_truth_add(text, text, text, timestamptz, timestamptz, timestamptz, text) from public;
grant execute on function public.sadmin_truth_add(text, text, text, timestamptz, timestamptz, timestamptz, text) to anon, authenticated;

-- Utvärdering. Minuter, plus = efter prognostiden.
--  borta  = när bokningen försvann ur prognosen − prognostid (närmaste mått på utskicket). Bara säkra/troliga, status canceled,
--           pålitlig sluttid, och försvann tidigast 20 min före prognostiden (tidigare = troligen avbokad/flyttad), senast 40 min efter.
--  start  = taxameterns start − närmaste prognostid (40 min före till 10 min efter starten). bokad = resan har BOOKNR i resapost.
--  Om prognostid = utskick: borta ≈ 0 och start ≈ +offset. Om prognostid = kundens tid: borta ≈ −offset och start ≈ 0.
create or replace function public.sadmin_prognos_kundtid_eval(p_token text, p_days integer default 30, p_test integer default 10)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v_days int; v_t int; v_from timestamptz; v_res json;
begin
  select * into a from private.require_sadmin(p_token);
  v_days := least(greatest(coalesce(p_days, 30), 1), 90);
  v_t := least(greatest(coalesce(p_test, 10), 1), 30);
  perform private.log(a.driver_id, a.category, 'sadmin_kundtid_eval', null, jsonb_build_object('days', v_days, 'test', v_t), false);
  v_from := greatest(now() - make_interval(days => v_days),
                     coalesce((select min(first_seen_at) from public.prognos_booking_history), now()));
  with b as (
    select h.*, (not h.backfilled or exists (select 1 from public.prognos_bookings_gone g where g.booking_id = h.booking_id)) tid_ok
      from public.prognos_booking_history h
     where h.estimated_at >= v_from - interval '2 hours' and h.category <> 'barnstol'
  ), ex as (
    select zone_id, extract(epoch from (ended_at - estimated_at)) / 60 d
      from b
     where estimated_at >= v_from and status = 'canceled' and tid_ok and ended_at is not null
       and confidence in ('saker','trolig')
       and ended_at between estimated_at - interval '20 minutes' and estimated_at + interval '40 minutes'
  ), t as (
    select f.ts at time zone 'Europe/Stockholm' as at, f.taxi, c.kategorier,
           case when btrim(f.data->>'startzon') in ('291','292','293') then '293' else btrim(f.data->>'startzon') end zone_id,
           exists (select 1 from private.resapost_raw r where r.kvittonr = f.data->>'kvittonr' and r.booknr is not null) bokad
      from private.trip_fact f
      left join public.cars c on c.bilnummer = f.taxi
     where f.ts >= (v_from at time zone 'Europe/Stockholm')
       and btrim(f.data->>'startzon') in ('291','292','293','15','161','163','406','432')
  ), st as (
    select t.zone_id, t.bokad, x.s
      from t
      join lateral (
        select extract(epoch from (t.at - b.estimated_at)) / 60 s
          from b
         where b.zone_id = t.zone_id and private.prognos_cat_ok(b.category, t.kategorier)
           and b.estimated_at between t.at - interval '40 minutes' and t.at + interval '10 minutes'
         order by abs(extract(epoch from (t.at - b.estimated_at)) / 60 - v_t / 2.0), b.booking_id
         limit 1) x on true
  ), grp as (
    select z, label, zones from (values
      ('stan', 'Stan samlat', array['15','161','163','406','432']),
      ('293', 'Landvetter', array['293']),
      ('15', 'Draken', array['15']), ('161', 'Essity', array['161']), ('163', 'Astra', array['163']),
      ('406', 'Volvo', array['406']), ('432', 'Torslanda', array['432'])) v(z, label, zones)
  ), r as (
    select g.z, g.label,
      (select count(*) from ex where ex.zone_id = any(g.zones)) ex_n,
      (select percentile_cont(array[0.25,0.5,0.75]) within group (order by d) from ex where ex.zone_id = any(g.zones)) ex_q,
      (select count(*) filter (where abs(d) <= abs(d + v_t)) from ex where ex.zone_id = any(g.zones)) ex_utskick,
      (select count(*) from st where st.zone_id = any(g.zones)) st_n,
      (select percentile_cont(array[0.25,0.5,0.75]) within group (order by s) from st where st.zone_id = any(g.zones)) st_q,
      (select count(*) from st where st.zone_id = any(g.zones) and bokad) stb_n,
      (select percentile_cont(0.5) within group (order by s) from st where st.zone_id = any(g.zones) and bokad) stb_med
    from grp g
  )
  select json_build_object('from', v_from, 'to', now(), 'days', v_days, 'test', v_t,
    'offsets', (select json_object_agg(zone_id, offset_min) from private.prognos_kundtid_cfg),
    'groups', (select json_agg(json_build_object('z', z, 'label', label,
        'borta_n', ex_n, 'borta_p25', round(ex_q[1]::numeric, 1), 'borta_median', round(ex_q[2]::numeric, 1), 'borta_p75', round(ex_q[3]::numeric, 1),
        'narmast_utskick', ex_utskick, 'narmast_kund', ex_n - ex_utskick,
        'start_n', st_n, 'start_p25', round(st_q[1]::numeric, 1), 'start_median', round(st_q[2]::numeric, 1), 'start_p75', round(st_q[3]::numeric, 1),
        'bokad_n', stb_n, 'bokad_median', round(stb_med::numeric, 1),
        'svar', case when ex_n < 20 then 'för lite data'
                     when ex_q[2] > -v_t / 2.0 then 'utskick'
                     else 'kundens tid' end)
      order by array_position(array['stan','15','161','163','406','432','293'], z)) from r),
    'truth', (select json_agg(json_build_object('zone', zone_id, 'booknr', booknr, 'prognos', prognos_at, 'bokad', booked_at,
        'mottagen', received_at, 'note', note,
        'prognos_minus_bokad', round(extract(epoch from (prognos_at - booked_at)) / 60),
        'prognos_minus_mottagen', round(extract(epoch from (prognos_at - received_at)) / 60)) order by prognos_at desc)
      from private.prognos_truth)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.sadmin_prognos_kundtid_eval(text, integer, integer) from public;
grant execute on function public.sadmin_prognos_kundtid_eval(text, integer, integer) to anon, authenticated;
