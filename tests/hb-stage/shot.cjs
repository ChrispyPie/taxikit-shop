'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
function loadPuppeteer() {
  const cands = [
    path.resolve(__dirname, '../meddelanden/node_modules/puppeteer-core'),
    'puppeteer-core'
  ];
  for (const c of cands) { try { return require(c); } catch (e) {} }
  throw new Error('puppeteer-core missing');
}
const puppeteer = loadPuppeteer();
const root = path.resolve(__dirname, '../..');
const outOff = process.argv[2] || '/workspace/hb-spotlight-av-458.png';
const outOn = process.argv[3] || '/workspace/hb-spotlight-pa-458.png';
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

function measure() {
  const stage = document.getElementById('hb-stage');
  const lamp = document.getElementById('hb-stage-lamp-btn');
  const beam = stage && stage.querySelector('.hb-stage-beam');
  const btn = document.getElementById('hb-stage-toggle') || (stage && stage.querySelector('.hb-stage-btn'));
  const berra = document.querySelector('.td-berra');
  const walker = document.querySelector('.hb-walker');
  const sr = stage ? stage.getBoundingClientRect() : null;
  const lr = lamp ? lamp.getBoundingClientRect() : null;
  const br = beam ? beam.getBoundingClientRect() : null;
  const wr = walker && walker.style.display !== 'none' ? walker.getBoundingClientRect() : null;
  const ell = beam && beam.querySelector('ellipse');
  let pool = null;
  if (ell && br) {
    const vb = beam.viewBox.baseVal;
    const sx = br.width / (vb && vb.width ? vb.width : 112);
    const sy = br.height / (vb && vb.height ? vb.height : 94);
    const cx = Number(ell.getAttribute('cx')), cy = Number(ell.getAttribute('cy'));
    pool = { x: br.left + cx * sx, y: br.top + cy * sy };
  }
  return {
    lit: !!(stage && stage.classList.contains('lit')),
    hasBtn: !!btn,
    lampLabel: lamp ? (lamp.getAttribute('aria-label') || '') : '',
    pressed: lamp ? lamp.getAttribute('aria-pressed') : null,
    stage: sr && { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom, w: sr.width, h: sr.height },
    lamp: lr && { left: lr.left, right: lr.right, top: lr.top, bottom: lr.bottom, mid: (lr.left + lr.right) / 2 },
    beam: !!(beam && br && br.width > 8),
    pool,
    walker: wr && { left: wr.left, right: wr.right, top: wr.top, bottom: wr.bottom, mid: (wr.left + wr.right) / 2 },
    berra: !!(berra && berra.getBoundingClientRect().height > 8 && getComputedStyle(berra).display !== 'none'),
    text: stage ? stage.innerText : ''
  };
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });
  const p = await br.newPage();
  await p.setViewport({ width: 458, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.evaluateOnNewDocument((core) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('taxi_session', 'synthetic-test-fixture');
    localStorage.setItem('taxi_driver', '710022');
    localStorage.setItem('taxi_logged_in', '1');
    localStorage.setItem('taxi_theme', 'dark');
    localStorage.setItem('hb_char_710022', 'robot');
    localStorage.setItem('taxi_hb_light:710022', '0');
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
    const orig = window.fetch;
    window.fetch = function (url, opt) {
      return orig.call(this, url, opt).then(function (res) {
        const m = /\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(String(url));
        if (!m || m[1] !== 'get_me') return res;
        return res.json().then(function (d) {
          d = d || {};
          d.id = '710022';
          return new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
      });
    };
  }, core);
  await p.goto(base + '/TaxiData/index.html?juldatum=2026-12-13', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
  await p.evaluate(() => {
    try {
      localStorage.setItem('taxi_driver', '710022');
      localStorage.setItem('hb_char_710022', 'robot');
      localStorage.setItem('taxi_hb_light:710022', '0');
    } catch (e) {}
    const app = document.getElementById('app');
    if (app) app.classList.add('is-home');
    if (window.JULPYSSEL && JULPYSSEL.start) JULPYSSEL.start();
    if (window.HB_STAGE && HB_STAGE.setLit) HB_STAGE.setLit(false);
    if (window.HB_STAGE && HB_STAGE.render) HB_STAGE.render();
    if (window.LAZY && LAZY.ensure) LAZY.ensure('berra');
  });
  await p.waitForFunction(() => {
    const st = document.getElementById('hb-stage');
    const lamp = document.getElementById('hb-stage-lamp-btn');
    if (!st || !lamp || st.classList.contains('hb-hidden')) return false;
    const r = st.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 400));
  const off = await p.evaluate(measure);
  console.log('OFF', JSON.stringify(off, null, 2));
  ok('off: stage visible', off.stage && off.stage.h >= 80);
  ok('off: no På/Av pill', !off.hasBtn && !/\bPå\b|\bAv\b/.test(off.text || ''));
  ok('off: lamp present', !!off.lamp);
  ok('off: light is off', off.lit === false && off.pressed === 'false');
  ok('off: berra visible', off.berra);
  await p.screenshot({ path: outOff, fullPage: false });
  console.log('SHOT', outOff);

  await p.evaluate(() => { if (window.HB_STAGE && HB_STAGE.setLit) return HB_STAGE.setLit(true); });
  await p.waitForFunction(() => {
    const st = document.getElementById('hb-stage');
    return st && st.classList.contains('lit') && st.querySelector('.hb-stage-beam');
  }, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 800));
  const on = await p.evaluate(measure);
  console.log('ON', JSON.stringify(on, null, 2));
  ok('on: light is on', on.lit === true && on.pressed === 'true');
  ok('on: no På/Av pill', !on.hasBtn && !/\bPå\b|\bAv\b/.test(on.text || ''));
  ok('on: beam visible', on.beam);
  ok('same stage y', off.stage && on.stage && Math.abs(on.stage.top - off.stage.top) <= 1, off.stage && on.stage ? (off.stage.top + ' → ' + on.stage.top) : 'missing');
  ok('same stage x', off.stage && on.stage && Math.abs(on.stage.left - off.stage.left) <= 1);
  if (on.lamp && on.pool) {
    ok('beam/pool under lamp x', Math.abs(on.pool.x - on.lamp.mid) <= 8, 'lamp ' + on.lamp.mid + ' pool ' + on.pool.x);
  }
  if (on.walker && on.pool) {
    ok('pool centered on bot', Math.abs(on.pool.x - on.walker.mid) <= 10, 'pool ' + on.pool.x + ' bot ' + on.walker.mid);
    ok('bot same height as off scene', Math.abs(on.walker.bottom - on.stage.bottom) <= 12, 'walker bottom ' + on.walker.bottom + ' stage ' + on.stage.bottom);
  }
  ok('on: berra still visible', on.berra);
  await p.screenshot({ path: outOn, fullPage: false });
  console.log('SHOT', outOn);

  await p.evaluate(() => { if (window.HB_STAGE && HB_STAGE.setLit) return HB_STAGE.setLit(false); });
  await p.waitForFunction(() => {
    const st = document.getElementById('hb-stage');
    return st && !st.classList.contains('lit');
  }, { timeout: 8000 });
  const off2 = await p.evaluate(measure);
  ok('after off: same y again', off.stage && off2.stage && Math.abs(off2.stage.top - off.stage.top) <= 1, off2.stage && off.stage ? (off.stage.top + ' → ' + off2.stage.top) : '');
  ok('after off: no beam', !off2.beam && off2.lit === false);

  await br.close();
  server.close();
  if (fails.length) {
    console.log('FAIL', fails);
    process.exit(1);
  }
  console.log('HB_STAGE_SHOT_OK');
})().catch(e => { console.error(e); process.exit(1); });
