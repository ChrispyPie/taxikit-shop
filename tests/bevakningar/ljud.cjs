const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const store={};
const ctx={
  window:{},
  document:{addEventListener:function(){},head:{appendChild:function(){}},createElement:function(){return {style:{},setAttribute:function(){}};},getElementById:function(){return null;},readyState:'complete'},
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},
  navigator:{},
  console, Date, JSON, Math
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../TaxiData/bevakning-ljud.js'),'utf8'),ctx);
const L=ctx.window.BEV_LJUD; let n=0; const check=(ok,msg)=>{assert.ok(ok,msg);n++};
check(L.kindOf({tag:'flyg-SK169'})==='flyg','tag flyg');
check(L.kindOf({tag:'tag-423'})==='tag','tag tåg');
check(L.kindOf({tag:'bat-1'})==='bat','tag båt');
check(L.kindOf({tag:'test'})==='test','test-tag går före t-prefix');
check(L.kindOf({tag:'test'},'test|1')==='test','test-nyckel är inte tåg');
check(L.kindOf({},'fSK169|2026-11-11T08:00:00Z')==='flyg','flygnyckel');
check(L.kindOf({},'t423|2026-11-11T08:00:00Z')==='tag','tågnyckel');
check(L.kindOf({title:'🚆 Tåg 423 har ankommit'})==='tag','titel tåg');
check(L.enabled('tag')&&L.enabled('flyg')&&L.enabled('bat')&&L.enabled('prognos'),'på som standard');
check(L.kindOf({tag:'prognos-161'})==='prognos','tag prognos');
check(L.kindOf({tag:'nyheter'})==='prognos','nyheter är övrigt');
check(L.kindOf({tag:'reminder'})==='prognos','påminnelse är övrigt');
check(L.read().prognos===true,'prognos-ljud saknas i lagring = på');
L.write({on:false,tag:true,flyg:true,bat:true,prognos:true});
check(!L.enabled('tag')&&!L.enabled('test')&&!L.enabled('prognos'),'huvudav stänger allt');
L.write({on:true,tag:true,flyg:false,bat:true});
check(L.enabled('tag')&&!L.enabled('flyg')&&L.enabled('bat')&&L.enabled('test')&&L.enabled('prognos'),'per typ, prognos kvar på när nyckeln saknas');
L.write({on:true,tag:true,flyg:true,bat:true,prognos:false});
check(!L.enabled('prognos')&&L.enabled('tag'),'övrigt ljud av');
check(JSON.parse(store.taxi_bev_ljud).prognos===false,'prognos-ljud sparas i taxi_bev_ljud');
console.log(n+' ljud assertions passed (kind, defaults, toggles, övrigt).');
