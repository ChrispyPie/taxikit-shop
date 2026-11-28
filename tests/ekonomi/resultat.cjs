// Skärmbilder av Admin › Ekonomi › Resultat (utkast) i 390 px, ljust + mörkt, med demo-data (demo.js). Kör: NODE_PATH=<playwright> node tests/ekonomi/resultat.cjs [utmapp]
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const out = process.argv[2] || '/tmp/ekonomi-resultat'; fs.mkdirSync(out, { recursive: true });
const root = path.join(__dirname, '../../TaxiData');
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const theme of ['light', 'dark']) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2 })).newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('dialog', d => d.accept());
    await p.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:var(--bg)"><div id="c" style="padding:12px"></div></body></html>');
    await p.addStyleTag({ path: root + '/tema.css' });
    if (theme === 'dark') await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await p.addScriptTag({ path: root + '/demo.js' });
    await p.evaluate(() => { window.esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); window.errText = e => e.message; window.rpc = async (n, a) => window.DEMO.fixture(n, a || {}, {}); window.render = () => {}; window.openMenu = () => {}; });
    await p.addScriptTag({ path: root + '/ekonomi-resultat.js' });
    await p.addScriptTag({ path: root + '/ekonomi.js' });
    const mm = (await p.evaluate(() => new Date().getMonth()));
    await p.evaluate(m => { const E = window.EKONOMI; E.year = new Date().getFullYear(); E.month = m; E.el = document.getElementById('c'); return E.load(); }, mm);
    await p.evaluate(() => window.EKONOMI.render(document.getElementById('c')));
    await p.waitForTimeout(300);
    await p.screenshot({ path: out + '/' + theme + '-manad.png', fullPage: true });
    await p.evaluate(() => { const E = window.EKONOMI; E.open = { rint: 1, ravg: 1, rlon: 1, rsv: 1, rbil: 1, rman: 1, rmoms: 1 }; E.draw(); });
    await p.waitForTimeout(200);
    await p.screenshot({ path: out + '/' + theme + '-manad-oppen.png', fullPage: true });
    await p.evaluate(() => { const E = window.EKONOMI; E.mode = 'ar'; E.open = { rlon: 1 }; E.draw(); });
    await p.waitForTimeout(200);
    await p.screenshot({ path: out + '/' + theme + '-ar.png', fullPage: true });
    // lägg till och ta bort en kostnad
    await p.evaluate(() => { const E = window.EKONOMI; E.mode = 'manad'; E.open = { rman: 1 }; window.EKRES.form = true; E.draw(); });
    await p.fill('#rs-namn', 'Däckbyte'); await p.fill('#rs-belopp', '8000'); await p.selectOption('#rs-typ', 'engang');
    await p.screenshot({ path: out + '/' + theme + '-formular.png', fullPage: true });
    await p.evaluate(() => window.EKRES.save()); await p.waitForTimeout(300);
    const has = await p.evaluate(() => document.getElementById('c').innerHTML.includes('Däckbyte'));
    if (!has) errs.push('Ny kostnad syns inte efter sparande');
    if (theme === 'light') console.log(await p.evaluate(() => { const c = window.EKRES.calc(window.EKONOMI); return JSON.stringify({ ex: Math.round(c.sel.ex), kost: Math.round(c.sel.kostnader), res: Math.round(c.sel.resultat), moms: Math.round(c.sel.moms) }); }));
  }
  await b.close();
  if (errs.length) { console.error('Fel i sidan:', errs); process.exit(1); }
  console.log('PASS skärmbilder i', out);
})();
