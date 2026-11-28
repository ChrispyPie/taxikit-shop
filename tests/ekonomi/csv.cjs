// Generisk CSV-tolkning för bränsleutdrag. Ingen server.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../TaxiData/ekonomi-resultat.js', 'utf8');
const c = { console, Intl, Date, Promise, document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }, window: null };
c.window = c; vm.createContext(c); vm.runInContext(src, c);
const P = t => c.EKRES.parseCsv(t);

let p = P('Datum;Beskrivning;Belopp\n2026-11-03;OKQ8 Kållered;1 245,50\n2026-11-10;Circle K;2 110,00\n2026-11-18;Laddning;890,25\n');
assert.strictEqual(p.ok, true); assert.strictEqual(p.sum, 4245.75); assert.strictEqual(p.rader, 3); assert.strictEqual(p.kolumn, 'belopp');

p = P('Date,Description,Amount\n2026-11-01,Fuel,1000.00\n2026-11-02,Fuel,250.50\n');
assert.strictEqual(p.sum, 1250.5);

p = P('Datum\tDebet\tKredit\n2026-11-01\t1 000,00\t0\n2026-11-02\t0\t200,00\n');
assert.strictEqual(p.sum, 800); assert.strictEqual(p.metod, 'debit-kredit');

p = P('x;y;z\na;b;12,50\nc;d;7,50\n');
assert.strictEqual(p.sum, 20); assert.strictEqual(p.metod, 'sista');

p = P(''); assert.strictEqual(p.ok, false);
console.log('PASS CSV-tolkning av bränsleutdrag');
