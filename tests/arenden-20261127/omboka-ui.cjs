// D: Avboka / Föreslå ny tid i Bokad tid (förare och admin, även godkänd tid). Syntetiska data.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('TaxiData/mailbox-ui.js','utf8');
const future=h=>new Date(Date.now()+h*3600000).toISOString();
const tick=()=>new Promise(r=>setImmediate(r));
async function setup(admin,bookings,locked){
 const calls=[];
 const c={console,Intl,Date,Promise,history:{pushState(){}},document:{createElement(){return {}},head:{appendChild(){}}},window:null,location:{}};c.window=c;
 const thread={id:5,subject:'Verkstad',locked:!!locked,messages:[],bookings};
 c.ARENDE={esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),WORDS:{},errText:e=>e.message,
  rpc:async(name,p)=>{calls.push([name,p]);
   if(name==='mailbox_v2'){switch(p.p_action){case'get':return thread;case'mailbox_capabilities':return {can_trash:admin};case'rebook':case'cancel':case'decide':return {id:5};default:return [];}}
   return {items:[]};}};
 vm.createContext(c);vm.runInContext(source,c);
 const u=c.MAILBOX.create(admin,'UI');c.UI=u;
 const els={reply:{value:'',setAttribute(){},removeAttribute(){},focus(){}},err:{textContent:''}};
 const fields={};const mk=n=>fields[n]||(fields[n]={dataset:{mx:n},value:''});
 let form=null;
 const host={isConnected:true,innerHTML:'',querySelector(sel){if(sel==='#mx-reply-body')return host.innerHTML.includes('mx-reply-body')?els.reply:null;if(sel==='#mx-decline-error')return els.err;if(sel==='#mx-form')return host.innerHTML.includes('id="mx-form"')?form:null;if(sel==='.mx-server-error')return els.err;return null;}};
 form={querySelectorAll(){return ['body','hour','minute'].map(mk);},querySelector(){return {textContent:'',value:'09'};}};
 u.render(host);await u.openThread(5);await tick();await tick();
 return {u,host,calls,els,mk,form,thread};
}
const B=(id,status,extra)=>Object.assign({id,status,kind:'Service',title:'Service',starts_at:future(48),created_at:future(-5),proposer_role:'admin'},extra||{});
const acts=t=>t.calls.filter(x=>x[0]==='mailbox_v2'&&['cancel','rebook','decide'].includes(x[1].p_action));
(async()=>{
 // Godkänd tid: förare ser Avboka + Föreslå ny tid
 let t=await setup(false,[B(1,'accepted')]);
 assert(t.host.innerHTML.includes('.cancel(1)')&&t.host.innerHTML.includes('.rebook(1)'),'knappar på godkänd tid (förare)');
 // Avboka utan orsak: röd varning, inget anrop
 t.u.cancel(1);assert.equal(t.els.err.textContent,'Vänligen specificera orsak');assert.equal(acts(t).length,0);
 // Med orsak: cancel skickas med orsak
 t.els.reply.value='Är sjuk';t.u.cancel(1);await tick();
 const cc=acts(t)[0];assert(cc&&cc[1].p_action==='cancel'&&cc[1].p_data.booking_id===1&&cc[1].p_data.reason==='Är sjuk'&&cc[1].p_data.admin===false);
 // Admin: godkänd och väntande tid får båda knapparna
 t=await setup(true,[B(2,'accepted'),B(3,'pending_driver')]);
 assert(t.host.innerHTML.includes('.cancel(2)')&&t.host.innerHTML.includes('.rebook(2)')&&t.host.innerHTML.includes('.cancel(3)')&&t.host.innerHTML.includes('.rebook(3)'));
 // Väntar på mitt svar: Acceptera/Avböj finns kvar tillsammans med nya knappar
 t=await setup(false,[B(4,'pending_driver')]);
 assert(t.host.innerHTML.includes(".decide(4,'accepted')")&&t.host.innerHTML.includes(".decide(4,'declined')")&&t.host.innerHTML.includes('.rebook(4)'));
 // Avbokade/ombokade/avböjda tider får inga knappar och visar status
 t=await setup(true,[B(5,'cancelled'),B(6,'rebooked'),B(7,'declined')]);
 assert(!t.host.innerHTML.includes('.cancel(')&&!t.host.innerHTML.includes('.rebook('));
 // Passerad tid: inga knappar
 t=await setup(false,[B(8,'accepted',{starts_at:future(-5)})]);assert(!t.host.innerHTML.includes('.cancel(8)'));
 // Låst tråd: förare inga knappar, admin får
 t=await setup(false,[B(9,'accepted')],true);assert(!t.host.innerHTML.includes('.cancel(9)')&&!t.host.innerHTML.includes('.rebook(9)'));
 t=await setup(true,[B(9,'accepted')],true);assert(t.host.innerHTML.includes('.cancel(9)'));
 // Omboka: formulär utan typ/bil, kräver datum och tid, skickar rebook och återgår till tråden
 t=await setup(false,[B(10,'accepted')]);
 t.u.rebook(10);await tick();
 assert(t.host.innerHTML.includes('Föreslå ny tid')&&t.host.innerHTML.includes('Nuvarande tid:')&&!t.host.innerHTML.includes('data-mx="kind"')&&!t.host.innerHTML.includes('mx-car'),'ombokningsformulär');
 t.form.onsubmit({preventDefault(){}});assert.equal(acts(t).length,0,'datum krävs');
 t.mk('body').value='Passar bättre';t.mk('body').oninput();
 const key=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
 t.u.pickDate(key);t.mk('hour').value='09';t.mk('hour').onchange();
 t.form.onsubmit({preventDefault(){}});await tick();await tick();
 const rb=acts(t)[0];
 assert(rb&&rb[1].p_action==='rebook'&&rb[1].p_data.booking_id===10&&rb[1].p_data.date===key&&rb[1].p_data.body==='Passar bättre'&&rb[1].p_data.admin===false,'rebook-anrop '+JSON.stringify(rb));
 // Tillbaka-knappen från formuläret går till tråden
 t=await setup(false,[B(11,'accepted')]);t.u.rebook(11);await tick();t.u.back();await tick();await tick();
 assert(t.calls.filter(x=>x[1].p_action==='get').length>=2,'tillbaka öppnar tråden igen');
 // Admin: ombokning ger pending för föraren via servern, samma anrop utan förarfält
 t=await setup(true,[B(12,'accepted')]);t.u.rebook(12);await tick();assert(t.host.innerHTML.includes('Föraren måste godkänna'));
 console.log('PASS omboka-ui: Avboka med orsak (röd varning utan), Föreslå ny tid (godkänd/väntande), knappar dolda för avbokad/ombokad/passerad/låst (förare), admin ok, ombokningsformulär + rebook-anrop');
})().catch(e=>{console.error(e);process.exit(1)});
