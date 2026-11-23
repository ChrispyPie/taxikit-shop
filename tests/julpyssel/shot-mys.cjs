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
      localStorage.setItem('hb_char_710022', 'robot');
      localStorage.setItem('taxi_hb_light:710022', '1');
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
      const scen = document.getElementById('jul-scen');
      const hdr = document.querySelector('#app > header');
      return mys && mys.classList.contains('jul-on') && g && g.querySelector('svg') && g.classList.contains('jul-on') &&
        rad && rad.classList.contains('jul-on') && scen && scen.classList.contains('jul-on') &&
        hdr && !hdr.contains(g) && !hdr.contains(rad);
    }, { timeout: 12000 });
    const info = await p.evaluate(() => {
      const theme = document.documentElement.getAttribute('data-theme');
      const mys = document.getElementById('jul-mys');
      const g = document.getElementById('jul-girlang');
      const rad = document.getElementById('jul-ljus-rad');
      const scen = document.getElementById('jul-scen');
      const hdr = document.querySelector('#app > header');
      const content = document.getElementById('content');
      const grid = document.querySelector('#content .grid, #app.is-home .grid');
      const hint = document.querySelector('#jul-ljusstake .jul-hint');
      const icons = [...document.querySelectorAll('#app.is-home .grid .icon, #content .grid .icon')].map(n => n.getBoundingClientRect());
      const btns = [...document.querySelectorAll('#app > header .hdr-left button, #app > header .hdr-right button, #app > header .profile-btn')].map(n => n.getBoundingClientRect());
      const overlap = (r, boxes) => boxes.some(i => r.width > 1 && i.width > 1 && r.left < i.right && r.right > i.left && r.top < i.bottom && r.bottom > i.top);
      const hang = [...g.querySelectorAll('.jul-kula, .jul-stjarna')].map(n => n.getBoundingClientRect());
      const scenBox = scen ? scen.getBoundingClientRect() : { left:0, right:0, top:0, bottom:0, width:0, height:0 };
      const hdrBox = hdr.getBoundingClientRect();
      const radBox = rad.getBoundingClientRect();
      const gridBox = grid ? grid.getBoundingClientRect() : { top: 0 };
      const hintBox = hint && getComputedStyle(hint).display !== 'none' ? hint.getBoundingClientRect() : null;
      const stage = document.getElementById('hb-stage');
      const st = stage && !stage.classList.contains('hb-hidden') ? stage.getBoundingClientRect() : null;
      const dots = document.getElementById('td-dots');
      const dotsBox = dots && dots.style.display !== 'none' ? dots.getBoundingClientRect() : null;
      const border = getComputedStyle(hdr).borderBottomWidth;
      return {
        theme,
        mysOn: mys.classList.contains('jul-on') && !mys.hidden,
        pe: getComputedStyle(mys).pointerEvents,
        flakes: mys.querySelectorAll('.jul-flinga').length,
        vignette: !!mys.querySelector('.jul-vignette'),
        girlang: !!g.querySelector('svg'),
        girlangAfterHeader: !!(hdr && g.compareDocumentPosition(hdr) & Node.DOCUMENT_POSITION_PRECEDING) && !hdr.contains(g),
        candles: !!document.querySelector('#jul-ljusstake .jul-flame'),
        candlesInBody: !!(rad && !hdr.contains(rad) && radBox.top >= hdrBox.bottom - 2 && radBox.bottom <= gridBox.top + 2 || (grid && radBox.bottom <= gridBox.top + 8)),
        candlesAboveGrid: !!(grid && radBox.bottom <= gridBox.top + 8),
        slingor: !!(document.getElementById('jul-slingor') && document.getElementById('jul-slingor').classList.contains('jul-on')),
        overlapIcons: hang.some(r => overlap(r, icons)) || overlap(scenBox, icons),
        overlapBtns: hang.some(r => overlap(r, btns)),
        hintOverlapsHeader: !!(hintBox && overlap(hintBox, [{ left: hdrBox.left, right: hdrBox.right, top: hdrBox.top, bottom: hdrBox.bottom, width: hdrBox.width, height: hdrBox.height }])),
        noHeaderLine: parseFloat(border) === 0,
        scenOn: !!(scen && scen.classList.contains('jul-on') && scen.querySelector('.jul-is') && scen.querySelector('.jul-stjarna-topp')),
        berraTomte: !!(document.querySelector('.td-berra svg') && /#c62828|#c0392b/.test(document.querySelector('.td-berra').innerHTML)),
        stageCorner: st ? { bottom: Math.round(window.innerHeight - st.bottom), right: Math.round(window.innerWidth - st.right), overlapsDots: !!(dotsBox && overlap(st, [dotsBox])) } : null,
        headerBorder: border
      };
    });
    console.log(theme, JSON.stringify(info));
    ok(theme + ' theme attr', info.theme === theme);
    ok(theme + ' mys on', info.mysOn);
    ok(theme + ' pointer-events none', info.pe === 'none');
    ok(theme + ' snow flakes', info.flakes >= 8);
    ok(theme + ' vignette', info.vignette);
    ok(theme + ' girlang separator', info.girlang && info.girlangAfterHeader && info.noHeaderLine);
    ok(theme + ' candle in body above grid', info.candles && info.candlesAboveGrid);
    ok(theme + ' lights kept', info.slingor);
    ok(theme + ' ornaments/scen miss icons', !info.overlapIcons);
    ok(theme + ' ornaments miss header buttons', !info.overlapBtns);
    ok(theme + ' preview hint misses header', !info.hintOverlapsHeader);
    ok(theme + ' ice rink and tree', info.scenOn);
    if (info.berraTomte !== undefined) ok(theme + ' berra tomte if present or skipped', true);
    if (info.stageCorner) ok(theme + ' station misses dots', !info.stageCorner.overlapsDots);
    if (info.stageCorner) ok(theme + ' station near bottom', info.stageCorner.bottom <= 16);
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
