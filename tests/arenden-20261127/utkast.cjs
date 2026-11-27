// Utkast: autospara i localStorage per användare, återställ, töm vid skicka, släng, Utkast-rad i listan, rensa vid utloggning. Syntetiskt.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('TaxiData/mailbox-ui.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,20));
const store={};const LS={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];},get length(){return Object.keys(store).length;},key:i=>Object.keys(store)[i]};
async function setup(admin,user,opts){
 opts=opts||{};const calls=[];
 const c={console,Intl,Date,Promise,localStorage:LS,history:{pushState(){}},document:{createElement(){return {}},head:{appendChild(){}}},window:null,location:{}};c.window=c;
 LS.setItem('taxi_driver',user);
 const thread={id:5,subject:'Verkstad',locked:false,messages:[],bookings:[]};
 c.ARENDE={esc:x=>String(x??''),WORDS:{},errText:e=>e.message,view:cs=>'<div>'+cs.id+'</div>',
  rpc:async(n,p)=>{calls.push([n,p]);
   if(n==='mailbox_v2'){switch(p.p_action){case'get':return thread;case'list':return [{id:5,subject:'Verkstad',name:'Förare',at:new Date().toISOString(),booking_states:[]}];case'mailbox_capabilities':return {can_trash:false};case'cars':return [{id:1,number:'A191'}];case'recipients':return [{id:'7',name:'Test'}];case'create':case'book':case'reply':return {id:5};default:return [];}}
   if(n==='my_recent_cars')return ['A191'];if(n==='case_admin_list'||n==='case_inbox')return {items:opts.cases||[],klar_total:0};if(n==='case_get')return {kind:p.p_kind,id:p.p_id,st:'ny',data:{}};return {items:[]};}};
 vm.createContext(c);vm.runInContext(source,c);
 const u=c.MAILBOX.create(admin,'UI');c.UI=u;
 const fields={};const mk=n=>fields[n]||(fields[n]={dataset:{mx:n},value:''});
 const box={value:'',addEventListener(ev,fn){box.fire=fn;},insertAdjacentHTML(){},dataset:{}};
 const rbox={value:''};
 const host={isConnected:true,innerHTML:'',querySelector(sel){if(sel==='#mx-form')return host.innerHTML.includes('id="mx-form"')?form:null;if(sel==='#mx-reply')return host.innerHTML.includes('id="mx-reply"')?{}:null;if(sel==='#mx-reply-body')return host.innerHTML.includes('mx-reply-body')?rbox:null;if(sel==='#mx-legacy-text')return host.innerHTML.includes('mx-legacy-text')?box:null;return null;}};
 const form={querySelectorAll(){return ['subject','body','kind','car_choice'].map(mk);},querySelector(){return {textContent:'',value:''};}};
 u.render(host);await tick();
 return {u,host,calls,mk,box,rbox,form,c};
}
const keys=()=>Object.keys(store).filter(k=>k.startsWith('taxi_mx_draft:'));
(async()=>{
 // Förare: nytt meddelande sparas medan man skriver
 let t=await setup(false,'u1');t.u.compose();await tick();
 t.mk('subject').value='Bromsar';t.mk('subject').oninput();t.mk('body').value='Det skriker';t.mk('body').oninput();
 assert.strictEqual(keys().length,1);assert(keys()[0].startsWith('taxi_mx_draft:u1:d:compose'));
 // lämna och komma tillbaka: Utkast-rad i listan, öppna återställer fälten
 t=await setup(false,'u1');t.u.enter();t.u.render(t.host);await tick();
 assert(t.host.innerHTML.includes('Utkast (1)')&&t.host.innerHTML.includes('Bromsar')&&t.host.innerHTML.includes('openDraft(0)'),'utkastrad');
 t.u.openDraft(0);await tick();
 assert(t.host.innerHTML.includes('value="Bromsar"')&&t.host.innerHTML.includes('Det skriker')&&t.host.innerHTML.includes('Utkast återställt')&&t.host.innerHTML.includes('Släng utkast'),'återställt');
 // skicka tömmer utkastet
 t.mk('subject').value='Bromsar';t.mk('body').value='Det skriker';t.form.onsubmit({preventDefault(){}});await tick();await tick();
 assert(t.calls.some(x=>x[1].p_action==='create'),'create skickades');assert.strictEqual(keys().length,0,'utkast tömt efter skickat');
 // Släng utkast i formuläret
 t=await setup(false,'u1');t.u.compose();await tick();t.mk('body').value='x';t.mk('body').oninput();assert.strictEqual(keys().length,1);t.u.dropFormDraft();assert.strictEqual(keys().length,0);assert(!t.host.innerHTML.includes('>x</textarea>'));
 // Svar i tråd: sparas, återställs, töms vid skickat
 t=await setup(false,'u1');await t.u.openThread(5);await tick();
 t.rbox.value='Hej igen';t.host.innerHTML.includes('mx-reply-body')&&(()=>{})();
 // binda oninput: paint satte box.oninput på rbox
 assert(typeof t.rbox.oninput==='function','reply oninput bunden');t.rbox.oninput();
 assert(keys().some(k=>k.includes(':reply:t:5')));
 t=await setup(false,'u1');t.u.enter();t.u.render(t.host);await tick();assert(t.host.innerHTML.includes('Utkast (1)')&&t.host.innerHTML.includes('Svar'));
 await t.u.openDraft(0);await tick();await tick();assert(t.host.innerHTML.includes('Hej igen'),'svarsutkast återställt');
 t.rbox.value='Hej igen';t.u.dropReply();assert.strictEqual(keys().length,0);
 // Annan användare ser inte utkast
 t=await setup(false,'u1');t.u.compose();await tick();t.mk('body').value='hemligt';t.mk('body').oninput();
 t=await setup(false,'u2');t.u.enter();t.u.render(t.host);await tick();assert(!t.host.innerHTML.includes('Utkast (')&&!t.host.innerHTML.includes('hemligt'),'inget läckage mellan användare');
 t.u.compose();await tick();assert(!t.host.innerHTML.includes('hemligt'));
 // Admin och förare har skilda utkast för samma id
 t=await setup(true,'u1');t.u.enter();t.u.render(t.host);await tick();assert(!t.host.innerHTML.includes('hemligt'),'admin-scope skild');
 // Bokad tid-utkast
 t=await setup(false,'u3');t.u.newBooking();await tick();t.mk('kind').value='Service';t.mk('kind').oninput();assert(keys().some(k=>k.includes(':booking:new')));
 t=await setup(false,'u3');t.u.enter();t.u.render(t.host);await tick();assert(t.host.innerHTML.includes('Bokad tid')&&t.host.innerHTML.includes('Service'));
 t.u.openDraft(0);await tick();assert(t.host.innerHTML.includes('value="Service"'),'bokningsutkast återställt');
 // Admin legacy-ärende: text i #mx-legacy-text sparas och återställs
 t=await setup(true,'adm',{cases:[{kind:'issue',id:9,title:'Felanmälan',who:'A B',st:'ny',status:'ny',at:new Date().toISOString()}]});
 t.c.ARENDE.view=cs=>'<textarea id="mx-legacy-text"></textarea>';
 await t.u.openCase('issue',9);await tick();await tick();
 t.box.value='Rickard bokar måndag';assert(t.box.fire,'input-lyssnare');t.box.fire();assert(keys().some(k=>k.includes(':a:reply:c:issue:9')));
 t.box.dataset={};t.box.value='';t.u.enter();await t.u.openCase('issue',9);await tick();await tick();assert.strictEqual(t.box.value,'Rickard bokar måndag','legacy-utkast återställt');
 // Utloggning rensar allt
 t.u.logout();assert.strictEqual(keys().length,0,'logout rensar utkast');
 console.log('PASS utkast: autospar, återställ, skicka tömmer, släng, Utkast-rad, skild per användare/roll, legacy-svar, utloggning rensar');
})().catch(e=>{console.error(e);process.exit(1)});
