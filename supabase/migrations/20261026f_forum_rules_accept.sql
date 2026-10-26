-- t353u/t354u: Forumregler – föraren måste godkänna reglerna innan forumet visas.
-- Additivt: ny tabell + två nya RPC:er. Inga ändringar i befintliga tabeller/funktioner.
-- rules_version styrs av klienten (RULES_VERSION i forum.js); höjs den måste alla godkänna på nytt.
-- Undo:
--   drop function if exists public.forum_rules_accept(text, int);
--   drop function if exists public.forum_rules_status(text, int);
--   drop table if exists public.forum_rules_accept;

create table if not exists public.forum_rules_accept (
  driver_id text not null references public.drivers(id) on delete cascade,
  rules_version int not null check (rules_version between 1 and 1000),
  accepted_at timestamptz not null default now(),
  primary key (driver_id, rules_version)
);
alter table public.forum_rules_accept enable row level security;
revoke all on table public.forum_rules_accept from public, anon, authenticated;

-- Har inloggad förare godkänt version p_version? (huvudlösenords-session: räknas som godkänd, sparas aldrig)
create or replace function public.forum_rules_status(p_token text, p_version int)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_at timestamptz;
begin
  select * into a from private.session_actor(p_token);
  if coalesce(a.via_master, false) then
    return json_build_object('accepted', true, 'via_master', true, 'version', p_version);
  end if;
  select accepted_at into v_at from public.forum_rules_accept
   where driver_id = a.driver_id and rules_version = p_version;
  return json_build_object('accepted', v_at is not null, 'accepted_at', v_at, 'version', p_version);
end $$;

-- Spara godkännande för inloggad förare (idempotent).
create or replace function public.forum_rules_accept(p_token text, p_version int)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare a record; v_at timestamptz;
begin
  select * into a from private.session_actor(p_token);
  if p_version is null or p_version < 1 or p_version > 1000 then
    raise exception 'bad_version' using errcode = '22023';
  end if;
  if coalesce(a.via_master, false) then
    return json_build_object('accepted', true, 'via_master', true, 'version', p_version);
  end if;
  insert into public.forum_rules_accept (driver_id, rules_version) values (a.driver_id, p_version)
  on conflict (driver_id, rules_version) do nothing;
  select accepted_at into v_at from public.forum_rules_accept where driver_id = a.driver_id and rules_version = p_version;
  return json_build_object('accepted', true, 'accepted_at', v_at, 'version', p_version);
end $$;

revoke all on function public.forum_rules_status(text, int) from public;
revoke all on function public.forum_rules_accept(text, int) from public;
grant execute on function public.forum_rules_status(text, int) to anon, authenticated;
grant execute on function public.forum_rules_accept(text, int) to anon, authenticated;
