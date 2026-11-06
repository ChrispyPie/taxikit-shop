-- Ångra klassiskt forum (20261106a). Kör EFTER att frontend backats till gamla forum.js.
-- Tar även bort pin/solve-RPC:er och seedade sektioner hjalp/fragor.
drop function if exists public.forum_classic_badge(text);
drop function if exists public.forum_thread_status(text, bigint, text, text);
drop function if exists public.forum_thread_reply(text, bigint, text);
drop function if exists public.forum_thread_new(text, text, text, text);
drop function if exists public.forum_thread_get(text, bigint);
drop function if exists public.forum_thread_solve(text, bigint, bigint);
drop function if exists public.forum_thread_solve(text, bigint);
drop function if exists public.forum_thread_pin(text, bigint, boolean);
drop function if exists public.forum_section_threads(text, text, boolean);
drop function if exists public.forum_section_threads(text, text);
drop function if exists public.forum_home(text);
drop function if exists private.fx_author_json(text);
drop function if exists private.fx_thread_visible(public.forum_threads, public.forum_sections, text, text[], boolean, text);
drop function if exists private.fx_can_write(public.forum_sections, text[], boolean);
drop function if exists private.fx_can_read(public.forum_sections, text[]);
drop function if exists private.fx_roles(boolean, boolean);
drop table if exists public.forum_reads;
drop table if exists public.forum_replies;
drop table if exists public.forum_threads;
drop table if exists public.forum_sections;
