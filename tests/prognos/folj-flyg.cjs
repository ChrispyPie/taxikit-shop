'use strict';
// Landvetter-bokning följer flygets nya tid med samma förskjutning (20261122zfly1).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const js = fs.readFileSync(path.join(root, 'TaxiData/prognos.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'TaxiData/style.css'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');

assert.doesNotMatch(js, /\bStig\b/);
assert.doesNotMatch(css, /\bStig\b/);
assert.doesNotMatch(cl.split("id: '2026-11-22zfly1'")[1].split(']},')[0], /\b(Stig|hen)\b/);
assert.match(cl, /id: '2026-11-22zfly1'/);
assert.doesNotMatch(cl.split("id: '2026-11-22zfly1'")[1].split(']},')[0].split('rader:')[0], /tid:/, 'tid unset until go-live');
assert.match(cl.split("id: '2026-11-22zfly1'")[1].split(']},')[0], /20 min efter/);
assert.match(lv, /prognos\.js\?v=20261122zfly1/);
assert.match(html, /style\.css\?v=20261122zfly1/);
assert.match(css, /\.pg-n\.pg-fly-follow/);
assert.match(css, /\.pg-pop-follow-box/);
assert.match(js, /function followMatch\(/);
assert.match(js, /FOLLOW_BEFORE_MS = 5 \* 60000/);
assert.match(js, /FOLLOW_AFTER_MS = 20 \* 60000/);
assert.match(js, /FOLLOW_BAGAGE_MS = 5 \* 60000/);
assert.match(js, /troligen på grund av bagage/);
assert.match(js, /Flera flyg kan passa bokningen, så tiden är inte flyttad/);
assert.doesNotMatch(js, /tiderna i schemat flyttas aldrig/);
assert.doesNotMatch(js, /FOLLOW_MAX_MS/);

const floorSrc = js.match(/function floor5\(d\) \{[\s\S]*?\n  \}/)[0];
const p2Src = js.match(/function p2\(n\) \{[^}]+\}/)[0];
const hmSrc = js.match(/function hm\(d\) \{[^}]+\}/)[0];
const shownSrc = js.match(/function followShown\(f\) \{[\s\S]*?\n  \}/)[0];
const labSrc = js.match(/function followNewLabel\(f\) \{[\s\S]*?\n  \}/)[0];
const candSrc = js.match(/function followCandidates\(b, flights\) \{[\s\S]*?\n  \}/)[0];
const matchSrc = js.match(/function followMatch\(b, flights\) \{[\s\S]*?\n  \}/)[0];
const explSrc = js.match(/function followExplain\(fol\) \{[\s\S]*?\n  \}/)[0];
const lineSrc = js.match(/function followCandLine\(c\) \{[\s\S]*?\n  \}/)[0];
const applySrc = js.match(/function applyFollows\(list, flights\) \{[\s\S]*?\n  \}/)[0];
const whenSrc = js.match(/function bookingWhen\(b\) \{[\s\S]*?\n  \}/)[0];
assert.ok(floorSrc && matchSrc && explSrc && applySrc, 'helpers present');

const api = new Function(
  'var FLIGHT_ZONE = "293";\n' +
  'var FOLLOW_BEFORE_MS = 5 * 60000;\n' +
  'var FOLLOW_AFTER_MS = 20 * 60000;\n' +
  'var FOLLOW_BAGAGE_MS = 5 * 60000;\n' +
  p2Src + '\n' + hmSrc + '\n' + floorSrc + '\n' + shownSrc + '\n' + labSrc + '\n' +
  candSrc + '\n' + matchSrc + '\n' + explSrc + '\n' + lineSrc + '\n' + applySrc + '\n' + whenSrc + '\n' +
  'return { followMatch: followMatch, followCandidates: followCandidates, followExplain: followExplain, followCandLine: followCandLine, applyFollows: applyFollows, bookingWhen: bookingWhen, floor5: floor5 };'
)();

function t(iso) { return Date.parse(iso); }
function fl(o) {
  return Object.assign({ no: 'EW8220', from: 'Berlin', canceled: false, removed: false }, o);
}

const sched = t('2026-11-22T18:25:00Z'); // 19:25 Stockholm
const est10 = t('2026-11-22T18:35:00Z'); // 19:35
const book = { id: 'b1', zone_id: '293', estimated_at: '2026-11-22T18:25:00.000Z' };

// Samma klockslag: booking 19:25, flight sched 19:25, est 19:35 → visas 19:35
const hit = api.followMatch(book, [fl({ sched: sched, est: est10 })]);
assert.ok(hit && !hit.cands, 'matches delayed flight at same scheduled time');
assert.equal(hit.at, est10);
assert.equal(hit.from, sched);
assert.equal(hit.offset, 0);
assert.equal(hit.flight.no, 'EW8220');
assert.equal(api.bookingWhen(Object.assign({}, book, { _follow: hit })), est10);

