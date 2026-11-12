"""Förhandsbilder för 2026-11-12svar1. Isolerad Chromium, lokala filer + påhittade RPC-svar (inget mot servern).
Kör: /workspace/pwenv/bin/python tests/arende-svar/preview.py"""
from pathlib import Path
import os, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/anim-preview/arende-svar'));OUT.mkdir(parents=True,exist_ok=True)
FIX=''.join((ROOT/p).read_text()+'\n' for p in ['tests/meddelanden/fixtures.js','tests/inkorg/fixtures.js','tests/inkorg-v2/fixtures.js'])
OVERLAY=r"""
(function(){
 var body='Bromsar har låtit i flera veckor, de måste nog bytas väldigt snart. \n\nNågot i framvagnen är utslitet och behöver bytas, det kluckar och knackar. Det har gjort det i några veckor.\n\nNu när det blivit kallt så gnisslar bilen något fruktansvärt över gupp.\n\nService lampan har lyst i några dagar. 100 mil kvar nu. Har rickard bokat än?';
 var row={kind:'issue',id:21,title:'Felanmälan',car:'A191',txt:body,status:'ny',st:'ny',who:'Christian Parsa',mine:false,needs:true,urgent:false,at:'2026-11-07T01:17:36Z'};
 MOCK.admin.items=[row].concat(MOCK.admin.items.filter(function(x){return x.id!==111;}));
 MOCK.cases['issue:21']={kind:'issue',id:21,st:'ny',admin:true,data:{id:21,kind:'fault',car:'A191',body:body,blocking:false,status:'ny',mine:false,created_at:'2026-11-07T01:17:36Z',photos:1,reporter_name:'Christian Parsa',history:[{status:'ny',at:'2026-11-07T01:17:36Z'}],msgs:[]}};
 var prev=window.fetch;window.fetch=function(url,opt){var m=/\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(String(url));
  if(m&&m[1]==='car_issue_message'){var a=JSON.parse(opt.body);MOCK.cases['issue:'+a.p_id].data.msgs.push({id:1,role:'owner',who:'Berra',body:a.p_body,at:new Date().toISOString()});row.last_txt=a.p_body;row.last_from='agare';
   return new Promise(function(ok){setTimeout(function(){ok(new Response('{}',{status:200,headers:{'Content-Type':'application/json'}}));},60);});}
  if(m&&m[1]==='mailbox_v2'){var b=JSON.parse(opt.body),o={item_flags:[],unread_flags:[],mailbox_capabilities:{can_trash:true},item_lock:{locked:false},mark_read:{},mark_unread:{}}[b.p_action];
   if(o!==undefined)return Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}));}
  return prev.apply(this,arguments);};
})();"""
class Q(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=ThreadingHTTPServer(('127.0.0.1',0),partial(Q,directory=str(ROOT)));threading.Thread(target=srv.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(srv.server_port);errors=[]
with sync_playwright() as pw:
    br=pw.chromium.launch()
    ctx=br.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='sv-SE',timezone_id='Europe/Stockholm')
    ctx.route('**/*',lambda r: r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,content_type='application/json',body='{}'))
    ctx.add_init_script("localStorage.clear();localStorage.setItem('taxi_session','synthetic');localStorage.setItem('taxi_driver','693340');localStorage.setItem('taxi_logged_in','1');window.TEST_ROLE='admin';\n"+FIX+OVERLAY)
    p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.on('console',lambda m:print('CONSOLE',m.text) if os.environ.get('DBG') else None)
    p.goto(BASE+'/TaxiData/admin.html#arenden',wait_until='networkidle');p.wait_for_selector('.mx-actions');p.wait_for_timeout(300)
    lst=p.locator('.mx').first;txt=lst.inner_text();assert 'A191' in txt,(txt,errors,p.evaluate('MOCK.calls'))
    assert 'Bil A191 · Ny · Arkiv' not in txt
    p.evaluate("""(()=>{const e=[...document.querySelectorAll('.mx *')].find(x=>x.children.length===0&&/^Bil A191/.test(x.textContent));e.scrollIntoView({block:'center'})})()""");p.wait_for_timeout(150)
    p.screenshot(path=str(OUT/'03-lista-utan-arkiv.png'))
    p.evaluate("ARENDEN_ADMIN.openCase('issue',21)");p.wait_for_selector('#mx-legacy-text');p.wait_for_timeout(200)
    assert p.locator('text=Äldre bilärende').count()==0
    p.locator('#mx-legacy-text').fill('Rickard har bokat verkstad på måndag kl 8. Lämna bilen där innan passet.')
    p.locator('#mx-legacy-text').scroll_into_view_if_needed();p.wait_for_timeout(150)
    p.screenshot(path=str(OUT/'01-felanmalan-svarsruta.png'),full_page=True)
    p.get_by_role('button',name='Skicka meddelande',exact=True).click()
    p.wait_for_function("document.querySelector('.ar-thr')&&document.querySelector('.ar-thr').textContent.includes('Rickard har bokat')");p.wait_for_timeout(200)
    assert p.input_value('#mx-legacy-text')==''
    p.screenshot(path=str(OUT/'02-efter-skickat-svar.png'),full_page=True)
    br.close()
srv.shutdown()
assert not errors,errors
print('PASS previews ->',OUT)
