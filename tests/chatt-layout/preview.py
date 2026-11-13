"""Förhandsbilder: ärende- och meddelandetråd, telefon stående, mörkt tema. Isolerad Chromium, påhittade RPC-svar.
Kör: ROOT=<repo> PREFIX=efter /workspace/pwenv/bin/python tests/chatt-layout/preview.py"""
from pathlib import Path
import os, threading, json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
ROOT=Path(os.environ.get('ROOT') or Path(__file__).resolve().parents[2])
HERE=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/anim-preview/chatt-layout'));OUT.mkdir(parents=True,exist_ok=True)
PREFIX=os.environ.get('PREFIX','efter')
FIX=''.join((HERE/p).read_text()+'\n' for p in ['tests/meddelanden/fixtures.js','tests/inkorg/fixtures.js','tests/inkorg-v2/fixtures.js'])
OVERLAY=r"""
(function(){
 var body='Service lampan har lyst i några dagar. 100 mil kvar nu. Har rickard bokat än?';
 var row={kind:'issue',id:21,title:'Felanmälan',car:'A191',txt:body,status:'ny',st:'ny',who:'Christian Parsa',mine:false,needs:true,urgent:false,at:'2026-11-12T17:02:00Z'};
 MOCK.admin.items=[row].concat(MOCK.admin.items.filter(function(x){return x.id!==111;}));
 var msgs=[{id:1,role:'owner',who:'Berra',body:'Rickard har bokat verkstad på måndag kl 8.',at:'2026-11-12T18:46:00Z'},
  {id:2,role:'driver',who:'Christian Parsa',body:'Toppen, tack! Ska jag lämna den kvällen innan?',at:'2026-11-12T19:10:00Z'},
  {id:3,role:'owner',who:'Berra',body:'Ja, lämna den 07.45 senast. Nyckeln i lådan.',at:'2026-11-12T21:38:00Z'}];
 for(var i=4;i<10;i++)msgs.push({id:i,role:i%2?'driver':'owner',who:i%2?'Christian Parsa':'Berra',body:'Uppföljning '+i+': allt klart med bilen?',at:'2026-11-13T0'+i+':05:00Z'});
 MOCK.cases['issue:21']={kind:'issue',id:21,st:'pagar',admin:true,data:{id:21,kind:'fault',car:'A191',body:body,blocking:false,status:'pagar',mine:false,created_at:'2026-11-12T17:02:00Z',reporter_name:'Christian Parsa',history:[{status:'ny',at:'2026-11-12T17:02:00Z'},{status:'pagar',at:'2026-11-12T18:40:00Z'}],msgs:msgs}};
 var ibk=[{id:31,thread_id:501,kind:'Verkstad',title:'Verkstad',starts_at:'2026-11-17T07:00:00Z',car_number:'A191',status:'accepted',proposer_role:'admin',created_at:'2026-11-12T18:45:00Z',decided_at:'2026-11-12T19:12:00Z'},
  {id:32,thread_id:501,kind:'Verkstad',title:'Verkstad',starts_at:'2026-11-18T07:00:00Z',car_number:'A191',status:'pending_admin',proposer_role:'driver',created_at:'2026-11-13T06:30:00Z'}];
 MOCK.cases['sjuk:41']={kind:'sjuk',id:41,st:'vantar',admin:true,data:{id:41,start:'2026-11-12',end:null,status:'intyg_begart',name:'Christian Parsa',comment:'Feber sedan i natt.',certs:0,
  events:[{kind:'created',at:'2026-11-12T05:40:00Z',who:'Christian Parsa'},{kind:'status',to:'intyg_begart',at:'2026-11-12T08:10:00Z',who:'Berra',comment:'Skicka intyg från dag 8.'}]}};
 MOCK.cases['wh:42']={kind:'wh',id:42,st:'klar',admin:true,data:{id:42,car:'A191',start:'2026-11-11T07:00:00Z',end:'2026-11-11T09:30:00Z',minutes:150,status:'approved',reporter_name:'Christian Parsa',comment:'Däckbyte och spolarvätska.',created_at:'2026-11-11T10:00:00Z',
  msgs:[{kind:'approved',role:'owner',who:'Berra',body:'Tack!',at:'2026-11-11T12:00:00Z'}]}};
 var thread={id:77,subject:'Däckbyte A191',car_number:'191',is_driver:false,driver_id:900001,bookings:[
  {id:51,kind:'Däckbyte',title:'Däckbyte',starts_at:'2026-11-14T13:00:00Z',car_number:'191',status:'accepted',proposer_role:'admin',created_at:'2026-11-11T08:03:00Z',decided_at:'2026-11-11T09:31:00Z'}],messages:[
  {id:1,role:'driver',mine:false,body:'Hej! När kan vi byta till vinterdäck på 191?',at:'2026-11-11T07:15:00Z'},
  {id:2,role:'admin',mine:true,body:'Hej! Torsdag efter passet går bra.',at:'2026-11-11T08:02:00Z'},
  {id:3,role:'driver',mine:false,body:'Perfekt, jag ställer bilen vid verkstaden.',at:'2026-11-11T09:30:00Z'},
  {id:4,role:'admin',mine:true,body:'Bra. Lämna nyckeln i lådan.',at:'2026-11-12T21:38:00Z'}]};
 var prev=window.fetch;window.fetch=function(url,opt){var m=/\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(String(url));
  if(m&&m[1]==='mailbox_v2'){var b=JSON.parse(opt.body),o={item_flags:[],unread_flags:[],mailbox_capabilities:{can_trash:true},item_lock:{locked:false},mark_read:{},mark_unread:{},get:thread}[b.p_action];
   if(o!==undefined)return Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}));}
  if(m&&m[1]==='issue_booking'){var ia=JSON.parse(opt.body).p_action;return Promise.resolve(new Response(JSON.stringify(ia==='get'?{thread_id:501,is_driver:false,bookings:ibk}:[]),{status:200,headers:{'Content-Type':'application/json'}}));}
  return prev.apply(this,arguments);};
})();"""
class Q(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=ThreadingHTTPServer(('127.0.0.1',0),partial(Q,directory=str(ROOT)));threading.Thread(target=srv.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(srv.server_port);errors=[];res={}
with sync_playwright() as pw:
    br=pw.chromium.launch()
    ctx=br.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='sv-SE',timezone_id='Europe/Stockholm')
    ctx.route('**/*',lambda r: r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,content_type='application/json',body='{}'))
    ctx.add_init_script("localStorage.clear();localStorage.setItem('taxi_session','synthetic');localStorage.setItem('taxi_driver','693340');localStorage.setItem('taxi_logged_in','1');localStorage.setItem('taxi_theme','dark');window.TEST_ROLE='admin';\n"+FIX+OVERLAY)
    p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
    p.goto(BASE+'/TaxiData/admin.html#arenden',wait_until='networkidle');p.wait_for_selector('.mx');p.wait_for_timeout(300)
    p.evaluate("ARENDEN_ADMIN.openCase('issue',21)");p.wait_for_selector('#mx-legacy-text');p.wait_for_timeout(400)
    res['arende']=p.evaluate("""(()=>{const t=document.querySelector('[data-tk-thr]');return {y:scrollY,thr:t?{top:t.scrollTop,max:t.scrollHeight-t.clientHeight}:null,text:document.querySelector('.mx').innerText.slice(0,400)}})()""")
    p.screenshot(path=str(OUT/(PREFIX+'-arende.png')))
    if PREFIX!='fore':
        res['arende_sum']=p.evaluate("(document.querySelector('.tk-sum')||{}).innerText||''")
        res['arende_bk_events']=p.evaluate("[...document.querySelectorAll('.tk-ev-b')].filter(e=>/Bokad tid/.test(e.textContent)).length")
        for kind,cid,fn in [('sjuk',41,'sjuk'),('wh',42,'verkstadstimmar')]:
            p.evaluate("ARENDEN_ADMIN.back()");p.wait_for_timeout(150)
            p.evaluate(f"ARENDEN_ADMIN.openCase('{kind}',{cid})");p.wait_for_selector('.tk-sum');p.wait_for_timeout(300)
            res[fn]=p.evaluate("document.querySelector('.tk-sum').innerText")
            p.screenshot(path=str(OUT/(PREFIX+'-'+fn+'.png')))
    p.evaluate("ARENDEN_ADMIN.back()");p.wait_for_timeout(200)
    p.evaluate("ARENDEN_ADMIN.openThread(77)");p.wait_for_selector('#mx-reply-body');p.wait_for_timeout(400)
    res['meddelande']=p.evaluate("""(()=>{const t=document.querySelector('[data-tk-thr]');return {y:scrollY,thr:t?{top:t.scrollTop,max:t.scrollHeight-t.clientHeight}:null}})()""")
    p.screenshot(path=str(OUT/(PREFIX+'-meddelande.png')))
    if PREFIX!='fore':
        # Samma utseende: alla händelser har samma klass och bakgrund, läsbar text i mörkt tema.
        res['stil']=p.evaluate("""(()=>{const L=c=>{const m=c.match(/\\d+/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*m[0]+.7152*m[1]+.0722*m[2]};
          const ev=[...document.querySelectorAll('.tk-ev')];const bg=new Set(ev.map(e=>getComputedStyle(e).backgroundColor));
          const cr=ev.map(e=>{const a=L(getComputedStyle(e.querySelector('.tk-ev-b')).color),b=L(getComputedStyle(e).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
          return {n:ev.length,bgs:bg.size,minContrast:Math.min(...cr),heads:ev.every(e=>e.querySelector('.tk-ev-who')&&e.querySelector('.tk-ev-t'))}})()""")
        # Omritning av samma tråd: rutan står kvar om man rullat upp; ny tråd öppnas längst ner. Sidan rör sig aldrig.
        res['mount']=p.evaluate("""(()=>{const A=window.ARENDE,box=document.createElement('div');document.body.appendChild(box);
          const draw=()=>{box.innerHTML=A.thread(Array.from({length:30},(_, i)=>A.event('X','2026-11-13T10:00:00Z','rad '+i)));box.firstChild.style.maxHeight='200px';};
          const y0=scrollY;draw();A.mountThread(box,'a');const t=box.firstChild;const atEnd=t.scrollTop===t.scrollHeight-t.clientHeight;
          t.scrollTop=50;t.dispatchEvent(new Event('scroll'));draw();A.mountThread(box,'a');const kept=box.firstChild.scrollTop;
          draw();A.mountThread(box,'b');const nb=box.firstChild;const other=nb.scrollTop===nb.scrollHeight-nb.clientHeight;box.remove();return {atEnd,kept,other,pageMoved:scrollY!==y0}})()""")
    br.close()
srv.shutdown()
print(json.dumps(res,ensure_ascii=False))
assert not errors,errors
if PREFIX!='fore':
    assert 'Bokad tid:' in res['arende_sum'] and 'Godkänd' in res['arende_sum'] and 'Väntar på admins svar' in res['arende_sum'],res['arende_sum']
    assert res['arende_bk_events']==3,res['arende_bk_events']
    assert 'Sjukanmälan:' in res['sjuk'] and 'Verkstadstimmar:' in res['verkstadstimmar'],res
    a=res['arende'];assert a['y']==0 and a['thr'] and a['thr']['max']>0 and abs(a['thr']['top']-a['thr']['max'])<2,a
    assert 'Service lampan' in a['text'] and 'Christian P' in a['text'],a
    st_=res['stil'];assert st_['bgs']==1 and st_['heads'] and st_['minContrast']>=4.5,st_
    m=res['mount'];assert m['atEnd'] and m['kept']==50 and m['other'] and not m['pageMoved'],m
print('PASS previews ->',OUT,PREFIX)
