// Villkor för tågbevakningar (12 nov): Ankomster har bara kryssruta + länk, Mina bevakningar har standard
// och egna villkor per avgång. Isolerad profil, påhittade exempel, inga riktiga API-anrop.
// Kör: node tests/bevakningar/villkor-browser.cjs   (SCREENSHOT_DIR=… för bilder)
const puppeteer=require('../meddelanden/node_modules/puppeteer-core'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=process.env.SCREENSHOT_DIR||'/workspace/anim-preview/tag-ljudvillkor';fs.mkdirSync(out,{recursive:true});
const core=fs.readFileSync(path.join(root,'tests/meddelanden/fixtures.js'),'utf8'),fx=fs.readFileSync(path.join(__dirname,'fixtures.js'),'utf8');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURI(req.url.split('?')[0]));if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(b);});});
const theme=process.env.THEME||'dark', sfx=theme==='dark'?'':'-'+theme;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const br=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-gpu']});let checks=0;const errors=[];const check=(x,msg)=>{assert.ok(x,msg);checks++};
try{
 const p=await br.newPage();await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
 await p.setRequestInterception(true);p.on('request',q=>q.url().startsWith(base)?q.continue():q.respond({status:200,contentType:'application/json',body:'{}'}));
 const villkorMock=()=>{
   window.VILLKOR_SRV={data:null,saves:0,missing:false};
   const prev=window.fetch;
   window.fetch=function(url,opt){
     const m=/\/rpc\/(bev_villkor_get|bev_villkor_save)$/.exec(String(url));
     if(!m)return prev(url,opt);
     const S=window.VILLKOR_SRV;
     if(S.missing)return Promise.resolve(new Response(JSON.stringify({code:'PGRST202',message:'not found'}),{status:404,headers:{'Content-Type':'application/json'}}));
     if(m[1]==='bev_villkor_save'){S.saves++;S.data=JSON.parse(opt.body).p_data;}
     return Promise.resolve(new Response(JSON.stringify(m[1]==='bev_villkor_get'?S.data:S.data),{status:200,headers:{'Content-Type':'application/json'}}));
   };
   window.AUDIO_N=0;const AC=window.AudioContext||window.webkitAudioContext;if(AC){const co=AC.prototype.createOscillator;AC.prototype.createOscillator=function(){window.AUDIO_N++;return co.apply(this,arguments);};}const A=window.Audio;window.Audio=function(src){const a=new A();a.play=()=>Promise.reject(new Error('test'));return a;};
 };
 await p.evaluateOnNewDocument((core,fx,vm,theme)=>{if(!sessionStorage.getItem('kept')){localStorage.clear();sessionStorage.setItem('kept','1');}localStorage.setItem('taxi_session','synthetic-test-fixture');localStorage.setItem('taxi_driver','900001');localStorage.setItem('taxi_theme',theme);localStorage.setItem('taxi_logged_in','1');localStorage.setItem('ank_tab','tag');localStorage.setItem('taxi_animationer',JSON.stringify({on:false}));window.TEST_ROLE='standard';(0,eval)(core);(0,eval)(fx);(0,eval)('('+vm+')()');document.addEventListener('DOMContentLoaded',()=>{const b=document.createElement('div');b.textContent='TESTVY · påhittade exempel';b.style='text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:4px';document.body.prepend(b);});},core,fx,villkorMock.toString(),theme);
 await p.goto(base+'/TaxiData/index.html',{waitUntil:'networkidle0'});
 await p.waitForSelector('#app',{visible:true});
 async function shot(name){await p.evaluate(()=>{const t=document.getElementById('bev-toast');if(t)t.classList.remove('show');});await new Promise(r=>setTimeout(r,250));check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'ingen sidscroll '+name);await p.screenshot({path:path.join(out,name+sfx+'.png')});}
 const wait=ms=>new Promise(r=>setTimeout(r,ms));

 // ---------- Ankomster: bara kryssruta och länk ----------
 await p.evaluate(()=>openItem('ankomster'));
 await p.waitForSelector('#bev-ljud-box .tv-ank');
 const ank=await p.evaluate(()=>{const b=document.querySelector('#bev-ljud-box');const c=document.getElementById('content');return {
   boxes:b.querySelectorAll('input[type=checkbox]').length, links:b.querySelectorAll('[data-tv-open]').length, buttons:b.querySelectorAll('button').length,
   nums:c.querySelectorAll('input[type=number]').length, card:!!c.querySelector('.tv-card,.tv-form,.tv-sheet'), text:b.textContent.trim(), checked:b.querySelector('[data-tv-sound]').checked};});
 check(ank.boxes===1&&ank.links===1&&ank.buttons===1,'Ankomster: en kryssruta och en länk, inget mer ('+JSON.stringify(ank)+')');
 check(ank.nums===0&&!ank.card,'Ankomster: inga minutfält eller paneler');
 check(/Ljud för tåg/.test(ank.text)&&/Specificera villkor i Mina bevakningar/.test(ank.text),'texten');
 check(ank.checked,'ljud på som standard');
 await p.evaluate(()=>scrollTo(0,0));await shot('01-ankomster-tag');
 // Av/på sparas i standarden, i Tågljud och hos servern
 await p.click('[data-tv-sound]');await wait(150);
 check(await p.evaluate(()=>TAG_VILLKOR.get().tag.default.sound===false&&BEV_LJUD.enabled('tag')===false),'ljud av: standard + Tågljud');
 check(await p.evaluate(()=>VILLKOR_SRV.saves>=1&&VILLKOR_SRV.data.tag.default.sound===false),'sparas hos servern');
 check(await p.evaluate(()=>JSON.parse(localStorage.getItem('taxi_bev_villkor:900001')).tag.default.sound===false),'sparas i telefonen per förare');
 // ljud i appen: tyst när av
 await p.evaluate(()=>{const f=Date.now,t0=performance.now(),b=f();window._dateNow=f;Date.now=()=>b+Math.round(performance.now()-t0);});
 const n0=await p.evaluate(()=>{AUDIO_N=0;BEV_LJUD.playFromMessage({tag:'tag-1',title:'🚆 Tåg 1 har ankommit',body:''});return new Promise(r=>setTimeout(()=>r(AUDIO_N),300));});
 check(n0===0,'ljud av: ingen ton (äldre push utan v)');
 await p.click('[data-tv-sound]');await wait(150);
 check(await p.evaluate(()=>TAG_VILLKOR.get().tag.default.sound===true&&BEV_LJUD.enabled('tag')===true),'ljud på igen');
 const plays=await p.evaluate(async()=>{const r={};const t=m=>new Promise(ok=>{AUDIO_N=0;BEV_LJUD.playFromMessage(m);setTimeout(()=>ok(AUDIO_N),1500);});
   r.silent=await t({tag:'tag-2',title:'🕒 Tåg 2: ny tid 19:00',body:'Planerad 18:00, försenat 60 min.',v:1,silent:true});
   r.loud=await t({tag:'tag-3',title:'🕒 Tåg 3: ny tid 19:00',body:'Planerad 18:00, försenat 60 min.',v:1,silent:false});
   r.oldSmall=await t({tag:'tag-4',title:'🕒 Tåg 4: ny tid 18:12',body:'Planerad 18:00, försenat 12 min.'});
   r.oldBig=await t({tag:'tag-5',title:'🕒 Tåg 5: ny tid 19:00',body:'Planerad 18:00, försenat 60 min.'});
   r.flyg=await t({tag:'flyg-SK1',title:'🛬 SK1 har landat 18:00',body:''});return r;});
 check(plays.silent===0,'push silent: inget ljud i appen');
 check(plays.loud>0,'push med ljud: ljud');
 await p.evaluate(()=>{Date.now=window._dateNow;});
 check(plays.oldSmall===0&&plays.oldBig>0,'äldre server: 12 min tyst, 60 min ljud');
 check(plays.flyg>0,'flyg som förut');

 // ---------- Länken öppnar Mina bevakningar med standarden ----------
 await p.click('[data-tv-open]');
 await p.waitForFunction(()=>document.getElementById('title').textContent==='Mina bevakningar');
 await p.waitForSelector('#tv-card form[data-tv-default]');
 check(await p.evaluate(()=>document.querySelector('#tv-card [data-tv-toggle]').getAttribute('aria-expanded')==='true'),'villkoren öppna efter länken');
 const vals=await p.evaluate(()=>Object.fromEntries(['lead_min','small_min','big_min','jump_min'].map(k=>[k,document.querySelector('#tv-card [name='+k+']').value])));
 check(JSON.stringify(vals)===JSON.stringify({lead_min:'30',small_min:'15',big_min:'30',jump_min:'15'}),'nya tystare standarden visas: '+JSON.stringify(vals));
 check(await p.evaluate(()=>!document.querySelector('#mb-ljud-box [data-bljud-k="tag"]')),'Tågljud inte dubbelt (flyg och båt som förut)');
 await p.evaluate(()=>scrollTo(0,0));await wait(100);await shot('02-mina-bevakningar-standard');
 // fritt antal minuter
 await p.evaluate(()=>{const f=document.querySelector('#tv-card form');f.lead_min.value='';});await p.type('#tv-card [name=lead_min]','20');
 await p.evaluate(()=>{const f=document.querySelector('#tv-card form');f.small_min.value='';});await p.type('#tv-card [name=small_min]','10');
 await p.evaluate(()=>{const f=document.querySelector('#tv-card form');f.big_min.value='';});await p.type('#tv-card [name=big_min]','45');
 await p.click('#tv-card .tv-save');await wait(150);
 check(await p.evaluate(()=>{const d=TAG_VILLKOR.get().tag.default;return d.lead_min===20&&d.small_min===10&&d.big_min===45&&d.jump_min===15;}),'egna siffror sparade');
 check(await p.evaluate(()=>VILLKOR_SRV.data.tag.default.lead_min===20),'servern har standarden');
 // felaktigt värde
 await p.evaluate(()=>{document.querySelector('#tv-card [name=lead_min]').value='abc';});await p.click('#tv-card .tv-save');
 check(await p.$eval('#tv-card .tv-err',e=>/hela minuter/.test(e.textContent)),'felmeddelande för text');
 await p.evaluate(()=>{document.querySelector('#tv-card [name=lead_min]').value='20';});

 // ---------- Egna villkor för en avgång (Schema) ----------
 await p.evaluate(()=>{localStorage.setItem('taxi_mb_view','list');openItem('mina-bevakningar');});
 await p.waitForSelector('.mb-row [data-mb-villkor]');
 const idx=await p.evaluate(()=>{const b=Array.from(document.querySelectorAll('.mb-row')).find(r=>r.textContent.includes('9991'));return b?b.querySelector('[data-mb-villkor]').dataset.mbVillkor:null;});
 check(idx!==null,'🔔 på tågavgången i Schema');
 check(await p.evaluate(()=>Array.from(document.querySelectorAll('.mb-row')).filter(r=>r.querySelector('[data-mb-villkor]')).every(r=>/🚆/.test(r.textContent))),'bara tåg har 🔔');
 await p.click('[data-mb-villkor="'+idx+'"]');
 await p.waitForSelector('.tv-sheet form');
 check(await p.evaluate(()=>document.querySelector('.tv-sheet').textContent.includes('Följer standarden')),'följer standarden innan');
 check(await p.evaluate(()=>document.querySelector('.tv-sheet [name=lead_min]').value==='20'),'förifyllt med standarden');
 await p.evaluate(()=>{const f=document.querySelector('.tv-sheet form');f.lead_min.value='45';f.sound.checked=false;});
 await shot('03-avgang-egna-villkor');
 await p.click('.tv-sheet .tv-save');await wait(200);
 const key=await p.evaluate(()=>TAG_VILLKOR.depKey('9991',WATCH_TEST.trains[0].sched));
 check(await p.evaluate(k=>{const d=TAG_VILLKOR.get().tag.dep[k];return d&&d.lead_min===45&&d.sound===false&&d.small_min===10;},key),'avgångens villkor sparade');
 check(await p.evaluate(()=>{const r=TAG_VILLKOR.settingsFor({ident:'9991',sched:WATCH_TEST.trains[0].sched});const o=TAG_VILLKOR.settingsFor({ident:'9992',sched:WATCH_TEST.trains[1].sched});return r.source==='dep'&&r.settings.sound===false&&o.source==='default'&&o.settings.lead_min===20;}),'avgången går före standarden, andra följer standarden');
 await p.waitForFunction(()=>document.querySelector('.mb').textContent.includes('Egna villkor'));
 check(true,'Schema visar Egna villkor');
 await p.evaluate(()=>{const r=Array.from(document.querySelectorAll('.mb-row')).find(r=>r.textContent.includes('Egna villkor'));r.scrollIntoView({block:'center'});});await wait(100);await shot('05-schema-egna-villkor');
 check(await p.evaluate(k=>!!VILLKOR_SRV.data.tag.dep[k],key),'servern har avgångens villkor');
 // fast bevakning: välj bara den här eller varje gång
 const pidx=await p.evaluate(()=>{const b=Array.from(document.querySelectorAll('.mb-row.mb-row-perm')).find(r=>r.querySelector('[data-mb-villkor]'));return b?b.querySelector('[data-mb-villkor]').dataset.mbVillkor:null;});
 check(pidx!==null,'fast tågbevakning har 🔔');
 await p.click('[data-mb-villkor="'+pidx+'"]');await p.waitForSelector('.tv-sheet [name=scope]');
 await p.click('.tv-sheet [name=scope][value=route]');await p.waitForSelector('.tv-sheet [name=scope][value=route]:checked');
 await p.evaluate(()=>{const f=document.querySelector('.tv-sheet form');f.jump_min.value='25';});
 await shot('04-fast-bevakning-varje-gang');
 await p.click('.tv-sheet .tv-save');await wait(200);
 check(await p.evaluate(()=>{const d=TAG_VILLKOR.get().tag.dep.rw1;return d&&d.jump_min===25;}),'fasta bevakningens villkor (rw1)');
 // tillbaka till standard för avgången
 await p.click('[data-mb-villkor="'+idx+'"]');await p.waitForSelector('.tv-sheet [data-tv-std]');
 await p.click('.tv-sheet [data-tv-std]');await wait(200);
 check(await p.evaluate(k=>!TAG_VILLKOR.get().tag.dep[k],key),'Använd standard tar bort avgångens villkor');

 // tidslinjen: ⋯ har samma val
 await p.evaluate(()=>{localStorage.setItem('taxi_mb_view','timeline');openItem('mina-bevakningar');});await p.waitForSelector('.mb-block-tag [data-mb-menu]');
 await p.$eval('.mb-block-tag [data-mb-menu]',e=>e.click());await p.waitForSelector('.mb-action-sheet [data-mb-villkor]');
 check(await p.$eval('.mb-action-sheet [data-mb-villkor]',e=>e.textContent==='Ljud och notiser för den här avgången'),'⋯ i tidslinjen');
 await p.$eval('.mb-action-sheet [data-mb-villkor]',e=>e.click());await p.waitForSelector('.tv-sheet form');check(await p.evaluate(()=>!document.querySelector('.mb-action-sheet')),'menyn stängs, villkoren öppnas');
 await p.evaluate(()=>TAG_VILLKOR.closeSheet());
 // ---------- finns kvar efter omladdning, även utan servern (migrationen inte körd) ----------
 await p.reload({waitUntil:'networkidle0'});await p.waitForSelector('#app',{visible:true});
 check(await p.evaluate(()=>TAG_VILLKOR.get().tag.default.lead_min===20&&!!TAG_VILLKOR.get().tag.dep.rw1),'kvar efter omladdning');
 await p.evaluate(()=>{VILLKOR_SRV.missing=true;localStorage.removeItem('taxi_bev_villkor:900001');TAG_VILLKOR.resetLocal();});
 check(await p.evaluate(()=>{const d=TAG_VILLKOR.get().tag.default;return d.small_min===15&&d.big_min===30&&d.lead_min===30;}),'inget sparat: nya tystare standarden');
 await p.evaluate(()=>TAG_VILLKOR.setDefault({lead_min:40}));await wait(150);
 check(await p.evaluate(()=>TAG_VILLKOR._state.srv==='missing'&&JSON.parse(localStorage.getItem('taxi_bev_villkor:900001')).tag.default.lead_min===40),'utan servern: sparas i telefonen');
 // annan förare på samma telefon får egna (standard)
 await p.evaluate(()=>{localStorage.setItem('taxi_driver','900002');});
 check(await p.evaluate(()=>TAG_VILLKOR.get().tag.default.lead_min===30),'annan förare: egna villkor');
 await p.evaluate(()=>{localStorage.setItem('taxi_driver','900001');});
 check(errors.length===0,'inga sidfel: '+errors.join(' | '));
 console.log('PASS villkor-browser: '+checks+' checks ('+theme+'), bilder i '+out);
}catch(e){console.error(e);console.error('sidfel:',errors);process.exitCode=1;}finally{await br.close();server.close();}})();
