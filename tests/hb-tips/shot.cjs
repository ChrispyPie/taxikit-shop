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
const out = process.argv[2] || '/workspace/tipguide-shots';
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
    b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:absolute;left:0;right:0;top:0;z-index:200;pointer-events:none';
    document.body.prepend(b);
  }, scale);
  await p.waitForFunction(() => window.HJALPBOT && window.HJALPBOT_TIPS && document.querySelector('.hb-walker'), { timeout: 8000 });
  // Park the bot in a lower corner so the fast glide to the profile icon is visible.
  await p.evaluate(() => {
    if (window.HJALPBOT && HJALPBOT._previewPos) HJALPBOT._previewPos(24, Math.max(320, window.innerHeight - 80), 0);
  });
  return p;
}

async function bubbleBox(p) {
  return p.evaluate(() => {
    const b = document.querySelector('.hb-bubble');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const txt = b.querySelector('.hb-bubble-txt');
    return {
      l: r.left, t: r.top, r: r.right, b: r.bottom,
      w: window.innerWidth, h: window.innerHeight,
      side: b.getAttribute('data-side'),
      hasTail: !!b.querySelector('.hb-bubble-tail'),
      show: b.classList.contains('show'),
      text: txt ? txt.textContent : b.textContent,
      hen: /\bStig\b|\bhen\b/.test(document.body.innerText)
    };
  });
}

