'use strict';
// Fri placering på startskärmen (2026-11-14fri1): rena funktioner i HEM_ORDNING.free + serverns städning (PGlite om den finns).
// Kör: node tests/hem-fri/unit.cjs   (PGLITE=/tmp/pgl/node_modules/@electric-sql/pglite för SQL-delen)
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning.js'), 'utf8');
const ls = { _s: {}, getItem(k) { return k in this._s ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
const documentStub = {
  getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }; },
  head: { appendChild() {} }, body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
  addEventListener() {}, readyState: 'complete', documentElement: { getAttribute() { return null; } }
};
const ctx = { window: { addEventListener() {}, driverData: {} }, document: documentStub, localStorage: ls, fetch() { return Promise.resolve({ ok: false, text: () => Promise.resolve('') }); }, console, setTimeout, clearTimeout };
vm.createContext(ctx); vm.runInContext(src, ctx);
const F = ctx.window.HEM_ORDNING.free;
const plain = x => JSON.parse(JSON.stringify(x));

// Utan sparat: packat i ordning
assert.deepEqual(plain(F.resolve(['a', 'b', 'c', 'd', 'e'], 4, {})), { a: [0, 0], b: [0, 1], c: [0, 2], d: [0, 3], e: [1, 0] });
// Sparat med tomma rutor i mitten: kanterna, mitten tom
const edges = { 4: { a: [0, 0], b: [0, 3], c: [1, 0], d: [1, 3], e: [2, 0], moduler: [2, 3] } };
let r = plain(F.resolve(['a', 'b', 'c', 'd', 'e', 'moduler'], 4, edges));
assert.deepEqual(r, edges[4]);
// Nytt verktyg hamnar efter sista upptagna rutan, inte i de medvetet tomma rutorna
r = plain(F.resolve(['a', 'b', 'c', 'd', 'e', 'moduler', 'ny'], 4, edges));
assert.deepEqual(r.ny, [3, 0]);
// Krock (två på samma ruta i trasig data) -> närmaste lediga
r = plain(F.resolve(['a', 'b'], 4, { 4: { a: [1, 1] } }));
assert.deepEqual(r.a, [1, 1]); assert.deepEqual(r.b, [1, 2]);
// Annat kolumnantal (stående/liggande): kanterna stannar vid kanterna
r = plain(F.resolve(['a', 'b', 'c', 'd', 'e', 'moduler'], 8, edges));
assert.deepEqual(r.a, [0, 0]); assert.deepEqual(r.b, [0, 7]); assert.deepEqual(r.moduler, [2, 7]);
r = plain(F.resolve(['a', 'b', 'c', 'd', 'e', 'moduler'], 3, edges));
assert.deepEqual(r.b, [0, 2]); assert.deepEqual(r.d, [1, 2]);
// Eget sparat för just det kolumnantalet vinner över härlett
r = plain(F.resolve(['a', 'b'], 3, { 4: { a: [0, 0], b: [0, 3] }, 3: { a: [2, 1], b: [0, 0] } }));
assert.deepEqual(r, { a: [2, 1], b: [0, 0] });
// Sorterad läsordning
assert.deepEqual(plain(F.sorted({ x: [1, 0], y: [0, 2], z: [0, 1] })), ['z', 'y', 'x']);
// Städning: fel nycklar, id, rutor utanför och dubbletter tas bort
const cp = plain(F.cleanPos({ 4: { a: [0, 0], b: [0, 4], c: [0, 0], 'X!': [1, 1], d: [1.5, 0], e: [70, 1], f: [2, 3] }, 99: { a: [0, 0] }, x: 1 }));
assert.deepEqual(cp, { 4: { a: [0, 0], f: [2, 3] } });
assert.deepEqual(plain(F.cleanPos(null)), {}); assert.deepEqual(plain(F.cleanPos([1])), {});
// Sida 2 (2026-11-14sidor1): egna positioner (e<n>), lista över vad som ligger där, borttagna genvägar
const sp = { 4: { a: [0, 0] }, e4: { b: [3, 3], c: [0, 0] }, e9: { b: [0, 8] }, sida2: ['b', 'c', 'b', 'X!', 7], ute: ['om', 'moduler', 'om'] };
assert.deepEqual(plain(F.cleanPos(sp)), { 4: { a: [0, 0] }, e4: { b: [3, 3], c: [0, 0] }, e9: { b: [0, 8] }, sida2: ['b', 'c'], ute: ['om'] });
assert.deepEqual(plain(F.cleanPos({ e4: { b: [0, 4] } })), {});
// Sidorna blandas inte: startskärmen läser '4', sida 2 läser 'e4'
assert.deepEqual(plain(F.resolve(['b', 'c'], 4, sp, 'e')), { b: [3, 3], c: [0, 0] });
assert.deepEqual(plain(F.resolve(['b'], 4, { e4: { b: [3, 3] } })), { b: [0, 0] });
// Annat kolumnantal på sida 2: härleds bara från e-nycklar
assert.deepEqual(plain(F.resolve(['b'], 3, { e4: { b: [1, 3] }, 3: { b: [0, 0] } }, 'e')), { b: [1, 2] });
// Första lediga rutan (Lägg till på hemskärm från applådan)
assert.deepEqual(plain(F.firstFree({ '0:0': 1, '0:1': 1, '0:3': 1 }, 4, 0)), [0, 2]);
console.log('ok  modell');

(async () => {
  let PGlite;
  try { ({ PGlite } = require(process.env.PGLITE || '@electric-sql/pglite')); } catch (e) { console.log('SKIP SQL: PGlite saknas'); console.log('HEM_FRI_UNIT_OK'); return; }
  const db = new PGlite();
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261114e_home_tool_pos.sql'), 'utf8');
  const fn = sql.slice(sql.indexOf('create or replace function private.home_tool_pos_clean'), sql.indexOf('revoke all on function private.home_tool_pos_clean'));
  await db.exec('create schema private;' + fn);
  const q = async (j) => (await db.query('select private.home_tool_pos_clean($1::jsonb) r', [JSON.stringify(j)])).rows[0].r;
  assert.deepEqual(await q({ 4: { a: [0, 0], b: [0, 4], c: [0, 0], 'X!': [1, 1], d: [1.5, 0], e: [70, 1], f: [2, 3] }, 99: { a: [0, 0] }, x: 1 }), { 4: { a: [0, 0], f: [2, 3] } });
  assert.deepEqual(await q(null), {}); assert.deepEqual(await q([1]), {});
  assert.deepEqual(await q(sp), plain(F.cleanPos(sp)));
  assert.deepEqual(await q({ e4: { b: [0, 4] }, sida2: 'x', ute: [] }), {});
  console.log('ok  SQL-städning som klienten');
  console.log('HEM_FRI_UNIT_OK');
})().catch(e => { console.error(e); process.exit(1); });
