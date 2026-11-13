'use strict';
// Efter utloggning på delad enhet töms taxi_view, men adressen kan fortfarande
// vara #view=prognos. Då visades bara "Laddar verktyget…" för att paint()
// krävde taxi_view. Rättningen: start sätter taxi_view, och onPage litar på
// badge.viewing (som P.render sätter innan paint).
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { boot } = require('../lazy-views/dom.cjs');

const root = path.resolve(__dirname, '../..');
const js = fs.readFileSync(path.join(root, 'TaxiData/prognos.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

assert.doesNotMatch(js, /\bStig\b/);
assert.doesNotMatch(cl, /\bStig\b/);
assert.match(lv, /prognos\.js\?v=(20261112pgfix1|20261113skroll1|20261113chatt1|20261113prick2|20261113barn1|20261113sedd1|20261113hem1)/);
assert.match(html, /lazy-views\.js\?v=(20261112pgfix1|20261113mod2|20261113lasbar1|20261113skroll1|20261113chatt1|20261113prick2|20261113barn1|20261113sedd1|20261113hem1)/);
assert.match(lv, /changelog\.js\?v=(20261112pgfix1|20261113mod2|20261113lasbar1|20261113skroll1|20261113chatt1|20261113prick2|20261113barn1|20261113sedd1|20261113hem1)/);
assert.match(cl, /2026-11-12pgfix1/);
assert.match(md, /Laddar verktyget/);
assert.match(js, /function onPage\(\) \{\s*return !!st\.el && st\.el\.isConnected && !!badge\.viewing;/);
assert.doesNotMatch(js, /function onPage\(\) \{[^}]*taxi_view/);
assert.match(js, /localStorage\.setItem\('taxi_view', P\.id\)/);
assert.match(html, /localStorage\.setItem\('taxi_view', savedView\)/);

const pause = () => new Promise((r) => setTimeout(r, 50));

(async () => {
  // Inget taxi_view, bara hash — samma läge som plattan efter delad utloggning.
  const a = await boot({}, '#view=prognos');
  await pause();
  const content = a.w.document.getElementById('content');
  const htmlContent = content ? content.innerHTML : '';
  const title = (a.w.document.getElementById('title') || {}).textContent || '';
  assert.deepEqual(a.errors, [], 'inga JS-fel vid hash-återställning: ' + a.errors.join('; '));
  assert.equal(title, 'Prognos');
  assert.doesNotMatch(htmlContent, /Laddar verktyget/);
  assert.match(htmlContent, /pg-tabs/);
  assert.match(htmlContent, /Schema/);
  assert.equal(a.w.localStorage.getItem('taxi_view'), 'prognos');
  assert(a.w.LAZY.ready('prognos'), 'Prognos lazy-laddad');
  a.dom.window.close();

  // Öppna via meny, töm sedan taxi_view: en senare ommålning ska inte fastna.
  const b = await boot();
  await b.w.openItem('prognos');
  await pause();
  assert.match(b.w.document.getElementById('content').innerHTML, /pg-tabs/);
  b.w.localStorage.removeItem('taxi_view');
  if (typeof b.w.PROGNOS.refresh === 'function') b.w.PROGNOS.refresh();
  else if (b.w.PROGNOS.render) b.w.PROGNOS.render(b.w.document.getElementById('content'));
  await pause();
  const after = b.w.document.getElementById('content').innerHTML;
  assert.doesNotMatch(after, /Laddar verktyget/);
  assert.match(after, /pg-tabs/);
  assert.deepEqual(b.errors, [], 'inga JS-fel efter tömd taxi_view: ' + b.errors.join('; '));
  b.dom.window.close();

  console.log('PASS Prognos ritar efter #view=prognos utan taxi_view, och efter att taxi_view tömts mitt i visningen.');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
