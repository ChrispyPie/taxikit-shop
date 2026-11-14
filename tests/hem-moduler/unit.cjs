'use strict';
// Moduler som flyttbar, fastnålad startskärmsikon (2026-11-13mod2).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
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
  vm.runInContext(src, ctx);
  return { H: ctx.window.HEM_ORDNING, ls };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const { H, ls } = boot();
const M = H.model;
const top0 = ['kordata', 'lonekoll', 'ankomster', 'prognos', 'vader', 'kalender', 'installningar', 'om'];
const menu = top0.map((id) => ({ id, label: id, icon: 'x' }));
H.setCatalog(menu);

assert.ok(H.isPinned('moduler') && M.isPinned('moduler'));
assert.ok(!H.isPinned('kordata') && !H.isCore('moduler'));
assert.ok(H.isInstalled('moduler'));

// 1. Standard: Moduler hamnar sist när den saknas i sparad ordning
H.preview(null, [], []);
assert.deepEqual(plain(H.arrange(menu).map((x) => x.id)).slice(-1), ['moduler']);
assert.equal(H.arrange(menu).filter((x) => x.id === 'moduler').length, 1);
assert.ok(/svg/i.test(H.arrange(menu).filter((x) => x.id === 'moduler')[0].icon));

// 2. Flytta Moduler till en plats som inte är sist, spara lokalt
let s = M.placeTop(top0, [], 'moduler', ['kordata', 'moduler', 'lonekoll', 'ankomster', 'prognos', 'vader', 'kalender', 'installningar', 'om']);
assert.deepEqual(plain(s.top), ['kordata', 'moduler', 'lonekoll', 'ankomster', 'prognos', 'vader', 'kalender', 'installningar', 'om']);
assert.deepEqual(plain(s.folders), []);
H.preview(s.top, [], []);
assert.equal(H.arrange(menu).map((x) => x.id).indexOf('moduler'), 1);
ls.setItem('taxi_driver', '900042');
H.preview(s.top, [], []);
const saved = JSON.parse(ls.getItem('taxi_home_order:900042'));
assert.equal(saved.ids.indexOf('moduler'), 1);
const again = boot(ls._s).H;
assert.equal(plain(again.order()).indexOf('moduler'), 1);
again.setCatalog(menu);
assert.equal(again.arrange(menu).map((x) => x.id).indexOf('moduler'), 1);

// 3. Släpp Moduler på en ikon, eller en ikon på Moduler: ingen mapp, bara omordning
s = M.createFolder(top0.concat(['moduler']), [], 'moduler', 'ankomster', 'mapp-x', 'Mapp');
assert.equal(s.folders.length, 0);
assert.ok(s.top.includes('moduler') && s.top.includes('ankomster'));
assert.ok(s.top.indexOf('moduler') === s.top.indexOf('ankomster') + 1);
s = M.createFolder(['kordata', 'moduler', 'lonekoll'], [], 'lonekoll', 'moduler', 'mapp-y', 'Mapp');
assert.equal(s.folders.length, 0);
assert.ok(s.top.indexOf('lonekoll') === s.top.indexOf('moduler') + 1);

// 4. Kan inte läggas i en mapp
s = M.createFolder(top0, [], 'vader', 'ankomster', 'mapp-a1', 'A');
const before = plain(s);
s = M.addToFolder(s.top, s.folders, 'moduler', 'mapp-a1');
assert.deepEqual(plain(s.folders[0].items), ['ankomster', 'vader']);
assert.ok(s.top.includes('moduler'));
s = M.createFolder(before.top, before.folders, 'moduler', 'mapp-a1', 'mapp-zz', 'Mapp');
assert.deepEqual(plain(s.folders[0].items), ['ankomster', 'vader']);
assert.ok(s.top.includes('moduler'));

// 5. Avinstallera / dölj ignoreras; normalize tar tillbaka den sist
s = M.removeTool(['kordata', 'moduler', 'lonekoll'], [], 'moduler');
assert.ok(s.top.includes('moduler'));
H.preview(['kordata', 'lonekoll'], ['moduler'], []);
assert.ok(!H.hidden().includes('moduler'));
assert.ok(H.arrange(menu).map((x) => x.id).includes('moduler'));
assert.ok(H.isInstalled('moduler'));
H.uninstall('moduler');
assert.ok(H.arrange(menu).map((x) => x.id).includes('moduler'));
const n = M.normalize(['kordata', 'lonekoll'], [{ id: 'mapp-a1', name: 'A', items: ['moduler', 'vader', 'ankomster'] }]);
assert.ok(n.top.includes('moduler'));
assert.equal(n.top[n.top.length - 1], 'moduler'); // saknades i top → sist
assert.deepEqual(plain(n.folders[0].items), ['vader', 'ankomster']);

// 6. Återställ (tom ordning) visar den sist
H.preview(null, [], []);
assert.equal(H.arrange(menu).map((x) => x.id).pop(), 'moduler');

// 7. Servern utan moduler i ids: klienten visar den ändå, sist
H.preview(['vader', 'kordata', 'prognos'], [], []);
// simulera att servern skickade tillbaka listan utan moduler
H.preview(['vader', 'kordata', 'prognos'].filter((id) => id !== 'moduler'), [], []);
assert.equal(H.arrange(menu).map((x) => x.id).pop(), 'moduler');
assert.ok(H.arrange(menu).map((x) => x.id).indexOf('vader') < H.arrange(menu).map((x) => x.id).indexOf('kordata'));

// 8. Menyn och koden: ingen Avinstallera för Moduler, inget keepPlusLast, ingen alltid-sist-ruta
assert.match(src, /isPinned\(id\)/);
assert.doesNotMatch(src, /keepPlusLast/);
assert.doesNotMatch(src, /className = 'td-slot-empty'/);
assert.match(src, /data-tool', 'moduler'/);
assert.match(src, /!isCore\(id\) && !isPinned\(id\)/);
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
assert.match(html, /hem-ordning\.js\?v=20261113mod2/);
assert.match(html, /hjalp\.js\?v=20261113mod2/);
assert.match(html, /lazy-views\.js\?v=(20261113mod2|20261113lasbar1|20261113skroll1|20261113chatt1|20261113prick2|20261113barn1|20261113sedd1|20261113hem1|20261113avs1)/);
assert.match(html, /moduler\.js\?v=20261113mod2/);
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
assert.match(lv, /changelog\.js\?v=(20261113mod2|20261113lasbar1|20261113skroll1|20261113chatt1|20261113prick2|20261113barn1|20261113sedd1|20261113hem1|20261113avs1)/);
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
assert.match(cl, /id: '2026-11-13mod2'/);
assert.match(cl.split("id: '2026-11-13mod2'")[0].slice(-60) + cl.split("id: '2026-11-13mod2'")[1].split(']},')[0], /tid: '\d\d:\d\d'/);
const help = fs.readFileSync(path.join(root, 'TaxiData/hjalp.js'), 'utf8');
assert.doesNotMatch(help, /Rutan Moduler längst ner/);
assert.match(help, /Rutan Moduler öppnar/);
assert.match(help, /stannar alltid på startskärmen/);
const newText = cl.split("id: '2026-11-13mod2'")[1].split(']},')[0] + help.split('hem: [')[1].split('],')[0];
assert.doesNotMatch(newText, /\bStig\b|\bhen\b/);

console.log('HEM_MODULER_UNIT_OK');
