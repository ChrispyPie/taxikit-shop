'use strict';
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
const out = process.argv[2] || '/workspace/station-shots';
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

async function openHome(br, base, { width, height, theme, scale, char, coolStored, reduce }) {
  const p = await br.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: width === 1024 ? 1.5 : 2.5, isMobile: width < 800, hasTouch: true });
  if (reduce) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.setRequestInterception(true);
  p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
  p._errs = [];
  p.on('pageerror', e => p._errs.push(String(e)));
  await p.evaluateOnNewDocument((core, theme, scale, char, coolStored) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('taxi_session', 'synthetic-test-fixture');
    localStorage.setItem('taxi_driver', '900001');
    localStorage.setItem('taxi_logged_in', '1');
    localStorage.setItem('taxi_theme', theme);
    if (coolStored) localStorage.setItem('hb_char_900001', 'cool');
    else if (char) localStorage.setItem('hb_char_900001', char);
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--font-scale', scale);
    });
  }, core, theme, scale, char || '', !!coolStored);
  await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
  await p.evaluate(s => {
    document.documentElement.style.setProperty('--font-scale', s);
    const b = document.createElement('div');
    b.textContent = 'TESTVY · påhittade exempel';
    b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:absolute;left:0;right:0;top:0;z-index:200;pointer-events:none';
    document.body.prepend(b);
  }, scale);
  return p;
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  // Cool stored value falls back to robot, picker has three characters + Av
  const pCool = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4', coolStored: true });
  ok('cool fallback no pageerror', pCool._errs.length === 0, pCool._errs.join('|'));
  const fb = await pCool.evaluate(() => {
    const stored = localStorage.getItem('hb_char_900001');
    const box = document.createElement('div');
    window.HJALPBOT.renderSettings(box);
    const ids = [...box.querySelectorAll('[data-hb-char]')].map(b => b.getAttribute('data-hb-char'));
    const names = [...box.querySelectorAll('[data-hb-char]')].map(b => (b.textContent || '').trim());
    return { stored, ids, names, hasCool: ids.includes('cool') || names.some(n => /cool/i.test(n)) };
  });
  ok('cool migrated to robot', fb.stored === 'robot', JSON.stringify(fb));
  ok('picker three + av', JSON.stringify(fb.ids) === JSON.stringify(['robot', 'chauffor', 'diva', 'off']), JSON.stringify(fb));
  ok('picker has no Cool', !fb.hasCool, JSON.stringify(fb.names));
  await pCool.close();

  const chars = [
    { id: 'robot', act: 'hb-act-robot', file: 'station-robot' },
    { id: 'diva', act: 'hb-act-diva', file: 'station-diva' },
    { id: 'chauffor', act: 'hb-act-chauffor', file: 'station-chauffor' }
  ];

  const p = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4' });
  ok('home no pageerror', p._errs.length === 0, p._errs.join('|'));

  for (const c of chars) {
    const st = await p.evaluate(id => window.HJALPBOT.previewStation(id), c.id);
    ok(c.id + ' previewStation', !!st);
    await new Promise(r => setTimeout(r, 400));
    const info = await p.evaluate(act => {
      const w = document.querySelector('.hb-walker');
      const stn = document.querySelector('.hb-station');
      const vis = !!(w && getComputedStyle(w).display !== 'none');
      const stVis = !!(stn && getComputedStyle(stn).display !== 'none');
      const activity = !!(w && w.classList.contains(act));
      const shades = !!w && !!w.querySelector('.hb-shades');
      const jacket = !!w && !!w.querySelector('svg');
      const pe = stn ? getComputedStyle(stn).pointerEvents : '';
      const emojis = [...document.querySelectorAll('#app.is-home .grid .icon .emoji, .td-slot-plus')].map(n => {
        const r = n.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
      const sr = stn ? stn.getBoundingClientRect() : null;
      const wr = w ? w.getBoundingClientRect() : null;
      return { vis, stVis, activity, shades, jacket, pe, emojis, sr: sr && { x: sr.left, y: sr.top, w: sr.width, h: sr.height }, wr: wr && { x: wr.left, y: wr.top, w: wr.width, h: wr.height } };
    }, c.act);
    ok(c.id + ' walker+station visible', info.vis && info.stVis, JSON.stringify({ vis: info.vis, stVis: info.stVis }));
    ok(c.id + ' activity class', info.activity);
    ok(c.id + ' station pointer-events none', info.pe === 'none', info.pe);
    const covers = info.sr && info.emojis.some(e => overlap(info.sr, e));
    ok(c.id + ' station not over emoji', !covers, JSON.stringify({ sr: info.sr, hit: covers }));
    if (c.id === 'chauffor') ok('chauffor has sunglasses', info.shades);
    await p.screenshot({ path: path.join(out, c.file + '-412-scale14-dark.png') });
  }

  const aisle = await p.evaluate(() => window.HJALPBOT.previewAisle());
  ok('previewAisle', !!(aisle && aisle.x != null), JSON.stringify(aisle));
  await new Promise(r => setTimeout(r, 250));
  const aisleInfo = await p.evaluate(() => {
    const w = document.querySelector('.hb-walker');
    const walking = w && w.classList.contains('hb-walk');
    const wr = w.getBoundingClientRect();
    const emojis = [...document.querySelectorAll('#app.is-home .grid .icon .emoji, .td-slot-plus')].map(n => {
      const r = n.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const hit = emojis.some(e => wr.left < e.x + e.w && wr.right > e.x && wr.top < e.y + e.h && wr.bottom > e.y);
    return { walking, hit, wr: { x: wr.left, y: wr.top, w: wr.width, h: wr.height }, size: wr.width };
  });
  ok('aisle walking class', aisleInfo.walking);
  ok('aisle not covering emoji', !aisleInfo.hit, JSON.stringify(aisleInfo));
  ok('bot about 40px', aisleInfo.size >= 36 && aisleInfo.size <= 48, String(aisleInfo.size));
  await p.screenshot({ path: path.join(out, 'gang-412-scale14-dark.png') });

  // light theme chauffeur station
  await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); document.body.classList.remove('dark'); });
  // theme may use taxi_theme / class — set via existing hook if any
  await p.evaluate(() => {
    localStorage.setItem('taxi_theme', 'light');
    if (window.applyTheme) window.applyTheme('light');
    else {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.remove('tema-mork', 'dark');
      document.body.classList.add('tema-ljust');
      document.documentElement.classList.remove('dark');
    }
  });
  await p.evaluate(() => window.HJALPBOT.previewStation('diva'));
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: path.join(out, 'station-diva-412-scale14-light.png') });
  await p.close();

  const t = await openHome(br, base, { width: 1024, height: 600, theme: 'dark', scale: '1' });
  ok('tablet no pageerror', t._errs.length === 0, t._errs.join('|'));
  const tSt = await t.evaluate(() => window.HJALPBOT.previewStation('robot'));
  ok('tablet previewStation', !!tSt);
  await new Promise(r => setTimeout(r, 300));
  await t.screenshot({ path: path.join(out, 'station-robot-1024x600-dark.png') });
  await t.evaluate(() => window.HJALPBOT.previewStation('chauffor'));
  await new Promise(r => setTimeout(r, 300));
  await t.screenshot({ path: path.join(out, 'station-chauffor-1024x600-dark.png') });
  await t.evaluate(() => window.HJALPBOT.previewAisle());
  await new Promise(r => setTimeout(r, 250));
  await t.screenshot({ path: path.join(out, 'gang-1024x600-dark.png') });
  await t.close();

  // reduced motion: station still, no walk class after previewAisle attempt
  const r = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.25', reduce: true, char: 'robot' });
  await r.evaluate(() => window.HJALPBOT.previewStation('robot'));
  await new Promise(r => setTimeout(r, 200));
  const red = await r.evaluate(() => {
    const w = document.querySelector('.hb-walker');
    const stn = document.querySelector('.hb-station');
    return {
      stVis: !!(stn && getComputedStyle(stn).display !== 'none'),
      walking: !!(w && w.classList.contains('hb-walk'))
    };
  });
  ok('reduced motion station still shown', red.stVis, JSON.stringify(red));
  await r.screenshot({ path: path.join(out, 'station-robot-reduce-412-scale125-dark.png') });
  await r.close();

  await br.close();
  server.close();
  if (fails.length) {
    console.error('FAILS\n' + fails.join('\n'));
    process.exit(1);
  }
  console.log('SHOT_OK', out);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
