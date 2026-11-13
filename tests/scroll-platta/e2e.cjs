'use strict';
// Webbläsartest: sidan får inte hoppa till botten i Ankomster (tåglistan) på plattan.
// Christian 2026-11-13: sidan ska aldrig rullas till botten automatiskt, inte heller i Prognos.
// Orsak (2026-11-13): Prognos lyssnar på resize/visualViewport och fullskärmsbyte.
// Lyssnaren levde kvar efter att man lämnat Prognos (samma #content-ruta), så en liten
// storleksändring (systemfält, adressfält, helskärm) rullade Ankomster till botten.
// Kör: node tests/scroll-platta/e2e.cjs
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
const core = fs.readFileSync(path.join(root, 'tests/meddelanden/fixtures.js'), 'utf8');
const mime = f => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURI(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, b) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', mime(file)); res.end(b);
  });
});
const fails = [];
const ok = (n, c, e) => { if (!c) { fails.push(n + (e ? ': ' + e : '')); console.log('FAIL', n, e || ''); } else console.log('OK', n); };
{
  const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
  const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
  ok('cache prognos.js', /prognos\.js\?v=(20261113skroll1|20261113prick1|20261113prick2|20261113barn1)/.test(lv));
  ok('cache lazy-views.js', /lazy-views\.js\?v=(20261113skroll1|20261113prick1|20261113prick2|20261113barn1)/.test(html));
  ok('nyhet', /2026-11-13skroll1/.test(cl) && !/\bStig\b|\bhen\b/.test(cl.split('2026-11-13skroll1')[1].split(']},')[0]));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });

  async function open(width, height) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p._errs = []; p.on('pageerror', e => p._errs.push(String(e)));
    await p.evaluateOnNewDocument((core) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', 'dark');
      localStorage.setItem('hb_char_900001', 'off');
      window.TEST_ROLE = 'standard';
      (0, eval)(core);
      var stub = window.fetch;
      var now = Date.now();
      var trains = [];
      for (var i = 0; i < 60; i++) trains.push({ id: String(2000 + i), dir: 'ANK', sched: new Date(now + (i - 5) * 6 * 60000).toISOString(), other: 'Stockholm C', from: ['Stockholm C'] });
      window.fetch = function (url) {
        var u = String(url);
        if (/\/api\/trains/.test(u)) return Promise.resolve(new Response(JSON.stringify({ station: 'Göteborg C', stationSignature: 'G', updated: new Date().toISOString(), trains: trains }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        if (/rpc\/(watch_list|route_watch_list|tag_villkor_get|watch_route_list|prognos_list_bookings|prognos_zones|prognos_watch_list|prognos_report_history)/.test(u)) return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return stub.apply(this, arguments);
      };
    }, core);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForFunction(() => typeof window.openItem === 'function' && document.querySelector('#app .grid'), { timeout: 20000 });
    return p;
  }
  const y = p => p.evaluate(() => Math.round(window.scrollY));
  const max = p => p.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));

  const sizes = [[1280, 800, 'liggande'], [1340, 800, 'liggande'], [1920, 1200, 'liggande'], [800, 1280, 'stående']];
  for (const [w, h, label] of sizes) {
    const p = await open(w, h);
    const tag = w + 'x' + h + ' ' + label;
    // 0) Inne i Prognos: sidan får aldrig hoppa, varken vid resize, helskärm eller uppdatering.
    await p.evaluate(() => openItem('prognos'));
    await sleep(1200);
    await p.evaluate(() => { document.body.style.paddingBottom = '3000px'; });
    for (const start of [0, 400]) {
      await p.evaluate((y0) => window.scrollTo(0, y0), start);
      await sleep(100);
      await p.setViewport({ width: w, height: h - 24, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
      await sleep(300);
      await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
      await sleep(300);
      await p.evaluate(() => { if (window.PROGNOS && PROGNOS.onFullscreen) PROGNOS.onFullscreen(true); });
      await sleep(300);
      await p.evaluate(() => window.PROGNOS && PROGNOS.refresh && PROGNOS.refresh());
      await sleep(600);
      const yp = await y(p);
      ok(tag + ': Prognos står kvar (start ' + start + ')', Math.abs(yp - start) < 2, 'scrollY=' + yp);
    }
    await p.evaluate(() => { document.body.style.paddingBottom = ''; });
    // 1) Sedan Ankomster (som i bilen).
    await p.evaluate(() => openItem('ankomster'));
    await p.waitForFunction(() => document.querySelectorAll('[data-ank-key]').length > 20, { timeout: 20000 });
    await sleep(400);
    const m = await max(p);
    ok(tag + ': tåglistan är längre än skärmen', m > 200, 'max=' + m);
    await p.evaluate(() => window.scrollTo(0, 0));
    await sleep(100);
    // 2) Systemfält/adressfält/tangentbord ändrar höjden lite – som på plattan.
    await p.setViewport({ width: w, height: h - 24, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
    await sleep(400);
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
    await sleep(400);
    ok(tag + ': resize hoppar inte till botten', (await y(p)) < 50, 'scrollY=' + (await y(p)) + ' max=' + m);
    // 3) Helskärm på/av (helskarm.js meddelar Prognos).
    await p.evaluate(() => { if (window.PROGNOS && PROGNOS.onFullscreen) PROGNOS.onFullscreen(true); });
    await sleep(400);
    ok(tag + ': helskärm hoppar inte till botten', (await y(p)) < 50, 'scrollY=' + (await y(p)));
    // 4) Ankomster ritar om (polling) – läget står kvar.
    await p.evaluate(() => window.scrollTo(0, 300));
    await sleep(50);
    await p.evaluate(() => window.ANKOMSTER && ANKOMSTER.repaint && ANKOMSTER.repaint());
    await sleep(300);
    const y4 = await y(p);
    ok(tag + ': omritning behåller läget', Math.abs(y4 - 300) < 60, 'scrollY=' + y4);
    ok(tag + ': inga sidfel', !p._errs.length, p._errs.join(' | '));
    await p.close();
  }
  await br.close(); server.close();
  if (fails.length) { console.log('SCROLL_PLATTA_FAIL ' + fails.length); process.exit(1); }
  console.log('SCROLL_PLATTA_E2E_OK');
})().catch(e => { console.error(e); process.exit(1); });
