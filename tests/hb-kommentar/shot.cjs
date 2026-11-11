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
const out = process.argv[2] || '/workspace/komm-shots';
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

async function openHome(br, base, { width, height, theme, scale, char }) {
  const p = await br.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: width === 1024 ? 1.5 : 2.5, isMobile: width < 800, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
  p._errs = [];
  p.on('pageerror', e => p._errs.push(String(e)));
  await p.evaluateOnNewDocument((core, theme, scale, char) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('taxi_session', 'synthetic-test-fixture');
    localStorage.setItem('taxi_driver', '900001');
    localStorage.setItem('taxi_logged_in', '1');
    localStorage.setItem('taxi_theme', theme);
    if (char) localStorage.setItem('hb_char_900001', char);
    window.TEST_ROLE = 'standard';
    (0, eval)(core);
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--font-scale', scale);
    });
  }, core, theme, scale, char || 'robot');
  await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
  await p.evaluate(s => {
    document.documentElement.style.setProperty('--font-scale', s);
    const b = document.createElement('div');
    b.textContent = 'TESTVY · påhittade exempel';
    b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:absolute;left:0;right:0;top:0;z-index:200;pointer-events:none';
    document.body.prepend(b);
  }, scale);
  await p.waitForFunction(() => window.HJALPBOT && window.HJALPBOT_SCENARIER, { timeout: 8000 });
  return p;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  const p = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4', char: 'robot' });
  ok('home no pageerror', p._errs.length === 0, p._errs.join('|'));

  const vis = await p.evaluate(() => {
    window.HJALPBOT.previewMarvin('Hjärna stor som en planet, och de låter mig visa taxibokningar.');
    const w = document.querySelector('.hb-walker');
    const b = document.querySelector('.hb-bubble');
    return {
      marvin: !!(w && w.classList.contains('hb-marvin')),
      bubble: !!(b && b.classList.contains('show') && /planet/.test(b.textContent || '')),
      text: b ? b.textContent : ''
    };
  });
  ok('marvin class + bubble', vis.marvin && vis.bubble, JSON.stringify(vis));
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: path.join(out, 'marvin-412-scale14-dark.png') });

  await p.evaluate(() => window.HJALPBOT.previewSay('Svaret är 42. Precis så många körningar den här månaden. Frågan kör vi fortfarande på.'));
  await new Promise(r => setTimeout(r, 200));
  await p.screenshot({ path: path.join(out, 'fyrtioeva-412-scale14-dark.png') });

  await p.evaluate(() => window.HJALPBOT.previewSay('Don’t panic. Servern krånglar lite, inte universum. Jag försöker igen strax.'));
  await new Promise(r => setTimeout(r, 200));
  await p.screenshot({ path: path.join(out, 'dont-panic-412-scale14-dark.png') });

  const inn = await p.evaluate(() => window.HJALPBOT.previewVisit('kordata', 'in'));
  ok('visit in', !!inn);
  await new Promise(r => setTimeout(r, 200));
  await p.screenshot({ path: path.join(out, 'besok-in-412-scale14-dark.png') });

  const outp = await p.evaluate(() => window.HJALPBOT.previewVisit('kordata', 'out', 'Beräkning klar: 1 200 kr inkört idag. Bip!'));
  ok('visit out', !!outp);
  const tap = await p.evaluate(() => {
    const b = document.querySelector('.hb-bubble');
    return !!(b && b.classList.contains('show') && b.classList.contains('hb-tap'));
  });
  ok('bubble tappable', tap);
  await new Promise(r => setTimeout(r, 200));
  await p.screenshot({ path: path.join(out, 'besok-ut-412-scale14-dark.png') });
  await p.close();

  const m = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4', char: 'chauffor' });
  await m.evaluate(() => {
    window.HJALPBOT.previewStation('chauffor');
    window.HJALPBOT.previewSay('Snyggt! 200 kr över målet. Precis som min kaffekopp. Bra kört!', 'kordata');
  });
  await new Promise(r => setTimeout(r, 250));
  await m.screenshot({ path: path.join(out, 'pappa-skamt-412-scale14-dark.png') });
  await m.close();

  const d = await openHome(br, base, { width: 412, height: 780, theme: 'light', scale: '1.4', char: 'diva' });
  await d.evaluate(() => {
    window.HJALPBOT.previewStation('diva');
    window.HJALPBOT.previewSay('Regn, stjärna. Ta paraply. Det här håret är inte skapat för blåst. 😉', 'vader');
  });
  await new Promise(r => setTimeout(r, 250));
  await d.screenshot({ path: path.join(out, 'diva-regn-412-scale14-light.png') });
  await d.close();

  const t = await openHome(br, base, { width: 1024, height: 600, theme: 'dark', scale: '1', char: 'robot' });
  await t.evaluate(() => window.HJALPBOT.previewMarvin('Jag har räknat ut din prognos. Den deprimerade mig.'));
  await new Promise(r => setTimeout(r, 250));
  await t.screenshot({ path: path.join(out, 'marvin-1024x600-dark.png') });
  ok('tablet no pageerror', t._errs.length === 0, t._errs.join('|'));
  await t.close();

  await br.close();
  server.close();
  if (fails.length) {
    console.error('FAILS\n' + fails.join('\n'));
    process.exit(1);
  }
  console.log('SHOT_OK', out);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
