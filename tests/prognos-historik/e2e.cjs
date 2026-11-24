'use strict';
// Webbläsartest: Prognos › Historik (t1809u/t1811u/t1812u/t1813u/t1814u).
// - Historik-filerna (helgdagar.js, prognos-historik.js/.css) och RPC:erna laddas INTE vid appstart eller när Prognos öppnas,
//   bara när fliken Historik öppnas.
// - Flikraden är en rad (svepbar om den inte får plats), aktiv flik syns. Filter och Notiser på egen rad (t1820u).
// - Övriga flikar fungerar som förut.
// Kör: node tests/prognos-historik/e2e.cjs [utmapp]
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
const outDir = process.argv[2] || '/tmp/ph-shots';
fs.mkdirSync(outDir, { recursive: true });
const core = fs.readFileSync(path.join(root, 'tests/meddelanden/fixtures.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-data.json'), 'utf8'));
const mime = f => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.png') ? 'image/png' : 'text/html';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURI(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', mime(file)); res.end(b); });
});
const fails = [];
const ok = (n, c, e) => { if (!c) { fails.push(n + (e ? ': ' + e : '')); console.log('FAIL', n, e || ''); } else console.log('OK', n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HIST_RE = /helgdagar\.js|prognos-historik\.(js|css)|rpc\/prognos_historik/;

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });

  async function open(width, height, theme) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.setRequestInterception(true);
    p._reqs = [];
    p.on('request', q => { p._reqs.push(q.url()); q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }); });
    p._errs = []; p.on('pageerror', e => p._errs.push(String(e)));
    await p.evaluateOnNewDocument((core, data, theme) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
      localStorage.setItem('hb_char_900001', 'off');
      window.TEST_ROLE = 'standard';
      (0, eval)(core);
      var stub = window.fetch;
      window.__rpc = [];
      var J = function (o) { return Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })); };
      window.fetch = function (url, init) {
        var u = String(url), m = u.match(/rpc\/([a-z_]+)/);
        if (m) window.__rpc.push(m[1]);
        if (/rpc\/prognos_historik_flyg/.test(u)) return J({ rows: data.flyg, cov: [] });
        if (/rpc\/prognos_historik/.test(u)) {
          var z = JSON.parse(init.body).p_zone;
          return J(z === 'morgon' ? { zone: z, rows: data.morgon } : { zone: z, rows: data.hist[z] || [] });
        }
        if (/rpc\/prognos_status/.test(u)) return J({ last_ok_at: new Date().toISOString(), status: 'ok' });
        if (/rpc\/(watch_list|route_watch_list|tag_villkor_get|watch_route_list|prognos_list_bookings|prognos_zones|prognos_watch_list|prognos_report_history)/.test(u)) return J([]);
        return stub.apply(this, arguments);
      };
    }, core, data, theme);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForFunction(() => typeof window.openItem === 'function' && document.querySelector('#app .grid'), { timeout: 20000 });
    return p;
  }
  const histReqs = p => p._reqs.filter(u => HIST_RE.test(u)).concat(p._rpcs || []);
  const rpcHist = p => p.evaluate(() => window.__rpc.filter(n => /^prognos_historik/.test(n)));
  // Laddade filer enligt webbläsaren (fångar även service worker/cache) + nätverksförfrågningar
  const loaded = async p => (await p.evaluate(() => performance.getEntriesByType('resource').map(e => e.name))).concat(p._reqs);
  const histLoaded = async p => (await loaded(p)).filter(u => HIST_RE.test(u));

  for (const [w, h, theme, tag] of [[412, 915, 'dark', 'p412d'], [412, 915, 'light', 'p412l'], [345, 740, 'dark', 'p345d'], [915, 412, 'dark', 'l915d'], [740, 345, 'light', 'l740l'], [1024, 600, 'dark', 't1024d'], [800, 1280, 'light', 't800l']]) {
    const p = await open(w, h, theme);
    await sleep(600);
    if (tag === 'p412d') fs.writeFileSync(path.join(outDir, 'start-resources.txt'), (await p.evaluate(() => performance.getEntriesByType('resource').map(e => e.name.replace(location.origin, '') + ' ' + (e.transferSize || e.encodedBodySize || 0)))).join('\n'));
    ok(tag + ': appstart laddar ingen Historik', (await histLoaded(p)).length === 0 && (await rpcHist(p)).length === 0);
    await p.evaluate(() => openItem('prognos'));
    await p.waitForSelector('.pg-tabs', { timeout: 20000 });
    await sleep(800);
    ok(tag + ': Prognos öppen laddar ingen Historik', (await histLoaded(p)).length === 0 && (await rpcHist(p)).length === 0, (await histLoaded(p)).join(','));
    const row = await p.evaluate(() => { const r = document.querySelector('.pg-tabs'); const t = [...r.querySelectorAll('.pg-tab')]; return { one: t.every(x => x.offsetTop === t[0].offsetTop), n: t.length, labels: t.map(x => x.textContent), sw: r.scrollWidth, cw: r.clientWidth, fade: r.className }; });
    ok(tag + ': flikar på en rad (' + row.labels.join('/') + ')', row.one && row.labels.includes('Historik') && !row.labels.some(l => /Filter|Notiser/.test(l)), JSON.stringify(row));
    { const tr = await p.evaluate(() => { const r = document.querySelector('.pg-tabs').getBoundingClientRect(); const b = [...document.querySelectorAll('.pg-tools .pg-tool')].map(x => x.getBoundingClientRect()); return { n: b.length, below: b.every(x => x.top >= r.bottom - 1), same: b.length === 2 && Math.abs(b[0].top - b[1].top) < 2, inside: b.every(x => x.left >= 0 && x.right <= innerWidth + 1) }; });
      ok(tag + ': Filter + Notiser på egen rad', tr.n === 2 && tr.below && tr.same && tr.inside, JSON.stringify(tr)); }
    // Schema/Morgon/Original/Filter/Notiser fungerar fortfarande
    for (const pn of ['morgon', 'original', 'filter', 'notis', 'schema']) {
      await p.click('[data-panel="' + pn + '"]'); await sleep(250);
      const on = await p.evaluate(() => { const e = document.querySelector('.pg-tab.on, .pg-tool.on'); return e && e.getAttribute('data-panel'); });
      ok(tag + ': flik ' + pn, on === pn);
    }
    // Kategorier: Alla-chip först, som för zoner (t1833u)
    { await p.click('[data-panel="filter"]'); await sleep(250);
      const cs = () => p.evaluate(() => ({ chips: [...document.querySelectorAll('[data-cat]')].map(b => b.textContent), on: [...document.querySelectorAll('[data-cat].on')].map(b => b.getAttribute('data-cat')), ls: localStorage.getItem('prognos_cats') }));
      const cc = async k => { await p.evaluate(k => document.querySelector('[data-cat="' + k + '"]').click(), k); await sleep(150); return cs(); };
      let c = await cs();
      ok(tag + ': Kategorier har Alla först och tänd', c.chips[0] === 'Alla' && c.on.join() === '*', JSON.stringify(c));
      const k1 = await p.evaluate(() => document.querySelectorAll('[data-cat]')[1].getAttribute('data-cat'));
      const k2 = await p.evaluate(() => document.querySelectorAll('[data-cat]')[2].getAttribute('data-cat'));
      c = await cc(k1); ok(tag + ': kategori från Alla = bara den', c.on.join() === k1, JSON.stringify(c));
      c = await cc(k2); ok(tag + ': lägg till kategori', c.on.length === 2 && !c.on.includes('*'));
      c = await cc('*'); ok(tag + ': Alla visar alla igen', c.on.join() === '*');
      c = await cc(k1); c = await cc(k1); ok(tag + ': sista kategori bort = Alla', c.on.join() === '*');
      if (tag === 'p412d') { await cc(k1); await p.screenshot({ path: path.join(outDir, tag + '-kat-en.png') }); await cc('*'); await p.screenshot({ path: path.join(outDir, tag + '-kat-alla.png') }); }
      await p.click('[data-panel="schema"]'); await sleep(250); }
    ok(tag + ': fortfarande ingen Historik efter övriga flikar', (await histLoaded(p)).length === 0 && (await rpcHist(p)).length === 0);
    if (tag === 'p412d' || tag === 'p412l' || tag === 'l915d' || tag === 't800l') await p.screenshot({ path: path.join(outDir, tag + '-schema-tabs.png') });
    await p.click('[data-panel="historik"]');
    await p.waitForSelector('.ph-kpis', { timeout: 20000 });
    await sleep(500);
    const st = await p.evaluate(() => { const r = document.querySelector('.pg-tabs'); const a = r.querySelector('.pg-tab.on'); const ar = a.getBoundingClientRect(), rr = r.getBoundingClientRect(); return { vis: ar.left >= rr.left - 1 && ar.right <= rr.right + 1, kpi: document.querySelector('.ph-kpis').textContent, bars: document.querySelectorAll('rect.ph-bar').length, hm: document.querySelectorAll('rect.ph-hm').length, wide: document.documentElement.scrollWidth <= innerWidth + 1 }; });
    ok(tag + ': aktiv flik Historik syns', st.vis);
    ok(tag + ': staplar + värmekarta', st.bars > 0 && st.hm === 168, JSON.stringify(st));
    ok(tag + ': ingen sidscroll i sidled', st.wide);
    { const rh = await rpcHist(p); const js = (await loaded(p)).some(u => /prognos-historik\.js/.test(u)); ok(tag + ': Historik laddad vid flikbyte', js && rh.includes('prognos_historik'), 'js=' + js + ' rpc=' + rh.join(',')); }
    { const sc = await p.evaluate(async () => { const se = document.scrollingElement; se.scrollTop = 600; await new Promise(r => setTimeout(r, 100)); const y = se.scrollTop || window.scrollY; const ins = [...document.querySelectorAll('main, #content')].map(e => e.scrollTop); return { y, ins, h: se.scrollHeight, ih: innerHeight }; });
      ok(tag + ': sidan går att rulla', sc.y > 0 || sc.ins.some(v => v > 0) || sc.h <= sc.ih + 2, JSON.stringify(sc)); await p.evaluate(() => window.scrollTo(0, 0)); }
    // flygtopplista
    await p.waitForSelector('.ph-flrow', { timeout: 10000 });
    await p.evaluate(() => document.querySelector('.ph-fl').scrollIntoView());
    await p.click('.ph-flrow'); await sleep(200);
    ok(tag + ': flyg detalj', await p.evaluate(() => !!document.querySelector('.ph-fldet') && /landade/.test(document.querySelector('.ph-fldet').textContent)));
    // avmarkera (t1832u): flyg stängs vid tryck utanför; värmekartan: tryck igen / utanför nollställer
    await p.evaluate(() => document.querySelector('.ph-kpis').click()); await sleep(200);
    ok(tag + ': flyg stängs vid tryck utanför', await p.evaluate(() => !document.querySelector('.ph-fldet')));
    const rd = () => p.evaluate(() => document.querySelector('.ph-readout').textContent);
    const hmClick = () => p.evaluate(() => document.querySelector('rect.ph-hm[data-ph-hm="2,15"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await hmClick(); await sleep(200);
    ok(tag + ': värmekarta vald', /snitt/.test(await rd()) && await p.evaluate(() => !!document.querySelector('rect.ph-hm.on')));
    await hmClick(); await sleep(200);
    ok(tag + ': värmekarta avmarkeras vid nytt tryck', /Tryck på en ruta/.test(await rd()) && await p.evaluate(() => !document.querySelector('rect.ph-hm.on')));
    await hmClick(); await sleep(200);
    await p.evaluate(() => document.querySelector('.ph-readout').closest('.pg-card').querySelector('h3').click()); await sleep(200);
    ok(tag + ': värmekarta avmarkeras vid tryck i kortet', /Tryck på en ruta/.test(await rd()));
    await hmClick(); await sleep(200);
    await p.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await sleep(200);
    ok(tag + ': värmekarta avmarkeras vid tryck utanför sidan', /Tryck på en ruta/.test(await rd()));
    { const sel0 = await p.evaluate(() => document.querySelector('rect.ph-bar.on').getAttribute('data-ph-sel'));
      await p.evaluate(() => { const b = document.querySelectorAll('rect.ph-bar'); b[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(200);
      const sel1 = await p.evaluate(() => document.querySelector('rect.ph-bar.on').getAttribute('data-ph-sel'));
      await p.evaluate(() => document.querySelector('rect.ph-bar.on').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await sleep(200);
      const sel2 = await p.evaluate(() => document.querySelector('rect.ph-bar.on').getAttribute('data-ph-sel'));
      ok(tag + ': stapel tryck igen = tillbaka till förvald dag', sel1 !== sel0 && sel2 === sel0, [sel0, sel1, sel2].join(' ')); }
    await p.evaluate(() => window.scrollTo(0, 0)); await sleep(150);
    // tryck stapel
    await p.evaluate(() => { const b = document.querySelectorAll('rect.ph-bar'); b[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(200);
    await p.click('[data-ph-m="andel"]'); await sleep(150);
    ok(tag + ': Andel', await p.evaluate(() => document.querySelector('[data-ph-m="andel"]').classList.contains('on')));
    await p.click('[data-ph-m="antal"]'); await sleep(150);
    await p.evaluate(() => { const b = document.querySelectorAll('rect.ph-bar'); b[b.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(200);
    await p.evaluate(() => window.scrollTo(0, 0)); await sleep(150);
    await p.screenshot({ path: path.join(outDir, tag + '-historik.png') });
    if (tag === 'p412d' || tag === 'p412l') {
      await p.evaluate(() => document.querySelector('.ph-fl').scrollIntoView()); await sleep(200);
      await p.screenshot({ path: path.join(outDir, tag + '-flyg.png') });
      await p.click('[data-ph-z="morgon"]'); await p.waitForSelector('.ph-kpis'); await sleep(300);
      await p.evaluate(() => { document.querySelector('[data-ph-wd="-1"]').click(); }); await sleep(300);
      await p.evaluate(() => window.scrollTo(0, 0)); await sleep(150);
      await p.screenshot({ path: path.join(outDir, tag + '-morgon.png') });
      ok(tag + ': Morgon höstlov-band', await p.evaluate(() => document.querySelectorAll('rect.ph-lov').length > 0));
    }
    // tillbaka till Schema fungerar
    await p.click('[data-panel="schema"]'); await sleep(300);
    ok(tag + ': tillbaka till Schema', await p.evaluate(() => document.querySelector('.pg-tab.on').getAttribute('data-panel') === 'schema'));
    ok(tag + ': inga JS-fel', p._errs.length === 0, p._errs.join(' | '));
    await p.close();
  }
  await br.close(); server.close();
  console.log(fails.length ? 'FAILS: ' + fails.length : 'ALLA OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
