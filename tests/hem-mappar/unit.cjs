'use strict';
// Layoutmodell för startskärmens mappar (2026-11-12mapp1): flytta, skapa mapp, lägga i, ta ut, upplösa, spara/läsa.
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

// 1. Flytta en ikon (ordning)
let s = M.placeTop(top0, [], 'vader', ['vader', 'kordata', 'lonekoll', 'ankomster', 'prognos', 'kalender', 'installningar', 'om']);
assert.deepEqual(plain(s.top), ['vader', 'kordata', 'lonekoll', 'ankomster', 'prognos', 'kalender', 'installningar', 'om', 'moduler']);
assert.deepEqual(plain(s.folders), []);

// 2. Släpp ikon på ikon = ny mapp på målets plats, målet först
s = M.createFolder(top0, [], 'vader', 'ankomster', 'mapp-a1', 'Mapp');
assert.deepEqual(plain(s.top), ['kordata', 'lonekoll', 'mapp-a1', 'prognos', 'kalender', 'installningar', 'om', 'moduler']);
assert.deepEqual(plain(s.folders), [{ id: 'mapp-a1', name: 'Mapp', items: ['ankomster', 'vader'] }]);

// 3. Lägg till i befintlig mapp (släpp på mappen)
s = M.addToFolder(s.top, s.folders, 'kalender', 'mapp-a1');
assert.deepEqual(plain(s.folders[0].items), ['ankomster', 'vader', 'kalender']);
assert.ok(!s.top.includes('kalender'));
// createFolder med en mapp som mål = lägg i mappen
let s2 = M.createFolder(s.top, s.folders, 'prognos', 'mapp-a1', 'mapp-zz', 'Mapp');
assert.equal(s2.folders.length, 1);
assert.deepEqual(plain(s2.folders[0].items), ['ankomster', 'vader', 'kalender', 'prognos']);

// 4. Ordna inne i mappen
s = M.reorderInFolder(s.top, s.folders, 'mapp-a1', ['kalender', 'ankomster', 'vader']);
assert.deepEqual(plain(s.folders[0].items), ['kalender', 'ankomster', 'vader']);

// 5. Dra ut ur mappen till startskärmen (öppna mapp -> håll in -> dra ut -> släpp på hem)
//    Ny ordning från rutnätet där ikonen släpptes, mappen står kvar med två.
s = M.placeTop(s.top, s.folders, 'kalender', ['kalender', 'kordata', 'lonekoll', 'mapp-a1', 'prognos', 'installningar', 'om']);
assert.deepEqual(plain(s.top), ['kalender', 'kordata', 'lonekoll', 'mapp-a1', 'prognos', 'installningar', 'om', 'moduler']);
assert.deepEqual(plain(s.folders[0].items), ['ankomster', 'vader']);

// 6. Dra ut en till: bara en kvar -> mappen löses upp, sista ikonen tar mappens plats
s = M.placeTop(s.top, s.folders, 'vader', ['kalender', 'kordata', 'lonekoll', 'mapp-a1', 'prognos', 'installningar', 'om', 'vader']);
assert.deepEqual(plain(s.folders), []);
assert.deepEqual(plain(s.top), ['kalender', 'kordata', 'lonekoll', 'ankomster', 'prognos', 'installningar', 'om', 'vader', 'moduler']);

// 7. Ta ut via menyn (removeFromFolder) och upplösning
s = M.createFolder(top0, [], 'vader', 'ankomster', 'mapp-b2', 'Bra');
s = M.removeFromFolder(s.top, s.folders, 'vader');
assert.deepEqual(plain(s.folders), []);
assert.deepEqual(plain(s.top), ['kordata', 'lonekoll', 'ankomster', 'vader', 'prognos', 'kalender', 'installningar', 'om', 'moduler']);

// 8. Dra ikon ur mapp A och släpp på annan ikon: ny mapp B, A löses upp
s = M.createFolder(top0, [], 'vader', 'ankomster', 'mapp-a1', 'A');
s = M.createFolder(s.top, s.folders, 'vader', 'kordata', 'mapp-b1', 'B');
assert.deepEqual(plain(s.folders), [{ id: 'mapp-b1', name: 'B', items: ['kordata', 'vader'] }]);
assert.deepEqual(plain(s.top), ['mapp-b1', 'lonekoll', 'ankomster', 'prognos', 'kalender', 'installningar', 'om', 'moduler']);

