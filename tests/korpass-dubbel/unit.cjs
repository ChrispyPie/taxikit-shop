'use strict';
// Körpassdata: nattpass räknas bara på sin startdag (2026-11-14kp1, t1590u).
// Fall: förare 710022 kör ~17–06; dagsvyn visade 25 h/dygn eftersom kvällens och föregående natts pass båda räknades.
// Offline-DOM (jsdom) via tests/lazy-views/dom.cjs. Kör: node tests/korpass-dubbel/unit.cjs
const assert = require('node:assert/strict');
const { boot } = require('../lazy-views/dom.cjs');
const pause = ms => new Promise(r => setTimeout(r, ms || 150));
const sh = (passnr, start, slut, tid) => ({ passnr, forar: 'fixture', start, slut, tid, taxi: 'A191', km: '100', resor: '1' });
const tr = (kvitto, d, t, belopp) => ({ kvittonr: kvitto, forar: 'fixture', startdatum: d, starttid: t, belopp: String(belopp), kredittyp: '160' });
const shifts = [
  sh('4184', '20261110  17:17', '20261111  05:51', '12:34'),
  sh('4186', '20261111  17:12', '20261112  05:57', '12:45'),
  sh('4188', '20261112  17:54', '20261113  05:54', '12:0')
];
const trips = [tr('1', '2026-11-10', '20:00', 100), tr('2', '2026-11-11', '02:00', 200), tr('3', '2026-11-11', '20:00', 400), tr('4', '2026-11-12', '03:00', 800)];
const fixtures = { get_my_trip_data: { shifts, trips }, get_trip_data: { shifts, trips } };
async function day(date) {
  const st = { 'taxi_view_state:fixture:view': JSON.stringify('kordata'), 'taxi_view_state:fixture:kordata': JSON.stringify({ tab: 'dag', date }) };
  const a = await boot(st, '#view=kordata', { navType: 'reload', fixtures });
  for (let i = 0; i < 40 && !/Arbetade timmar/.test(a.w.document.getElementById('dashboard')?.textContent || ''); i++) await pause(100);
  const dash = a.w.document.getElementById('dashboard');
  const row = [...dash.querySelectorAll('.stat-row')].find(r => /Arbetade timmar/.test(r.textContent));
  const hours = row ? row.querySelector('.value').textContent.trim() : null;
  const passes = [...dash.querySelectorAll('.stat-row[data-passnr]')].map(r => r.dataset.passnr);
  const text = dash.textContent;
  const errors = a.errors.slice(); a.dom.window.close();
  return { hours, passes, text, errors };
}
(async () => {
  const d11 = await day('2026-11-11T12:00:00');
  assert.ok(d11.hours, 'Arbetade timmar visas: ' + d11.text.slice(0, 300));
  assert.match(d11.hours, /^12\D+45|^12:45/, '11/11 = bara passet som startade 11/11 (12:45), inte 25 h: ' + d11.hours);
  assert.deepEqual(d11.passes.sort(), ['4184', '4186'], 'dagsvyn listar fortfarande nattpasset från kvällen innan');
  assert.match(d11.text, /10\/11 #4184/, 'passet från kvällen innan har datum');
  assert.match(d11.text, /räknas på den dagen/);
  const d12 = await day('2026-11-12T12:00:00');
  assert.match(d12.hours, /^12\D+0?0?|^12:00/, '12/11 = 12 h: ' + d12.hours);
  assert.deepEqual(d11.errors, []);
  console.log('KORPASS_DUBBEL_OK', d11.hours, d12.hours);
})().catch(e => { console.error(e); process.exit(1); });
