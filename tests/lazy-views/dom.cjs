// Offline DOM execution, not Chromium/network timing or production data.
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
let jsdomPath=process.env.JSDOM_PATH;try{jsdomPath=jsdomPath||require.resolve('jsdom');}catch(e){jsdomPath='/workspace/lazy-view-test-deps/node_modules/jsdom';}
const {JSDOM,VirtualConsole}=require(jsdomPath);
const root=path.resolve(__dirname,'../../TaxiData'),html=fs.readFileSync(root+'/index.html','utf8');
const cp=require('child_process');let baseline=false;const source=f=>baseline?cp.execFileSync('git',['show','36477ce9:TaxiData/'+f],{encoding:'utf8'}):fs.readFileSync(root+'/'+f,'utf8');
const pause=()=>new Promise(r=>setTimeout(r,35));
function fixture(name,body){
 const map={get_me:{id:'fixture',first_name:'Test',last_name:'Test',category:'standard',activated:true},get_my_features:[],shell_badge_counts:{messages:0,admin:0,notices:0,news_seen:'2026-11-07k'},get_my_trip_data:{shifts:[],trips:[]},get_trip_data:{shifts:[],trips:[]},get_events:{events:[],categories:[],cities:[]},get_topplista_metric:[],get_rekord_metric:[],forum_rules_status:{accepted:true},forum_home:{sections:[],threads:[]},prognos_list_bookings:[],prognos_morgon:[],prognos_zones:[],prognos_watch_list:[],prognos_original:[],profile_get:{id:'fixture',first_name:'Test',last_name:'Test'},profile_guestbook_list:[],get_my_workshop:{items:[]},get_bil:{cars:[],issues:[],tasks:[],maint:[]},case_inbox:{items:[]},conversation_list:{items:[]},get_bil_notices:[],get_my_event_notices:[],forum_classic_badge:0,prognos_new_count:0,notis_feed:{items:[],unread:0},changelog_seen_get:'2026-11-07k',get_notices:[],sjuk_get:{items:[]},prognos_status:{enabled:false},profile_forum_list:[],get_train_notis:[]};
 if(name==='mailbox_v2'){if(body.p_action==='contacts_get')return {cars:[],phone:null,visibility:'owner'};if(body.p_action==='mailbox_capabilities')return {can_trash:false};return [];}
 return Object.hasOwn(map,name)?map[name]:[];
}
async function boot(saved={},hash='',opts={}){
 baseline=!!opts.baseline;const page=baseline?source('index.html'):html;
 const errors=[],js=[],requests=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(page,{url:'https://taxikit.shop/TaxiData/'+hash,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;const execute=s=>vm.runInContext(s,dom.getInternalVMContext());
 w.localStorage.setItem('taxi_session','fixture-token');w.localStorage.setItem('taxi_driver','fixture');w.localStorage.setItem('taxi_logged_in','1');for(const [k,v]of Object.entries(saved))w.localStorage.setItem(k,v);if(opts.beforeScripts)opts.beforeScripts(w);
 const navType=opts.navType||'reload';w.performance.getEntriesByType=t=>t==='navigation'?[{type:navType}]:[];w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.requestAnimationFrame=f=>w.setTimeout(f,0);w.confirm=()=>false;
 w.fetch=async(url,opt={})=>{const name=String(url).split('/').pop(),body=JSON.parse(opt.body||'{}');requests.push(name);const value=String(url).includes('/rpc/')?(opts.fixtures&&Object.hasOwn(opts.fixtures,name)?JSON.parse(JSON.stringify(opts.fixtures[name])):fixture(name,body)):{trains:[],arrivals:[]};return {ok:true,status:200,json:async()=>value,text:async()=>JSON.stringify(value)};};
 w.addEventListener('unhandledrejection',e=>{errors.push(e.reason?.message||String(e.reason));e.preventDefault();});w.addEventListener('error',e=>{errors.push(e.message);e.preventDefault();});
 const append=w.document.head.appendChild.bind(w.document.head);w.document.head.appendChild=function(el){const r=append(el);if(el.tagName==='SCRIPT'){const file=el.getAttribute('src').split('?')[0];js.push(file);Promise.resolve().then(()=>{try{execute(source(file));el.onload?.();}catch(e){errors.push(file+': '+e.message);el.onerror?.();}});}return r;};
 for(const el of w.document.querySelectorAll('script')){const src=el.getAttribute('src');if(src){const file=src.split('?')[0];js.push(file);execute(source(file));}else execute(el.textContent);}
 await pause();return {w,dom,errors,js,requests,evaluate:execute};
}
module.exports={boot};
if(require.main===module)(async()=>{
 const initial=await boot();assert(!initial.js.includes('script.js'));assert(!initial.js.includes('mailbox-ui.js'));assert(initial.requests.includes('get_me'));assert(!initial.requests.includes('get_my_trip_data'));assert.deepEqual(initial.errors,[]);initial.dom.window.close();
 const views=['kordata','lonekoll','ankomster','prognos','kalender','topplistor','forum','mina-bevakningar','installningar','om','verkstad','inkorg','profil'];
 for(const view of views){
  const a=await boot();if(view==='inkorg')a.w.openInbox();else if(view==='profil')a.w.openProfile();else await a.w.openItem(view);await pause();
  assert(a.w.LAZY.ready(view),view+' became ready');
  if(view==='lonekoll')assert(!a.js.includes('script.js'),'Lönekoll must not import Kördata UI');
  if(view==='mina-bevakningar')assert(!a.js.includes('ankomster.js')&&!a.js.includes('mailbox-ui.js'),'Bevakningar must not import other view renderers');
  const storage={};for(let i=0;i<a.w.localStorage.length;i++){const k=a.w.localStorage.key(i);storage[k]=a.w.localStorage.getItem(k);}
  assert.deepEqual(a.errors,[],view+' first-open JS errors');a.dom.window.close();
  const b=await boot(storage);await pause();assert(b.w.LAZY.ready(view),view+' restored lazy view');assert.deepEqual(b.errors,[],view+' reload JS errors');b.dom.window.close();console.log('PASS first-open + reload: '+view);
 }
 console.log('PASS neutral shell no trip prefetch; independent first-open/reload of every main view (offline DOM).');
})().catch(e=>{console.error(e);process.exitCode=1;});
