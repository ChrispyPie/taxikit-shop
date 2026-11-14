-- 20261114d: spara förarens egna mål i Körpassdata.
--
-- Orsak: målet (dag/vecka/månad/år) fanns bara i minnet, med standard
-- 4 000 / 25 000 / 100 000 / 1 200 000 kr. Vid omladdning eller när appen
-- öppnades igen hoppade det tillbaka till standard, oftast 100 000 kr i månaden.
-- Åkeriets mål (company_goals) sparades redan på servern och påverkas inte.
--
-- Nytt (bara tillägg, inget befintligt ändras, inklusive session_actor):
--  * tabell private.korpass_mal, en rad per förare
--  * RPC korpass_mal_get / korpass_mal_set (inloggad förare via p_token;
--    demokonton sparar inte på servern)
-- Funktionerna är VOLATILE (anropar session_actor). Ingen STABLE-funktion ändras.
-- Appen klarar sig utan migrationen: den sparar då bara i telefonen.
-- Ångra: undo/20261114d_korpass_mal_undo.sql

create table if not exists private.korpass_mal (
  driver_id text primary key references public.drivers(id) on delete cascade,
  dag numeric not null,
  vecka numeric not null,
  manad numeric not null,
  ar numeric not null,
  updated_at timestamptz not null default now(),
  constraint korpass_mal_range check (
    dag >= 0 and vecka >= 0 and manad >= 0 and ar >= 0
    and dag <= 10000000 and vecka <= 10000000 and manad <= 10000000 and ar <= 10000000
  )
);

alter table private.korpass_mal enable row level security;
revoke all on table private.korpass_mal from public, anon, authenticated;

comment on table private.korpass_mal is
  'Förarens egna mål i Körpassdata (dag, vecka, månad, år). Standard i appen är 4000/25000/100000/1200000.';

create or replace function public.korpass_mal_get(p_token text) returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; g private.korpass_mal;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then return null; end if;
  select * into g from private.korpass_mal where driver_id = a.driver_id;
  if not found then return null; end if;
  return json_build_object(
    'dag', g.dag, 'vecka', g.vecka, 'manad', g.manad, 'ar', g.ar,
    'updated_at', g.updated_at
  );
end $$;

create or replace function public.korpass_mal_set(
  p_token text, p_dag numeric, p_vecka numeric, p_manad numeric, p_ar numeric
) returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record;
begin
  select * into a from private.session_actor(p_token);
  if private.is_demo() then
    return json_build_object(
      'dag', round(p_dag), 'vecka', round(p_vecka),
      'manad', round(p_manad), 'ar', round(p_ar)
    );
  end if;
  if p_dag is null or p_vecka is null or p_manad is null or p_ar is null
     or p_dag < 0 or p_vecka < 0 or p_manad < 0 or p_ar < 0
     or p_dag > 10000000 or p_vecka > 10000000 or p_manad > 10000000 or p_ar > 10000000 then
    raise exception 'invalid_goal' using errcode = '22023';
  end if;
  insert into private.korpass_mal (driver_id, dag, vecka, manad, ar, updated_at)
  values (a.driver_id, round(p_dag), round(p_vecka), round(p_manad), round(p_ar), now())
  on conflict (driver_id) do update
    set dag = excluded.dag,
        vecka = excluded.vecka,
        manad = excluded.manad,
        ar = excluded.ar,
        updated_at = now();
  return json_build_object(
    'dag', round(p_dag), 'vecka', round(p_vecka),
    'manad', round(p_manad), 'ar', round(p_ar)
  );
end $$;

revoke all on function public.korpass_mal_get(text) from public;
revoke all on function public.korpass_mal_set(text, numeric, numeric, numeric, numeric) from public;
grant execute on function public.korpass_mal_get(text) to anon, authenticated, service_role;
grant execute on function public.korpass_mal_set(text, numeric, numeric, numeric, numeric) to anon, authenticated, service_role;
