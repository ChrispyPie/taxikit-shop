-- Ångra 20261104b_sadmin.sql
alter table public.prognos_snapshots disable row level security;
alter table public.prognos_bookings  disable row level security;
alter table public.prognos_meta      disable row level security;
alter table public.prognos_watches   disable row level security;

-- Zonguiden tillbaka till ägare + S admin (can_view_company)
do $do$
declare v_src text; v_new text;
begin
  v_src := pg_get_functiondef('public.zonguide(text,integer,integer,integer)'::regprocedure);
  v_new := regexp_replace(v_src,
    E'select \\* into a from private\\.require_sadmin\\(p_token\\);[^\\n]*\\n  perform private\\.log\\([^\\n]*\\);',
    E'select * into a from private.session_actor(p_token);\n  if not private.can_view_company(a.category) then raise exception ''forbidden'' using errcode = ''42501''; end if;');
  if v_new = v_src then raise exception 'zonguide: hittade inte S admin-raden'; end if;
  execute v_new;
end $do$;

drop function if exists public.sadmin_prognos_trips(text, integer, integer);
drop function if exists private.prognos_cat_ok(text, text[]);
drop function if exists public.sadmin_me(text);
drop function if exists private.require_sadmin(text);
