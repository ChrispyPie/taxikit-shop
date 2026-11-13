// Ärenden › Felanmälan (2026-11-12svar1): svarsruta i stället för "Äldre bilärende – bara läsning".
// Kör: node tests/arende-svar/ui.cjs  (från repo-roten, inga beroenden)
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const mailbox=fs.readFileSync('TaxiData/mailbox-ui.js','utf8'),status=fs.readFileSync('TaxiData/arende-status.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function el(){return {value:'',disabled:false,focus(){},setAttribute(){},removeAttribute(){}};}
async function setup(admin,opt){
 opt=opt||{};const calls=[];let msgs=[];
 const issue=()=>({kind:'issue',id:21,st:opt.st||'ny',title:'Felanmälan',data:{kind:'fault',status:opt.status||'ny',car:'A191',body:'Bromsar har låtit i flera veckor.',created_at:'2026-11-07T01:17:36Z',reporter_name:'Christian Parsa',photos:1,history:[{status:'ny',at:'2026-11-07T01:17:36Z'}],msgs:msgs.slice()}});
 const cases=[{kind:'issue',id:21,st:'ny',car:'A191',title:'Felanmälan',txt:'Bromsar har låtit',at:'2026-11-07T01:17:36Z'},{kind:'maint',id:4,st:'pagar',car:'A191',title:'Service',at:'2026-11-06T10:00:00Z'}];
 const store={};const c={console,Intl,Date,Promise,setTimeout,clearTimeout,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v},history:{pushState(){}},location:{},alert(){},document:{createElement(){return {}},head:{appendChild(){}},getElementById(){return null}},window:null};c.window=c;
 vm.createContext(c);vm.runInContext(status,c);
 c.ARENDE.rpc=async(name,p)=>{calls.push([name,p]);
  if(name==='mailbox_v2'){switch(p.p_action){case'list':return [];case'mailbox_capabilities':return {can_trash:admin};case'item_flags':return [];case'item_lock':return {locked:!!opt.locked};default:return {};}}
  if(name==='case_get')return issue();
  if(name==='case_seen')return {};
  if(name==='car_issue_message'){if(opt.fail)throw new Error('need_text');msgs.push({role:admin?'owner':'driver',who:admin?'Berra':'Christian Parsa',at:'2026-11-12T14:00:00Z',body:p.p_body});return {};}
  return {items:name==='conversation_list'?[]:cases};};
 vm.runInContext(mailbox,c);const u=c.MAILBOX.create(admin,'UI');c.UI=u;
 const box=el();const host={isConnected:true,innerHTML:'',querySelector(s){return s==='#mx-legacy-text'&&host.innerHTML.includes('id="mx-legacy-text"')?box:null;},querySelectorAll(){return [];}};
 u.render(host);await u.refresh();await tick();
 return {u,host,calls,box,c};
}
(async()=>{
 // (d) listan: en felanmälan är inte "Arkiv", underhåll får behålla det
 {const {host}=await setup(true);const html=host.innerHTML;const row=html.slice(html.indexOf('Felanmälan'));
  assert(html.includes('Bil A191 · Ny'),'list meta');assert(!/Bil A191 · Ny · Arkiv/.test(html),'issue not Arkiv');assert(html.includes('Pågår · Arkiv'),'maint keeps Arkiv');console.log('PASS (d) listan visar inte Arkiv på felanmälan');}
 // (a)+(b) admin: svarsruta, ingen "Äldre bilärende", skickar car_issue_message och visar svaret i tråden
 {const {u,host,calls,box}=await setup(true);await u.openCase('issue',21);await tick();
  let h=host.innerHTML;assert(!h.includes('Äldre bilärende'),'no legacy note');assert(h.includes('id="mx-legacy-text"')&&h.includes('maxlength="1000"'),'textarea');assert(h.includes('Meddelande till föraren'));assert(h.includes('Skicka meddelande'));assert((h.match(/class="tk-ev"/g)||[]).length===1&&h.includes('Bromsar har låtit i flera veckor.'),'första inlägget är en händelse i tråden (chatt1)');
  console.log('PASS (a) admin ser svarsruta, inte "Äldre bilärende"');
  box.value='   ';u.legacyAct('issue_message');assert(!calls.some(x=>x[0]==='car_issue_message'),'empty not sent');assert(host.innerHTML.includes('Skriv något först.'));
  box.value='Rickard har bokat verkstad på måndag kl 8.';u.legacyAct('issue_message');await tick();await tick();await tick();await tick();
  const call=calls.find(x=>x[0]==='car_issue_message');assert(call,'rpc called');assert.strictEqual(call[1].p_id,21);assert.strictEqual(call[1].p_body,'Rickard har bokat verkstad på måndag kl 8.');
  h=host.innerHTML;assert(h.includes('Rickard har bokat verkstad på måndag kl 8.'),'thread shows new message');assert(!h.includes('Inga meddelanden än.'));assert(calls.filter(x=>x[0]==='case_get').length>=2,'re-opened');
  console.log('PASS (b) Skicka anropar car_issue_message {p_id,p_body} och tråden visar svaret');}
 // föraren (ej låst): "Svara" / "Skicka svar"
 {const {u,host,calls,box}=await setup(false);await u.openCase('issue',21);await tick();const h=host.innerHTML;assert(h.includes('>Svara<')&&h.includes('Skicka svar'));assert(!h.includes('Äldre bilärende'));
  box.value='Tack!';u.legacyAct('issue_message');await tick();await tick();assert(calls.some(x=>x[0]==='car_issue_message'&&x[1].p_body==='Tack!'));console.log('PASS föraren kan svara på sin felanmälan');}
 // (c) låst tråd: föraren läser bara, admin kan fortfarande skriva
 {const {u,host}=await setup(false,{locked:true});await u.openCase('issue',21);await tick();const h=host.innerHTML;assert(h.includes('Tråden är stängd'));assert(!h.includes('id="mx-legacy-text"'));console.log('PASS (c) låst ärende är bara läsning för föraren');}
 {const {u,host}=await setup(true,{locked:true});await u.openCase('issue',21);await tick();assert(host.innerHTML.includes('id="mx-legacy-text"'));console.log('PASS (c) admin kan skriva även när låst');}
 // klar: får skriva, med kort notis
 {const {u,host}=await setup(true,{st:'klar',status:'klar'});await u.openCase('issue',21);await tick();const h=host.innerHTML;assert(h.includes('Ärendet är redan klart'));assert(h.includes('id="mx-legacy-text"'));console.log('PASS klart ärende: notis + svarsruta');}
 // fel från servern: texten ligger kvar och felet visas
 {const {u,host,box}=await setup(true,{fail:true});await u.openCase('issue',21);await tick();box.value='hej';u.legacyAct('issue_message');await tick();await tick();assert(host.innerHTML.includes('Skriv något först.'));assert.strictEqual(box.value,'hej');console.log('PASS serverfel visas, texten ligger kvar');}
})().catch(e=>{console.error(e);process.exit(1)});
