-- bilnr2: förare i bolaget 'default' (bilar med company_id NULL) ska få åkeriets bilar och kunna välja en. Syntetisk förare, allt rullas tillbaka.
do $verify$
declare p text:='__bilnr2_verify__'; tok text; j jsonb; cid bigint; n int;
begin
 if exists(select 1 from public.drivers where id like p||'%') then raise exception 'collision'; end if;
 insert into public.drivers(id,name,first_name,last_name,category,activated) values(p||'d','Synthetic','Synthetic','Verification','standard',true);
 tok:=gen_random_uuid()::text||gen_random_uuid()::text;
 insert into private.sessions(token_hash,driver_id,via_master,expires_at) values(private.token_hash(tok),p||'d',false,now()+interval '1 day');
 if private.actor_company(p||'d')<>'default' then raise exception 'förväntade default'; end if;
 execute 'set local role anon';
 j:=public.mailbox_v2(tok,'cars','{}'::jsonb); n:=jsonb_array_length(j);
 if n<1 then raise exception 'inga bilar'; end if;
 cid:=(j->0->>'id')::bigint;
 j:=public.mailbox_v2(tok,'create',jsonb_build_object('subject','Test','body','Test','car_choice',cid::text));
 if j->>'id' is null then raise exception 'create gav %',j; end if;
 raise exception 'BILNR2_OK % bilar, create med vald bil lyckades (rullas tillbaka)', n;
end $verify$;
