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
 check(await p.evaluate(()=>Array.from(document.querySelectorAll('#content .label')).some(e=>e.textContent==='Mina bevakningar')),'rutan syns för förare');await shot('01-hemskarm');
 await p.evaluate(()=>{localStorage.setItem('taxi_mb_view','list');openItem('mina-bevakningar');});await p.waitForFunction(()=>document.querySelectorAll('.mb-row').length===4);await shot('02-blandat-flode');
 check(await p.evaluate(()=>Array.from(document.querySelectorAll('.mb-time')).map(e=>e.textContent).join('|').startsWith('18:30🚆|18:40✈️|19:00🚆|19:20📅')),'sortering, försening, matchad tågnotis');
 check(await p.$eval('.mb',e=>e.textContent.includes('10 min sen')&&e.textContent.includes('Första bagage')&&e.textContent.includes('Äldre bevakning: Exempelflyg')&&e.textContent.includes('Äldre bevakning: Exempelnotis')),'status och bevakningsetiketter');
 await p.evaluate(()=>{WATCH_TEST.savedEvent={...WATCH_TEST.event};WATCH_TEST.event.starts_at='2026-11-07T18:20:00Z';WATCH_TEST.event.ends_at='2026-11-07T19:40:00Z';openItem('mina-bevakningar');});await p.waitForFunction(()=>document.querySelector('.mb')?.textContent.includes('I morgon'));check(true,'gruppering per dag');
 await p.click('[data-mb-open="0"]');await p.waitForFunction(()=>document.getElementById('title').textContent==='Ankomster');await p.waitForFunction(()=>document.querySelector('[data-ank-key^="t9991|"]')?.style.outline);check(true,'rätt tåg markerat');
 await p.evaluate(()=>openItem('mina-bevakningar'));await p.waitForSelector('[data-mb-open="3"]');await p.$eval('[data-mb-open="3"]',e=>e.scrollIntoView({block:'center'}));await new Promise(r=>setTimeout(r,100));await p.click('[data-mb-open="3"]');await p.waitForFunction(()=>document.querySelector('.kal-detail')||document.getElementById('content').textContent.includes('Exempelkonsert'));
 await p.waitForFunction(()=>WATCH_TEST.calls.some(c=>c.fn==='get_event_comments'&&c.args.p_event_id===99901));
 check(await p.evaluate(()=>WATCH_TEST.calls.some(c=>c.fn==='get_event_comments'&&c.args.p_event_id===99901)),'rätt kalenderhändelse öppnad');
 await p.evaluate(()=>{WATCH_TEST.event=WATCH_TEST.savedEvent;openItem('kalender');});await p.waitForSelector('#kal-show-watches');await p.click('#kal-show-watches');await p.waitForSelector('[data-watch]');await p.evaluate(()=>scrollTo(0,0));await shot('04-kalender-pa');
 check(await p.evaluate(()=>document.querySelectorAll('[data-watch]').length===3),'tåg och flyg i kalender');
 await p.click('[data-v="manad"]');await p.waitForSelector('.kal-month .kal-dot.kal-bevakning');check(await p.evaluate(()=>document.querySelectorAll('.kal-dot.kal-bevakning').length>0),'prickar i månad');
 await p.click('[data-v="ar"]');await p.waitForSelector('.kal-year .kal-dot.kal-bevakning');check(await p.evaluate(()=>document.querySelectorAll('.kal-dot.kal-bevakning').length>0),'prickar i år');
 await p.click('[data-v="dag"]');
 await p.evaluate(()=>openItem('kalender'));await p.waitForSelector('[data-watch]');check(await p.$eval('#kal-show-watches',e=>e.checked),'valet sparat');
 await p.click('#kal-show-watches');check(await p.evaluate(()=>!document.querySelector('[data-watch]')&&!document.querySelector('.kal-dot.kal-bevakning')),'av tar bort rader och prickar');
 await p.evaluate(()=>{WATCH_TEST.empty=true;openItem('mina-bevakningar');});await p.waitForSelector('.mb-empty');await shot('03-tomt');check(await p.$eval('.mb-empty',e=>e.textContent.includes('Inga bevakningar än')),'tomvy');
 await p.evaluate(()=>{WATCH_TEST.empty=false;WATCH_TEST.fail='watch_list';openItem('mina-bevakningar');});await p.waitForSelector('.mb-warning');check(await p.$eval('.mb-warning',e=>e.textContent.includes('ofullständig')),'fel blir inte falsk tomvy');
 await p.evaluate(()=>{WATCH_TEST.fail='';openItem('mina-bevakningar');});await p.waitForFunction(()=>document.querySelectorAll('.mb-row').length===4);
 let accept=true, confirms=[];p.on('dialog',d=>{confirms.push(d.message());accept?d.accept():d.dismiss();});
 async function tapRemove(i){await p.$eval('[data-mb-remove="'+i+'"]',e=>e.scrollIntoView({block:'center'}));await new Promise(r=>setTimeout(r,100));await p.click('[data-mb-remove="'+i+'"]');}
 accept=false;await tapRemove(3);check(await p.evaluate(()=>WATCH_TEST.event.subs.length===2),'avbryt gör ingen ändring');accept=true;
 await tapRemove(3);await p.waitForFunction(()=>document.querySelectorAll('.mb-row').length===3);
 check(await p.evaluate(()=>WATCH_TEST.calls.filter(c=>c.fn==='set_event_subscription'&&c.args.p_on===false).length===2),'alla egna påminnelser tas bort, inte evenemanget');
 await p.click('[data-mb-remove="0"]');await p.waitForFunction(()=>document.querySelectorAll('.mb-row').length===2);check(await p.evaluate(()=>WATCH_TEST.calls.some(c=>c.fn==='watch_set'&&c.args.p_on===false)),'ankomst avbevakas via befintlig RPC');
 await p.click('[data-mb-remove="1"]');await p.waitForFunction(()=>document.querySelectorAll('.mb-row').length===1);check(await p.evaluate(()=>WATCH_TEST.rules[0].enabled===false),'återkommande tågnotis pausas först efter bekräftelse');check(confirms.some(t=>t.includes('hela bevakningen')),'regelns omfattning förklaras före ändring');
 check(await p.evaluate(()=>WATCH_TEST.calls.filter(c=>['watch_list','train_watch_list','flight_watch_list','get_events'].includes(c.fn)).every(c=>c.args.p_token==='synthetic-test-fixture')),'session med varje privat läsning');
 check(await p.evaluate(async()=>{var work=MINA_BEVAKNINGAR.load(false);localStorage.setItem('taxi_session','synthetic-other-session');var rejected=await work.then(()=>false,()=>true);localStorage.setItem('taxi_session','synthetic-test-fixture');return rejected;}),'svar från tidigare session kastas');
 check(errors.length===0,errors.join(';'));console.log(`${checks} browser assertions passed; 4 screenshots 390x844. Synthetic data only, all external requests intercepted.`);
}finally{await br.close();server.close();}})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1});
