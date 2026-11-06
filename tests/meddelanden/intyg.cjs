// Isolerat integrationstest: riktig UI + oförändrad sjuk-edge + riktiga SQL-kontroller.
// Enbart syntetiska sessioner/metadata; Storage-signeringen är stubbat. Ingen intygsfil läses.
const {PGlite}=require('@electric-sql/pglite');
const puppeteer=require('puppeteer-core'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'../..'),out=process.env.SCREENSHOT_DIR||'/workspace/taxidata-cleanup/screenshots/intyg';
fs.mkdirSync(out,{recursive:true});let checks=0,signs=0,handler,br,server,db;
const ok=x=>{assert.ok(x);checks++};
(async()=>{
 db=new PGlite();
 await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
 create table public.drivers(id text primary key,category text);
 insert into drivers values('case-owner','standard'),('other-driver','standard'),('boss-owner','agare'),('boss-super','superadmin'),('role-admin','admin'),('no-feature','standard');
 create table private.sick_reports(id bigint primary key,driver_id text);
 create table private.sick_certs(id bigint primary key,report_id bigint,path text,mime text,created_at timestamptz,uploaded_by text,uploaded boolean);
 insert into private.sick_reports values(401,'case-owner');
 insert into private.sick_certs values(1,401,'case-owner/401/synthetic-one.jpg','image/jpeg',now(),'case-owner',true),(2,401,'case-owner/401/synthetic-two.pdf','application/pdf',now(),'case-owner',true),(3,401,'case-owner/401/pending.jpg','image/jpeg',now(),'case-owner',false);
 create function private.session_actor(p_token text,out driver_id text,out category text,out via_master boolean) returns record language plpgsql as $$begin
 select d.id,d.category,false into driver_id,category,via_master from drivers d where id=p_token;
 if driver_id is null then raise exception 'invalid_session' using errcode='28000';end if;end$$;
 create function private.is_demo() returns boolean language sql as $$select coalesce(current_setting('test.demo',true),'')='on'$$;
 create function private.has_feature(p_driver text,p_feature text) returns boolean language sql as $$select p_driver<>'no-feature'$$;
 create function private.workshop_roles() returns text[] language sql immutable as $$select array['agare','superadmin']::text[]$$;`);
 const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261029f_sjukanmalan.sql'),'utf8');
 for(const name of ['private.sjuk_actor','private.sjuk_report_for','public.sjuk_svc_cert_list']){
  const start=migration.indexOf('create or replace function '+name+'(');assert.ok(start>=0);
  const end=migration.indexOf('end $$;',start);await db.exec(migration.slice(start,end+7));
 }
 await db.exec(`revoke all on function public.sjuk_svc_cert_list(text,bigint) from public,anon,authenticated;grant execute on function public.sjuk_svc_cert_list(text,bigint) to service_role;`);
 for(const role of ['anon','authenticated']){let denied=false;await db.exec('set role '+role);try{await db.query("select sjuk_svc_cert_list('case-owner',401)");}catch(e){denied=e.code==='42501';}await db.exec('reset role');ok(denied);}
 const sb={rpc:async(name,a)=>{assert.equal(name,'sjuk_svc_cert_list');try{const r=await db.query('select sjuk_svc_cert_list($1,$2) value',[a.p_token,a.p_report]);return {data:r.rows[0].value,error:null};}catch(e){return {data:null,error:{message:e.message,code:e.code}};}},storage:{from(bucket){assert.equal(bucket,'sjuk-intyg');return {async createSignedUrls(paths,ttl){assert.equal(ttl,900);signs++;return {data:paths.map(p=>({signedUrl:'https://lpfdryvukqmjlgenuzpb.supabase.co/storage/v1/object/sign/sjuk-intyg/'+p+'?synthetic='+signs})),error:null};}}}}};
 let source=fs.readFileSync(path.join(root,'supabase/functions/sjuk/index.ts'),'utf8').replace(/^import .*;\n/gm,'');
 source=stripTypeScriptTypes(source,{mode:'strip'});
 vm.runInNewContext(source,{createClient:()=>sb,webpush:{},Deno:{env:{get:()=>''},serve:f=>{handler=f}},Request,Response,Uint8Array,atob,Date,JSON,console},{filename:'production-sjuk-edge.js'});
 async function call(token,id=401){return handler(new Request('https://isolated.invalid/functions/v1/sjuk',{method:'POST',headers:{origin:'https://taxikit.shop','Content-Type':'application/json'},body:JSON.stringify({action:'list',report_id:id,token})}));}
 for(const token of ['case-owner','boss-owner','boss-super']){const r=await call(token);ok(r.status===200);const b=await r.json();ok(b.certs.length===2 && b.certs.every(x=>x.url.includes('/sign/sjuk-intyg/')));ok(b.certs.every(x=>!('path' in x)));}
 for(const token of ['other-driver','role-admin','no-feature','invalid-token','']){const before=signs,r=await call(token);ok(r.status===(token==='invalid-token'||token===''?401:403));ok(signs===before);ok(!(await r.json()).certs);}
 let before=signs;ok((await call('case-owner',99999)).status===400);ok(before===signs);
 await db.exec("set test.demo='on'");ok((await call('boss-owner')).status===403);ok(before===signs);await db.exec("set test.demo='off'");
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(b);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 br=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-gpu']});
 const fixtures=fs.readFileSync(path.join(__dirname,'fixtures.js'),'utf8'),errors=[];
 async function page(token,admin=false){
  const p=await br.newPage();await p.setViewport({width:400,height:860,deviceScaleFactor:2,isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
  await p.setRequestInterception(true);p.on('request',q=>q.url().startsWith(base)?q.continue():q.respond({status:200,contentType:'application/json',body:'{}'}));
  await p.exposeFunction('__edgeTest',async body=>{const r=await handler(new Request('https://isolated.invalid/functions/v1/sjuk',{method:'POST',headers:{origin:'https://taxikit.shop','Content-Type':'application/json'},body}));return {status:r.status,body:await r.text()};});
  await p.evaluateOnNewDocument((token,admin,fixtures)=>{
   localStorage.clear();localStorage.setItem('taxi_session',token);localStorage.setItem('taxi_driver','900001');localStorage.setItem('taxi_logged_in','1');window.TEST_ROLE=admin?'agare':'standard';(0,eval)(fixtures);
   MOCK.cases['sjuk:401']={kind:'sjuk',id:401,st:'vantar',data:{id:401,start:'2026-11-05',status:'intyg_begart',certs:2}};
   const previous=window.fetch;window.fetch=(url,opt)=>String(url).includes('/functions/v1/sjuk')?window.__edgeTest(opt.body).then(r=>new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}})):previous(url,opt);
   window.OPENED=[];window.open=()=>({opener:{},document:{title:'',body:{textContent:''}},location:{replace:u=>OPENED.push(u)},close:()=>{window.CLOSED=(window.CLOSED||0)+1;}});
   document.addEventListener('DOMContentLoaded',()=>{const label=document.createElement('div');label.textContent='TESTVY · syntetiska exempel · inga riktiga intyg';label.style='background:#243c4b;color:#fde68a;text-align:center;font:11px system-ui;padding:4px';document.body.prepend(label);});
  },token,admin,fixtures);
  await p.goto(base+(admin?'/TaxiData/admin.html':'/TaxiData/index.html'),{waitUntil:'networkidle0'});
  if(admin){await p.waitForSelector('.grid');await p.evaluate(()=>{openMenu('arenden');ARENDEN_ADMIN.tap('sjuk',401);});}
  else {await p.waitForSelector('#app',{visible:true});await p.evaluate(()=>INKORG.openCase('sjuk',401));}
  await p.waitForSelector('[data-ar-certs]');return p;
 }
 for(const [token,admin,name] of [['case-owner',false,'01-forarens-intyg'],['boss-owner',true,'02-admin-intyg']]){
  const p=await page(token,admin);await p.waitForSelector('.ar-cert-files button');
  ok(await p.$$eval('.ar-cert-files button',a=>a.length===2));ok(await p.$eval('.ar-cert-files',e=>e.textContent.includes('Intyg 1 · Bild') && e.textContent.includes('Intyg 2 · PDF')));
  ok(await p.$$eval('[data-ar-certs] img',a=>a.length===0));ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:path.join(out,name+'.png')});
  const n=signs;await p.click('.ar-cert-files button');await p.waitForFunction(()=>OPENED.length===1);ok(signs===n+1);
  await p.click('.ar-cert-files button');await p.waitForFunction(()=>OPENED.length===2);ok(signs===n+2);ok(await p.evaluate(()=>OPENED[0]!==OPENED[1]));
  ok(await p.evaluate(()=>![...Object.values(localStorage)].some(x=>x.includes('/storage/v1/object/sign/'))));
  await p.evaluate(()=>{window.open=()=>null;});await p.click('.ar-cert-files button');await p.waitForSelector('[data-ar-certs] a');
  ok(await p.$eval('[data-ar-certs] a',a=>a.target==='_blank' && a.rel==='noopener noreferrer'));
  // Permission revoked between listing and tapping: deny before signer, no file opened.
  await p.evaluate(()=>{localStorage.setItem('taxi_session','other-driver');});const k=signs;
  await p.click('.ar-cert-files button');await p.waitForFunction(()=>document.querySelector('[data-ar-certs] [role=status]').textContent.includes('inte behörighet'));ok(signs===k);ok(!(await p.$('[data-ar-certs] a')));
 }
 const stranger=await page('other-driver');const last=signs;await stranger.waitForFunction(()=>document.querySelector('[data-ar-certs]').textContent.includes('inte behörighet'));ok(await stranger.$$eval('.ar-cert-files button',a=>a.length===0));ok(signs===last);await stranger.screenshot({path:path.join(out,'03-annan-forare-nekad.png')});
 // Malformed URL returned by a signer must not navigate (javascript/data/foreign host).
 const bad=await page('case-owner');await bad.waitForSelector('.ar-cert-files button');await bad.evaluate(()=>{const old=fetch;window.fetch=(u,o)=>String(u).includes('/functions/v1/sjuk')?Promise.resolve(new Response(JSON.stringify({certs:[{id:1,mime:'image/jpeg',url:'javascript:alert(1)'}]}))):old(u,o);});await bad.click('.ar-cert-files button');await bad.waitForFunction(()=>document.querySelector('[data-ar-certs] [role=status]').textContent.includes('Kunde inte öppna'));ok(await bad.evaluate(()=>OPENED.length===0 && CLOSED===1));
 ok(errors.length===0);console.log(`${checks} certificate assertions passed; actual production driver/admin UI, edge handler and SQL checks; synthetic sessions and stubbed Storage signer; 3 mobile screenshots. No live sessions, URLs or files used.`);
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(br)await br.close();if(server)server.close();if(db)await db.close();});
