const assert=require('node:assert/strict'),{boot}=require('../lazy-views/dom.cjs');const pause=()=>new Promise(r=>setTimeout(r,45));
(async()=>{
 const a=await boot(),w=a.w,original=w.fetch,urls=[];w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const stations=[{id:'G',label:'Göteborg C'},{id:'Mdn',label:'Mölndal'},{id:'Gas',label:'Gamlestaden'},{id:'Kb',label:'Kungsbacka'},{id:'P',label:'Partille'},{id:'A',label:'Alingsås'},{id:'Yb',label:'Ytterby'},{id:'Än',label:'Älvängen'}];let resolveGas=null,holdGas=false;
 const sched=new Date(Date.now()+30*60000).toISOString(),est=new Date(Date.now()+40*60000).toISOString();
 w.fetch=async(url,opts)=>{url=String(url);if(!url.includes('/api/trains'))return original(url,opts);urls.push(url);const params=new URL(url).searchParams,id=params.get('station')||'G';if(holdGas&&id==='Gas')await new Promise(r=>{resolveGas=r;});const data=params.has('stations')?{stations}:{stationSignature:id,updated:new Date().toISOString(),trains:[{id:'123',dir:'ANK',other:'Fixture '+id,sched,est},{id:'456',dir:'ANK',other:'Inställt fixture',sched,canceled:true}]};return {ok:true,status:200,json:async()=>data};};
 function pickStation(id){w.document.querySelector('[data-ank-picker]').click();}
 await w.openItem('ankomster');await pause();
 assert.equal(w.document.querySelectorAll('[data-ank-station]').length,0,'quick-pick row removed');
 assert(w.document.querySelector('.ank-station-picker-label').textContent.includes('Station'));
 assert.equal(w.document.querySelector('[data-ank-picker] .ank-station-title-label').textContent.trim(),'Göteborg C');
 assert(w.document.querySelector('[data-ank-picker] .ank-station-caret'));
 w.document.querySelector('[data-ank-picker]').click();await pause();
 assert(w.document.querySelector('hr.ank-station-divider'));
 const top=w.document.querySelectorAll('.ank-station-quick-list [data-station-pick]');
 assert(w.document.querySelector('.ank-station-quick-list [data-station-pick="G"] small').textContent.trim()==='G','signatures stay visible');
 assert([...top].every(b=>b.classList.contains('ank-station-pick-quick')));
 assert.deepEqual([...top].map(b=>b.getAttribute('data-station-pick')),['G','Mdn','Gas','Kb','P','A']);
 w.document.querySelector('[data-station-pick="Kb"]').click();await pause();
 assert(w.document.querySelector('[data-ank-picker]').textContent.includes('Kungsbacka'));assert(w.document.body.textContent.includes('Fixture Kb'));assert(w.document.body.textContent.includes('+10 min'));assert(w.document.body.textContent.includes('Inställt'));assert.equal(w.VIEW_STATE.get('ankomster',{}).station,'Kb');
 w.document.querySelector('[data-ank-picker]').click();await pause();const input=w.document.querySelector('#ank-station-search');input.value='molndal';input.dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelectorAll('[data-station-pick]').length,1);assert.equal(w.document.querySelector('[data-station-pick]').getAttribute('data-station-pick'),'Mdn');input.value='mdn';input.dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelectorAll('[data-station-pick]').length,1);assert.equal(w.document.querySelector('[data-station-pick]').getAttribute('data-station-pick'),'Mdn');assert(w.document.querySelector('[data-station-pick] small').textContent.trim()==='Mdn');input.value='alvangen';input.dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelectorAll('[data-station-pick]').length,1);assert.equal(w.document.querySelector('[data-station-pick]').getAttribute('data-station-pick'),'Än');input.value='ytterby';input.dispatchEvent(new w.Event('input'));w.document.querySelector('[data-station-pick="Yb"]').click();await pause();assert(!w.document.querySelector('dialog.ank-station-sheet'));assert(w.document.querySelector('[data-ank-picker]').textContent.includes('Ytterby'));
 holdGas=true;w.document.querySelector('[data-ank-picker]').click();await pause();w.document.querySelector('[data-station-pick="Gas"]').click();await pause();w.document.querySelector('[data-ank-picker]').click();await pause();w.document.querySelector('[data-station-pick="Kb"]').click();await pause();resolveGas();await pause();assert(w.document.body.textContent.includes('Fixture Kb'));assert(!w.document.body.textContent.includes('Fixture Gas'),'late response cannot replace current station');
 w.document.querySelector('[data-ank-tab="flyg"]').click();await pause();assert(w.document.body.textContent.includes('Landvetter'));assert(!w.document.querySelector('[data-ank-picker]'));w.document.querySelector('[data-ank-tab="tag"]').click();await pause();assert(w.document.querySelector('[data-ank-picker]').textContent.includes('Kungsbacka'));
 assert(urls.some(u=>u.endsWith('?station=Kb')));assert.equal(urls.filter(u=>u.includes('?stations=1')).length,1,'catalog reused');assert.deepEqual(a.errors,[]);
 // An old API must never show Göteborg's board labelled as Kungsbacka.
 w.fetch=async()=>({ok:true,json:async()=>({station:'Göteborg C',trains:[]})});await assert.rejects(w.ARRIVAL_DATA.loadTrains('Kb'),/uppdaterad tågtjänst/);
 const saved={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);saved[k]=w.localStorage.getItem(k);}a.dom.window.close();const b=await boot(saved);await pause();assert(b.w.document.querySelector('[data-ank-picker]').textContent.includes('Kungsbacka'));assert.deepEqual(b.errors,[]);b.dom.window.close();
 console.log('PASS station picker/quick list/search accents/dynamic Ytterby, station persistence/reload, flight isolation, +10/Inställt, late response guard and old-API safety');
})().catch(e=>{console.error(e);process.exitCode=1;});
