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
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/taxidata-cleanup/screenshots/inkorg-v2'))
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

def newpage(browser,role='standard',url='/TaxiData/index.html',width=390):
    context=browser.new_context(viewport={'width':width,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='sv-SE',timezone_id='Europe/Stockholm')
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
    p.wait_for_selector('#app',state='visible');p.click('#profile-btn');p.click('#menu-inkorg');p.wait_for_selector('.mx-filters')
    check(p.locator('.mx-filters button').all_text_contents()==['Alla','Meddelande','Sjuk','Verkstadstimmar'])
    p.wait_for_function("document.querySelectorAll('.ar-row').length>5")
    check('Önskemål' not in p.locator('#content').inner_text());shot(p,'01-inkorg')
    p.get_by_role('button',name='＋ Nytt ärende',exact=True).click();p.wait_for_selector('dialog[open]')
    check(p.locator('dialog button').all_text_contents()==['Meddelande','Sjuk','Verkstadstimmar','Avbryt'])
    p.get_by_role('button',name='Meddelande',exact=True).last.click();p.wait_for_selector('#mx-form')
    check(p.locator('#mx-driver_id').count()==0);check(p.locator('#mx-car_number').get_attribute('pattern')=='[0-9]{1,3}')
    p.fill('#mx-subject','Ett bilfel (test)');p.fill('#mx-body','Syntetiskt meddelande till admin.');p.fill('#mx-car_number','25');shot(p,'02-meddelande-formular')
    p.evaluate('INKORG.refresh()');check(p.input_value('#mx-body')=='Syntetiskt meddelande till admin.')
    p.locator('#mx-form button[type=submit]').click();p.wait_for_selector('#mx-reply')
    check(p.evaluate("V2.calls.filter(x=>x.action==='create').length") == 1)
    p.fill('#mx-reply-body','Syntetiskt svar');p.locator('#mx-reply button').click();p.wait_for_function("document.querySelectorAll('.mx-message').length===2")
    p.get_by_role('button',name='Bokad tid',exact=True).click();p.wait_for_selector('#mx-date')
    p.fill('#mx-kind','service');p.fill('#mx-title','Mitt tidsförslag (test)');p.fill('#mx-date','2027-01-15');p.fill('#mx-time','10:30');p.locator('#mx-form button[type=submit]').click()
    p.wait_for_selector('.mx-booking.pending');check('admins svar' in p.locator('.mx-booking').inner_text())
    check(p.locator('.mx-booking button').count()==0)
    p.evaluate('INKORG.openThread(801)');p.wait_for_selector('#mx-reason-901');shot(p,'03-trad-bokad-tid')
    p.get_by_role('button',name='Avböj',exact=True).click();p.wait_for_function("document.querySelector('.mx-error').textContent.includes('Skriv varför')")
    p.fill('#mx-reason-901','Läkarbesök (syntetiskt test)');p.get_by_role('button',name='Avböj',exact=True).click();p.wait_for_function("document.querySelector('.mx-booking').textContent.includes('Avböjd')")
    check('Läkarbesök' in p.locator('.mx-booking').inner_text())
    # Restore a pending appointment to compare grey and solid markers in the same day.
    p.evaluate("V2.threads[801].bookings[0].status='pending_driver';ANKOMSTER.watchItems=()=>Promise.resolve([]);openItem('mina-bevakningar')")
    p.wait_for_selector('.mb');p.get_by_role('button',name='I morgon',exact=False).click();p.wait_for_selector('.mb-block-booking.pending')
    check(p.locator('.mb-block-booking').count()==2);check(p.locator('.mb-block-booking .mb-block-menu').count()==0)
    check(p.locator('.mb-block-booking.pending').evaluate("e=>getComputedStyle(e).borderTopStyle")=='dashed');shot(p,'04-tidslinje-gra-solid')
    p.get_by_role('button',name='Lista',exact=True).click();check(p.locator('.mb-row-booking .mb-remove').count()==0)
    p.locator('.mb-row-booking.pending .mb-open').first.click();p.wait_for_selector('#mx-reason-901');p.get_by_role('button',name='Acceptera',exact=True).click();p.wait_for_selector('.mx-booking.solid')
    # Historical direct messages have no reply or booking UI.
    p.evaluate('INKORG.readConversation(701)');p.wait_for_function("document.body.textContent.includes('Äldre privat samtal – bara läsning')")
    check(p.locator('#mx-reply').count()==0);check(p.get_by_role('button',name='Bokad tid',exact=True).count()==0)
    # Actual old forms remain only for workshop hours and sickness.
    p.evaluate('INKORG.report("sjuk")');p.wait_for_selector('#sj-start');check(p.locator('#bv-save').count()==0)
    p.evaluate('INKORG.back();INKORG.report("timmar")');p.wait_for_selector('#vk-save');check(p.locator('#bm-save').count()==0);check(not p.locator('#bv-top').is_visible())
    p.evaluate('INKORG.back();INKORG.report("fel")');p.wait_for_selector('#mx-body');check(p.locator('#bv-save').count()==0)
    # Profile owns car numbers, but no duplicate editable private phone field.
    p.evaluate('openProfile()');p.wait_for_selector('[data-a=car-add]');check(p.locator('[data-a=msg]').count()==0)
    p.locator('[data-a=car-add]').click();p.fill('#ps-car-number','123');p.locator('[data-a=car-save]').click();p.wait_for_function("document.querySelectorAll('.ps-card a[href^=\"tel:\"]').length===4")
    check(p.locator('input[type=tel]').count()==0);check(p.locator('.ps-card a[href^="sms:"]').count()==4)
    p.locator('[data-a=edit]').click();p.locator('[data-a=personal]').click()
    p.wait_for_selector('#p-phone-visibility')
    check(p.locator('#p-phone-visibility option').all_text_contents()==['Ägaren','Åkeriet','Taxi Göteborg'])
    check(p.input_value('#p-phone-visibility')=='owner');check(p.locator('input#p-phone').count()==1)
    p.select_option('#p-phone-visibility','bolag');shot(p,'05-kontaktinformation')
    p.locator('#p-save').click();p.wait_for_function("V2.calls.some(x=>x.action==='profile_save'&&x.data.visibility==='bolag')")
    # Other drivers no longer get a send-message action.
    p.evaluate("PROFIL_SIDA.open('900002')");p.wait_for_function("document.body.textContent.includes('Testkollega')");check(p.locator('[data-a=msg]').count()==0)
    # Legacy car categories are archives, with none of the three removed creation forms.
    p.evaluate("openItem('verkstad')");p.wait_for_selector('#bv-root');p.evaluate("VERKSTAD.openTab('fel')");check(p.locator('#bv-new,#bv-save').count()==0)
    p.evaluate("VERKSTAD.openTab('behov')");check(p.locator('#bv-new,#bv-save').count()==0)
    p.evaluate("VERKSTAD.openTab('underhall')");check(p.locator('#bm-new,#bm-sug,#bm-save').count()==0)
    # Stale response must not replace a newer navigation.
    p.evaluate("INKORG.show();window.originalRPC=ARENDE.rpc;ARENDE.rpc=(n,a)=>n==='mailbox_v2'&&a.p_action==='get'?new Promise(r=>window.delayed=r):originalRPC(n,a);INKORG.openThread(801);INKORG.select('sick');delayed(V2.threads[801])")
    p.wait_for_timeout(80);check(p.locator('.mx-filters button[aria-pressed=true]').inner_text()=='Sjuk');p.evaluate('ARENDE.rpc=originalRPC')
    a=newpage(br,'admin','/TaxiData/admin.html#arenden');a.wait_for_selector('.mx-actions')
    check(a.locator('.mx-actions').first.locator('button').all_text_contents()==['Meddelande','Bokad tid'])
    check('Sjukanmälan' not in a.locator('.ar-list').inner_text());check('Önskemål' not in a.locator('.ar-list').inner_text())
    a.get_by_role('button',name='Meddelande',exact=True).click();a.wait_for_selector('#mx-driver_id option[value="900001"]',state='attached')
    a.select_option('#mx-driver_id','900001');a.fill('#mx-subject','Adminmeddelande (test)');a.fill('#mx-body','Syntetisk fråga');a.locator('#mx-form button[type=submit]').click();a.wait_for_selector('#mx-reply')
    a.get_by_role('button',name='Bokad tid',exact=True).click();check(a.locator('#mx-driver_id').count()==0)
    a.evaluate('ARENDEN_ADMIN.back()');a.get_by_role('button',name='Bokad tid',exact=True).click();a.wait_for_selector('#mx-driver_id')
    a.select_option('#mx-driver_id','900001');a.fill('#mx-kind','besiktning');a.fill('#mx-title','Boka besiktning (test)');a.fill('#mx-date','2027-01-20');a.fill('#mx-time','13:00');a.fill('#mx-car_number','25');shot(a,'06-admin-bokad-tid')
    a.locator('#mx-form button[type=submit]').click();a.wait_for_selector('.mx-booking.pending');check('förarens svar' in a.locator('.mx-booking').inner_text())
    own=newpage(br,'agare');own.evaluate('INKORG.show()');own.wait_for_selector('.mx-filters');check(own.locator('.ar-list .ar-row').count()==2) # legacy personal conversations preserved
    check('Admin › Ärenden' in own.locator('#content').inner_text())
    small=newpage(br,width=320);small.evaluate('INKORG.show()');small.wait_for_selector('.mx-filters');shot(small,'07-320px')
    check(not errors)
    check(p.evaluate("async()=>{DEMO.on=()=>true;return (await MAILBOX.rpc('contacts_get')).phone===null&&!(await MAILBOX.rpc('timeline')).length}"))
    check(p.evaluate("async()=>{try{await MAILBOX.rpc('create',{});return false}catch(e){return e.message==='demo_read_only'}}"))
    br.close();print(f'{checks} browser assertions passed; seven mobile screenshots. Synthetic data only, no live writes.')
finally:
 server.shutdown()
