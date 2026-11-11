-- Ångra 20261111g_home_tool_order.sql
drop function if exists public.home_tool_order_set(text, text[]);
drop function if exists public.home_tool_order_get(text);
drop function if exists private.home_tool_ids_clean(text[]);
drop table if exists private.home_tool_order;
