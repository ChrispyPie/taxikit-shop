'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { boot } = require('../lazy-views/dom.cjs');

const root = path.resolve(__dirname, '../..');
const ank = fs.readFileSync(path.join(root, 'TaxiData/ankomster.js'), 'utf8');
assert.match(ank, /state\.updated\[s\.id\] \? d\(state\.updated\[s\.id\]\)/);
assert.doesNotMatch(
  ank,
  /var upd = state\.at\[s\.id\] \? new Date\(state\.at\[s\.id\]\)/,
  'must not prefer client receive time over feed updated'
);

function flightAt(iso) {
  return {
    id: 'SK123', dir: 'ANK', other: 'Stockholm ARN', iata: 'ARN', airline: 'SAS',
    status: 'SCH', statusSv: '', sched: iso, est: iso, act: null
  };
}
function boatAt(iso) {
  return {
    id: 'STENA1', ferry: 'Stena Jutlandica', other: 'Fredrikshamn', route: 'FRGO',
    status: 'SCH', sched: iso, est: iso, act: null, terminal: 'Danmarksterminalen'
  };
}

(async () => {
  const a = await boot({ ank_tab: 'flyg' });
  const w = a.w, original = w.fetch;
  const flyUpdated = '2026-11-11T21:40:00+01:00';
  const boatUpdated = '2026-11-11T21:50:00+01:00';
  const trainUpdated = '2026-11-11T22:10:00+01:00';
  const sched = '2026-11-11T23:00:00+01:00';

  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('got.json')) {
      return { ok: true, status: 200, json: async () => ({ airport: 'GOT', updated: flyUpdated, arrivalsUpdated: flyUpdated, arrivals: [flightAt(sched)], departures: [] }) };
    }
    if (u.includes('bat.json')) {
      return { ok: true, status: 200, json: async () => ({ port: 'GOT', updated: boatUpdated, arrivals: [boatAt(sched)] }) };
    }
    if (u.includes('/api/trains') && !u.includes('delta=') && !u.includes('stations=')) {
      return { ok: true, status: 200, json: async () => ({ station: 'Göteborg C', stationSignature: 'G', updated: trainUpdated, trains: [{ id: '400', dir: 'ANK', sched, other: 'Stockholm C', from: ['Stockholm C'] }] }) };
    }
    return original(url, opts);
  };

  await w.openItem('ankomster');
  await new Promise((r) => setTimeout(r, 120));

  function head() {
    const el = w.document.querySelector('.ank-head');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  // Flyg: Swedavia-tid 21:40:00, inte "nu"
  let text = head();
  assert.match(text, /uppdaterad 21:40:00/, 'flyg uses arrivalsUpdated, got: ' + text);
  assert.doesNotMatch(text, /22:3\d:\d\d/, 'flyg must not show page-open time');
  const warn = w.document.querySelector('.ank-warn');
  assert.ok(warn && /äldre än 15 minuter/.test(warn.textContent), 'stale flyg warning');

  w.document.querySelector('[data-ank-tab="bat"]').click();
  await new Promise((r) => setTimeout(r, 120));
  text = head();
  assert.match(text, /uppdaterad 21:50:00/, 'bat uses feed updated, got: ' + text);

  w.document.querySelector('[data-ank-tab="tag"]').click();
  await new Promise((r) => setTimeout(r, 120));
  text = head();
  assert.match(text, /uppdaterad 22:10:00/, 'tag uses API updated, got: ' + text);

  if (w.ANKOMSTER && w.ANKOMSTER.stop) w.ANKOMSTER.stop();
  a.dom.window.close();
  console.log('PASS ankomster header uses source fetch time (flyg, bat, tag)');
})().catch((e) => { console.error(e); process.exitCode = 1; });
