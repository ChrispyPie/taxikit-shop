// Ekonomi fas 2: löneunderlag per förare (sektionen laddas först när den öppnas). Påhittad data, ingen server.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../TaxiData/ekonomi.js', 'utf8');
const fx = require('./fixture.js');
const lu = { from: '2026-11-01', to: '2026-11-30', provision: 37, forare: [
  { driver_id: '472245', namn: 'Richard D.', l: { lon: '18456.60', sem: '2399.36', inkort: '56257.00', uber: '0.00', lonegrund: '49882.70', provision: '37.000', kordagar: 21, pass: 21 } },
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
  console.log('PASS Ekonomi fas 2: löneunderlag per förare');
})().catch(e => { console.error(e); process.exit(1); });
