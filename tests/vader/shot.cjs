'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
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
const out = process.argv[2] || '/workspace/vader-shots';
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
const ALLOW = /jsdelivr\.net|openstreetmap\.org|smhi\.se|open-meteo\.com|unpkg\.com/;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none']
  });
  const fails = [];
  const ok = (n, c, e) => { if (!c) fails.push(n + (e ? ': ' + e : '')); else console.log('OK', n); };

  async function openHome({ width, height, theme, scale, banner }) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: width === 1024 ? 1.5 : 2.5, isMobile: width < 800, hasTouch: true });
    const seen = [];
    await p.setRequestInterception(true);
    p.on('request', q => {
      const u = q.url();
      seen.push(u);
      if (u.startsWith(base)) return q.continue();
      if (ALLOW.test(u)) return q.continue();
      return q.respond({ status: 200, contentType: 'application/json', body: '{}' });
    });
    p.on('pageerror', e => { p._errs = (p._errs || []).concat(String(e)); });
    p._seen = seen; p._errs = [];
    await p.evaluateOnNewDocument((core, theme, scale) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
      window.TEST_ROLE = 'standard';
      var realFetch = window.fetch.bind(window);
      (0, eval)(core);
      var stubFetch = window.fetch;
      window.fetch = function (url, opt) {
        if (/smhi\.se|open-meteo\.com/.test(String(url))) return realFetch(url, opt);
        return stubFetch.apply(this, arguments);
      };
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--font-scale', scale);
        const b = document.createElement('div');
        b.textContent = 'TESTVY · påhittade exempel';
        b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:absolute;left:0;right:0;top:0;z-index:200;pointer-events:none';
        document.body.prepend(b);
      });
    }, core, theme, scale);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
    await p.evaluate(scale => document.documentElement.style.setProperty('--font-scale', scale), scale);
    return p;
  }

  async function openVader(p) {
    p.on('requestfailed', req => { p._fails = (p._fails || []).concat(req.url() + ' ' + (req.failure() && req.failure().errorText)); });
    await p.evaluate(() => { if (typeof openItem === 'function') openItem('vader'); });
    await p.waitForSelector('.vd-map', { timeout: 20000 });
    await p.waitForFunction(() => !!(window.L && window.VADER && document.querySelector('.leaflet-container')), { timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    await p.evaluate(() => { try { if (window.VADER && document.querySelector('.leaflet-container')) { var m = document.querySelector('.vd-map'); if (m && m._leaflet_id && window.L) { /* invalidate via map if exposed */ } } } catch (e) {} });
  }
  async function setLayers(p, on) {
    await p.evaluate((on) => {
      const keys = ['nederbord', 'blixt', 'vind', 'temperatur'];
      const want = {};
      keys.forEach(k => { want[k] = on.indexOf(k) >= 0; });
      on.forEach(k => { if (!VADER.layers()[k]) document.querySelector('[data-vd="'+k+'"]').click(); });
      keys.forEach(k => { if (!want[k] && VADER.layers()[k]) document.querySelector('[data-vd="'+k+'"]').click(); });
    }, on);
    await new Promise(r => setTimeout(r, 1200));
  }

  // zero weight on home
  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.25' });
    const seen = p._seen.join('\n');
    ok('no leaflet on home', !/leaflet/i.test(seen));
    ok('no vader.js on home', !/(?:^|[/])vader\.js/.test(seen), seen.split('\n').filter(u=>/vader/i.test(u)).join('|'));
    ok('no vader-radar on home', !/opendata-download-radar|opendata-download-lightning/.test(seen));
    ok('no open-meteo on home', !/open-meteo/.test(seen));
    ok('vader tile present', await p.evaluate(() => [...document.querySelectorAll('.icon .label')].some(e => e.textContent === 'Väder')));
    ok('no pageerror home', p._errs.length === 0, p._errs.join('|'));
    await p.screenshot({ path: path.join(out, 'hem-412-scale125-dark.png') });
    await p.close();
  }

  async function layerShot(name, width, height, theme, scale, fn) {
    const p = await openHome({ width, height, theme, scale });
    await openVader(p);
    ok('leaflet only after vader ' + name, p._seen.some(u => /leaflet/i.test(u)));
    if (fn) await fn(p);
    await new Promise(r => setTimeout(r, 800));
    const chipH = await p.evaluate(() => {
      const c = document.querySelector('.vd-chip');
      return c ? c.getBoundingClientRect().height : 0;
    });
    ok('chip >= 40 ' + name, chipH >= 40, chipH);
    ok('credits ' + name, await p.evaluate(() => /SMHI/.test(document.querySelector('.vd-cred')?.textContent || '') && /Open-Meteo/.test(document.querySelector('.vd-cred')?.textContent || '') && /OpenStreetMap/.test(document.querySelector('.vd-cred')?.textContent || '')));
    ok('no Stig on page ' + name, await p.evaluate(() => !/Stig|\bhen\b/.test(document.body.innerText)));
    await p.screenshot({ path: path.join(out, name + '.png') });
    await p.close();
  }

  await layerShot('nederbord-412-scale14-dark', 412, 780, 'dark', '1.4', async (p) => {
    await p.waitForFunction(() => /Nederbörd kl|Kunde inte/.test(document.querySelector('.vd-time')?.textContent || ''), { timeout: 25000 }).catch(() => {});
  });
  await layerShot('nederbord-1024x600-landskap', 1024, 600, 'dark', '1', async (p) => {
    await p.waitForFunction(() => document.querySelector('.leaflet-image-overlay, .vd-time') && (document.querySelector('.vd-time')?.textContent || '').length > 0, { timeout: 25000 }).catch(() => {});
  });
  await layerShot('nederbord-412-scale125-dark', 412, 780, 'dark', '1.25', async (p) => {
    await p.waitForFunction(() => /Nederbörd kl|Kunde inte/.test(document.querySelector('.vd-time')?.textContent || ''), { timeout: 25000 }).catch(() => {});
    const meta = await p.evaluate(() => document.querySelector('.vd-time')?.textContent || '');
    console.log('radar meta', meta);
  });
  await layerShot('blixt-412-scale125-dark', 412, 780, 'dark', '1.25', async (p) => {
    await setLayers(p, ['blixt']);
    await p.evaluate(() => {
      if (window.VADER && VADER.previewStrikes) {
        VADER.previewStrikes([
          { lat: 57.71, lon: 11.97, t: Date.now() },
          { lat: 57.85, lon: 12.20, t: Date.now() },
          { lat: 57.55, lon: 11.80, t: Date.now() }
        ]);
      }
    });
  });
  await layerShot('vind-412-scale125-dark', 412, 780, 'dark', '1.25', async (p) => {
    await setLayers(p, ['vind']);
    await p.waitForFunction(() => document.querySelectorAll('.vd-arrow').length >= 4, { timeout: 25000 }).catch(() => {});
    const n = await p.evaluate(() => ({ arrows: document.querySelectorAll('.vd-arrow').length, fails: (window.__vd || null), meta: document.querySelector('.vd-time')?.textContent, seen: VADER.layers() }));
    console.log('vind state', n, 'netfails', p._fails);
  });
  await layerShot('temperatur-412-scale125-light', 412, 780, 'light', '1.25', async (p) => {
    await setLayers(p, ['temperatur']);
    await p.waitForFunction(() => document.querySelectorAll('.vd-tlab').length >= 4, { timeout: 25000 }).catch(() => {});
    const n = await p.evaluate(() => ({ labs: document.querySelectorAll('.vd-tlab').length, meta: document.querySelector('.vd-time')?.textContent }));
    console.log('temp state', n, 'netfails', p._fails);
  });

  await br.close();
  server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOTS_OK');
})().catch(e => { console.error(e); process.exit(1); });
