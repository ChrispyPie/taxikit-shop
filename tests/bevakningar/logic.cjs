const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ctx={window:{},localStorage:{getItem:()=>null},Intl,Date,console};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../../TaxiData/mina-bevakningar.js'),'utf8'),ctx);
const M=ctx.window.MINA_BEVAKNINGAR,now=Date.parse('2026-11-06T17:00:00Z'),iso=m=>new Date(now+m*60000).toISOString();let n=0;function check(ok){assert.ok(ok);n++}
ctx.TAGNOTIS={matches:(w,it)=>w.train_nos.includes(it.tid)};
const w={kind:'tag',ident:'1',sched:iso(20),expires_at:iso(180),state:{}},it={key:'t1|'+iso(20),no:'Tåg 1',tid:'1',sched:new Date(iso(20)),est:new Date(iso(30)),from:'Exempelstad',info:'Spår 4'};
const rule={id:1,enabled:true,train_nos:['1'],days:[1,2,3,4,5,6,7],from_min:0,to_min:0};
let list=M.normalize([w],[rule],[it],[],[],now);check(list.length===1);check(list[0].at===Date.parse(iso(30)));check(list[0].rules.length===1);check(list[0].status.includes('10 min sen'));
check(M.normalize([{...w,expires_at:iso(-1)}],[],[it],[],[],now).length===0);
check(M.normalize([{...w,sched:iso(-121)}],[],[],[],[],now).length===0);
check(M.normalize([{...w,sched:iso(-119)}],[],[],[],[],now).length===1);
check(M.normalize([],[],[],[],[{id:10,title:'Test',starts_at:iso(-180),ends_at:iso(20),subs:[{kind:'before_end',offset:30}]}],now).length===1);
check(M.normalize([],[],[],[],[{id:10,title:'Test',starts_at:iso(10),subs:[]}],now).length===0);
// Nattpass: fredagsfönster 17–05 omfattar lördag 04 men inte lördag kväll.
const night={days:[5],from_min:17*60,to_min:5*60};check(M.inWindow(night,'2026-11-07T03:00:00Z'));check(!M.inWindow(night,'2026-11-07T17:00:00Z'));check(!M.inWindow(night,'2026-11-07T04:00:00Z'));
// Sommartid: använder Stockholm även när telefonen är i annan tidszon.
check(M.inWindow({days:[7],from_min:3*60,to_min:4*60},'2026-03-29T01:30:00Z'));
// Flera påminnelser skapar en enda kalenderpost.
check(M.normalize([],[],[],[],[{id:11,title:'Test',starts_at:iso(10),subs:[{},{}]}],now).length===1);
console.log(`${n} logic assertions passed (deduplication, expiry, delay, event end, overnight and DST).`);