// 9. Inga mappar i mappar, inget att släppa på sig själv
let n = M.createFolder(s.top, s.folders, 'mapp-b1', 'lonekoll', 'mapp-c1', 'C');
assert.equal(n.folders.length, 1);
n = M.addToFolder(s.top, s.folders, 'mapp-b1', 'mapp-b1');
assert.deepEqual(plain(n.folders[0].items), ['kordata', 'vader']);
n = M.createFolder(top0, [], 'vader', 'vader', 'mapp-c1', 'C');
assert.equal(n.folders.length, 0);
assert.equal(M.cleanFolders([{ id: 'mapp-x', name: 'x', items: ['mapp-y', 'a', 'b'] }])[0].items.join(), 'a,b');

// 10. Flytta en hel mapp
n = M.placeTop(s.top, s.folders, 'mapp-b1', ['lonekoll', 'ankomster', 'mapp-b1', 'prognos', 'kalender', 'installningar', 'om']);
assert.equal(n.top[2], 'mapp-b1');
assert.deepEqual(plain(n.folders[0].items), ['kordata', 'vader']);

// 11. Ta bort mapp = packa upp på mappens plats, inga verktyg försvinner
s = M.createFolder(top0, [], 'vader', 'ankomster', 'mapp-a1', 'A');
s = M.addToFolder(s.top, s.folders, 'om', 'mapp-a1');
n = M.unpackFolder(s.top, s.folders, 'mapp-a1');
assert.deepEqual(plain(n.folders), []);
assert.deepEqual(plain(n.top), ['kordata', 'lonekoll', 'ankomster', 'vader', 'om', 'prognos', 'kalender', 'installningar', 'moduler']);
for (const id of top0) assert.ok(n.top.includes(id), id);

// 12. Byt namn: rensas, max 24 tecken, tomt = Mapp
let f = M.renameFolder(s.folders, 'mapp-a1', '  Flyg <b>& tåg</b>  ');
assert.equal(f[0].name, 'Flyg b& tåg/b');
f = M.renameFolder(s.folders, 'mapp-a1', '   ');
assert.equal(f[0].name, 'Mapp');
f = M.renameFolder(s.folders, 'mapp-a1', 'x'.repeat(60));
assert.equal(f[0].name.length, 24);

// 13. Avinstallera ikon i mapp med två -> mappen löses upp
n = M.removeTool(['mapp-a1', 'kordata'], [{ id: 'mapp-a1', name: 'A', items: ['vader', 'ankomster'] }], 'vader');
assert.deepEqual(plain(n), { top: ['ankomster', 'kordata', 'moduler'], folders: [] });

// 14. arrange + layout: mappen grupperar sina ikoner på mappens plats, platt lista behålls för index.html
const menu = top0.map((id) => ({ id, label: id, icon: 'x' }));
H.setCatalog(menu);
s = M.createFolder(top0, [], 'vader', 'lonekoll', 'mapp-a1', 'Bil');
H.preview(s.top, [], s.folders);
const flat = plain(H.arrange(menu).map((x) => x.id));
assert.deepEqual(flat, ['kordata', 'lonekoll', 'vader', 'ankomster', 'prognos', 'kalender', 'installningar', 'om', 'moduler']);
const lay = plain(H.layout());
assert.equal(lay[1].type, 'folder');
assert.deepEqual(lay[1].items, ['lonekoll', 'vader']);
assert.equal(lay[1].name, 'Bil');
assert.equal(lay.length, 8);
// Ett nytt verktyg som inte finns i sparad ordning hamnar ändå på startskärmen
const menuNew = menu.concat([{ id: 'topplistor', label: 'T', icon: 'x' }]);
assert.ok(H.arrange(menuNew).map((x) => x.id).includes('topplistor'));
// Mapp där bara en ikon syns (roll) visas som vanlig ikon, utan att ändra sparat
const flatRole = H.arrange(menu.filter((m) => m.id !== 'vader')).map((x) => x.id);
assert.ok(flatRole.includes('lonekoll'));
assert.ok(H.layout().every((e) => e.type === 'tool'));
assert.equal(H.folders().length, 1);

