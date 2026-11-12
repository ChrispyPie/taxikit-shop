'use strict';
// Hjälpboten pratar bara på sittplatsen efter sista ikonen (2026-11-12 bot1).
// Kör: node tests/hb-perch/shot.cjs [utmapp]   (kräver puppeteer-core och /usr/bin/google-chrome)
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
const out = process.argv[2] || '/workspace/botnere-shots';
fs.mkdirSync(out, { recursive: true });
const core = fs.readFileSync(path.join(root, 'tests/meddelanden/fixtures.js'), 'utf8');
const mime = f => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css'
  : f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURI(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, b) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', mime(file));
    res.end(b);
  });
});
const fails = [];
const ok = (n, c, e) => { if (!c) fails.push(n + (e ? ': ' + e : '')); else console.log('OK', n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RAIN = 'Bip! Det regnar. Paraply rekommenderas. Mina kretsar gillar inte fukt.';

// körs i sidan: var står boten i förhållande till sista ikonen, och vad täcker bubblan
function layoutInPage() {
  const grid = document.querySelector('#app.is-home .grid');
  const items = [...grid.children].filter(n => n.classList.contains('icon') || n.classList.contains('td-slot-empty'))
    .map(n => n.getBoundingClientRect()).filter(r => r.width > 8);
  let last = null;
  for (const r of items) if (!last || r.top > last.top + 4 || (Math.abs(r.top - last.top) <= 4 && r.left > last.left)) last = r;
  const w = document.querySelector('.hb-walker').getBoundingClientRect();
  const bub = document.querySelector('.hb-bubble');
  const b = bub.classList.contains('show') ? bub.getBoundingClientRect() : null;
  const hit = (a, r) => a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top;
  // det som syns i en ikon: symbol och namn (i listläget är själva raden skärmbred)
  const iconRects = [...document.querySelectorAll('#app .grid .icon .emoji, #app .grid .icon .label, #app .grid .td-slot-plus, #app .grid .td-slot-empty .label')]
    .map(n => { const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); return r.width ? r : n.getBoundingClientRect(); });
  return {
    vw: innerWidth, vh: innerHeight,
    last: { l: last.left, t: last.top, r: last.right, b: last.bottom },
    bot: { l: w.left, t: w.top, r: w.right, b: w.bottom },
    perch: HJALPBOT._perch(),
    botOnIcon: iconRects.some(r => hit(w, r)),
    bubble: b && { l: b.left, t: b.top, r: b.right, b: b.bottom, side: bub.getAttribute('data-side') },
    bubbleOnIcon: !!(b && iconRects.some(r => hit(b, r))),
    bubbleOnScreen: !!(b && b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1)
  };
}
function afterLast(L) {
  // samma rad direkt till höger om sista ikonen, eller under den
  const sameRow = L.bot.l >= L.last.r - 2 && L.bot.t < L.last.b && L.bot.b > L.last.t;
  const below = L.bot.t >= L.last.b - 2;
  return sameRow || below;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  async function open({ width, height, layout, reduce, anim = true }) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: 1.5, isMobile: width < 800, hasTouch: true });
    if (reduce) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p._errs = [];
    p.on('pageerror', e => p._errs.push(String(e)));
    await p.evaluateOnNewDocument((core, layout, anim) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', 'light');
      localStorage.setItem('taxi_animationer', JSON.stringify({ on: anim }));
      if (layout) localStorage.setItem('taxi_home_layout', layout);
      localStorage.setItem('hb_char_900001', 'robot');
      // inga spontana tips under testet
      sessionStorage.setItem('hb_last', String(Date.now()));
      window.TEST_ROLE = 'standard';
      (0, eval)(core);
    }, core, layout || '', anim);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
    await p.waitForFunction(() => { const w = document.querySelector('.hb-walker'); return w && getComputedStyle(w).display !== 'none'; }, { timeout: 8000 });
    await sleep(1200);
    return p;
  }

  // ---- 1. telefon stående: sittplats, resa, bubbla ----
  {
    const p = await open({ width: 412, height: 780 });
    let L = await p.evaluate(layoutInPage);
    ok('phone: bot at perch', Math.abs(L.bot.l - L.perch.x) < 2 && Math.abs(L.bot.t - L.perch.y) < 2, JSON.stringify([L.bot, L.perch]));
    ok('phone: perch right after last icon', afterLast(L), JSON.stringify(L));
    ok('phone: bot not on icons at perch', !L.botOnIcon);
    await p.screenshot({ path: path.join(out, 'perch-412.png') });

    // väderresa: svep → in → ut → svep tillbaka → prata
    await p.evaluate(t => HJALPBOT.visit('vader', t), RAIN);
    let bubbleDuringTrip = false, sawAway = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const s = await p.evaluate(() => ({ trip: HJALPBOT._trip(), show: !!document.querySelector('.hb-bubble.show'), pos: HJALPBOT._pos(), perch: HJALPBOT._perch() }));
      const atPerch = Math.abs(s.pos.x - s.perch.x) < 2 && Math.abs(s.pos.y - s.perch.y) < 2;
      if (!atPerch) sawAway = true;
      if (s.show && s.trip.indexOf('sittplats') < 0) bubbleDuringTrip = true;
      if (s.trip.indexOf('in') >= 0 && s.trip.indexOf('ut') < 0 && !sawAway) sawAway = true;
      if (s.trip.indexOf('pratar') >= 0 && s.show) break;
      await sleep(60);
    }
    const trip = await p.evaluate(() => HJALPBOT._trip());
    ok('trip order', JSON.stringify(trip) === JSON.stringify(['svep-till-ikon', 'in', 'ut', 'svep-tillbaka', 'sittplats', 'pratar']), JSON.stringify(trip));
    ok('trip went to the icon', sawAway);
    ok('no bubble en route / on icon', !bubbleDuringTrip);
    ok('trip is brisk (< 4 s)', Date.now() - t0 < 4000, (Date.now() - t0) + ' ms');
    await sleep(250);
    L = await p.evaluate(layoutInPage);
    ok('talks at perch', Math.abs(L.bot.l - L.perch.x) < 2 && Math.abs(L.bot.t - L.perch.y) < 2, JSON.stringify([L.bot, L.perch]));
    ok('bubble shown', !!L.bubble);
    ok('bubble on screen', L.bubbleOnScreen, JSON.stringify(L.bubble));
    ok('bubble does not cover icons', !L.bubbleOnIcon, JSON.stringify(L.bubble));
    ok('bubble under the grid', L.bubble && L.bubble.t >= L.last.t, JSON.stringify(L.bubble));
    await p.screenshot({ path: path.join(out, 'perch-412-vader.png') });

    // bubblan följer boten om den flyttas medan den pratar
    const follow = await p.evaluate(async () => {
      const w = document.querySelector('.hb-walker'), b = document.querySelector('.hb-bubble');
      const start = HJALPBOT._pos();
      HJALPBOT._previewPos(start.x - 120, start.y + 60, 0.6);
      const gaps = [];
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 90));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const wr = w.getBoundingClientRect(), br = b.getBoundingClientRect();
        const side = b.getAttribute('data-side');
        const g = side === 'above' ? wr.top - br.bottom : side === 'below' ? br.top - wr.bottom : side === 'left' ? wr.left - br.right : br.left - wr.right;
        gaps.push(Math.round(g));
      }
      return gaps;
    });
    ok('bubble follows the moving bot', follow.every(g => g >= 4 && g <= 20), JSON.stringify(follow));

    // tryck på bubblan = följ med in i Väder → boten syns kort och hoppar ut genom 🏠
    await p.evaluate(() => { const s = HJALPBOT._perch(); HJALPBOT._previewPos(s.x, s.y, 0); });
    await p.click('.hb-bubble.show');
    await sleep(250);
    const hop1 = await p.evaluate(() => getComputedStyle(document.querySelector('.hb-walker')).display !== 'none');
    await sleep(1500);
    const hop2 = await p.evaluate(() => ({ cur: window.current, shown: getComputedStyle(document.querySelector('.hb-walker')).display !== 'none' }));
    ok('follow into module: bot briefly visible', hop1);
    ok('follow into module: then gone', hop2.cur === 'vader' && !hop2.shown, JSON.stringify(hop2));
    ok('no page errors', p._errs.length === 0, p._errs.join(' | '));
    await p.close();
  }

  // ---- 2. bara hemskärmen; öppna en modul utan att följa ----
  {
    const p = await open({ width: 412, height: 780 });
    await p.evaluate(() => window.openItem('kalender'));
    await sleep(600);
    const shown = await p.evaluate(() => getComputedStyle(document.querySelector('.hb-walker')).display !== 'none');
    ok('home only: hidden in module', !shown);
    await p.close();
  }

  // ---- 3. poke går via sittplatsen, tryck stänger ----
  {
    const p = await open({ width: 412, height: 780 });
    await p.evaluate(() => HJALPBOT._previewPos(30, 500, 0));
    await p.evaluate(() => HJALPBOT.poke());
    await p.waitForFunction(() => document.querySelector('.hb-bubble.show'), { timeout: 4000 });
    const L = await p.evaluate(layoutInPage);
    ok('poke talks at perch', Math.abs(L.bot.l - L.perch.x) < 2 && Math.abs(L.bot.t - L.perch.y) < 2, JSON.stringify([L.bot, L.perch]));
    await p.evaluate(() => HJALPBOT.poke());
    await p.waitForFunction(() => !document.querySelector('.hb-bubble.show'), { timeout: 3000 });
    ok('poke with bubble closes it', true);
    await p.close();
  }

  // ---- 4. färre moduler: sittplatsen flyttar med ----
  {
    const p = await open({ width: 412, height: 780 });
    const before = await p.evaluate(() => HJALPBOT._perch());
    await p.evaluate(() => {
      [...document.querySelectorAll('#app .grid .icon[data-tool]')].slice(3, 9).forEach(n => n.remove());
    });
    await sleep(1600);
    const L = await p.evaluate(layoutInPage);
    ok('fewer modules: perch moved', L.perch.y < before.y - 20, JSON.stringify([before, L.perch]));
    ok('fewer modules: bot followed', Math.abs(L.bot.l - L.perch.x) < 2 && Math.abs(L.bot.t - L.perch.y) < 2, JSON.stringify([L.bot, L.perch]));
    ok('fewer modules: after last icon', afterLast(L), JSON.stringify(L));
    await p.evaluate(t => HJALPBOT.previewSay(t), RAIN);
    await sleep(300);
    const L2 = await p.evaluate(layoutInPage);
    ok('fewer modules: bubble off icons', !L2.bubbleOnIcon, JSON.stringify(L2.bubble));
    await p.screenshot({ path: path.join(out, 'perch-412-farre.png') });
    await p.close();
  }

  // ---- 5. andra skärmar ----
  for (const v of [
    { name: 'phone-landskap', width: 780, height: 412 },
    { name: 'platta-staende', width: 768, height: 1024 },
    { name: 'platta-liggande', width: 1024, height: 600 },
    { name: 'lista', width: 412, height: 780, layout: 'lista' }
  ]) {
    const p = await open(v);
    let L = await p.evaluate(layoutInPage);
    ok(v.name + ': bot at perch', Math.abs(L.bot.l - L.perch.x) < 2 && Math.abs(L.bot.t - L.perch.y) < 2, JSON.stringify([L.bot, L.perch]));
    ok(v.name + ': not on icons', !L.botOnIcon, JSON.stringify(L.bot));
    if (L.last.b <= L.vh - 48) ok(v.name + ': after last icon', afterLast(L), JSON.stringify(L));
    else console.log('INFO', v.name, 'grid längre än skärmen: sittplats längst ner', JSON.stringify(L.perch));
    await p.evaluate(t => HJALPBOT.previewSay(t), RAIN);
    await sleep(300);
    L = await p.evaluate(layoutInPage);
    ok(v.name + ': bubble on screen', L.bubbleOnScreen, JSON.stringify(L.bubble));
    if (L.last.b <= L.vh - 120) ok(v.name + ': bubble off icons', !L.bubbleOnIcon, JSON.stringify(L.bubble));
    else console.log('INFO', v.name, 'bubbleOnIcon=' + L.bubbleOnIcon, JSON.stringify(L.bubble));
    await p.screenshot({ path: path.join(out, 'perch-' + v.name + '.png') });
    // vridning: sittplatsen räknas om
    await p.setViewport({ width: v.height, height: v.width, deviceScaleFactor: 1.5, isMobile: v.width < 800, hasTouch: true });
    await sleep(700);
    L = await p.evaluate(layoutInPage);
    ok(v.name + ': rotated → perch recomputed', Math.abs(L.bot.l - L.perch.x) < 2 && Math.abs(L.bot.t - L.perch.y) < 2, JSON.stringify([L.bot, L.perch]));
    ok(v.name + ': no page errors', p._errs.length === 0, p._errs.join(' | '));
    await p.close();
  }

  // ---- 6. minskad rörelse: står still på sittplatsen ----
  {
    const p = await open({ width: 412, height: 780, reduce: true });
    const a = await p.evaluate(() => [HJALPBOT._pos(), HJALPBOT._perch()]);
    await sleep(1200);
    const b = await p.evaluate(() => HJALPBOT._pos());
    ok('reduced motion: at perch', Math.abs(a[0].x - a[1].x) < 2 && Math.abs(a[0].y - a[1].y) < 2, JSON.stringify(a));
    ok('reduced motion: still', a[0].x === b.x && a[0].y === b.y);
    await p.close();
  }

  // ---- 7. Prova väderkollen i Inställningar ----
  {
    const p = await open({ width: 412, height: 780 });
    await p.evaluate(() => window.openItem('installningar'));
    await p.waitForSelector('[data-hb-try="vader"]', { timeout: 8000 });
    await p.evaluate(() => {
      // påhittad väderbild så att det finns något att säga
      if (window.ANIMATIONER_VADER) window.ANIMATIONER_VADER.readCache = () => ({ kind: 'rain', temp: 7, symbol: 18 });
    });
    await p.click('[data-hb-try="vader"]');
    await p.waitForFunction(() => window.HJALPBOT._trip().indexOf('pratar') >= 0 && document.querySelector('.hb-bubble.show'), { timeout: 8000 }).catch(() => {});
    const r = await p.evaluate(() => ({ cur: window.current || '', trip: HJALPBOT._trip(), txt: (document.querySelector('.hb-bubble-txt') || {}).textContent || '' }));
    ok('Prova väderkollen: home + full trip', !r.cur && r.trip.join(',') === 'svep-till-ikon,in,ut,svep-tillbaka,sittplats,pratar', JSON.stringify(r));
    ok('Prova väderkollen: weather line', /regn/i.test(r.txt), r.txt);
    await p.screenshot({ path: path.join(out, 'perch-prova.png') });
    await p.close();
  }

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOT_OK', out);
})().catch(e => { console.error(e); process.exit(1); });
