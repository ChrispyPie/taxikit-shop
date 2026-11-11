const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clock = Date.parse('2026-11-11T07:00:00.000Z');
const ctx = {
  window: {}, Date: class extends Date {
    constructor(...a) { super(...(a.length ? a : [clock])); }
    static now() { return clock; }
  },
  console
};
ctx.window = ctx.window;
vm.createContext(ctx);
ctx.Date.now = () => clock;
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../TaxiData/arrival-data.js'), 'utf8'), ctx);
const line = ctx.window.ARRIVAL_DATA.trainLine;
const stale = {
  lastSeen: 'Uddevalla C', lastSeenSig: 'Uv', lastSeenTs: '2026-11-10T21:50:00.000+01:00',
  sched: '2026-11-11T20:47:00.000+01:00', track: '4'
};
assert.equal(line(stale, 'G'), 'Ej avgått');
const ok = {
  lastSeen: 'Katrineholm', lastSeenSig: 'K', lastSeenTs: '2026-11-11T18:07:00.000+01:00',
  sched: '2026-11-11T20:47:00.000+01:00', track: '4'
};
assert.match(line(ok, 'G'), /Senast sedd: Katrineholm 18:07/);
console.log('PASS trainLine drops last-seen from another day and shows Ej avgått');
