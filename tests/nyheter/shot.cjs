'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
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
const out = process.argv[2] || '/workspace/nyheter-shots';
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

const FIXTURE = {
  updated: '2026-11-11T10:30:00Z',
  feeds: {
    goteborg: { id: 'goteborg', label: 'Göteborg', source: 'SVT Väst', items: [
      { title: 'Extra bussar till evenemanget på Svenska Mässan', summary: 'Trafiken förstärks under kvällen vid Korsvägen, enligt Västtrafik. (påhittat exempel)', source: 'SVT Väst', published: '2026-11-11T09:15:00+01:00', url: 'https://www.svt.se/nyheter/lokalt/vast/' },
      { title: 'Arbete på Götaälvbron påverkar biltrafiken', summary: 'Ett körfält är avstängt i riktning mot Hisingen under förmiddagen. (påhittat exempel)', source: 'SVT Väst', published: '2026-11-11T07:40:00+01:00', url: 'https://www.svt.se/nyheter/lokalt/vast/' },
      { title: 'Solen tittar fram över Göteborg efter natten', summary: 'SMHI räknar med klart väder under dagen, men det blir svalt. (påhittat exempel)', source: 'SVT Väst', published: '2026-11-11T06:10:00+01:00', url: 'https://www.svt.se/nyheter/lokalt/vast/' }
    ]},
    politik: { id: 'politik', label: 'Politik', source: 'SR Studio Ett', items: [
      { title: 'Riksdagen debatterar nya trafikregler', summary: 'Partierna är oense om hur snabbt ändringen ska införas. (påhittat exempel)', source: 'SR Studio Ett', published: '2026-11-11T08:05:00+01:00', url: 'https://sverigesradio.se/studioett' }
    ]},
    sport: { id: 'sport', label: 'Sport', source: 'SVT Sport', items: [
      { title: 'IFK Göteborg tar poäng i kvällsmatchen', summary: 'Oavgjort efter en sen kvittering på Gamla Ullevi. (påhittat exempel)', source: 'SVT Sport', published: '2026-11-10T21:30:00+01:00', url: 'https://www.svt.se/sport/' }
    ]},
    sverige: { id: 'sverige', label: 'Sverige', source: 'SVT Inrikes', items: [
      { title: 'Trafikverket varnar för halt väglag i norr', summary: 'Flera vägar i Norrland kan bli hala under morgonen. (påhittat exempel)', source: 'SVT Inrikes', published: '2026-11-11T05:50:00+01:00', url: 'https://www.svt.se/nyheter/inrikes/' }
    ]},
    noje: { id: 'noje', label: 'Nöje', source: 'SVT Kultur', items: [
      { title: 'Konsertkväll planeras vid Liseberg i vår', summary: 'Arrangören lovar fler utomhuskvällar när säsongen börjar. (påhittat exempel)', source: 'SVT Kultur', published: '2026-11-10T16:00:00+01:00', url: 'https://www.svt.se/kultur/' }
    ]}
  }
};

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none']
  });
  const fails = [];
  const ok = (n, c, e) => { if (!c) fails.push(n + (e ? ': ' + e : '')); else console.log('OK', n); };

  async function openHome({ width, height, theme, scale, installed }) {
    const p = await br.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: width === 1024 ? 1.5 : 2.5, isMobile: width < 800, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', q => q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' }));
    p.on('pageerror', e => { p._errs = (p._errs || []).concat(String(e)); });
    p._errs = [];
    await p.evaluateOnNewDocument((core, theme, scale, installed) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('taxi_session', 'synthetic-test-fixture');
      localStorage.setItem('taxi_driver', '900001');
      localStorage.setItem('taxi_logged_in', '1');
      localStorage.setItem('taxi_theme', theme);
      localStorage.setItem('taxi_animationer', JSON.stringify({ on: false }));
      if (installed) {
        localStorage.setItem('taxi_home_order:900001', JSON.stringify({ ids: ['kordata','nyheter','vader'], hidden: [] }));
      }
      window.TEST_ROLE = 'standard';
      (0, eval)(core);
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--font-scale', scale);
        const b = document.createElement('div');
        b.textContent = 'TESTVY · påhittade exempel';
        b.style = 'text-align:center;background:#243c4b;color:#fde68a;font:11px system-ui;padding:3px 4px;position:absolute;left:0;right:0;top:0;z-index:200;pointer-events:none';
        document.body.prepend(b);
      });
    }, core, theme, scale, !!installed);
    await p.goto(base + '/TaxiData/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForSelector('#app .grid .icon', { visible: true, timeout: 20000 });
    await p.evaluate(s => document.documentElement.style.setProperty('--font-scale', s), scale);
    return p;
  }

  async function openNyheter(p, feeds) {
    await p.evaluate(() => { if (typeof openItem === 'function') openItem('nyheter'); });
    await p.waitForFunction(() => window.current === 'nyheter' && window.NYHETER && typeof NYHETER.setTestData === 'function', { timeout: 20000 });
    await p.evaluate((data, feeds) => {
      if (feeds && feeds.length) NYHETER._writeSel(feeds);
      NYHETER.setTestData(data);
      NYHETER.render(document.getElementById('content'));
    }, FIXTURE, feeds || null);
    await p.waitForSelector('.td-ny-item, .td-ny-err, .td-ny-empty', { timeout: 10000 });
  }

  // Hem: Nyheter ska inte synas förrän den är installerad
  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.4' });
    const onHome = await p.evaluate(() => [...document.querySelectorAll('.icon .label')].map(e => e.textContent));
    ok('nyheter hidden by default', !onHome.includes('Nyheter'), onHome.join(','));
    ok('vader still on home', onHome.includes('Väder'));
    ok('no pageerror home', p._errs.length === 0, p._errs.join('|'));
    await p.screenshot({ path: path.join(out, 'hem-utan-nyheter-412-scale14-dark.png') });
    await p.close();
  }

  // Moduler: Nyheter med Installera
  {
    const p = await openHome({ width: 412, height: 780, theme: 'dark', scale: '1.4' });
    await p.evaluate(() => { if (typeof openItem === 'function') openItem('moduler'); });
    await p.waitForFunction(() => window.current === 'moduler' && document.querySelector('[data-mod-id="nyheter"]'), { timeout: 20000 });
    await p.evaluate(() => {
      const row = document.querySelector('[data-mod-id="nyheter"]');
      if (row) row.scrollIntoView({ block: 'center' });
    });
    const st = await p.evaluate(() => {
      const row = document.querySelector('[data-mod-id="nyheter"]');
      const btn = row && row.querySelector('.td-mod-btn');
      return { text: (btn && btn.textContent) || '', desc: (row && row.querySelector('.td-mod-desc') || {}).textContent || '' };
    });
    ok('moduler installera', st.text === 'Installera', st.text);
    ok('moduler blurb', /Göteborg/.test(st.desc), st.desc);
    ok('no hen/Stig moduler', await p.evaluate(() => !/\bStig\b|\bhen\b/.test(document.body.innerText)));
    await p.screenshot({ path: path.join(out, 'moduler-nyheter-412-scale14-dark.png') });
    await p.close();
  }

  async function listShot(name, width, height, theme, scale, feeds) {
    const p = await openHome({ width, height, theme, scale, installed: true });
    await openNyheter(p, feeds);
    const st = await p.evaluate(() => {
      const items = [...document.querySelectorAll('.td-ny-item')];
      const chips = [...document.querySelectorAll('.td-ny-chip')].map(c => ({ t: c.textContent, on: c.getAttribute('aria-pressed') }));
      const first = items[0];
      const a = first && first.querySelector('a');
      return {
        n: items.length,
        title: first && first.querySelector('.td-ny-title')?.textContent,
        sum: first && first.querySelector('.td-ny-sum')?.textContent,
        meta: first && first.querySelector('.td-ny-meta')?.textContent,
        href: a && a.getAttribute('href'),
        target: a && a.getAttribute('target'),
        chips,
        text: document.body.innerText
      };
    });
    ok(name + ' has items', st.n >= 1, 'n=' + st.n);
    ok(name + ' title', !!st.title);
    ok(name + ' summary', !!st.sum);
    ok(name + ' source+time', /SVT|SR/.test(st.meta || '') && /\d/.test(st.meta || ''), st.meta);
    ok(name + ' opens new tab', st.target === '_blank' && /^https:/.test(st.href || ''), st.href + ' ' + st.target);
    ok(name + ' goteborg chip on', st.chips.some(c => c.t === 'Göteborg' && c.on === 'true'));
    if (feeds && feeds.includes('sport')) ok(name + ' sport chip on', st.chips.some(c => c.t === 'Sport' && c.on === 'true'));
    ok(name + ' no hen/Stig', !/\bStig\b|\bhen\b/.test(st.text));
    ok(name + ' no pageerror', p._errs.length === 0, p._errs.join('|'));
    await p.screenshot({ path: path.join(out, name + '.png') });
    await p.close();
    return st;
  }

  await listShot('nyheter-goteborg-412-scale14-dark', 412, 780, 'dark', '1.4', ['goteborg']);
  await listShot('nyheter-floden-412-scale14-dark', 412, 780, 'dark', '1.4', ['goteborg', 'sport', 'politik']);
  await listShot('nyheter-goteborg-1024x600-dark', 1024, 600, 'dark', '1', ['goteborg']);

  await br.close();
  server.close();
  if (fails.length) { console.error('FAILS\n' + fails.join('\n')); process.exit(1); }
  console.log('SHOTS_OK');
})().catch(e => { console.error(e); process.exit(1); });
