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
const out = process.argv[2] || '/workspace/moduler-shots';
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
const ok = (n, c, e) => { if (!c) fails.push(n + (e ? ': ' + e : '')); else console.log('OK', n); };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  async function openHome({ width, height, theme, scale }) {
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
      var stub = window.fetch;
      window.fetch = function (url, opt) {
        if (/home_tool_order_/.test(String(url))) {
          return Promise.resolve(new Response(JSON.stringify({ ids: null, hidden: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return stub.apply(this, arguments);
      };
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
    await p.evaluate(s => document.documentElement.style.setProperty('--font-scale', s), scale);
    return p;
  }

  // Ordningsläget nås via håll in -> Flytta (skiftnyckeln är borttagen 2026-11-12mapp1)
  async function enterEdit(p) {
    const b = await (await p.$('#app .grid .icon[data-tool="kordata"] .emoji')).boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    await new Promise(r => setTimeout(r, 1050));
    await p.mouse.up();
    await new Promise(r => setTimeout(r, 500));
    await p.click('#td-lp-menu [data-lp="move"]');
    await p.waitForSelector('.grid.td-ordna');
  }
  async function metrics(p) {
    return p.evaluate(() => {
      const header = document.querySelector('#app header');
      const grid = document.querySelector('#app .grid');
      const plus = document.querySelector('.td-slot-empty');
      const bar = document.querySelector('.td-ordna-bar');
      const pencil = document.querySelector('.td-wrench');
      const hr = header.getBoundingClientRect();
      const gr = grid.getBoundingClientRect();
      const icons = [...grid.querySelectorAll('.icon[data-tool]')];
      const last = icons[icons.length - 1];
      const handlesVis = [...document.querySelectorAll('.td-handle')].filter(h => getComputedStyle(h).display !== 'none').length;
      const pr = plus ? plus.getBoundingClientRect() : null;
      const pb = pencil ? pencil.getBoundingClientRect() : null;
      return {
        gap: Math.round(gr.top - hr.bottom),
        hasBar: !!bar,
        pencil: !pencil, // skiftnyckeln borttagen 2026-11-12mapp1
        plusLast: !!(plus && plus === grid.lastElementChild),
        plusH: pr ? Math.round(pr.height) : 0,
        handlesVis,
        iconCount: icons.length,
        noOrdnaRow: !bar
      };
    });
  }

  // 412 dark 1.4 default home
  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.4' });
    ok('no pageerror', p._errs.length === 0, p._errs.join('|'));
    const m = await metrics(p);
    ok('grid close under header', m.gap >= 0 && m.gap <= 16, 'gap=' + m.gap);
    ok('no ordna row', m.noOrdnaRow);
    ok('no wrench on home', m.pencil);
    ok('plus last', m.plusLast && m.plusH >= 44, JSON.stringify(m));
    ok('handles hidden', m.handlesVis === 0, 'vis=' + m.handlesVis);
    await p.screenshot({ path: path.join(out, 'hem-412-scale14-dark.png') });

    // enter edit, remove a tool, screenshot with X
    await enterEdit(p);
    const editM = await p.evaluate(() => {
      const ban = document.querySelector('.td-andringslage');
      const cs = ban ? getComputedStyle(ban) : null;
      return {
        x: document.querySelectorAll('.grid.td-ordna .td-remove').length,
        noXCore: !document.querySelector('.icon[data-tool="installningar"] .td-remove') && !document.querySelector('.icon[data-tool="om"] .td-remove'),
        plusLast: document.querySelector('.td-slot-empty') === document.querySelector('#app .grid').lastElementChild,
        banner: !!(cs && cs.display !== 'none' && /Ändringsläge/.test(ban.textContent)),
        klar: !!document.querySelector('.td-andringslage [data-ordna="done"]'),
        reset: !!document.querySelector('.td-andringslage [data-ordna="reset"]'),
        wrenchHidden: !document.querySelector('.td-wrench')
      };
    });
    ok('x badges on removable', editM.x >= 6, 'x=' + editM.x);
    ok('no x on core', editM.noXCore);
    ok('plus last in ordna', editM.plusLast);
    ok('banner + klar + aterstall', editM.banner && editM.klar && editM.reset, JSON.stringify(editM));
    await p.screenshot({ path: path.join(out, 'ordna-kryss-412-scale14-dark.png') });

    // remove Väder
    await p.click('.icon[data-tool="vader"] .td-remove');
    await p.waitForFunction(() => !document.querySelector('.icon[data-tool="vader"]') && document.querySelector('.td-slot-empty'));
    // still editing after re-render
    if (!(await p.$('.grid.td-ordna'))) await enterEdit(p);
    await p.click('.td-slot-empty');
    await p.waitForSelector('.td-mod-list');
    const list = await p.evaluate(() => [...document.querySelectorAll('.td-mod-row')].map(e => e.getAttribute('data-mod-id')));
    ok('moduler list has vader', list.includes('vader'), list.join(','));
    const inst = await p.evaluate(() => {
      const row = document.querySelector('.td-mod-row[data-mod-id="vader"]');
      const btn = row && row.querySelector('[data-mod-install]');
      return !!(btn && /Installera/.test(btn.textContent) && !btn.disabled);
    });
    ok('vader shows Installera', inst);
    await p.screenshot({ path: path.join(out, 'moduler-sida-412-scale14-dark.png') });
    await p.close();
  }

  // 412 light 1.25
  {
    const p = await openHome({ width: 412, height: 780, theme: 'light', scale: '1.25' });
    const m = await metrics(p);
    ok('light gap', m.gap >= 0 && m.gap <= 16, 'gap=' + m.gap);
    ok('light plus last', m.plusLast);
    await p.screenshot({ path: path.join(out, 'hem-412-scale125-light.png') });
    await enterEdit(p);
    await p.screenshot({ path: path.join(out, 'ordna-kryss-412-scale125-light.png') });
    await p.close();
  }

  // 412 dark 1.25
  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.25' });
    await p.screenshot({ path: path.join(out, 'hem-412-scale125-dark.png') });
    await p.close();
  }

  // tablet both themes
  {
    const p = await openHome({ width: 1024, height: 600, theme: 'dark', scale: '1' });
    const m = await metrics(p);
    ok('tablet gap', m.gap >= 0 && m.gap <= 20, 'gap=' + m.gap);
    ok('tablet plus last', m.plusLast);
    await p.screenshot({ path: path.join(out, 'hem-1024x600-dark.png') });
    await enterEdit(p);
    await p.screenshot({ path: path.join(out, 'ordna-kryss-1024x600-dark.png') });
    await p.close();
  }
  {
    const p = await openHome({ width: 1024, height: 600, theme: 'light', scale: '1' });
    await p.screenshot({ path: path.join(out, 'hem-1024x600-light.png') });
    await p.close();
  }

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOTS_OK');
})().catch(e => { console.error(e); process.exit(1); });
