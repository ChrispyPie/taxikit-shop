// Bokad tid på felanmälan (2026-11-12svar2). Kör: node tests/arende-svar/booking-ui.cjs
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const mailbox=fs.readFileSync('TaxiData/mailbox-ui.js','utf8'),status=fs.readFileSync('TaxiData/arende-status.js','utf8');
const tick=async(n=6)=>{for(let i=0;i<n;i++)await new Promise(r=>setImmediate(r));};
// Delad påhittad server för båda sidor
function server(){const S={calls:[],bookings:[],thread:null,locked:false,missing:false};
 S.handle=async(who,name,p)=>{S.calls.push([who,name,p]);const admin=who==='owner';
  if(name==='issue_booking'){if(S.missing)throw new Error('Could not find the function public.issue_booking');const d=p.p_data;
   if(p.p_action==='links')return S.thread?[{issue_id:21,thread_id:S.thread,booking_states:S.bookings.map(b=>b.status),next_at:null,unread:false}]:[];
   if(p.p_action==='get')return {thread_id:S.thread,is_driver:who==='driver',bookings:S.bookings.map(b=>({...b}))};
   if(p.p_action==='book'){if(S.locked&&!d.admin)throw new Error('thread_closed');S.thread=S.thread||501;S.bookings.push({id:S.bookings.length+1,thread_id:S.thread,kind:d.kind,title:d.kind,starts_at:d.date+'T'+d.time+':00+01:00',car_number:d.car_choice==='7'?'A191':null,status:d.admin?'pending_driver':'pending_admin',created_at:'2026-11-12T15:00:00Z'});return {thread_id:S.thread,issue_id:21};}}
  if(name==='mailbox_v2'){const d=p.p_data;switch(p.p_action){
   case'list':return S.thread?[{id:S.thread,subject:'Felanmälan · bil A191',booking_states:[],at:'2026-11-12T15:00:00Z'}]:[];
   case'mailbox_capabilities':return {can_trash:false};case'item_flags':return [];case'item_lock':return {locked:S.locked};
   case'cars':return [{id:3,number:'A101'},{id:7,number:'A191'}];case'recipients':return [{id:'710022',name:'Christian P'},{id:'1',name:'Annan'}];
   case'decide':{const b=S.bookings.find(x=>x.id===d.booking_id);if(d.decision==='declined'&&!String(d.reason||'').trim())throw new Error('need_reason');b.status=d.decision;b.reason=d.reason||null;b.decided_at='2026-11-12T15:05:00Z';return {id:S.thread};}
   default:return {};}}
  if(name==='case_get')return {kind:'issue',id:21,st:'ny',title:'Felanmälan',data:{kind:'fault',status:'ny',car:'A191',body:'Bromsar har låtit.',created_at:'2026-11-07T01:17:36Z',reporter_name:'Christian Parsa',history:[],msgs:[]}};
  if(name==='case_seen')return {};
  return {items:name==='conversation_list'?[]:[{kind:'issue',id:21,st:'ny',car:'A191',title:'Felanmälan',txt:'Bromsar',at:'2026-11-07T01:17:36Z'}]};};
 return S;}
