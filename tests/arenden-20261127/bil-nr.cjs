// C: Bil nr i Meddelande/Bokad tid. Nej förvalt, fråga om bilen inte körts senaste veckan (förare), ingen fråga för admin. Syntetiska data.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('TaxiData/mailbox-ui.js','utf8');
async function setup(admin,recent){
 const calls=[];
 const c={console,Intl,Date,Promise,history:{pushState(){}},document:{createElement(){return {}},head:{appendChild(){}}},window:null,location:{}};c.window=c;
 c.ARENDE={esc:x=>String(x??''),WORDS:{},errText:e=>e.message,
  rpc:async(name,p)=>{calls.push([name,p]);
   if(name==='my_recent_cars')return recent;
   if(name==='mailbox_v2'){switch(p.p_action){case'cars':return [{id:1,number:'A191'},{id:2,number:'A420'}];case'recipients':return [{id:'7',name:'Test'}];case'mailbox_capabilities':return {can_trash:admin};case'create':case'book':return {id:99};default:return [];}}
   return {items:[]};}};
 vm.createContext(c);vm.runInContext(source,c);
 const u=c.MAILBOX.create(admin,'UI');
 const fields={};let form=null;
 const mk=name=>fields[name]||(fields[name]={dataset:{mx:name},value:''});
 const host={isConnected:true,innerHTML:'',querySelector(sel){if(sel==='#mx-form')return form;if(sel==='.mx-car-confirm')return host.innerHTML.includes('mx-car-confirm')?{}:null;return null;}};
 form={querySelectorAll(){return ['car_choice','subject','body'].map(mk);},querySelector(){return {textContent:''};}};
 u.render(host);
 return {u,host,calls,mk,form};
}
const pick=async(t,v)=>{const el=t.mk('car_choice');el.value=v;el.onchange();await new Promise(r=>setImmediate(r));};
(async()=>{
 // Förare: Nej förvalt
 let t=await setup(false,['A191']);t.u.compose();await new Promise(r=>setTimeout(r,20));
 assert(/<option value="none" selected>Nej<\/option>/.test(t.host.innerHTML),'Nej ska vara förvalt');
 assert(t.host.innerHTML.includes('>A420<')&&t.host.innerHTML.includes('>A191<'),'åkeriets bilar ska listas');
 assert(!t.host.innerHTML.includes('mx-car-confirm'));
 // Bil som körts senaste veckan: ingen fråga
 await pick(t,'1');assert(!t.host.innerHTML.includes('Är det rätt bil'),'ingen fråga för körd bil');
 // Bil som inte körts: fråga
 await pick(t,'2');assert(t.host.innerHTML.includes('Du har inte kört bil A420 senaste veckan. Är det rätt bil?'),'frågan saknas');
 assert(t.host.innerHTML.includes('.carYes()')&&t.host.innerHTML.includes('.carChange()'));
 // Skicka blockeras tills Ja/Byt bil
 t.mk('subject').value='x';t.mk('body').value='y';
 t.form.onsubmit&&t.form.onsubmit({preventDefault(){}});
 assert(!t.calls.some(x=>x[0]==='mailbox_v2'&&x[1].p_action==='create'),'skicka ska blockeras innan bekräftelse');
 // Byt bil: tillbaka till Välj, ingen fråga
 t.u.carChange();assert(!t.host.innerHTML.includes('Är det rätt bil')&&/<option value="" selected>Välj/.test(t.host.innerHTML));
 // Välj igen, svara Ja: frågan försvinner och bilen behålls
 await pick(t,'2');assert(t.host.innerHTML.includes('Är det rätt bil'));
 t.u.carYes();assert(!t.host.innerHTML.includes('Är det rätt bil')&&/<option value="2" selected>/.test(t.host.innerHTML));
 t.form.onsubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 assert(t.calls.some(x=>x[0]==='mailbox_v2'&&x[1].p_action==='create'&&String(x[1].p_data.car_choice)==='2'),'create ska skickas efter Ja');
 // Okänd körhistorik (fel): ingen fråga
 t=await setup(false,null);t.u.compose();await new Promise(r=>setTimeout(r,20));await pick(t,'2');assert(!t.host.innerHTML.includes('Är det rätt bil'));
 // Tom historik: alla bilar frågar
 t=await setup(false,[]);t.u.compose();await new Promise(r=>setTimeout(r,20));await pick(t,'1');assert(t.host.innerHTML.includes('Du har inte kört bil A191'));
 // Admin: Nej förvalt men aldrig frågan, ingen recent-hämtning
 t=await setup(true,['A191']);t.u.compose();await new Promise(r=>setTimeout(r,20));
 assert(/<option value="none" selected>Nej<\/option>/.test(t.host.innerHTML));await pick(t,'2');assert(!t.host.innerHTML.includes('Är det rätt bil'));
 assert(!t.calls.some(x=>x[0]==='my_recent_cars'),'admin ska inte hämta körhistorik');
 // Bokad tid: Nej förvalt
 t=await setup(false,['A191']);t.u.newBooking();await new Promise(r=>setTimeout(r,20));assert(/<option value="none" selected>Nej<\/option>/.test(t.host.innerHTML));
 console.log('PASS bil nr: Nej förvalt, bilar listas, fråga för bil som inte körts (Ja/Byt bil), admin utan fråga, Bokad tid förvald Nej');
})().catch(e=>{console.error(e);process.exit(1)});
