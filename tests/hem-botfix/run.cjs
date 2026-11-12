'use strict';
const puppeteer = require('../meddelanden/node_modules/puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = process.argv[2] || '/workspace/hem-fix-shots';
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
function lum(c) {
  const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return 0;
  const to = v => { v = Number(v) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * to(m[1]) + 0.7152 * to(m[2]) + 0.0722 * to(m[3]);
}
function contrast(a, b) {
  const L1 = lum(a), L2 = lum(b);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });
  const fails = [];
  function ok(name, cond, extra) { if (!cond) fails.push(name + (extra ? ': ' + extra : '')); else console.log('OK', name); }

  async function openPage({ width, height, theme, scale, layout, reduce, banner }) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: width === 1024 ? 1.5 : 2.5, isMobile: width < 800, hasTouch: true });
    if (reduce) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.evaluateOnNewDocument((core, theme, scale, layout) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
      if (layout) localStorage.setItem('taxi_home_layout', layout);
      window.TEST_ROLE = 'standard';
      (0, eval)(core);
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--font-scale', scale);
      });
    }, core, theme, scale, layout || '');
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
    await p.waitForFunction(() => {
      const w = document.querySelector('.hb-walker');
      return w && getComputedStyle(w).display !== 'none';
    }, { timeout: 8000 });
    await p.evaluate((scale, banner) => {
      document.documentElement.style.setProperty('--font-scale', scale);
      if (window.setBadge) { setBadge('nyheter', true); setBadge('prognos', 2); }
      const b = document.createElement('div');
      b.textContent = banner || 'TESTVY · påhittade exempel';
      b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:4px;position:relative;z-index:9';
      document.body.prepend(b);
      const box = document.getElementById('home-devices');
      if (box) box.innerHTML =
        '<div class="home-devices-h">Inloggade enheter</div>' +
        '<div class="home-devices-row" role="list">' +
        '<div class="home-dev home-dev-this" role="listitem"><div class="home-dev-name">Denna enhet</div><div class="home-dev-meta">Telefon · denna enhet</div></div>' +
        '<button type="button" class="home-dev" role="listitem"><div class="home-dev-name">Telefon</div><div class="home-dev-meta">Chrome · i går</div></button>' +
        '</div>';
    }, scale, banner);
    await new Promise(r => setTimeout(r, 250));
    p._errs = errs;
    return p;
  }

  // --- assertions on 412 dark 1.4 ---
  {
    const p = await openPage({ width: 412, height: 780, theme: 'dark', scale: '1.4', banner: 'TESTVY · efter · påhittade exempel' });
    ok('no pageerror 412', p._errs.length === 0, p._errs.join(' | '));
    const info = await p.evaluate(() => {
      const icon = document.querySelector('#app .grid .icon');
      const cs = getComputedStyle(icon);
      const icons = [...document.querySelectorAll('#app .grid .icon')].map(el => el.getBoundingClientRect());
      const walker = document.querySelector('.hb-walker');
      const btn = document.querySelector('.hb-btn');
      const road = document.querySelector('.hb-road');
      const chip = document.querySelector('.home-dev');
      const ccs = chip && getComputedStyle(chip);
      const name = document.querySelector('.home-dev-name');
      const ncs = name && getComputedStyle(name);
      const scripts = [...document.scripts].map(s => s.src);
      const badge = document.querySelector('.icon.has-badge, .icon.badge-host');
      const badgeAfter = badge && getComputedStyle(badge, '::after');
      const pos = window.HJALPBOT && HJALPBOT._pos && HJALPBOT._pos();
      const peW = walker && getComputedStyle(walker).pointerEvents;
      const peB = btn && getComputedStyle(btn).pointerEvents;
      return {
        border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.backgroundColor,
        minH: parseFloat(cs.minHeight), iconH: icons[0].height, iconW: icons[0].width,
        iconCount: icons.length,
        tightest: Math.min(...icons.map(r => Math.min(r.width, r.height))),
        road: !!road, hbOn: document.body.classList.contains('hb-on'),
        walker: !!(walker && getComputedStyle(walker).display !== 'none'),
        z: walker && getComputedStyle(walker).zIndex,
        peW, peB, pos,
        scriptsHB: scripts.some(s => s.indexOf('hjalpbot.js') >= 0),
        chipBg: ccs && ccs.backgroundColor, chipFg: ncs && ncs.color,
        chipBorder: ccs && ccs.borderTopColor,
        badgeContent: badgeAfter && badgeAfter.content,
        bodyPad: getComputedStyle(document.body).paddingBottom,
        outfitFn: !!(window.HJALPBOT && HJALPBOT.previewOutfit)
      };
    });
    ok('hjalpbot script global', info.scriptsHB);
    ok('no road', !info.road && !info.hbOn);
    ok('bot visible', info.walker);
    ok('pointer-events walker none', info.peW === 'none');
    ok('pointer-events btn auto', info.peB === 'auto' || info.peB === 'auto');
    ok('no tile box', info.border.indexOf('0px') >= 0 || info.border.indexOf('none') >= 0, info.border);
    ok('tap target >= 44', info.tightest >= 44, 'tightest=' + info.tightest + ' minH=' + info.minH + ' h=' + info.iconH);
    ok('chip contrast', contrast(info.chipBg, info.chipFg) >= 4.5, info.chipBg + ' / ' + info.chipFg + ' = ' + contrast(info.chipBg, info.chipFg).toFixed(2));
    ok('badge present', !!info.badgeContent && info.badgeContent !== 'none', info.badgeContent);
    ok('body no reserved pad', parseFloat(info.bodyPad) < 20, info.bodyPad);

    // place bot in a clear corner and check it does not cover first icon
    await p.evaluate(() => {
      const b = window.HJALPBOT._pickSpot(null);
      window.HJALPBOT._previewPos(b.x, b.y, 0);
    });
    const overlap = await p.evaluate(() => {
      const wr = document.querySelector('.hb-walker').getBoundingClientRect();
      const icons = [...document.querySelectorAll('#app .grid .icon')];
      const hit = icons.filter(el => {
        const r = el.getBoundingClientRect();
        return wr.left < r.right && wr.right > r.left && wr.top < r.bottom && wr.bottom > r.top;
      }).map(el => el.textContent.trim());
      return { hit, wr: { x: wr.x, y: wr.y, w: wr.width, h: wr.height }, pos: HJALPBOT._pos() };
    });
    ok('bot rest avoids tiles', overlap.hit.length === 0, JSON.stringify(overlap));
    await p.screenshot({ path: path.join(out, 'efter-rutor-412-scale14-dark.png') });
    await p.screenshot({ path: path.join(out, 'bot-fri-412-scale14-dark.png') });
    await p.screenshot({ path: path.join(out, 'efter-enheter-412-dark.png'), clip: { x: 0, y: 0, width: 412, height: 780 } });
    await p.close();
  }

  {
    const p = await openPage({ width: 412, height: 780, theme: 'dark', scale: '1.25', banner: 'TESTVY · efter · påhittade exempel' });
    await p.evaluate(() => { const b = HJALPBOT._pickSpot(null); HJALPBOT._previewPos(b.x, b.y, 0); });
    await p.screenshot({ path: path.join(out, 'efter-rutor-412-scale125-dark.png') });
    const t = await p.evaluate(() => Math.min(...[...document.querySelectorAll('#app .grid .icon')].map(el => {
      const r = el.getBoundingClientRect(); return Math.min(r.width, r.height);
    })));
    ok('tap 1.25 >= 44', t >= 44, t);
    await p.close();
  }

  {
    const p = await openPage({ width: 412, height: 780, theme: 'light', scale: '1.25', banner: 'TESTVY · efter · påhittade exempel' });
    await p.evaluate(() => { const b = HJALPBOT._pickSpot(null); HJALPBOT._previewPos(b.x, b.y, 0); });
    const info = await p.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#app .grid .icon'));
      return { bg: cs.backgroundColor, border: cs.borderTopWidth };
    });
    ok('light tiles no box', info.border === '0px', JSON.stringify(info));
    await p.screenshot({ path: path.join(out, 'efter-rutor-412-scale125-light.png') });
    await p.close();
  }

  {
    const p = await openPage({ width: 1024, height: 600, theme: 'dark', scale: '1', banner: 'TESTVY · efter · 1024×600 · påhittade exempel' });
    await p.evaluate(() => { const b = HJALPBOT._pickSpot(null); HJALPBOT._previewPos(b.x, b.y, 0); });
    const info = await p.evaluate(() => {
      const wr = document.querySelector('.hb-walker').getBoundingClientRect();
      const road = !!document.querySelector('.hb-road');
      const t = Math.min(...[...document.querySelectorAll('#app .grid .icon')].map(el => {
        const r = el.getBoundingClientRect(); return Math.min(r.width, r.height);
      }));
      const hit = [...document.querySelectorAll('#app .grid .icon')].some(el => {
        const r = el.getBoundingClientRect();
        return wr.left < r.right && wr.right > r.left && wr.top < r.bottom && wr.bottom > r.top;
      });
      return { road, t, hit, wr: { x: wr.x, y: wr.y } };
    });
    ok('tablet no road', !info.road);
    ok('tablet tap >= 44', info.t >= 44, info.t);
    ok('tablet bot avoids tiles', !info.hit, JSON.stringify(info.wr));
    await p.screenshot({ path: path.join(out, 'bot-fri-1024x600-landskap.png') });
    await p.close();
  }

  {
    const p = await openPage({ width: 412, height: 780, theme: 'dark', scale: '1.4', reduce: true, banner: 'TESTVY · minskad rörelse' });
    const info = await p.evaluate(() => {
      const w = document.querySelector('.hb-walker');
      const t = getComputedStyle(w).transitionProperty + ' ' + getComputedStyle(w).transitionDuration;
      const a = getComputedStyle(w.querySelector('svg')).animationName;
      return new Promise(res => setTimeout(res, 1200)).then(() => {
      // 2026-11-12: boten ställer sig på sittplatsen efter sista ikonen när enhetsraden ritats om; mät efter det
      const p1 = HJALPBOT._pos();
      return new Promise(res => {
        setTimeout(() => { const p2 = HJALPBOT._pos(); res({ t, a, p1, p2 }); }, 900);
      });
      });
    });
    ok('reduced motion no css walk', String(info.a) === 'none' || !info.a, info.a);
    ok('reduced motion stays still', info.p1.x === info.p2.x && info.p1.y === info.p2.y, JSON.stringify(info));
    await p.close();
  }

  {
    const p = await openPage({ width: 412, height: 780, theme: 'dark', scale: '1.4', layout: 'lista', banner: 'TESTVY · lista' });
    const t = await p.evaluate(() => Math.min(...[...document.querySelectorAll('#app .grid .icon')].map(el => el.getBoundingClientRect().height)));
    ok('lista row >= 44', t >= 44, t);
    await p.evaluate(() => { const b = HJALPBOT._pickSpot(null); HJALPBOT._previewPos(b.x, b.y, 0); });
    await p.screenshot({ path: path.join(out, 'efter-lista-412-dark.png') });
    await p.close();
  }

  await br.close();
  server.close();
  if (fails.length) {
    console.error('FAILS\n' + fails.join('\n'));
    process.exit(1);
  }
  console.log('ALL_OK');
})().catch(e => { console.error(e); process.exit(1); });
