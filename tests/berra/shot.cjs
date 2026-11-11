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
const out = process.argv[2] || '/workspace/berra-shots';
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

async function openHome(br, base, { width, height, theme, scale, anim }) {
  const p = await br.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: width === 1024 ? 1.5 : 2.5, isMobile: width < 800, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
  p._errs = [];
  p.on('pageerror', e => p._errs.push(String(e)));
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await p.evaluateOnNewDocument((core, theme, scale, anim) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('taxi_session', 'synthetic-test-fixture');
    localStorage.setItem('taxi_driver', '900001');
    localStorage.setItem('taxi_logged_in', '1');
    localStorage.setItem('taxi_theme', theme);
    localStorage.setItem('taxi_animationer', JSON.stringify({ on: anim !== '0' }));
    localStorage.setItem('hb_char_900001', 'robot');
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--font-scale', scale);
    });
  }, core, theme, scale, anim);
  await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
  await p.evaluate(s => {
    document.documentElement.style.setProperty('--font-scale', s);
    const b = document.createElement('div');
    b.textContent = 'TESTVY · påhittade exempel';
    b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:fixed;left:0;right:0;top:0;z-index:200;pointer-events:none';
    document.body.prepend(b);
  }, scale);
  await p.waitForFunction(() => window.BERRA && document.querySelector('.td-berra'), { timeout: 8000 });
  await p.evaluate(() => { if (window.BERRA && BERRA.place) BERRA.place(); });
  await p.waitForFunction(() => {
    const b = document.querySelector('.td-berra');
    return b && b.style.display !== 'none' && b.getBoundingClientRect().width > 8;
  }, { timeout: 8000 });
  return p;
}


async function scrollBerraIntoView(p) {
  await p.evaluate(() => {
    const b = document.querySelector('.td-berra');
    if (b) b.scrollIntoView({ block: 'end', inline: 'nearest' });
  });
  await new Promise(r => setTimeout(r, 80));
}

