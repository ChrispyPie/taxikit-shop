"""Headless phone-sized check against the live trains API and local Ankomster UI."""
from pathlib import Path
import json, sys, threading, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=Path('/tmp/ankomster-verify')
OUT.mkdir(parents=True, exist_ok=True)
board=json.loads(urllib.request.urlopen('https://taxikit-shop.vercel.app/api/trains', timeout=20).read().decode())
trains=board.get('trains') or []
# Prefer an arriving train not yet at G, with a last-seen position.
cands=[]
for t in trains:
    if t.get('dir')!='ANK' or t.get('canceled') or t.get('act'):
        continue
    if t.get('lastSeen') and t.get('lastSeenTs') and t.get('id') and t.get('sched'):
        cands.append(t)
pick=cands[0] if cands else None
route=None
if pick:
    from urllib.parse import urlencode
    q=urlencode({'station':'G','route':pick['id'],'sched':pick['sched']})
    try:
        route=json.loads(urllib.request.urlopen('https://taxikit-shop.vercel.app/api/trains?'+q, timeout=20).read().decode())
    except Exception as e:
        route={'error':str(e),'stops':[],'lastSeen':None}
# Write a small debug summary without customer data (train ids are public timetable ids)
summary={
  'boardStation':board.get('station'),
  'updated':board.get('updated'),
  'candidateId': (pick or {}).get('id'),
  'lastSeen': (pick or {}).get('lastSeen'),
  'lastSeenSig': (pick or {}).get('lastSeenSig'),
  'lastSeenTs': (pick or {}).get('lastSeenTs'),
  'routeStops': [s.get('sig')+'='+(s.get('name') or '') for s in (route or {}).get('stops') or []],
  'routeLastSeen': (route or {}).get('lastSeen'),
}
(OUT/'live-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print('LIVE', json.dumps(summary, ensure_ascii=False))

html='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ankomster live check</title>
<link rel="stylesheet" href="/TaxiData/style.css">
<style>body{margin:0;font:16px system-ui}#app{min-height:100vh;padding:8px}</style>
<div id="app"></div>
<script src="/TaxiData/train-stations.js"></script>
<script src="/TaxiData/arrival-data.js"></script>
<script src="/TaxiData/ankomster.js"></script>
<script>
window.VIEW_STATE={get:function(){return {};},save:function(){}};
ANKOMSTER.render(document.getElementById('app'));
</script>'''
(Path('/tmp/ankomster-verify/page.html')).write_text(html, encoding='utf-8')
# serve repo root plus this page
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        if self.path.startswith('/live-check'):
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers()
            self.wfile.write(html.encode());return
        return super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(server.server_port)
errors=[]
with sync_playwright() as pw:
    br=pw.chromium.launch(headless=True,executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--disable-gpu'])
    ctx=br.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='sv-SE',timezone_id='Europe/Stockholm',user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36')
    # Allow local files and the live trains API only.
    ctx.route('**/*', lambda route: route.continue_() if route.request.url.startswith(BASE) or 'taxikit-shop.vercel.app/api/trains' in route.request.url or route.request.url.startswith('https://taxikit-shop.vercel.app/') else route.fulfill(status=200,content_type='application/json',body='{}'))
    p=ctx.new_page()
    p.on('pageerror',lambda e: errors.append(str(e)))
    p.goto(BASE+'/live-check',wait_until='networkidle')
    p.wait_for_selector('[data-ank-picker]',timeout=20000)
    p.wait_for_timeout(1500)
    p.screenshot(path=str(OUT/'01-ankomster-board.png'), full_page=False)
    # Selector
    p.click('[data-ank-picker]')
    p.wait_for_selector('#ank-station-search')
    p.wait_for_selector('hr.ank-station-divider')
    p.screenshot(path=str(OUT/'02-station-picker.png'), full_page=False)
    p.fill('#ank-station-search','ndv')
    p.wait_for_timeout(200)
    p.screenshot(path=str(OUT/'03-picker-search.png'), full_page=False)
    p.fill('#ank-station-search','')
    p.get_by_role('button', name='Stäng', exact=True).click()
    # Expand a live train if possible
    rows=p.locator('.ank-tap')
    n=rows.count()
    expanded=False
    # Prefer a row whose text includes Senast sedd
    idx=None
    for i in range(min(n,25)):
        txt=rows.nth(i).inner_text()
        if 'Senast sedd' in txt:
            idx=i;break
    if idx is None and n:
        idx=0
    if idx is not None:
        rows.nth(idx).click()
        p.wait_for_timeout(2500)
        p.screenshot(path=str(OUT/'04-expanded-train.png'), full_page=False)
        expanded=True
        body=p.inner_text('body')
        (OUT/'expanded-text.txt').write_text(body, encoding='utf-8')
        assert 'Här nu' not in body and 'här nu' not in body, 'Här nu should be gone'
    if errors:
        print('PAGEERRORS', errors); sys.exit(1)
    print('SCREENSHOTS', list(OUT.glob('*.png')))
    print('EXPANDED', expanded, 'ROWS', n)
    br.close()
