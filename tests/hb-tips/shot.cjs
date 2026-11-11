'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
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
const out = process.argv[2] || '/workspace/tips-shots';
fs.mkdirSync(out, { recursive: true });
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
const fails = [];
const ok = (n, c, e) => { if (!c) fails.push(n + (e ? ': ' + e : '')); else console.log('OK', n); };

async function openHome(br, base, { width, height, theme, scale, anim }) {
  const p = await br.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: width === 1024 ? 1.5 : 2.5, isMobile: width < 800, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
  p._errs = [];
  p.on('pageerror', e => p._errs.push(String(e)));
  await p.evaluateOnNewDocument((core, theme, scale, anim) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('taxi_session', 'synthetic-test-fixture');
    localStorage.setItem('taxi_driver', '900001');
    localStorage.setItem('taxi_logged_in', '1');
    localStorage.setItem('taxi_theme', theme);
    localStorage.setItem('taxi_animationer', JSON.stringify({ on: anim !== '0' }));
    localStorage.setItem('hb_char_900001', 'robot');
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--font-scale', scale);
    });
  }, core, theme, scale, anim);
  await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
  await p.evaluate(s => {
    document.documentElement.style.setProperty('--font-scale', s);
    const b = document.createElement('div');
    b.textContent = 'TESTVY · påhittade exempel';
    b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:absolute;left:0;right:0;top:0;z-index:200;pointer-events:none';
    document.body.prepend(b);
  }, scale);
  await p.waitForFunction(() => window.HJALPBOT && window.HJALPBOT_TIPS, { timeout: 8000 });
  return p;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  {
    const p = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4', anim: '0' });
    ok('no pageerror', p._errs.length === 0, p._errs.join('|'));
    const shown = await p.evaluate(() => {
      const hit = window.HJALPBOT.previewTip('verkstadstimmar-flyttad');
      const b = document.querySelector('.hb-bubble');
      return { ok: !!(hit && b && b.classList.contains('show') && b.classList.contains('hb-tap') && /Meddelanden/.test(b.textContent)), text: b ? b.textContent : '' };
    });
    ok('static tip bubble', shown.ok, JSON.stringify(shown));
    await new Promise(r => setTimeout(r, 200));
    await p.screenshot({ path: path.join(out, 'tips-verkstad-412-scale14-dark.png') });

    await p.click('.hb-bubble.hb-tap');
    await p.waitForSelector('#profile-menu.show', { timeout: 4000 });
    const hl = await p.evaluate(() => {
      const item = document.getElementById('menu-inkorg');
      return !!(item && item.classList.contains('hb-tip-hl') && /Meddelanden/.test(item.textContent));
    });
    ok('highlights Meddelanden', hl);
    await new Promise(r => setTimeout(r, 200));
    await p.screenshot({ path: path.join(out, 'tips-verkstad-meny-412-scale14-dark.png') });
    await p.close();
  }

  {
    const p = await openHome(br, base, { width: 1024, height: 600, theme: 'dark', scale: '1', anim: '0' });
    await p.evaluate(() => window.HJALPBOT.previewTip('verkstadstimmar-flyttad'));
    await new Promise(r => setTimeout(r, 200));
    await p.screenshot({ path: path.join(out, 'tips-verkstad-1024x600-dark.png') });
    await p.click('.hb-bubble.hb-tap');
    await p.waitForSelector('#profile-menu.show', { timeout: 4000 });
    await p.screenshot({ path: path.join(out, 'tips-verkstad-meny-1024x600-dark.png') });
    await p.close();
  }

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOT_OK', out);
})().catch(e => { console.error(e); process.exit(1); });
