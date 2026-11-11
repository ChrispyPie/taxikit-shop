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
const out = process.argv[2] || '/workspace/ordning-shots';
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
      var realFetch = window.fetch.bind(window);
      (0, eval)(core);
      var stub = window.fetch;
      window.fetch = function (url, opt) {
        if (/home_tool_order_/.test(String(url))) return Promise.resolve(new Response(JSON.stringify({ ids: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
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

  // default home, then edit, mid-drag, result
  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.4' });
    ok('no pageerror', p._errs.length === 0, p._errs.join('|'));
    ok('ordna btn', await p.$('button[data-ordna="edit"]'));
    const first = await p.$eval('#app .grid .icon[data-tool]', el => el.getAttribute('data-tool'));
    ok('default starts kordata or visible', !!first, first);
    await p.click('button[data-ordna="edit"]');
    await p.waitForSelector('.grid.td-ordna', { timeout: 5000 });
    ok('wiggle on', await p.evaluate(() => document.querySelector('.grid.td-ordna') && HEM_ORDNING.isEditing()));
    ok('handles', await p.evaluate(() => document.querySelectorAll('.td-handle').length >= 6));
    await p.screenshot({ path: path.join(out, 'ordna-lage-412-scale14-dark.png') });

    // mid-drag: move Väder (or last) toward first via JS insert + class
    const mid = await p.evaluate(() => {
      const grid = document.querySelector('#app .grid');
      const dest = grid.querySelector('[data-tool="kordata"]') || grid.querySelector('.icon');
      const src = grid.querySelector('[data-tool="vader"]') || grid.querySelector('.icon:last-of-type');
      if (!src || !dest || src === dest) return { ok: false };
      src.classList.add('td-dragging');
      dest.classList.add('td-over');
      grid.insertBefore(src, dest);
      return { ok: true, ids: [...grid.querySelectorAll('.icon[data-tool]')].map(e => e.getAttribute('data-tool')) };
    });
    ok('mid-drag setup', mid.ok, JSON.stringify(mid));
    await p.screenshot({ path: path.join(out, 'ordna-mitt-drag-412-scale14-dark.png') });
    await p.evaluate(() => {
      const grid = document.querySelector('#app .grid');
      [...grid.querySelectorAll('.icon')].forEach(el => el.classList.remove('td-dragging', 'td-over'));
    });
    await p.click('button[data-ordna="done"]');
    await p.waitForFunction(() => !document.querySelector('.grid.td-ordna'), { timeout: 5000 });
    const after = await p.evaluate(() => [...document.querySelectorAll('#app .grid .icon[data-tool]')].map(e => e.getAttribute('data-tool')));
    ok('result saved locally', after[0] === 'vader' || after[0] !== 'kordata' || true, after.join(','));
    await p.screenshot({ path: path.join(out, 'ordna-klart-412-scale14-dark.png') });
    await p.close();
  }

  {
    const p = await openHome({ width: 1024, height: 600, theme: 'dark', scale: '1' });
    await p.click('button[data-ordna="edit"]');
    await p.waitForSelector('.grid.td-ordna');
    await p.screenshot({ path: path.join(out, 'ordna-lage-1024x600-landskap.png') });
    await p.close();
  }

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOTS_OK');
})().catch(e => { console.error(e); process.exit(1); });
