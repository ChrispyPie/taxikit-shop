'use strict';
// Webbläsartest: filterchips i Notiser (t1820u, 2026-11-24).
// Allt är förval; tryck på en chip visar bara den kategorin (flera val går); Allt nollställer.
// Flyg & tåg tar med flyg, tåg och båt. Uppdateringar visar nyheter i appen. Raden ryms på 350 px.
// Kör: node tests/notis-filter/e2e.cjs [utmapp]
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
function loadPuppeteer() {
  for (const c of [path.resolve(__dirname, '../meddelanden/node_modules/puppeteer-core'), '/workspace/taxikit-shop/tests/meddelanden/node_modules/puppeteer-core', '/workspace/tk-login-20261118/tests/meddelanden/node_modules/puppeteer-core', 'puppeteer-core']) {
    try { return require(c); } catch (e) {}
  }
  throw new Error('puppeteer-core missing');
}
const puppeteer = loadPuppeteer();
const root = path.resolve(__dirname, '../..');
const outDir = process.argv[2] || '/tmp/notis-shots';
fs.mkdirSync(outDir, { recursive: true });
const core = fs.readFileSync(path.join(root, 'tests/meddelanden/fixtures.js'), 'utf8');
const mime = f => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'text/html';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURI(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', mime(file)); res.end(b); });
});
const fails = [];
const ok = (n, c, e) => { if (!c) { fails.push(n + (e ? ': ' + e : '')); console.log('FAIL', n, e || ''); } else console.log('OK', n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = Date.now(), iso = m => new Date(now - m * 60000).toISOString();
const feed = { unread: 3, items: [
  { src: 'p', id: 1, kind: 'prognos', tag: 'prognos-293-app', title: '🔮 Ny förbokning', body: 'Landvetter · Kombi ca 18:40', created_at: iso(5), read: false },
  { src: 'p', id: 2, kind: 'tag', tag: 'tag-445', title: 'Tåg 445 försenat', body: 'Från Stockholm C, +12 min', created_at: iso(15), read: false },
  { src: 'p', id: 3, kind: 'flyg', tag: 'flyg-KL1239', title: 'KL1239 har landat', body: 'Från Amsterdam', created_at: iso(30), read: false },
  { src: 'p', id: 4, kind: 'konto', tag: 'konto-delad', title: 'Ny inloggning', body: 'Delad enhet', created_at: iso(60), read: true },
  { src: 'e', id: 5, kind: 'bil_issue_msg', body: 'Ägaren svarade', created_at: iso(90), read: true, case_kind: 'bil', case_id: 7 },
  { src: 'p', id: 6, kind: 'prognos', tag: 'prognos-163-app', title: '🔮 Ny förbokning', body: 'Astra · Kombi ca 19:10', created_at: iso(120), read: true },
  { src: 'p', id: 7, kind: 'push', tag: 'konto-delad', title: 'Utloggad', body: 'Delad enhet', created_at: iso(150), read: true }
] };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = process.env.NF_BASE || ('http://127.0.0.1:' + server.address().port);
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  for (const [w, h, theme, tag] of [[350, 740, 'dark', 'p350d'], [412, 915, 'dark', 'p412d'], [412, 915, 'light', 'p412l'], [915, 412, 'dark', 'l915d']]) {
    const p = await br.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.evaluateOnNewDocument((core, feed, theme) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
      localStorage.setItem('hb_char_900001', 'off');
      localStorage.setItem('taxi_notis_cats', JSON.stringify({ off: ['flyg'] }));   // gammalt läge ska rensas
      window.TEST_ROLE = 'standard';
      (0, eval)(core);
      var stub = window.fetch;
      window.fetch = function (url, init) {
        var u = String(url);
        if (/rpc\/notis_feed/.test(u)) return Promise.resolve(new Response(JSON.stringify(feed), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        if (/rpc\/notis_(add|read)/.test(u)) return Promise.resolve(new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return stub.apply(this, arguments);
      };
    }, core, feed, theme);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForFunction(() => typeof window.openItem === 'function' && document.querySelector('#app .grid'), { timeout: 20000 });
    await p.evaluate(() => window.LAZY && LAZY.ensure ? LAZY.ensure('notiser').catch(() => {}) : null);
    await p.waitForFunction(() => window.NOTIS && NOTIS.open, { timeout: 20000 });
    await p.evaluate(() => NOTIS.refresh(true));
    await sleep(300);
    await p.evaluate(() => NOTIS.open());
    await p.waitForSelector('#np-cats .np-cat', { timeout: 10000 });
    await sleep(400);
    const st = () => p.evaluate(() => ({
      on: [...document.querySelectorAll('#np-cats .np-cat.on')].map(b => b.textContent),
      chips: [...document.querySelectorAll('#np-cats .np-cat')].map(b => b.textContent),
      items: [...document.querySelectorAll('#np-list .np-item')].map(b => b.textContent.slice(0, 40)),
      fit: (() => { const box = document.getElementById('np-cats'); const r = box.getBoundingClientRect(); return [...box.children].every(c => { const q = c.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1; }); })()
    }));
    let s = await st();
    ok(tag + ': Allt aktiv som förval, alla notiser syns', s.on.join() === 'Allt' && s.items.length === 7, JSON.stringify(s));
    ok(tag + ': chips ' + s.chips.join('|'), ['Allt', 'Flyg & tåg', 'Prognos', 'Meddelanden', 'Konto', 'Uppdateringar'].every(c => s.chips.includes(c)));
    ok(tag + ': chipraden ryms (radbryts vid behov)', s.fit);
    if (tag === 'p412d' || tag === 'p350d') await p.screenshot({ path: path.join(outDir, tag + '-allt.png') });
    const click = async label => { await p.evaluate(l => [...document.querySelectorAll('#np-cats .np-cat')].find(b => b.textContent === l).click(), label); await sleep(250); return st(); };
    s = await click('Flyg & tåg');
    ok(tag + ': Flyg & tåg visar flyg + tåg', s.on.join() === 'Flyg & tåg' && s.items.length === 2 && s.items.some(t => /KL1239/.test(t)) && s.items.some(t => /Tåg 445/.test(t)), JSON.stringify(s.items));
    if (tag === 'p412d' || tag === 'p350d') await p.screenshot({ path: path.join(outDir, tag + '-flyg.png') });
    s = await click('Prognos');
    ok(tag + ': flerval Flyg & tåg + Prognos', s.on.length === 2 && s.items.length === 4, JSON.stringify(s));
    s = await click('Flyg & tåg');
    ok(tag + ': av med Flyg & tåg igen → bara Prognos', s.on.join() === 'Prognos' && s.items.length === 2);
    s = await click('Konto');
    s = await click('Prognos');
    ok(tag + ': Konto (även push med konto-tagg)', s.on.join() === 'Konto' && s.items.length === 2, JSON.stringify(s.items));
    s = await click('Meddelanden');
    s = await click('Konto');
    ok(tag + ': Meddelanden', s.on.join() === 'Meddelanden' && s.items.length === 1);
    s = await click('Allt');
    ok(tag + ': Allt nollställer', s.on.join() === 'Allt' && s.items.length === 7);
    s = await click('Uppdateringar');
    ok(tag + ': Uppdateringar visar nyheter', s.on.join() === 'Uppdateringar' && s.items.length > 0 && s.items.every(t => /Nyheter i appen/.test(t)), JSON.stringify(s.items.slice(0, 3)));
    s = await click('Uppdateringar');
    ok(tag + ': sista chip av → Allt', s.on.join() === 'Allt');
    ok(tag + ': gammalt filterläge rensat', await p.evaluate(() => localStorage.getItem('taxi_notis_cats') === null));
    ok(tag + ': inga JS-fel', errs.length === 0, errs.join(' | '));
    await p.close();
  }
  await br.close(); server.close();
  console.log(fails.length ? 'FAILS: ' + fails.length : 'ALLA OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
