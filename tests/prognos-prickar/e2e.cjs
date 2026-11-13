'use strict';
// Webbläsartest + förhandsbilder: aktivitetsprickar i Prognos (2026-11-13prick1, t1571u).
// Prick på varje zon med nya bokningar, liten prick på varje ny bokning i öppnad zon,
// pricken försvinner när bokningen inte längre finns i listan.
// Kör: node tests/prognos-prickar/e2e.cjs [utmapp]
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
function loadPuppeteer() {
  const cands = [path.resolve(__dirname, '../meddelanden/node_modules/puppeteer-core'), '/workspace/taxikit-shop/tests/meddelanden/node_modules/puppeteer-core', 'puppeteer-core'];
  for (const c of cands) { try { return require(c); } catch (e) {} }
  throw new Error('puppeteer-core missing');
}
const puppeteer = loadPuppeteer();
const root = path.resolve(__dirname, '../..');
const out = process.argv[2] || '/workspace/anim-preview/prognos-prickar';
fs.mkdirSync(out, { recursive: true });
const core = fs.readFileSync(path.join(root, 'tests/meddelanden/fixtures.js'), 'utf8');
const mime = f => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURI(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', mime(file)); res.end(b); });
});
const fails = [];
const ok = (n, c, e) => { if (!c) { fails.push(n + (e ? ': ' + e : '')); console.log('FAIL', n, e || ''); } else console.log('OK', n); };
{
  const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
  const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
  ok('cache prognos.js', /prognos\.js\?v=20261113prick1/.test(lv));
  ok('cache lazy-views.js', /lazy-views\.js\?v=20261113prick1/.test(fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8')));
  const e = cl.split("id: '2026-11-13prick1'")[1].split(']},')[0];
  ok('nyhet utan tid, utan Stig/hen', !/tid: '/.test(e) && !/\bStig\b|\bhen\b/.test(e));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Syntetiska bokningar: två nya (Essity 161, Landvetter 293), resten gamla.
function bookings(now) {
  const iso = ms => new Date(ms).toISOString();
  const mk = (id, zone, cat, inMin, obsAgoMin) => ({ id, zone_id: zone, zone_name: zone, category: cat, estimated_at: iso(now + inMin * 60000), observed_at: iso(now - obsAgoMin * 60000), block_index: 0, current_block: 0, confidence: 'saker', status: 'open', addons: [] });
  return [mk(1, '161', 'app', 25, 10), mk(2, '161', 'elbil', 55, 120), mk(3, '293', 'storbil', 40, 5), mk(4, '293', 'app', 70, 200), mk(5, '163', 'app', 35, 300), mk(6, '163', 'ovrigt', 85, 240)];
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  async function open(width, height, mobile) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: mobile ? 2 : 1, isMobile: !!mobile, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p._errs = []; p.on('pageerror', e => p._errs.push(String(e)));
    const now = Date.now();
    await p.evaluateOnNewDocument((core, list, now) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', 'dark');
      localStorage.setItem('hb_char_900001', 'off');
      localStorage.setItem('prognos_visit_900001', String(now - 30 * 60000));   // förra besöket för 30 min sedan
      window.TEST_ROLE = 'standard';
      window.__bk = list;
      (0, eval)(core);
      var stub = window.fetch;
      var J = o => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      window.fetch = function (url) {
        var m = /rpc\/([a-z_]+)/.exec(String(url)), f = m && m[1];
        if (f === 'prognos_list_bookings') return J(window.__bk);
        if (f === 'prognos_status') return J({ ok: true, code_needed: false });
        if (/^(prognos_zones|prognos_watch_list|prognos_report_history|watch_list|route_watch_list|tag_villkor_get)$/.test(f || '')) return J([]);
        if (f === 'prognos_morgon' || f === 'prognos_original') return J(null);
        return stub.apply(this, arguments);
      };
    }, core, bookings(now), now);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForFunction(() => typeof window.openItem === 'function' && document.querySelector('#app .grid'), { timeout: 20000 });
    await p.evaluate(() => { var s = document.createElement('style'); s.textContent = '.hb-char,.hb-wrap,#hb-root,.td-berra{display:none!important}'; document.head.appendChild(s); });
    return p;
  }
  const state = p => p.evaluate(() => ({
    zones: [...document.querySelectorAll('.pg-ztab.pg-ztab-new')].map(b => b.getAttribute('data-ztab')).sort(),
    cells: document.querySelectorAll('.pg-td-cell .pg-new-dot').length,
    cur: (document.querySelector('.pg-ztab.on') || {}).getAttribute ? document.querySelector('.pg-ztab.on').getAttribute('data-ztab') : null
  }));
  for (const [w, h, mobile, label] of [[1280, 800, false, 'platta-liggande'], [390, 844, true, 'telefon-staende']]) {
    const p = await open(w, h, mobile);
    await p.evaluate(() => openItem('prognos'));
    await p.waitForSelector('.pg-ztab', { timeout: 20000 });
    await sleep(800);
    await p.evaluate(() => { const b = document.querySelector('.pg-ztab[data-ztab="161"]'); if (b) b.click(); });
    await sleep(500);
    let s = await state(p);
    ok(label + ': prick på zon 161 och 293', JSON.stringify(s.zones) === JSON.stringify(['161', '293']), JSON.stringify(s));
    ok(label + ': en prick på ny bokning i 161', s.cur === '161' && s.cells === 1, JSON.stringify(s));
    await p.screenshot({ path: path.join(out, label + '-161.png') });
    await p.evaluate(() => { const b = document.querySelector('.pg-ztab[data-ztab="163"]'); if (b) b.click(); });
    await sleep(400);
    s = await state(p);
    ok(label + ': ingen prick i 163 (bara gamla)', s.cur === '163' && s.cells === 0, JSON.stringify(s));
    // Bokning 1 försvinner ur listan -> pricken på 161 försvinner, 293 kvar.
    await p.evaluate(() => { window.__bk = window.__bk.filter(b => b.id !== 1); return PROGNOS.refresh(); });
    await sleep(800);
    s = await state(p);
    ok(label + ': prick borta när bokningen försvann', JSON.stringify(s.zones) === JSON.stringify(['293']), JSON.stringify(s));
    const saved = await p.evaluate(() => localStorage.getItem('prognos_newids_900001'));
    ok(label + ': sparad lista utan bokning 1', saved === '{"3":1}', saved);
    await p.evaluate(() => { const b = document.querySelector('.pg-ztab[data-ztab="293"]'); if (b) b.click(); });
    await sleep(500);
    await p.screenshot({ path: path.join(out, label + '-293-efter.png') });
    ok(label + ': inga sidfel', !p._errs.length, p._errs.join(' | '));
    await p.close();
  }
  await br.close(); server.close();
  if (fails.length) { console.log('PROGNOS_PRICKAR_FAIL ' + fails.length); process.exit(1); }
  console.log('PROGNOS_PRICKAR_E2E_OK');
})().catch(e => { console.error(e); process.exit(1); });