async function client(S,who){const admin=who==='owner';
 const c={console,Intl,Date,Promise,setTimeout,clearTimeout,localStorage:{getItem(){return ''}},history:{pushState(){}},location:{},alert(){},document:{createElement(){return {}},head:{appendChild(){}},getElementById(){return null}},window:null};c.window=c;
 vm.createContext(c);vm.runInContext(status,c);c.ARENDE.rpc=(n,p)=>S.handle(who,n,JSON.parse(JSON.stringify(p)));vm.runInContext(mailbox,c);
 const u=c.MAILBOX.create(admin,'UI');c.UI=u;const els={};
 const stub=(id)=>els[id]=els[id]||{id,value:'',textContent:'',disabled:false,dataset:{},focus(){},setAttribute(){},removeAttribute(){},querySelector:(q)=>host.querySelector(q),querySelectorAll:(q)=>q==='[data-mx]'?[...host.innerHTML.matchAll(/data-mx="([\w]+)"/g)].map(m=>{const e=stub('mx-'+m[1]);e.dataset.mx=m[1];return e;}):[]};
 const host={isConnected:true,set innerHTML(v){this._h=v;for(const k in els)delete els[k];},get innerHTML(){return this._h||'';},querySelector(sel){const m=/^#([\w-]+)$/.exec(sel);if(m&&host.innerHTML.includes('id="'+m[1]+'"'))return stub(m[1]);return null;},querySelectorAll(){return [];}};
 u.render(host);await u.refresh();await tick();return {u,host,els,c};}
(async()=>{
 const S=server();
 // Ägaren: Felanmälan har svarsruta OCH Bokad tid
 const o=await client(S,'owner');await o.u.openCase('issue',21);await tick();
 let h=o.host.innerHTML;assert(h.includes('id="mx-legacy-text"'));assert(h.includes('.issueBooking()">Bokad tid'));console.log('PASS ägaren ser svarsruta och Bokad tid');
 // Formuläret: chaufför låst till anmälaren, bil A191 förvald, Typ Verkstad
 o.u.issueBooking();await tick();h=o.host.innerHTML;
 assert(!h.includes('id="mx-driver_id"'),'ingen chaufförsväljare');assert(h.includes('Chaufför: Christian Parsa'));assert(/<option value="7" selected>A191<\/option>/.test(h),'A191 förvald');assert(h.includes('value="Verkstad"'));assert(h.includes('Föraren måste godkänna tiden.'));assert(!h.includes('id="mx-body"'),'inget separat meddelandefält');
 console.log('PASS formuläret: chaufför och bil A191 förifyllda, Typ Verkstad');
 // Skicka → pending_driver på samma felanmälan, inte till någon annan
 S.calls.length=0;
 await submitForm(o,{date:'2026-11-17',time:'08:00'});
 const book=S.calls.find(x=>x[1]==='issue_booking'&&x[2].p_action==='book');assert(book,'book skickad');assert.strictEqual(book[2].p_data.issue_id,21);assert.strictEqual(book[2].p_data.admin,true);assert.strictEqual(book[2].p_data.car_choice,'7');assert(!('driver_id' in book[2].p_data),'ingen driver_id');
 h=o.host.innerHTML;assert(h.includes('Bromsar har låtit.'),'tillbaka på felanmälan');assert(h.includes('mx-booking pending'));assert(h.includes('Väntar på förarens svar'));assert(!/decide\(1,/.test(h),'ägaren kan inte svara på sin egen inbjudan');
 console.log('PASS ägaren föreslår → pending_driver visas på samma felanmälan');
 // Listan: skuggtråden visas inte som egen rad; felanmälan visar bokad tid
 o.u.back();await o.u.refresh(true);await tick();h=o.host.innerHTML;assert(!h.includes('Felanmälan · bil A191'),'ingen dubblettrad');assert(h.includes('Bokad tid väntar på föraren'));
 console.log('PASS listan: ingen extra tråd-rad, felanmälan visar "Bokad tid väntar på föraren"');
 // Föraren: ser Acceptera/Avböj; avböj kräver orsak
 const d=await client(S,'driver');await d.u.openCase('issue',21);await tick();h=d.host.innerHTML;assert(h.includes(".decide(1,'accepted')")&&h.includes(".decide(1,'declined')"));assert(h.includes('.issueBooking()'));
 d.u.decide(1,'declined');await tick();assert(!S.calls.some(x=>x[2].p_action==='decide'),'ingen decide utan orsak');assert.strictEqual(d.els['mx-decline-error'].textContent,'Vänligen specificera orsak');
 d.u.decide(1,'accepted');await tick();assert.strictEqual(S.bookings[0].status,'accepted');h=d.host.innerHTML;assert(h.includes('mx-booking solid'));assert(h.includes('Godkänd'));
 console.log('PASS föraren: Acceptera/Avböj, avböj kräver orsak, accepterad visas fast');
 // Föraren föreslår → pending_admin, ägaren får Bekräfta
 d.u.issueBooking();await tick();assert(!d.host.innerHTML.includes('Chaufför:'));assert(d.host.innerHTML.includes('Admin måste bekräfta ditt förslag.'));
 await submitForm(d,{date:'2026-11-18',time:'13:00',car:'none'});assert.strictEqual(S.bookings[1].status,'pending_admin');
 await o.u.openCase('issue',21);await tick();h=o.host.innerHTML;assert(h.includes(".decide(2,'accepted')\">Bekräfta"));
 console.log('PASS föraren föreslår → pending_admin, ägaren ser Bekräfta');
 // Låst för föraren: ingen Bokad tid, bokningar syns men utan knappar
 S.locked=true;await d.u.openCase('issue',21);await tick();h=d.host.innerHTML;assert(!h.includes('.issueBooking()'));assert(h.includes('mx-booking'));assert(!h.includes('.decide('));assert(h.includes('Tråden är stängd'));S.locked=false;
 console.log('PASS låst ärende: föraren har ingen Bokad tid');
 // Utan servern (migreringen inte körd): svarsrutan finns, Bokad tid döljs, listan fungerar
 const S2=server();S2.missing=true;const m=await client(S2,'owner');assert(m.host.innerHTML.includes('Felanmälan'));await m.u.openCase('issue',21);await tick();assert(m.host.innerHTML.includes('id="mx-legacy-text"'));assert(!m.host.innerHTML.includes('.issueBooking()'));
 console.log('PASS utan issue_booking: svarsruta kvar, Bokad tid dold');
})().catch(e=>{console.error(e);process.exit(1)});
async function submitForm(x,{date,time,body,car}){
 x.u.pickDate(date);const set=(k,v)=>{const e=x.host.querySelector('#mx-'+k);e.value=v;e.oninput();};
 const [hh,mm]=time.split(':');set('hour',hh);set('minute',mm);if(body)set('body',body);if(car)set('car_choice',car);
 x.host.querySelector('#mx-form').onsubmit({preventDefault(){}});await tick(10);}
