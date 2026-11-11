const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const store = {};
const noop = () => {};
const document = {
  createElement() { return { textContent: '', setAttribute: noop, getAttribute() { return ''; } }; },
  head: { appendChild: noop },
  body: { appendChild: noop },
  getElementById() { return null; },
  addEventListener: noop,
  documentElement: {}
};
const navigator = { userAgent: 'test' };
const ctx = {
  window: { addEventListener: noop, removeEventListener: noop, navigator }, navigator, document, localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  Date, console
};
ctx.window.DEMO = { on: () => false };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../TaxiData/notis.js'), 'utf8'), ctx);
const N = ctx.window.NOTIS;
assert.equal(N.catOf({ kind: 'tag' }), 'tag');
assert.equal(N.catOf({ kind: 'flyg' }), 'flyg');
assert.equal(N.catOf({ kind: 'bat' }), 'bat');
assert.equal(N.catOf({ kind: 'reminder' }), 'event');
assert.equal(N.catOf({ kind: 'nyheter' }), 'nyheter');
assert.equal(N.catOf({ kind: 'konto' }), 'konto');
assert.equal(N.catOf({ kind: 'prognos' }), 'prognos');
assert.equal(N.catOf({ kind: 'forum_reply' }), 'forum');
assert.equal(N.catOf({ kind: 'bil_fault' }), 'bil');
assert.equal(N.catOf({ kind: 'sjuk' }), 'sjuk');
assert.equal(N.catOf({ case_kind: 'arende', case_id: 1, kind: 'push' }), 'meddelanden');
assert.equal(N.catOf({ kind: 'weird' }), 'other');

const items = [
  { kind: 'tag', title: 'Tåg 437' },
  { kind: 'flyg', title: 'TEST42' },
  { kind: 'nyheter', title: 'Nytt' },
  { kind: 'prognos', title: 'Zon' }
];
assert.equal(N.visibleItems(items).length, 4, 'default: all visible');
store.taxi_notis_cats = JSON.stringify({ off: ['flyg', 'prognos'] });
const shown = N.visibleItems(items);
assert.deepEqual(shown.map(x => x.kind), ['tag', 'nyheter']);
const labels = N.CAT_ORDER.filter(c => ['tag', 'flyg', 'bat', 'event', 'nyheter'].includes(c.id)).map(c => c.label);
assert.equal(labels.join('|'), 'Tåg|Flyg|Båt|Evenemang|Uppdateringar');
console.log('PASS notis category chips: mapping, filter, default all on, localStorage off-list');
