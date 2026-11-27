-- B (2026-11-27): sjuk/intyg låses med tråden. Bara syntetiska förare, sessioner och sjukperioder. Allt rullas tillbaka
-- (testet avslutas med ett avsiktligt undantag 'B_VERIFY_OK ...'), inga notiser skickas, inga riktiga användare berörs.
do $verify$
declare prefix text:='__sjuklock_verify__'; r text; tok text; drv text; own text; adm text; rid bigint; rid2 bigint; cert bigint; j jsonb; n int:=0;
begin
 if exists(select 1 from public.drivers where id like prefix||'%') then raise exception 'collision'; end if;
 insert into public.companies(id,name) values(prefix||'a','Synthetic A');
 foreach r in array array['driver','owner','admin'] loop
  insert into public.drivers(id,name,first_name,last_name,category,activated) values(prefix||r,'Synthetic','Synthetic','Verification',case r when 'owner' then 'agare' when 'admin' then 'admin' else 'standard' end,true);
  insert into private.company_members(driver_id,company_id) values(prefix||r,prefix||'a');
  insert into private.feature_flags(feature,driver_id) values('sjuk',prefix||r);
  tok:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into private.sessions(token_hash,driver_id,via_master,expires_at) values(private.token_hash(tok),prefix||r,false,now()+interval '2 days');
  case r when 'driver' then drv:=tok; when 'owner' then own:=tok; else adm:=tok; end case;
 end loop;
 insert into private.sick_reports(driver_id,start_date,status,sjuklon) values(prefix||'driver',current_date-2,'ny','ej') returning id into rid;
 insert into private.sick_certs(report_id,path,mime,uploaded,uploaded_by) values(rid,prefix||'x.pdf','application/pdf',true,prefix||'driver') returning id into cert;
 execute 'set local role anon';
 -- före lås: allt fungerar för föraren
 j:=public.sjuk_get(drv); if (j->'mine'->0->>'locked')::boolean is not false then raise exception 'locked should be false'; end if; n:=n+1;
 execute 'set local role service_role'; j:=public.sjuk_svc_cert_begin(drv,rid,'application/pdf'); perform public.sjuk_svc_cert_finish(drv,(j->>'id')::bigint,false); n:=n+1; execute 'set local role anon';
 -- admin/ägare raderar tråden (Papperskorg)
 perform public.mailbox_v2(own,'bulk_preferences',jsonb_build_object('admin',true,'operation','hide','items',jsonb_build_array(jsonb_build_object('kind','sjuk','id',rid))));
 j:=public.sjuk_get(drv); if (j->'mine'->0->>'locked')::boolean is not true then raise exception 'locked should be true'; end if; n:=n+1;
 if (public.mailbox_v2(drv,'item_lock',jsonb_build_object('kind','sjuk','id',rid))->>'locked')::boolean is not true then raise exception 'item_lock should be true'; end if; n:=n+1;
 -- föraren nekas alla skrivande flöden med thread_closed (42501)
 begin perform public.sjuk_recover(drv,rid,current_date); raise exception 'recover allowed'; exception when insufficient_privilege then if sqlerrm<>'thread_closed' then raise; end if; n:=n+1; end;
 begin execute 'set local role service_role'; perform public.sjuk_svc_cert_begin(drv,rid,'application/pdf'); raise exception 'cert_begin allowed'; exception when insufficient_privilege then if sqlerrm<>'thread_closed' then raise; end if; execute 'set local role anon'; n:=n+1; end;
 begin execute 'set local role service_role'; perform public.sjuk_svc_cert_delete(drv,cert); raise exception 'cert_delete allowed'; exception when insufficient_privilege then if sqlerrm<>'thread_closed' then raise; end if; execute 'set local role anon'; n:=n+1; end;
 begin execute 'set local role service_role'; perform public.sjuk_svc_delete(drv,rid); raise exception 'delete allowed'; exception when insufficient_privilege then if sqlerrm<>'thread_closed' then raise; end if; execute 'set local role anon'; n:=n+1; end;
 -- ett påbörjat intyg (uppladdning före låset) kan inte slutföras efter låset
 execute 'reset role';
 insert into private.sick_certs(report_id,path,mime,uploaded,uploaded_by) values(rid,prefix||'y.pdf','application/pdf',false,prefix||'driver') returning id into cert;
 execute 'set local role anon';
 begin execute 'set local role service_role'; perform public.sjuk_svc_cert_finish(drv,cert,true); raise exception 'cert_finish allowed'; exception when insufficient_privilege then if sqlerrm<>'thread_closed' then raise; end if; execute 'set local role anon'; n:=n+1; end;
 execute 'set local role service_role'; perform public.sjuk_svc_cert_finish(drv,cert,false); n:=n+1;  execute 'set local role anon';
 -- läsning fungerar (intyg listas) och ny sjukanmälan blockeras inte av den låsta öppna perioden
 execute 'set local role service_role'; if jsonb_array_length(public.sjuk_svc_cert_list(drv,rid))<1 then raise exception 'cert list'; end if; n:=n+1; execute 'set local role anon';
 j:=public.sjuk_report(drv,current_date,null); rid2:=(j->>'id')::bigint; if rid2 is null then raise exception 'new report blocked'; end if; n:=n+1;
 -- ägaren (boss) berörs inte: kan ladda upp/ta bort intyg på den låsta tråden
 execute 'set local role service_role'; j:=public.sjuk_svc_cert_begin(own,rid,'application/pdf'); perform public.sjuk_svc_cert_finish(own,(j->>'id')::bigint,false); n:=n+1; execute 'set local role anon';
 -- ägaren återställer: föraren kan ändra igen
 perform public.mailbox_v2(own,'bulk_preferences',jsonb_build_object('admin',true,'operation','restore','items',jsonb_build_array(jsonb_build_object('kind','sjuk','id',rid))));
 j:=public.sjuk_get(drv); if (select (x->>'locked')::boolean from jsonb_array_elements(j->'mine') x where (x->>'id')::bigint=rid) is not false then raise exception 'unlock failed'; end if; n:=n+1;
 execute 'set local role service_role'; j:=public.sjuk_svc_cert_begin(drv,rid,'application/pdf'); perform public.sjuk_svc_cert_finish(drv,(j->>'id')::bigint,false); n:=n+1; execute 'set local role anon';
 -- hårdradering av sjukuppgifter är fortsatt avstängd
 execute 'reset role';
 if private.mailbox_secret_hard_delete_enabled() is not false then raise exception 'hard delete flag on'; end if; n:=n+1;
 raise exception 'B_VERIFY_OK % checks (all synthetic rows rolled back)', n;
end $verify$;
