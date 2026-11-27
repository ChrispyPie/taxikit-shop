// Ekonomi fas 2: löneunderlag per förare (sektionen laddas först när den öppnas). Påhittad data, ingen server.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../TaxiData/ekonomi.js', 'utf8');
const fx = require('./fixture.js');
const lu = { from: '2026-11-01', to: '2026-11-30', provision: 37, forare: [
  { driver_id: '472245', namn: 'Richard D.', l: { lon: '18456.60', sem: '2399.36', inkort: '56257.00', uber: '0.00', lonegrund: '49882.70', provision: '37.000', kordagar: 21, pass: 21 }, manader: [{ mon: '2026-10-01', l: { lon: '9000', sem: '1000', lonegrund: '24000' } }, { mon: '2026-11-01', l: { lon: '9456.60', sem: '1399.36', lonegrund: '25882.70' } }] },
  { driver_id: '179629', namn: 'Matte T.', l: { lon: '5811.72', sem: '755.52', inkort: '19554.00', uber: '0.00', lonegrund: '15707.36', provision: '37.000', kordagar: 10, pass: 10 } }] };
const calls = [];
const c = { console, Intl, Date, Promise, setTimeout, Blob: function () {}, URL: {}, navigator: {}, window: null,
  document: { head: { appendChild() {} }, body: { contains: () => true }, createElement: () => ({}) },
  esc: x => String(x == null ? '' : x), errText: e => e.message, openMenu() {}, render() {}, alert() {}, prompt() {},
  rpc: async (n, a) => { calls.push([n, a]); return n === 'ekonomi_loneunderlag' ? lu : fx; } };
c.window = c; vm.createContext(c); vm.runInContext(src, c);
const E = c.EKONOMI;
(async () => {
  E.year = 2026; E.month = 10; E.mode = 'manad'; await E.load(true);
  E.el = { innerHTML: '' }; E.render(E.el);
  assert(!calls.some(x => x[0] === 'ekonomi_loneunderlag'), 'laddas inte förrän sektionen öppnas');
  assert(E.el.innerHTML.includes('Löneunderlag'));
  E.tg({ getAttribute: () => 'lu', open: true });
  await new Promise(r => setTimeout(r, 20));
  const call = calls.find(x => x[0] === 'ekonomi_loneunderlag');
  assert.strictEqual(JSON.stringify(call[1]), JSON.stringify({ p_from: '2026-11-01', p_to: '2026-11-30' }));
  const h = E.el.innerHTML;
  assert(h.includes('2 förare') && h.includes('Lönegrund') && h.includes('37 % av lönegrund'));
  assert(h.includes((18456.6 + 2399.36 + 5811.72 + 755.52).toLocaleString('sv-SE', { maximumFractionDigits: 0 })));
  // Årsvy: en rad per månad och förare under varje förare
  E.mode = 'ar'; E.year = 2026; E.luFail = null; E.open.lu = true; E.open.l472245 = true;
  lu.from = '2026-01-01'; lu.to = '2026-12-31'; E.render(E.el); await new Promise(r => setTimeout(r, 20));
  assert(calls.some(x => x[0] === 'ekonomi_loneunderlag' && x[1].p_from === '2026-01-01'));
  const ya = E.el.innerHTML; assert(ya.includes('Oktober') && ya.includes('November') && ya.includes('lönegrund'));
  // CSV med löneunderlag (månad)
  const out = []; c.Blob = function (parts) { out.push(parts[0]); }; c.URL = { createObjectURL: () => 'x', revokeObjectURL() {} };
  c.document.body.appendChild = () => {}; c.document.createElement = () => ({ click() {}, remove() {} });
  E.mode = 'manad'; E.year = 2026; E.month = 10; lu.from = '2026-11-01'; lu.to = '2026-11-30'; await E.csv();
  const csv = out.pop().replace('\ufeff', '').split('\r\n');
  const i = csv.indexOf('Löneunderlag;Förare;Förar-ID;Inkört (kr);Uber (kr);Lönegrund (kr);Provision (%);Lön (kr);Semesterersättning (kr);Lön + semester (kr)');
  assert(i > 0, 'rubrikrad för löneunderlag');
  assert.strictEqual(csv[i + 1], 'November 2026;Richard D.;472245;56257;0;49883;37;18457;2399;20856');
  assert.strictEqual(csv[csv.length - 1], 'November 2026;Totalt;;75811;0;65590;;24268;3155;27423');
  // CSV årsvy: månadsrader + summa
  E.mode = 'ar'; lu.from = '2026-01-01'; lu.to = '2026-12-31'; await E.csv();
  const ay = out.pop(); assert(ay.includes('Oktober 2026;Richard D.;472245;') && ay.includes('År 2026 (summa);Richard D.'));
  console.log('PASS Ekonomi fas 2: löneunderlag per förare');
})().catch(e => { console.error(e); process.exit(1); });