async function berraInfo(p) {
  return p.evaluate(() => {
    const b = document.querySelector('.td-berra');
    const bub = document.querySelector('.td-berra-bubble');
    const r = b && b.getBoundingClientRect();
    const br = bub && bub.getBoundingClientRect();
    const icons = [...document.querySelectorAll('#app.is-home .grid .icon')].map(n => n.getBoundingClientRect());
    const overlap = r && icons.some(i => r.left < i.right && r.right > i.left && r.top < i.bottom && r.bottom > i.top);
    const txt = bub && bub.querySelector('.td-berra-bubble-txt');
    const slot = document.querySelector('.td-berra-slot');
    const content = document.getElementById('content');
    const grid = document.querySelector('#app.is-home .grid');
    const dev = document.getElementById('home-devices');
    const cs = b && getComputedStyle(b);
    const yDoc = r ? r.top + scrollY : 0;
    const tilesBottom = Math.max(
      grid ? grid.getBoundingClientRect().bottom + scrollY : 0,
      dev ? dev.getBoundingClientRect().bottom + scrollY : 0
    );
    return {
      shown: !!(r && r.width > 8 && (b.style.display !== 'none')),
      x: r && r.left, y: r && r.top, w: r && r.width, h: r && r.height,
      vw: innerWidth, vh: innerHeight,
      overlap: !!overlap,
      bubble: !!(bub && bub.classList.contains('show')),
      bubbleOn: br && br.left >= -1 && br.top >= -1 && br.right <= innerWidth + 1 && br.bottom <= innerHeight + 1,
      hasTail: !!(bub && bub.querySelector('.td-berra-bubble-tail')),
      text: txt ? txt.textContent : '',
      hen: /\bStig\b|\bhen\b/.test(document.body.innerText),
      inContent: !!(content && slot && b && content.contains(slot) && slot.contains(b)),
      position: cs ? cs.position : '',
      belowTiles: !!(r && yDoc >= tilesBottom - 1),
      pageScrolls: document.documentElement.scrollHeight > innerHeight + 20
    };
  });
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  {
    const p = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4', anim: '1' });
    ok('no pageerror 412', p._errs.length === 0, p._errs.join('|'));
    let info = await berraInfo(p);
    ok('berra in content below tiles 412', info.shown && info.inContent && info.belowTiles && info.position === 'relative', JSON.stringify(info));
    ok('berra at bottom of home 412', info.belowTiles && info.y + info.h >= info.vh - 40, JSON.stringify(info));
    ok('berra does not cover tiles 412', !info.overlap, JSON.stringify(info));
    await scrollBerraIntoView(p);
    info = await berraInfo(p);
    ok('berra on-screen after scroll 412', info.shown && info.x >= 0 && info.y >= 0 && info.x + info.w <= info.vw + 1 && info.y + info.h <= info.vh + 1, JSON.stringify(info));
    await p.screenshot({ path: path.join(out, 'berra-hem-412-scale14-dark.png') });

    await p.click('.td-berra');
    await p.waitForFunction(() => document.querySelector('.td-berra-bubble.show'), { timeout: 4000 });
    info = await berraInfo(p);
    ok('bubble after poke 412', info.bubble && /Berra/.test(info.text), JSON.stringify(info));
    ok('bubble on-screen 412', info.bubbleOn, JSON.stringify(info));
    ok('comic tail 412', info.hasTail);
    ok('no hen/Stig 412', !info.hen);
    await new Promise(r => setTimeout(r, 200));
    await p.screenshot({ path: path.join(out, 'berra-skamt-412-scale14-dark.png') });
    await p.close();
  }

  {
    const p = await openHome(br, base, { width: 412, height: 780, theme: 'light', scale: '1.4', anim: '1' });
    await scrollBerraIntoView(p);
    await p.click('.td-berra');
    await p.waitForFunction(() => document.querySelector('.td-berra-bubble.show'), { timeout: 4000 });
    const info = await berraInfo(p);
    ok('bubble on-screen light', info.bubble && info.bubbleOn, JSON.stringify(info));
    await new Promise(r => setTimeout(r, 250));
    await p.screenshot({ path: path.join(out, 'berra-skamt-412-scale14-light.png') });
    await p.close();
  }

  {
    const p = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4', anim: '0' });
    await scrollBerraIntoView(p);
    await p.click('.td-berra');
    await p.waitForFunction(() => document.querySelector('.td-berra-bubble.show'), { timeout: 4000 });
    const info = await berraInfo(p);
    ok('joke still works with Animationer off', info.bubble && /Berra/.test(info.text), JSON.stringify(info));
    await new Promise(r => setTimeout(r, 250));
    await p.screenshot({ path: path.join(out, 'berra-skamt-animoff-412-scale14-dark.png') });
    await p.close();
  }

  {
    const p = await openHome(br, base, { width: 1024, height: 600, theme: 'dark', scale: '1', anim: '1' });
    let info = await berraInfo(p);
    ok('berra in content below tiles 1024', info.shown && info.inContent && info.belowTiles && info.position === 'relative' && !info.overlap, JSON.stringify(info));
    await scrollBerraIntoView(p);
    info = await berraInfo(p);
    ok('berra on-screen after scroll 1024', info.shown && info.y + info.h <= info.vh + 1, JSON.stringify(info));
    await p.screenshot({ path: path.join(out, 'berra-hem-1024x600-dark.png') });
    await p.click('.td-berra');
    await p.waitForFunction(() => document.querySelector('.td-berra-bubble.show'), { timeout: 4000 });
    info = await berraInfo(p);
    ok('bubble on-screen 1024', info.bubble && info.bubbleOn, JSON.stringify(info));
    ok('no hen/Stig 1024', !info.hen);
    await new Promise(r => setTimeout(r, 200));
    await p.screenshot({ path: path.join(out, 'berra-skamt-1024x600-dark.png') });
    await p.close();
  }

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOT_OK', out);
})().catch(e => { console.error(e); process.exit(1); });
