// Avsluta/öppna igen en felanmälan (bilärende) direkt i Admin › Ärenden. Syntetiska data, ingen riktig användare.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('TaxiData/mailbox-ui.js','utf8');
async function run(admin,status){
 let calls=[];let cur=status;
 const c={console,Intl,Date,Promise,history:{pushState(){}},document:{createElement(){return {}},head:{appendChild(){}}},window:null};c.window=c;
 c.ARENDE={esc:x=>String(x??''),WORDS:{},errText:e=>e.message,st:(k,s)=>s==='ny'?'ny':s==='pagar'?'pagar':'klar',
  view:()=>'<div class="ar-card"></div>',
  rpc:async(name,p)=>{calls.push([name,p]);
   if(name==='case_get')return {kind:'issue',id:21,st:cur==='ny'?'ny':cur==='pagar'?'pagar':'klar',admin,data:{id:21,status:cur,car:'A1',msgs:[],history:[]}};
   if(name==='set_car_issue_status'){if(!admin)throw new Error('forbidden');cur=p.p_status;return {id:21,status:cur};}
   if(name==='mailbox_v2')return p.p_action==='mailbox_capabilities'?{can_trash:admin}:[];
   return {items:[]};}};
 vm.createContext(c);vm.runInContext(source,c);
 const u=c.MAILBOX.create(admin,'UI');c.UI=u;
 const host={isConnected:true,innerHTML:'',querySelector(){return null}};u.render(host);
 await u.openCase('issue',21);await new Promise(r=>setImmediate(r));
 return {u,host,calls,get cur(){return cur}};
}
(async()=>{
 // Admin, öppet ärende (ny): Pågår + Avsluta
 let r=await run(true,'ny');
 assert(r.host.innerHTML.includes("issue_status:pagar"),'Pågår saknas');
 assert(r.host.innerHTML.includes("issue_status:klar"),'Avsluta saknas');
 assert(!r.host.innerHTML.includes("issue_status:ny"));
 r.u.legacyAct('issue_status:klar');await new Promise(r=>setTimeout(r,10));
 assert(r.calls.some(x=>x[0]==='set_car_issue_status'&&x[1].p_id===21&&x[1].p_status==='klar'&&x[1].p_comment===null),'RPC anropades inte');
 assert.strictEqual(r.cur,'klar');
 // Efter avslut: Öppna igen finns, Avsluta inte
 assert(r.host.innerHTML.includes("issue_status:ny"),'Öppna igen saknas efter avslut');
 assert(!r.host.innerHTML.includes("issue_status:klar"));
 r.u.legacyAct('issue_status:ny');await new Promise(r=>setTimeout(r,10));
 assert.strictEqual(r.cur,'ny');
 // pågår: bara Avsluta
 r=await run(true,'pagar');
 assert(!r.host.innerHTML.includes("issue_status:pagar")&&r.host.innerHTML.includes("issue_status:klar"));
 // För lång kommentar stoppas innan nätanrop
 // Förare (inte admin): inga statusknappar och inget anrop
 r=await run(false,'ny');
 assert(!r.host.innerHTML.includes("issue_status"),'förare ska inte se statusknappar');
 r.u.legacyAct('issue_status:klar');await new Promise(r=>setTimeout(r,10));
 assert(!r.calls.some(x=>x[0]==='set_car_issue_status'),'förare får inte anropa');
 console.log('PASS avsluta/öppna igen felanmälan (admin) och inga knappar för förare');
})().catch(e=>{console.error(e);process.exit(1)});
