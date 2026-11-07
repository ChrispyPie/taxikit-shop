// Isolated PostgreSQL/PGlite. Synthetic contacts and accounts only; no network.
const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[__dirname,__dirname+'/../meddelanden']})),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const db=new PGlite(),root=path.resolve(__dirname,'../..');let n=0;
const sql=f=>db.exec(fs.readFileSync(path.join(root,f),'utf8'));
const scalar=async(q,a=[])=>Object.values((await db.query(q,a)).rows[0])[0];
const ok=x=>{assert.ok(x);n++};
async function denied(q,a=[],code){try{await db.query(q,a)}catch(e){if(code)assert.equal(e.code,code);n++;return}throw Error('Expected denial')}
const call=(who,action,data={})=>scalar('select mailbox_v2($1,$2,$3::jsonb)',[who,action,JSON.stringify(data)]);
const deny=(who,action,data={},code)=>denied('select mailbox_v2($1,$2,$3::jsonb)',[who,action,JSON.stringify(data)],code);
(async()=>{
 await sql('tests/inkorg/fixtures.sql');await sql('tests/inkorg/sjuk-report-access.sql');await sql('tests/inkorg/certificate-access.sql');
 await sql('supabase/migrations/20261106f_inkorg_arenden.sql');await sql('supabase/migrations/20261107074022_inkorg_steg1.sql');
 await db.exec(`alter table drivers add column phone text;
 create function public.save_my_profile(p_token text,p_data jsonb) returns void language plpgsql as $$begin if p_data->>'phone'='invalid' then raise exception 'invalid_phone' using errcode='22023';end if;update public.drivers set phone=p_data->>'phone' where id=p_token;end$$;
 create function private.forum_name(id text) returns text language sql as $$select 'Test'::text$$;
 insert into drivers(id,first_name,last_name,category,company,phone) values
 ('driver','Test','Förare','standard','one','synthetic-private'),('peer','Test','Kollega','standard','one',null),
 ('owner','Test','Ägare','agare','one',null),('admin','Test','Admin','admin','one',null),('super','Test','Super','superadmin','one',null),
 ('samebolag','Test','ÅkeriTvå','standard','two',null),('outsider','Test','AnnatBolag','standard','three',null),('otheradmin','Test','AdminTvå','admin','two',null);
 insert into sessions select id,id from drivers;insert into private.feature_flags select id,'sjuk' from drivers;
 insert into dev_wishes(company_id,author_id,body) values('one','owner','Syntetiskt önskemål');`);
 await sql('supabase/migrations/20261106g_meddelanden_loner.sql');await sql('supabase/migrations/20261106g2_meddelanden_tradar.sql');
 const old=await scalar(`select conversation_create('driver','peer','Syntetisk historik','Arkiv')`);
 await sql('supabase/migrations/20261107135140_inkorg_v2_bookings_contacts.sql');
 // Reapplying the additive migration preserves data and does not broaden grants.
 await sql('supabase/migrations/20261107135140_inkorg_v2_bookings_contacts.sql');
 await db.exec(`insert into inbox_private.bolag values('other','Annat bolag');update inbox_private.operator_companies set bolag_slug='other' where company_id='three'`);
 ok(!(await scalar(`select case_admin_list('owner')`)).items.some(x=>x.kind==='wish'));
 ok(!(await scalar(`select case_inbox('driver')`)).items.some(x=>x.kind==='wish'));
 await db.exec("update drivers set activated=false where id='peer'");await deny('peer','list',{},'42501');await db.exec("update drivers set activated=true where id='peer'");
 // Existing required phone is only READ by contacts; never duplicated or edited here.
 ok((await call('driver','contacts_get')).visibility==='owner');
 for(const who of ['peer','admin','samebolag','outsider'])ok((await call(who,'contacts_get',{driver_id:'driver'})).phone===null);
 for(const who of ['owner','super','driver'])ok((await call(who,'contacts_get',{driver_id:'driver'})).phone==='synthetic-private');
 await call('driver','contacts_save',{cars:['25','025','7'],visibility:'company'});
 let c=await call('peer','contacts_get',{driver_id:'driver'});ok(c.cars.length===2);ok(c.cars.find(x=>x.number==='25').phone===('+46707650'+'025'));ok(c.phone==='synthetic-private');
 ok((await call('samebolag','contacts_get',{driver_id:'driver'})).phone===null);
 await call('driver','contacts_save',{visibility:'bolag'});
 ok((await call('samebolag','contacts_get',{driver_id:'driver'})).phone==='synthetic-private');
 ok((await call('samebolag','contacts_get',{driver_id:'driver'})).cars.length===0);
 ok((await call('outsider','contacts_get',{driver_id:'driver'})).phone===null);
 await db.exec("insert into drivers(id,category,company,phone) values('unmapped','standard','future',null);insert into sessions values('unmapped','unmapped')");
 ok((await call('unmapped','contacts_get',{driver_id:'driver'})).phone===null);
 await call('driver','contacts_save',{visibility:'owner'});ok((await call('peer','contacts_get',{driver_id:'driver'})).cars.length===2);
 await deny('driver','profile_save',{visibility:'company',profile:{phone:'invalid'}},'22023');ok((await call('driver','contacts_get')).visibility==='owner');
 await call('driver','profile_save',{visibility:'bolag',profile:{phone:'synthetic-updated'}});ok((await call('samebolag','contacts_get',{driver_id:'driver'})).phone==='synthetic-updated');
 await call('driver','profile_save',{visibility:'owner',profile:{phone:'synthetic-private'}});
 for(const cars of [['1234'],['x'],['-1'],[null]])await deny('driver','contacts_save',{cars},'22023');
 await deny('driver','contacts_save',{visibility:'all'},'22023');
 await deny('invalid','contacts_get',{},'28000');
 await deny('driver','recipients',{admin:true},'42501');
 let t=await call('driver','create',{subject:'Testärende',body:'Syntetiskt bilfel',car_number:'25',driver_id:'peer'});
 let got=await call('owner','get',{admin:true,thread_id:t.id});ok(got.driver_id==='driver');ok(got.messages.length===1);
 await deny('peer','get',{thread_id:t.id},'P0002');await deny('otheradmin','get',{admin:true,thread_id:t.id},'P0002');
 await deny('peer','reply',{thread_id:t.id,body:'Intrång'},'P0002');
 ok((await call('driver','list')).length===1);ok((await call('owner','list')).length===0);ok((await call('admin','list',{admin:true})).length===1);
 await call('admin','reply',{admin:true,thread_id:t.id,body:'Testsvaret'});ok((await call('driver','get',{thread_id:t.id})).messages.length===2);
 for(const car of ['1234','a','-1'])await deny('driver','create',{subject:'X',body:'X',car_number:car},'22023');
 ok((await call('peer','timeline',{driver_id:'driver'})).length===0);
 const date=new Date(Date.now()+86400000*2).toISOString().slice(0,10);
 let book={thread_id:t.id,date,time:'12:30',kind:'service',title:'Testbokning',car_number:'25'};
 await call('driver','book',book);let thread=await call('admin','get',{admin:true,thread_id:t.id}),b=thread.bookings[0];ok(b.status==='pending_admin');
 ok((await call('driver','timeline')).find(x=>x.id===b.id).status==='pending_admin');
 await deny('driver','decide',{booking_id:b.id,decision:'accepted'},'42501');
 await deny('otheradmin','decide',{admin:true,booking_id:b.id,decision:'accepted'},'P0002');
 await call('admin','decide',{admin:true,booking_id:b.id,decision:'accepted'});
 ok((await call('driver','timeline')).find(x=>x.id===b.id).status==='accepted');
 await deny('admin','decide',{admin:true,booking_id:b.id,decision:'declined',reason:'Test'},'42501');
 let booked=await call('admin','book',{admin:true,driver_id:'driver',date,time:'14:30',kind:'besiktning',title:'Adminbokning'});
 b=(await call('driver','get',{thread_id:booked.id})).bookings[0];ok(b.status==='pending_driver');
 await deny('admin','decide',{admin:true,booking_id:b.id,decision:'accepted'},'42501');
 await deny('driver','decide',{booking_id:b.id,decision:'declined',reason:''},'22023');
 await call('driver','decide',{booking_id:b.id,decision:'declined',reason:'Tiden passar inte (test)'});
 ok(!(await call('driver','timeline')).some(x=>x.id===b.id));ok((await call('admin','get',{admin:true,thread_id:booked.id})).bookings[0].reason.length>0);
 for(const data of [{date:'2000-01-01',time:'12:00'},{date,time:'25:00'},{date:'bad',time:'12:00'},{date:'2099-01-01',time:'12:00'},{date:'2027-03-28',time:'02:30'}])await deny('driver','book',Object.assign({},book,data));
 await deny('admin','book',{admin:true,driver_id:'samebolag',date,time:'12:00',kind:'service',title:'Fel åkeri'},'22023');
 const ownbook=await call('admin','book',{admin:true,driver_id:'owner',date,time:'16:30',kind:'service',title:'Egen tid'});
 let ownthread=await call('owner','get',{admin:true,thread_id:ownbook.id});ok(ownthread.is_driver);await call('owner','decide',{admin:true,booking_id:ownthread.bookings[0].id,decision:'accepted'});
 ok((await call('owner','list')).length===0);
 // Legacy participants can read, but neither public nor underlying DM send RPC can be called by clients.
 await db.exec('set role anon');ok((await scalar('select conversation_get($1,$2)',['driver',old])).id===old);
 await denied(`select conversation_reply('driver',$1,'Nytt')`,[old],'42501');await denied(`select messaging_private.message_send('driver','peer','Nytt')`,[],'42501');
 for(const table of ['threads','messages','bookings','contacts','operator_companies','bolag'])await denied('select * from inbox_private.'+table,[],'42501');
 ok((await call('driver','list')).length===2);await db.exec('reset role;set role authenticated');
 await denied('select * from inbox_private.contacts',[],'42501');await denied(`select conversation_create('driver','peer','X','X')`,[],'42501');ok((await call('driver','list')).length===2);await db.exec('reset role');
 // Sickness and temporary superadmin guard remain separate from ordinary admin messages.
 await db.exec(`insert into private.sick_reports(driver_id,start_date) values('driver',current_date)`);
 await denied(`select case_get('admin','sjuk',1)`,[],'42501');ok((await scalar(`select case_get('super','sjuk',1)`)).kind==='sjuk');
 await db.exec(`create or replace function private.sjuk_boss_roles() returns text[] language sql immutable set search_path='' as $$select array['agare']::text[]$$`);
 await denied(`select case_get('super','sjuk',1)`,[],'42501');ok((await call('super','list',{admin:true})).length===3);
 const before=await scalar('select count(*) from inbox_private.messages');await sql('supabase/migrations/undo/20261107135140_inkorg_v2_bookings_contacts_undo.sql');
 ok(await scalar('select count(*) from inbox_private.messages')===before);await db.exec('set role anon');await deny('driver','list',{},'42501');await db.exec('reset role');
 console.log(n+' v2 database assertions passed; migration/reapply/undo, bookings, taxi-company privacy, legacy read-only');await db.close();
})().catch(e=>{console.error(e.stack);process.exit(1)});