// Christian: booking 20 min after planned 19:25, flight now 19:35 → shown 19:55
const book20 = { id: 'b20', zone_id: '293', estimated_at: '2026-11-22T18:45:00.000Z' };
const late = api.followMatch(book20, [fl({ sched: sched, est: est10 })]);
assert.ok(late && !late.cands, 'matches booking 20 min after scheduled landing');
assert.equal(late.offset, 20 * 60000);
assert.equal(late.at, t('2026-11-22T18:55:00Z'), 'keeps the 20 min offset');
const txt20 = api.followExplain(late);
assert.match(txt20, /Bokningen ligger 20 min efter planerad landning, troligen på grund av bagage, för EW8220 \(planerad 19:25, beräknad 19:35\) och visas kl 19:55\./);

// 21 min after is outside the window
const book21 = { id: 'b21', zone_id: '293', estimated_at: '2026-11-22T18:46:00.000Z' };
assert.equal(api.followMatch(book21, [fl({ sched: sched, est: est10 })]), null);

// 5 min before planned landing is still allowed
const bookBefore = { id: 'bb', zone_id: '293', estimated_at: '2026-11-22T18:20:00.000Z' };
const before = api.followMatch(bookBefore, [fl({ sched: sched, est: est10 })]);
assert.ok(before && !before.cands, '5 min before scheduled still matches');
assert.equal(before.offset, -5 * 60000);
assert.equal(before.at, t('2026-11-22T18:30:00Z'));
assert.match(api.followExplain(before), /ligger 5 min före planerad landning för EW8220/);
assert.doesNotMatch(api.followExplain(before), /bagage/);

// 6 min before is outside
assert.equal(api.followMatch({ id: 'b6', zone_id: '293', estimated_at: '2026-11-22T18:19:00.000Z' }, [fl({ sched: sched, est: est10 })]), null);

// Small after-offset (3 min): follow, but no bagage reason
const book3 = { id: 'b3', zone_id: '293', estimated_at: '2026-11-22T18:28:00.000Z' };
const small = api.followMatch(book3, [fl({ sched: sched, est: est10 })]);
assert.ok(small && !small.cands);
assert.equal(small.at, t('2026-11-22T18:38:00.000Z'));
assert.match(api.followExplain(small), /ligger 3 min efter planerad landning för EW8220/);
assert.doesNotMatch(api.followExplain(small), /bagage/);

// Exactly 5 min after: no bagage (only when offset > ~5 min)
const book5 = { id: 'b5', zone_id: '293', estimated_at: '2026-11-22T18:30:00.000Z' };
const five = api.followMatch(book5, [fl({ sched: sched, est: est10 })]);
assert.ok(five);
assert.doesNotMatch(api.followExplain(five), /bagage/);

// Early arrival, offset 0
const early = t('2026-11-22T18:15:00Z');
const earlyHit = api.followMatch(book, [fl({ sched: sched, est: early })]);
assert.ok(earlyHit && !earlyHit.cands, 'follows early arrival');
assert.equal(earlyHit.at, early);
assert.equal(earlyHit.offset, 0);
assert.ok(earlyHit.at < earlyHit.from, 'moves earlier when the flight is early');
assert.doesNotMatch(api.followExplain(earlyHit), /bagage/);

// Tonight: DK1727 from Tenerife, planned 21:55, estimated 21:41, booking at 21:55 → shown 21:41 (~21:40 slot)
const sched2155 = t('2026-11-22T20:55:00Z');
const est2141 = t('2026-11-22T20:41:00Z');
const book2155 = { id: 'dk', zone_id: '293', estimated_at: '2026-11-22T20:55:00.000Z' };
const dk = api.followMatch(book2155, [fl({ no: 'DK1727', from: 'Tenerife', sched: sched2155, est: est2141 })]);
assert.ok(dk && !dk.cands, 'early arrival of DK1727 moves the booking');
assert.equal(dk.offset, 0);
assert.equal(dk.at, est2141, 'same offset both directions: planned 21:55, now 21:41 → booking at 21:41');
assert.equal(dk.from, sched2155);
assert.equal(+api.floor5(new Date(dk.at)), t('2026-11-22T20:40:00Z'), 'grid slot ~21:40');
assert.equal(api.bookingWhen(Object.assign({}, book2155, { _follow: dk })), est2141);
const dkTxt = api.followExplain(dk);
assert.match(dkTxt, /Bokningen följer DK1727 \(planerad 21:55, beräknad 21:41\) och visas kl 21:41\./);
assert.doesNotMatch(dkTxt, /bagage/, 'bagage only when the booking is after planned landing');

