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
OUT=Path(os.environ.get('SCREENSHOT_DIR','/workspace/taxidata-cleanup/screenshots/inkorg-v4'))
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
    p=newpage(br)
    p.wait_for_selector('#app',state='visible');p.click('#profile-btn');p.click('#menu-inkorg');p.wait_for_selector('.mx-filters')
    check(p.locator('.mx-filters button').evaluate_all("es=>es.map(e=>e.getAttribute('aria-label'))")==['Alla','Meddelande','Sjuk','Verkstadstimmar'])
    p.wait_for_function("document.querySelectorAll('.ar-row').length>5")
    check('Önskemål' not in p.locator('#content').inner_text());check(p.locator('.mx-category-heading').inner_text()=='Alla');check(p.locator('.mx-filters button').evaluate_all('es=>new Set(es.map(e=>e.getBoundingClientRect().top)).size===1'));p.get_by_role('button',name='Sjuk',exact=True).click();check(p.locator('.mx-category-heading').inner_text()=='Sjuk');p.get_by_role('button',name='Alla',exact=True).click();shot(p,'01-inkorg')
    p.get_by_role('button',name='＋ Nytt ärende',exact=True).click();p.wait_for_selector('dialog[open]')
    check(p.locator('dialog button').all_text_contents()==['Meddelande','Sjuk','Verkstadstimmar','Avbryt'])
    p.get_by_role('button',name='Meddelande',exact=True).last.click();p.wait_for_selector('#mx-form')
    check(p.locator('#mx-driver_id').count()==0);p.wait_for_selector('#mx-car_choice option[value="1"]',state='attached');check(p.input_value('#mx-car_choice')=='');check(p.locator('#mx-car_choice option').all_text_contents()==['Välj','Nej','25','7'])
    p.fill('#mx-subject','Ett bilfel (test)');p.fill('#mx-body','Syntetiskt meddelande till admin.');p.select_option('#mx-car_choice','1');shot(p,'02-meddelande-formular')
    p.evaluate('INKORG.refresh()');check(p.input_value('#mx-body')=='Syntetiskt meddelande till admin.')
    p.locator('#mx-form button[type=submit]').click();p.wait_for_selector('#mx-reply')
    check(p.evaluate("V2.calls.filter(x=>x.action==='create').length") == 1)
    p.fill('#mx-reply-body','Syntetiskt svar');p.locator('#mx-reply button').click();p.wait_for_function("document.querySelectorAll('.mx-message').length===2")
    p.get_by_role('button',name='Bokad tid',exact=True).click();p.wait_for_selector('#mx-date')
    p.fill('#mx-kind','Mitt tidsförslag (test)');check(p.locator('#mx-title').count()==0);p.fill('#mx-body','Ett frivilligt meddelande till admin (test)');check(p.input_value('#mx-car_choice')=='');p.select_option('#mx-car_choice','1');check(p.locator('#mx-date').get_attribute('readonly') is not None);p.get_by_role('button',name='Välj datum',exact=True).click();p.evaluate('INKORG.back()');p.locator('#mx-calendar').wait_for(state='detached');check(p.locator('#mx-calendar').count()==0);check(p.input_value('#mx-kind')=='Mitt tidsförslag (test)');pickdate(p,'2027-01-15','10-kalenderval');settime(p,'10:30');p.locator('#mx-form button[type=submit]').click()
    p.wait_for_selector('.mx-booking.pending');check('admins svar' in p.locator('.mx-booking').inner_text())
    check(p.locator('.mx-booking button').count()==0)
    p.evaluate('INKORG.openThread(801)');p.wait_for_selector('#mx-reply-body');check(p.locator('[id^=mx-reason-]').count()==0);check('Motivering' not in p.locator('.mx-thread').inner_text());check(p.locator('#mx-decline-error').inner_text()=='');shot(p,'03-trad-bokad-tid')
    before=p.evaluate("V2.calls.filter(x=>x.action==='decide').length");p.get_by_role('button',name='Avböj',exact=True).click();p.wait_for_function("document.querySelector('#mx-decline-error').textContent==='Vänligen specificera orsak'");check(p.evaluate("V2.calls.filter(x=>x.action==='decide').length")==before);shot(p,'08-avboj-orsak')
    p.fill('#mx-reply-body','Tiden passar inte (syntetiskt test)');p.get_by_role('button',name='Avböj',exact=True).click();p.wait_for_function("document.querySelector('.mx-booking').textContent.includes('Avböjd')")
    check('Tiden passar inte' in p.locator('.mx-booking').inner_text());check('Tiden passar inte' in p.locator('.mx-history').inner_text());check(p.input_value('#mx-reply-body')=='')
    # Restore a pending appointment to compare grey and solid markers in the same day.
    p.evaluate("V2.threads[801].bookings[0].status='pending_driver';ANKOMSTER.watchItems=()=>Promise.resolve([]);openItem('mina-bevakningar')")
    p.wait_for_selector('.mb');p.get_by_role('button',name='I morgon',exact=False).click();p.wait_for_selector('.mb-block-booking.pending')
    check(p.locator('.mb-block-booking').count()==2);check(p.locator('.mb-block-booking .mb-block-menu').count()==0)
    check(p.locator('.mb-block-booking.pending').evaluate("e=>getComputedStyle(e).borderTopStyle")=='dashed');shot(p,'04-tidslinje-gra-solid')
    p.get_by_role('button',name='Lista',exact=True).click();check(p.locator('.mb-row-booking .mb-remove').count()==0)
    p.locator('.mb-row-booking.pending .mb-open').first.click();p.wait_for_selector('#mx-reply-body');p.fill('#mx-reply-body','Osänt utkast (test)')
    p.evaluate('''() => {
      window.__mxReplySawEmpty = false;
      const want = 'Osänt utkast (test)';
      const note = () => {
        const el = document.querySelector('#mx-reply-body');
        if (!el || el.value !== want) window.__mxReplySawEmpty = true;
      };
      note();
      const mo = new MutationObserver(note);
      mo.observe(document.body, {childList:true, subtree:true, characterData:true});
      const iv = setInterval(note, 16);
      window.__mxReplyStop = () => { mo.disconnect(); clearInterval(iv); };
    }''')
    p.get_by_role('button',name='Acceptera',exact=True).click();p.wait_for_selector('.mx-booking.solid')
    p.evaluate('window.__mxReplyStop && window.__mxReplyStop()')
    check(p.input_value('#mx-reply-body')=='Osänt utkast (test)');check(p.evaluate('!window.__mxReplySawEmpty'))
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
    check(p.locator('#p-phone-visibility option').all_text_contents()==['Ägare','Åkeriet','Alla (inom Taxi Göteborg)'])
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
    p.wait_for_timeout(80);check(p.locator('.mx-filters button[aria-pressed=true]').get_attribute('aria-label')=='Sjuk');p.evaluate('ARENDE.rpc=originalRPC')
    a=newpage(br,'admin','/TaxiData/admin.html#arenden');a.wait_for_selector('.mx-actions')
    check(a.locator('.mx-actions').first.locator('button').all_text_contents()==['Meddelande','Bokad tid'])
    check('Sjukanmälan' not in a.locator('.ar-list').inner_text());check('Önskemål' not in a.locator('.ar-list').inner_text())
    a.get_by_role('button',name='Meddelande',exact=True).click();a.wait_for_selector('#mx-driver_id option[value="900001"]',state='attached')
    a.select_option('#mx-driver_id','900001');a.fill('#mx-subject','Adminmeddelande (test)');a.fill('#mx-body','Syntetisk fråga');a.select_option('#mx-car_choice','none');a.locator('#mx-form button[type=submit]').click();a.wait_for_selector('#mx-reply')
    a.get_by_role('button',name='Bokad tid',exact=True).click();check(a.locator('#mx-driver_id').count()==0)
    a.evaluate('ARENDEN_ADMIN.back()');a.get_by_role('button',name='Bokad tid',exact=True).click();a.wait_for_selector('#mx-driver_id')
    a.select_option('#mx-driver_id','900001');a.fill('#mx-kind','Besiktning (test)');check(a.locator('#mx-title').count()==0);a.fill('#mx-body','Lämna bilen i god tid (syntetiskt exempel).');pickdate(a,'2027-01-20');settime(a,'13:00');check(a.locator('#mx-date').get_attribute('readonly') is not None);check(a.input_value('#mx-car_choice')=='');before=a.evaluate("V2.calls.filter(x=>x.action==='book').length");a.locator('#mx-form button[type=submit]').click();check('Välj en bil' in a.locator('#mx-car-error').inner_text());check(a.evaluate("V2.calls.filter(x=>x.action==='book').length")==before);shot(a,'09-bilval-kravs');a.select_option('#mx-car_choice','none');check(a.locator('#mx-car-error').inner_text()=='');shot(a,'06-admin-bokad-tid')
    a.locator('#mx-form button[type=submit]').click();a.wait_for_selector('.mx-booking.pending');check('förarens svar' in a.locator('.mx-booking').inner_text());check(a.locator('.mx-thread h2').inner_text()=='Besiktning (test)');check('Lämna bilen' in a.locator('.mx-history').inner_text());check('2027-01-20 13:00' in a.locator('.mx-booking').inner_text());check('Bil: Nej' in a.locator('.mx-booking').inner_text())
    own=newpage(br,'agare');own.evaluate('INKORG.show()');own.wait_for_selector('.mx-filters');check(own.locator('.ar-list .ar-row').count()==2) # legacy personal conversations preserved
    check('Admin › Ärenden' in own.locator('#content').inner_text())
    small=newpage(br,width=320);small.evaluate('INKORG.show()');small.wait_for_selector('.mx-filters');check(small.locator('.mx-filters button').evaluate_all('es=>new Set(es.map(e=>e.getBoundingClientRect().top)).size===1'));shot(small,'07-320px')
    for device in ['iPhone 13','Pixel 7']:
        mobile=newpage(br,'admin','/TaxiData/admin.html#arenden',device=device);mobile.wait_for_selector('.mx-actions');mobile.get_by_role('button',name='Bokad tid',exact=True).click();mobile.wait_for_selector('#mx-driver_id option[value="900001"]',state='attached');mobile.select_option('#mx-driver_id','900001');mobile.fill('#mx-kind','Mobilbokning (test)');pickdate(mobile,'2027-02-15');settime(mobile,'09:30');check(mobile.input_value('#mx-date')=='2027-02-15');check(mobile.locator('#mx-date').get_attribute('type')=='text');mobile.select_option('#mx-car_choice','none');mobile.locator('#mx-form button[type=submit]').click();mobile.wait_for_selector('.mx-booking.pending');check('2027-02-15 09:30' in mobile.locator('.mx-booking').inner_text());check(mobile.locator('.mx-thread h2').inner_text()=='Mobilbokning (test)');mobile.context.close()
    check(not errors)
    check(p.evaluate("async()=>{DEMO.on=()=>true;return (await MAILBOX.rpc('contacts_get')).phone===null&&!(await MAILBOX.rpc('timeline')).length}"))
    check(p.evaluate("async()=>{try{await MAILBOX.rpc('create',{});return false}catch(e){return e.message==='demo_read_only'}}"))
    br.close();print(f'{checks} browser assertions passed; ten mobile screenshots. Synthetic data only, no live writes.')
finally:
 server.shutdown()
