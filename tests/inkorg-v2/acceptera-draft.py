"""Isolated Playwright check: unsaved reply text must not flicker empty when accepting a booked time."""
from pathlib import Path
import sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(server.server_port)
errors=[]
with sync_playwright() as pw:
    br=pw.chromium.launch(headless=True,executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--disable-gpu'])
    ctx=br.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='sv-SE',timezone_id='Europe/Stockholm',user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36')
    p=ctx.new_page()
    p.on('pageerror',lambda e: errors.append(str(e)))
    p.goto(BASE+'/tests/inkorg-v2/acceptera-draft.html',wait_until='networkidle')
    p.wait_for_selector('#mx-reply-body')
    p.fill('#mx-reply-body','Osänt utkast (test)')
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
    p.get_by_role('button', name='Acceptera', exact=True).click()
    p.wait_for_selector('.mx-booking.solid')
    p.evaluate('window.__mxReplyStop && window.__mxReplyStop()')
    value=p.input_value('#mx-reply-body')
    saw=p.evaluate('window.__mxReplySawEmpty')
    if errors:
        print('PAGEERRORS', errors); sys.exit(1)
    if value!='Osänt utkast (test)':
        print('VALUE', repr(value)); sys.exit(1)
    if saw:
        print('FLICKER: textarea emptied or disappeared during accept'); sys.exit(1)
    p.fill('#mx-reply-body','Syntetiskt svar')
    p.locator('#mx-reply button[type=submit]').click()
    p.wait_for_function("document.querySelectorAll('.mx-message').length>=2")
    cleared=p.input_value('#mx-reply-body')
    if cleared!='':
        print('REPLY_NOT_CLEARED', repr(cleared)); sys.exit(1)
    if errors:
        print('PAGEERRORS', errors); sys.exit(1)
    print('PASS acceptera draft does not flicker; reply clears')
    br.close()
