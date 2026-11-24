// Mina bevakningar (t1838u–t1840u): infobox vid tryck, Ljud och notiser i en ruta, en vy Dag → Vecka → Månad.
// Syntetiska data (fixtures.js, klockan låst 2026-11-06 18:00 svensk tid). Alla externa anrop fångas.
// Kör: node tests/bevakningar/vyer-infobox.cjs [utmapp] [bas-url]
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
function pp() { for (const c of [path.resolve(__dirname, '../meddelanden/node_modules/puppeteer-core'), '/workspace/tk-login-20261118/tests/meddelanden/node_modules/puppeteer-core']) { try { return require(c); } catch (e) {} } throw new Error('puppeteer-core saknas'); }
const puppeteer = pp();
const root = path.resolve(__dirname, '../..'), out = process.argv[2] || '/tmp/mb-vyer'; fs.mkdirSync(out, { recursive: true });
const core = fs.readFileSync(path.join(root, 'tests/meddelanden/fixtures.js'), 'utf8'), fx = fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8');
const server = http.createServer((req, res) => { const file = path.resolve(root, '.' + decodeURI(req.url.split('?')[0])); if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); } fs.readFile(file, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(b); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0; const fails = []; const check = (x, msg) => { if (x) { checks++; console.log('OK', msg); } else { fails.push(msg); console.log('FAIL', msg); } };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = process.argv[3] || `http://127.0.0.1:${server.address().port}`;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    for (const [w, h, theme, tag] of [[350, 760, 'dark', 'p350d'], [412, 915, 'light', 'p412l'], [800, 420, 'dark', 'l800d']]) {
      const p = await br.newPage(); const errors = [];
      await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); p.on('pageerror', e => errors.push(e.message));
      await p.setRequestInterception(true); p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
      await p.evaluateOnNewDocument((core, fx, theme) => {
        if (!sessionStorage.getItem('mb_init')) { localStorage.clear(); sessionStorage.setItem('mb_init', '1'); }
        localStorage.setItem('taxi_session', 'synthetic-test-fixture'); localStorage.setItem('taxi_driver', '900001'); localStorage.setItem('taxi_theme', theme); localStorage.setItem('taxi_logged_in', '1'); localStorage.setItem('hb_char_900001', 'off');
        window.TEST_ROLE = 'standard'; (0, eval)(core); (0, eval)(fx);
        // Christians fall: två tåg från Stockholm C nästan samtidigt (20:47 och 21:00)
        const iso = (hh, mm) => new Date(Date.UTC(2026, 10, 6, hh - 1, mm)).toISOString();
        WATCH_TEST.trains.push({ dir: 'ANK', id: '443', sched: iso(20, 47), est: iso(20, 55), other: 'Stockholm C', track: '3', product: 'SJ Regional' }, { dir: 'ANK', id: '2011', sched: iso(21, 0), other: 'Stockholm C', canceled: true, product: 'SJ Snabbtåg' });
        WATCH_TEST.watches.push({ kind: 'tag', ident: '443', sched: iso(20, 47), label: 'Stockholm C', expires_at: iso(23, 0), state: {} }, { kind: 'tag', ident: '2011', sched: iso(21, 0), label: 'Stockholm C', expires_at: iso(23, 0), state: {} });
      }, core, fx, theme);
      await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0' });
      await p.waitForSelector('#app', { visible: true });
      await p.evaluate(() => openItem('mina-bevakningar'));
      await p.waitForSelector('.mb-block');
      const noX = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      check(await p.evaluate(() => !document.querySelector('[data-mb-view]') && document.querySelector('.mb-unit b').textContent === 'Dag'), tag + ': en vy, Dag som förval (inga Tidslinje/Schema-flikar)');
      check(await p.evaluate(() => { const u = document.querySelector('.mb-unit').getBoundingClientRect(); return u.right > innerWidth - 60; }), tag + ': vybytet uppe till höger');
      // Infobox
      const openInfo = async sel => { await p.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await sleep(80); await p.click(sel); await p.waitForSelector('.mb-info'); };
      const tgt = await p.evaluate(() => { const b = [...document.querySelectorAll('.mb-block-open')].find(e => /Tåg 443/.test(e.getAttribute('aria-label'))); return b ? b.getAttribute('data-mb-open') : null; });
      await openInfo('[data-mb-open="' + tgt + '"]');
      const info = await p.$eval('.mb-info', e => e.textContent);
      check(/Tåg 443/.test(info) && /Planerad20:47/.test(info) && /Beräknad20:55/.test(info) && /Spår3/.test(info) && /8 min sen/.test(info) && /Göteborg C/.test(info) && /SJ Regional/.test(info), tag + ': infobox tåg med alla fält ' + info.slice(0, 160));
      check(await p.evaluate(() => document.getElementById('title').textContent === 'Mina bevakningar'), tag + ': stannar i Mina bevakningar');
      check(await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.mb-info')), d = getComputedStyle(document.querySelector('.mb-info-kv dd')); return s.backgroundColor !== d.color; }), tag + ': kontrast i infoboxen (text ≠ bakgrund)');
      if (tag !== 'l800d') await p.screenshot({ path: path.join(out, 'mb-infobox-' + tag + '.png') });
      await p.click('[data-mb-info-close]'); await sleep(120); check(await p.evaluate(() => !document.querySelector('.mb-info')), tag + ': ✕ stänger');
      await openInfo('[data-mb-open="' + tgt + '"]'); await p.evaluate(() => { const s = document.querySelector('[data-mb-info-shade]'); s.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(120);
      check(await p.evaluate(() => !document.querySelector('.mb-info')), tag + ': tryck utanför stänger');
      await openInfo('[data-mb-open="' + tgt + '"]'); await p.evaluate(() => history.back()); await sleep(400);
      check(await p.evaluate(() => !document.querySelector('.mb-info') && document.getElementById('title').textContent === 'Mina bevakningar'), tag + ': bakåt stänger rutan och stannar på sidan');
      const t2 = await p.evaluate(() => { const b = [...document.querySelectorAll('.mb-block-open')].find(e => /Tåg 2011/.test(e.getAttribute('aria-label'))); return b.getAttribute('data-mb-open'); });
      await openInfo('[data-mb-open="' + t2 + '"]');
      check(/Inställt/.test(await p.$eval('.mb-info', e => e.textContent)), tag + ': inställt tåg visas');
      await p.click('[data-mb-info-close]'); await sleep(100);
      const fl = await p.evaluate(() => { const b = [...document.querySelectorAll('.mb-block-open')].find(e => /TEST42/.test(e.getAttribute('aria-label'))); return b.getAttribute('data-mb-open'); });
      await openInfo('[data-mb-open="' + fl + '"]');
      check(/Flygnummer/.test(await p.$eval('.mb-info', e => e.textContent)) && /Landat/.test(await p.$eval('.mb-info', e => e.textContent)), tag + ': infobox flyg');
      await p.click('.mb-info [data-mb-src]'); await p.waitForFunction(() => document.getElementById('title').textContent === 'Ankomster', { timeout: 8000 }).catch(() => {});
      check(await p.evaluate(() => document.getElementById('title').textContent === 'Ankomster'), tag + ': Visa i Ankomster leder till källsidan');
      await p.evaluate(() => openItem('mina-bevakningar')); await p.waitForSelector('.mb-block');
      await p.$eval('[data-mb-menu]', e => e.scrollIntoView({ block: 'center' })); await p.click('[data-mb-menu]'); await sleep(120);
      check(await p.evaluate(() => !!document.querySelector('[data-mb-cancel]') && !document.querySelector('.mb-info')), tag + ': ⋯-menyn fungerar som förut');
      await p.click('[data-mb-cancel]'); await sleep(100);
      // Ljud och notiser
      check(await p.evaluate(() => { const b = document.querySelector('[data-mb-lj-toggle]'); return b.getAttribute('aria-expanded') === 'false' && /Notis:.*Ljud:/.test(b.textContent); }), tag + ': Ljud och notiser hopfälld med sammanfattning');
      await p.evaluate(() => window.scrollTo(0, 0)); await p.click('[data-mb-lj-toggle]'); await sleep(150);
      const lj = await p.evaluate(() => [...document.querySelectorAll('.mb-lj-row')].map(r => { const b = r.getBoundingClientRect(); return { h: Math.round(b.height), ok: b.right <= innerWidth }; }));
      check(lj.length === 4 && lj.every(x => x.h <= 46 && x.ok), tag + ': 4 rader utan radbrytning ' + JSON.stringify(lj));
      await p.click('[data-mb-lj-ljud="flyg"]'); await sleep(100);
      check(await p.evaluate(() => JSON.parse(localStorage.getItem('taxi_bev_ljud')).flyg === false && document.querySelector('[data-mb-lj-ljud="flyg"]').getAttribute('aria-pressed') === 'false'), tag + ': flygljud av sparas i samma nyckel');
      await p.click('[data-mb-lj-ljud="flyg"]'); await sleep(100);
      await p.click('[data-mb-lj-notis="bat"]'); await sleep(100);
      check(await p.evaluate(() => JSON.parse(localStorage.getItem('taxi_notis_enhet')).bat === false), tag + ': båtnotis av sparas per enhet');
      await p.click('[data-mb-lj-notis="bat"]'); await sleep(100);
      check(await p.evaluate(() => !!document.querySelector('#mb-lj-tag .tv-card') && !!document.querySelector('#mb-notis-copy button')), tag + ': tågvillkor och Kopiera finns i rutan');
      check(await noX(), tag + ': ingen sidscroll (Ljud)');
      if (tag !== 'l800d') await p.screenshot({ path: path.join(out, 'mb-ljud-' + tag + '.png') });
      await p.click('[data-mb-lj-toggle]'); await sleep(100);
      // Vecka
      await p.click('[data-mb-unit]'); await sleep(200);
      check(await p.evaluate(() => document.querySelector('.mb-unit b').textContent === 'Vecka' && document.querySelectorAll('.mb-wk-col').length === 7 && !!document.querySelector('.mb-wk-dh.today') && !!document.querySelector('.mb-wk-now')), tag + ': Vecka med 7 kolumner, i dag markerad, nu-linje');
      check(await noX(), tag + ': ingen sidscroll (Vecka)');
      if (tag !== 'l800d') { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(out, 'mb-vecka-' + tag + '.png') }); }
      await p.evaluate(() => document.querySelector('.mb-wk-b').click()); await sleep(150);
      check(await p.evaluate(() => !!document.querySelector('.mb-info')), tag + ': block i Vecka öppnar infobox');
      await p.click('[data-mb-info-close]'); await sleep(100);
      const wkLabel = await p.$eval('.mb-days b', e => e.textContent);
      await p.click('.mb-wk-dh.today'); await sleep(200);
      check(await p.evaluate(() => document.querySelector('.mb-unit b').textContent === 'Dag' && /Tillbaka till vecka/.test(document.querySelector('[data-mb-backunit]').textContent)), tag + ': dag från Vecka visar Tillbaka till vecka');
      await p.click('[data-mb-backunit]'); await sleep(150);
      check(await p.evaluate(() => document.querySelector('.mb-unit b').textContent) === 'Vecka' && (await p.$eval('.mb-days b', e => e.textContent)) === wkLabel, tag + ': tillbaka till samma vecka');
      await p.click('[data-mb-step="1"]'); await sleep(100); await p.click('.mb-wk-dh'); await sleep(150);
      await p.evaluate(() => history.back()); await sleep(400);
      check(await p.evaluate(() => document.querySelector('.mb-unit b').textContent === 'Vecka' && document.getElementById('title').textContent === 'Mina bevakningar'), tag + ': bakåt-svep tillbaka till vecka');
      await p.click('[data-mb-step="-1"]'); await sleep(100);
      // Månad
      await p.click('[data-mb-unit]'); await sleep(200);
      check(await p.evaluate(() => document.querySelector('.mb-unit b').textContent === 'Månad' && document.querySelectorAll('.mb-mday').length >= 28 && !!document.querySelector('.mb-mday.today') && !!document.querySelector('.mb-mmore')), tag + ': Månad med rutnät, i dag inringat, +N till');
      check(await noX(), tag + ': ingen sidscroll (Månad)');
      if (tag !== 'l800d') { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(out, 'mb-manad-' + tag + '.png') }); }
      await p.click('.mb-mday.today'); await sleep(200);
      check(await p.evaluate(() => /Tillbaka till månad/.test(document.querySelector('[data-mb-backunit]').textContent)), tag + ': dag från Månad visar Tillbaka till månad');
      await p.click('[data-mb-backunit]'); await sleep(150);
      check(await p.evaluate(() => localStorage.getItem('taxi_mb_view') === 'manad'), tag + ': vyn sparas');
      await p.reload({ waitUntil: 'networkidle0' }); await p.evaluate(() => openItem('mina-bevakningar')); await p.waitForSelector('.mb-month');
      check(true, tag + ': Månad kvar efter omladdning');
      await p.click('[data-mb-unit]'); await sleep(150);
      check(await p.evaluate(() => document.querySelector('.mb-unit b').textContent === 'Dag'), tag + ': Månad → Dag');
      check(errors.length === 0, tag + ': inga JS-fel ' + errors.join(';'));
      await p.close();
    }
  } finally { await br.close(); server.close(); }
  console.log(fails.length ? 'FAILS: ' + fails.length : 'ALLA OK (' + checks + ')');
  process.exitCode = fails.length ? 1 : 0;
})().catch(e => { console.error(e.stack); server.close(); process.exitCode = 1; });
