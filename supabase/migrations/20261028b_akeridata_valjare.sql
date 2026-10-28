-- 20261028b: Åkeridata – väljare Åkeri / Bil / Chaufför (t520u).
-- Bara tillägg: två NYA funktioner. Inga tabeller ändras och inga befintliga funktioner ändras
-- (public.get_company_period fungerar precis som förut).
--
--   private.company_period_scoped  som private.company_period, men kan filtreras på en bil (p_taxi) eller en
--                                  förare (p_forar). Ger dessutom fördelning (förare per bil / bilar per förare),
--                                  dagar då bilen stått stilla och listorna till väljaren.
--   public.get_company_period_scoped(p_token, p_from, p_to, p_scope, p_id, p_detail, p_group)
--       p_scope: 'akeri' (hela åkeriet, samma siffror som get_company_period), 'bil' (p_id = bilnummer),
--                'forare' (p_id = förar-id).
--
-- Behörighet (kontrolleras här på servern):
--   ägare (agare)       ser allt med förar-id och namn
--   S admin (superadmin) ser åkeriet och bilar utan andra förares id (som förut), och bara sig själv som Chaufför
--   alla andra (vanliga förare, demokonton) får fel 'forbidden' (42501)
-- Ett åkeri idag: allt hör till company_id 'default' (samma som get_company_period).
--
-- Ångra: kör supabase/migrations/undo/20261028b_akeridata_valjare_undo.sql
--   (drop av de två nya funktionerna; inget annat behöver återställas).

