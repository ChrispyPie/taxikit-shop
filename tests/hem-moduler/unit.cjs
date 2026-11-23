'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const core = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning-core.js'), 'utf8');
const src = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning.js'), 'utf8');

function boot(store) {
  const ls = { _s: store || {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
  const documentStub = {
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { style: {}, textContent: '', setAttribute() {}, appendChild() {}, addEventListener() {} }; },
    head: { appendChild() {} }, body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
    addEventListener() {}, readyState: 'complete', documentElement: { getAttribute() { return null; } }
  };
  const windowObj = { addEventListener() {}, driverData: {}, HEM_ORDNING: undefined };
  const ctx = { window: windowObj, document: documentStub, localStorage: ls, fetch() { return Promise.resolve({ ok: false, text: () => Promise.resolve('') }); }, addEventListener() {}, console, setTimeout, clearTimeout };
  vm.createContext(ctx);
  vm.runInContext(core, ctx);
  vm.runInContext(src, ctx);
  return { H: ctx.window.HEM_ORDNING, ls };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const { H, ls } = boot();
const top0 = ['kordata', 'lonekoll', 'ankomster', 'prognos', 'kalender', 'installningar', 'om'];
const menu = top0.concat(['vader']).map((id) => ({ id, label: id, icon: 'x' }));
H.setCatalog(menu);

assert.ok(H.isPinned('moduler'));
assert.ok(!H.isPinned('kordata') && !H.isCore('moduler'));
assert.ok(H.isInstalled('moduler'));

// Standard: Moduler hamnar sist när den saknas i sparad ordning
H.preview(null, []);
assert.deepEqual(plain(H.arrange(menu).map((x) => x.id)).slice(-1), ['moduler']);
assert.equal(H.arrange(menu).filter((x) => x.id === 'moduler').length, 1);
assert.ok(/svg/i.test(H.arrange(menu).filter((x) => x.id === 'moduler')[0].icon));

// Flytta Moduler till valfri plats
ls.setItem('taxi_driver', '900042');
H.preview(['kordata', 'moduler', 'lonekoll', 'ankomster', 'prognos', 'kalender', 'installningar', 'om'], []);
assert.equal(H.arrange(menu).map((x) => x.id).indexOf('moduler'), 1);
const saved = JSON.parse(ls.getItem('taxi_home_order:900042'));
assert.equal(saved.ids.indexOf('moduler'), 1);

// Avinstallera / dölj ignoreras; arrange tar tillbaka den sist
H.preview(['kordata', 'lonekoll'], ['moduler']);
assert.ok(!H.hidden().includes('moduler'));
assert.ok(H.arrange(menu).map((x) => x.id).includes('moduler'));
H.uninstall('moduler');
assert.ok(H.arrange(menu).map((x) => x.id).includes('moduler'));
assert.equal(H.arrange(menu).map((x) => x.id).pop(), 'moduler');

// Menyn och koden: ingen Avinstallera för Moduler
assert.match(core + src, /isPinned\(id\)/);
assert.match(core + src, /!isPinned\(id\)/);
assert.match(core + src, /isCore\(id\) \|\| isPinned\(id\)/);
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
assert.match(html, /hem-ordning-core\.js\?v=20261123ztid1/);
assert.match(lv, /hem-ordning\.js\?v=20261122zdelad1/);
assert.match(lv, /hjalp\.js\?v=20261122zdelad1/);
assert.match(lv, /moduler\.js\?v=20261122zdelad1/);
assert.match(lv, /changelog\.js\?v=20261123ztid1/);
const help = fs.readFileSync(path.join(root, 'TaxiData/hjalp.js'), 'utf8');
assert.match(help, /Rutan Moduler öppnar/);
assert.match(help, /Inställningar, Om appen, Admin och Moduler stannar alltid kvar/);

const tema = fs.readFileSync(path.join(root, 'TaxiData/tema.css'), 'utf8');
assert.match(core, /width="1em" height="1em"/);
assert.match(tema, /data-tool="moduler"\] \.emoji svg/);

console.log('HEM_MODULER_UNIT_OK');
