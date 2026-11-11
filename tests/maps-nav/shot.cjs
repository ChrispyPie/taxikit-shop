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
const out = process.argv[2] || '/workspace/maps-shots';
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
    localStorage.setItem('taxi_animationer', JSON.stringify({ on: false }));
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--font-scale', '1.4');
    });
    const start = new Date(); start.setHours(19, 0, 0, 0);
    const end = new Date(); end.setHours(22, 0, 0, 0);
    window.KALENDER_MOCK = function (name) {
      if (name === 'get_event_comments') return Promise.resolve([]);
      if (name === 'get_events') return Promise.resolve({
        city: { slug: 'goteborg', name: 'Göteborg', timezone: 'Europe/Stockholm' },
        cities: [{ slug: 'goteborg', name: 'Göteborg', timezone: 'Europe/Stockholm' }],
        can_approve: false,
        events: [{
          id: 501,
          title: 'Konsert på Scandinavium (påhittat exempel)',
          category: 'konsert',
          venue: 'Scandinavium',
          address: 'Valhallagatan 1, Göteborg',
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          time_unknown: false,
          is_suggestion: false,
          can_edit: false,
          comment_count: 0,
          subs: []
        }]
      });
      return Promise.resolve({});
    };
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

  await p.evaluate(() => openItem('kalender'));
  await p.waitForSelector('[data-id="501"]', { timeout: 15000 });
  await p.click('[data-id="501"]');
  await p.waitForSelector('a.td-maps', { timeout: 8000 });
  const kal = await p.evaluate(() => {
    const a = document.querySelector('a.td-maps');
    return {
      href: a && a.getAttribute('href'),
      label: a && a.getAttribute('aria-label'),
      text: document.body.innerText
    };
  });
  ok('no pageerror kalender', p._errs.length === 0, p._errs.join('|'));
  ok('kalender dir link', !!(kal.href && kal.href.startsWith('https://www.google.com/maps/dir/?api=1&destination=') && /Scandinavium|Valhallagatan/.test(decodeURIComponent(kal.href))), JSON.stringify(kal.href));
  ok('kalender aria', /Scandinavium/.test(kal.label || ''), kal.label);
  ok('no hen/Stig', !/\bStig\b|\bhen\b/.test(kal.text));
  await new Promise(r => setTimeout(r, 150));
  await p.screenshot({ path: path.join(out, 'maps-kalender-412-scale14-dark.png') });

  await p.evaluate(() => openItem('ankomster'));
  await p.waitForSelector('.ank-station-picker, .ank-head', { timeout: 15000 });
  const tag = await p.evaluate(() => {
    const a = document.querySelector('.ank-station-picker a.td-maps, .ank-head a.td-maps');
    return a && a.getAttribute('href');
  });
  ok('ankomster dir link', !!(tag && tag.startsWith('https://www.google.com/maps/dir/?api=1&destination=')), tag);
  const fly = await p.evaluate(() => {
    const tab = document.querySelector('[data-ank-tab="flyg"]');
    if (tab) tab.click();
  });
  await p.waitForFunction(() => {
    const a = document.querySelector('.ank-head a.td-maps');
    return !!(a && /Landvetter/.test(decodeURIComponent(a.getAttribute('href') || '')));
  }, { timeout: 8000 });
  const flyHref = await p.evaluate(() => document.querySelector('.ank-head a.td-maps').getAttribute('href'));
  ok('landvetter dir link', /Landvetter/.test(decodeURIComponent(flyHref)), flyHref);
  ok('no pageerror after ankomster', p._errs.length === 0, p._errs.join('|'));

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOT_OK', out);
})().catch(e => { console.error(e); process.exit(1); });
