'use strict';
// Webbläsartest: Moduler kan flyttas men stannar på startskärmen (2026-11-12mod1).
// Kör: node tests/hem-moduler/e2e.cjs [utmapp]
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
const out = process.argv[2] || '/workspace/anim-preview/moduler-flytta';
fs.mkdirSync(out, { recursive: true });
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  async function openHome({ width, height, theme, keep }) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p._errs = []; p.on('pageerror', e => p._errs.push(String(e)));
    p.on('dialog', d => d.accept());
    await p.evaluateOnNewDocument((core, theme, keep) => {
      if (!keep) { localStorage.clear(); sessionStorage.clear(); }
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
      localStorage.setItem('hb_char_900001', 'off');
      window.TEST_ROLE = 'standard';
      window.confirm = function () { return true; };
      (0, eval)(core);
      var stub = window.fetch;
      window.fetch = function (url, opt) {
        if (/home_tool_order_set/.test(String(url))) {
          var b = JSON.parse(opt && opt.body || '{}');
          return Promise.resolve(new Response(JSON.stringify({ ids: b.p_ids, hidden: b.p_hidden, folders: b.p_folders || null }), { status: 200 }));
        }
        if (/home_tool_order_get/.test(String(url))) {
          return Promise.resolve(new Response(JSON.stringify({ ids: null, hidden: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return stub.apply(this, arguments);
      };
    }, core, theme, !!keep);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForSelector('#app .grid .icon[data-tool="moduler"]', { visible: true, timeout: 20000 });
    await p.evaluate(() => { var s = document.createElement('style'); s.textContent = '.hb-char,.hb-wrap,#hb-root,.td-berra{display:none!important}'; document.head.appendChild(s); });
    return p;
  }
  const top = p => p.evaluate(() => Array.from(document.querySelectorAll('#app .grid > .icon')).map(n => n.getAttribute('data-tool') || n.getAttribute('data-folder')));
  const center = (p, sel) => p.evaluate(s => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom }; }, sel);
  async function mouseDrag(p, from, to, opts) {
    opts = opts || {};
    await p.mouse.move(from.x, from.y);
    await p.mouse.down();
    await sleep(opts.hold == null ? 1050 : opts.hold);
    const steps = 14;
    for (let i = 1; i <= steps; i++) { await p.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await sleep(16); }
    await sleep(opts.dwell == null ? 420 : opts.dwell);
    await p.mouse.up();
    await sleep(250);
  }
  async function touchDrag(p, from, to, opts) {
    opts = opts || {};
    await p.touchscreen.touchStart(from.x, from.y);
    await sleep(opts.hold == null ? 1050 : opts.hold);
    const steps = 16;
    for (let i = 1; i <= steps; i++) { await p.touchscreen.touchMove(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await sleep(18); }
    await sleep(opts.dwell == null ? 420 : opts.dwell);
    await p.touchscreen.touchEnd();
    await sleep(300);
  }
  const stored = p => p.evaluate(() => JSON.parse(localStorage.getItem('taxi_home_order:900001') || 'null'));

  const p = await openHome({ width: 390, height: 844, theme: 'dark' });
  ok('ingen alltid-sist-ruta', await p.evaluate(() => !document.querySelector('.td-slot-empty')));
  ok('Moduler är en vanlig ikon', await p.evaluate(() => {
    const n = document.querySelector('#app .grid .icon[data-tool="moduler"]');
    return !!(n && n.querySelector('.emoji svg') && /Moduler/.test((n.querySelector('.label') || {}).textContent || ''));
  }));
  let t0 = await top(p);
  ok('Moduler sist som standard', t0[t0.length - 1] === 'moduler', t0.join(','));
  const A = t0.filter(id => !['installningar', 'om', 'admin', 'sadmin', 'moduler'].includes(id))[0];

  // Håll in på Moduler: meny utan Avinstallera, med Flytta / Modulinfo / Hjälp
  let mEl = await center(p, '#app .grid .icon[data-tool="moduler"] .emoji');
  await p.mouse.move(mEl.x, mEl.y); await p.mouse.down(); await sleep(1050); await p.mouse.up(); await sleep(200);
  const menu = await p.evaluate(() => {
    const el = document.getElementById('td-lp-menu');
    return el ? el.textContent : '';
  });
  ok('meny på Moduler utan Avinstallera', /Flytta/.test(menu) && /Modulinfo/.test(menu) && /Hjälp/.test(menu) && !/Avinstallera/.test(menu) && !/lägg i mapp/i.test(menu), menu);
  ok('håll in öppnar inte sidan', await p.evaluate(() => document.querySelector('#title').textContent === 'TaxiData'));
  await p.screenshot({ path: path.join(out, 'meny-moduler-390-dark.png') });
  await p.mouse.click(200, 820); await sleep(150);

  // Flytta Moduler med touch till en plats som inte är sist (före första ikonen)
  mEl = await center(p, '#app .grid .icon[data-tool="moduler"] .emoji');
  const first = await center(p, '#app .grid > .icon:first-child');
  await touchDrag(p, mEl, { x: first.l + 6, y: first.y });
  let t1 = await top(p);
  ok('Moduler flyttad med touch, inte sist', t1[0] === 'moduler' && t1[t1.length - 1] !== 'moduler', t1.join(','));
  ok('position sparad lokalt', ((await stored(p)) || {}).ids && (await stored(p)).ids[0] === 'moduler', JSON.stringify(await stored(p)));
  await p.screenshot({ path: path.join(out, 'moduler-flyttad-390-dark.png') });

  // Kort tryck öppnar fortfarande Moduler-sidan
  await p.click('.icon[data-tool="moduler"]');
  await p.waitForSelector('.td-mod-list', { timeout: 8000 });
  ok('tryck öppnar Moduler-sidan', await p.evaluate(() => !!document.querySelector('.td-mod-list')));
  await p.goBack();
  await p.waitForSelector('#app .grid .icon[data-tool="moduler"]', { visible: true, timeout: 20000 });
  ok('tillbaka på startskärmen, plats kvar', (await top(p))[0] === 'moduler', (await top(p)).join(','));

  // Släpp Moduler på en annan ikon: ingen mapp, bara omordning
  mEl = await center(p, '#app .grid .icon[data-tool="moduler"] .emoji');
  let aEl = await center(p, `#app .grid .icon[data-tool="${A}"] .emoji`);
  await mouseDrag(p, mEl, aEl);
  let t2 = await top(p);
  ok('släpp Moduler på ikon skapar ingen mapp', !t2.some(x => /^mapp-/.test(x)) && t2.includes('moduler') && t2.includes(A), t2.join(','));
  ok('Moduler fortfarande på startskärmen', t2.includes('moduler') && !(await p.evaluate(() => !!document.querySelector('#app .grid .td-folder'))));

  // Släpp en annan ikon på Moduler: ingen mapp
  // Lägg Moduler sist igen så vi har en tydlig måltavla, sedan släpp A på den
  mEl = await center(p, '#app .grid .icon[data-tool="moduler"] .emoji');
  const lastBefore = await center(p, '#app .grid > .icon:last-child');
  // om den inte redan är sist: dra till slutet
  if ((await top(p))[(await top(p)).length - 1] !== 'moduler') {
    await mouseDrag(p, mEl, { x: lastBefore.r - 4, y: lastBefore.b + 8 }, { dwell: 250 });
  }
  aEl = await center(p, `#app .grid .icon[data-tool="${A}"] .emoji`);
  mEl = await center(p, '#app .grid .icon[data-tool="moduler"] .emoji');
  await mouseDrag(p, aEl, mEl);
  let t3 = await top(p);
  ok('släpp ikon på Moduler skapar ingen mapp', !t3.some(x => /^mapp-/.test(x)) && t3.includes('moduler') && t3.includes(A) && !(await p.evaluate(() => !!document.querySelector('#app .grid .td-folder'))), t3.join(','));

  // Gör en mapp av två vanliga ikoner, försök släppa Moduler på mappen: vägras
  const tools = t3.filter(id => !['installningar', 'om', 'admin', 'sadmin', 'moduler'].includes(id) && !/^mapp-/.test(id));
  const B = tools[0], C = tools[1];
  let bEl = await center(p, `#app .grid .icon[data-tool="${B}"] .emoji`);
  let cEl = await center(p, `#app .grid .icon[data-tool="${C}"] .emoji`);
  await mouseDrag(p, bEl, cEl);
  ok('kontrollmapp skapad', await p.evaluate(() => !!document.querySelector('#app .grid .td-folder')));
  mEl = await center(p, '#app .grid .icon[data-tool="moduler"] .emoji');
  let fEl = await center(p, '#app .grid .td-folder .td-folder-ico');
  await mouseDrag(p, mEl, fEl);
  const st = await stored(p);
  const t4 = await top(p);
  ok('släpp Moduler på mapp vägras', t4.includes('moduler') && !/^mapp-/.test(t4[t4.length - 1] === 'moduler' ? 'ok' : '') && (st.folders || []).every(f => f.items.indexOf('moduler') < 0), t4.join(',') + ' ' + JSON.stringify(st && st.folders));
  ok('Moduler inte inne i mappen', await p.evaluate(() => !document.querySelector('#td-mapp-forrad .icon[data-tool="moduler"]') && !!document.querySelector('#app .grid .icon[data-tool="moduler"]')));
  await p.screenshot({ path: path.join(out, 'moduler-mapp-vagrad-390-dark.png') });

  // Återställ lägger tillbaka Moduler sist
  mEl = await center(p, '#app .grid .icon[data-tool="moduler"] .emoji');
  await p.mouse.move(mEl.x, mEl.y); await p.mouse.down(); await sleep(1050); await p.mouse.up(); await sleep(200);
  await p.click('#td-lp-menu [data-lp="move"]'); await sleep(200);
  await p.click('.td-andringslage [data-ordna="reset"]'); await sleep(250);
  const t5 = await top(p);
  ok('Återställ: Moduler sist på startskärmen', t5[t5.length - 1] === 'moduler' && t5.includes('moduler'), t5.join(','));

  // Flytta igen och ladda om: plats kvar
  mEl = await center(p, '#app .grid .icon[data-tool="moduler"] .emoji');
  const second = await center(p, '#app .grid > .icon:nth-child(2)');
  await mouseDrag(p, mEl, { x: second.l + 4, y: second.y }, { dwell: 250 });
  const before = await top(p);
  ok('omladdning: Moduler inte sist före reload', before.indexOf('moduler') >= 0 && before[before.length - 1] !== 'moduler', before.join(','));
  const errs1 = p._errs.filter(e => !/st\.list/.test(e));
  await p.close();
  const p2 = await openHome({ width: 390, height: 844, theme: 'dark', keep: true });
  await sleep(300);
  const after = await top(p2);
  ok('plats kvar efter omladdning', JSON.stringify(before) === JSON.stringify(after), before.join(',') + ' vs ' + after.join(','));
  const errs = errs1.concat(p2._errs).filter(e => !/st\.list/.test(e));
  ok('inga sidfel', !errs.length, errs.join(' | '));
  await p2.close();

  // Platt/surfplatta: Moduler flyttad
  const p3 = await openHome({ width: 820, height: 1180, theme: 'dark' });
  const m3 = await center(p3, '#app .grid .icon[data-tool="moduler"] .emoji');
  const f3 = await center(p3, '#app .grid > .icon:first-child');
  await mouseDrag(p3, m3, { x: f3.l + 6, y: f3.y });
  ok('platta: Moduler flyttad', (await top(p3))[0] === 'moduler', (await top(p3)).join(','));
  await p3.screenshot({ path: path.join(out, 'moduler-flyttad-820-dark.png') });
  await p3.close();

  await br.close();
  server.close();
  if (fails.length) { console.log('FAILS', fails.length); process.exit(1); }
  console.log('HEM_MODULER_E2E_OK');
})().catch(e => { console.error(e); process.exit(1); });
