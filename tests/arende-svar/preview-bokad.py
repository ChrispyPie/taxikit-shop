"""Förhandsbilder för Bokad tid på felanmälan (2026-11-12svar2). Isolerad Chromium, lokala filer + påhittade RPC-svar.
Kör: /workspace/pwenv/bin/python tests/arende-svar/preview-bokad.py"""
from pathlib import Path
import os, threading, json, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/anim-preview/arende-svar'));OUT.mkdir(parents=True,exist_ok=True)
FIX=''.join((ROOT/p).read_text()+'\n' for p in ['tests/meddelanden/fixtures.js','tests/inkorg/fixtures.js','tests/inkorg-v2/fixtures.js'])
DAY=(datetime.date.today()+datetime.timedelta(days=4)).isoformat()
OVERLAY=r"""
(function(){
 var role=window.TEST_ROLE,admin=role==='admin',S=JSON.parse(localStorage.getItem('ib_state')||'{"thread":null,"bookings":[]}');
 function save(){localStorage.setItem('ib_state',JSON.stringify(S));}
 var body='Bromsar har låtit i flera veckor, de måste nog bytas väldigt snart. \n\nNågot i framvagnen är utslitet och behöver bytas, det kluckar och knackar. Det har gjort det i några veckor.\n\nNu när det blivit kallt så gnisslar bilen något fruktansvärt över gupp.\n\nService lampan har lyst i några dagar. 100 mil kvar nu. Har rickard bokat än?';
 var row={kind:'issue',id:21,title:'Felanmälan',car:'A191',txt:body,status:'ny',st:'ny',who:'Christian Parsa',mine:!admin,needs:true,urgent:false,unread:0,at:'2026-11-07T01:17:36Z'};
 MOCK.admin.items=[row].concat(MOCK.admin.items.filter(function(x){return x.id!==111;}));MOCK.inbox.items=[row].concat(MOCK.inbox.items);
 MOCK.cases['issue:21']={kind:'issue',id:21,st:'ny',admin:admin,data:{id:21,kind:'fault',car:'A191',body:body,blocking:false,status:'ny',mine:!admin,created_at:'2026-11-07T01:17:36Z',photos:1,reporter_name:'Christian Parsa',history:[{status:'ny',at:'2026-11-07T01:17:36Z'}],msgs:[]}};
 function ok(o){return new Promise(function(r){setTimeout(function(){r(new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}));},40);});}
 var prev=window.fetch;window.fetch=function(url,opt){var m=/\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(String(url));
  if(m&&m[1]==='issue_booking'){var a=JSON.parse(opt.body),d=a.p_data;
   if(a.p_action==='links')return ok(S.thread?[{issue_id:21,thread_id:S.thread,booking_states:S.bookings.map(function(b){return b.status;}),next_at:null,unread:false}]:[]);
   if(a.p_action==='get')return ok({thread_id:S.thread,is_driver:!admin,bookings:S.bookings});
   if(a.p_action==='book'){S.thread=S.thread||901;S.bookings.push({id:S.bookings.length+1,thread_id:S.thread,kind:d.kind,title:d.kind,starts_at:d.date+'T'+d.time+':00+01:00',car_number:d.car_choice==='191'?'A191':null,status:admin?'pending_driver':'pending_admin',proposer_role:admin?'admin':'driver',created_at:new Date().toISOString(),decided_at:null,reason:null});save();return ok({thread_id:S.thread,issue_id:21});}}
  if(m&&m[1]==='mailbox_v2'){var b=JSON.parse(opt.body),o={item_flags:[],unread_flags:[],mailbox_capabilities:{can_trash:admin},item_lock:{locked:false},mark_read:{},mark_unread:{},cars:[{id:25,number:'A101'},{id:191,number:'A191'},{id:7,number:'A207'}]}[b.p_action];
   if(b.p_action==='decide'){var bk=S.bookings.find(function(x){return x.id===b.p_data.booking_id;});bk.status=b.p_data.decision;bk.reason=b.p_data.reason||null;bk.decided_at=new Date().toISOString();save();return ok({id:S.thread});}
   if(o!==undefined)return ok(o);}
  return prev.apply(this,arguments);};
})();"""
class Q(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=ThreadingHTTPServer(('127.0.0.1',0),partial(Q,directory=str(ROOT)));threading.Thread(target=srv.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(srv.server_port);errors=[]
def page(br,role,me,state):
    ctx=br.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='sv-SE',timezone_id='Europe/Stockholm')
    ctx.route('**/*',lambda r: r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,content_type='application/json',body='{}'))
    ctx.add_init_script("if(!sessionStorage.getItem('init')){localStorage.clear();localStorage.setItem('ib_state',"+json.dumps(json.dumps(state))+");sessionStorage.setItem('init','1');}localStorage.setItem('taxi_session','synthetic');localStorage.setItem('taxi_driver','"+me+"');localStorage.setItem('taxi_logged_in','1');window.TEST_ROLE='"+role+"';\n"+FIX+OVERLAY)
    p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));return p
