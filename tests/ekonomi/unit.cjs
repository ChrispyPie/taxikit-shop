// Admin › Ekonomi: summor per månad/år, per förare och CSV. Påhittad data (fixture.js), ingen server.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../TaxiData/ekonomi.js', 'utf8');
const fx = require('./fixture.js');
const c = { console, Intl, Date, Promise, setTimeout, Blob: function () {}, URL: {}, navigator: {}, window: null,
  document: { head: { appendChild() {} }, body: { contains: () => true }, createElement: () => ({}) },
  esc: x => String(x == null ? '' : x), errText: e => e.message, openMenu() {}, render() {}, alert() {}, prompt() {}, rpc: async () => fx };
c.window = c; vm.createContext(c); vm.runInContext(src, c);
const E = c.EKONOMI;
(async () => {
  E.year = 2026; E.month = 10; E.mode = 'manad'; await E.load(true);
  assert.strictEqual(E.data.verkstad.length, 6);
  // Nytt: eftersom render() är stubbad räcker det att läsa csv
  const out = []; c.Blob = function (parts) { out.push(parts[0]); };
  c.URL = { createObjectURL: () => 'x', revokeObjectURL() {} };
  c.document.body.appendChild = () => {}; c.document.createElement = () => ({ click() {}, remove() {} });
  E.mode = 'manad'; E.month = 10; await E.csv();
  const nov = out.pop().replace('\ufeff', '').split('\r\n');
  assert(nov[0].startsWith('Period;Förare;Förar-ID;Verkstadstimmar (h)'));
  const tot = nov[nov.length - 1].split(';');
  assert.strictEqual(tot[1], 'Totalt'); assert.strictEqual(tot[4], '787', 'verkstad november = 787 kr (som före ändringen)');
  assert.strictEqual(tot[6], '1821', 'sjuklön november'); assert.strictEqual(tot[7], String(787 + 1821));
  E.month = 9; await E.csv();
  const okt = out.pop().replace('\ufeff', '').split('\r\n'); const t2 = okt[okt.length - 1].split(';');
  assert.strictEqual(t2[4], '681'); assert.strictEqual(t2[6], '1184'); assert.strictEqual(t2[5], '4');
  E.mode = 'ar'; await E.csv();
  const ar = out.pop().replace('\ufeff', '').split('\r\n'); const t3 = ar[ar.length - 1].split(';');
  assert.strictEqual(t3[4], String(504 + 65 + 112 + 281 + 506)); assert.strictEqual(t3[6], String(1184 + 1821)); assert.strictEqual(t3[5], '8');
  assert.strictEqual(ar.length, 1 + 5 + 1, 'en rad per månad och förare med belopp + total');
  // Sjuklön delas per månad: 4 + 4 dagar, karens i första månaden
  assert.strictEqual(E.data.sjuk[0].karens, 637.45); assert.strictEqual(E.data.sjuk[1].karens, 0);
  console.log('PASS Ekonomi: månad, år, per förare och CSV stämmer');
})().catch(e => { console.error(e); process.exit(1); });
