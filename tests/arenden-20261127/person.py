"""Isolated Playwright/Chromium, local production files + synthetic RPCs only.
Never attaches to the desktop browser; no existing profile, credentials or remote API.
Run: /workspace/pwenv/bin/python tests/arenden-20261127/person.py
"""
from pathlib import Path
import os, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/taxidata-cleanup/screenshots/person-20261127'))
OUT.mkdir(parents=True,exist_ok=True)
FIXTURES=(ROOT/'tests/meddelanden/fixtures.js').read_text()+'\n'+(ROOT/'tests/inkorg/fixtures.js').read_text()+'\n'+(ROOT/'tests/inkorg-v2/fixtures.js').read_text()
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
    for theme in ['light','dark']:
        a=newpage(br,'admin','/TaxiData/admin.html#arenden')
        if theme=='dark': a.evaluate("document.documentElement.setAttribute('data-theme','dark')")
        a.wait_for_selector('.mx-actions');a.wait_for_function("document.querySelectorAll('.ar-row').length>5")
        total=a.locator('.ar-row').count()
        a.evaluate('ARENDEN_ADMIN.openThread(801)');a.wait_for_selector('#mx-reply-body');a.wait_for_selector('.mx-person')
        check(a.locator('.mx-person').inner_text()=='Testförare')
        shot(a,'admin-trad-namn-'+theme)
        a.click('.mx-person');a.wait_for_selector('.mx-person-chip')
        check(a.locator('.mx-person-chip span').inner_text()=='Ärenden: Testförare')
        n=a.locator('.ar-row').count();check(0<n<total)
        check(all('Testförare' in t for t in a.locator('.ar-row .ar-m').all_inner_texts()))
        shot(a,'admin-filtrerad-'+theme)
        # kategori + person tillsammans
        a.get_by_role('button',name='Verkstadstimmar',exact=True).click();check(a.locator('.mx-person-chip').count()==1)
        check(a.locator('.ar-row').count()==0)
        a.get_by_role('button',name='Alla',exact=True).first.click();check(a.locator('.ar-row').count()==n)
        # rensa
        a.click('.mx-person-chip button');check(a.locator('.mx-person-chip').count()==0);check(a.locator('.ar-row').count()==total)
        # filter, öppna tråd, gå ut och in: alltid lista utan filter
        a.evaluate('ARENDEN_ADMIN.openThread(801)');a.wait_for_selector('.mx-person');a.click('.mx-person');a.wait_for_selector('.mx-person-chip')
        a.evaluate("path=[];render()");a.wait_for_timeout(200);a.evaluate("openMenu('arenden')");a.wait_for_selector('.mx-filters')
        check(a.locator('.mx-person-chip').count()==0 and a.locator('.ar-row').count()==total)
        a.close()
    # förare: inget namn att klicka (alla trådar är med Admin)
    p=newpage(br);p.wait_for_selector('#app',state='visible');p.click('#profile-btn');p.click('#menu-inkorg');p.wait_for_selector('.mx-filters')
    p.evaluate("INKORG.openThread(801)");p.wait_for_selector('#mx-reply-body');check(p.locator('.mx-person').count()==0);p.close()
    # djuplänk öppnar fortfarande tråden
    d=newpage(br,'admin','/TaxiData/admin.html#message=801');d.wait_for_selector('#mx-reply-body');check(d.locator('.mx-filters').count()==0);d.close()
    br.close()
 assert not errors,errors
 print('PASS person',checks,'checks ->',OUT)
except Exception:
 import traceback;traceback.print_exc();print(errors);raise SystemExit(1)
