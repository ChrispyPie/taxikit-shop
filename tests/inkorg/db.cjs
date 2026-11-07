// Run from any directory: NODE_PATH=<PGlite install>/node_modules node tests/inkorg/db.cjs
// In-memory PostgreSQL only. No real sessions, driver data, or network calls.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'), db=new PGlite();let checks=0;
const sql=async f=>db.exec(fs.readFileSync(path.join(root,f),'utf8'));
const scalar=async(q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
const ok=v=>{assert.ok(v);checks++};
async function denied(q,args=[],code){try{await db.query(q,args)}catch(e){if(code)assert.equal(e.code,code);checks++;return}throw Error('Expected denial: '+q)}
(async()=>{
await sql('tests/inkorg/fixtures.sql');
await sql('tests/inkorg/sjuk-report-access.sql');
await sql('tests/inkorg/certificate-access.sql');
await sql('supabase/migrations/20261106f_inkorg_arenden.sql');
await sql('supabase/migrations/20261107074022_inkorg_steg1.sql');
await db.exec(`insert into drivers(id,first_name,last_name,category,company) values
 ('driver','Test','Förare','standard','one'),('other','Test','Annan','standard','one'),
 ('owner','Test','Ägare','agare','one'),('admin','Test','Admin','admin','one'),
 ('super','Test','Super','superadmin','one'),('outsider','Test','Utanför','admin','two'),('outsideowner','Test','ÄgareTvå','agare','two');
 insert into sessions select id,id from drivers;
 insert into private.feature_flags select id,'sjuk' from drivers;
 insert into cars values (1,'TESTBIL');
 insert into car_issues(id,company_id,car_label,kind,supply_type,body,status,reported_by) values
 (101,'one','TESTBIL','fault',null,'Syntetiskt fel','ny','driver'),
 (102,'one','TESTBIL','supply','kvitto','Syntetisk förbrukning','klar','driver'),
 (103,'one','TESTBIL','fault',null,'Ägarens test','ny','owner'),
 (104,'one','TESTBIL','fault',null,'Admins test','ny','admin');
 insert into workshop_hours(id,driver_id,car_label,start_at,end_at,comment) values (101,'driver','TESTBIL',now(),now()+interval '1 hour','Testtid');
 insert into car_maintenance(id,company_id,car_id,mtype,status,suggested_by) values
 (101,'one',1,'service','forslag','driver'),(102,'one',1,'service','klar','other');
 insert into private.sick_reports(driver_id,start_date,comment) values ('driver',current_date,'Syntetisk sekretess'),('other',current_date,'Annat test');`);
await db.exec(`insert into private.sick_certs(report_id,path,mime,uploaded_by) values (1,'synthetic/test.pdf','application/pdf','driver')`);
for(const role of ['driver','owner','super'])ok((await scalar(`select sjuk_svc_cert_list($1,1)`,[role])).length===1);
for(const role of ['admin','other','outsider','outsideowner'])await denied(`select sjuk_svc_cert_list($1,1)`,[role],'42501');
ok((await scalar(`select sjuk_get('outsideowner')`)).all.length===0);
ok((await scalar(`select sjuk_get('owner')`)).all.length===2);
let inbox=await scalar(`select case_inbox('driver')`);
ok(inbox.items.length===5);ok(inbox.items.some(x=>x.category==='fault'));ok(inbox.items.some(x=>x.category==='supply'));
ok(inbox.items.some(x=>x.kind==='maint'&&x.id===101));ok(!inbox.items.some(x=>x.kind==='maint'&&x.id===102));
for(const role of ['owner','super'])ok((await scalar(`select case_inbox($1)`,[role])).items.length===0);
ok((await scalar(`select case_inbox('admin')`)).items.length===1);
for(const role of ['admin','owner','super']){
 let list=await scalar(`select case_admin_list($1)`,[role]);
 ok(list.items.some(x=>x.kind==='wh'));ok(list.items.some(x=>x.kind==='maint'));
 ok(list.items.filter(x=>x.kind==='sjuk').length===(role==='admin'?0:2));
 ok((await scalar(`select case_get($1,'issue',101)`,[role])).id===101);
 ok((await scalar(`select case_get($1,'maint',101)`,[role])).id===101);
}
for(const kind of ['issue','wh','maint','sjuk']) await denied(`select case_get('outsider',$1,$2)`,[kind,kind==='sjuk'?1:101]);
await denied(`select case_admin_list('driver')`,[],'42501');
await denied(`select case_get('admin','sjuk',1)`,[],'42501');
await denied(`select case_get('other','sjuk',1)`,[],'42501');
ok((await scalar(`select case_get('driver','sjuk',1)`)).kind==='sjuk');
await denied(`select case_get('other','maint',101)`,[],'P0002');
ok((await scalar(`select case_get('admin','wh',101)`)).kind==='wh');
for(const role of ['outsider','driver']){
 await denied(`select admin_workshop_decide($1,101,'approved','Test')`,[role]);
 await denied(`select workshop_ask($1,101,'Testfråga')`,[role]);
}
ok((await scalar(`select admin_workshop_decide('admin',101,'approved','Testbeslut')`)).status==='approved');
ok((await scalar(`select workshop_ask('admin',101,'Testfråga')`)).status==='pending');
ok((await scalar(`select case_inbox('driver')`)).items.find(x=>x.kind==='wh').st==='vantar');
ok(await scalar(`select case_seen('admin','sjuk',1)`)===0);
ok(await scalar(`select case_seen('driver','maint',101)`)===0);
await denied(`select case_seen('other','maint',101)`,[],'P0002');
// A single central change removes superadmin CONFIDENTIAL access, not ordinary case administration.
await db.exec(`create or replace function private.sjuk_boss_roles() returns text[] language sql immutable set search_path='' as $$ select array['agare']::text[] $$;`);
await denied(`select case_get('super','sjuk',1)`,[],'42501');
await denied(`select sjuk_svc_cert_list('super',1)`,[],'42501');
ok((await scalar(`select sjuk_svc_cert_list('owner',1)`)).length===1);
ok(!(await scalar(`select case_admin_list('super')`)).items.some(x=>x.kind==='sjuk'));
ok((await scalar(`select sjuk_get('super')`)).all===null);
ok((await scalar(`select case_get('owner','sjuk',1)`)).kind==='sjuk');
ok((await scalar(`select case_get('super','issue',101)`)).kind==='issue');
await scalar(`select private.sjuk_push_bosses('driver','Test','Test','test')`);
let queue=(await db.query(`select recipient from private.sjuk_push_queue`)).rows;ok(queue.length===1&&queue[0].recipient==='owner');
// Direct table access is not opened by this migration; role changes affect RPC checks only.
await db.exec(`set role anon`);await denied(`select * from car_issues`,[],'42501');await denied(`select * from private.sick_reports`,[],'42501');await denied(`select private.sjuk_boss_roles()`,[],'42501');await denied(`select sjuk_svc_cert_list('driver',1)`,[],'42501');await db.exec(`reset role`);
let count=await scalar(`select count(*) from car_issues`);
await sql('supabase/migrations/undo/20261107074022_inkorg_steg1_undo.sql');
ok(await scalar(`select count(*) from car_issues`)===count);
await denied(`select case_admin_list('admin')`,[],'42501');
ok((await scalar(`select case_inbox('owner')`)).items.length===1);
ok((await scalar(`select case_get('super','sjuk',1)`)).kind==='sjuk');
console.log(checks+' inbox database assertions passed (PGlite, synthetic fixtures, migration + undo)');
await db.close();
})().catch(e=>{console.error(e.stack);process.exit(1)});
