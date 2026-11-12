// sw.js: tyst notis för tåg när servern säger silent, och för "ny tid" från äldre server med liten försening.
// Chrome tillåter inte vibration på en tyst notis. Kör: node tests/bevakningar/villkor-sw.cjs
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../../TaxiData/sw.js'),'utf8');
const L={},shown=[];
const self={addEventListener:(t,f)=>{L[t]=f;},registration:{scope:'https://taxikit.shop/TaxiData/',showNotification:(t,o)=>{shown.push({t,o});return Promise.resolve();}},
  clients:{matchAll:()=>Promise.resolve([]),claim:()=>Promise.resolve()},skipWaiting(){}};
vm.runInNewContext(src,{self,URL,indexedDB:{open(){const r={};setTimeout(()=>r.onerror&&r.onerror());return r;}},Promise,setTimeout,console});
async function push(d){shown.length=0;let w;L.push({data:{json:()=>d,text:()=>''},waitUntil:p=>{w=p;}});await w;return shown[0].o;}
(async()=>{let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;};
 let o=await push({title:'🕒 SJ 423: ny tid 23:30',body:'Planerad 18:30, försenat 300 min.',tag:'tag-423',v:1,silent:true});
 ok(o.silent===true&&!('vibrate' in o),'server: silent, ingen vibration');
 o=await push({title:'🕒 SJ 423: ny tid 23:30',body:'Planerad 18:30, försenat 300 min.',tag:'tag-423',v:1,silent:false});
 ok(!o.silent&&Array.isArray(o.vibrate),'server: med ljud');
 o=await push({title:'🕒 SJ 423: ny tid 18:42',body:'Planerad 18:30, försenat 12 min.',tag:'tag-423'});
 ok(o.silent===true,'äldre server: 12 min tyst');
 o=await push({title:'🕒 SJ 423: ny tid 19:10',body:'Planerad 18:30, försenat 40 min.',tag:'tag-423'});
 ok(!o.silent,'äldre server: 40 min med ljud');
 o=await push({title:'🚆 SJ 423 har ankommit spår 5, 18:31',body:'1 min sen.',tag:'tag-423'});
 ok(!o.silent,'ankommit med ljud');
 o=await push({title:'🕒 SK1: ny tid 18:42',body:'Planerad 18:30, försenat 12 min.',tag:'flyg-SK1'});
 ok(!o.silent,'flyg som förut');
 console.log('PASS villkor-sw: '+n+' checks');
})().catch(e=>{console.error(e);process.exit(1);});
