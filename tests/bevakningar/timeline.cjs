// Kör produktionssidan i isolerad profil. Inga riktiga API-anrop eller personuppgifter.
const puppeteer=require('../meddelanden/node_modules/puppeteer-core'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=process.env.SCREENSHOT_DIR||'/workspace/taxidata-cleanup/screenshots/bevakningar';fs.mkdirSync(out,{recursive:true});
const core=fs.readFileSync(path.join(root,'tests/meddelanden/fixtures.js'),'utf8'),fx=fs.readFileSync(path.join(__dirname,'fixtures.js'),'utf8');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURI(req.url.split('?')[0]));if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const br=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-gpu']});let checks=0;const errors=[];const check=(x,msg)=>{assert.ok(x,msg);checks++};
try{
 const p=await br.newPage();await p.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
 await p.setRequestInterception(true);p.on('request',q=>q.url().startsWith(base)?q.continue():q.respond({status:200,contentType:'application/json',body:'{}'}));
 await p.evaluateOnNewDocument((core,fx)=>{localStorage.clear();localStorage.setItem('taxi_session','synthetic-test-fixture');localStorage.setItem('taxi_driver','900001');localStorage.setItem('taxi_theme','dark');localStorage.setItem('taxi_logged_in','1');window.TEST_ROLE='standard';(0,eval)(core);(0,eval)(fx);document.addEventListener('DOMContentLoaded',()=>{const b=document.createElement('div');b.textContent='TESTVY · påhittade exempel';b.style='text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:4px';document.body.prepend(b);});},core,fx);
 await p.goto(base+'/TaxiData/index.html',{waitUntil:'networkidle0'});
 async function shot(name){check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'ingen sidscroll');await p.screenshot({path:path.join(out,name+'.png')});}
 await p.waitForSelector('#app',{visible:true});
 await p.evaluate(()=>{
   const t=WATCH_TEST,iso=(h,m=0,day=6)=>new Date(Date.UTC(2026,10,day,h-1,m)).toISOString();
   t.rules=[];t.trains=t.trains.slice(0,1);t.trains[0].sched=iso(18,20);t.trains[0].est=iso(18,30);t.watches[0].sched=iso(18,20);
   t.flights[0]={id:'TEST42',sched:iso(19,45),est:iso(19,55),other:'Exempelö',status:'SCH'};t.watches[1].sched=iso(19,45);t.watches[1].expires_at=iso(23);t.watches[1].state={};
   t.event.starts_at=iso(21,30);t.event.ends_at=iso(22,30);t.event.title='Exempelkonsert';
   t.extraEvents=[{...t.event,id:99902,title:'Exempelmässa i morgon',starts_at:iso(11,0,7),ends_at:iso(13,0,7)}];
   const prev=window.fetch;window.fetch=async function(url,opt){const r=await prev(url,opt);if(String(url).endsWith('/get_events')){const d=await r.json();d.events=d.events.concat(t.extraEvents);return new Response(JSON.stringify(d),{status:200,headers:{'Content-Type':'application/json'}});}return r;};
   openItem('mina-bevakningar');
 });
 await p.waitForSelector('.mb-now');await p.waitForSelector('.mb-block');
 check(await p.$eval('[data-mb-view="timeline"]',e=>e.getAttribute('aria-pressed')==='true'),'tidslinje är standard');
 check(await p.evaluate(()=>document.querySelectorAll('.mb-hour').length===49),'hela dygnets tim- och halvtimmeslinjer');
 check(await p.evaluate(()=>{const line=document.querySelector('.mb-now').getBoundingClientRect(),v=document.querySelector('.mb-timeline-scroll').getBoundingClientRect();return line.top>v.top&&line.top<v.bottom;}),'auto-skroll till nu');
 check(await p.evaluate(()=>document.querySelectorAll('.mb-gap').length>=1),'lediga luckor');
 check(await p.$eval('[data-mb-day]',e=>!!e.querySelector('.mb-daydot')),'prick på dag med bevakningar');
 await shot('05-tidslinje-blandat');
 // Samtidiga poster ska få åtskilda kolumner, inte ligga på varandra.
 await p.evaluate(()=>{WATCH_TEST.event.starts_at='2026-11-06T17:30:00Z';WATCH_TEST.event.ends_at='2026-11-06T19:30:00Z';openItem('mina-bevakningar');});
 await p.waitForFunction(()=>Array.from(document.querySelectorAll('.mb-block')).some(e=>+e.dataset.columns===2));
 check(await p.evaluate(()=>{const a=document.querySelector('[data-mb-block="0"]').getBoundingClientRect(),b=document.querySelector('[data-mb-block="1"]').getBoundingClientRect();return a.right<=b.left||b.right<=a.left;}),'överlappande block bredvid varandra');
 check(await p.evaluate(()=>{const e=Array.from(document.querySelectorAll('.mb-block-event')).find(e=>e.textContent.includes('Exempelkonsert'));return Math.abs(e.getBoundingClientRect().height-177)<1;}),'två timmar ger proportionell höjd');
 await shot('06-tidslinje-overlapp');
 // Dagsteget visar nästa dag och placerar den första posten inom synhåll.
 await p.click('[data-mb-step="1"]');await p.waitForFunction(()=>document.querySelector('.mb-days').textContent.includes('I morgon'));
 check(await p.evaluate(()=>!document.querySelector('.mb-now')),'ingen falsk nu-linje på morgondagen');
 check(await p.evaluate(()=>document.querySelectorAll('.mb-block').length===1),'bara vald dags poster');
 check(await p.$eval('.mb-days',e=>!!e.querySelector('b .mb-daydot')),'vald dag har prick');
 check(await p.evaluate(()=>{const b=document.querySelector('.mb-block').getBoundingClientRect(),v=document.querySelector('.mb-timeline-scroll').getBoundingClientRect();return b.top>v.top&&b.top<v.bottom;}),'morgondagens första post syns automatiskt');
 await shot('07-tidslinje-imorgon');
 await p.click('[data-mb-step="-1"]');await p.waitForSelector('.mb-now');
 await p.$eval('.mb-timeline-scroll',e=>{e.scrollTop=1000});const before=await p.$eval('.mb-timeline-scroll',e=>e.scrollTop);
 await p.click('[data-mb-refresh]');await p.waitForFunction(()=>document.querySelectorAll('.mb-block').length===3);
 check(await p.$eval('.mb-timeline-scroll',(e,before)=>e.scrollTop===before,before),'uppdatering behåller skrollposition');
 // Menyn tar inte bort något vid avbryt, och källknappen öppnar samma mål som listan.
 await p.$eval('[data-mb-menu="0"]',e=>e.scrollIntoView({block:'center'}));await new Promise(r=>setTimeout(r,80));await p.click('[data-mb-menu="0"]');await p.waitForSelector('.mb-action-sheet');
 check(await p.$eval('.mb-action-sheet',e=>e.textContent.includes('Sluta bevaka')),'meny med sluta bevaka');
 await p.click('[data-mb-cancel]');check(await p.evaluate(()=>!document.querySelector('.mb-action-sheet')&&WATCH_TEST.watches.length===2),'avbryt ändrar inget');
 await p.click('[data-mb-view="list"]');await p.waitForSelector('.mb-row');check(await p.evaluate(()=>!document.querySelector('.mb-timeline-scroll')),'lista finns kvar');await p.evaluate(()=>scrollTo(0,0));await shot('08-listval');
 await p.evaluate(()=>openItem('mina-bevakningar'));await p.waitForSelector('.mb-row');check(await p.$eval('[data-mb-view="list"]',e=>e.getAttribute('aria-pressed')==='true'),'listvalet sparas per enhet');
 await p.click('[data-mb-view="timeline"]');await p.waitForSelector('.mb-block');await p.$eval('.mb-block-tag .mb-block-open',e=>e.scrollIntoView({block:'center'}));await new Promise(r=>setTimeout(r,80));await p.click('.mb-block-tag .mb-block-open');await p.waitForFunction(()=>document.getElementById('title').textContent==='Ankomster');check(true,'block öppnar källverktyget');
 await p.evaluate(()=>openItem('mina-bevakningar'));await p.waitForSelector('.mb-block-tag');
 await p.$eval('.mb-block-tag .mb-block-menu',e=>e.scrollIntoView({block:'center'}));await new Promise(r=>setTimeout(r,80));await p.click('.mb-block-tag .mb-block-menu');await p.waitForSelector('.mb-action-sheet');
 p.on('dialog',d=>d.accept());await p.click('.mb-action-sheet [data-mb-remove]');await p.waitForFunction(()=>WATCH_TEST.watches.length===1);
 check(await p.evaluate(()=>WATCH_TEST.calls.some(c=>c.fn==='watch_set'&&c.args.p_on===false)),'avbevaka från blockmenyn använder samma RPC');
 check(errors.length===0,errors.join(';'));console.log(`${checks} timeline browser assertions passed; 4 synthetic screenshots 390x844.`);
}finally{await br.close();server.close();}})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1});
