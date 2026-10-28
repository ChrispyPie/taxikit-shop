-- Önskemål och idéer (Admin): ägaren skriver vad som ska ändras eller läggas till i appen (2026-10-28)
-- Flöde: ägaren skriver → Christians assistent läser via databasen och går igenom det med Christian →
-- först efter Christians ja byggs något. Inget i appen ändras automatiskt.
-- Bara tillägg: en ny tabell + tre nya RPC:er. Inga befintliga tabeller eller funktioner ändras.
-- Ångra: supabase/migrations/undo/20261028o_dev_wishes_undo.sql (och /workspace/backups/UNDO-onskemal-2026-10-28.md)
--
-- Status (sätts bara av Christian/assistenten via SQL, aldrig från appen):
--   ny = Ny, last = Läst, planerad = Planerad, klar = Klar, inte_nu = Inte nu

create table if not exists public.dev_wishes (
  id bigserial primary key,
  company_id text not null,
  author_id text not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'ny' check (status in ('ny', 'last', 'planerad', 'klar', 'inte_nu')),
  reply text check (reply is null or char_length(reply) <= 2000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists dev_wishes_company_idx on public.dev_wishes (company_id, created_at desc);
create index if not exists dev_wishes_author_idx on public.dev_wishes (author_id, created_at);
create index if not exists dev_wishes_status_idx on public.dev_wishes (status) where status = 'ny';

-- RLS på, inga policies: ingen kommer åt tabellen direkt, allt går via RPC:erna nedan.
alter table public.dev_wishes enable row level security;
revoke all on public.dev_wishes from anon, authenticated;
revoke all on sequence public.dev_wishes_id_seq from anon, authenticated;

-- updated_at sätts automatiskt vid ändring (t.ex. när status eller svar sätts via SQL)
create or replace function private.dev_wish_touch()
 returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $function$
begin
  new.updated_at := clock_timestamp();
  return new;
end $function$;
drop trigger if exists dev_wishes_touch on public.dev_wishes;
create trigger dev_wishes_touch before update on public.dev_wishes
  for each row execute function private.dev_wish_touch();

-- demokonton får inte skriva (samma spärr som övriga tabeller)
drop trigger if exists zz_demo_write_guard on public.dev_wishes;
create trigger zz_demo_write_guard before insert or delete or update on public.dev_wishes
  for each statement execute function private.demo_write_guard();

-- JSON för en rad (namn på den som skrev: förnamn + första bokstaven i efternamnet)
create or replace function private.dev_wish_json(w public.dev_wishes, p_me text)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object('id', w.id, 'body', w.body, 'status', w.status, 'reply', w.reply,
    'created_at', w.created_at, 'updated_at', w.updated_at, 'mine', w.author_id = p_me,
    'author', (select nullif(btrim(coalesce(d.first_name, '') || ' ' || left(coalesce(d.last_name, ''), 1)), '')
                 from public.drivers d where d.id = w.author_id))
$function$;

-- Lista åkeriets önskemål (ägaren och S admin, bara eget åkeri)
create or replace function public.dev_wish_list(p_token text)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select json_agg(x.j order by x.created_at desc) from (
      select private.dev_wish_json(w, a.driver_id) j, w.created_at
        from public.dev_wishes w where w.company_id = a.company_id
       order by w.created_at desc limit 200) x), '[]'::json);
end $function$;

-- Lägg till ett önskemål (högst 30 per person och dygn)
create or replace function public.dev_wish_add(p_token text, p_body text)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; v text := btrim(coalesce(p_body, '')); w public.dev_wishes;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  if v = '' then raise exception 'need_text' using errcode = '22023'; end if;
  if char_length(v) > 2000 then raise exception 'too_long' using errcode = '22023'; end if;
  if (select count(*) from public.dev_wishes x where x.author_id = a.driver_id
       and x.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.dev_wishes (company_id, author_id, body) values (a.company_id, a.driver_id, v) returning * into w;
  perform private.log(a.driver_id, a.category, 'dev_wish_add', null,
    jsonb_build_object('id', w.id, 'text', left(v, 120)), a.via_master);
  return private.dev_wish_json(w, a.driver_id)::json;
end $function$;

-- Ta bort sitt eget önskemål, bara så länge det har status Ny
create or replace function public.dev_wish_delete(p_token text, p_id bigint)
 returns json language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a record; w public.dev_wishes;
begin
  select * into a from private.bil_actor(p_token);
  if not a.is_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from public.dev_wishes x where x.id = p_id and x.company_id = a.company_id for update;
  if not found or w.author_id <> a.driver_id then raise exception 'not_found' using errcode = 'P0002'; end if;
  if w.status <> 'ny' then raise exception 'not_editable' using errcode = '22023'; end if;
  delete from public.dev_wishes x where x.id = w.id;
  perform private.log(a.driver_id, a.category, 'dev_wish_delete', null,
    jsonb_build_object('id', w.id, 'text', left(w.body, 120)), a.via_master);
  return json_build_object('ok', true);
end $function$;

revoke all on function public.dev_wish_list(text) from public;
revoke all on function public.dev_wish_add(text, text) from public;
revoke all on function public.dev_wish_delete(text, bigint) from public;
grant execute on function public.dev_wish_list(text) to anon, authenticated;
grant execute on function public.dev_wish_add(text, text) to anon, authenticated;
grant execute on function public.dev_wish_delete(text, bigint) to anon, authenticated;
revoke all on function private.dev_wish_json(public.dev_wishes, text) from public, anon, authenticated;
revoke all on function private.dev_wish_touch() from public, anon, authenticated;
