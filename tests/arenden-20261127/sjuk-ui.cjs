// B: förarens Sjuk-flik (sjuk.js) döljer ändringsknappar i en låst tråd. Syntetiska data.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('TaxiData/sjuk.js','utf8');
async function render(boss,locked){
 const rows=[{id:7,driver_id:'1',name:'Test',start:'2026-11-20',end:null,open:true,days:5,comment:null,status:'ny',certs:1,sjuklon:'ej',events:[],locked}];
 const body={isConnected:true,innerHTML:'',querySelectorAll(){return []},querySelector(){return null}};
 const c={console,Promise,Date,String,Number,Array,Object,JSON,Error,setTimeout,window:null,TRIP_API_URL:'x',TRIP_API_KEY:'k',localStorage:{getItem(){return 't'}},
  fetch:async()=>({ok:true,text:async()=>JSON.stringify({me:'1',boss,today:'2026-11-25',mine:rows,all:boss?rows:undefined})}),document:{getElementById(){return null},createElement(){return {setAttribute(){},appendChild(){},style:{}}},head:{appendChild(){}},querySelector(){return null}},alert(){},confirm(){return true}};
 c.window=c;vm.createContext(c);vm.runInContext(src,c);
 const S=c.SJUK||c.window.SJUK;await S.render(body).catch(e=>console.log('ERR',e));await new Promise(r=>setTimeout(r,20));return body.innerHTML;
}
(async()=>{
 let h=await render(false,false);
 assert(h.includes('data-a="frisk"')&&h.includes('data-up="7"')&&h.includes('data-a="del"'),'olåst: förarknappar');
 assert(!h.includes('Tråden är stängd'));
 h=await render(false,true);
 assert(h.includes('Tråden är stängd'),'låst: notis saknas');
 assert(!h.includes('data-a="frisk"')&&!h.includes('data-up=')&&!h.includes('data-a="del"'),'låst: knappar ska döljas');
 assert(h.includes('Anmäl sjuk'),'låst öppen period ska inte hindra ny anmälan');
 h=await render(true,true);
 assert(h.includes('data-up="7"'),'boss berörs inte');
 console.log('PASS sjuk.js låst tråd: knappar dolda för förare, boss opåverkad');
})().catch(e=>{console.error(e);process.exit(1)});