// 15. Spara/läsa: localStorage per förare med mappar, och tillbaka efter omstart
ls.setItem('taxi_driver', '900042');
H.preview(s.top, [], s.folders);
const saved = JSON.parse(ls.getItem('taxi_home_order:900042'));
assert.deepEqual(saved.folders, [{ id: 'mapp-a1', name: 'Bil', items: ['lonekoll', 'vader'] }]);
assert.ok(saved.ids.includes('mapp-a1'));
const again = boot(ls._s).H;
assert.deepEqual(plain(again.folders()), [{ id: 'mapp-a1', name: 'Bil', items: ['lonekoll', 'vader'] }]);
assert.deepEqual(plain(again.order()), plain(s.top));
// Utan mappar skrivs gammalt format (bakåtkompatibelt)
H.preview(['vader', 'kordata'], [], []);
assert.equal(ls.getItem('taxi_home_order:900042'), '{"ids":["vader","kordata","moduler"],"hidden":[]}');
// Trasig/manipulerad data rensas: dubbletter, nästlade mappar, en-ikonsmappar
H.preview(['mapp-a1'], [], [{ id: 'mapp-a1', name: 'A', items: ['vader', 'vader'] }, { id: 'MAPP', items: ['a', 'b'] }]);
assert.equal(H.folders().length, 0);
// Dölj (avinstallera) via hidden tar bort ikonen ur mappen
H.preview(['mapp-a1', 'kordata'], ['vader'], [{ id: 'mapp-a1', name: 'A', items: ['vader', 'ankomster', 'prognos'] }]);
assert.deepEqual(plain(H.folders()[0].items), ['ankomster', 'prognos']);

// 16. Skiftnyckeln är borta från startskärmen; menyn finns kvar med Avinstallera och Flytta
assert.doesNotMatch(src, /ICO_WRENCH|wrench\.className|'td-wrench'/);
assert.match(src, /data-lp="off"/);
assert.match(src, /Avinstallera/);
assert.match(src, /data-lp="move"/);
assert.match(src, /data-lp="unpack"/);
assert.match(src, /Ta bort mapp/);
assert.match(src, /Byt namn/);
assert.match(src, /Ta ut ur mappen/);
assert.ok(H.LIFT_MS >= 800 && H.LIFT_MS <= 1100, 'håll in ungefär en sekund');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
assert.doesNotMatch(html, /td-wrench|skiftnyckel/i);
assert.match(html, /hem-ordning\.js\?v=(20261112mapp1|20261113mod2|20261113lasbar1|20261113skroll1|20261113chatt1|20261113prick2)/);
assert.match(html, /hjalp\.js\?v=(20261112mapp1|20261112ljud1|20261113mod2|20261113lasbar1|20261113skroll1|20261113chatt1|20261113prick2)/);
assert.match(html, /lazy-views\.js\?v=(20261112mapp1|20261112ljud1|20261112svar2|20261112pgfix1|20261113mod2|20261113lasbar1|20261113skroll1|20261113chatt1|20261113prick2)/);
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
assert.match(lv, /changelog\.js\?v=(20261112mapp1|20261112ljud1|20261112svar2|20261112pgfix1|20261113mod2|20261113lasbar1|20261113skroll1|20261113chatt1|20261113prick2)/);
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
assert.match(cl, /2026-11-13mod2/);
assert.match(cl, /2026-11-12mapp1/);
const help = fs.readFileSync(path.join(root, 'TaxiData/hjalp.js'), 'utf8');
assert.doesNotMatch(help, /skiftnyckel/i);
assert.match(help, /dra ut den/);
const newText = cl.split("id: '2026-11-13mod2'")[1].split(']},')[0] + help.split('hem: [')[1].split('],')[0];
assert.doesNotMatch(newText, /\bStig\b|\bhen\b/);
const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261112b_home_tool_folders.sql'), 'utf8');
assert.match(mig, /add column if not exists folders jsonb/);
assert.match(mig, /home_tool_order_set\(p_token text, p_ids text\[\], p_hidden text\[\], p_folders jsonb\)/);
assert.ok(fs.existsSync(path.join(root, 'supabase/migrations/undo/20261112b_home_tool_folders_undo.sql')));

console.log('HEM_MAPPAR_UNIT_OK');
