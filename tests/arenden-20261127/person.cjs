// Klickbart namn i ärende (legacy: felanmälan, verkstadstid): filtrerar listan på personen. Syntetiskt.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('TaxiData/mailbox-ui.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 const now=new Date().toISOString();
 const cases=[{kind:'issue',id:1,title:'Fel A',who:'Anna Test',st:'ny',status:'ny',at:now},{kind:'wh',id:2,title:'Tid A',who:'anna test ',st:'vantar',status:'pending',at:now},{kind:'issue',id:3,title:'Fel B',who:'Bo Test',st:'ny',status:'ny',at:now}];
 const c={console,Intl,Date,Promise,history:{pushState(){}},document:{createElement(){return {}},head:{appendChild(){}}},window:null,location:{}};c.window=c;
 c.ARENDE={esc:x=>String(x??''),WORDS:{},errText:e=>e.message,view:(cs)=>'<div id="legacy-view">'+cs.id+'</div>',
  rpc:async(n,p)=>{if(n==='mailbox_v2'){if(p.p_action==='list')return [];if(p.p_action==='mailbox_capabilities')return {can_trash:true};return [];}if(n==='case_admin_list')return {items:cases,klar_total:0};if(n==='case_get')return {kind:p.p_kind,id:p.p_id,st:'ny',data:{}};return {items:cases};}};
 vm.createContext(c);vm.runInContext(source,c);
 const u=c.MAILBOX.create(true,'UI');c.UI=u;const host={isConnected:true,innerHTML:'',querySelector(){return null}};u.render(host);await tick();
 const rows=()=>(host.innerHTML.match(/<b>(Fel [AB]|Tid A)<\/b>/g)||[]).map(x=>x.replace(/<\/?b>/g,''));
 assert.deepStrictEqual(rows().sort(),['Fel A','Fel B','Tid A']);
 await u.openCase('issue',1);await tick();
 assert(/class="mx-person"[^>]*>Anna Test</.test(host.innerHTML),'namnknapp i ärendet');
 assert(host.innerHTML.includes('UI.person()'));
 u.person();await tick();
 assert(host.innerHTML.includes('Ärenden: Anna Test')&&host.innerHTML.includes('UI.clearPerson()'),'chip');
 assert.deepStrictEqual(rows().sort(),['Fel A','Tid A'],'versaler/blanksteg ignoreras, annan person dold');
 u.clearPerson();assert.deepStrictEqual(rows().sort(),['Fel A','Fel B','Tid A']);assert(!host.innerHTML.includes('mx-person-chip'));
 // filter, öppna ärende igen, gå ut och in: lista utan filter
 await u.openCase('issue',3);await tick();u.person();await tick();assert.deepStrictEqual(rows(),['Fel B']);
 u.enter();u.render(host);await tick();assert(!host.innerHTML.includes('mx-person-chip')&&rows().length===3);
 // förare ser ingen namnknapp
 const d=c.MAILBOX.create(false,'DR');c.DR=d;const h2={isConnected:true,innerHTML:'',querySelector(){return null}};d.render(h2);await tick();await d.openCase('issue',1);await tick();assert(!h2.innerHTML.includes('mx-person-line'));
 console.log('PASS person: klickbart namn, chip, kategori-oberoende filter, rensa, alltid lista vid inträde, ingen knapp för förare');
})().catch(e=>{console.error(e);process.exit(1)});
