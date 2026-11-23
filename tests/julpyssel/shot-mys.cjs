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

  async function shot(theme, outfile) {
    const p = await br.newPage();
    await p.setViewport({ width: 458, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p.on('pageerror', e => console.log('PAGEERROR', theme, String(e)));
    await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await p.evaluateOnNewDocument((core, theme) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '710022');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
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
    }, core, theme);
    await p.goto(base + '/TaxiData/index.html?juldatum=2026-12-13', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
    await p.evaluate(() => {
      try { localStorage.setItem('taxi_driver', '710022'); } catch (e) {}
      const app = document.getElementById('app');
      if (app) app.classList.add('is-home');
      if (window.JULPYSSEL && JULPYSSEL.start) JULPYSSEL.start();
    });
    await p.waitForFunction(() => {
      const mys = document.getElementById('jul-mys');
      const g = document.getElementById('jul-girlang');
      const rad = document.getElementById('jul-ljus-rad');
      return mys && mys.classList.contains('jul-on') && g && g.querySelector('svg') && rad && rad.classList.contains('jul-on');
    }, { timeout: 12000 });
    const info = await p.evaluate(() => {
      const theme = document.documentElement.getAttribute('data-theme');
      const mys = document.getElementById('jul-mys');
      const g = document.getElementById('jul-girlang');
      const icons = [...document.querySelectorAll('#app.is-home .grid .icon, #content .grid .icon')].map(n => n.getBoundingClientRect());
      const btns = [...document.querySelectorAll('#app > header .hdr-left button, #app > header .hdr-right button, #app > header .profile-btn')].map(n => n.getBoundingClientRect());
      const gr = g.getBoundingClientRect();
      const overlap = (r, boxes) => boxes.some(i => r.left < i.right && r.right > i.left && r.top < i.bottom && r.bottom > i.top);
      // girlang-raden ligger i headern; kontrollera att kulor inte täcker ikonrutnätet
      const hang = [...g.querySelectorAll('.jul-kula, .jul-stjarna')].map(n => n.getBoundingClientRect());
      return {
        theme,
        mysOn: mys.classList.contains('jul-on') && !mys.hidden,
        pe: getComputedStyle(mys).pointerEvents,
        flakes: mys.querySelectorAll('.jul-flinga').length,
        vignette: !!mys.querySelector('.jul-vignette'),
        girlang: !!g.querySelector('svg'),
        candles: !!document.querySelector('#jul-ljusstake .jul-flame'),
        slingor: !!(document.getElementById('jul-slingor') && document.getElementById('jul-slingor').classList.contains('jul-on')),
        overlapIcons: hang.some(r => overlap(r, icons)),
        overlapBtns: hang.some(r => overlap(r, btns)),
        girlangInHeader: !!(document.querySelector('#app > header') && document.querySelector('#app > header').contains(g))
      };
    });
    console.log(theme, JSON.stringify(info));
    ok(theme + ' theme attr', info.theme === theme);
    ok(theme + ' mys on', info.mysOn);
    ok(theme + ' pointer-events none', info.pe === 'none');
    ok(theme + ' snow flakes', info.flakes >= 8);
    ok(theme + ' vignette', info.vignette);
    ok(theme + ' girlang', info.girlang && info.girlangInHeader);
    ok(theme + ' candle kept', info.candles);
    ok(theme + ' lights kept', info.slingor);
    ok(theme + ' ornaments miss icons', !info.overlapIcons);
    ok(theme + ' ornaments miss header buttons', !info.overlapBtns);
    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    await p.screenshot({ path: outfile, fullPage: false });
    console.log('SHOT', outfile);
    await p.close();
  }

  await shot('light', path.join(__dirname, 'shot-mys-light.png'));
  await shot('dark', path.join(__dirname, 'shot-mys-dark.png'));
  await br.close();
  server.close();
  if (fails.length) {
    console.error('FAIL', fails);
    process.exit(1);
  }
  console.log('JULPYSSEL_MYS_SHOT_OK');
})().catch(e => { console.error(e); process.exit(1); });
