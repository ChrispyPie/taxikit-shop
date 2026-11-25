/* Auto-open 1 dec 2026 och framtida Nyheter dolda tills de gått live. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');

function loadGate(nowIso, driver, search) {
  const src = fs.readFileSync(path.join(root, 'TaxiData/polkagris.js'), 'utf8');
  const store = { taxi_driver: driver || '', taxi_session: '' };
  const parts = nowIso.split(/[-T:]/);
  const noop = () => {};
  const ctx = {
    window: {},
    document: { readyState: 'complete', getElementById: () => null, createElement: () => ({ setAttribute: noop, addEventListener: noop, style: {} }), head: { appendChild: noop }, addEventListener: noop, querySelectorAll: () => [], querySelector: () => null, documentElement: {} },
    addEventListener: noop,

    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    location: { search: search || '' },
    Date: class extends Date {
      constructor(...a) { if (a.length) super(...a); else super(nowIso); }
      static now() { return Date.parse(nowIso); }
    },
    Intl,
    URLSearchParams,
    setInterval: () => 0,
    clearInterval() {},
    setTimeout: () => 0,
    clearTimeout() {},
    requestAnimationFrame: (fn) => 0,
    console
  };
  ctx.window = ctx;
  ctx.document.readyState = 'complete';
  vm.runInNewContext(src, ctx, { filename: 'polkagris.js' });
  return ctx.ADVENT_GATE;
}

const nov = '2026-11-23T18:00:00+01:00';
const nov28 = '2026-11-28T23:59:00+01:00';
const nov29 = '2026-11-29T00:00:00+01:00';
const dec1 = '2026-12-01T00:00:00+01:00';
const novLate = '2026-11-30T23:59:00+01:00';

let g = loadGate(nov, '710022', '');
assert.equal(g.allowed(), true, '710022 before Dec 1');
assert.equal(g.isLive(), false);

g = loadGate(nov, '693340', '');
assert.equal(g.allowed(), true, '693340 before Dec 1');
g = loadGate(nov, 693340, '');
assert.equal(g.allowed(), true, '693340 numeric id before Dec 1');

g = loadGate(nov, '123456', '');
assert.equal(g.allowed(), false, 'other driver before Dec 1');
assert.equal(g.huntAllowed(), false, 'hunt closed for other driver in late Nov before first advent');

g = loadGate(nov, '123456', '?adventdatum=2026-12-01');
assert.equal(g.today().iso, '2026-11-23', 'testdatum only for preview drivers');
assert.equal(g.asOfArg(), null);

g = loadGate(nov28, '123456', '');
assert.equal(g.huntAllowed(), false, 'hunt closed 28 Nov 23:59');
assert.equal(g.allowed(), false, 'calendar closed 28 Nov');

g = loadGate(nov29, '123456', '');
assert.equal(g.isHuntLive(), true);
assert.equal(g.huntAllowed(), true, 'hunt open for all from 29 Nov 00:00');
assert.equal(g.isLive(), false, 'calendar not live 29 Nov');
assert.equal(g.allowed(), false, 'calendar closed for regular driver 29 Nov');

g = loadGate(novLate, '123456', '');
assert.equal(g.allowed(), false, 'other driver 23:59 Nov 30');
assert.equal(g.huntAllowed(), true, 'hunt still open 30 Nov');

g = loadGate(dec1, '123456', '');
assert.equal(g.isLive(), true);
assert.equal(g.allowed(), true, 'all drivers from Dec 1 00:00');
assert.equal(g.huntAllowed(), true, 'hunt still open 1 Dec');

g = loadGate(nov, '710022', '?adventdatum=2026-12-01');
assert.equal(g.today().iso, '2026-12-01');
assert.equal(g.realToday().iso, '2026-11-23');
assert.equal(g.allowed(), true);

g = loadGate(nov, '710022', '?adventdatum=2026-12-24');
assert.equal(g.today().iso, '2026-12-24', 'unlocks all 24 luckor');
assert.equal(g.today().d, 24);
assert.equal(g.asOfArg(), '2026-12-24');
assert.equal(g.realToday().iso, '2026-11-23');

// nyhLive via om.js lista
const omSrc = fs.readFileSync(path.join(root, 'TaxiData/om.js'), 'utf8');
const clSrc = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
function listaAt(nowIso) {
  const ctx = {
    window: {},
    document: { createElement: () => ({ textContent: '', setAttribute() {} }), head: { appendChild() {} } },
    Date: class extends Date {
      constructor(...a) { if (a.length) super(...a); else super(nowIso); }
      static now() { return Date.parse(nowIso); }
    },
    Intl,
    URLSearchParams,
    localStorage: { getItem: () => null, setItem() {} },
    console
  };
  ctx.window = ctx;
  vm.runInNewContext(clSrc + '\n' + omSrc, ctx, { filename: 'om.js' });
  return ctx.OM.lista().map((d) => d.id);
}
const before = listaAt('2026-11-23T22:00:00+01:00');
assert.ok(!before.includes('2026-12-01zadv1'), 'Nyheter hidden before Dec 1, got ' + before.slice(0, 3));
assert.ok(!before.includes('2026-11-29zjul1'), 'Jultema-nyhet hidden before 29 Nov');
const onAdvent = listaAt('2026-11-29T00:00:00+01:00');
assert.ok(onAdvent.includes('2026-11-29zjul1'), 'Jultema-nyhet syns 29 Nov 00:00');
assert.ok(!onAdvent.includes('2026-12-01zadv1'), 'Adventskalender-nyhet still hidden 29 Nov');
assert.ok(before.includes('2026-11-23zhb2'), 'older news still visible');
const after = listaAt(dec1);
assert.ok(after.includes('2026-12-01zadv1'), 'Nyheter visible on Dec 1');
assert.ok(after.indexOf('2026-12-01zadv1') < after.indexOf('2026-11-23zhb2'), 'Dec 1 entry first');

console.log('advent gate + nyheter ok');