async function waitGuided(p, { openMenu }) {
  const t0 = Date.now();
  await p.waitForFunction((openMenu) => {
    const bot = document.querySelector('.hb-walker');
    const btn = document.getElementById('profile-btn');
    const menu = document.getElementById('profile-menu');
    const item = document.getElementById('menu-inkorg');
    if (!bot || !btn) return false;
    const a = bot.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const dx = Math.abs((a.right) - (b.right));
    const below = a.top >= b.bottom - 12 && a.top < b.bottom + 90;
    const atIcon = dx < 56 && below;
    if (openMenu) {
      return !!(menu && menu.classList.contains('show') && item && item.classList.contains('hb-tip-hl') && /Meddelanden/.test(item.textContent));
    }
    return atIcon && btn.classList.contains('hb-tip-hl');
  }, { timeout: 5000 }, !!openMenu);
  return Date.now() - t0;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

  // Animationer av: tipset visas, ikonen markeras direkt, tryck öppnar Meddelanden.
  {
    const p = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4', anim: '0' });
    ok('no pageerror off', p._errs.length === 0, p._errs.join('|'));
    const shown = await p.evaluate(() => {
      const hit = window.HJALPBOT.previewTip('verkstadstimmar-flyttad');
      const b = document.querySelector('.hb-bubble');
      const txt = b && b.querySelector('.hb-bubble-txt');
      const btn = document.getElementById('profile-btn');
      return {
        ok: !!(hit && b && b.classList.contains('show') && b.classList.contains('hb-tap') && /Meddelanden/.test((txt || b).textContent)),
        hl: !!(btn && btn.classList.contains('hb-tip-hl')),
        text: txt ? txt.textContent : (b ? b.textContent : '')
      };
    });
    ok('static tip bubble', shown.ok, JSON.stringify(shown));
    ok('highlights profile icon without walk', shown.hl);
    const box = await bubbleBox(p);
    ok('bubble on-screen anim-off', box && box.l >= -1 && box.t >= -1 && box.r <= box.w + 1 && box.b <= box.h + 1, JSON.stringify(box));
    ok('comic tail anim-off', box && box.hasTail && (box.side === 'above' || box.side === 'below'), JSON.stringify(box));
    ok('no hen/Stig anim-off', box && !box.hen);
    await new Promise(r => setTimeout(r, 200));
    await p.screenshot({ path: path.join(out, 'tips-verkstad-412-scale14-dark.png') });

    await p.click('.hb-bubble.hb-tap');
    await p.waitForSelector('#profile-menu.show', { timeout: 4000 });
    const hl = await p.evaluate(() => {
      const item = document.getElementById('menu-inkorg');
      return !!(item && item.classList.contains('hb-tip-hl') && /Meddelanden/.test(item.textContent));
    });
    ok('highlights Meddelanden anim-off', hl);
    await new Promise(r => setTimeout(r, 200));
    await p.screenshot({ path: path.join(out, 'tips-verkstad-meny-412-scale14-dark.png') });
    await p.close();
  }

  // Animationer på: automatisk snabb glidning till profilikonen, sedan tryck öppnar menyn.
  {
    const p = await openHome(br, base, { width: 412, height: 780, theme: 'dark', scale: '1.4', anim: '1' });
    await p.evaluate(() => window.HJALPBOT.previewTip('verkstadstimmar-flyttad'));
    const ms = await waitGuided(p, { openMenu: false });
    ok('fast glide to profile <= 1600ms', ms <= 1600, 'took ' + ms);
    const box = await bubbleBox(p);
    ok('bubble on-screen after glide', box && box.show && box.l >= -1 && box.t >= -1 && box.r <= box.w + 1 && box.b <= box.h + 1, JSON.stringify(box));
    ok('comic tail after glide', box && box.hasTail && ['above', 'below', 'left', 'right'].indexOf(box.side) >= 0, JSON.stringify(box));   // 2026-11-12: bubblan kan öppna åt sidan när boten leder
    ok('no hen/Stig after glide', box && !box.hen);
    ok('no pageerror anim-on', p._errs.length === 0, p._errs.join('|'));
    await new Promise(r => setTimeout(r, 150));
    await p.screenshot({ path: path.join(out, 'tips-guide-profil-412-scale14-dark.png') });

    await p.click('.hb-bubble.hb-tap, .hb-bubble.show');
    const ms2 = await waitGuided(p, { openMenu: true });
    ok('menu opens after tap', true, 'menu in ' + ms2);
    await new Promise(r => setTimeout(r, 200));
    await p.screenshot({ path: path.join(out, 'tips-guide-meny-412-scale14-dark.png') });
    await p.close();
  }

  // Ljust tema: pratbubblan ska vara läsbar.
  {
    const p = await openHome(br, base, { width: 412, height: 780, theme: 'light', scale: '1.4', anim: '1' });
    await p.evaluate(() => window.HJALPBOT.previewTip('verkstadstimmar-flyttad'));
    await waitGuided(p, { openMenu: false });
    const box = await bubbleBox(p);
    ok('bubble on-screen light', box && box.l >= -1 && box.t >= -1 && box.r <= box.w + 1 && box.b <= box.h + 1, JSON.stringify(box));
    ok('comic tail light', box && box.hasTail);
    await p.screenshot({ path: path.join(out, 'tips-guide-profil-412-scale14-light.png') });
    await p.close();
  }

  // 1024×600
  {
    const p = await openHome(br, base, { width: 1024, height: 600, theme: 'dark', scale: '1', anim: '1' });
    await p.evaluate(() => window.HJALPBOT.previewTip('verkstadstimmar-flyttad'));
    await waitGuided(p, { openMenu: false });
    const box = await bubbleBox(p);
    ok('bubble on-screen 1024', box && box.l >= -1 && box.t >= -1 && box.r <= box.w + 1 && box.b <= box.h + 1, JSON.stringify(box));
    await p.screenshot({ path: path.join(out, 'tips-guide-profil-1024x600-dark.png') });
    await p.click('.hb-bubble.hb-tap, .hb-bubble.show');
    await waitGuided(p, { openMenu: true });
    await new Promise(r => setTimeout(r, 250));
    await p.screenshot({ path: path.join(out, 'tips-guide-meny-1024x600-dark.png') });
    await p.close();
  }

  await br.close(); server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOT_OK', out);
})().catch(e => { console.error(e); process.exit(1); });
