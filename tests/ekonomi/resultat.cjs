// Skärmbilder av Admin › Ekonomi › Resultat (utkast) i 390 px, ljust + mörkt, med demo-data.
// Kör: NODE_PATH=<playwright> node tests/ekonomi/resultat.cjs [utmapp]
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const out = process.argv[2] || '/tmp/ekonomi-resultat'; fs.mkdirSync(out, { recursive: true });
const root = path.join(__dirname, '../../TaxiData');
const csv = 'Datum;Beskrivning;Belopp\n2026-11-03;OKQ8 Kållered;1 245,50\n2026-11-10;Circle K Sisjön;2 110,00\n2026-11-18;Laddning hemma;890,25\n';
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
    const mm = await p.evaluate(() => new Date().getMonth());
    await p.evaluate(m => { const E = window.EKONOMI; E.year = new Date().getFullYear(); E.month = m; E.el = document.getElementById('c'); return E.load(); }, mm);
    await p.evaluate(() => window.EKONOMI.render(document.getElementById('c')));
    await p.waitForTimeout(250);
    const html0 = await p.evaluate(() => document.getElementById('c').innerHTML);
    if (!html0.includes('Efter bolagsskatt') && !html0.includes('efter bolagsskatt')) errs.push('saknar bolagsskatt i rubriken');
    if (!html0.includes('Redigera i Bilar')) errs.push('saknar länk Redigera i Bilar');
    if (!html0.includes('Toyota Mirai') || !html0.includes('Leasing')) errs.push('saknar Mirai-leasing');
    if (!html0.includes('kolla med Berra')) errs.push('saknar flagga kolla med Berra');
    if (!html0.includes('Taxi Göteborg-avgift')) errs.push('saknar TG-avgift');
    if (!html0.includes('Ladda upp månadsutdrag')) errs.push('saknar uppladdning av utdrag');
    await p.screenshot({ path: out + '/' + theme + '-manad.png', fullPage: true });
    await p.evaluate(() => { const E = window.EKONOMI; E.open = { rint: 1, ravg: 1, rlon: 1, rsv: 1, rbil: 1, rbra: 1, rman: 1, rmoms: 1 }; E.draw(); });
    await p.waitForTimeout(150);
    await p.screenshot({ path: out + '/' + theme + '-manad-oppen.png', fullPage: true });
    // Ändra befintlig kostnad (Bokföring)
    await p.evaluate(() => window.EKRES.edit(2));
    await p.waitForTimeout(100);
    if (theme === 'light') await p.screenshot({ path: out + '/' + theme + '-andring.png', fullPage: true });
    await p.fill('#rs-belopp', '7200');
    await p.evaluate(() => window.EKRES.save());
    await p.waitForTimeout(200);
    const afterEdit = await p.evaluate(() => document.getElementById('c').innerHTML);
    if (!afterEdit.includes('Bokföring')) errs.push('Bokföring försvann efter ändring');
    // Årsvy
    await p.evaluate(() => { const E = window.EKONOMI; E.mode = 'ar'; E.open = { rbil: 1, rmoms: 1 }; E.draw(); });
    await p.waitForTimeout(150);
    await p.screenshot({ path: out + '/' + theme + '-ar.png', fullPage: true });
    // Bränsleutdrag: ladda CSV och bekräfta
    await p.evaluate(() => { const E = window.EKONOMI; E.mode = 'manad'; E.open = { rbra: 1 }; E.draw(); });
    await p.setInputFiles('input[type=file]', { name: 'utdrag-november.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    await p.waitForTimeout(400);
    const prop = await p.evaluate(() => document.getElementById('c').innerHTML);
    if (!prop.includes('Föreslagen summa') || !/4[\s\u00a0&nbsp;]*246/.test(prop)) errs.push('föreslagen CSV-summa saknas');
    if (theme === 'light') await p.screenshot({ path: out + '/' + theme + '-utdrag-forslag.png', fullPage: true });
    await p.evaluate(() => window.EKRES.confirmUtdrag());
    await p.waitForTimeout(250);
    const done = await p.evaluate(() => document.getElementById('c').innerHTML);
    if (!done.includes('Bränsle och el') || !done.includes('Bekräftad')) errs.push('bekräftat utdrag syns inte');
    if (theme === 'light') {
      await p.screenshot({ path: out + '/' + theme + '-utdrag-sparat.png', fullPage: true });
      const nums = await p.evaluate(() => { const c = window.EKRES.calc(window.EKONOMI); return JSON.stringify({ ex: Math.round(c.sel.ex), kost: Math.round(c.sel.kostnader), fore: Math.round(c.sel.resultat), skatt: Math.round(c.sel.skatt), efter: Math.round(c.sel.efter), tg: Math.round(c.sel.tg), bil: Math.round(c.sel.bil), bra: Math.round(c.sel.bra) }); });
      console.log(nums);
    }
  }
  await b.close();
  if (errs.length) { console.error('Fel i sidan:', errs); process.exit(1); }
  console.log('PASS skärmbilder i', out);
})();
