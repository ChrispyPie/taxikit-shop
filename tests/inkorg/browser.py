"""Isolated Playwright/Chromium, local production files + synthetic RPCs only.
Never attaches to the desktop browser; no existing profile, credentials or remote API.
Run: /workspace/pwenv/bin/python tests/inkorg/browser.py
"""
from pathlib import Path
import os, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/taxidata-cleanup/screenshots/inkorg'))
OUT.mkdir(parents=True,exist_ok=True)
FIXTURES=(ROOT/'tests/meddelanden/fixtures.js').read_text()+'\n'+(ROOT/'tests/inkorg/fixtures.js').read_text()
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

def newpage(browser,role='standard',url='/TaxiData/index.html',width=390):
    context=browser.new_context(viewport={'width':width,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,timezone_id='Europe/Stockholm')
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

try:
 with sync_playwright() as pw:
    br=pw.chromium.launch(headless=True,executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--disable-gpu'])
    p=newpage(br)
    p.wait_for_selector('#app',state='visible')
    p.click('#profile-btn')
    check(p.locator('#menu-inkorg').inner_text().strip()=='📥 Inkorg')
    check(p.locator('#menu-arenden').count()==0)
    shot(p,'01-profilmeny')
    p.click('#menu-inkorg');p.wait_for_selector('.msg-tabs')
    check(p.locator('.msg-tabs button').count()==9)
    p.wait_for_function("document.querySelectorAll('.ar-list .ar-row').length===11")
    shot(p,'02-alla')
    titles=p.locator('.ar-list .ar-row b').all_text_contents()
    check(titles[:4]==['Felanmälan · T-0001','Passbyte på fredag','Tack för hjälpen','Service (exempel) · T-0001'])
    check(p.locator('.ar-row.done').count()==4)
    p.get_by_role('button',name='Förbrukning',exact=True).click()
    check(p.locator('.ar-list .ar-row').count()==2)
    shot(p,'03-forbrukning')
    p.get_by_role('button',name='Underhåll',exact=True).click();p.locator('.ar-list .ar-row').click()
    p.wait_for_selector('.ar-card')
    check('Mitt förslag om service' in p.locator('.ar-card').inner_text())
    check(p.locator('.ar-card h2').inner_text()=='Service (exempel)')
    shot(p,'04-underhall')
    p.evaluate('INKORG.back()');p.evaluate("INKORG.select('alla')")
    p.get_by_role('button',name='＋ Nytt ärende',exact=True).click()
    p.wait_for_selector('dialog[open]')
    check(p.locator('dialog button').count()==6) # five available types + cancel; wishes remain admin-only
    shot(p,'05-nytt-arende')
    p.keyboard.press('Escape');check(p.locator('dialog[open]').count()==0)
    p.get_by_role('button',name='＋ Nytt ärende',exact=True).click()
    p.get_by_role('button',name='Felanmälan ›',exact=True).click();p.wait_for_selector('#bv-save')
    shot(p,'06-form-felanmalan')
    # Each creation route uses the original production form, not a second implementation.
    p.evaluate('INKORG.back()');p.evaluate("INKORG.report('behov')");p.wait_for_selector('#bv-save')
    shot(p,'07-form-forbrukning')
    p.evaluate('INKORG.back()');p.evaluate("INKORG.report('underhall')");p.wait_for_selector('#bm-save')
    check('Föreslå underhåll' in p.locator('#msg-report').inner_text())
    shot(p,'08-form-underhall')
    p.evaluate('INKORG.back()');p.evaluate("INKORG.report('timmar')");p.wait_for_selector('#vk-save')
    shot(p,'09-form-verkstadstid')
    p.evaluate('INKORG.back()');p.evaluate("INKORG.report('sjuk')");p.wait_for_selector('#sj-start')
    shot(p,'10-form-sjukanmalan')
    # Existing profile entry point opens a composer with the correct recipient.
    p.evaluate('openProfile()');p.wait_for_selector('[data-a=msg]')
    p.locator('[data-a=msg]').click();p.wait_for_selector('#msg-to option[value="900002"]',state='attached')
    check(p.locator('#msg-to').input_value()=='900002')
    p.locator('#msg-subject').fill('Testfråga');p.locator('#msg-body').fill('Syntetiskt meddelande')
    p.evaluate('INKORG.refresh()');check(p.locator('#msg-body').input_value()=='Syntetiskt meddelande')
    shot(p,'11-profil-meddelande')
    p.locator('#msg-compose button[type=submit]').click();p.wait_for_selector('#msg-reply-form')
    check(p.evaluate("MOCK.calls.filter(x=>x==='conversation_create').length") == 1)
    p.evaluate('INKORG.readConversation(701)');p.wait_for_function("document.querySelectorAll('.msg-bubble').length===2")
    shot(p,'12-meddelandetrad')
    p.locator('#msg-reply-body').fill('Testsvaret');p.locator('#msg-reply-form button').click()
    p.wait_for_function("document.querySelectorAll('.msg-bubble').length===3")
    check(p.evaluate("MOCK.calls.filter(x=>x==='conversation_reply').length") == 1)
    # Background message refresh must not overwrite a case thread.
    p.evaluate("INKORG.tap('issue',101)");p.wait_for_selector('#ink-txt')
    p.locator('#ink-txt').fill('Oskickat svar');p.evaluate('INKORG.loadMessages()');p.wait_for_timeout(120)
    check(p.locator('#ink-txt').input_value()=='Oskickat svar')
    shot(p,'13-arendetrad')
    # Late responses cannot reopen a thread after a filter/back navigation.
    p.evaluate("INKORG.back();window.originalRPC=ARENDE.rpc;ARENDE.rpc=function(n,a){return n==='conversation_get'?new Promise(r=>window.delayedConversation=r):originalRPC(n,a);};INKORG.readConversation(701);INKORG.select('supply');delayedConversation(MOCK.threads[701]);")
    p.wait_for_timeout(120)
    check(p.locator('.msg-tabs').count()==1)
    check(p.locator('.msg-tabs .on').inner_text()=='Förbrukning')
    p.evaluate('ARENDE.rpc=originalRPC')
    # Owner sees messages only but can open the same new-case picker.
    own=newpage(br,'agare');own.evaluate('INKORG.show()');own.wait_for_selector('.msg-tabs')
    own.wait_for_function("document.querySelectorAll('.ar-list .ar-row').length===2")
    check(own.locator('.msg-tabs button').count()==2)
    check('Admin › Ärenden' in own.locator('#msg-root').inner_text())
    shot(own,'14-agare-inkorg')
    own.evaluate('INKORG.newCase()');own.wait_for_selector('dialog[open]')
    check(own.get_by_role('button',name='Önskemål till Christian ›',exact=True).count()==1)
    own.get_by_role('button',name='Önskemål till Christian ›',exact=True).click()
    own.wait_for_selector('#onk-text')
    shot(own,'15-onskemal-befintligt-formular')
    # Ordinary admin gets non-confidential cases but not salaries or sickness.
    a=newpage(br,'admin','/TaxiData/admin.html#arenden');a.wait_for_selector('#ara-type')
    check('Sjukanmälan' not in ' '.join(a.locator('.ar-list').all_text_contents()))
    check('Service (exempel)' in a.locator('#content').inner_text())
    shot(a,'16-admin-arenden')
    a.evaluate("ARENDEN_ADMIN.tap('wh',211)");a.wait_for_selector('.ar-tools')
    check('Fråga föraren' in a.locator('.ar-tools').inner_text())
    shot(a,'17-admin-verkstadstid')
    a.evaluate("openMenu('loner')");a.wait_for_function("document.getElementById('content').textContent.includes('Ingen behörighet')")
    a.evaluate('path=[];render()')
    labels=a.locator('.grid .label').all_text_contents()
    check('Ärenden' in labels);check('Löner' not in labels)
    shot(a,'18-admin-meny')
    # Smallest common phone width: filters wrap, never cause horizontal page overflow.
    small=newpage(br,width=320);small.evaluate('INKORG.show()');small.wait_for_selector('.msg-tabs')
    shot(small,'19-320px')
    check(not errors)
    br.close()
    print(f'{checks} browser assertions passed; 19 phone-sized screenshots. Playwright, actual HTML/JS, synthetic RPCs, no live writes.')
finally:
 server.shutdown()
