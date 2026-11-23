'use strict';
// Körpassdata: starttid i ihopfälld kvittorad, uppgifter i linje med numret utan lucka.
// Kör: node tests/korpass-kvitto-lista/unit.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot } = require('../lazy-views/dom.cjs');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const pause = ms => new Promise(r => setTimeout(r, ms || 150));

const script = read('TaxiData/script.js');
const css = read('TaxiData/style.css');
const cl = read('TaxiData/changelog.js');
const sw = read('TaxiData/sw.js');
const html = read('TaxiData/index.html');
const lv = read('TaxiData/lazy-views.js');

assert.match(script, /function formatTripHm\(/);
assert.match(script, /class="trip-tid"/);
assert.match(script, /class="trip-body"/);
assert.match(script, /trip-row/);
assert.match(script, /:scope > \.trip-body > \.sub/);
assert.match(script, /:scope > \.trip-body > \.trip-detail/);
assert.doesNotMatch(cl, /\bStig\b|\bhen\b/);
assert.match(cl, /id: '2026-11-23ztid1'/);
assert.match(cl, /starttiden på varje resa i listan/);
assert.match(cl, /i linje med kvittonumret/);
assert.ok(cl.indexOf("'2026-11-23ztid1'") < cl.indexOf("'2026-11-23zink1'"), 'nyheten överst');

assert.match(sw, /CACHE_VER = '20261123zhb2'/);
assert.match(html, /style\.css\?v=20261123zhb2/);
assert.match(html, /lazy-views\.js\?v=20261123zhb2/);
assert.match(lv, /script\.js\?v=20261123zhb2/);
assert.match(lv, /changelog\.js\?v=20261123zhb2/);

assert.match(css, /\.kv-scroll \.kv-nr/);
assert.match(css, /\.trip-body > \.sub,\s*\n\.trip-body > \.trip-detail/);
assert.match(css, /#dashboard-view \.trip-body > \.sub,/);
assert.match(css, /#dashboard-view \.trip-head \.kv-nr \{\s*flex-direction: column/);
assert.doesNotMatch(css, /\n\.kv-nr \{/);


const sh = (passnr, start, slut, tid) => ({ passnr, forar: 'fixture', start, slut, tid, taxi: 'A70', km: '40', resor: '2' });
const tr = (kv, d, t, belopp, extra) => Object.assign({
  kvittonr: kv, forar: 'fixture', startdatum: d, starttid: t, sluttid: '05:00',
  belopp: String(belopp), kredittyp: '160', dricks: '0', startzon: '117', slutzon: '10'
}, extra || {});
const shifts = [sh('4207', '20261122  02:30', '20261122  14:00', '11:30')];
const trips = [
  tr('030596-01', '2026-11-22', '04:05:00', 896),
  tr('030597-01', '2026-11-22', '04:20', 320),
  tr('030598-01', '2026-11-22', '09:15', 150)
];
const fixtures = { get_my_trip_data: { shifts, trips }, get_trip_data: { shifts, trips } };

async function openTab(tab, date, fx) {
  const st = {
    'taxi_view_state:fixture:view': JSON.stringify('kordata'),
    'taxi_view_state:fixture:kordata': JSON.stringify({ tab, date })
  };
  const a = await boot(st, '#view=kordata', { navType: 'reload', fixtures: fx || fixtures });
  for (let i = 0; i < 40 && !/Arbetade timmar/.test(a.w.document.getElementById('dashboard')?.textContent || ''); i++) await pause(100);
  return a;
}

function assertCollapsedAndOpen(row, hm, tog) {
  assert.ok(row, 'kvittorad saknas');
  const tid = row.querySelector('.trip-tid');
  assert.ok(tid, 'starttid i ihopfälld rad');
  assert.equal(tid.textContent, hm);
  assert.ok(row.querySelector('.value'), 'belopp till höger');
  assert.ok(row.querySelector(':scope > .trip-body > .trip-head > .kv-nr'), 'nummer i trip-head');
  const hidden = [...row.querySelectorAll(':scope > .trip-body > .trip-detail')];
  assert.ok(hidden.length >= 4, 'detaljer ligger i trip-body');
  assert.ok(hidden.every(el => !el.classList.contains('visible')), 'detaljer dolda när raden är ihopfälld');
  tog();
  assert.ok(row.classList.contains('open'));
  const shown = [...row.querySelectorAll(':scope > .trip-body > .trip-detail.visible')];
  assert.ok(shown.length >= 4);
  assert.match(shown[0].textContent, /Start/);
  assert.equal(!!(row.nextElementSibling && row.nextElementSibling.classList.contains('trip-detail')), false, 'detaljer är inte syskon under ikonen');
}

(async () => {
  // Dagsvy med pass: samma lista som vecka/månad (shift-trip).
  const day = await openTab('dag', '2026-11-22T12:00:00');
  assert.deepEqual(day.errors, [], 'js-fel dag: ' + day.errors.join('; '));
  const dDash = day.w.document.getElementById('dashboard');
  const dayPass = dDash.querySelector('.stat-row[data-passnr="4207"]');
  assert.ok(dayPass, 'pass 4207 i dagsvyn');
  day.w.toggleShift(dayPass);
  await pause(50);
  const dRows = [...dDash.querySelectorAll('.shift-trip')];
  assert.equal(dRows.length, 3, 'tre resor i dagsvyn: ' + dRows.length);
  const first = dRows.find(r => r.dataset.kvittonr === '030596-01');
  assert.match(first.querySelector('.value').textContent, /896/);
  assertCollapsedAndOpen(first, '04:05', () => day.w.toggleTrip(first, { stopPropagation() {} }));
  const second = dRows.find(r => r.dataset.kvittonr === '030597-01');
  assert.equal(second.querySelector('.trip-tid').textContent, '04:20', '4:20 -> 04:20');
  day.dom.window.close();

  // Månadsvy: samma lista.
  const mon = await openTab('manad', '2026-11-22T12:00:00');
  assert.deepEqual(mon.errors, [], 'js-fel månad: ' + mon.errors.join('; '));
  const mDash = mon.w.document.getElementById('dashboard');
  const mPass = mDash.querySelector('.stat-row[data-passnr="4207"]');
  mon.w.toggleShift(mPass);
  await pause(50);
  const mRow = [...mDash.querySelectorAll('.shift-trip')].find(r => r.dataset.kvittonr === '030596-01');
  assertCollapsedAndOpen(mRow, '04:05', () => mon.w.toggleTrip(mRow, { stopPropagation() {} }));
  mon.dom.window.close();

  // Dagsvy utan pass (kind=day, stat-row.trip-row): samma tid och struktur.
  const orphanFx = {
    get_my_trip_data: { shifts: [], trips: [tr('030599-01', '2026-11-22', '11:03:00', 410)] },
    get_trip_data: { shifts: [], trips: [tr('030599-01', '2026-11-22', '11:03:00', 410)] }
  };
  const od = await openTab('dag', '2026-11-22T12:00:00', orphanFx);
  assert.deepEqual(od.errors, [], 'js-fel orphan: ' + od.errors.join('; '));
  const oRow = od.w.document.querySelector('#dashboard .stat-row.trip-row');
  assert.ok(oRow, 'dagsvy utan pass använder trip-row');
  assertCollapsedAndOpen(oRow, '11:03', () => od.w.toggle(oRow));
  od.dom.window.close();

  console.log('KORPASS_KVITTO_LISTA_OK');
})().catch(e => { console.error(e); process.exit(1); });
