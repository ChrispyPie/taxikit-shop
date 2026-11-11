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
const out = process.argv[2] || '/workspace/hjalp-shots';
fs.mkdirSync(out, { recursive: true });
const core = fs.readFileSync(path.join(root, 'tests/meddelanden/fixtures.js'), 'utf8');
const mime = f => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css'
  : f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'text/html';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURI(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, b) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', mime(file));
    res.end(b);
  });
});
const ALLOW = /jsdelivr\.net|openstreetmap\.org|smhi\.se|open-meteo\.com/;
const fails = [];
const ok = (n, c, e) => { if (!c) fails.push(n + (e ? ': ' + e : '')); else console.log('OK', n); };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  async function openHome({ width, height, theme, scale }) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: width === 1024 ? 1.5 : 2.5, isMobile: width < 800, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => {
      const u = q.url();
      if (u.startsWith(base) || ALLOW.test(u)) return q.continue();
      return q.respond({ status: 200, contentType: 'application/json', body: '{}' });
    });
    p._errs = [];
    p.on('pageerror', e => p._errs.push(String(e)));
    await p.evaluateOnNewDocument((core, theme, scale) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
      window.TEST_ROLE = 'standard';
      (0, eval)(core);
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--font-scale', scale);
        const b = document.createElement('div');
        b.textContent = 'TESTVY · påhittade exempel';
        b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:absolute;left:0;right:0;top:0;z-index:200;pointer-events:none';
        document.body.prepend(b);
      });
    }, core, theme, scale);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForSelector('#app .grid .icon, header .td-hjalp-btn', { visible: true, timeout: 20000 });
    await p.evaluate(scale => document.documentElement.style.setProperty('--font-scale', scale), scale);
    await p.waitForSelector('header .td-hjalp-btn', { timeout: 8000 });
    return p;
  }

  async function assertChrome(p, name) {
    const info = await p.evaluate(() => {
      const btn = document.querySelector('header .td-hjalp-btn');
      const home = document.querySelector('header .hdr-left button');
      const fs = document.querySelector('header .app-fs-btn');
      const br = btn && btn.getBoundingClientRect();
      const hr = home && home.getBoundingClientRect();
      const fr = fs && fs.getBoundingClientRect();
      const overlap = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        key: window.HJALP && HJALP.pageKey(),
        open: window.HJALP && HJALP.isOpen(),
        text: document.querySelector('.td-hjalp-body') && document.querySelector('.td-hjalp-body').innerText,
        btn: br && { x: br.x, y: br.y, w: br.width, h: br.height },
        home: hr && { x: hr.x, w: hr.width },
        fs: fr && { x: fr.x, w: fr.width },
        overHome: overlap(br, hr),
        overFs: overlap(br, fr),
        inRight: !!(btn && btn.closest('.hdr-right'))
      };
    });
    ok(name + ' no pageerror', p._errs.length === 0, p._errs.join('|'));
    ok(name + ' button in right', info.inRight);
    ok(name + ' target >= 44', info.btn && Math.min(info.btn.w, info.btn.h) >= 44, JSON.stringify(info.btn));
    ok(name + ' not over home', !info.overHome, JSON.stringify(info));
    ok(name + ' not over fs', !info.overFs, JSON.stringify(info));
    ok(name + ' panel open', info.open);
    ok(name + ' no Stig/hen', info.text && !/\bStig\b|\bhen\b/.test(info.text), info.text);
    return info;
  }

  async function shot(name, width, height, theme, scale, after) {
    const p = await openHome({ width, height, theme, scale });
    if (after) await after(p);
    await p.evaluate(() => HJALP.open());
    await p.waitForSelector('.td-hjalp-panel.open', { timeout: 5000 });
    const info = await assertChrome(p, name);
    await p.screenshot({ path: path.join(out, name + '.png') });
    await p.close();
    return info;
  }

  await shot('hjalp-hem-412-scale14-dark', 412, 780, 'dark', '1.4');
  await shot('hjalp-vader-412-scale14-dark', 412, 780, 'dark', '1.4', async p => {
    await p.evaluate(() => openItem('vader'));
    await p.waitForFunction(() => window.HJALP && HJALP.pageKey() === 'vader', { timeout: 15000 });
  });
  await shot('hjalp-installningar-412-scale14-dark', 412, 780, 'dark', '1.4', async p => {
    await p.evaluate(() => openItem('installningar'));
    await p.waitForFunction(() => window.HJALP && HJALP.pageKey() === 'installningar', { timeout: 15000 });
  });
  await shot('hjalp-hem-1024x600-landskap', 1024, 600, 'dark', '1');

  await br.close();
  server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOTS_OK');
})().catch(e => { console.error(e); process.exit(1); });
