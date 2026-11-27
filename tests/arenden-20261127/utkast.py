"""Isolated Playwright/Chromium, local production files + synthetic RPCs only.
Never attaches to the desktop browser; no existing profile, credentials or remote API.
Run: /workspace/pwenv/bin/python tests/arenden-20261127/utkast.py
"""
from pathlib import Path
import os, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/taxidata-cleanup/screenshots/utkast-20261127'))
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
    keys="Object.keys(localStorage).filter(k=>k.startsWith('taxi_mx_draft:'))"
    for theme in ['light','dark']:
        p=newpage(br)
        if theme=='dark': p.evaluate("document.documentElement.setAttribute('data-theme','dark')")
        p.wait_for_selector('#app',state='visible');p.click('#profile-btn');p.click('#menu-inkorg');p.wait_for_selector('.mx-filters')
        p.get_by_role('button',name='＋ Nytt ärende',exact=True).click();p.get_by_role('button',name='Meddelande',exact=True).last.click();p.wait_for_selector('#mx-form')
        p.fill('#mx-subject','Bromsarna skriker (test)');p.fill('#mx-body','Det låter när jag bromsar. (test)')
        check(p.locator('#mx-draft-hint').inner_text()=='Utkast sparat');check(len(p.evaluate(keys))==1)
        shot(p,'01-formular-utkast-sparat-'+theme)
        # gå till startsidan och tillbaka
        p.evaluate('goHome()');p.wait_for_timeout(300);p.click('#profile-btn');p.click('#menu-inkorg');p.wait_for_selector('.mx-filters')
        check(p.locator('.mx-drafts').count()==1 and 'Bromsarna skriker' in p.locator('.mx-drafts').inner_text())
        shot(p,'02-lista-utkast-'+theme)
        p.locator('.mx-draft-open').first.click();p.wait_for_selector('#mx-form')
        check(p.input_value('#mx-subject')=='Bromsarna skriker (test)' and 'Det låter' in p.input_value('#mx-body'))
        check(p.locator('#mx-draft-hint').inner_text()=='Utkast återställt')
        shot(p,'03-utkast-aterstallt-'+theme)
        p.click('button[type=submit]');p.wait_for_selector('#mx-reply-body');p.wait_for_timeout(300)
        check(len(p.evaluate(keys))==0)
        # svarsutkast i tråd
        p.evaluate('INKORG.openThread(801)');p.wait_for_selector('#mx-reply-body');p.fill('#mx-reply-body','Jag återkommer (test)')
        check(p.locator('#mx-draft-hint').inner_text()=='Utkast sparat')
        p.evaluate('goHome()');p.wait_for_timeout(300);p.click('#profile-btn');p.click('#menu-inkorg');p.wait_for_selector('.mx-filters')
        check(p.locator('.mx-drafts').count()==1)
        p.evaluate('INKORG.openThread(801)');p.wait_for_selector('#mx-reply-body');check(p.input_value('#mx-reply-body')=='Jag återkommer (test)')
        shot(p,'04-svar-aterstallt-'+theme)
        p.click('.mx-draft-drop');check(p.input_value('#mx-reply-body')=='' and len(p.evaluate(keys))==0)
        # utloggning rensar
        p.fill('#mx-reply-body','kvar?');check(len(p.evaluate(keys))==1)
        p.evaluate('INKORG.logout()');check(len(p.evaluate(keys))==0)
        p.close()
        a=newpage(br,'admin','/TaxiData/admin.html#arenden')
        if theme=='dark': a.evaluate("document.documentElement.setAttribute('data-theme','dark')")
        a.wait_for_selector('.mx-actions')
        a.evaluate('ARENDEN_ADMIN.openThread(801)');a.wait_for_selector('#mx-reply-body');a.fill('#mx-reply-body','Admin-svar (test)')
        a.evaluate("path=[];render()");a.wait_for_timeout(200);a.evaluate("openMenu('arenden')");a.wait_for_selector('.mx-filters')
        check(a.locator('.mx-drafts').count()==1);shot(a,'05-admin-utkast-'+theme)
        a.evaluate('ARENDEN_ADMIN.openThread(801)');a.wait_for_selector('#mx-reply-body');check(a.input_value('#mx-reply-body')=='Admin-svar (test)')
        a.close()
    br.close()
 assert not errors,errors
 print('PASS utkast',checks,'checks ->',OUT)
except Exception:
 import traceback;traceback.print_exc();print(errors);raise SystemExit(1)
