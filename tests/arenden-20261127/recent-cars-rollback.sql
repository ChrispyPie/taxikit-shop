-- C (2026-11-27): my_recent_cars. Syntetisk förare och syntetiska pass. Allt rullas tillbaka (avslutas med avsiktligt undantag).
do $verify$
declare prefix text:='__recentcars_verify__'; tok text; other text; j jsonb; today date:=(now() at time zone 'Europe/Stockholm')::date;
begin
 if exists(select 1 from public.drivers where id like prefix||'%') then raise exception 'collision'; end if;
 insert into public.drivers(id,name,first_name,last_name,category,activated) values(prefix||'d','Synthetic','Synthetic','Verification','standard',true),(prefix||'o','Synthetic','Synthetic','Other','standard',true);
 tok:=gen_random_uuid()::text||gen_random_uuid()::text; other:=gen_random_uuid()::text||gen_random_uuid()::text;
 insert into private.sessions(token_hash,driver_id,via_master,expires_at) values(private.token_hash(tok),prefix||'d',false,now()+interval '2 days'),(private.token_hash(other),prefix||'o',false,now()+interval '2 days');
 insert into private.shift_fact(company_id,source,src_ord,forar,passnr,start_key,start_app_ok,data,day,taxi) values
  ('default','current',0,prefix||'d','1','k1',true,'{}'::jsonb,today-3,'__A1'),
  ('default','current',0,prefix||'d','2','k2',true,'{}'::jsonb,today-1,'__a1 '),
  ('default','current',0,prefix||'d','3','k3',true,'{}'::jsonb,today-20,'__A2'),
  ('default','current',0,prefix||'o','1','k4',true,'{}'::jsonb,today-2,'__A3');
 execute 'set local role anon';
 j:=public.my_recent_cars(tok);
 if j<>'["__A1"]'::jsonb then raise exception 'unexpected recent cars: %',j; end if;
 j:=public.my_recent_cars(tok,30);
 if j<>'["__A1", "__A2"]'::jsonb then raise exception 'unexpected 30d: %',j; end if;
 if public.my_recent_cars(other)<>'["__A3"]'::jsonb then raise exception 'other driver leak'; end if;
 begin perform public.my_recent_cars('ogiltig-session-xyz'); raise exception 'bad session accepted'; exception when sqlstate '28000' then null; end;
 execute 'reset role';
 raise exception 'C_VERIFY_OK 4 checks (own driver only, 7d window, case/space normalised, bad session rejected; rolled back)';
end $verify$;
