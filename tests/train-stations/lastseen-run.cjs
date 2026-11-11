// Senast sedd måste bindas till samma tågnummer OCH samma avgångsdatum, och bara stationer på den här turen.
const assert = require('node:assert/strict');
process.env.TRAFIKVERKET_API_KEY = 'synthetic-not-a-real-key';
const handler = require('../../api/trains.js');
const I = handler._internal;

const clock = Date.parse('2026-11-11T07:00:00.000Z'); // 08:00 Europe/Stockholm
const realNow = Date.now;
Date.now = () => clock;

assert.equal(I.stockholmDate('2026-11-11T17:10:00.000+01:00'), '2026-11-11');
assert.equal(I.stockholmDate('2026-11-10T21:50:00.000+01:00'), '2026-11-10');
assert.equal(I.runKey('443', '2026-11-11T17:10:00.000+01:00'), '443|2026-11-11');
assert.equal(I.runKey('443', '2026-11-11'), '443|2026-11-11');

const tonight = {
  id: '443', dir: 'ANK',
  sched: '2026-11-11T20:47:00.000+01:00',
  est: '', act: '',
  depAt: '2026-11-11T17:10:00.000+01:00',
  depDate: '2026-11-11',
  lastSeen: 'Uddevalla C', lastSeenSig: 'Uv', lastSeenTs: '2026-11-10T21:50:00.000+01:00'
};
assert.equal(I.sameRunTs(tonight, '2026-11-10T21:50:00.000+01:00', '2026-11-10'), false);
assert.equal(I.lastSeenOnRoute(tonight, 'Uv', '2026-11-10T21:50:00.000+01:00'), false);

const seen = {
  '443|2026-11-10': { ts: '2026-11-10T21:50:00.000+01:00', sig: 'Uv', act: 'Ankomst', depDate: '2026-11-10' }
};
assert.equal(I.lookupLastSeen(seen, tonight), null);

const routes = {
  '443|2026-11-10': {
    A: { sig: 'A', t: '2026-11-10T20:10:00.000+01:00', act: '2026-11-10T20:11:00.000+01:00', sched: '2026-11-10T20:10:00.000+01:00', depDate: '2026-11-10' },
    G: { sig: 'G', t: '2026-11-10T20:47:00.000+01:00', act: '2026-11-10T20:51:00.000+01:00', sched: '2026-11-10T20:47:00.000+01:00', depDate: '2026-11-10' },
    Uv: { sig: 'Uv', t: '2026-11-10T21:50:00.000+01:00', act: '2026-11-10T21:50:00.000+01:00', sched: '2026-11-10T21:50:00.000+01:00', depDate: '2026-11-10' }
  },
  '443|2026-11-11': {
    Cst: { sig: 'Cst', t: '2026-11-11T17:10:00.000+01:00', act: '', sched: '2026-11-11T17:10:00.000+01:00', depDate: '2026-11-11' },
    K: { sig: 'K', t: '2026-11-11T18:06:00.000+01:00', act: '', sched: '2026-11-11T18:06:00.000+01:00', depDate: '2026-11-11' },
    A: { sig: 'A', t: '2026-11-11T20:10:00.000+01:00', act: '', sched: '2026-11-11T20:10:00.000+01:00', depDate: '2026-11-11' },
    G: { sig: 'G', t: '2026-11-11T20:47:00.000+01:00', act: '', sched: '2026-11-11T20:47:00.000+01:00', depDate: '2026-11-11' },
    Uv: { sig: 'Uv', t: '2026-11-11T21:50:00.000+01:00', act: '', sched: '2026-11-11T21:50:00.000+01:00', depDate: '2026-11-11' }
  }
};

const f = {
  id: '443', dir: 'ANK',
  sched: '2026-11-11T20:47:00.000+01:00',
  depAt: '2026-11-11T17:10:00.000+01:00',
  depDate: '2026-11-11'
};
I.attachLastSeen([f], { best: seen, idents: [] }, routes, 'G');
assert.equal(f.lastSeen, undefined, 'tonight 443 must not inherit yesterday Uddevalla last-seen');
assert.equal(f.lastSeenSig, undefined);
assert.equal(f.posChecked, true);
assert.ok(f.stops && f.stops.length, 'tonight route attached');
assert.deepEqual(f.stops.map(s => s.sig), ['Cst', 'K', 'A', 'G']);
assert.ok(f.stops.every(s => !s.act), 'tonight has not departed');

// Same ident without ScheduledDepartureDateTime: journey window still drops yesterday.
const g = { id: '443', dir: 'ANK', sched: '2026-11-11T20:47:00.000+01:00' };
const identOnly = {
  '443': Object.assign({}, routes['443|2026-11-10'], routes['443|2026-11-11'])
};
// ident-only bag used earliest t per sig in the old bug; simulate mixed bag:
identOnly['443'].G = routes['443|2026-11-10'].G;
identOnly['443'].Uv = routes['443|2026-11-10'].Uv;
identOnly['443'].Cst = routes['443|2026-11-11'].Cst;
identOnly['443'].K = routes['443|2026-11-11'].K;
identOnly['443'].A = routes['443|2026-11-10'].A;
I.attachLastSeen([g], { best: { '443': { ts: '2026-11-10T21:50:00.000+01:00', sig: 'Uv', act: 'Ankomst' } }, idents: ['443'] }, identOnly, 'G');
assert.equal(g.lastSeen, undefined, 'window fallback must drop yesterday last-seen even without depDate');
assert.ok(!g.stops || !g.stops.some(s => s.sig === 'Uv'), 'Uddevalla is not on tonight route-to-G');

// Running train, same run, mid-route last-seen is kept; continuation after G is not.
const running = {
  id: '443', dir: 'ANK',
  sched: '2026-11-11T20:47:00.000+01:00',
  depDate: '2026-11-11',
  depAt: '2026-11-11T17:10:00.000+01:00'
};
const runningRoutes = { '443|2026-11-11': {
  Cst: { sig: 'Cst', t: '2026-11-11T17:10:00.000+01:00', act: '2026-11-11T17:11:00.000+01:00', sched: '2026-11-11T17:10:00.000+01:00', depDate: '2026-11-11' },
  K: { sig: 'K', t: '2026-11-11T18:06:00.000+01:00', act: '2026-11-11T18:07:00.000+01:00', sched: '2026-11-11T18:06:00.000+01:00', depDate: '2026-11-11' },
  G: { sig: 'G', t: '2026-11-11T20:47:00.000+01:00', act: '', sched: '2026-11-11T20:47:00.000+01:00', depDate: '2026-11-11' },
  Uv: { sig: 'Uv', t: '2026-11-11T21:50:00.000+01:00', act: '', sched: '2026-11-11T21:50:00.000+01:00', depDate: '2026-11-11' }
} };
I.attachLastSeen([running], { best: {
  '443|2026-11-11': { ts: '2026-11-11T18:07:00.000+01:00', sig: 'K', act: 'Avgang', depDate: '2026-11-11' }
}, idents: ['443'] }, runningRoutes, 'G');
assert.equal(running.lastSeenSig, 'K');
assert.ok(!running.stops.some(s => s.sig === 'Uv'));

Date.now = realNow;
console.log('PASS last-seen is keyed by train number + departure date and only stations on this run up to the arrival');
