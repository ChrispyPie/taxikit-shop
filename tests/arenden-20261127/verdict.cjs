// Statussymbol sist på raden: mappning för Bokad tid (inkl. avbokad/ombokad), verkstadstid, sjuk, och inget för vanliga ärenden. Syntetiskt.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('TaxiData/mailbox-ui.js','utf8');
(async()=>{
 const th=(id,s)=>({id,subject:'T'+id,name:'X',at:new Date().toISOString(),booking_states:s});
 const threads=[th(1,['accepted']),th(2,['declined']),th(3,['cancelled']),th(4,['rebooked','pending_admin']),th(5,['accepted','rebooked','pending_driver']),th(6,['cancelled','accepted']),th(7,[]),th(8,['rebooked'])];
 const cases=[{kind:'wh',id:11,title:'W11',st:'vantar',status:'pending',at:new Date().toISOString()},{kind:'wh',id:12,title:'W12',st:'klar',status:'approved',at:new Date().toISOString()},{kind:'wh',id:13,title:'W13',st:'klar',status:'rejected',at:new Date().toISOString()},
  {kind:'sjuk',id:21,title:'S21',st:'ny',status:'ny',at:new Date().toISOString()},{kind:'sjuk',id:22,title:'S22',st:'vantar',status:'intyg_begart',at:new Date().toISOString()},{kind:'sjuk',id:23,title:'S23',st:'klar',status:'godkand',at:new Date().toISOString()},{kind:'sjuk',id:24,title:'S24',st:'klar',status:'avslagen',at:new Date().toISOString()},
  {kind:'issue',id:31,title:'I31',st:'ny',status:'ny',at:new Date().toISOString()},{kind:'task',id:32,title:'K32',st:'ny',status:'ny',at:new Date().toISOString()}];
 const c={console,Intl,Date,Promise,history:{pushState(){}},document:{createElement(){return {}},head:{appendChild(){}}},window:null,location:{}};c.window=c;
 c.ARENDE={esc:x=>String(x??''),WORDS:{},errText:e=>e.message,rpc:async(n,p)=>{if(n==='mailbox_v2'){if(p.p_action==='list')return threads;if(p.p_action==='mailbox_capabilities')return {can_trash:true};return [];}if(n==='case_admin_list')return {items:cases,klar_total:0};return {items:cases};}};
 vm.createContext(c);vm.runInContext(source,c);
 const u=c.MAILBOX.create(true,'UI');const host={isConnected:true,innerHTML:'',querySelector(){return null}};u.render(host);
 await new Promise(r=>setTimeout(r,50));
 const v={};host.innerHTML.split('<div class="mx-select-row').slice(1).forEach(r=>{const t=/<b>([^<]+)<\/b>/.exec(r)[1],m=/mx-v-(ok|no|wait)/.exec(r);v[t]=m?m[1]:'';});
 const want={T1:'ok',T2:'no',T3:'no',T4:'wait',T5:'wait',T6:'ok',T7:'',T8:'',W11:'wait',W12:'ok',W13:'no',S21:'wait',S22:'wait',S23:'ok',S24:'no',I31:'',K32:''};
 for(const k in want)assert.strictEqual(v[k],want[k],k+' fick '+v[k]+' ska vara '+want[k]);
 assert(host.innerHTML.includes('mx-hasv'));
 console.log('PASS verdict: godkänd ✓, nekad/avbokad ✕, väntar ?, inget för vanliga ärenden/ersatt tid');
})().catch(e=>{console.error(e);process.exit(1)});
