-- D (2026-11-27): avbokning och ombokning av Bokad tid. Bara syntetiska förare/admin/trådar. Allt rullas tillbaka
-- (avslutas med avsiktligt undantag 'D_VERIFY_OK ...'). Inga riktiga användare, inga notiser.
do $verify$
declare prefix text:='__omboka_verify__'; r text; tok text; drv text; adm text; peer text; tid bigint; bid bigint; bid2 bigint; j jsonb; n int:=0;
 d1 text:=to_char(current_date+7,'YYYY-MM-DD'); d2 text:=to_char(current_date+9,'YYYY-MM-DD'); d3 text:=to_char(current_date+11,'YYYY-MM-DD');
begin
 if exists(select 1 from public.drivers where id like prefix||'%') then raise exception 'collision'; end if;
 insert into public.companies(id,name) values(prefix||'a','Synthetic A');
 foreach r in array array['driver','admin','peer'] loop
  insert into public.drivers(id,name,first_name,last_name,category,activated) values(prefix||r,'Synthetic','Synthetic','Verification',case r when 'admin' then 'admin' else 'standard' end,true);
  insert into private.company_members(driver_id,company_id) values(prefix||r,prefix||'a');
  tok:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into private.sessions(token_hash,driver_id,via_master,expires_at) values(private.token_hash(tok),prefix||r,false,now()+interval '2 days');
  case r when 'driver' then drv:=tok; when 'admin' then adm:=tok; else peer:=tok; end case;
 end loop;
 execute 'set local role anon';
 -- admin föreslår tid, föraren godkänner
 j:=public.mailbox_v2(adm,'book',jsonb_build_object('admin',true,'driver_id',prefix||'driver','kind','Synthetic service','date',d1,'time','09:30','car_choice','none'));
 tid:=(j->>'id')::bigint;
 j:=public.mailbox_v2(drv,'get',jsonb_build_object('thread_id',tid)); bid:=(j->'bookings'->0->>'id')::bigint;
 perform public.mailbox_v2(drv,'decide',jsonb_build_object('booking_id',bid,'decision','accepted')); n:=n+1;
 -- cancel kräver orsak (tom och bara blanksteg nekas)
 begin perform public.mailbox_v2(drv,'cancel',jsonb_build_object('booking_id',bid)); raise exception 'cancel without reason'; exception when sqlstate '22023' then if sqlerrm<>'need_reason' then raise; end if; n:=n+1; end;
 begin perform public.mailbox_v2(drv,'cancel',jsonb_build_object('booking_id',bid,'reason','   ')); raise exception 'cancel blank reason'; exception when sqlstate '22023' then if sqlerrm<>'need_reason' then raise; end if; n:=n+1; end;
 -- en annan förare kan inte avboka/omboka
 begin perform public.mailbox_v2(peer,'cancel',jsonb_build_object('booking_id',bid,'reason','x')); raise exception 'peer cancel'; exception when sqlstate 'P0002' then n:=n+1; end;
 begin perform public.mailbox_v2(peer,'rebook',jsonb_build_object('booking_id',bid,'date',d2,'time','10:00')); raise exception 'peer rebook'; exception when sqlstate 'P0002' then n:=n+1; end;
 -- föraren omboka godkänd tid: gamla blir rebooked, nya väntar på admin
 perform public.mailbox_v2(drv,'rebook',jsonb_build_object('booking_id',bid,'date',d2,'time','10:15','body','Kan inte den dagen'));
 j:=public.mailbox_v2(drv,'get',jsonb_build_object('thread_id',tid));
 if j->'bookings'->0->>'status'<>'rebooked' or j->'bookings'->1->>'status'<>'pending_admin' or j->'bookings'->1->>'proposer_role'<>'driver' then raise exception 'rebook state %',j->'bookings'; end if; n:=n+1;
 bid2:=(j->'bookings'->1->>'id')::bigint;
 if j->'bookings'->1->>'title'<>'Synthetic service' then raise exception 'title not copied'; end if;
 -- tidslinjen visar bara den nya (väntande) tiden för föraren
 j:=public.mailbox_v2(drv,'timeline');
 if jsonb_array_length(j)<>1 or j->0->>'status'<>'pending_admin' then raise exception 'timeline %',j; end if; n:=n+1;
 -- admin ser tråden som ohanterad (väntande bokning) och oläst
 j:=public.mailbox_v2(adm,'list','{"admin":true}');
 if not (j->0->'booking_states' @> '"pending_admin"'::jsonb) or (j->0->>'unread')::boolean is not true then raise exception 'admin list %',j; end if; n:=n+1;
 -- admin bekräftar nya tiden, sedan omboka admin den (godkänd -> väntar på föraren)
 perform public.mailbox_v2(adm,'decide',jsonb_build_object('admin',true,'booking_id',bid2,'decision','accepted'));
 perform public.mailbox_v2(adm,'rebook',jsonb_build_object('admin',true,'booking_id',bid2,'date',d3,'time','08:00'));
 j:=public.mailbox_v2(adm,'get',jsonb_build_object('admin',true,'thread_id',tid));
 if j->'bookings'->1->>'status'<>'rebooked' or j->'bookings'->2->>'status'<>'pending_driver' or j->'bookings'->2->>'proposer_role'<>'admin' then raise exception 'admin rebook %',j->'bookings'; end if; n:=n+1;
 bid:=(j->'bookings'->2->>'id')::bigint;
 -- ogiltiga datum nekas
 begin perform public.mailbox_v2(adm,'rebook',jsonb_build_object('admin',true,'booking_id',bid,'date',to_char(current_date-1,'YYYY-MM-DD'),'time','08:00')); raise exception 'past date'; exception when sqlstate '22023' then if sqlerrm<>'bad_date' then raise; end if; n:=n+1; end;
 -- föraren avbokar den väntande tiden med orsak: cancelled, systemrad + orsaksmeddelande, syns inte i tidslinjen
 perform public.mailbox_v2(drv,'cancel',jsonb_build_object('booking_id',bid,'reason','Jag är sjuk'));
 j:=public.mailbox_v2(drv,'get',jsonb_build_object('thread_id',tid));
 if j->'bookings'->2->>'status'<>'cancelled' or j->'bookings'->2->>'reason'<>'Jag är sjuk' then raise exception 'cancel state'; end if; n:=n+1;
 if not exists(select 1 from jsonb_array_elements(j->'messages') m where m->>'role'='system' and m->>'body' like 'Bokad tid avbokad av föraren%') then raise exception 'system row'; end if;
 if (j->'messages'->-1->>'body')<>'Jag är sjuk' or (j->'messages'->-1->>'role')<>'driver' then raise exception 'reason message'; end if; n:=n+1;
 if public.mailbox_v2(drv,'timeline')<>'[]'::jsonb then raise exception 'timeline not empty'; end if; n:=n+1;
 -- admin: oläst, men orsaksmeddelandet räknas inte som obesvarad ny fråga (decision_reply)
 j:=public.mailbox_v2(adm,'list','{"admin":true}');
 if (j->0->>'unread')::boolean is not true or (j->0->>'decision_reply')::boolean is not true then raise exception 'admin after cancel %',j->0; end if; n:=n+1;
 -- redan avbokad kan inte avbokas/ombokas igen eller godkännas
 begin perform public.mailbox_v2(adm,'cancel',jsonb_build_object('admin',true,'booking_id',bid,'reason','x')); raise exception 'double cancel'; exception when insufficient_privilege then n:=n+1; end;
 begin perform public.mailbox_v2(adm,'rebook',jsonb_build_object('admin',true,'booking_id',bid,'date',d3,'time','09:00')); raise exception 'rebook cancelled'; exception when insufficient_privilege then n:=n+1; end;
 begin perform public.mailbox_v2(drv,'decide',jsonb_build_object('booking_id',bid,'decision','accepted')); raise exception 'decide cancelled'; exception when insufficient_privilege then n:=n+1; end;
 -- admin avbokar ny godkänd tid; en passerad tid kan inte avbokas
 j:=public.mailbox_v2(adm,'book',jsonb_build_object('admin',true,'thread_id',tid,'kind','Synthetic 2','date',d1,'time','11:00','car_choice','none'));
 j:=public.mailbox_v2(adm,'get',jsonb_build_object('admin',true,'thread_id',tid)); bid:=(j->'bookings'->-1->>'id')::bigint;
 perform public.mailbox_v2(drv,'decide',jsonb_build_object('booking_id',bid,'decision','accepted'));
 perform public.mailbox_v2(adm,'cancel',jsonb_build_object('admin',true,'booking_id',bid,'reason','Bilen är på verkstad'));
 j:=public.mailbox_v2(drv,'get',jsonb_build_object('thread_id',tid));
 if j->'bookings'->-1->>'status'<>'cancelled' or not exists(select 1 from jsonb_array_elements(j->'messages') m where m->>'body' like 'Bokad tid avbokad av admin%') then raise exception 'admin cancel'; end if; n:=n+1;
 execute 'reset role';
 insert into inbox_private.bookings(thread_id,kind,title,starts_at,status,proposer_role,proposed_by) values(tid,'Past','Past',now()-interval '3 hours','accepted','admin',prefix||'admin') returning id into bid;
 execute 'set local role anon';
 begin perform public.mailbox_v2(drv,'cancel',jsonb_build_object('booking_id',bid,'reason','x')); raise exception 'past cancel'; exception when insufficient_privilege then n:=n+1; end;
 -- låst tråd (admin raderar): föraren nekas avboka/omboka, admin får
 j:=public.mailbox_v2(adm,'book',jsonb_build_object('admin',true,'thread_id',tid,'kind','Synthetic 3','date',d1,'time','12:00','car_choice','none'));
 j:=public.mailbox_v2(adm,'get',jsonb_build_object('admin',true,'thread_id',tid)); bid:=(j->'bookings'->-1->>'id')::bigint;
 perform public.mailbox_v2(adm,'bulk_preferences',jsonb_build_object('admin',true,'operation','hide','items',jsonb_build_array(jsonb_build_object('kind','thread','id',tid))));
 begin perform public.mailbox_v2(drv,'cancel',jsonb_build_object('booking_id',bid,'reason','x')); raise exception 'locked cancel'; exception when insufficient_privilege then if sqlerrm<>'thread_closed' then raise; end if; n:=n+1; end;
 begin perform public.mailbox_v2(drv,'rebook',jsonb_build_object('booking_id',bid,'date',d2,'time','13:00')); raise exception 'locked rebook'; exception when insufficient_privilege then if sqlerrm<>'thread_closed' then raise; end if; n:=n+1; end;
 perform public.mailbox_v2(adm,'rebook',jsonb_build_object('admin',true,'booking_id',bid,'date',d2,'time','13:00')); n:=n+1;
 execute 'reset role';
 raise exception 'D_VERIFY_OK % checks (all synthetic rows rolled back)', n;
end $verify$;
