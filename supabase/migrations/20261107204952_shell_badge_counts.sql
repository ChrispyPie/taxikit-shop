-- DRAFT ONLY. Scalar shell badges: no feature list/medical/customer payload reaches the browser.
-- SECURITY INVOKER deliberately reuses the same authorized public functions as the UI.
-- This is a network/payload optimization, not a claim that underlying legacy scans disappear.
create or replace function public.shell_badge_counts(p_token text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare me jsonb; flags jsonb; rows jsonb; old jsonb; personal integer; admin_count integer:=0; v_admin boolean; bil jsonb;
begin
 me:=public.get_me(p_token);
 if coalesce((me->>'demo')::boolean,false) then return jsonb_build_object('messages',0,'admin',0,'notices',0,'forum',0,'prognos',0,'bil',0,'news_seen',null);end if;
 v_admin:=coalesce(me->>'category','') in ('admin','agare','superadmin');
 flags:=public.mailbox_v2(p_token,'item_flags','{}');
 rows:=public.mailbox_v2(p_token,'list','{}');
 old:=public.conversation_list(p_token);
 with items as (
   select 'thread'::text kind,(x->>'id')::bigint id,coalesce((x->>'unread')::boolean,false) unread from jsonb_array_elements(rows) x
   union all select x->>'kind',(x->>'id')::bigint,coalesce((x->>'unread')::integer,0)>0 from jsonb_array_elements(public.case_inbox(p_token,5000)->'items') x where x->>'kind'<>'wish'
   union all select 'old-message',(x->>'id')::bigint,coalesce((x->>'unread')::integer,0)>0 from jsonb_array_elements(old->'items') x
 ) select count(*) into personal from items i
 left join lateral (select f from jsonb_array_elements(flags) f where f->>'kind'=i.kind and (f->>'id')::bigint=i.id limit 1) pref on true
 where not coalesce((pref.f->>'hidden')::boolean,false) and (i.unread or coalesce((pref.f->>'is_unread')::boolean,false));
 if v_admin then
   flags:=public.mailbox_v2(p_token,'item_flags','{"admin":true}');
   rows:=public.mailbox_v2(p_token,'list','{"admin":true}');
   with items as (
     select 'thread'::text kind,(x->>'id')::bigint id,coalesce((x->>'unread')::boolean,false) unread from jsonb_array_elements(rows) x
     union all select x->>'kind',(x->>'id')::bigint,coalesce((x->>'unread')::integer,0)>0 from jsonb_array_elements(public.case_admin_list(p_token,5000)->'items') x where x->>'kind'<>'wish'
   ) select count(*) into admin_count from items i
   left join lateral (select f from jsonb_array_elements(flags) f where f->>'kind'=i.kind and (f->>'id')::bigint=i.id limit 1) pref on true
   where not coalesce((pref.f->>'hidden')::boolean,false) and (i.unread or coalesce((pref.f->>'is_unread')::boolean,false));
 end if;
 bil:=public.bil_badge(p_token);
 return jsonb_build_object('messages',personal,'admin',admin_count,
   'notices',coalesce((public.notis_feed(p_token,1)->>'unread')::integer,0),
   'forum',public.forum_classic_badge(p_token),'prognos',public.prognos_new_count(p_token),
   'bil',coalesce(nullif((bil->>'unread')::integer,0),nullif((bil->>'blocking')::integer,0),nullif((bil->>'tasks')::integer,0),nullif((bil->>'wh_q')::integer,0),(bil->>'iss_msg')::integer,0),'news_seen',public.changelog_seen_get(p_token));
end $$;
revoke all on function public.shell_badge_counts(text) from public;
grant execute on function public.shell_badge_counts(text) to anon,authenticated;
