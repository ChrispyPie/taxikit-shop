'use strict';
// Webbläsartest: hemskärmens sidor, applådan, Ta bort genväg och släpp-ytan Ta bort (2026-11-14sidor1). Kör: node tests/hem-sidor/e2e.cjs [utmapp]
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
const out = process.argv[2] || '/workspace/anim-preview/hem-sidor';
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

  async function openHome({ width, height, theme, keep, layout, icons, text, role }) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p._errs = []; p.on('pageerror', e => p._errs.push(String(e)));
    await p.exposeFunction('__saveCall', (body) => { saved.push(body); });
    await p.evaluateOnNewDocument((core, theme, keep, layout, icons, text, role) => {
      if (!keep) { localStorage.clear(); sessionStorage.clear(); if (layout) localStorage.setItem('taxi_home_layout', layout); if (icons) localStorage.setItem('taxi_icon_size', icons); if (text) localStorage.setItem('taxi_text_size', text); }
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
      localStorage.setItem('hb_char_900001', 'off');
      window.TEST_ROLE = role;
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
    }, core, theme, !!keep, layout || '', icons || '', text || '', role || 'standard');
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


  const sida = p => p.evaluate(() => HEM_SIDOR.current());
  const onPage = (p, name) => p.evaluate(n => {
    const el = n === 'hem' ? document.getElementById('content') : document.querySelector('.td-sida[data-sida="' + n + '"]');
    if (!el) return false;
    const r = el.getBoundingClientRect(); return Math.abs(r.left) < 2 && getComputedStyle(el).visibility !== 'hidden';
  }, name);
  async function swipe(p, x0, y0, x1, y1) {
    await p.touchscreen.touchStart(x0, y0);
    const steps = 10;
    for (let i = 1; i <= steps; i++) { await p.touchscreen.touchMove(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(16); }
    await p.touchscreen.touchEnd();
    await sleep(450);
  }
  const extraXY = (p, r, c) => p.evaluate((r, c) => {
    const g = document.querySelector('.td-extra-grid'), cs = getComputedStyle(g), b = g.getBoundingClientRect();
    const cols = cs.gridTemplateColumns.split(' ').map(parseFloat), cg = parseFloat(cs.columnGap) || 0, rg = parseFloat(cs.rowGap) || 0;
    const h = parseFloat(g.style.gridAutoRows) || 72;
    let x = b.left; for (let i = 0; i < c; i++) x += cols[i] + cg; x += cols[c] / 2;
    return { x, y: b.top + r * (h + rg) + h * 0.85 };
  }, r, c);
  const drawerOpen = p => p.evaluate(() => { const d = document.getElementById('td-lada'); return !!(d && HEM_SIDOR.drawerOpen() && Math.abs(d.getBoundingClientRect().top) < 2); });
  const dstate = p => p.evaluate(() => { const d = document.getElementById('td-lada'), b = document.querySelector('#td-dots .td-lada-btn'); const r = b && b.getBoundingClientRect();
    const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return JSON.stringify({ open: HEM_SIDOR.drawerOpen(), top: d && d.getBoundingClientRect().top, sida: HEM_SIDOR.current(), dots: b && getComputedStyle(b.parentNode).display, hit: hit && (hit.id || hit.className), cur: window.current, home: document.getElementById('app').className }); });
  const drawerLabels = p => p.evaluate(() => Array.from(document.querySelectorAll('#td-lada .td-lada-list .icon')).map(n => n.getAttribute('aria-label')));

  // 1) Förare (standard), telefon, 4 i bredd
  let p = await openHome({ width: 390, height: 844, theme: 'dark', layout: '4' });
  ok('förare: startskärmen + sida 2', JSON.stringify(await p.evaluate(() => HEM_SIDOR.pages())) === '["hem","extra"]');
  ok('förare: två prickar, startskärmen markerad', await p.evaluate(() => document.querySelectorAll('#td-dots .td-dot').length === 2 && document.querySelector('#td-dots .td-dot.on').getAttribute('data-p') === 'hem'));
  ok('inga admin-sidor för förare', await p.evaluate(() => !document.querySelector('.td-sida[data-sida="admin"], .td-sida[data-sida="sadmin"]')));
  await p.screenshot({ path: path.join(out, '1-hem-prickar.png') });
  const nav0 = await p.evaluate(() => NAV.cur());
  await swipe(p, 320, 600, 60, 610);
  ok('svep vänster = sida 2', await sida(p) === 'extra' && await onPage(p, 'extra'), await sida(p));
  ok('sida 2 är tom med tips', await p.evaluate(() => getComputedStyle(document.querySelector('.td-sida-tom')).display !== 'none'));
  ok('svepet är ingen bakåt/framåt', await p.evaluate(n => NAV.cur() === n && document.querySelector('#title').textContent === 'TaxiData', nav0));
  await p.screenshot({ path: path.join(out, '2-sida2-tom.png') });
  await swipe(p, 60, 600, 330, 610);
  ok('svep höger = startskärmen igen', await sida(p) === 'hem' && await onPage(p, 'hem'));
  await swipe(p, 60, 600, 330, 610);
  ok('ingen sida till vänster för förare', await sida(p) === 'hem' && await onPage(p, 'hem'));

  // Dra en ikon till högerkanten -> sida 2, släpp i en ruta där
  await touchDrag(p, await emo(p, 'kordata'), { x: 386, y: 400 }, { pause: 1200 });
  ok('dra till kanten byter sida', await sida(p) === 'extra', await sida(p));
  ok('Körpassdata ligger på sida 2', await p.evaluate(() => !!document.querySelector('.td-extra-grid [data-tool="kordata"]') && !document.querySelector('#content .grid [data-tool="kordata"]') && HEM_ORDNING.extraIds().includes('kordata')));
  await touchDrag(p, await center(p, '.td-extra-grid [data-tool="kordata"] .emoji'), await extraXY(p, 2, 3), { pause: 450 });
  let LE = await p.evaluate(() => HEM_ORDNING.freeLayout('extra'));
  ok('fri ruta på sida 2', LE && JSON.stringify(LE.map.kordata) === '[2,3]', JSON.stringify(LE));
  let st = await stored(p);
  ok('sparat: sida2 + e-positioner', st && st.pos && (st.pos.sida2 || []).includes('kordata') && st.pos.e4 && JSON.stringify(st.pos.e4.kordata) === '[2,3]', JSON.stringify(st && st.pos));
  ok('skickat till servern med p_pos', saved.some(b => /"sida2":\["kordata"\]/.test(b)));
  await p.screenshot({ path: path.join(out, '3-sida2-med-ikon.png') });
  // 🏠 tar en till startskärmen
  await p.click('header .hdr-left button'); await sleep(400);
  ok('🏠 = startskärmen', await sida(p) === 'hem' && await onPage(p, 'hem'));
  // dra tillbaka från sida 2 till startskärmen via vänsterkanten
  await p.evaluate(() => HEM_SIDOR.go('extra', false)); await sleep(100);
  await touchDrag(p, await center(p, '.td-extra-grid [data-tool="kordata"] .emoji'), { x: 4, y: 400 }, { pause: 1200 });
  ok('tillbaka till startskärmen via vänsterkanten', await sida(p) === 'hem' && await p.evaluate(() => !!document.querySelector('#content .grid [data-tool="kordata"]') && !HEM_ORDNING.extraIds().includes('kordata')), await sida(p) + ' ' + JSON.stringify(await p.evaluate(() => [HEM_ORDNING.extraIds(), HEM_ORDNING.freeLayout()])));
  // och ut igen för omladdningstestet
  await touchDrag(p, await emo(p, 'kordata'), { x: 386, y: 400 }, { pause: 1200 });
  await p.close();
  p = await openHome({ width: 390, height: 844, theme: 'dark', layout: '4', keep: true });
  ok('efter omladdning: startskärmen visas', await sida(p) === 'hem' && await onPage(p, 'hem'));
  ok('efter omladdning: Körpassdata kvar på sida 2', await p.evaluate(() => !!document.querySelector('.td-extra-grid [data-tool="kordata"]') && !document.querySelector('#content .grid [data-tool="kordata"]')));

  // Håll in -> Ta bort genväg
  let e0 = await emo(p, 'vader');
  await p.touchscreen.touchStart(e0.x, e0.y); await sleep(1100); await p.touchscreen.touchEnd(); await sleep(300);
  ok('menyn har Ta bort genväg', await p.evaluate(() => !!document.querySelector('#td-lp-menu [data-lp="shortcut"]')));
  await p.screenshot({ path: path.join(out, '4-meny-ta-bort-genvag.png') });
  await p.click('#td-lp-menu [data-lp="shortcut"]'); await sleep(300);
  st = await stored(p);
  ok('genvägen borta, modulen kvar', await p.evaluate(() => !document.querySelector('#app .grid [data-tool="vader"]') && HEM_ORDNING.isInstalled('vader')) && (st.pos.ute || []).includes('vader') && !(st.hidden || []).includes('vader'), JSON.stringify(st));
  e0 = await emo(p, 'moduler');
  await p.touchscreen.touchStart(e0.x, e0.y); await sleep(1100); await p.touchscreen.touchEnd(); await sleep(300);
  ok('Moduler har ingen Ta bort genväg', await p.evaluate(() => !!document.querySelector('#td-lp-menu') && !document.querySelector('#td-lp-menu [data-lp="shortcut"]')));
  await p.keyboard.press('Escape'); await sleep(150);

  // Släpp-ytan Ta bort högst upp
  const tp0 = await emo(p, 'topplistor');
  await p.touchscreen.touchStart(tp0.x, tp0.y); await sleep(1050);
  for (let i = 1; i <= 12; i++) { await p.touchscreen.touchMove(tp0.x, tp0.y - (tp0.y - 30) * i / 12); await sleep(18); }
  await sleep(300);
  ok('släpp-ytan syns och är markerad', await p.evaluate(() => { const t = document.getElementById('td-trash'); return !!t && t.classList.contains('td-trash-on') && /Ta bort genväg/.test(t.textContent); }));
  await p.screenshot({ path: path.join(out, '5-slapp-ta-bort.png') });
  await p.touchscreen.touchEnd(); await sleep(350);
  ok('släppt på Ta bort = genvägen borta', await p.evaluate(() => !document.querySelector('#app .grid [data-tool="topplistor"]') && !document.getElementById('td-trash') && HEM_ORDNING.isInstalled('topplistor')));
  const md = await emo(p, 'moduler');
  await p.touchscreen.touchStart(md.x, md.y); await sleep(1050);
  for (let i = 1; i <= 8; i++) { await p.touchscreen.touchMove(md.x + 4 * i, md.y + 3 * i); await sleep(18); }
  ok('Moduler: ingen släpp-yta', await p.evaluate(() => !document.getElementById('td-trash')));
  await p.touchscreen.touchEnd(); await sleep(300);

  // Applådan: svep uppåt
  await p.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight)); await sleep(100);
  await swipe(p, 200, 760, 205, 380);
  ok('svep uppåt öppnar applådan', await drawerOpen(p));
  let labels = await drawerLabels(p);
  const sortedL = labels.slice().sort((a, b) => a.localeCompare(b, 'sv', { sensitivity: 'base' }));
  ok('bokstavsordning', JSON.stringify(labels) === JSON.stringify(sortedL), labels.join(','));
  ok('borttagna genvägar finns i lådan', labels.includes('Väder') && labels.some(l => /Topplist/.test(l)), labels.join(','));
  ok('inga adminmoduler för förare', !labels.some(l => /Admin|Ärenden|Åkeridata|Zonguide|S admin/.test(l)), labels.join(','));
  await p.screenshot({ path: path.join(out, '6-applada.png') });
  await p.type('#td-lada input', 'väd'); await sleep(150);
  labels = await drawerLabels(p);
  ok('sök filtrerar', JSON.stringify(labels) === '["Väder"]', labels.join(','));
  await p.screenshot({ path: path.join(out, '7-applada-sok.png') });
  await p.evaluate(() => history.back()); await sleep(500);
  ok('bakåt stänger lådan, startskärmen kvar', !(await drawerOpen(p)) && await p.evaluate(() => document.querySelector('#title').textContent === 'TaxiData' && !!document.querySelector('#content .grid')));
  // knappen ⌃ + svep nedåt stänger
  await p.click('#td-dots .td-lada-btn'); await sleep(450);
  ok('⌃ öppnar lådan', await drawerOpen(p));
  ok('sökfältet är tömt', await p.evaluate(() => document.querySelector('#td-lada input').value === ''));
  await swipe(p, 200, 30, 205, 400);
  ok('svep nedåt stänger lådan', !(await drawerOpen(p)));
  const navAfter = await p.evaluate(() => [NAV.cur(), document.querySelector('#title').textContent]);
  ok('stängd med svep: ingen extra bakåt', navAfter[1] === 'TaxiData', JSON.stringify(navAfter));

  // Håll in i lådan -> Lägg till på hemskärm (första lediga rutan)
  let LM = await lay(p);
  const firstFree = (() => { const t = new Set(Object.values(LM.map).map(v => v[0] + ':' + v[1])); for (let i = 0; i < 400; i++) { const r = Math.floor(i / LM.C), c = i % LM.C; if (!t.has(r + ':' + c)) return [r, c]; } })();
  await p.click('#td-dots .td-lada-btn'); await sleep(450);
  let vi = await center(p, '#td-lada .icon[data-lada="vader"] .emoji');
  await p.touchscreen.touchStart(vi.x, vi.y); await sleep(800); await p.touchscreen.touchEnd(); await sleep(300);
  ok('lådans meny: Lägg till på hemskärm', await p.evaluate(() => /Lägg till på hemskärm/.test((document.getElementById('td-lada-meny') || {}).textContent || '')));
  await p.screenshot({ path: path.join(out, '8-applada-meny.png') });
  await p.click('#td-lada-meny [data-m="add"]'); await sleep(600);
  LM = await lay(p);
  ok('Väder på första lediga rutan', !(await drawerOpen(p)) && LM.map.vader && JSON.stringify(LM.map.vader) === JSON.stringify(firstFree), JSON.stringify({ firstFree, v: LM.map.vader }));
  st = await stored(p);
  ok('Väder inte längre i ute', !((st.pos.ute || []).includes('vader')), JSON.stringify(st.pos));

  // Håll in i lådan och dra ut på hemskärmen
  LM = await lay(p);
  const rowsM = Math.max(...Object.values(LM.map).map(v => v[0]));
  await p.click('#td-dots .td-lada-btn'); await sleep(450);
  const ti = await center(p, '#td-lada .icon[data-lada="topplistor"] .emoji');
  await p.touchscreen.touchStart(ti.x, ti.y); await sleep(800);
  const dest = await (async () => { await sleep(0); return null; })();
  let cur = ti;
  for (let i = 1; i <= 6; i++) { await p.touchscreen.touchMove(ti.x + 3 * i, ti.y + 3 * i); await sleep(20); }
  await sleep(400);
  ok('dra ur lådan: lådan stängs, ikonen bärs', !(await drawerOpen(p)) && await p.evaluate(() => !!document.querySelector('.td-ghost')));
  const to = await cellXY(p, rowsM + 1, 3);
  cur = { x: ti.x + 18, y: ti.y + 18 };
  for (let i = 1; i <= 14; i++) { await p.touchscreen.touchMove(cur.x + (to.x - cur.x) * i / 14, cur.y + (to.y - cur.y) * i / 14); await sleep(18); }
  await sleep(450);
  await p.screenshot({ path: path.join(out, '9-dra-ur-ladan.png') });
  await p.touchscreen.touchEnd(); await sleep(400);
  LM = await lay(p);
  ok('utdragen modul ligger i rutan', LM.map.topplistor && JSON.stringify(LM.map.topplistor) === JSON.stringify([rowsM + 1, 3]), JSON.stringify(LM.map));
  ok('tryck i lådan öppnar modulen', await (async () => {
    await p.click('#td-dots .td-lada-btn'); await sleep(450);
    await p.click('#td-lada .icon[data-lada="kalender"]'); await sleep(800);
    return await p.evaluate(() => !!window.current && !HEM_SIDOR.drawerOpen());
  })());
  ok('inga JS-fel (förare)', !p._errs.length, p._errs.join(' | '));
  await p.close();

  // 2) S admin: S admin, Admin, startskärmen, sida 2
  p = await openHome({ width: 390, height: 844, theme: 'light', layout: '4', role: 'superadmin' });
  ok('S admin: fyra sidor', JSON.stringify(await p.evaluate(() => HEM_SIDOR.pages())) === '["sadmin","admin","hem","extra"]', JSON.stringify(await p.evaluate(() => HEM_SIDOR.pages())));
  ok('Admin-ikonen finns kvar på startskärmen', await p.evaluate(() => !!document.querySelector('#content .grid [data-tool="admin"]')));
  await swipe(p, 60, 600, 330, 610);
  ok('svep höger = Admin-sidan', await sida(p) === 'admin' && await onPage(p, 'admin'));
  const adm = await p.evaluate(() => Array.from(document.querySelectorAll('.td-sida[data-sida="admin"] .icon')).map(n => n.textContent.trim()));
  ok('Admin-sidan: ärenden, åkeridata m.m.', adm.some(t => /Ärenden/.test(t)) && adm.some(t => /Åkeridata/.test(t)) && adm.some(t => /Chaufförer/.test(t)), adm.join(','));
  await p.screenshot({ path: path.join(out, '10-admin-sida.png') });
  await swipe(p, 60, 600, 330, 610);
  ok('svep höger igen = S admin-sidan', await sida(p) === 'sadmin' && await onPage(p, 'sadmin'));
  await p.screenshot({ path: path.join(out, '11-sadmin-sida.png') });
  ok('S admin-sidan länkar till sadmin.html', await p.evaluate(() => !!document.querySelector('.td-sida[data-sida="sadmin"] [data-href="sadmin.html#zonguide"]')));
  ok('prickar: fyra, S admin markerad', await p.evaluate(() => document.querySelectorAll('#td-dots .td-dot').length === 4 && document.querySelector('#td-dots .td-dot.on').getAttribute('data-p') === 'sadmin'));
  await p.evaluate(() => HEM_SIDOR.go('hem', false));
  await p.click('#td-dots .td-lada-btn'); await sleep(450);
  labels = await drawerLabels(p);
  ok('S admin: lådan har admin- och S admin-moduler', labels.includes('Ärenden') && labels.includes('Zonguide') && labels.includes('Admin'), labels.join(',') + ' ' + await dstate(p));
  ok('inga JS-fel (S admin)', !p._errs.length, p._errs.join(' | '));
  await p.close();

  // 3) Admin: Admin-sidan utan åkeridelar, ingen S admin-sida
  p = await openHome({ width: 390, height: 844, theme: 'light', role: 'admin' });
  ok('admin: tre sidor', JSON.stringify(await p.evaluate(() => HEM_SIDOR.pages())) === '["admin","hem","extra"]');
  const adm2 = await p.evaluate(() => { HEM_SIDOR.go('admin', false); return Array.from(document.querySelectorAll('.td-sida[data-sida="admin"] .icon')).map(n => n.textContent.trim()); });
  ok('admin: ingen Åkeridata/Löner/Bilar', !adm2.some(t => /Åkeridata|Löner|Bilar/.test(t)) && adm2.some(t => /Ärenden/.test(t)), adm2.join(','));
  await p.close();

  // 4) Platta liggande
  p = await openHome({ width: 1280, height: 800, theme: 'dark' });
  await swipe(p, 1000, 500, 500, 505);
  ok('platta: svep till sida 2', await sida(p) === 'extra' && await onPage(p, 'extra'));
  await p.screenshot({ path: path.join(out, '12-platta-sida2.png') });
  await p.evaluate(() => HEM_SIDOR.go('hem', false)); await sleep(100);
  await p.click('#td-dots .td-lada-btn'); await sleep(450);
  await p.screenshot({ path: path.join(out, '13-platta-applada.png') });
  ok('platta: lådan öppen', await drawerOpen(p), await dstate(p));
  ok('inga JS-fel (platta)', !p._errs.length, p._errs.join(' | '));
  await p.close();

  await br.close(); server.close();
  console.log(fails.length ? 'FAILS ' + fails.length : 'HEM_SIDOR_E2E_OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
