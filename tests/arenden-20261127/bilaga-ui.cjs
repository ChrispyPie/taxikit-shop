// Bilaga: i en LÅST tråd med utbetald sjuklön får föraren ändå ta bort sitt eget intyg (×); andras intyg saknar ×; borttagna visas som 'Bilaga borttagen av X'. Syntetiska data.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('TaxiData/sjuk.js','utf8').replace('S.enabled = ','S._st = st; S.enabled = ');
async function render(boss,locked,certs){
 const rows=[{id:7,driver_id:boss?'2':'1',name:'Test',start:'2026-11-20',end:null,open:true,days:5,comment:null,status:'ny',certs:1,sjuklon:'utbetald',events:[],locked}];
 let certBtn=null;const body={isConnected:true,innerHTML:'',querySelector(){return null},querySelectorAll(sel){
  if(sel==='.sj-act'){return [{dataset:{id:'7'},querySelectorAll(s2){if(s2!=='[data-a]')return [];return [{dataset:{a:'certs'},set onclick(f){certBtn=f}}]}}]}
  return []}};
 const c={console,Promise,Date,String,Number,Array,Object,JSON,Error,setTimeout,window:null,TRIP_API_URL:'x',TRIP_API_KEY:'k',localStorage:{getItem(){return 't'}},
  fetch:async(u,o)=>({ok:true,json:async()=>({certs}),text:async()=>JSON.stringify({me:'1',boss,today:'2026-11-25',mine:rows,all:boss?rows:undefined})}),document:{getElementById(){return null},createElement(){return {setAttribute(){},appendChild(){},style:{}}},head:{appendChild(){}},querySelector(){return null}},alert(){},confirm(){return true}};
 c.window=c;vm.createContext(c);vm.runInContext(src,c);
 const S=c.SJUK||c.window.SJUK;await S.render(body).catch(e=>console.log('ERR',e));if(certs&&certBtn){certBtn();await new Promise(r=>setTimeout(r,30));}await new Promise(r=>setTimeout(r,20));return body.innerHTML;
}
(async()=>{
 const certs=[{id:1,mime:'image/jpeg',url:'u1',mine:true},{id:2,mime:'application/pdf',url:'u2',mine:false},{id:3,mime:'image/jpeg',deleted:true,deleted_by:'Berra A',deleted_at:'2026-11-27T20:00:00Z',mine:true}];
 let h=await render(false,true,certs);
 assert(h.includes('Tråden är stängd'),'låst');
 assert(h.includes('data-c="1"'),'eget intyg ska kunna tas bort trots lås + utbetald sjuklön');
 assert(!h.includes('data-c="2"'),'andras intyg ska sakna ×');
 assert(h.includes('Bilaga borttagen av')&&h.includes('Berra A'),'markering saknas');
 assert(!h.includes('data-c="3"'),'borttagen bilaga ska inte ha ×');
 h=await render(true,true,certs);
 assert(h.includes('data-c="1"')&&h.includes('data-c="2"'),'boss kan ta bort alla');
 console.log(h.slice(0,0));console.log('PASS bilaga-ui: eget intyg kan tas bort även låst/utbetald, andras ej, boss alla, markering visas');
})().catch(e=>{console.error(e);process.exit(1)});
