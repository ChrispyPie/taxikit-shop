'use strict';
// Lönekoll preliminärskatt enligt Skatteverkets månadstabeller 2026, inte fast 21 %.
// Kör: node tests/lonekoll-skatt/unit.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../../TaxiData');
const ctx = {
  window: {},
  localStorage: { getItem() { return null; }, setItem() {} },
  document: {
    getElementById() { return null; },
    createElement() { return { id: '', textContent: '' }; },
    head: { appendChild() {} },
    body: { contains() { return false; } }
  }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'skattetabell-2026.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'lonekoll.js'), 'utf8'), ctx);

const T = ctx.SKATTETABELL;
const L = ctx.LONEKOLL;
assert.equal(T.year, 2026);
assert.equal(Array.from(T.tables).join(','), '29,30,31,32,33,34,35,36,37,38,39,40,41,42');

// Publicerade värden, tabell 33 kolumn 1 (lön, under 66 år).
assert.equal(T.tax(15000, 33, 1), 2219);
assert.equal(T.tax(20000, 33, 1), 3391);
assert.equal(T.tax(30000, 33, 1), 5878);
assert.equal(T.tax(35000, 33, 1), 7134);
assert.equal(T.tax(40000, 33, 1), 8402);
assert.equal(T.tax(0, 33, 1), 0);
assert.equal(T.tax(30000, 33, 3), 2644);
// Tabell 32 (t.ex. Härryda utan kyrkoavgift).
assert.equal(T.tax(25000, 32, 1), 4484);
assert.equal(T.tax(30000, 32, 1), 5703);
assert.equal(T.tax(35000, 32, 1), 6922);
assert.equal(T.tax(40000, 32, 1), 8151);
// Okänd tabell faller tillbaka till 33.
assert.equal(T.tax(30000, 99, 1), 5878);
// Procentrad högst upp i tabellen (procent av hela lönen).
assert.equal(T.tax(632001, 33, 1), Math.round(632001 * 51 / 100));
assert.equal(T.tax(2000000, 33, 1), Math.round(2000000 * 52 / 100));

const base = { brutto: 30000, bom: 0, uber: 0, kontant: 0, dricks: 0 };
const tabell = Object.assign({}, L.defaults, {
  provision: 100, semester: 0, moms: 0, uber: 0, adm: 0, inpass: 0,
  skatt_mode: 'tabell', tabell: 33, kolumn: 1
});
const r = L.compute(base, tabell, 1);
assert.equal(r.bruttolon, 30000);
assert.equal(r.skatt, 5878);
assert.equal(r.nettolon, 30000 - 5878);

const pct = Object.assign({}, tabell, { skatt_mode: 'procent', skatt: 21 });
const r21 = L.compute(base, pct, 1);
assert.equal(r21.skatt, 6300);
assert.ok(r21.skatt > r.skatt, '21 % tar för mycket skatt vid 30 000 kr');

const low = L.compute({ brutto: 15000, bom: 0, uber: 0, kontant: 0, dricks: 0 }, tabell, 1);
const low21 = L.compute({ brutto: 15000, bom: 0, uber: 0, kontant: 0, dricks: 0 }, pct, 1);
assert.equal(low.skatt, 2219);
assert.equal(low21.skatt, 3150);
assert.equal(Math.round(low21.skatt - low.skatt), 931);

const high = L.compute({ brutto: 46907, bom: 0, uber: 0, kontant: 0, dricks: 0 }, tabell, 1);
const high21 = L.compute({ brutto: 46907, bom: 0, uber: 0, kontant: 0, dricks: 0 }, pct, 1);
assert.equal(high.skatt, 10712);
assert.equal(high21.skatt, 46907 * 0.21);
assert.ok(high21.skatt < high.skatt, '21 % tar för lite skatt vid 46 907 kr');

const def = L.loadSettings();
assert.equal(def.skatt_mode, 'tabell');
assert.equal(def.tabell, 33);
assert.equal(def.kolumn, 1);

assert.equal(L.taxAmount(30000, tabell), 5878);
assert.equal(L.taxAmount(30000, pct), 6300);

console.log('LONEKOLL_SKATT_OK');

// Semesterersättning i månadslönen: förvalt Ja (inbakad och beskattad).
assert.equal(L.defaults.sem_i_lon, true);
assert.equal(L.loadSettings().sem_i_lon, true);

const withSem = Object.assign({}, L.defaults, {
  provision: 100, semester: 13, moms: 0, uber: 0, adm: 0, inpass: 0,
  skatt_mode: 'tabell', tabell: 33, kolumn: 1, sem_i_lon: true
});
const inc = L.compute({ brutto: 30000, bom: 0, uber: 0, kontant: 0, dricks: 0 }, withSem, 1);
assert.equal(inc.sem, 3900);
assert.equal(inc.bruttolon, 33900);
assert.equal(inc.skatt, T.tax(33900, 33, 1));
assert.equal(inc.nettolon, inc.bruttolon - inc.skatt);

const withoutSem = Object.assign({}, withSem, { sem_i_lon: false });
const exc = L.compute({ brutto: 30000, bom: 0, uber: 0, kontant: 0, dricks: 0 }, withoutSem, 1);
assert.equal(exc.sem, 3900);
assert.equal(exc.bruttolon, 30000);
assert.equal(exc.skatt, 5878);
assert.equal(exc.nettolon, 30000 - 5878);
assert.ok(exc.skatt < inc.skatt, 'utan semester i månadslönen blir skatten lägre');
assert.ok(exc.utbetalt !== inc.utbetalt);

// Ackumulerad semester över flera månader (test-dubbel för taxiPayData).
function payStub(rows) {
  return function (from, to) {
    const shifts = [], trips = [];
    rows.forEach(function (row) {
      const d = L.parseStart(row.start);
      if (!d || d < from || d > to) return;
      shifts.push({ start: row.start });
      trips.push({ belopp: row.belopp, kredittyp: '2' });
    });
    return { shifts: shifts, trips: trips };
  };
}
const rows = [
  { start: '20260115 10:00', belopp: 10000 },
  { start: '20260220 10:00', belopp: 20000 },
  { start: '20260310 10:00', belopp: 30000 }
];
assert.equal(L.semesterPeriodText({ from: { y: 2026, m: 0 }, to: { y: 2026, m: 2 } }), 'januari–mars 2026');
assert.equal(L.semesterPeriodText({ from: { y: 2025, m: 10 }, to: { y: 2026, m: 2 } }), 'november 2025 – mars 2026');
assert.equal(L.semesterPeriodText({ from: { y: 2026, m: 2 }, to: { y: 2026, m: 2 } }), 'Mars 2026');

const acc = L.semesterAcc(withoutSem, 2026, 2, 1, payStub(rows));
assert.equal(Math.round(acc.thisMonth), 3900);
assert.equal(Math.round(acc.total), Math.round(10000 * 0.13 + 20000 * 0.13 + 30000 * 0.13));
assert.equal(acc.from.y, 2026);
assert.equal(acc.from.m, 0);
assert.equal(acc.to.m, 2);

const accFeb = L.semesterAcc(withoutSem, 2026, 1, 1, payStub(rows));
assert.equal(Math.round(accFeb.thisMonth), 2600);
assert.equal(Math.round(accFeb.total), 3900);

console.log('LONEKOLL_SEMESTER_OK');
