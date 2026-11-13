'use strict';
// Webbläsartest för startskärmens mappar (2026-11-12mapp1). Kör: node tests/hem-mappar/e2e.cjs [utmapp]
// Testar: ingen skiftnyckel, kort tryck öppnar, håll in = meny, håll in + dra = flytta, släpp på ikon = mapp,
// öppna mapp, byt namn, håll in + dra UT ur mappen till startskärmen (touch), upplösning vid en kvar, sparat efter omladdning.
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
const out = process.argv[2] || '/workspace/anim-preview/mappar';
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
  let saved = [];

  async function openHome({ width, height, theme, keep }) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p._errs = []; p.on('pageerror', e => p._errs.push(String(e)));
    await p.exposeFunction('__saveCall', (body) => { saved.push(body); });
    await p.evaluateOnNewDocument((core, theme, keep) => {
      if (!keep) { localStorage.clear(); sessionStorage.clear(); }
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
      localStorage.setItem('hb_char_900001', 'off');
      window.TEST_ROLE = 'standard';
      (0, eval)(core);
      var stub = window.fetch;
      window.fetch = function (url, opt) {
        if (/home_tool_order_set/.test(String(url))) {
          window.__saveCall(opt && opt.body || '');
          // servern utan migration 20261112b: 4-arg saknas (404), 3-arg fungerar
          var b = JSON.parse(opt && opt.body || '{}');
          if (b.p_folders && window.__noFolderRpc) return Promise.resolve(new Response('{"code":"PGRST202"}', { status: 404 }));
          return Promise.resolve(new Response(JSON.stringify({ ids: b.p_ids, hidden: b.p_hidden, folders: b.p_folders || null }), { status: 200 }));
        }
        if (/home_tool_order_get/.test(String(url))) {
          return Promise.resolve(new Response(JSON.stringify({ ids: null, hidden: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return stub.apply(this, arguments);
      };
    }, core, theme, !!keep);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
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
    const pts = opts.via ? [opts.via, to] : [to];
    let cur = from;
    for (let pt of pts) {
      if (typeof pt === 'function') pt = await pt();
      const steps = 16;
      for (let i = 1; i <= steps; i++) { await p.touchscreen.touchMove(cur.x + (pt.x - cur.x) * i / steps, cur.y + (pt.y - cur.y) * i / steps); await sleep(18); }
      cur = pt;
      await sleep(opts.pause == null ? 350 : opts.pause);
    }
    await p.touchscreen.touchEnd();
    await sleep(300);
  }
  const stored = p => p.evaluate(() => JSON.parse(localStorage.getItem('taxi_home_order:900001') || 'null'));

  const p = await openHome({ width: 390, height: 844, theme: 'dark' });
  ok('ingen skiftnyckel', await p.evaluate(() => !document.querySelector('.td-wrench')));
  ok('ändringsläget dolt normalt', await p.evaluate(() => getComputedStyle(document.querySelector('.td-andringslage')).display === 'none'));
  const t0 = await top(p);
  console.log('start', t0.join(','));
  const [A, B, C, D] = t0.filter(id => !['installningar', 'om', 'admin', 'sadmin'].includes(id));

  // Håll in utan att röra: menyn med Avinstallera, inget öppnas
  let a = await center(p, `#app .grid .icon[data-tool="${A}"] .emoji`);
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await sleep(1050); await p.mouse.up(); await sleep(200);
  const menu = await p.evaluate(() => { const m = document.getElementById('td-lp-menu'); return m ? m.textContent : ''; });
  ok('håll in visar meny', /Avinstallera/.test(menu) && /Flytta/.test(menu), menu);
  ok('håll in öppnar inte modulen', await p.evaluate(() => document.querySelector('#title').textContent === 'TaxiData'));
  await p.screenshot({ path: path.join(out, 'meny-390-dark.png') });
  await p.mouse.click(200, 820); await sleep(150);
  ok('tryck utanför stänger menyn', await p.evaluate(() => !document.getElementById('td-lp-menu')));

  // Kort rörelse före lyft = ingen dragning
  const b0 = await center(p, `#app .grid .icon[data-tool="${B}"] .emoji`);
  await mouseDrag(p, a, { x: b0.x, y: b0.y }, { hold: 200 });
  ok('ingen dragning utan att hålla in', JSON.stringify(await top(p)) === JSON.stringify(t0));

  // Flytta: håll in A och dra till efter C (i luckan till höger om C)
  let c = await center(p, `#app .grid .icon[data-tool="${C}"]`);
  a = await center(p, `#app .grid .icon[data-tool="${A}"] .emoji`);
  await mouseDrag(p, a, { x: c.r - 4, y: c.b - 8 }, { dwell: 250 });
  let t1 = await top(p);
  ok('flytta ikon', t1.indexOf(A) > t1.indexOf(C), t1.join(','));
  ok('ordning sparad lokalt', ((await stored(p)) || {}).ids && (await stored(p)).ids.indexOf(A) > (await stored(p)).ids.indexOf(C));

  // Mapp: släpp B på D
  let bEl = await center(p, `#app .grid .icon[data-tool="${B}"] .emoji`);
  let dEl = await center(p, `#app .grid .icon[data-tool="${D}"] .emoji`);
  await mouseDrag(p, bEl, dEl);
  let folder = await p.evaluate(() => { const f = document.querySelector('#app .grid .td-folder'); return f && { id: f.getAttribute('data-folder'), label: f.querySelector('.label').textContent, minis: f.querySelectorAll('.td-fmini').length }; });
  ok('släpp på ikon skapar mapp', folder && folder.minis === 2 && folder.label === 'Mapp', JSON.stringify(folder));
  ok('mappens ikoner syns inte i rutnätet', await p.evaluate((B, D) => !document.querySelector(`#app .grid .icon[data-tool="${B}"]`) && !document.querySelector(`#app .grid .icon[data-tool="${D}"]`), B, D));
  let st = await stored(p);
  ok('mapp sparad lokalt', st && st.folders && st.folders[0].items.join() === [D, B].join(), JSON.stringify(st));
  ok('mapp skickad till servern', saved.some(s => /p_folders/.test(s) && s.indexOf(folder.id) >= 0));
  const transp = await p.evaluate(() => { const e = document.querySelector('.td-folder .td-folder-ico'); const cs = getComputedStyle(e); return cs.backgroundColor; });
  ok('mappen är genomskinlig', /rgba\(.*0\.\d+\)/.test(transp), transp);
  await p.screenshot({ path: path.join(out, 'mapp-stangd-390-dark.png') });

  // Lägg A i mappen
  if (process.env.DBG) await p.evaluate(() => { window.__TD_DBG = !!1; });
  if (process.env.DBG) p.on('console', m => console.log('PAGE', m.text()));
  a = await center(p, `#app .grid .icon[data-tool="${A}"] .emoji`);
  let fEl = await center(p, '#app .grid .td-folder .td-folder-ico');
  await mouseDrag(p, a, fEl);
  st = await stored(p);
  ok('släpp på mapp lägger till', st.folders[0].items.length === 3 && st.folders[0].items[2] === A, JSON.stringify(st.folders));

  // Öppna mappen och byt namn
  await p.click('#app .grid .td-folder'); await sleep(250);
  ok('tryck öppnar mappen', await p.evaluate(() => document.querySelectorAll('#td-mapp .td-mapp-grid .icon[data-tool]').length === 3));
  await p.click('#td-mapp .td-mapp-namn'); await sleep(100);
  await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control');
  await p.keyboard.type('Bil & väg');
  await p.keyboard.press('Enter'); await sleep(150);
  ok('byt namn', await p.evaluate(() => document.querySelector('#app .grid .td-folder .label').textContent === 'Bil & väg' && document.querySelector('#td-mapp .td-mapp-namn').textContent === 'Bil & väg'));
  ok('namn sparat', (await stored(p)).folders[0].name === 'Bil & väg');
  await p.screenshot({ path: path.join(out, 'mapp-oppen-390-dark.png') });

  // Ordna inne i mappen: dra sista först (mus)
  let inA = await center(p, `#td-mapp .icon[data-tool="${A}"] .emoji`);
  let inFirst = await center(p, '#td-mapp .td-mapp-grid .icon:first-child');
  await mouseDrag(p, inA, { x: inFirst.l + 6, y: inFirst.y }, { dwell: 250 });
  st = await stored(p);
  ok('ordna i mappen', st.folders[0].items[0] === A, JSON.stringify(st.folders[0].items));
  ok('mappen öppen efter ordning', await p.evaluate(() => !!document.getElementById('td-mapp')));

  // Öppna mapp -> håll in -> dra UT -> släpp på startskärmen (touch, som på telefonen)
  inA = await center(p, `#td-mapp .icon[data-tool="${A}"] .emoji`);
  const box = await center(p, '#td-mapp .td-mapp-box');
  // efter att mappen stängts: släpp till höger om Moduler (= sist). Moduler är en vanlig ikon, inte en sista-ruta.
  await touchDrag(p, inA, () => center(p, '#app .grid .icon[data-tool="moduler"]').then(c => ({ x: c.r - 4, y: c.y })), { via: { x: inA.x, y: box.b + 60 } });
  await p.screenshot({ path: path.join(out, 'utdragen-390-dark.png') });
  let t2 = await top(p);
  st = await stored(p);
  ok('dra ut ur mapp (touch)', t2.includes(A) && st.folders[0].items.indexOf(A) < 0, t2.join(',') + ' ' + JSON.stringify(st.folders));
  ok('mappen stängd efter utdragning', await p.evaluate(() => !document.getElementById('td-mapp')));
  ok('utdragen ikon sist (Moduler kan ligga före)', t2[t2.length - 1] === A && t2.includes('moduler'), t2.join(','));
  ok('ingen sidbyte under dragning', await p.evaluate(() => document.querySelector('#title').textContent === 'TaxiData'));

  // Dra ut en till: bara en kvar -> mappen löses upp
  await p.click('#app .grid .td-folder'); await sleep(250);
  const inB = await center(p, `#td-mapp .icon[data-tool="${B}"] .emoji`);
  const box2 = await center(p, '#td-mapp .td-mapp-box');
  await touchDrag(p, inB, async () => { const h = await center(p, '#app .grid > .icon:first-child'); return { x: h.l + 4, y: h.y }; }, { via: { x: inB.x, y: box2.b + 60 } });
  let t3 = await top(p);
  st = await stored(p);
  ok('sista ikonen kvar -> mappen löses upp', !(st.folders || []).length && !t3.some(x => /^mapp-/.test(x)) && t3.includes(D) && t3.includes(B), t3.join(',') + ' ' + JSON.stringify(st));
  ok('upplöst ikon tar mappens plats', t3.indexOf(D) === t2.indexOf(folder.id) + 1 && t3[t3.indexOf(D) - 1] === t2[t2.indexOf(folder.id) - 1], t3.join(','));
  ok('utdragen B först', t3[0] === B, t3.join(','));

  // Gör ny mapp, ta bort mapp via håll-in-menyn
  bEl = await center(p, `#app .grid .icon[data-tool="${B}"] .emoji`);
  dEl = await center(p, `#app .grid .icon[data-tool="${D}"] .emoji`);
  await touchDrag(p, bEl, dEl, { pause: 450 });
  ok('mapp med touch', await p.evaluate(() => !!document.querySelector('#app .grid .td-folder')));
  fEl = await center(p, '#app .grid .td-folder .td-folder-ico');
  await p.mouse.move(fEl.x, fEl.y); await p.mouse.down(); await sleep(1050); await p.mouse.up(); await sleep(200);
  const fmenu = await p.evaluate(() => (document.getElementById('td-lp-menu') || {}).textContent || '');
  ok('mappmeny', /Ta bort mapp/.test(fmenu) && /Byt namn/.test(fmenu) && !/Avinstallera/.test(fmenu), fmenu);
  await p.screenshot({ path: path.join(out, 'mappmeny-390-dark.png') });
  await p.click('#td-lp-menu [data-lp="unpack"]'); await sleep(200);
  const t4 = await top(p);
  ok('ta bort mapp packar upp', !t4.some(x => /^mapp-/.test(x)) && t4.includes(B) && t4.includes(D), t4.join(','));

  // Flytta i menyn = ordningsläget (för den som inte vill hålla in och dra): dra direkt, Klar
  let e0 = await center(p, `#app .grid .icon[data-tool="${D}"] .emoji`);
  await p.mouse.move(e0.x, e0.y); await p.mouse.down(); await sleep(1050); await p.mouse.up(); await sleep(500);
  await p.click('#td-lp-menu [data-lp="move"]'); await sleep(200);
  ok('Flytta ger ordningsläget', await p.evaluate(() => getComputedStyle(document.querySelector('.td-andringslage')).display !== 'none' && document.querySelector('#app .grid').classList.contains('td-ordna')));
  const tE = await top(p);
  e0 = await center(p, `#app .grid .icon[data-tool="${D}"] .emoji`);
  const firstE = await center(p, '#app .grid > .icon:first-child');
  await mouseDrag(p, e0, { x: firstE.l + 4, y: firstE.y }, { hold: 0, dwell: 250 });
  ok('dra utan att hålla in i ordningsläget', (await top(p))[0] === D, (await top(p)).join(',') + ' från ' + tE.join(','));
  await p.click('.td-andringslage [data-ordna="done"]'); await sleep(200);
  ok('Klar lämnar ordningsläget', await p.evaluate(() => getComputedStyle(document.querySelector('.td-andringslage')).display === 'none'));

  // Gör mapp igen och ladda om: allt kvar
  bEl = await center(p, `#app .grid .icon[data-tool="${B}"] .emoji`);
  c = await center(p, `#app .grid .icon[data-tool="${C}"] .emoji`);
  await mouseDrag(p, bEl, c);
  const before = await top(p);
  await p.close();
  const p2 = await openHome({ width: 390, height: 844, theme: 'dark', keep: true });
  await sleep(300);
  const after = await top(p2);
  ok('sparat efter omladdning', JSON.stringify(before) === JSON.stringify(after), before.join(',') + ' vs ' + after.join(','));
  // Kort tryck i öppen mapp öppnar modulen och stänger mappen
  await p2.click('#app .grid .td-folder'); await sleep(250);
  await p2.screenshot({ path: path.join(out, 'mapp2-oppen-390-dark.png') });
  await p2.click(`#td-mapp .icon[data-tool="${C}"]`); await sleep(800);
  ok('tryck i mappen öppnar modulen', await p2.evaluate(() => document.querySelector('#title').textContent !== 'TaxiData' && !document.getElementById('td-mapp')));
  // (bevakning.js kastar st.list-fel med testets tomma fetch-svar när Ankomster öppnas; inte en del av den här ändringen)
  const errs = p._errs.concat(p2._errs).filter(e => !/st\.list/.test(e));
  ok('inga sidfel', !errs.length, errs.join(' | '));
  await p2.close();

  // Servern utan migration: 3-arg reserv, mapparna finns kvar lokalt
  saved = [];
  const p3 = await openHome({ width: 820, height: 1180, theme: 'dark' });
  await p3.evaluate(() => { window.__noFolderRpc = true; });
  const ids3 = (await top(p3)).filter(id => !['installningar', 'om'].includes(id));
  const e1 = await center(p3, `#app .grid .icon[data-tool="${ids3[0]}"] .emoji`);
  const e2 = await center(p3, `#app .grid .icon[data-tool="${ids3[1]}"] .emoji`);
  await mouseDrag(p3, e2, e1);
  await sleep(200);
  ok('platta: mapp skapas', await p3.evaluate(() => !!document.querySelector('#app .grid .td-folder')));
  ok('reserv till 3-arg utan mappkolumn', saved.some(s => /p_folders/.test(s)) && saved.some(s => !/p_folders/.test(s)), saved.length + '');
  ok('mapp kvar lokalt', ((await stored(p3)) || {}).folders.length === 1);
  await p3.screenshot({ path: path.join(out, 'mapp-stangd-820-dark.png') });
  await p3.close();

  // Ljust tema och liggande
  const p4 = await openHome({ width: 844, height: 390, theme: 'light' });
  const ids4 = (await top(p4)).filter(id => !['installningar', 'om'].includes(id));
  const g1 = await center(p4, `#app .grid .icon[data-tool="${ids4[0]}"] .emoji`);
  const g2 = await center(p4, `#app .grid .icon[data-tool="${ids4[2]}"] .emoji`);
  await mouseDrag(p4, g2, g1);
  ok('liggande: mapp skapas', await p4.evaluate(() => !!document.querySelector('#app .grid .td-folder')));
  await p4.click('#app .grid .td-folder'); await sleep(250);
  await p4.screenshot({ path: path.join(out, 'mapp-oppen-844x390-light.png') });
  await p4.close();

  await br.close();
  server.close();
  if (fails.length) { console.log('FAILS', fails.length); process.exit(1); }
  console.log('HEM_MAPPAR_E2E_OK');
})().catch(e => { console.error(e); process.exit(1); });
