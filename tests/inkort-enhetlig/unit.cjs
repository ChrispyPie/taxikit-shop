'use strict';
// Enhetlig inkört + dagsvy bara startpass (2026-11-23zink1).
// Kör: node tests/inkort-enhetlig/unit.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const script = read('TaxiData/script.js');
const lonekoll = read('TaxiData/lonekoll.js');
const topplistor = read('TaxiData/topplistor.js');
const cl = read('TaxiData/changelog.js');
const sw = read('TaxiData/sw.js');
const html = read('TaxiData/index.html');
const lv = read('TaxiData/lazy-views.js');
const mig = read('supabase/migrations/20261123a_inkort_enhetlig.sql');
const undo = read('supabase/migrations/undo/20261123a_inkort_enhetlig_undo.sql');
const docs = read('docs/topplistor/README.md');

assert.match(script, /const UBER_FEE = 0\.25;/);
assert.doesNotMatch(script, /const UBER_FEE = 0\.26;/);
assert.equal(46905 + 8972 + 818 + 7013 * 0.75, 61954.75);

assert.match(lonekoll, /I Inkört hittills ingår Uber i sin helhet\. Avgiften på 25 % dras av i stegen nedan\./);
assert.match(topplistor, /Inkört räknas som i Körpassdata\. På jämförande mått \(kr\/mil, kr\/timme, kr\/körning, kr\/pass, dricks %\) räknas inte 0 km-resor på minst 500 kr\./);
assert.doesNotMatch(topplistor, /Inkört som i Körpassdata/);

assert.match(cl, /id: '2026-11-23zink1'/);
assert.match(cl, /Uberavgiften är 25 % av kundpriset inklusive moms överallt/);
assert.match(cl, /Inkört i Topplistor är samma som i Körpassdata/);
assert.match(cl, /I Körpassdata visas under en dag bara pass som börjar den dagen/);
assert.ok(cl.indexOf("'2026-11-23zink1'") < cl.indexOf("'2026-11-23zfly8'"), 'nyheten överst');

for (const [name, txt] of [['changelog', cl], ['lonekoll', lonekoll], ['topplistor', topplistor], ['mig-note', mig]]) {
  assert.doesNotMatch(txt, /\bStig\b/);
  // "hen" som eget ord får inte förekomma i ny UI-text; "when" i SQL är ok.
}
assert.doesNotMatch(cl, /\bhen\b/);
assert.doesNotMatch(lonekoll, /\bhen\b/);
assert.doesNotMatch(topplistor, /\bhen\b/);

assert.match(sw, /CACHE_VER = '20261123zink1'/);
assert.match(html, /lazy-views\.js\?v=20261123zink1/);
assert.match(lv, /script\.js\?v=20261123zink1/);
assert.match(lv, /lonekoll\.js\?v=20261123zink1/);
assert.match(lv, /topplistor\.js\?v=20261123zink1/);
assert.match(lv, /changelog\.js\?v=20261123zink1/);

assert.match(mig, /amt \* 0\.75/);
assert.match(mig, /tp_ratio/);
assert.match(mig, /inkort_r/);
assert.doesNotMatch(mig, /mins <= 960/);
assert.match(mig, /uber_gross \* \(1 - 0\.25\)/);
assert.match(mig, /På jämförande mått \(kr\/mil, kr\/timme, kr\/körning, kr\/pass, dricks %\) räknas inte 0 km-resor på minst 500 kr/);
assert.match(undo, /uber_gross \* \(1 - 0\.26\)/);
assert.match(undo, /mins <= 960/);
assert.match(undo, /get_topplista_metric/);
assert.match(undo, /get_rekord_metric/);

assert.match(docs, /0 km-resor på minst 500 kr filtreras bara i jämförande mått/);
assert.match(docs, /Pass längre än 16 h filtreras inte/);

// Dagsvy: ingen överlappande lista, ingen fotnot om dagen innan. Vecka/månad/år redan startdag.
assert.doesNotMatch(script, /började dagen innan/);
assert.doesNotMatch(script, /getShiftsInRange\([^)]+,\s*true\)/);
assert.match(script, /function getShiftsInRange\(start, end\)/);
assert.match(script, /let listShifts = shifts;/);
assert.doesNotMatch(script, /fromBefore/);

console.log('INKORT_ENHETLIG_OK');
