'use strict';
// Skärmdump av kvittolistan (exempel, 390 px bredd). Kör: node tests/korpass-kvitto-lista/shot.cjs
const puppeteer = require('../meddelanden/node_modules/puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const out = path.join(__dirname, 'shot-open.png');

const pageHtml = `<!doctype html>
<html lang="sv">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Körpassdata kvitto</title>
<link rel="stylesheet" href="/TaxiData/style.css?v=20261123zmys1">
<style>
  html, body { margin: 0; background: var(--bg); color: var(--text); }
  .shot-note { text-align: center; font-size: 11px; color: var(--muted); padding: 8px 10px 0; }
</style>
<body>
<div id="dashboard-view">
  <main id="dashboard" style="margin-top:0.4rem">
    <p class="shot-note">Exempel: pass #4207 · 22/11 (samma lista som i Körpassdata)</p>
    <div class="section">
      <div class="stat-row open" data-passnr="4207">
        <span class="toggle">−</span>
        <button type="button" class="pr-ico" title="Passrapport" aria-label="Passrapport"></button>
        <span class="label">#4207</span>
        <span class="value">3 560 kr</span>
      </div>
      <div class="shift-content" style="display:block">

        <div class="sub shift-trip open" data-kvittonr="030596-01">
          <span class="toggle">−</span>
          <button type="button" class="kv-ico" title="Kvittokopia" aria-label="Kvittokopia"></button>
          <div class="trip-body">
            <div class="trip-head">
              <span class="label kv-nr">030596-01<span class="trip-tid">03:42</span></span>
              <span class="value">412 kr</span>
            </div>
            <div class="sub trip-detail visible"><span>Start</span><span>03:42 – zon 291</span></div>
            <div class="sub trip-detail visible"><span>Slut</span><span>04:01 – zon 10</span></div>
            <div class="sub trip-detail visible"><span>Typ</span><span>Kort</span></div>
            <div class="sub trip-detail visible"><span>Dricks</span><span>0 kr</span></div>
          </div>
        </div>

        <div class="sub shift-trip" data-kvittonr="030597-01">
          <span class="toggle">+</span>
          <button type="button" class="kv-ico" title="Kvittokopia" aria-label="Kvittokopia"></button>
          <div class="trip-body">
            <div class="trip-head">
              <span class="label kv-nr">030597-01<span class="trip-tid">04:20</span></span>
              <span class="value">320 kr</span>
            </div>
            <div class="sub trip-detail"><span>Start</span><span>04:20 – zon 117</span></div>
            <div class="sub trip-detail"><span>Slut</span><span>04:35 – zon 10</span></div>
            <div class="sub trip-detail"><span>Typ</span><span>Kort</span></div>
            <div class="sub trip-detail"><span>Dricks</span><span>0 kr</span></div>
          </div>
        </div>

        <div class="sub shift-trip" data-kvittonr="030598-01">
          <span class="toggle">+</span>
          <button type="button" class="kv-ico" title="Kvittokopia" aria-label="Kvittokopia"></button>
          <div class="trip-body">
            <div class="trip-head">
              <span class="label kv-nr">030598-01<span class="trip-tid">09:15</span></span>
              <span class="value">150 kr</span>
            </div>
            <div class="sub trip-detail"><span>Start</span><span>09:15 – zon 10</span></div>
            <div class="sub trip-detail"><span>Slut</span><span>09:28 – zon 117</span></div>
            <div class="sub trip-detail"><span>Typ</span><span>Kort</span></div>
            <div class="sub trip-detail"><span>Dricks</span><span>0 kr</span></div>
          </div>
        </div>

      </div>
    </div>
  </main>
</div>
</body>
</html>`;

const server = http.createServer((q, r) => {
  const u = decodeURI(q.url.split('?')[0]);
  if (u === '/' || u === '/shot.html') {
    r.setHeader('Content-Type', 'text/html; charset=utf-8');
    return r.end(pageHtml);
  }
  const f = path.resolve(root, '.' + u);
  if (!f.startsWith(root)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); return r.end(); }
    r.setHeader('Content-Type', f.endsWith('.css') ? 'text/css' : 'text/html');
    r.end(b);
  });
});

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const base = 'http://127.0.0.1:' + server.address().port;
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const p = await br.newPage();
  await p.setViewport({ width: 390, height: 700, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(base + '/shot.html', { waitUntil: 'networkidle0' });
  const metrics = await p.evaluate(() => {
    const row = document.querySelector('[data-kvittonr="030596-01"]');
    const nr = row.querySelector('.kv-nr');
    const tid = row.querySelector('.trip-tid');
    const det = row.querySelector('.trip-detail.visible span');
    const head = row.querySelector('.trip-head');
    const nrR = nr.getBoundingClientRect();
    // left of the number text, not the time (time is under the number on narrow screens)
    const range = document.createRange();
    const firstText = [...nr.childNodes].find(n => n.nodeType === 3);
    range.selectNodeContents(firstText);
    const numR = range.getBoundingClientRect();
    const detR = det.getBoundingClientRect();
    const headR = head.getBoundingClientRect();
    return {
      numLeft: +numR.left.toFixed(1),
      detLeft: +detR.left.toFixed(1),
      gap: +(detR.top - headR.bottom).toFixed(1),
      tidText: tid && tid.textContent,
      tidTop: +tid.getBoundingClientRect().top.toFixed(1),
      numBottom: +numR.bottom.toFixed(1),
      amtRight: +row.querySelector('.value').getBoundingClientRect().right.toFixed(1)
    };
  });
  console.log('METRICS', JSON.stringify(metrics));
  const misalign = Math.abs(metrics.numLeft - metrics.detLeft);
  if (misalign > 2) console.warn('ALIGN_WARN', misalign);
  if (metrics.gap > 4) console.warn('GAP_WARN', metrics.gap);
  const clip = await p.evaluate(() => {
    const main = document.getElementById('dashboard');
    const r = main.getBoundingClientRect();
    return { x: 0, y: 0, width: 390, height: Math.min(700, Math.ceil(r.bottom + 12)) };
  });
  await p.screenshot({ path: out, clip, type: 'png' });
  await br.close();
  server.close();
  console.log('SHOT', out);
})().catch(e => { console.error(e); process.exit(1); });