// Early flight, booking 10 min after planned (in the 0–20 after window): keep +10 offset, bagage applies
const book2205 = { id: 'dk10', zone_id: '293', estimated_at: '2026-11-22T21:05:00.000Z' };
const dk10 = api.followMatch(book2205, [fl({ no: 'DK1727', from: 'Tenerife', sched: sched2155, est: est2141 })]);
assert.ok(dk10 && !dk10.cands);
assert.equal(dk10.offset, 10 * 60000);
assert.equal(dk10.at, t('2026-11-22T20:51:00Z'), '21:41 + 10 min → 21:51');
assert.match(api.followExplain(dk10), /troligen på grund av bagage/);

// On time (est = sched) → no move
assert.equal(api.followMatch(book, [fl({ sched: sched, est: sched })]), null);

// Same 5-min slot (3 min delay, offset 0) → no visual move
assert.equal(api.followMatch(book, [fl({ sched: sched, est: t('2026-11-22T18:28:00Z') })]), null);

// Several plausible flights in the window → do not move, list candidates
const other = t('2026-11-22T18:30:00Z');
const amb = api.followMatch(book, [
  fl({ no: 'BA1', from: 'London LHR', sched: other, est: t('2026-11-22T18:40:00Z') }),
  fl({ no: 'EW8220', sched: sched, est: est10 })
]);
assert.ok(amb && amb.cands && amb.cands.length === 2, 'ambiguous: no move');
assert.equal(api.followCandidates(book, [
  fl({ no: 'BA1', sched: other, est: t('2026-11-22T18:40:00Z') }),
  fl({ no: 'EW8220', sched: sched, est: est10 })
]).length, 2);
const line = api.followCandLine(amb.cands.find(function (c) { return c.flight.no === 'BA1'; }));
assert.match(line, /BA1 från London LHR, planerad 19:30, beräknad 19:40/);

// Two flights with the same scheduled time → also ambiguous
const tie = api.followMatch(book, [
  fl({ no: 'EW8220', sched: sched, est: est10 }),
  fl({ no: 'AY867', from: 'Helsingfors', sched: sched, est: t('2026-11-22T18:40:00Z') })
]);
assert.ok(tie && tie.cands && tie.cands.length === 2, 'same scheduled time is ambiguous');

// Other zone: no
assert.equal(api.followMatch({ zone_id: '147', estimated_at: book.estimated_at }, [fl({ sched: sched, est: est10 })]), null);

// Canceled / removed
assert.equal(api.followMatch(book, [fl({ sched: sched, est: est10, canceled: true })]), null);
assert.equal(api.followMatch(book, [fl({ sched: sched, est: est10, removed: true })]), null);

// No estimated/actual time
assert.equal(api.followMatch(book, [fl({ sched: sched })]), null);

// Landing already happened (act) still moves to that time + offset
const act = t('2026-11-22T18:36:00Z');
const landed = api.followMatch(book, [fl({ sched: sched, est: est10, act: act })]);
assert.ok(landed && !landed.cands);
assert.equal(landed.at, act, 'actual landing wins over estimate');
assert.match(api.followExplain(landed), /landat 19:36/);

// applyFollows: unique move vs ambiguous list vs other zone
const list = [
  Object.assign({}, book),
  Object.assign({}, book20, { id: 'b20b' }),
  { id: 'bamb', zone_id: '293', estimated_at: book.estimated_at },
  { id: 'b2', zone_id: '147', estimated_at: book.estimated_at }
];
const flights = [
  fl({ sched: sched, est: est10 }),
  fl({ no: 'BA1', from: 'London LHR', sched: other, est: t('2026-11-22T18:40:00Z') })
];
// book and bamb share 19:25 and see both flights → cands; book20 at 19:45: BA1 at 19:30 is +15 (in window), EW8220 +20 (in window) → also ambiguous!
// Need a unique 20 min case: only EW8220 in the list for book20
api.applyFollows([list[0], list[3]], [fl({ sched: sched, est: est10 })]);
assert.ok(list[0]._follow);
assert.equal(list[0]._follow.flight.no, 'EW8220');
assert.equal(list[3]._follow, undefined);
assert.equal(list[3]._followCands, undefined);

const onlyLate = [Object.assign({}, book20)];
api.applyFollows(onlyLate, [fl({ sched: sched, est: est10 })]);
assert.ok(onlyLate[0]._follow);
assert.equal(onlyLate[0]._follow.at, t('2026-11-22T18:55:00Z'));
assert.equal(onlyLate[0]._followCands, undefined);

const two = [{ id: 'bx', zone_id: '293', estimated_at: book.estimated_at }];
api.applyFollows(two, flights);
assert.equal(two[0]._follow, undefined);
assert.ok(two[0]._followCands && two[0]._followCands.length === 2);
api.applyFollows(two, []);
assert.equal(two[0]._follow, undefined);
assert.equal(two[0]._followCands, undefined);

console.log('FOLJ_FLYG_UNIT_OK');
