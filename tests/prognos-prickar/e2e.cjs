'use strict';
// Webbläsartest + förhandsbilder: aktivitetsprickar i Prognos (2026-11-13prick2, t1571u).
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
  ok('cache prognos.js', /prognos\.js\?v=(20261113prick2|20261113barn1|20261113sedd1|20261113hem1|20261113avs1|20261114kp1)/.test(lv));
  ok('cache lazy-views.js', /lazy-views\.js\?v=(20261113prick2|20261113barn1|20261113sedd1|20261113hem1|20261113avs1|20261114kp1)/.test(fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8')));
  const pj = fs.readFileSync(path.join(root, 'TaxiData/prognos.js'), 'utf8');
  ok('kundtid-testet borta ur Prognos', !/pg-kt-btn|ktBar|rpc\('sadmin_kundtid_get'/.test(pj) && /function ktApply\(list\) \{ return list; \}/.test(pj));
  const e = cl.split("id: '2026-11-13prick2'")[1].split(']},')[0];
  ok('nyhet utan tid, utan Stig/hen', !/tid: '(?!\d\d:\d\d')/.test(e) && !/\bStig\b|\bhen\b/.test(e));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Syntetiska bokningar: två nya (Essity 161, Landvetter 293), resten gamla.
function bookings(now) {
  const iso = ms => new Date(ms).toISOString();
  const mk = (id, zone, cat, inMin, obsAgoMin) => ({ id, zone_id: zone, zone_name: zone, category: cat, estimated_at: iso(now + inMin * 60000), observed_at: iso(now - obsAgoMin * 60000), block_index: 0, current_block: 0, confidence: 'saker', status: 'open', addons: [] });
  const l = [mk(1, '161', 'app', 25, 10), mk(2, '161', 'elbil', 55, 120), mk(3, '293', 'storbil', 40, 5), mk(4, '293', 'app', 70, 200), mk(5, '163', 'app', 35, 300), mk(6, '163', 'ovrigt', 85, 240)];
  l[3].addons = ['barnstol'];   // gammal Kombi med barnstol i 293 (ska inte få någon rosa prick, 2026-11-13barn1)
  return l;
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
  // Inget tomrum ovanför rutnätet (spacern borttagen 2026-11-13): flikarna ligger direkt under rubriken.
  for (const [w, h, mobile, label] of [[1280, 800, false, 'platta-liggande-utan-tomrum'], [1340, 800, false, 'platta-1340-utan-tomrum'], [390, 844, true, 'telefon-staende-utan-tomrum']]) {
    const p = await open(w, h, mobile);
    await p.evaluate(() => openItem('prognos'));
    await p.waitForSelector('.pg-tabs', { timeout: 20000 });
    await sleep(900);
    const g = await p.evaluate(() => { const hd = document.querySelector('header'), t = document.querySelector('.pg-tabs'), sp = document.querySelector('.pg-land-spacer');
      return { gap: Math.round(t.getBoundingClientRect().top - (hd ? hd.getBoundingClientRect().bottom : 0)), spacer: !!sp, y: scrollY, land: document.body.classList.contains('pg-land') }; });
    ok(label + ': inget tomrum ovanför (gap ' + g.gap + ' px)', g.gap < 40 && !g.spacer && g.y === 0, JSON.stringify(g));
    if (w > h) ok(label + ': liggande läge', g.land, JSON.stringify(g));
    await p.screenshot({ path: path.join(out, label + '.png') });
    ok(label + ': inga sidfel', !p._errs.length, p._errs.join(' | '));
    await p.close();
  }
  // Ingen rosa barnstol/babyskydd-prick och ingen sådan rad i förklaringen (2026-11-13barn1, t1577u).
  {
    const p = await open(390, 844, true);
    await p.evaluate(() => openItem('prognos'));
    await p.waitForSelector('.pg-ztab', { timeout: 20000 });
    await sleep(700);
    await p.evaluate(() => { const b = document.querySelector('.pg-ztab[data-ztab="293"]'); if (b) b.click(); });
    await sleep(700);
    const r = await p.evaluate(() => {
      const lg = document.querySelector('.pg-legend');
      const after = [...document.querySelectorAll('.pg-n')].map(n => getComputedStyle(n, '::after')).filter(c => c.content !== 'none' && c.backgroundColor === 'rgb(213, 63, 140)').length;
      return { legend: lg ? lg.textContent : '', addon: document.querySelectorAll('.pg-addon').length, pink: after,
        childCells: [...document.querySelectorAll('td.pg-td-child .pg-n')].length, newDots: document.querySelectorAll('.pg-new-dot').length,
        warn: (document.querySelector('.pg-warn') || {}).textContent || '', repBtn: document.querySelectorAll('.pg-warn button, .pg-rep-btn').length, kt: document.querySelectorAll('.pg-kt, #pg-kt-btn').length, status: (document.querySelector('.pg-status') || {}).textContent || '' };
    });
    ok('barn: ingen barnstol/babyskydd i förklaringen', !/barnstol|babyskydd/i.test(r.legend) && /blandat/.test(r.legend), r.legend);
    ok('barn: ingen rosa prick', r.addon === 0 && r.pink === 0, JSON.stringify(r));
    ok('barn: barnstolsspalten visar bokningen', r.childCells >= 1, JSON.stringify(r));
    ok('rapport: rutan kvar utan Rapportera fel-knapp', /uppskattade och ungefärliga/.test(r.warn) && !/Rapportera/.test(r.warn) && r.repBtn === 0, JSON.stringify({ warn: r.warn, repBtn: r.repBtn }));
    ok('status: ingen flygtid i 293', !/flyg/i.test(r.status) && /Senaste uppdatering/.test(r.status), r.status);
    ok('kundtid: ingen testruta', r.kt === 0, String(r.kt));
    ok('barn: aktivitetsprickar kvar', r.newDots >= 1, JSON.stringify(r));
    await p.screenshot({ path: path.join(out, 'utan-barnstolsprick.png') });
    ok('barn: inga sidfel', !p._errs.length, p._errs.join(' | '));
    await p.close();
  }
  // Prickar: syns på zoner med nytt; öppnar man en zon och lämnar den är zonens prickar sedda
  // (2026-11-13sedd1, t1583u) och kommer inte tillbaka efter omladdning. Ny aktivitet får prick igen.
  const zt = (p, z) => p.evaluate(z => { const b = document.querySelector('.pg-ztab[data-ztab="' + z + '"]'); if (b) b.click(); }, z);
  const reopen = async p => {
    await p.evaluate(() => { PROGNOS.stop(); return openItem('prognos'); });
    await p.waitForSelector('.pg-ztab', { timeout: 20000 }); await sleep(800);
  };
  for (const [w, h, mobile, label] of [[1280, 800, false, 'platta-liggande'], [390, 844, true, 'telefon-staende']]) {
    const p = await open(w, h, mobile);
    await p.evaluate(() => localStorage.setItem('prognos_zone_tab', '163'));   // börja i en zon utan nytt
    await p.evaluate(() => openItem('prognos'));
    await p.waitForSelector('.pg-ztab', { timeout: 20000 });
    await sleep(800);
    let s = await state(p);
    ok(label + ': prick på zon 161 och 293', JSON.stringify(s.zones) === JSON.stringify(['161', '293']) && s.cur === '163', JSON.stringify(s));
    await zt(p, '161'); await sleep(500);
    s = await state(p);
    ok(label + ': prickar kvar medan zon 161 är öppen', JSON.stringify(s.zones) === JSON.stringify(['161', '293']) && s.cur === '161' && s.cells === 1, JSON.stringify(s));
    await p.screenshot({ path: path.join(out, label + '-161.png') });
    await zt(p, '163'); await sleep(500);
    s = await state(p);
    ok(label + ': lämnat 161 -> zonprick och bokningsprick borta, 293 kvar', JSON.stringify(s.zones) === JSON.stringify(['293']) && s.cur === '163' && s.cells === 0, JSON.stringify(s));
    let ls = await p.evaluate(() => [localStorage.getItem('prognos_newids_900001'), localStorage.getItem('prognos_seenids_900001')]);
    ok(label + ': sedd sparad per bokning', ls[0] === '{"3":1}' && ls[1] === '{"1":1}', JSON.stringify(ls));
    await zt(p, '161'); await sleep(400);
    s = await state(p);
    ok(label + ': tillbaka i 161 -> ingen bokningsprick', s.cur === '161' && s.cells === 0 && JSON.stringify(s.zones) === JSON.stringify(['293']), JSON.stringify(s));
    // Lämna Prognos och öppna igen (samma lagring som efter omladdning): 161 förblir sedd.
    await zt(p, '163'); await sleep(300);
    await reopen(p);
    s = await state(p);
    ok(label + ': efter återöppning bara 293', JSON.stringify(s.zones) === JSON.stringify(['293']), JSON.stringify(s));
    // Öppna 293 och lämna Prognos direkt därifrån -> 293 sedd.
    await zt(p, '293'); await sleep(400);
    s = await state(p);
    ok(label + ': prick på ny bokning i 293 medan den är öppen', s.cur === '293' && s.cells === 1, JSON.stringify(s));
    await reopen(p);
    s = await state(p);
    ok(label + ': lämnat Prognos från 293 -> inga prickar', s.zones.length === 0 && s.cells === 0, JSON.stringify(s));
    // Ny aktivitet efter detta -> prick igen (zon 161 och bokningen).
    await p.evaluate(() => { const n = new Date(Date.now() + 1000).toISOString(); window.__bk = window.__bk.concat([{ id: 7, zone_id: '161', zone_name: '161', category: 'app', estimated_at: new Date(Date.now() + 45 * 60000).toISOString(), observed_at: n, block_index: 0, current_block: 0, confidence: 'saker', status: 'open', addons: [] }]); });
    await sleep(1200);
    await p.evaluate(() => PROGNOS.refresh()); await sleep(800);
    s = await state(p);
    ok(label + ': ny bokning -> prick på 161 igen', JSON.stringify(s.zones) === JSON.stringify(['161']), JSON.stringify(s));
    await zt(p, '161'); await sleep(400);
    s = await state(p);
    ok(label + ': ny bokning har prick, den sedda inte', s.cells === 1, JSON.stringify(s));
    // Bokningen försvinner ur listan -> pricken försvinner av sig själv, och sedd-listan glömmer bokning 1.
    await p.evaluate(() => { window.__bk = window.__bk.filter(b => b.id !== 7 && b.id !== 1); return PROGNOS.refresh(); });
    await sleep(800);
    s = await state(p);
    ls = await p.evaluate(() => [localStorage.getItem('prognos_newids_900001'), localStorage.getItem('prognos_seenids_900001')]);
    ok(label + ': prick borta när bokningen försvann', s.zones.length === 0 && s.cells === 0 && ls[0] === '{}' && !/"1"/.test(ls[1]), JSON.stringify({ s, ls }));
    ok(label + ': ingen automatisk rullning', (await p.evaluate(() => scrollY)) === 0);
    await p.screenshot({ path: path.join(out, label + '-sedd.png') });
    ok(label + ': inga sidfel', !p._errs.length, p._errs.join(' | '));
    await p.close();
  }
  await br.close(); server.close();
  if (fails.length) { console.log('PROGNOS_PRICKAR_FAIL ' + fails.length); process.exit(1); }
  console.log('PROGNOS_PRICKAR_E2E_OK');
})().catch(e => { console.error(e); process.exit(1); });
