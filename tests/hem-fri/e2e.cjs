'use strict';
// Webbläsartest: fri placering på startskärmen, 4 i bredd och Ikonstorlek (2026-11-14fri1). Kör: node tests/hem-fri/e2e.cjs [utmapp]
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
const out = process.argv[2] || '/workspace/anim-preview/hem-fri';
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

  async function openHome({ width, height, theme, keep, layout, icons, text }) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p._errs = []; p.on('pageerror', e => p._errs.push(String(e)));
    await p.exposeFunction('__saveCall', (body) => { saved.push(body); });
    await p.evaluateOnNewDocument((core, theme, keep, layout, icons, text) => {
      if (!keep) { localStorage.clear(); sessionStorage.clear(); if (layout) localStorage.setItem('taxi_home_layout', layout); if (icons) localStorage.setItem('taxi_icon_size', icons); if (text) localStorage.setItem('taxi_text_size', text); }
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
          return Promise.resolve(new Response(JSON.stringify({ ids: b.p_ids, hidden: b.p_hidden, folders: b.p_folders || null, pos: b.p_pos || null }), { status: 200 }));
        }
        if (/home_tool_order_get/.test(String(url))) {
          return Promise.resolve(new Response(JSON.stringify({ ids: null, hidden: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return stub.apply(this, arguments);
      };
    }, core, theme, !!keep, layout || '', icons || '', text || '');
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


  const lay = p => p.evaluate(() => HEM_ORDNING.freeLayout());
  // Mitten av en ruta (rad, kolumn) i startskärmens rutnät
  const cellXY = (p, r, c) => p.evaluate((r, c) => {
    const g = document.querySelector('#app .grid'), cs = getComputedStyle(g), b = g.getBoundingClientRect();
    const cols = cs.gridTemplateColumns.split(' ').map(parseFloat), cg = parseFloat(cs.columnGap) || 0, rg = parseFloat(cs.rowGap) || 0;
    const h = parseFloat(g.style.gridAutoRows) || 72;
    let x = b.left + (parseFloat(cs.paddingLeft) || 0); for (let i = 0; i < c; i++) x += cols[i] + cg; x += cols[c] / 2;
    const y = b.top + (parseFloat(cs.paddingTop) || 0) + r * (h + rg) + h * 0.85;   // nedre delen: inte på ikonen (mapp)
    return { x, y };
  }, r, c);
  const emo = (p, id) => center(p, `#app .grid .icon[data-tool="${id}"] .emoji`);

  // 1) Telefon, 4 i bredd
  let p = await openHome({ width: 390, height: 844, theme: 'dark', layout: '4' });
  let L = await lay(p);
  ok('4 i bredd: 4 kolumner', L && L.C === 4, JSON.stringify(L));
  ok('4 i bredd: packat från början', L.map.kordata[0] === 0 && L.map.kordata[1] === 0, JSON.stringify(L.map));
  const rows0 = Math.max(...Object.values(L.map).map(v => v[0]));
  await p.screenshot({ path: path.join(out, '1-start-4-i-bredd.png') });
  // dra Körpassdata till en tom ruta längst ner till höger (raden under sista)
  await touchDrag(p, await emo(p, 'kordata'), await cellXY(p, rows0 + 1, 3), { pause: 450 });
  L = await lay(p);
  ok('flyttad till tom ruta', JSON.stringify(L.map.kordata) === JSON.stringify([rows0 + 1, 3]), JSON.stringify(L.map));
  ok('rutan den lämnade står tom (ingen packning)', !Object.values(L.map).some(v => v[0] === 0 && v[1] === 0), JSON.stringify(L.map));
  ok('inga streckade rutor efter släpp', await p.evaluate(() => !document.querySelector('.td-cell')));
  // släpp på en upptagen ruta (inte på ikonen) -> byter plats
  const occId = Object.keys(L.map).find(k => L.map[k][0] === 0 && L.map[k][1] === 2);
  await touchDrag(p, await emo(p, 'kordata'), await cellXY(p, 0, 2), { pause: 450 });
  L = await lay(p);
  ok('släpp på upptagen ruta = byter plats', JSON.stringify(L.map.kordata) === '[0,2]' && JSON.stringify(L.map[occId]) === JSON.stringify([rows0 + 1, 3]), occId + ' ' + JSON.stringify(L.map));
  // kanter: lägg en ikon i högerkanten mitt på skärmen, mitten tom
  const st0 = await stored(p);
  ok('positioner sparade lokalt', st0 && st0.pos && st0.pos['4'] && JSON.stringify(st0.pos['4'].kordata) === '[0,2]', JSON.stringify(st0));
  ok('positioner skickade till servern (p_pos)', saved.some(s => /"p_pos":\{"4":/.test(s)), saved.slice(-1)[0]);
  await p.screenshot({ path: path.join(out, '2-flyttad-4-i-bredd.png') });
  ok('inga sidfel', !p._errs.length, p._errs.join(' | '));
  // 2) Omladdning: kvar
  const before = JSON.stringify((await lay(p)).map);
  await p.close();
  p = await openHome({ width: 390, height: 844, theme: 'dark', keep: true });
  ok('kvar efter omladdning', JSON.stringify((await lay(p)).map) === before, JSON.stringify((await lay(p)).map));
  // 3) Mapp i fri placering: släpp på en ikon -> mapp på målets ruta
  L = await lay(p);
  const [m1, m2] = ['vader', 'kalender'];
  const tcell = L.map[m2];
  await touchDrag(p, await emo(p, m1), await emo(p, m2), { pause: 450 });
  L = await lay(p);
  const fid = Object.keys(L.map).find(k => /^mapp-/.test(k));
  ok('mapp skapas i fri placering och tar målets ruta', fid && JSON.stringify(L.map[fid]) === JSON.stringify(tcell), JSON.stringify(L.map));
  // 4) Håll in utan att dra: menyn som förut
  let a = await emo(p, 'prognos');
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await sleep(1050); await p.mouse.up(); await sleep(200);
  ok('håll in visar menyn', /Flytta/.test(await p.evaluate(() => (document.getElementById('td-lp-menu') || {}).textContent || '')));
  await p.click('#td-lp-menu [data-lp="move"]'); await sleep(250);
  ok('ändringsläge visar lediga rutor', await p.evaluate(() => document.querySelectorAll('#app .grid .td-cell').length > 0));
  await p.screenshot({ path: path.join(out, '3-andringslage-rutor.png') });
  await p.click('.td-andringslage [data-ordna="done"]'); await sleep(200);
  // 5) Nytt val under Startskärm sorterar om en gång
  await p.evaluate(() => openItem('installningar')); await sleep(300);
  ok('Startskärm har 4 i bredd', await p.evaluate(() => !!document.querySelector('input[name="home-layout"][value="4"]')));
  ok('Ikonstorlek finns', await p.evaluate(() => !!document.querySelector('input[name="icon-size"][value="stora"]') && !!document.querySelector('input[name="icon-size"][value="sma"]:checked')));
  await p.screenshot({ path: path.join(out, '4-installningar.png'), fullPage: true });
  await p.click('input[name="home-layout"][value="3"]'); await sleep(200);
  ok('nytt val nollställer positionerna', await p.evaluate(() => Object.keys(HEM_ORDNING.positions()).length === 0));
  await p.evaluate(() => goHome()); await sleep(400);
  L = await lay(p);
  const packed = Object.values(L.map).map(v => v[0] * 3 + v[1]).sort((x, y) => x - y);
  ok('3 i bredd, packat i ordning', L.C === 3 && packed.every((v, i) => v === i), JSON.stringify(L));
  ok('ordningen behållen (läsordning)', L.map.kordata && L.map.kordata[0] === 0, JSON.stringify(L.map));
  // dra igen efter omsortering: fri placering gäller igen
  const r3 = Math.max(...Object.values(L.map).map(v => v[0]));
  await touchDrag(p, await emo(p, 'prognos'), await cellXY(p, r3 + 1, 1), { pause: 450 });
  ok('fritt igen efter omsortering', JSON.stringify((await lay(p)).map.prognos) === JSON.stringify([r3 + 1, 1]), JSON.stringify((await lay(p)).map));
  ok('inga sidfel (2)', !p._errs.length, p._errs.join(' | '));
  await p.close();

  // 6) Ikonstorlek: Stora = 1,25x, oberoende av Textstorlek; Textstorlek ändrar inte ikonerna
  const fsz = async (o) => { const q = await openHome(Object.assign({ width: 390, height: 844, theme: 'dark', layout: '4' }, o)); const v = await q.evaluate(() => { const e = document.querySelector('#app .grid .icon[data-tool="kordata"] .emoji'), l = document.querySelector('#app .grid .icon[data-tool="kordata"] .label'); return { e: parseFloat(getComputedStyle(e).fontSize), l: parseFloat(getComputedStyle(l).fontSize), C: HEM_ORDNING.freeLayout().C }; }); if (o.shot) await q.screenshot({ path: path.join(out, o.shot) }); await q.close(); return v; };
  const sma = await fsz({}), stora = await fsz({ icons: 'stora', shot: '5-stora-4-i-bredd.png' }), txt = await fsz({ text: '130' });
  ok('Små = som förut (28 px i 4/3 i bredd)', sma.e === 28, JSON.stringify(sma));
  ok('Stora = 1,25x', Math.abs(stora.e / sma.e - 1.25) < 0.01 && stora.l > sma.l, JSON.stringify({ sma, stora }));
  ok('Stora fungerar med 4 i bredd', stora.C === 4, JSON.stringify(stora));
  ok('Textstorlek ändrar inte ikonen (bara texten)', txt.e === sma.e && txt.l > sma.l, JSON.stringify({ sma, txt }));

  // 7) Platta liggande (Fyll bredd): flytta till högerkanten, vrid till stående -> kvar i högerkanten
  saved = [];
  p = await openHome({ width: 1280, height: 800, theme: 'light' });
  L = await lay(p);
  ok('platta liggande: många kolumner', L.C >= 8, JSON.stringify(L.C));
  await touchDrag(p, await emo(p, 'kordata'), await cellXY(p, 1, L.C - 1), { pause: 450 });
  L = await lay(p);
  ok('platta: i högerkanten', JSON.stringify(L.map.kordata) === JSON.stringify([1, L.C - 1]), JSON.stringify(L.map));
  await p.screenshot({ path: path.join(out, '6-platta-liggande.png') });
  await p.setViewport({ width: 800, height: 1280, deviceScaleFactor: 1, isMobile: false, hasTouch: true }); await sleep(600);
  const P = await lay(p);
  ok('platta stående: färre kolumner, fortfarande i högerkanten', P.C < L.C && P.map.kordata[1] === P.C - 1, JSON.stringify(P));
  await p.screenshot({ path: path.join(out, '7-platta-staende.png') });
  ok('inga sidfel (platta)', !p._errs.length, p._errs.join(' | '));
  await p.close();

  // 8) Lista: ingen fri placering
  p = await openHome({ width: 390, height: 844, theme: 'dark', layout: 'lista' });
  ok('lista: ingen fri placering', (await lay(p)) === null && await p.evaluate(() => !document.querySelector('#app .grid.td-free')));
  await p.close();

  await br.close(); server.close();
  if (fails.length) { console.log('HEM_FRI_FAIL ' + fails.length); process.exit(1); }
  console.log('HEM_FRI_E2E_OK');
})().catch(e => { console.error(e); process.exit(1); });