def shot(p,name,full=True):
    p.wait_for_timeout(200);p.screenshot(path=str(OUT/(name+'.png')),full_page=full)
def state(p): return json.loads(p.evaluate("localStorage.getItem('ib_state')"))
with sync_playwright() as pw:
    br=pw.chromium.launch()
    # Ägaren (Berra) i Admin › Ärenden
    a=page(br,'admin','693340',{'thread':None,'bookings':[]})
    a.goto(BASE+'/TaxiData/admin.html#arenden',wait_until='networkidle');a.wait_for_selector('.mx-actions')
    a.evaluate("ARENDEN_ADMIN.openCase('issue',21)");a.wait_for_selector('#mx-legacy-text');a.wait_for_selector('text=Bokad tid')
    shot(a,'04-felanmalan-svar-och-bokad-tid')
    a.get_by_role('button',name='Bokad tid',exact=True).click();a.wait_for_selector('#mx-form');a.wait_for_function("document.querySelector('#mx-car_choice').value==='191'")
    a.evaluate("ARENDEN_ADMIN.pickDate('"+DAY+"')");a.select_option('#mx-hour','08');a.select_option('#mx-minute','00')
    assert a.locator('#mx-body').count()==0
    assert a.locator('#mx-driver_id').count()==0
    shot(a,'05-bokad-tid-formular-A191')
    a.locator('#mx-form button[type=submit]').click();a.wait_for_selector('.mx-booking.pending');a.wait_for_selector('#mx-legacy-text')
    assert 'Väntar på förarens svar' in a.locator('.mx-booking').inner_text()
    shot(a,'06-efter-forslag-vantar-pa-foraren')
    a.evaluate("ARENDEN_ADMIN.back()");a.wait_for_timeout(400)
    txt=a.locator('.mx').first.inner_text();assert 'Bokad tid väntar på föraren' in txt,txt;assert 'Felanmälan · bil A191' not in txt
    s=state(a);a.context.close()
    # Föraren (Christian) i Meddelanden
    d=page(br,'standard','710022',s)
    d.goto(BASE+'/TaxiData/index.html',wait_until='networkidle');d.wait_for_selector('#app',state='visible')
    d.wait_for_timeout(600)
    if d.get_by_role('button',name='Inte nu',exact=True).count():d.get_by_role('button',name='Inte nu',exact=True).click()
    d.click('#profile-btn');d.click('#menu-inkorg');d.wait_for_selector('.mx-filters')
    d.evaluate("INKORG.openCase('issue',21)");d.wait_for_selector('.mx-booking.pending')
    assert d.get_by_role('button',name='Acceptera',exact=True).count()==1 and d.get_by_role('button',name='Avböj',exact=True).count()==1
    d.locator('.mx-booking').scroll_into_view_if_needed();shot(d,'07-foraren-acceptera-avboj')
    d.get_by_role('button',name='Acceptera',exact=True).click();d.wait_for_selector('.mx-booking.solid')
    assert 'Godkänd' in d.locator('.mx-booking').inner_text()
    d.locator('.mx-booking').scroll_into_view_if_needed();shot(d,'08-efter-godkand-fast-bokning')
    br.close()
srv.shutdown()
assert not errors,errors
print('PASS bokad-tid previews ->',OUT)
