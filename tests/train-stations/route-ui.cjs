const assert=require('node:assert/strict'),{boot}=require('../lazy-views/dom.cjs');
const pause=()=>new Promise(r=>setTimeout(r,45));
(async()=>{
 const a=await boot(),w=a.w,original=w.fetch;
 const sched=new Date(Date.now()+45*60000).toISOString();
 const seenTs=new Date(Date.now()-10*60000).toISOString();
 const earlier=new Date(Date.now()-25*60000).toISOString();
 w.fetch=async(url,opts)=>{
  url=String(url);
  if(!url.includes('/api/trains'))return original(url,opts);
  const params=new URL(url,'https://taxikit.shop/').searchParams;
  if(params.has('stations'))return {ok:true,status:200,json:async()=>({stations:[{id:'G',label:'Göteborg C'},{id:'A',label:'Alingsås'}]})};
  if(params.get('route'))return {ok:true,status:200,json:async()=>({
    id:params.get('route'),stops:[
      {sig:'A',name:'Alingsås',depSched:earlier,depAct:earlier},
      {sig:'Ns',name:'Norsesund',arrSched:new Date(Date.now()-15*60000).toISOString(),arrAct:new Date(Date.now()-15*60000).toISOString(),depAct:new Date(Date.now()-14*60000).toISOString()},
      {sig:'Ndv',name:'Norsesund västra',depAct:seenTs,arrAct:seenTs},
      {sig:'Fd',name:'Floda',arrSched:new Date(Date.now()+10*60000).toISOString()},
      {sig:'G',name:'Göteborg C',arrSched:sched}
    ],
    lastSeen:{sig:'Ndv',name:'Norsesund västra',ts:seenTs,type:'Avgang'}
  })};
  return {ok:true,status:200,json:async()=>({stationSignature:'G',updated:new Date().toISOString(),trains:[{id:'3569',dir:'ANK',other:'Alingsås',otherSig:'A',sched,est:sched,lastSeen:'Norsesund västra',lastSeenSig:'Ndv',lastSeenTs:seenTs}]})};
 };
 await w.openItem('ankomster');await pause();
 assert(w.document.body.textContent.includes('Senast sedd: Norsesund västra'),w.document.body.textContent);
 assert(!w.document.body.textContent.includes('Här nu'));
 const row=w.document.querySelector('[data-ank-route]');assert(row);row.click();await pause();
 assert(!w.document.body.textContent.includes('Här nu'));
 const here=w.document.querySelector('[data-ank-here="1"]');assert(here);
 assert(here.classList.contains('here'));
 assert(here.textContent.includes('Norsesund västra'));
 assert(here.textContent.includes('●')||here.querySelector('.ank-st-dot').textContent.includes('●'));
 const passed=[...w.document.querySelectorAll('.ank-st.passed .ank-st-name')].map(e=>e.textContent.trim());
 assert(passed.includes('Alingsås'));
 assert(passed.includes('Norsesund'));
 assert(!passed.includes('Norsesund västra'));
 assert(!w.document.querySelector('.ank-st.here + .ank-st.passed')); // later stops not passed
 assert.deepEqual(a.errors,[]);
 a.dom.window.close();
 console.log('PASS last-seen row is orange named station in order, passed stops checked, no Här nu');
})().catch(e=>{console.error(e);process.exitCode=1;});
