// Egen isolerad headless-testprofil, inga sparade webbläsarsessioner eller nätanrop.
const puppeteer=require('puppeteer-core'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=process.env.SCREENSHOT_DIR||'/workspace/taxidata-cleanup/screenshots/meddelanden';fs.mkdirSync(out,{recursive:true});
const fixtures=fs.readFileSync(path.join(__dirname,'fixtures.js'),'utf8');
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURI(req.url.split('?')[0]));if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(b);});});
(async()=>{
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const br=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-gpu']});
let checks=0;const errors=[];const check=x=>{assert.ok(x);checks++};
const pause=()=>new Promise(r=>setTimeout(r,140));
async function page(role='standard',url='/TaxiData/index.html'){
 let p=await br.newPage();await p.setViewport({width:400,height:860,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 p.on('pageerror',e=>errors.push(e.message));
 await p.setRequestInterception(true);p.on('request',q=>q.url().startsWith(base)?q.continue():q.respond({status:200,contentType:'application/json',body:'{}'}));
 await p.evaluateOnNewDocument((role,fixtures)=>{
  localStorage.clear();localStorage.setItem('taxi_session','synthetic-test-fixture');localStorage.setItem('taxi_driver','900001');localStorage.setItem('taxi_logged_in','1');window.TEST_ROLE=role;
  (0,eval)(fixtures);
  document.addEventListener('DOMContentLoaded',()=>{let b=document.createElement('div');b.textContent='TESTVY · påhittade exempel · 400 px';b.style='text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:4px;';document.body.prepend(b);});
 },role,fixtures);
 await p.goto(base+url,{waitUntil:'networkidle0'});return p;
}
async function shot(p,name){await pause();check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,name+'.png'),fullPage:false});}
try{
const p=await page();await p.waitForSelector('#app',{visible:true});
check(await p.evaluate(()=>!Array.from(document.querySelectorAll('#content .label')).some(e=>/ärenden|anmälningar/i.test(e.textContent))));
await p.click('#profile-btn');await shot(p,'01-profilmeny');
check(await p.$eval('#menu-arenden',e=>e.textContent.includes('Ärenden')));
await p.click('#menu-inkorg');await p.waitForSelector('.msg-tabs');await shot(p,'02-meddelanden');
check(await p.evaluate(()=>!document.getElementById('content').textContent.includes('Utkorg')));
check(await p.evaluate(()=>document.querySelectorAll('.msg-tabs button').length===2));
await p.click('#profile-btn');await p.click('#menu-arenden');check(await p.$eval('.msg-tabs button:last-child',e=>e.getAttribute('aria-pressed')==='true'));
await p.evaluate(()=>INKORG.select('cases'));await p.waitForSelector('.ar-row');await shot(p,'03-arenden');
check(await p.evaluate(()=>!document.querySelector('.ar-row.done')));
await p.evaluate(()=>INKORG.toggleDone());check(await p.$('.ar-row.done'));await p.evaluate(()=>INKORG.toggleDone());
await p.evaluate(()=>INKORG.newCase());await shot(p,'04-nytt-arende');
await p.evaluate(()=>INKORG.report('fel'));await p.waitForSelector('#bv-save');await shot(p,'05-felanmalan');
await p.evaluate(()=>INKORG.back());await p.evaluate(()=>INKORG.compose());await p.waitForSelector('#msg-to option[value="900002"]');
await p.select('#msg-to','900002');await p.type('#msg-subject','Passbyte på fredag');await p.type('#msg-body','Exempel: Kan du byta pass på fredag?');await shot(p,'06-nytt-meddelande');
// Refresh must not destroy an unsent draft.
await p.evaluate(()=>INKORG.refresh());check(await p.$eval('#msg-body',e=>e.value.includes('byta pass')));
await p.click('#msg-compose button[type="submit"]');await p.waitForSelector('#msg-reply-form');
check(await p.evaluate(()=>MOCK.calls.filter(x=>x==='conversation_create').length===1));
await p.evaluate(()=>INKORG.readConversation(701));await p.waitForFunction(()=>document.querySelectorAll('.msg-bubble').length===2);await p.waitForFunction(()=>document.getElementById('app-toast')?.style.display==='none');await shot(p,'07-samtal');
check(await p.evaluate(()=>!!MOCK.threads[701].messages[1].read_at));
await p.type('#msg-reply-body','Ja, det går bra. (exempel)');await p.click('#msg-reply-form button');await p.waitForFunction(()=>document.querySelectorAll('.msg-bubble').length===3);
check(await p.evaluate(()=>MOCK.calls.filter(x=>x==='conversation_reply').length===1));
await p.evaluate(()=>openProfile());await p.waitForSelector('[data-a=msg]');
await p.$eval('[data-a=msg]',e=>e.scrollIntoView({block:'center'}));await shot(p,'08-profilknapp');
await p.click('[data-a=msg]');await p.waitForSelector('#msg-to');check(await p.$eval('#msg-to',e=>e.value==='900002'));await p.evaluate(()=>scrollTo(0,0));await shot(p,'09-profil-forvald');
// All report entry points reuse the production forms.
await p.evaluate(()=>INKORG.back());await p.evaluate(()=>INKORG.report('behov'));await p.waitForSelector('#bv-save');await shot(p,'10-behov');
await p.evaluate(()=>INKORG.back());await p.evaluate(()=>INKORG.report('timmar'));await p.waitForSelector('#vk-save');await shot(p,'11-verkstadstid');
await p.evaluate(()=>INKORG.back());await p.evaluate(()=>INKORG.report('sjuk'));await p.waitForSelector('#sj-new');await p.click('#sj-new');await shot(p,'12-sjukanmalan');
// Real admin.html, not a separately reimplemented mock UI.
const a=await page('agare','/TaxiData/admin.html');await a.waitForSelector('.grid');
check(await a.evaluate(()=>Array.from(document.querySelectorAll('.label')).some(e=>e.textContent==='Löner')));
check(await a.evaluate(()=>!Array.from(document.querySelectorAll('.grid .label')).some(e=>e.textContent==='Anmälningar & ärenden')));
await a.evaluate(()=>openMenu('arenden'));await a.waitForSelector('#ara-type');await shot(a,'13-admin-arenden');
await a.select('#ara-type','wh');await a.evaluate(()=>ARENDEN_ADMIN.tap('wh',211));await a.waitForSelector('.ar-tools');await shot(a,'14-admin-beslut');
check(await a.evaluate(()=>['Fråga föraren','Neka','Godkänn'].every(t=>document.querySelector('.ar-tools').textContent.includes(t))));
await a.evaluate(()=>ARENDEN_ADMIN.back());await a.waitForSelector('#ara-type');await a.select('#ara-type','wish');await shot(a,'15-admin-onskemal');
await a.select('#ara-type','maint');await shot(a,'16-admin-underhall');
await a.evaluate(()=>openMenu('loner'));await a.waitForSelector('#vka-month');check(await a.$eval('#content',e=>e.textContent.includes('(verktyg & underlag)')));await shot(a,'17-loner');
check(await a.evaluate(()=>document.querySelector('#vka-month').textContent.includes('1 400')));
await a.evaluate(()=>openMenu('verkstad'));await a.waitForSelector('#ara-type');check(await a.$eval('#title',e=>e.textContent==='Ärenden'));
const ordinary=await page('admin','/TaxiData/admin.html');await ordinary.waitForSelector('.grid');
check(await ordinary.evaluate(()=>!Array.from(document.querySelectorAll('.label')).some(e=>e.textContent==='Löner')));
await ordinary.evaluate(()=>openMenu('loner'));await ordinary.waitForFunction(()=>document.getElementById('content').textContent.includes('Ingen behörighet')); check(true);
if(errors.length) console.error('Page errors:',errors); check(errors.length===0);console.log(`${checks} browser assertions passed; 17 screenshots, actual production HTML/JS with synthetic mocked API. No live messages sent.`);
}finally{await br.close();server.close();}
})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1});
