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
const out = process.argv[2] || '/workspace/bubble-shots';
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

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });
  const p = await br.newPage();
  await p.setViewport({ width: 412, height: 780, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
  p._errs = [];
  p.on('pageerror', e => p._errs.push(String(e)));
  await p.evaluateOnNewDocument((core) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('taxi_session', 'synthetic-test-fixture');
    localStorage.setItem('taxi_driver', '900001');
    localStorage.setItem('taxi_logged_in', '1');
    localStorage.setItem('taxi_theme', 'dark');
    localStorage.setItem('taxi_animationer', JSON.stringify({ on: true }));
    localStorage.setItem('hb_char_900001', 'robot');
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--font-scale', '1.4');
    });
  }, core);
  await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
  await p.evaluate(() => {
    document.documentElement.style.setProperty('--font-scale', '1.4');
    const b = document.createElement('div');
    b.textContent = 'TESTVY · påhittade exempel';
    b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:fixed;left:0;right:0;top:0;z-index:200;pointer-events:none';
    document.body.prepend(b);
  });
  await p.waitForSelector('.hb-btn', { timeout: 15000 });
  ok('no panel before poke', await p.evaluate(() => !document.querySelector('.hb-panel.open, .hb-panel')));
  await p.click('.hb-btn');
  await p.waitForFunction(() => document.querySelector('.hb-bubble.show'), { timeout: 5000 });
  const info = await p.evaluate(() => {
    const bub = document.querySelector('.hb-bubble');
    const br = bub && bub.getBoundingClientRect();
    const txt = bub && (bub.querySelector('.hb-bubble-txt') || bub).textContent;
    return {
      panel: !!document.querySelector('.hb-panel.open, .hb-panel'),
      text: (txt || '').trim(),
      onScreen: !!(br && br.left >= -1 && br.top >= -1 && br.right <= innerWidth + 1 && br.bottom <= innerHeight + 1),
      hasTail: !!(bub && bub.querySelector('.hb-bubble-tail')),
      hen: /\bStig\b|\bhen\b/.test(document.body.innerText),
      errs: 0
    };
  });
  ok('no pageerror', p._errs.length === 0, p._errs.join('|'));
  ok('no panel after poke', !info.panel);
  ok('poke bubble', !!info.text && info.text.length > 8, info.text);
  ok('bubble on-screen', info.onScreen, JSON.stringify(info));
  ok('comic tail', info.hasTail);
  ok('no hen/Stig', !info.hen);
  await new Promise(r => setTimeout(r, 200));
  await p.screenshot({ path: path.join(out, 'hb-bubble-412-scale14-dark.png') });
  await p.click('.hb-bubble.show');
  await p.waitForFunction(() => !document.querySelector('.hb-bubble.show'), { timeout: 3000 });
  ok('tap bubble closes', await p.evaluate(() => !document.querySelector('.hb-bubble.show')));
  await p.evaluate(() => window.HJALPBOT.poke());
  await p.waitForFunction(() => document.querySelector('.hb-bubble.show'), { timeout: 5000 });
  ok('tap bot without bubble pokes', await p.evaluate(() => !!(document.querySelector('.hb-bubble.show') && (document.querySelector('.hb-bubble-txt') || {}).textContent)));
  await p.evaluate(() => window.HJALPBOT.poke());
  await p.waitForFunction(() => !document.querySelector('.hb-bubble.show'), { timeout: 3000 });
  ok('tap bot with bubble only closes', await p.evaluate(() => !document.querySelector('.hb-bubble.show')));

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOT_OK', out);
})().catch(e => { console.error(e); process.exit(1); });
