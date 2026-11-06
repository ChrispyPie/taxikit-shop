// Isolerad PGlite med enbart syntetiska förare; inga nätanrop eller riktiga sessioner.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
const db=new PGlite(); let checks=0;
const ok=(v)=>{assert.ok(v);checks++;};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function denied(sql,args=[],code){try{await db.query(sql,args);}catch(e){if(code)assert.equal(e.code,code);checks++;return;}throw Error('Expected denial: '+sql);}
await db.exec(`
create role anon; create role authenticated; create schema private;
create table public.drivers(id text primary key,first_name text,last_name text,category text,activated boolean,company text);
create table public.workshop_hours(id bigint generated always as identity primary key,driver_id text,start_at timestamptz,end_at timestamptz,status text,rate numeric);
create function private.session_actor(p_token text,out driver_id text,out category text,out via_master boolean) returns record language plpgsql as $$ begin
 select d.id,d.category,(p_token='master') into driver_id,category,via_master from public.drivers d where d.id=case when p_token='master' then 'sender' else p_token end;
 if driver_id is null then raise exception 'invalid_session' using errcode='28000';end if; end $$;
create function private.is_demo() returns boolean language sql as $$select coalesce(current_setting('test.demo',true),'')='on'$$;
create function private.demo_write_guard() returns trigger language plpgsql as $$begin if private.is_demo() then raise exception 'demo_read_only';end if;return null;end$$;
create function private.forum_name(p_id text) returns text language sql as $$select first_name||' '||left(last_name,1)||'.' from public.drivers where id=p_id$$;
create function private.actor_company(p_id text) returns text language sql as $$select company from public.drivers where id=p_id$$;
create function private.bil_actor(p_token text,out driver_id text,out category text,out company_id text,out is_admin boolean,out via_master boolean) returns record language plpgsql as $$begin
 select a.driver_id,a.category,private.actor_company(a.driver_id),a.category in('agare','superadmin'),a.via_master into driver_id,category,company_id,is_admin,via_master from private.session_actor(p_token) a;end$$;
create function private.workshop_rate() returns numeric language sql as $$select 200::numeric$$;
create function private.wh_minutes(w public.workshop_hours) returns integer language sql as $$select extract(epoch from(w.end_at-w.start_at))::int/60$$;
insert into drivers values
 ('sender','Testa','Exempel','standard',true,'one'),('recipient','Prova','Exempel','standard',true,'one'),
 ('stranger','Annan','Exempel','standard',true,'two'),('owner','Ägare','Exempel','agare',true,'one'),
 ('super','Super','Exempel','superadmin',true,'one'),('admin','Admin','Exempel','admin',true,'one'),
 ('inactive','Avslut','Exempel','standard',false,'one'),('ended','Slutat','Exempel','avslutad',true,'one');
`);
await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261106g_meddelanden_loner.sql'),'utf8'));
const names=await scalar(`select message_recipients('sender')`);
ok(names.some(x=>x.name==='Prova E.'));ok(!names.some(x=>x.id==='sender'||x.id==='inactive'||x.id==='ended'));ok(names.find(x=>x.id==='admin').admin);
for(const who of ['master','ended']) await denied(`select message_list($1,'in')`,[who],'42501');
await denied(`select message_list('invalid','in')`,[],'28000');
for(const to of ['sender','missing','inactive','ended',null]) await denied(`select message_send('sender',$1,'Exempel')`,[to],'22023');
for(const body of ['', '   ', 'x'.repeat(2001), null]) await denied(`select message_send('sender','recipient',$1)`,[body],'22023');
let id=await scalar(`select message_send('sender','recipient','   Testmeddelande   ')`);
let list=await scalar(`select message_list('recipient','in')`);ok(list.unread===1 && list.items[0].body==='Testmeddelande');
ok((await scalar(`select message_list('sender','out')`)).items[0].id===id);
ok((await scalar(`select message_list('stranger','in')`)).items.length===0);
for(const who of ['stranger','owner','super','admin']) await denied(`select message_read($1,$2)`,[who,id],'P0002');
ok((await scalar(`select message_read('sender',$1)`,[id])).read_at===null);
ok((await scalar(`select message_read('recipient',$1)`,[id])).read_at!==null);
ok((await scalar(`select message_list('recipient','in')`)).unread===0);
let read=await scalar(`select message_read('recipient',$1)`,[id]);ok((await scalar(`select message_read('recipient',$1)`,[id])).read_at===read.read_at);
await db.exec(`set role anon`);
for(const sql of [`select * from direct_messages`,`insert into direct_messages(sender_id,recipient_id,body) values('sender','recipient','x')`,`update direct_messages set body='x'`,`delete from direct_messages`]) await denied(sql,[],'42501');
ok((await scalar(`select message_list('sender','out')`)).items.length===1);
await denied(`select messaging_private.message_actor('sender')`,[],'42501');
await db.exec(`reset role;set role authenticated`);await denied(`select * from direct_messages`,[],'42501');ok((await scalar(`select message_list('recipient','in')`)).items.length===1);await db.exec(`reset role`);
await db.exec(`insert into direct_messages(sender_id,recipient_id,body) select 'sender','recipient','Paginering' from generate_series(1,65)`);
list=await scalar(`select message_list('recipient','in')`);let page2=await scalar(`select message_list('recipient','in',$1)`,[list.next]);ok(list.items.length===50 && page2.items.length===16);ok(!list.items.some(x=>page2.items.some(y=>x.id===y.id)));
await db.exec(`insert into direct_messages(sender_id,recipient_id,body) select 'sender','recipient','Gräns' from generate_series(1,34)`);
await denied(`select message_send('sender','recipient','Över gränsen')`,[],'54000');
await db.exec(`insert into workshop_hours(driver_id,start_at,end_at,status,rate) values
 ('sender','2026-11-01 00:30+01','2026-11-01 02:30+01','approved',150),
 ('recipient','2026-11-30 23:30+01','2026-12-01 00:30+01','approved',200),
 ('sender','2026-11-03 10:00+01','2026-11-03 11:00+01','pending',200),
 ('stranger','2026-11-01 01:00+01','2026-11-01 06:00+01','approved',300),
 ('sender','2026-10-31 23:00+01','2026-11-01 00:00+01','approved',200)`);