create or replace function private.company_period_scoped(p_company text, p_from date, p_to date, p_view text,
                                                         p_driver text, p_detail boolean, p_group text,
                                                         p_taxi text, p_forar text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_tot jsonb; v_shifts jsonb; v_loose jsonb; v_series jsonb; v_cnt jsonb; v_break jsonb; v_idle jsonb; v_choices jsonb;
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_first date; v_base_from date; v_base_to date; v_active int;
begin
  if p_view not in ('all', 'anon') then
    raise exception 'bad_scope' using errcode = '22023';
  end if;

  -- ---------- summor ----------
  select jsonb_build_object(
           'antal', coalesce(sum(d.trips), 0), 'shifts', coalesce(sum(d.shifts), 0),
           'minutes', coalesce(sum(d.minutes), 0), 'km', coalesce(sum(d.km), 0), 'km_nan', coalesce(sum(d.km_nan), 0),
           'kort', coalesce(sum(d.kort), 0), 'kredit', coalesce(sum(d.kredit), 0), 'swish', coalesce(sum(d.swish), 0),
           'kontant', coalesce(sum(d.kontant), 0), 'uber', coalesce(sum(d.uber_gross), 0),
           'faktura', coalesce(sum(d.faktura), 0), 'ovrigt', coalesce(sum(d.ovrigt), 0),
           'bom', coalesce(sum(d.bom_kr), 0), 'bom_trips', coalesce(sum(d.bom_trips), 0),
           'dricks', coalesce(sum(d.dricks), 0), 'inkort', coalesce(sum(d.inkort), 0),
           'loose_trips', coalesce(sum(d.orphan_trips), 0))
    into v_tot
    from private.day_summary d
   where d.company_id = p_company and d.day between p_from and p_to
     and (p_taxi is null or d.taxi = p_taxi)
     and (p_forar is null or d.forar = p_forar);

  -- ---------- pass ----------
  with sh as (
    select s.shift_id, s.source, s.src_ord, s.forar, s.passnr, s.start_raw, s.slut_raw, s.taxi, s.data,
           case when p_view = 'anon' and s.forar is distinct from p_driver then 'p' || s.shift_id else s.forar end fv
      from private.shift_fact s
     where s.company_id = p_company and s.day between p_from and p_to
       and (p_taxi is null or s.taxi = p_taxi)
       and (p_forar is null or s.forar = p_forar)
  ), tr as (
    select t.shift_id, t.source, t.src_ord, t.data, t.amount, t.kredittyp, t.is_bom
      from private.trip_fact t
     where t.company_id = p_company and t.shift_id in (select shift_id from sh)
  ), agg as (
    select tr.shift_id, count(*) n,
           coalesce(sum(tr.amount) filter (where not tr.is_bom and tr.kredittyp <> '164'), 0)
         + coalesce(sum(tr.amount) filter (where tr.kredittyp = '164'), 0) * (1 - 0.26) inkort,
           case when p_detail then jsonb_agg(
             jsonb_strip_nulls(jsonb_build_object(
               'kvittonr', tr.data->'kvittonr', 'startdatum', tr.data->'startdatum', 'starttid', tr.data->'starttid',
               'sluttid', tr.data->'sluttid', 'startzon', tr.data->'startzon', 'slutzon', tr.data->'slutzon',
               'belopp', tr.data->'belopp', 'kredittyp', tr.data->'kredittyp', 'dricks', tr.data->'dricks'))
             order by (tr.source <> 'current'), tr.src_ord) end trips
      from tr group by tr.shift_id
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', sh.shift_id, 'passnr', sh.passnr, 'forar', sh.fv, 'start', sh.start_raw, 'slut', sh.slut_raw,
           'taxi', sh.taxi, 'n', coalesce(agg.n, 0), 'inkort', coalesce(agg.inkort, 0),
           'trips', case when p_detail then coalesce(agg.trips, '[]'::jsonb) end))
           order by sh.start_raw desc, (sh.source <> 'current'), sh.src_ord), '[]'::jsonb),
         jsonb_build_object(
           'forare', case when p_view = 'all' then count(distinct sh.forar) end,
           'bilar', count(distinct nullif(sh.taxi, '')))
    into v_shifts, v_cnt
    from sh left join agg on agg.shift_id = sh.shift_id;

  -- ---------- resor utan pass ----------
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'kvittonr', t.data->'kvittonr',
           'forar', case when p_view = 'anon' and t.forar is distinct from p_driver then 'n' || t.rn else t.forar end,
           'startdatum', t.data->'startdatum', 'starttid', t.data->'starttid',
           'sluttid', t.data->'sluttid', 'startzon', t.data->'startzon', 'slutzon', t.data->'slutzon',
           'belopp', t.data->'belopp', 'kredittyp', t.data->'kredittyp', 'dricks', t.data->'dricks'))
           order by t.rn), '[]'::jsonb)
    into v_loose
    from (select x.*, row_number() over (order by (x.source <> 'current'), x.src_ord) rn
            from private.trip_fact x
           where x.company_id = p_company and x.shift_id is null and x.attr_day between p_from and p_to
             and (p_taxi is null or x.taxi = p_taxi)
             and (p_forar is null or x.forar = p_forar)) t;

  if p_group in ('day', 'month') then
    select coalesce(jsonb_agg(jsonb_build_object('key', k, 'antal', antal, 'shifts', shifts, 'minutes', minutes,
                                                 'km', km, 'inkort', inkort) order by k), '[]'::jsonb)
      into v_series
      from (select case when p_group = 'day' then to_char(d.day, 'YYYY-MM-DD') else to_char(d.day, 'YYYY-MM') end k,
                   sum(d.trips) antal, sum(d.shifts) shifts, sum(d.minutes) minutes, sum(d.km) km, sum(d.inkort) inkort
              from private.day_summary d
             where d.company_id = p_company and d.day between p_from and p_to
               and (p_taxi is null or d.taxi = p_taxi)
               and (p_forar is null or d.forar = p_forar)
             group by 1) z;
  end if;

  -- ---------- fördelning ----------
  if p_taxi is not null then
    -- Förare som kört bilen. S admin ser inte andras förar-id: de blir "Förare 1, 2 …" (anon_nr).
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'forar', case when p_view = 'anon' and z.forar is distinct from p_driver then null else z.forar end,
             'anon_nr', case when p_view = 'anon' and z.forar is distinct from p_driver then z.rn end,
             'name', case when p_view = 'all' then z.name end,
             'shifts', z.shifts, 'minutes', z.minutes, 'km', z.km, 'antal', z.antal, 'inkort', z.inkort))
             order by z.rn), '[]'::jsonb)
      into v_break
      from (select d.forar, sum(d.shifts) shifts, sum(d.minutes) minutes, sum(d.km) km, sum(d.trips) antal,
                   sum(d.inkort) inkort,
                   nullif(btrim(coalesce(max(dr.first_name), '') || ' ' || coalesce(max(dr.last_name), '')), '') name,
                   row_number() over (order by sum(d.inkort) desc, d.forar) rn
              from private.day_summary d
              left join public.drivers dr on dr.id = d.forar
             where d.company_id = p_company and d.day between p_from and p_to and d.taxi = p_taxi
             group by d.forar) z;

    -- Dagar då bilen stått stilla: dagar i perioden (från bilens första dag i datan, till och med idag)
    -- utan något körpass i bilen.
    select min(d.day) into v_first from private.day_summary d
     where d.company_id = p_company and d.taxi = p_taxi and d.shifts > 0;
    v_base_from := greatest(p_from, coalesce(v_first, p_from));
    v_base_to := least(p_to, v_today);
    select count(distinct d.day) into v_active from private.day_summary d
     where d.company_id = p_company and d.taxi = p_taxi and d.shifts > 0 and d.day between v_base_from and v_base_to;
    v_idle := jsonb_build_object(
      'days', greatest(0, v_base_to - v_base_from + 1), 'active', coalesce(v_active, 0),
      'idle', greatest(0, (v_base_to - v_base_from + 1) - coalesce(v_active, 0)),
      'from', case when v_base_to >= v_base_from then v_base_from end,
      'to', case when v_base_to >= v_base_from then v_base_to end,
      'first_day', v_first);
  elsif p_forar is not null then
    -- Bilar föraren kört
    select coalesce(jsonb_agg(jsonb_build_object(
             'taxi', z.taxi, 'in_register', z.in_reg,
             'shifts', z.shifts, 'minutes', z.minutes, 'km', z.km, 'antal', z.antal, 'inkort', z.inkort)
             order by z.inkort desc, z.taxi), '[]'::jsonb)
      into v_break
      from (select d.taxi, sum(d.shifts) shifts, sum(d.minutes) minutes, sum(d.km) km, sum(d.trips) antal,
                   sum(d.inkort) inkort,
                   exists (select 1 from public.cars c where upper(btrim(c.bilnummer)) = upper(btrim(d.taxi))) in_reg
              from private.day_summary d
             where d.company_id = p_company and d.day between p_from and p_to and d.forar = p_forar
             group by d.taxi) z;
  end if;

  -- ---------- listor till väljaren ----------
  -- Bilar: bilregistret + bilar som finns i körpassen/resorna men inte i registret.
  -- Förare: aktiva förare (ej demo/avslutade) + förare med data i perioden. S admin: bara sig själv.
  select jsonb_build_object(
    'cars', (select coalesce(jsonb_agg(jsonb_build_object('taxi', c.taxi, 'in_register', c.in_reg,
                                                        'in_period', c.in_period, 'last_day', c.last_day)
                                     order by (not c.in_reg), length(c.taxi), c.taxi), '[]'::jsonb)
               from (select u.taxi, bool_or(u.reg) in_reg,
                            exists (select 1 from private.day_summary d where d.company_id = p_company and d.taxi = u.taxi
                                       and d.day between p_from and p_to) in_period,
                            (select max(d.day) from private.day_summary d where d.company_id = p_company and d.taxi = u.taxi) last_day
                       from (select btrim(c.bilnummer) taxi, true reg from public.cars c
                              where coalesce(btrim(c.bilnummer), '') <> ''
                             union all
                             select distinct d.taxi, false from private.day_summary d
                              where d.company_id = p_company and coalesce(btrim(d.taxi), '') <> ''
                                and not exists (select 1 from public.cars c where upper(btrim(c.bilnummer)) = upper(btrim(d.taxi)))) u
                      group by u.taxi) c),
    'drivers', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                         'id', f.id, 'name', case when p_view = 'all' then f.name end,
                         'active', f.active, 'in_period', f.in_period, 'last_day', f.last_day))
                       order by (not f.active), f.last_day desc nulls last, f.id), '[]'::jsonb)
                  from (select v.id,
                               nullif(btrim(coalesce(dr.first_name, '') || ' ' || coalesce(dr.last_name, '')), '') name,
                               (dr.id is not null and coalesce(dr.activated, false) and coalesce(dr.category, '') <> 'avslutad') active,
                               exists (select 1 from private.day_summary d where d.company_id = p_company and d.forar = v.id
                                          and d.day between p_from and p_to) in_period,
                               (select max(d.day) from private.day_summary d where d.company_id = p_company and d.forar = v.id) last_day
                          from (select d2.id from public.drivers d2
                                 where coalesce(d2.activated, false) and coalesce(d2.category, '') <> 'avslutad'
                                   and not exists (select 1 from private.demo_accounts x where x.driver_id = d2.id)
                                union
                                select distinct d.forar from private.day_summary d
                                 where d.company_id = p_company and d.day between p_from and p_to) v
                          left join public.drivers dr on dr.id = v.id
                         where p_view = 'all' or v.id = p_driver) f))
    into v_choices;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'view', p_view, 'detail', p_detail,
    'taxi', p_taxi, 'forar', p_forar,
    'totals', v_tot, 'forare', v_cnt->'forare', 'bilar', v_cnt->'bilar',
    'shifts', v_shifts, 'loose', v_loose, 'series', v_series,
    'breakdown', v_break, 'idle', v_idle, 'choices', v_choices,
    'last_updated', (select meta->'last_updated' from public.trip_datasets where name = 'current'),
    'fresh', private.dataplan_status(p_company));
