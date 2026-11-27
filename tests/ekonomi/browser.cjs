// Skärmbilder av Admin › Ekonomi i 390 px (ljust + mörkt), påhittad data. Kör: NODE_PATH=<mapp med playwright> node tests/ekonomi/browser.cjs [utmapp]
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const out = process.argv[2] || '/tmp/ekonomi-shots'; fs.mkdirSync(out, { recursive: true });
const fx = require('./fixture.js'), root = path.join(__dirname, '../../TaxiData');
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const theme of ['light', 'dark']) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2 })).newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:var(--bg)"><div id="c" style="padding:12px"></div></body></html>');
    await p.addStyleTag({ path: root + '/tema.css' });
    if (theme === 'dark') await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await p.evaluate(f => { window.esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); window.errText = e => e.message; window.rpc = async () => f; window.render = () => {}; window.openMenu = () => {}; }, fx);
    await p.addScriptTag({ path: root + '/ekonomi.js' });
    await p.evaluate(() => { const E = window.EKONOMI; E.year = 2026; E.month = 10; E.el = document.getElementById('c'); return E.load(); });
    await p.evaluate(() => window.EKONOMI.render(document.getElementById('c')));
    await p.screenshot({ path: out + '/' + theme + '-manad.png', fullPage: true });
    await p.evaluate(() => { const E = window.EKONOMI; E.open = { verkstad: 1, sjuk: 1, total: 1, s472245: 1, t472245: 1 }; E.draw(); });
    await p.screenshot({ path: out + '/' + theme + '-manad-oppen.png', fullPage: true });
    await p.evaluate(() => { const E = window.EKONOMI; E.mode = 'ar'; E.draw(); });
    await p.screenshot({ path: out + '/' + theme + '-ar-oppen.png', fullPage: true });
  }
  await b.close();
  if (errs.length) { console.error('Fel i sidan:', errs); process.exit(1); }
  console.log('PASS skärmbilder i', out);
})();
