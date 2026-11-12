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
const out = process.argv[2] || '/workspace/tryck-shots';
fs.mkdirSync(out, { recursive: true });
const core = fs.readFileSync(path.join(root, 'tests/meddelanden/fixtures.js'), 'utf8');
const mime = f => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURI(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', mime(file)); res.end(b); });
});
const fails = [];
const ok = (n, c, e) => { if (!c) fails.push(n + (e ? ': ' + e : '')); else console.log('OK', n); };

async function openHome(br, base, { width, height, theme, scale }) {
  const p = await br.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: width === 1024 ? 1.5 : 2.5, isMobile: width < 800, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
  p._errs = []; p.on('pageerror', e => p._errs.push(String(e)));
  await p.evaluateOnNewDocument((core, theme, scale) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('taxi_session', 'synthetic-test-fixture');
    localStorage.setItem('taxi_driver', '900001');
    localStorage.setItem('taxi_logged_in', '1');
    localStorage.setItem('taxi_theme', theme);
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--font-scale', scale);
      const b = document.createElement('div');
      b.textContent = 'TESTVY · påhittade exempel';
      b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:absolute;left:0;right:0;top:0;z-index:200;pointer-events:none';
      document.body.prepend(b);
    });
  }, core, theme, scale);
  await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
  await p.evaluate(s => {
    document.documentElement.style.setProperty('--font-scale', s);
    document.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); }, true);
  }, scale);
  return p;
}

function pressCheck(sel, emojiSel) {
  return `
    const el = document.querySelector(${JSON.stringify(sel)});
    const emoji = document.querySelector(${JSON.stringify(emojiSel)}) || el;
    el.classList.add('__press');
    const style = document.createElement('style');
    style.id = '__press-css';
    style.textContent = ${JSON.stringify(sel)} + '.__press { }';
    document.head.appendChild(style);
    el.setAttribute('data-press','1');
    // force :active via class hook — apply same computed expectation
    const prev = {
      bg: getComputedStyle(el).backgroundColor,
      outline: getComputedStyle(el).outlineStyle,
      t: getComputedStyle(el).transform
    };
    el.classList.add('icon-force-active');
    return prev;
  `;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  const p = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4' });
  ok('no pageerror', p._errs.length === 0, p._errs.join('|'));

  const idle = await p.evaluate(() => {
    const el = document.querySelector('#app .grid .icon[data-tool="kordata"]');
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, minH: el.getBoundingClientRect().height };
  });
  ok('idle no fill + 44', idle.minH >= 44 && (idle.bg === 'rgba(0, 0, 0, 0)' || idle.bg === 'transparent'), JSON.stringify(idle));

  // Force active styles via a temporary class that mirrors :active by toggling a stylesheet using :active on a kept pointer
  const box = await p.$('#app .grid .icon[data-tool="kordata"]');
  const bb = await box.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + 18);
  await p.mouse.down();
  const mid = await p.evaluate(() => {
    const el = document.querySelector('#app .grid .icon[data-tool="kordata"]');
    const em = el.querySelector('.emoji');
    const cs = getComputedStyle(el);
    const es = getComputedStyle(em);
    const bg = cs.backgroundColor;
    const noBox = (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && cs.transform === 'none';
    const scaled = es.transform !== 'none' && es.transform !== 'matrix(1, 0, 0, 1, 0, 0)';
    return { bg, elT: cs.transform, emT: es.transform, emFilter: es.filter, noBox, scaled, elH: el.getBoundingClientRect().height };
  });
  ok('active no square on tile', mid.noBox, JSON.stringify(mid));
  ok('active scale+glow on emoji', mid.scaled && /drop-shadow|brightness/.test(mid.emFilter || ''), JSON.stringify(mid));
  ok('hit area still 44', mid.elH >= 44);
  await p.screenshot({ path: path.join(out, 'tryck-ikon-412-scale14-dark.png') });
  await p.mouse.up();

  const plus = await p.$('.td-slot-empty');
  const pb = await plus.boundingBox();
  await p.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await p.mouse.down();
  const pmid = await p.evaluate(() => {
    const el = document.querySelector('.td-slot-empty');
    const plus = el.querySelector('.td-slot-plus');
    const cs = getComputedStyle(el);
    const ps = getComputedStyle(plus);
    const bg = cs.backgroundColor;
    return {
      noBox: (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && cs.transform === 'none',
      scaled: ps.transform !== 'none' && ps.transform !== 'matrix(1, 0, 0, 1, 0, 0)',
      filter: ps.filter,
      h: el.getBoundingClientRect().height
    };
  });
  ok('plus no square', pmid.noBox, JSON.stringify(pmid));
  ok('plus scale on +', pmid.scaled, JSON.stringify(pmid));
  await p.screenshot({ path: path.join(out, 'tryck-plus-412-scale14-dark.png') });
  await p.mouse.up();

  // Skiftnyckeln är borttagen (2026-11-12mapp1): den låg för nära översta högra ikonen.
  ok('no wrench', !(await p.$('.td-wrench')));
  await p.close();

  const p2 = await openHome(br, base, { width: 412, height: 780, theme: 'light', scale: '1.25' });
  const b2 = await (await p2.$('#app .grid .icon[data-tool="kordata"]')).boundingBox();
  await p2.mouse.move(b2.x + b2.width / 2, b2.y + 18);
  await p2.mouse.down();
  await p2.screenshot({ path: path.join(out, 'tryck-ikon-412-scale125-light.png') });
  await p2.mouse.up();
  await p2.close();

  const p3 = await openHome(br, base, { width: 1024, height: 600, theme: 'dark', scale: '1' });
  const b3 = await (await p3.$('#app .grid .icon[data-tool="kordata"]')).boundingBox();
  await p3.mouse.move(b3.x + b3.width / 2, b3.y + 18);
  await p3.mouse.down();
  await p3.screenshot({ path: path.join(out, 'tryck-ikon-1024x600-dark.png') });
  await p3.mouse.up();
  await p3.close();

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOTS_OK');
})().catch(e => { console.error(e); process.exit(1); });
