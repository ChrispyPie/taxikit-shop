// Synthetic-only UI/state regression: needs is NOT unread; all read writes must finish before refresh.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
async function test(admin){
 const remote={thread:true,hours:true,old:true},manual=new Set(['thread:10','wh:20','old-message:30']);
 let defer=false,release;const seen=[],badges={};
 const c={Intl,Date,Promise,console,history:{pushState(){}},document:{createElement(){return{}},head:{appendChild(){}}},window:null};c.window=c;
 c.setBadge=(k,v)=>badges[k]=v;
 c.ARENDE={esc:x=>String(x??''),WORDS:{},view:()=>'<p>Synthetic readable case</p>',errText:e=>e.message,rpc:async(name,p)=>{
  if(name==='mailbox_v2')switch(p.p_action){
   case'list':{const result=[{id:10,subject:'Synthetic thread',unread:remote.thread,at:'2026-11-07T12:00:00Z'}];if(defer){defer=false;return new Promise(r=>release=()=>r(result));}return result;}
   case'item_flags':return [...manual].map(k=>{let[kind,id]=k.split(':');return {kind,id:+id,is_unread:true}});
   case'mailbox_capabilities':return {can_trash:admin};
   case'item_lock':return {locked:false};
   case'get':remote.thread=false;return {id:10,subject:'Synthetic thread',messages:[],bookings:[]};
   case'mark_read':await new Promise(r=>setImmediate(r));manual.delete(p.p_data.kind+':'+p.p_data.id);seen.push('mark_read');return {};
   case'mark_unread':manual.add(p.p_data.kind+':'+p.p_data.id);return {};
  }
  if(name==='case_admin_list'||name==='case_inbox')return {items:[{kind:'wh',id:20,title:'Needs reply but can be read',needs:true,unread:+remote.hours,st:'vantar',at:'2026-11-07T11:00:00Z'},{kind:'issue',id:21,title:'SYNTHETIC needs only',needs:true,unread:0,st:'ny',at:'2026-11-07T10:00:00Z'}]};
  if(name==='conversation_list')return {items:[{id:30,subject:'Synthetic old conversation',unread:+remote.old,at:'2026-11-07T09:00:00Z'}]};
  if(name==='conversation_get'){remote.old=false;return {id:30,subject:'Synthetic old conversation',messages:[]};}
  if(name==='case_get')return {id:p.p_id,kind:p.p_kind,data:{}};
  if(name==='case_seen'){await new Promise(r=>setImmediate(r));remote.hours=false;seen.push('case_seen');return 1;}
  throw Error(name);
 }};
 vm.createContext(c);vm.runInContext(fs.readFileSync('TaxiData/mailbox-ui.js','utf8'),c);const u=c.MAILBOX.create(admin,'UI');c.UI=u;
 const el={isConnected:true,innerHTML:'',querySelector(){return null}};u.render(el);await u.refresh();
 assert.equal(u.count(),admin?2:3);
 await u.openThread(10);assert.equal(u.count(),admin?1:2);assert(!manual.has('thread:10'));
 await u.openCase('wh',20);assert(seen.includes('case_seen'));assert(!manual.has('wh:20'));assert.equal(u.count(),admin?0:1);
 if(!admin){await u.openCase('old-message',30);assert.equal(u.count(),0);assert(!manual.has('old-message:30'));assert.equal(badges.inkorg,0);assert.equal(badges.profbtn,false);assert.equal(c.INKORG_HAS,false);}
 u.back();await u.refresh();assert(!el.innerHTML.includes('aria-label="Oläst"'));assert(el.innerHTML.includes('Needs reply but can be read'));if(admin)assert(el.innerHTML.includes('Ohanterade / väntar på svar'));
 u.markUnread('wh',20);await new Promise(r=>setImmediate(r));assert.equal(u.count(),1);assert(el.innerHTML.includes('aria-label="Oläst"'));await u.openCase('wh',20);assert.equal(u.count(),0);
 // An older slow list result must never bring a dot back after a newer read+refresh.
 remote.thread=true;defer=true;const old=u.refresh();await u.openThread(10);assert.equal(u.count(),0);release();await old;assert.equal(u.count(),0);
 console.log('PASS '+(admin?'admin':'driver')+': needs-only is not unread, native/manual markers clear, legacy read waits, stale refresh ignored, badges clear');
}
(async()=>{await test(true);await test(false);assert(!fs.readFileSync('TaxiData/admin.html','utf8').includes('ARENDEN_ADMIN.count().then'));})().catch(e=>{console.error(e);process.exit(1)});
