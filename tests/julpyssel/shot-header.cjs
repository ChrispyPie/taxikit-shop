'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
function loadPuppeteer() {
  const cands = [
    path.resolve(__dirname, '../meddelanden/node_modules/puppeteer-core'),
    'puppeteer-core'
  ];
  for (const c of cands) { try { return require(c); } catch (e) {} }
  throw new Error('puppeteer-core missing');
}
const puppeteer = loadPuppeteer();
const root = path.resolve(__dirname, '../..');
const out = process.argv[2] || '/workspace/julpyssel-ljus-header-458.png';
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
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });
  const p = await br.newPage();
  await p.setViewport({ width: 458, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await p.evaluateOnNewDocument((core) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('taxi_session', 'synthetic-test-fixture');
    localStorage.setItem('taxi_driver', '710022');
    localStorage.setItem('taxi_logged_in', '1');
    localStorage.setItem('taxi_theme', 'dark');
    localStorage.setItem('taxi_animationer', JSON.stringify({ on: true }));
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
    const orig = window.fetch;
    window.fetch = function (url, opt) {
      return orig.call(this, url, opt).then(function (res) {
        const m = /\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(String(url));
        if (!m || m[1] !== 'get_me') return res;
        return res.json().then(function (d) {
          d = d || {};
          d.id = '710022';
          return new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
      });
    };
  }, core);
  await p.goto(base + '/TaxiData/index.html?juldatum=2026-12-13', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
  await p.evaluate(() => {
    try { localStorage.setItem('taxi_driver', '710022'); } catch (e) {}
    const app = document.getElementById('app');
    if (app) app.classList.add('is-home');
    if (window.JULPYSSEL && JULPYSSEL.start) JULPYSSEL.start();
    if (window.BERRA && BERRA.place) BERRA.place();
  });
  await p.waitForFunction(() => {
    const rad = document.getElementById('jul-ljus-rad');
    const btn = document.getElementById('jul-ljusstake');
    if (!rad || !btn || !rad.classList.contains('jul-on') || btn.hidden) return false;
    const r = rad.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }, { timeout: 12000 });
  await p.waitForFunction(() => {
    const b = document.querySelector('.td-berra');
    return b && b.style.display !== 'none' && b.getBoundingClientRect().width > 8;
  }, { timeout: 12000 });
  const info = await p.evaluate(() => {
    const hdr = document.querySelector('#app > header');
    const rad = document.getElementById('jul-ljus-rad');
    const btn = document.getElementById('jul-ljusstake');
    const berra = document.querySelector('.td-berra');
    const icons = [...document.querySelectorAll('#app.is-home .grid .icon, #content .grid .icon')].map(n => n.getBoundingClientRect());
    const hr = hdr.getBoundingClientRect();
    const rr = rad.getBoundingClientRect();
    const br = berra.getBoundingClientRect();
    const overlapIcon = (r) => icons.some(i => r.left < i.right && r.right > i.left && r.top < i.bottom && r.bottom > i.top);
    const box = (sel) => [...btn.querySelectorAll(sel)].map(n => {
      const r = n.getBoundingClientRect();
      return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), mid: +((r.top + r.bottom) / 2).toFixed(2) };
    });
    return {
      driver: localStorage.getItem('taxi_driver'),
      headerBottom: Math.round(hr.bottom),
      rad: { top: Math.round(rr.top), bottom: Math.round(rr.bottom), height: Math.round(rr.height), parent: rad.parentElement && rad.parentElement.tagName, inHeader: !!(hdr && hdr.contains(rad)) },
      btnHidden: !!btn.hidden,
      flames: !!btn.querySelector('.jul-flame'),
      flameTops: box('.jul-flame'),
      wickTops: box('.jul-wick'),
      berra: { top: Math.round(br.top), bottom: Math.round(br.bottom), width: Math.round(br.width), visible: br.width > 8 },
      overlapRadIcons: overlapIcon(rr),
      overlapBerraIcons: overlapIcon(br),
      viewport: { w: innerWidth, h: innerHeight }
    };
  });
  console.log(JSON.stringify(info, null, 2));
  ok('row not in header', !info.rad.inHeader && info.rad.parent === 'DIV');
  ok('row just under header', info.rad.top >= info.headerBottom - 2 && info.rad.top <= info.headerBottom + 40);
  ok('row not at bottom', info.rad.bottom < 220);
  ok('row compact', info.rad.height > 8 && info.rad.height <= 90);
  ok('no icon overlap', !info.overlapRadIcons);
  ok('berra visible at bottom', info.berra.visible && info.berra.bottom > 400);
  ok('flames for 13 dec', info.flames);
  const ft = info.flameTops || [];
  const wt = info.wickTops || [];
  ok('three flames on 13 dec', ft.length === 3, JSON.stringify(ft));
  ok('four wicks', wt.length === 4, JSON.stringify(wt));
  ok('flames not same height', ft.length === 3 && ft[0].top > ft[1].top + 0.8 && ft[1].top > ft[2].top + 0.8, JSON.stringify(ft));
  ok('wicks follow candle height', wt.length === 4 && wt[0].top > wt[1].top + 0.8 && wt[1].top > wt[2].top + 0.8 && Math.abs(wt[2].top - wt[3].top) < 0.8, JSON.stringify(wt));
  ok('flame sits on its wick', ft.length === 3 && ft.every((f, i) => f.bottom + 2 >= wt[i].top && f.top < wt[i].top), JSON.stringify({ ft, wt }));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await p.screenshot({ path: out, fullPage: false });
  console.log('SHOT', out);
  await br.close();
  server.close();
  if (fails.length) {
    console.error('FAIL', fails);
    process.exit(1);
  }
  console.log('JULPYSSEL_HEADER_SHOT_OK');
})().catch(e => { console.error(e); process.exit(1); });