for(const who of ['sender','recipient','admin','stranger'])await denied(`select payroll_month($1,'2026-11-01')`,[who],'42501');
for(const who of ['owner','super']){let p=await scalar(`select payroll_month($1,'2026-11-01')`,[who]);ok(p.totals.length===2);ok(p.totals.find(x=>x.driver_id==='sender').approved_kr===300);ok(p.totals.find(x=>x.driver_id==='sender').pending_min===60);ok(p.totals.find(x=>x.driver_id==='recipient').approved_kr===200);}
await denied(`select payroll_month('owner',null)`,[],'22023');
await db.exec(`set test.demo='on'`);await denied(`select message_send('sender','recipient','demo')`,[],'42501');await denied(`select payroll_month('owner','2026-11-01')`,[],'42501');await db.exec(`set test.demo='off'`);
ok(await scalar(`select relrowsecurity from pg_class where oid='direct_messages'::regclass`));
// Apply the design-change extension and test subject threads with a fresh sender budget.
await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261106g2_meddelanden_tradar.sql'),'utf8'));
let cid=await scalar(`select conversation_create('recipient','sender',' Passbyte ','Första meddelandet')`);
let conv=await scalar(`select conversation_list('sender')`);ok(conv.items[0].subject==='Passbyte');ok(conv.items[0].incoming && conv.unread===1);
for(const who of ['stranger','owner','super','admin']){await denied(`select conversation_get($1,$2)`,[who,cid],'P0002');await denied(`select conversation_reply($1,$2,'Inbrott')`,[who,cid],'P0002');ok((await scalar(`select conversation_list($1)`,[who])).items.length===0);}
let got=await scalar(`select conversation_get('recipient',$1)`,[cid]);ok(got.messages.length===1 && got.messages[0].read_at===null);
got=await scalar(`select conversation_get('sender',$1)`,[cid]);ok(got.messages[0].read_at!==null);ok((await scalar(`select conversation_list('sender')`)).unread===0);
// Sender has hit the daily budget; recipient can still reply on their own budget.
await denied(`select conversation_reply('sender',$1,'Över gränsen')`,[cid],'54000');
await scalar(`select conversation_reply('recipient',$1,'Andra meddelandet')`,[cid]);
got=await scalar(`select conversation_get('sender',$1)`,[cid]);ok(got.messages.length===2 && got.messages[1].body==='Andra meddelandet');
conv=await scalar(`select conversation_list('recipient')`);ok(conv.items[0].incoming===false && conv.items[0].unread===0);
for(const subject of ['', 'x'.repeat(121),null])await denied(`select conversation_create('recipient','sender',$1,'Test')`,[subject],'22023');
await db.exec(`set role anon`);for(const sql of [`select * from message_conversations`,`insert into message_conversations(started_by,recipient_id,subject) values('recipient','sender','x')`,`update message_conversations set subject='x'`,`delete from message_conversations`])await denied(sql,[],'42501');
ok((await scalar(`select conversation_list('sender')`)).items.length===1);await db.exec(`reset role`);
await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/undo/20261106g2_meddelanden_tradar_undo.sql'),'utf8'));
ok(Number(await scalar(`select count(*) from message_conversations`))===1);
await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/undo/20261106g_meddelanden_loner_undo.sql'),'utf8'));
ok(Number(await scalar(`select count(*) from direct_messages`))===102);
await db.exec(`set role anon`);await denied(`select message_list('sender','out')`,[],'42501');await db.exec(`reset role`);
console.log(`${checks} database assertions passed (isolated PostgreSQL/PGlite; synthetic fixtures only)`);await db.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
