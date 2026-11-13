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
const mime = f => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.png') ? 'image/png' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
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
      localStorage.setItem('taxi_animationer', '0');
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

  async function longPress(p, sel) {
    const h = await p.$(sel);
    const box = await h.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await p.mouse.move(x, y);
    await p.mouse.down();
    await new Promise(r => setTimeout(r, 700));
    await p.waitForSelector('#td-lp-menu', { timeout: 4000 });
    await p.mouse.up();
    await new Promise(r => setTimeout(r, 80));
  }

  // Home + long-press + info sheet, 412 @ 1.4 dark
  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.4' });
    ok('no pageerror home', p._errs.length === 0, p._errs.join('|'));
    const tile = await p.evaluate(() => {
      const plus = document.querySelector('.icon[data-tool="moduler"]');
      if (!plus) return null;
      const cs = getComputedStyle(plus);
      return {
        label: (plus.querySelector('.label') || plus).textContent.trim(),
        borderW: cs.borderTopWidth,
        borderStyle: cs.borderTopStyle,
        last: plus === document.querySelector('#app .grid').lastElementChild,
        h: Math.round(plus.getBoundingClientRect().height)
      };
    });
    ok('tile labeled Moduler', tile && tile.label === 'Moduler', JSON.stringify(tile));
    ok('tile borderless', tile && (tile.borderStyle === 'none' || tile.borderW === '0px'), JSON.stringify(tile));
    ok('tile last and tall', tile && tile.last && tile.h >= 44, JSON.stringify(tile));
    await p.screenshot({ path: path.join(out, 'hem-moduler-412-scale14-dark.png') });

    await longPress(p, '.icon[data-tool="kordata"]');
    const menu = await p.evaluate(() => {
      const m = document.getElementById('td-lp-menu');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      const icon = document.querySelector('.icon[data-tool="kordata"]').getBoundingClientRect();
      const labels = [...m.querySelectorAll('[data-lp]')].map(b => ({ act: b.getAttribute('data-lp'), t: b.textContent.replace(/\s+/g,' ').trim() }));
      const back = getComputedStyle(document.body);
      return {
        labels,
        hasOff: !!m.querySelector('[data-lp="off"]'),
        hasInfo: !!m.querySelector('[data-lp="info"]'),
        hasMove: !!m.querySelector('[data-lp="move"]'),
        hasHelp: !!m.querySelector('[data-lp="help"]'),
        radius: parseFloat(getComputedStyle(m).borderRadius) || 0,
        aboveOrBelow: r.bottom <= icon.top + 2 || r.top >= icon.bottom - 2,
        near: Math.abs((r.left + r.right) / 2 - (icon.left + icon.right) / 2) < 80,
        noHeavyBack: !document.querySelector('.td-lp-back, .td-lp-backdrop')
      };
    });
    ok('menu items', menu && menu.hasInfo && menu.hasMove && menu.hasHelp && menu.hasOff, JSON.stringify(menu && menu.labels));
    ok('menu rounded + anchored', menu && menu.radius >= 12 && menu.aboveOrBelow, JSON.stringify(menu));
    ok('no heavy backdrop', menu && menu.noHeavyBack);
    await p.screenshot({ path: path.join(out, 'langtryck-meny-412-scale14-dark.png') });

    await p.click('#td-lp-menu [data-lp="info"]');
    await p.waitForSelector('#td-info-sheet');
    const info = await p.evaluate(() => {
      const s = document.getElementById('td-info-sheet');
      const txt = s ? s.innerText : '';
      return {
        hasName: /Kördata|Körpassdata|kordata/i.test(txt),
        hasSize: /Storlek/.test(txt),
        hasVer: /Version/.test(txt),
        hasDate: /Uppdaterad/.test(txt),
        hasClear: !!(s && s.querySelector('.td-info-clear') && /Rensa cache/.test(s.querySelector('.td-info-clear').textContent)),
        lightBack: !!(document.getElementById('td-info-back'))
      };
    });
    ok('info sheet fields', info.hasName && info.hasSize && info.hasVer && info.hasDate && info.hasClear, JSON.stringify(info));
    await p.screenshot({ path: path.join(out, 'modulinfo-412-scale14-dark.png') });

    await p.click('#td-info-sheet .td-info-clear');
    await p.waitForFunction(() => {
      const m = document.querySelector('#td-info-sheet .td-info-msg');
      return m && /Cache rensad/.test(m.textContent);
    }, { timeout: 4000 });
    const kept = await p.evaluate(() => ({
      session: localStorage.getItem('taxi_session'),
      theme: localStorage.getItem('taxi_theme'),
      anim: localStorage.getItem('taxi_animationer')
    }));
    ok('cache clear keeps session', kept.session === 'synthetic-test-fixture' && kept.theme === 'dark' && kept.anim === '0', JSON.stringify(kept));
    await p.screenshot({ path: path.join(out, 'modulinfo-rensad-412-scale14-dark.png') });
    await p.click('#td-info-back');
    await p.waitForFunction(() => !document.getElementById('td-info-sheet'));
    await p.close();
  }

  // Flytta + Hjälp + core has no uninstall; Moduler page
  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.4' });
    await longPress(p, '.icon[data-tool="installningar"]');
    const coreMenu = await p.evaluate(() => !document.querySelector('#td-lp-menu [data-lp="off"]') && !!document.querySelector('#td-lp-menu [data-lp="info"]'));
    ok('core has no Avinstallera', coreMenu);
    await p.screenshot({ path: path.join(out, 'langtryck-core-412-scale14-dark.png') });
    await p.click('#td-lp-menu [data-lp="help"]');
    await p.waitForSelector('.td-hjalp-panel.open', { timeout: 4000 });
    const helpOpen = await p.evaluate(() => {
      const body = document.querySelector('.td-hjalp-panel.open .td-hjalp-body');
      const txt = body ? body.innerText : '';
      return { open: !!(body && /tema|textstorlek|startskärm/i.test(txt)), txt: txt.slice(0, 240) };
    });
    ok('help for installningar', helpOpen.open, JSON.stringify(helpOpen));
    await p.close();
  }

  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.4' });
    await longPress(p, '.icon[data-tool="prognos"]');
    await p.click('#td-lp-menu [data-lp="move"]');
    await p.waitForSelector('.grid.td-ordna');
    const moved = await p.evaluate(() => ({
      edit: !!document.querySelector('.grid.td-ordna'),
      picked: !!document.querySelector('.icon[data-tool="prognos"].td-picked')
    }));
    ok('flytta starts edit on icon', moved.edit && moved.picked, JSON.stringify(moved));
    await p.screenshot({ path: path.join(out, 'flytta-412-scale14-dark.png') });
    await p.close();
  }

  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.4' });
    await p.click('.icon[data-tool="moduler"]');
    await p.waitForSelector('.td-mod-list');
    const page = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.td-mod-row')];
      const coreBtn = document.querySelector('.td-mod-row[data-mod-id="installningar"] button');
      const anyImg = document.querySelector('.td-mod-shot img');
      return {
        n: rows.length,
        ids: rows.map(r => r.getAttribute('data-mod-id')),
        coreInstalled: !!(coreBtn && coreBtn.disabled && /Installerad/.test(coreBtn.textContent)),
        hasImg: !!(anyImg && anyImg.getAttribute('loading') === 'lazy'),
        compact: rows.every(r => r.getBoundingClientRect().height <= 140)
      };
    });
    ok('moduler list compact', page.n >= 8 && page.compact, JSON.stringify({ n: page.n, ids: page.ids }));
    ok('core Installerad', page.coreInstalled);
    ok('lazy previews', page.hasImg);
    await p.screenshot({ path: path.join(out, 'moduler-sida-412-scale14-dark.png') });
    await p.close();
  }

  {
    const p = await openHome({ width: 1024, height: 600, theme: 'dark', scale: '1' });
    await p.screenshot({ path: path.join(out, 'hem-moduler-1024x600-dark.png') });
    await longPress(p, '.icon[data-tool="kordata"]');
    ok('tablet menu', !!(await p.$('#td-lp-menu')));
    await p.screenshot({ path: path.join(out, 'langtryck-meny-1024x600-dark.png') });
    await p.click('#td-lp-menu [data-lp="info"]');
    await p.waitForSelector('#td-info-sheet');
    await p.screenshot({ path: path.join(out, 'modulinfo-1024x600-dark.png') });
    await p.click('#td-info-back');
    await p.click('.icon[data-tool="moduler"]');
    await p.waitForSelector('.td-mod-list');
    await p.screenshot({ path: path.join(out, 'moduler-sida-1024x600-dark.png') });
    await p.close();
  }

  {
    const p = await openHome({ width: 412, height: 780, theme: 'light', scale: '1.25' });
    await p.screenshot({ path: path.join(out, 'hem-moduler-412-scale125-light.png') });
    await longPress(p, '.icon[data-tool="vader"]');
    await p.screenshot({ path: path.join(out, 'langtryck-meny-412-scale125-light.png') });
    await p.close();
  }

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOTS_OK');
})().catch(e => { console.error(e); process.exit(1); });