end $$;
revoke all on function private.company_period_scoped(text, date, date, text, text, boolean, text, text, text)
  from public, anon, authenticated;

create or replace function public.get_company_period_scoped(p_token text, p_from date, p_to date,
                                                            p_scope text default 'akeri', p_id text default null,
                                                            p_detail boolean default true, p_group text default null)
returns json language plpgsql security definer
set search_path = 'pg_catalog', 'public' set work_mem = '32MB' as $$
declare a record; v_cat text; v_view text; v_scope text; v_id text; v_taxi text; v_forar text;
begin
  select * into a from private.session_actor(p_token);
  v_cat := coalesce(a.category, '');
  -- Bara ägaren (och S admin, som Åkeridata). Vanliga förare och demokonton nekas helt.
  if v_cat = 'agare' then v_view := 'all';
  elsif v_cat = any (private.company_view_roles()) then v_view := 'anon';
  else raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_from < date '2000-01-01' or p_to > date '2100-12-31'
     or p_to - p_from > 400 then
    raise exception 'bad_range' using errcode = '22023';
  end if;
  if p_group is not null and p_group not in ('day', 'month') then
    raise exception 'bad_group' using errcode = '22023';
  end if;
  v_scope := coalesce(nullif(btrim(p_scope), ''), 'akeri');
  v_id := nullif(btrim(coalesce(p_id, '')), '');
  if v_scope not in ('akeri', 'bil', 'forare') then
    raise exception 'bad_scope' using errcode = '22023';
  end if;
  if v_scope <> 'akeri' and (v_id is null or length(v_id) > 40) then
    raise exception 'bad_id' using errcode = '22023';
  end if;
  if v_scope = 'bil' then
    -- bilnumret som det står i datan (oberoende av stora/små bokstäver och mellanslag)
    select d.taxi into v_taxi from private.day_summary d
     where d.company_id = 'default' and upper(btrim(d.taxi)) = upper(v_id) limit 1;
    v_taxi := coalesce(v_taxi, upper(v_id));
  elsif v_scope = 'forare' then
    -- S admin får bara titta på sig själv som Chaufför (andra förares data är anonym för S admin).
    if v_view = 'anon' and v_id is distinct from a.driver_id then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_forar := v_id;
  end if;
  return private.demo_mask(private.company_period_scoped('default', p_from, p_to, v_view, a.driver_id,
                                coalesce(p_detail, true) and p_to - p_from <= 62, p_group, v_taxi, v_forar)::json);
end $$;
revoke all on function public.get_company_period_scoped(text, date, date, text, text, boolean, text) from public;
grant execute on function public.get_company_period_scoped(text, date, date, text, text, boolean, text) to anon, authenticated;
