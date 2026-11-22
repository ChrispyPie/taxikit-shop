'use strict';
// Väder och Nyheter avinstalleras från alla konton men går att lägga tillbaka i Moduler.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const core = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning-core.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'TaxiData/sw.js'), 'utf8');
const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261122b_home_tool_vader_nyheter.sql'), 'utf8');
const undo = fs.readFileSync(path.join(root, 'supabase/migrations/undo/20261122b_home_tool_vader_nyheter_undo.sql'), 'utf8');

assert.doesNotMatch(core + cl + mig + undo, /\bStig\b/);
assert.doesNotMatch(cl.split("id: '2026-11-22zmod1'")[1].split(']},')[0], /\b(Stig|hen)\b/);
assert.match(cl, /id: '2026-11-22zmod1'/);
assert.match(cl.split("id: '2026-11-22zmod1'")[1].split(']},')[0].split('rader:')[0], /tid: '19:01'/);
assert.match(cl.split("id: '2026-11-22zmod1'")[1].split(']},')[0], /Väder och Nyheter/);
assert.match(cl.split("id: '2026-11-22zmod1'")[1].split(']},')[0], /Moduler/);

assert.match(html, /hem-ordning-core\.js\?v=20261122zjul4/);
assert.match(html, /lazy-views\.js\?v=20261122zjul4/);
assert.match(lv, /changelog\.js\?v=20261122zjul4/);
assert.match(sw, /CACHE_VER = '20261122zjul4'/);

assert.match(core, /DEFAULT_OFF = \{ nyheter: 1, vader: 1 \}/);
assert.match(core, /var UNINST = 'taxi_mod_uninst_vader_nyheter'/);
assert.match(core, /function sweepVaderNyheter\(/);
assert.match(core, /sweepVaderNyheter\(\)/);
assert.match(core, /uninstKey\(\) \+ ':prev'/);

assert.match(mig, /home_tool_order_backup_20261122_vader_nyheter/);
assert.match(mig, /insert into private\.home_tool_order_backup_20261122_vader_nyheter/);
assert.match(mig, /array\['vader', 'nyheter'\]/);
assert.match(undo, /from private\.home_tool_order_backup_20261122_vader_nyheter/);
assert.match(undo, /set ids = b\.ids/);
assert.match(undo, /taxi_mod_uninst_vader_nyheter/);

function ls(init) {
  const _s = Object.assign({}, init || {});
  return {
    _s,
    getItem(k) { return Object.prototype.hasOwnProperty.call(_s, k) ? _s[k] : null; },
    setItem(k, v) { _s[k] = String(v); },
    removeItem(k) { delete _s[k]; }
  };
}

function boot(local) {
  const store = ls(local);
  store.setItem('taxi_driver', '710022');
  store.setItem('taxi_session', 'tok');
  const documentStub = {
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }; },
    head: { appendChild() {} }, body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
    addEventListener() {}, readyState: 'complete',
    documentElement: { getAttribute() { return null; } }
  };
  const win = { addEventListener() {}, driverData: {} };
  const ctx = { window: win, document: documentStub, localStorage: store, fetch() { return Promise.resolve({ ok: false, text: () => Promise.resolve('') }); }, console, setTimeout, clearTimeout, Promise };
  vm.createContext(ctx);
  vm.runInContext(core, ctx);
  return { H: ctx.window.HEM_ORDNING, store };
}

const key = 'taxi_home_order:710022';
const flag = 'taxi_mod_uninst_vader_nyheter:710022';
const prev = flag + ':prev';

// Installerade på hemskärmen tas bort en gång, och går att installera igen
const a = boot({
  [key]: JSON.stringify({ ids: ['kordata', 'vader', 'nyheter', 'moduler'], hidden: [], sida2: [] })
});
function plain(x) { return JSON.parse(JSON.stringify(x)); }
assert.deepEqual(plain(a.H.order()), ['kordata', 'moduler']);
assert.equal(a.H.isInstalled('vader'), false);
assert.equal(a.H.isInstalled('nyheter'), false);
assert.ok(a.H.hidden().indexOf('vader') >= 0);
assert.ok(a.H.hidden().indexOf('nyheter') >= 0);
assert.equal(a.store.getItem(flag), '1');
const savedPrev = JSON.parse(a.store.getItem(prev));
assert.equal(savedPrev.vader.inOrder, true);
assert.equal(savedPrev.nyheter.inOrder, true);

// Andra körningen rör inte en manuell ominstallation
a.H.install('vader');
assert.equal(a.H.isInstalled('vader'), true);
assert.ok(plain(a.H.order()).indexOf('vader') >= 0);
const b = boot({
  [key]: a.store.getItem(key),
  [flag]: '1',
  [prev]: a.store.getItem(prev)
});
assert.equal(b.H.isInstalled('vader'), true);
assert.ok(plain(b.H.order()).indexOf('vader') >= 0);
assert.equal(b.H.isInstalled('nyheter'), false);

console.log('MODULER_AVINSTALLERA_VADER_NYHETER_OK');
