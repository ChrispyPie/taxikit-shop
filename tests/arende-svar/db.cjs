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
 await db.exec(`alter table drivers add column phone text;alter table cars add column company_id text;
 insert into cars(id,bilnummer,company_id) values(1,'25','one'),(2,'7','one'),(3,'999','two');
 create function public.save_my_profile(p_token text,p_data jsonb) returns void language plpgsql as $$begin if p_data->>'phone'='invalid' then raise exception 'invalid_phone' using errcode='22023';end if;update public.drivers set phone=p_data->>'phone' where id=p_token;end$$;
 create function private.forum_name(id text) returns text language sql as $$select 'Test'::text$$;
 insert into drivers(id,first_name,last_name,category,company,phone) values
 ('driver','Test','Förare','standard','one','synthetic-private'),('peer','Test','Kollega','standard','one',null),
 ('owner','Test','Ägare','agare','one',null),('admin','Test','Admin','admin','one',null),('super','Test','Super','superadmin','one',null),
 ('samebolag','Test','ÅkeriTvå','standard','two',null),('outsider','Test','AnnatBolag','standard','three',null),('otheradmin','Test','AdminTvå','admin','two',null);
 insert into sessions select id,id from drivers;insert into private.feature_flags select id,'sjuk' from drivers;
 insert into dev_wishes(company_id,author_id,body) values('one','owner','Syntetiskt önskemål');`);
 await sql('supabase/migrations/20261106g_meddelanden_loner.sql');await sql('supabase/migrations/20261106g2_meddelanden_tradar.sql');
 await sql('supabase/migrations/20261107135140_inkorg_v2_bookings_contacts.sql');
 await sql('supabase/migrations/20261107191553_admin_arenden_filters_unread.sql');await sql('supabase/migrations/20261107191742_mailbox_bulk_preferences.sql');
 await sql('supabase/migrations/20261112d_arende_bokad_tid.sql');await sql('supabase/migrations/20261112d_arende_bokad_tid.sql'); // går att köra två gånger
 // Bokad tid på felanmälan (2026-11-12svar2). Föraren 'driver' anmälde bil 25; 'owner' (agare) är admin.
 const issue=await scalar(`insert into car_issues(company_id,car_id,car_label,kind,body,reported_by) values('one',1,'25','fault','Bromsarna låter (syntetiskt)','driver') returning id`);
 const other=await scalar(`insert into car_issues(company_id,car_id,car_label,kind,body,reported_by) values('one',2,'7','fault','Annan förares','peer') returning id`);
 const ib=(who,action,data={})=>scalar('select issue_booking($1,$2,$3::jsonb)',[who,action,JSON.stringify(data)]);
 const ibDeny=(who,action,data={},code)=>denied('select issue_booking($1,$2,$3::jsonb)',[who,action,JSON.stringify(data)],code);
 const day=await scalar(`select to_char((clock_timestamp() at time zone 'Europe/Stockholm')::date+3,'YYYY-MM-DD')`);
 let g=await ib('owner','get',{admin:true,issue_id:issue});ok(g.thread_id===null);ok(g.bookings.length===0);ok(g.is_driver===false);
 // Behörighet: annan förare, annat åkeri, låtsas-admin
 await ibDeny('peer','get',{issue_id:issue},'P0002');await ibDeny('otheradmin','get',{admin:true,issue_id:issue},'P0002');await ibDeny('driver','get',{admin:true,issue_id:issue},'42501');
 await ibDeny('peer','book',{issue_id:issue,kind:'Verkstad',date:day,time:'09:00',car_choice:'1'},'P0002');await ibDeny('invalid','get',{issue_id:issue},'28000');
 // Ägaren föreslår → pending_driver, tråd till anmälaren, kopplad till ärendet
 let r=await ib('owner','book',{admin:true,issue_id:issue,driver_id:'peer',kind:'Verkstad',date:day,time:'09:00',car_choice:'1',body:'Passar det?'});
 ok(r.thread_id>0);ok(await scalar(`select driver_id from inbox_private.threads where id=$1`,[r.thread_id])==='driver');
 ok(await scalar(`select subject from inbox_private.threads where id=$1`,[r.thread_id])==='Felanmälan · bil 25');
 g=await ib('driver','get',{issue_id:issue});ok(g.thread_id===r.thread_id);ok(g.is_driver);ok(g.bookings.length===1&&g.bookings[0].status==='pending_driver'&&g.bookings[0].car_number==='25');ok(!('proposed_by' in g.bookings[0]));
 // Samma tråd återanvänds, ingen dubblett
 await ib('driver','book',{issue_id:issue,kind:'Verkstad',date:day,time:'13:00',car_choice:'none'});
 g=await ib('owner','get',{admin:true,issue_id:issue});ok(g.bookings.length===2&&g.bookings[1].status==='pending_admin'&&g.bookings[1].car_number===null);ok(await scalar(`select count(*)::int from inbox_private.issue_threads`)===1);
 // Fel datum rullar tillbaka allt (ingen tom tråd)
 await ibDeny('peer','book',{issue_id:other,kind:'X',date:'2000-01-01',time:'09:00',car_choice:'2'},'22023');ok(await scalar(`select count(*)::int from inbox_private.threads where driver_id='peer'`)===0);
 // Bekräfta/Avböj via den vanliga mailbox_v2 'decide'
 await deny('driver','decide',{booking_id:g.bookings[0].id,decision:'declined',reason:' '},'22023');
 await deny('owner','decide',{admin:true,booking_id:g.bookings[0].id,decision:'accepted'},'42501');
 await call('driver','decide',{booking_id:g.bookings[0].id,decision:'accepted'});
 await call('owner','decide',{admin:true,booking_id:g.bookings[1].id,decision:'declined',reason:'Verkstaden har stängt'});
 g=await ib('driver','get',{issue_id:issue});ok(g.bookings[0].status==='accepted');ok(g.bookings[1].status==='declined'&&g.bookings[1].reason==='Verkstaden har stängt');
 // Schemat/Prognos: accepterad bokning syns i förarens timeline
 ok((await call('driver','timeline')).some(x=>x.id===g.bookings[0].id&&x.status==='accepted'));
 // Listan: kopplingen och bokningsstatus, bara för behöriga
 let l=await ib('owner','links',{admin:true});ok(l.length===1&&l[0].issue_id===issue&&l[0].thread_id===r.thread_id&&l[0].booking_states.length===2);
 ok((await ib('driver','links')).length===1);ok((await ib('peer','links')).length===0);ok((await ib('otheradmin','links',{admin:true})).length===0);
 // Låst ärende: föraren kan inte boka, admin kan
 await db.exec(`insert into inbox_private.party_deletions(company_id,kind,item_id,owner_hidden) values('one','issue',${issue},true)`);
 await ibDeny('driver','book',{issue_id:issue,kind:'Verkstad',date:day,time:'10:00',car_choice:'1'},'42501');
 await ib('owner','book',{admin:true,issue_id:issue,kind:'Verkstad',date:day,time:'10:00',car_choice:'1'});
 // Rättigheter: tabellen nås inte direkt
 ok(!(await scalar(`select has_table_privilege('anon','inbox_private.issue_threads','select')`)));ok(await scalar(`select has_function_privilege('anon','public.issue_booking(text,text,jsonb)','execute')`));
 // Ångra
 await sql('supabase/migrations/undo/20261112d_arende_bokad_tid_undo.sql');ok(await scalar(`select to_regprocedure('public.issue_booking(text,text,jsonb)') is null`));ok(await scalar(`select count(*)::int from inbox_private.bookings`)===3);
 console.log('PASS arende-svar db: '+n+' kontroller');
})().catch(e=>{console.error(e);process.exit(1)});
