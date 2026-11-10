const assert=require('node:assert/strict'),{boot}=require('../lazy-views/dom.cjs');
(async()=>{
 const a=await boot(); await a.w.openItem('ankomster'); const w=a.w,original=w.fetch,fetches=[];
 w.fetch=async(url,opts)=>{
  url=String(url);
  fetches.push({url,cache:opts&&opts.cache});
  if(url.includes('delta=1')){
    return {ok:true,status:200,json:async()=>({station:'Göteborg C',stationSignature:'G',updated:'2026-11-10T17:00:00.000Z',delta:true,trains:[{id:'3001',dir:'ANK',sched:'2026-11-10T18:00:00+01:00',lastSeen:'Surte',lastSeenSig:'Sur',lastSeenTs:'2026-11-10T17:50:00+01:00'}],removed:[{id:'3002',dir:'ANK',sched:'2026-11-10T17:40:00+01:00'}]})};
  }
  if(url.includes('/api/trains')){
    return {ok:true,status:200,json:async()=>({station:'Göteborg C',stationSignature:'G',updated:'2026-11-10T16:59:00.000Z',trains:[]})};
  }
  return original(url,opts);
 };
 const D=w.ARRIVAL_DATA;
 const items=[
  {key:'t3001|2026-11-10T18:00:00+01:00',tid:'3001',lastSeen:'Bohus'},
  {key:'t3002|2026-11-10T17:40:00+01:00',tid:'3002',lastSeen:'Nol'}
 ];
 const delta=await D.loadTrainDelta('G');
 assert.equal(fetches.at(-1).cache,'default','delta fetch must honor Cache-Control, not no-store');
 assert(!String(fetches.at(-1).url).includes('t='),'delta URL must not cache-bust with t=');
 assert(String(fetches.at(-1).url).includes('delta=1'));
 const merged=D.mergeTrainDeltas(items,delta);
 const keys=merged.map(it=>it.key);
 assert(!keys.includes('t3002|2026-11-10T17:40:00+01:00'),'removed train is dropped');
 const t=merged.find(it=>it.key==='t3001|2026-11-10T18:00:00+01:00');
 assert(t);
 assert.equal(t.lastSeen,'Surte');
 fetches.length=0;
 await D.loadTrains('G');
 assert(fetches.some(f=>f.cache==='default'&&!String(f.url).includes('t=')&&!String(f.url).includes('delta=')));
 // Polling starts on render and pauses when hidden
 const el=w.document.createElement('div');
 w.document.body.appendChild(el);
 w.ANKOMSTER.render(el);
 assert.equal(w.ANKOMSTER.deltaMs,15000);
 const id=w.ANKOMSTER/* no state export */;
 fetches.length=0;
 // Simulate visibility pause: hidden should not poll
 Object.defineProperty(w.document,'hidden',{configurable:true,get:()=>true});
 w.document.dispatchEvent(new w.Event('visibilitychange'));
 await new Promise(r=>setTimeout(r,20));
 assert.equal(fetches.filter(f=>String(f.url).includes('delta=1')).length,0,'no delta poll while hidden');
 w.ANKOMSTER.stop(); a.dom.window.close();
 console.log('PASS delta client merge, default cache, no t= bust, pause when hidden');
})().catch(e=>{console.error(e);process.exitCode=1;});
