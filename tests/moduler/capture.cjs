
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
function loadPuppeteer() {
  const cands = [
    path.resolve(__dirname, '../meddelanden/node_modules/puppeteer-core'),
    '/workspace/taxikit-shop/tests/meddelanden/node_modules/puppeteer-core',
    'puppeteer-core'
  ];
  for (const c of cands) { try { return require(c); } catch (e) {} }
  throw new Error('puppeteer-core missing');
}
const puppeteer = loadPuppeteer();
const root = path.resolve(__dirname, '../..');
const outPng = '/tmp/mod-prev';
const outWebp = path.join(root, 'TaxiData/moduler-preview');
fs.mkdirSync(outPng, { recursive: true });
fs.mkdirSync(outWebp, { recursive: true });
const core = fs.readFileSync(path.join(root, 'tests/meddelanden/fixtures.js'), 'utf8');
const mime = f => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css'
  : f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURI(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, b) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', mime(file));
    res.end(b);
  });
});

const TOOLS = [
  { id: 'kordata', dash: true },
  { id: 'lonekoll' },
  { id: 'ankomster' },
  { id: 'prognos' },
  { id: 'vader' },
  { id: 'nyheter' },
  { id: 'kalender' },
  { id: 'topplistor' },
  { id: 'forum' },
  { id: 'mina-bevakningar' },
  { id: 'installningar' },
  { id: 'om' },
  { id: 'verkstad' }
];

function toWebp(id) {
  const png = path.join(outPng, id + '.png');
  const webp = path.join(outWebp, id + '.webp');
  execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(png)}).convert('RGB')
w, h = im.size
tw, th = 400, 250
scale = max(tw / w, th / h)
nw, nh = int(w * scale), int(h * scale)
im = im.resize((nw, nh), Image.Resampling.LANCZOS)
left = max(0, (nw - tw) // 2)
top = 0
im = im.crop((left, top, left + tw, min(top + th, nh)))
if im.size[1] < th:
    canvas = Image.new('RGB', (tw, th), (24, 32, 42))
    canvas.paste(im, (0, 0))
    im = canvas
im.save(${JSON.stringify(webp)}, 'WEBP', quality=68, method=6)
print('webp', ${JSON.stringify(id)}, im.size, __import__('os').path.getsize(${JSON.stringify(webp)}))
`]);
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  async function boot(role, url) {
    const p = await br.newPage();
    await p.setViewport({ width: 412, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p.on('pageerror', e => console.warn('pageerror', String(e).slice(0, 180)));
    await p.evaluateOnNewDocument((core, role) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', 'dark');
      localStorage.setItem('taxi_animationer', JSON.stringify({ on: false }));
      window.TEST_ROLE = role;
      (0, eval)(core);
    }, core, role);
    await p.goto(base + url, { waitUntil: 'networkidle0', timeout: 60000 });
    return p;
  }

  async function shotEl(p, sel, id) {
    const handle = await p.$(sel);
    if (!handle) { console.warn('missing', sel, id); return false; }
    const box = await handle.boundingBox();
    if (!box || box.width < 40 || box.height < 40) { console.warn('tiny', id, box); return false; }
    const clip = {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.min(box.width, 412),
      height: Math.min(Math.max(160, box.height), 320)
    };
    await p.screenshot({ path: path.join(outPng, id + '.png'), clip });
    toWebp(id);
    return true;
  }

  const p = await boot('standard', '/TaxiData/index.html');
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });

  for (const t of TOOLS) {
    try {
      if (t.dash) {
        await p.evaluate(id => window.openItem(id), t.id);
        await p.waitForSelector('#dashboard-view:not(.hidden)', { timeout: 15000 });
        await new Promise(r => setTimeout(r, 500));
        const ok = await shotEl(p, '#dashboard-view', t.id) || await shotEl(p, '#dashboard', t.id);
        console.log(t.id, ok ? 'ok' : 'fail');
        await p.evaluate(() => { if (window.goHome) goHome(); });
        await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 10000 });
        continue;
      }
      await p.evaluate(id => window.openItem(id), t.id);
      await p.waitForFunction(id => window.current === id, { timeout: 15000 }, t.id);
      await new Promise(r => setTimeout(r, 700));
      const ok = await shotEl(p, '#content', t.id);
      console.log(t.id, ok ? 'ok' : 'fail');
      await p.evaluate(() => { if (window.goHome) goHome(); });
      await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 10000 });
    } catch (e) {
      console.warn('skip', t.id, String(e).slice(0, 200));
      try { await p.evaluate(() => { if (window.goHome) goHome(); }); } catch (e2) {}
    }
  }
  await p.close();

  try {
    const a = await boot('admin', '/TaxiData/admin.html');
    await new Promise(r => setTimeout(r, 1200));
    const ok = await shotEl(a, '#admin-app', 'admin') || await shotEl(a, 'main', 'admin') || await shotEl(a, 'body', 'admin');
    console.log('admin', ok ? 'ok' : 'fail');
    await a.close();
  } catch (e) { console.warn('admin', String(e).slice(0, 200)); }

  try {
    const s = await boot('superadmin', '/TaxiData/sadmin.html');
    await new Promise(r => setTimeout(r, 1200));
    const ok = await shotEl(s, '#sadmin-app', 'sadmin') || await shotEl(s, 'main', 'sadmin') || await shotEl(s, 'body', 'sadmin');
    console.log('sadmin', ok ? 'ok' : 'fail');
    await s.close();
  } catch (e) { console.warn('sadmin', String(e).slice(0, 200)); }

  await br.close();
  server.close();
  console.log('CAPTURE_DONE');
})().catch(e => { console.error(e); process.exit(1); });
