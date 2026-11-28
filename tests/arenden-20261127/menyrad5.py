"""Isolated Playwright/Chromium, local production files + synthetic RPCs only.
Never attaches to the desktop browser; no existing profile, credentials or remote API.
Run: /workspace/pwenv/bin/python tests/arenden-20261127/menyrad5.py
"""
from pathlib import Path
import os, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/taxidata-cleanup/screenshots/menyrad-20261127'))
OUT.mkdir(parents=True,exist_ok=True)
OVERLAY='''(function(){var prev=window.fetch;window.fetch=function(url,opt){var m=/\\/rest\\/v1\\/rpc\\/([a-z_0-9]+)/.exec(String(url));var ok=function(o){return Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}));};if(m){if(m[1]==='get_my_workshop')return ok({cars:[{id:1,bilnummer:'25',modell:'Test'},{id:2,bilnummer:'7',modell:'Test'}],rate:100,entries:[],issues:[]});if(m[1]==='get_bil')return ok({cars:[],issues:[],maint:[],is_admin:false});if(m[1]==='sjuk_get')return ok({mine:[],all:[],boss:false,me:'900001',today:new Date().toISOString().slice(0,10)});}return prev.apply(this,arguments);};})();'''
FIXTURES=(ROOT/'tests/meddelanden/fixtures.js').read_text()+'\n'+(ROOT/'tests/inkorg/fixtures.js').read_text()+'\n'+(ROOT/'tests/inkorg-v2/fixtures.js').read_text()+'\n'+OVERLAY
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(server.server_port)
checks=0
errors=[]
def check(condition):
    global checks
    assert condition
    checks+=1

def newpage(browser,role='standard',url='/TaxiData/index.html',width=390,device=None):
    options=dict(viewport={'width':width,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='sv-SE',timezone_id='Europe/Stockholm')
    if device: options.update({k:v for k,v in pw.devices[device].items() if k!='default_browser_type'})
    context=browser.new_context(**options)
    context.route('**/*',lambda route: route.continue_() if route.request.url.startswith(BASE) else route.fulfill(status=200,content_type='application/json',body='{}'))
    context.add_init_script("localStorage.clear();localStorage.setItem('taxi_session','synthetic-test-fixture');localStorage.setItem('taxi_driver','900001');localStorage.setItem('taxi_logged_in','1');window.TEST_ROLE="+repr(role)+';\n'+FIXTURES+"\ndocument.addEventListener('DOMContentLoaded',()=>{let b=document.createElement('div');b.textContent='TESTVY · påhittade exempel · mobil';b.style='text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:4px';document.body.prepend(b);});")
    p=context.new_page()
    p.on('pageerror',lambda e:errors.append(str(e)))
    p.goto(BASE+url,wait_until='networkidle')
    return p

def shot(p,name):
    p.wait_for_timeout(150)
    check(p.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    p.screenshot(path=str(OUT/(name+'.png')))

def pickdate(p,value,shot_name=None):
    p.get_by_role('button',name='Välj datum',exact=True).click();p.wait_for_selector('#mx-calendar[open]')
    for _ in range(25):
        month=p.locator('.mx-cal-day').first.get_attribute('aria-label')[:7]
        if month==value[:7]: break
        p.get_by_role('button',name='Nästa månad' if month<value[:7] else 'Föregående månad',exact=True).click()
    else: raise AssertionError('Calendar month not reached')
    if shot_name: shot(p,shot_name)
    p.get_by_role('button',name=value,exact=True).click();check(p.input_value('#mx-date')==value)

def settime(p,value):
    hour,minute=value.split(':');p.select_option('#mx-hour',hour);p.select_option('#mx-minute',minute)
    check(p.locator('input[type=time]').count()==0)
    check(p.locator('#mx-hour option').all_text_contents()==['Välj']+[f'{h:02}' for h in range(24)])
    check(p.locator('#mx-minute option').all_text_contents()==['Välj']+[f'{m:02}' for m in range(60)])

try:
 with sync_playwright() as pw:
    br=pw.chromium.launch(headless=True,executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--disable-gpu'])
    for width in (360,390):
      for theme in ['light','dark']:
        p=newpage(br,width=width)
        if theme=='dark': p.evaluate("document.documentElement.setAttribute('data-theme','dark')")
        p.wait_for_selector('#app',state='visible')
        p.get_by_text('Kalender',exact=True).first.click();p.wait_for_selector('.kal-toolbar',timeout=20000)
        check(p.locator('#kal-pick').count()==0)
        check(p.locator('#kal-date').evaluate("e=>e.tagName")=='BUTTON')
        box=p.locator('.kal-toolbar').bounding_box(); check(box and box['height']<56)
        check(p.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
        shot(p,'kal-%s-%s'%(width,theme))
        u=p.locator('#kal-unit');a0=u.get_attribute('aria-label')
        u.click();p.wait_for_timeout(400);check(u.get_attribute('aria-label')!=a0)
        p.click('#kal-date');p.wait_for_selector('.pm-overlay, .pm-box, #pm-ok',timeout=5000)
        shot(p,'kal-pick-%s-%s'%(width,theme))
        p.keyboard.press('Escape');p.evaluate("document.querySelectorAll('.pm-overlay').forEach(e=>e.remove())")
        p.locator('#home-btn, .home-btn, [aria-label=Hem], button:has-text("🏠")').first.click() if p.locator('#home-btn, .home-btn, [aria-label=Hem]').count() else p.evaluate('goHome&&goHome()');p.wait_for_timeout(400)
        p.get_by_text('Lönekoll',exact=True).first.click();p.wait_for_selector('#lk-date',timeout=20000)
        box=p.locator('#lk-date').evaluate("e=>e.closest('.mb-toolbar').getBoundingClientRect().height"); check(box<56)
        check(p.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
        shot(p,'lk-%s-%s'%(width,theme))
        p.close()
    br.close()
 assert not errors,errors
 print('PASS menyrad5',checks,'checks ->',OUT)
except Exception:
 import traceback;traceback.print_exc();print(errors);raise SystemExit(1)
