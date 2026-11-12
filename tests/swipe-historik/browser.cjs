'use strict';
// Riktig webbläsare (Chrome via puppeteer-core): index.html med testfixturer, riktiga touch-drag.
// Hem -> Prognos -> Väder -> Inställningar, bakåt/framåt med swipe, notiskanten, 🏠, omladdning.
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
// Chrome egna svep-bakåt (overscroll/transitions) stängs av så att bara appens gester räknas.
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--overscroll-history-navigation=0', '--disable-features=OverscrollHistoryNavigation,TouchpadOverscrollHistoryNavigation,BackForwardTransitions'] });
  const p = await br.newPage();
  await p.setViewport({ width: 412, height: 780, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
  p._errs = [];
  p.on('pageerror', e => p._errs.push(String(e)));
  if (process.env.DBG) { p.on('console', m => console.log('CON', m.text())); p.on('framenavigated', f => console.log('NAVIGATED', f.url())); }
  await p.evaluateOnNewDocument((core) => {
    if (!sessionStorage.getItem('swipe_test_init')) {
      localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('swipe_test_init', '1');
    }
    localStorage.setItem('taxi_session', 'synthetic-test-fixture');
    localStorage.setItem('taxi_driver', '900001');
    localStorage.setItem('taxi_logged_in', '1');
    localStorage.setItem('taxi_animationer', JSON.stringify({ on: false }));
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
  }, core);
  await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
  const cdp = await p.target().createCDPSession();
  async function drag(x0, x1, y = 400) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 8, y }] });
      await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(450);
  }
  const view = () => p.evaluate(() => window.NAV_VIEW());
  const title = () => p.evaluate(() => document.getElementById('title').textContent);
  const notisOpen = () => p.evaluate(() => !!(window.NOTIS && NOTIS.isOpen && NOTIS.isOpen()));

  await p.evaluate(() => openItem('prognos')); await sleep(600);
  await p.evaluate(() => openItem('vader')); await sleep(600);
  await p.evaluate(() => openItem('installningar')); await sleep(400);
  ok('på Inställningar', (await view()) === 'installningar' && (await title()) === 'Inställningar', await view());

  await drag(150, 360);   // höger från vänstra halvan (inte kanten)
  ok('bakåt 1 -> Väder', (await view()) === 'vader', await view());
  await drag(150, 360);
  ok('bakåt 2 -> Prognos', (await view()) === 'prognos', await view());
  await drag(206, 30);    // vänster från mitten
  ok('framåt -> Väder', (await view()) === 'vader', await view());
  await drag(206, 30);
  ok('framåt -> Inställningar', (await view()) === 'installningar', await view());
  await drag(206, 30);
  ok('inget framåt: kvar', (await view()) === 'installningar' && !(await notisOpen()), await view());

  await drag(150, 360); await drag(150, 360);   // Prognos
  await p.evaluate(() => openItem('om')); await sleep(600);
  ok('ny sida rensar framåt', !(await p.evaluate(() => NAV.canForward())));
  await drag(206, 30);
  ok('framåt gör inget efter ny sida', (await view()) === 'om', await view());
  await drag(150, 360);
  ok('bakåt från Om -> Prognos', (await view()) === 'prognos', await view());

  // notis.js laddas när den behövs (lazy-views); som efter första 🔔. Kantdraget är notis.js egen kod.
  await p.evaluate(() => LAZY.ensure('notiser')); await sleep(300);
  await drag(409, 150);   // från högra kanten: notispanelen
  ok('kant-drag öppnar notiser', await notisOpen());
  ok('kant-drag bytte inte sida', (await view()) === 'prognos', await view());
  await p.evaluate(() => NOTIS.close()); await sleep(400);
  ok('notiser stängda', !(await notisOpen()));
  ok('kvar på Prognos efter notiser', (await view()) === 'prognos', await view());

  await drag(150, 360);
  ok('bakåt -> Hem', (await view()) === '', await view());
  await drag(150, 360);
  ok('bakåt på Hem gör inget', (await view()) === '' && (await p.evaluate(() => location.pathname)).endsWith('/TaxiData/index.html'));

  // 🏠 är ett eget steg; telefonens bakåtknapp (history.back) följer samma historik.
  await p.evaluate(() => openItem('vader')); await sleep(500);
  await p.evaluate(() => goHome()); await sleep(300);
  await p.evaluate(() => history.back()); await sleep(500);
  ok('bakåtknapp efter 🏠 -> Väder', (await view()) === 'vader', await view());

  // Omladdning: historiken finns kvar, inget extra steg.
  const before = await p.evaluate(() => [NAV.cur(), NAV.entries().length]);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('#app', { visible: true, timeout: 20000 }); await sleep(800);
  const after = await p.evaluate(() => [NAV.cur(), window.NAV_VIEW()]);
  ok('omladdning: samma steg', after[0] === before[0] && after[1] === 'vader', JSON.stringify([before, after]));
  await drag(150, 360);
  ok('bakåt efter omladdning -> Hem', (await view()) === '', await view());

  // Körpassdata (egen vy utanför #app) och Profil är också steg.
  await p.evaluate(() => openItem('kordata')); await sleep(800);
  ok('Körpassdata visas', (await view()) === 'kordata', await view());
  await p.evaluate(() => openProfile()); await sleep(800);
  ok('Profil visas', (await view()) === 'profil', await view());
  await drag(150, 360);
  ok('bakåt från Profil -> Körpassdata', (await view()) === 'kordata', await view());
  await drag(150, 360);
  ok('bakåt från Körpassdata -> Hem', (await view()) === '' && await p.evaluate(() => document.getElementById('dashboard-view').classList.contains('hidden')), await view());
  await drag(206, 30);
  ok('framåt -> Körpassdata', (await view()) === 'kordata', await view());

  // Prognos får tomma svar ({}) från testservern och kastar om bokningslistan; det har inget med historiken att göra.
  const errs = p._errs.filter(e => !/st\.bookings/.test(e));
  ok('inga sidfel', errs.length === 0, errs.join('|'));
  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SWIPE_BROWSER_OK');
})().catch(e => { console.error(e); process.exit(1); });
