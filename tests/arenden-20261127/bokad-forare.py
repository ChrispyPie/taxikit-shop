"""Isolated Playwright/Chromium, local production files + synthetic RPCs only.
Never attaches to the desktop browser; no existing profile, credentials or remote API.
Run: /workspace/pwenv/bin/python tests/arenden-20261127/bokad-forare.py
"""
from pathlib import Path
import os, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/taxidata-cleanup/screenshots/bokad-forare-20261127'))
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
        p=newpage(br)
        if theme=='dark': p.evaluate("document.documentElement.setAttribute('data-theme','dark')")
        p.wait_for_selector('#app',state='visible');p.click('#profile-btn');p.click('#menu-inkorg');p.wait_for_selector('.mx-filters')
        p.get_by_role('button',name='＋ Nytt ärende',exact=True).click();p.wait_for_selector('dialog[open]')
        check(p.locator('dialog button').all_text_contents()==['Meddelande','Bokad tid','Sjuk','Verkstadstimmar','Avbryt'])
        shot(p,'01-nytt-arende-'+theme)
        p.get_by_role('button',name='Bokad tid',exact=True).last.click();p.wait_for_selector('#mx-form')
        check(p.locator('#mx-driver_id').count()==0);check(p.input_value('#mx-car_choice')=='none')
        check(p.locator('#mx-body[required]').count()==1 and p.locator('label[for=mx-body]').inner_text()=='Meddelande')
        check(p.locator('#mx-hour option').all_text_contents()==['Välj']+[f'{h:02}' for h in range(24)])
        p.fill('#mx-kind','Service (test)')
        # saknat datum/meddelande stoppas
        import datetime
        day=(datetime.date.today()+datetime.timedelta(days=6)).isoformat()
        pickdate(p,day);settime(p,'08:30')
        p.evaluate("document.querySelector('#mx-form').noValidate=true");p.click('button[type=submit]');p.wait_for_timeout(200);check('Skriv ett meddelande' in p.locator('.mx-server-error').inner_text())
        p.evaluate("document.querySelector('#mx-form').noValidate=false");p.fill('#mx-body','Kan jag lämna bilen på service den dagen? (test)');p.select_option('#mx-car_choice','1');shot(p,'02-bokad-tid-formular-'+theme)
        p.click('button[type=submit]');p.wait_for_selector('#mx-reply-body')
        txt=p.locator('.mx-booking').first.inner_text();check('Väntar på admins svar' in txt and '08:30' in txt)
        check(p.locator('.mx-booking button').all_text_contents()==['Föreslå ny tid','Avboka'])
        shot(p,'03-trad-vantar-'+theme)
        call=[c for c in p.evaluate('V2.calls') if c['action']=='book'][-1]['data'];check(call['date']==day and call['time']=='08:30' and call['kind']=='Service (test)' and call['car_choice']=='1' and not call.get('thread_id'))
        p.get_by_role('button',name='‹ Meddelanden',exact=False).first.click() if p.get_by_role('button',name='‹ Meddelanden',exact=False).count() else p.evaluate('INKORG.back()')
        p.wait_for_selector('.mx-filters')
        row=[r for r in p.locator('.mx-select-row').all() if 'Service (test)' in r.inner_text()][0]
        check(row.locator('.mx-v-wait').count()==1 and row.locator('.mx-v-wait').inner_text()=='?')
        shot(p,'04-lista-fragetecken-'+theme)
        p.close()
    br.close()
 assert not errors,errors
 print('PASS bokad-forare',checks,'checks ->',OUT)
except Exception:
 import traceback;traceback.print_exc();print(errors);raise SystemExit(1)
