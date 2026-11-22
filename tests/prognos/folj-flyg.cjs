'use strict';
// Landvetter-bokning följer flyget: planerad, annars beräknad, annars närmast före; närmaste 5 min.
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
assert.doesNotMatch(cl.split("id: '2026-11-22zfly5'")[1].split(']},')[0], /\b(Stig|hen)\b/);
assert.match(cl, /id: '2026-11-22zfly5'/);
assert.match(cl.split("id: '2026-11-22zfly5'")[1].split(']},')[0].split('rader:')[0], /tid: '21:25'/);
assert.match(cl.split("id: '2026-11-22zfly5'")[1].split(']},')[0], /Bokningarna följer/);
assert.match(cl, /id: '2026-11-22zfly4'/);
assert.match(cl.split("id: '2026-11-22zfly4'")[1].split(']},')[0].split('rader:')[0], /tid: '21:20'/);
assert.match(cl.split("id: '2026-11-22zfly4'")[1].split(']},')[0], /närmaste fem minuter/);
assert.match(cl.split("id: '2026-11-22zfly4'")[1].split(']},')[0], /planerade tid/);
assert.match(cl, /id: '2026-11-22zfly3'/);
assert.match(cl.split("id: '2026-11-22zfly3'")[1].split(']},')[0].split('rader:')[0], /tid: '21:05'/);
assert.match(cl, /id: '2026-11-22zfly1'/);
assert.match(cl.split("id: '2026-11-22zfly1'")[1].split(']},')[0].split('rader:')[0], /tid: '20:56'/);
assert.match(lv, /prognos\.js\?v=20261122zjul3/);
assert.match(html, /style\.css\?v=20261122zjul3/);
assert.doesNotMatch(css, /pg-fly-from/);
assert.doesNotMatch(js, /pg-fly-from/);
assert.match(js, /pg-fly-follow/);
assert.match(js, /\(från ' \+ hm\(new Date\(b\._follow\.from\)\)/);
assert.match(css, /\.pg-pop-follow-box/);
assert.match(js, /function followExplain\(fol, n\)/);
assert.match(js, /who = \(n > 1\) \? 'Bokningarna' : 'Bokningen'/);
assert.match(js, /folGroups/);
assert.doesNotMatch(js, /follows\.slice\(0, 3\)\.map\(function \(b\) \{ return esc\(followExplain\(b\._follow\)\); \}/);
assert.match(js, /function followMatch\(/);
assert.match(js, /function round5\(/);
assert.match(js, /FOLLOW_NEAR_MS = 2 \* 60000/);
assert.match(js, /FOLLOW_AFTER_MS = 20 \* 60000/);
assert.doesNotMatch(js, /FOLLOW_BEFORE_MS/);
assert.doesNotMatch(js, /FOLLOW_BAGAGE_MS/);
assert.match(js, /troligen på grund av bagage/);
assert.match(js, /Flera plan är möjliga, så tiden är inte flyttad/);
assert.doesNotMatch(js, /Flera flyg kan passa bokningen, så tiden är inte flyttad/);
assert.doesNotMatch(js, /tiderna i schemat flyttas aldrig/);
assert.doesNotMatch(js, /FOLLOW_MAX_MS/);
assert.doesNotMatch(js, /historisk|historical|London STN|isLondon/);

const p2Src = js.match(/function p2\(n\) \{[^}]+\}/)[0];
const hmSrc = js.match(/function hm\(d\) \{[^}]+\}/)[0];
const floorStart = js.indexOf('  function floor5(d) {');
const addMinAt = js.indexOf('  function addMin(', floorStart);
const roundBlock = js.slice(floorStart, addMinAt);
const followStart = js.indexOf('  function followShown(f) {');
const followEnd = js.indexOf('  function flightInfo(', followStart);
const followBlock = js.slice(followStart, followEnd);
assert.ok(roundBlock.includes('function round5') && followBlock.includes('function followPick'), 'helpers present');

const api = new Function(
  'var FLIGHT_ZONE = "293";\n' +
  'var FOLLOW_NEAR_MS = 2 * 60000;\n' +
  'var FOLLOW_AFTER_MS = 20 * 60000;\n' +
  p2Src + '\n' + hmSrc + '\n' + roundBlock + '\n' + followBlock + '\n' +
  'return { followMatch: followMatch, followCandidates: followCandidates, followExplain: followExplain, followCandLine: followCandLine, applyFollows: applyFollows, bookingWhen: bookingWhen, floor5: floor5, round5: round5, nearTime: nearTime, followPick: followPick };'
)();

function t(iso) { return Date.parse(iso); }
function fl(o) {
  return Object.assign({ no: 'EW8220', from: 'Berlin', canceled: false, removed: false }, o);
}

assert.equal(+api.round5(new Date(t('2026-11-22T21:14:00Z'))), t('2026-11-22T21:15:00Z'), '22:14 → 22:15');
assert.equal(+api.round5(new Date(t('2026-11-22T20:41:00Z'))), t('2026-11-22T20:40:00Z'), '21:41 → 21:40');
assert.equal(+api.round5(new Date(t('2026-11-22T21:12:00Z'))), t('2026-11-22T21:10:00Z'), '22:12 → 22:10');
assert.equal(+api.round5(new Date(t('2026-11-22T21:13:00Z'))), t('2026-11-22T21:15:00Z'), '22:13 → 22:15');
assert.equal(+api.floor5(new Date(t('2026-11-22T21:14:00Z'))), t('2026-11-22T21:10:00Z'), 'floor still 22:10');

const sched = t('2026-11-22T18:25:00Z'); // 19:25 Stockholm
const est10 = t('2026-11-22T18:35:00Z'); // 19:35
const book = { id: 'b1', zone_id: '293', estimated_at: '2026-11-22T18:25:00.000Z' };

// Samma klockslag: booking 19:25, flight sched 19:25, est 19:35 → visas 19:35
const hit = api.followMatch(book, [fl({ sched: sched, est: est10 })]);
assert.ok(hit && !hit.cands, 'matches delayed flight at same scheduled time');
assert.equal(hit.at, est10);
assert.equal(hit.from, sched);
assert.equal(hit.offset, 0);
assert.equal(hit.why, 'planned');
assert.equal(hit.flight.no, 'EW8220');
assert.equal(api.bookingWhen(Object.assign({}, book, { _follow: hit })), est10);
assert.doesNotMatch(api.followExplain(hit), /bagage/);
assert.match(api.followExplain(hit), /^Bokningen följer /);
assert.match(api.followExplain(hit, 1), /^Bokningen följer /);
assert.match(api.followExplain(hit, 4), /^Bokningarna följer EW8220 \(planerad 19:25, beräknad 19:35\) och visas kl 19:35\./);
assert.doesNotMatch(api.followExplain(hit, 4), /Bokningen följer/);

// Christian: booking 20 min after planned 19:25, flight now 19:35 → shown 19:55
const book20 = { id: 'b20', zone_id: '293', estimated_at: '2026-11-22T18:45:00.000Z' };
const late = api.followMatch(book20, [fl({ sched: sched, est: est10 })]);
assert.ok(late && !late.cands, 'matches booking 20 min after scheduled landing');
assert.equal(late.offset, 20 * 60000);
assert.equal(late.at, t('2026-11-22T18:55:00Z'), 'keeps the 20 min offset');
assert.equal(late.why, 'bagage');
const txt20 = api.followExplain(late);
assert.match(txt20, /Bokningen ligger 20 min efter planerad landning, troligen på grund av bagage, för EW8220 \(planerad 19:25, beräknad 19:35\) och visas kl 19:55\./);
assert.match(api.followExplain(late, 3), /Bokningarna ligger 20 min efter planerad landning, troligen på grund av bagage, för EW8220 \(planerad 19:25, beräknad 19:35\) och visas kl 19:55\./);

// Early arrival DK1727: planned 21:55, est 21:41, booking 21:55 → 21:41, slot 21:40, no bagage
const sched2155 = t('2026-11-22T20:55:00Z');
const est2141 = t('2026-11-22T20:41:00Z');
const book2155 = { id: 'dk', zone_id: '293', estimated_at: '2026-11-22T20:55:00.000Z' };
const dk = api.followMatch(book2155, [fl({ no: 'DK1727', from: 'Tenerife', sched: sched2155, est: est2141 })]);
assert.ok(dk && !dk.cands);
assert.equal(dk.at, est2141);
assert.equal(dk.why, 'planned');
assert.equal(+api.round5(new Date(dk.at)), t('2026-11-22T20:40:00Z'), 'grid slot ~21:40');
assert.equal(api.bookingWhen(Object.assign({}, book2155, { _follow: dk })), est2141);
const dkTxt = api.followExplain(dk);
assert.match(dkTxt, /Bokningen följer DK1727 \(planerad 21:55, beräknad 21:41\) och visas kl 21:41\./);
assert.doesNotMatch(dkTxt, /bagage/, 'bagage only when picked as closest planned before');

// Early flight, booking 10 min after planned: keep +10 offset, bagage (rule 3)
const book2205 = { id: 'dk10', zone_id: '293', estimated_at: '2026-11-22T21:05:00.000Z' };
const dk10 = api.followMatch(book2205, [fl({ no: 'DK1727', from: 'Tenerife', sched: sched2155, est: est2141 })]);
assert.ok(dk10 && !dk10.cands);
assert.equal(dk10.offset, 10 * 60000);
assert.equal(dk10.at, t('2026-11-22T20:51:00Z'), '21:41 + 10 min → 21:51');
assert.equal(dk10.why, 'bagage');
assert.match(api.followExplain(dk10), /troligen på grund av bagage/);

// On time (est = sched) → no move
assert.equal(api.followMatch(book, [fl({ sched: sched, est: sched })]), null);

// 2 min delay still same rounded slot (19:27 → 19:25) → no visual move
assert.equal(api.followMatch(book, [fl({ sched: sched, est: t('2026-11-22T18:27:00Z') })]), null);

// 3 min delay rounds to next slot (19:28 → 19:30) → move
const slight = api.followMatch(book, [fl({ sched: sched, est: t('2026-11-22T18:28:00Z') })]);
assert.ok(slight && !slight.cands);
assert.equal(slight.at, t('2026-11-22T18:28:00Z'));
assert.equal(+api.round5(new Date(slight.at)), t('2026-11-22T18:30:00Z'));

// Planned time equals booking wins even if another flight is in the window
const other = t('2026-11-22T18:30:00Z');
const prefer = api.followMatch(book, [
  fl({ no: 'BA1', from: 'London LHR', sched: other, est: t('2026-11-22T18:40:00Z') }),
  fl({ no: 'EW8220', sched: sched, est: est10 })
]);
assert.ok(prefer && !prefer.cands);
assert.equal(prefer.flight.no, 'EW8220');
assert.equal(prefer.why, 'planned');
assert.equal(prefer.at, est10);

// Two flights with the same scheduled time → true tie, no move
const tie = api.followMatch(book, [
  fl({ no: 'EW8220', sched: sched, est: est10 }),
  fl({ no: 'AY867', from: 'Helsingfors', sched: sched, est: t('2026-11-22T18:40:00Z') })
]);
assert.ok(tie && tie.cands && tie.cands.length === 2 && !tie.flight, 'same planned time is a true tie');

// Rule 2: no planned match, estimated time equals booking
const book1935 = { id: 'be', zone_id: '293', estimated_at: '2026-11-22T18:35:00.000Z' };
const byEst = api.followMatch(book1935, [
  fl({ no: 'EW8220', sched: sched, est: t('2026-11-22T18:35:00Z') }),
  fl({ no: 'BA1', from: 'London LHR', sched: t('2026-11-22T18:20:00Z'), est: t('2026-11-22T18:22:00Z') })
]);
assert.ok(byEst && !byEst.cands);
assert.equal(byEst.flight.no, 'EW8220');
assert.equal(byEst.why, 'estimated');
assert.equal(byEst.at, t('2026-11-22T18:45:00Z'), 'keeps 10 min offset on estimated match');

// Tonight 22:20: LO495 planned 22:20 est 22:14 wins over FR964 London 22:05/22:13 and KL1239 22:25/22:30
const sched2220 = t('2026-11-22T21:20:00Z');
const est2214 = t('2026-11-22T21:14:00Z');
const book2220 = { id: 'lo1', zone_id: '293', estimated_at: '2026-11-22T21:20:00.000Z' };
const fr964 = fl({ no: 'FR964', from: 'London STN', sched: t('2026-11-22T21:05:00Z'), est: t('2026-11-22T21:13:00Z') });
const lo495 = fl({ no: 'LO495', from: 'Warszawa', sched: sched2220, est: est2214 });
const kl1239 = fl({ no: 'KL1239', from: 'Amsterdam', sched: t('2026-11-22T21:25:00Z'), est: t('2026-11-22T21:30:00Z') });
const tonight = api.followMatch(book2220, [fr964, lo495, kl1239]);
assert.ok(tonight && !tonight.cands);
assert.equal(tonight.flight.no, 'LO495');
assert.equal(tonight.why, 'planned');
assert.equal(tonight.at, est2214);
assert.equal(+api.round5(new Date(tonight.at)), t('2026-11-22T21:15:00Z'), '22:14 → row 22:15');
assert.doesNotMatch(api.followExplain(tonight), /bagage/);

// Without the 22:20 flight: closest planned before (FR964) with bagage; KL after booking does not win
const onlyBefore = api.followMatch(book2220, [fr964, kl1239]);
assert.ok(onlyBefore && !onlyBefore.cands);
assert.equal(onlyBefore.flight.no, 'FR964');
assert.equal(onlyBefore.why, 'bagage');
assert.equal(onlyBefore.at, t('2026-11-22T21:28:00Z'), '22:13 + 15 min → 22:28');
assert.match(api.followExplain(onlyBefore), /troligen på grund av bagage/);

// True tie at bagage step: two flights with the same planned time before the booking
const bagTie = api.followMatch(book2220, [
  fl({ no: 'AA1', from: 'Paris', sched: t('2026-11-22T21:10:00Z'), est: t('2026-11-22T21:08:00Z') }),
  fl({ no: 'BB2', from: 'Rom', sched: t('2026-11-22T21:10:00Z'), est: t('2026-11-22T21:12:00Z') })
]);
assert.ok(bagTie && bagTie.cands && !bagTie.flight, 'equal planned-before is a tie');

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

// applyFollows: planned match wins among several, other zone skipped, bagage unique, tie listed
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
api.applyFollows([list[0], list[3]], [fl({ sched: sched, est: est10 })]);
assert.ok(list[0]._follow);
assert.equal(list[0]._follow.flight.no, 'EW8220');
assert.equal(list[3]._follow, undefined);
assert.equal(list[3]._followCands, undefined);

const onlyLate = [Object.assign({}, book20)];
api.applyFollows(onlyLate, [fl({ sched: sched, est: est10 })]);
assert.ok(onlyLate[0]._follow);
assert.equal(onlyLate[0]._follow.at, t('2026-11-22T18:55:00Z'));
assert.equal(onlyLate[0]._follow.why, 'bagage');
assert.equal(onlyLate[0]._followCands, undefined);

const preferList = [{ id: 'bx', zone_id: '293', estimated_at: book.estimated_at }];
api.applyFollows(preferList, flights);
assert.ok(preferList[0]._follow);
assert.equal(preferList[0]._follow.flight.no, 'EW8220');
assert.equal(preferList[0]._followCands, undefined);

const tied = [{ id: 'bt', zone_id: '293', estimated_at: book.estimated_at }];
api.applyFollows(tied, [
  fl({ no: 'EW8220', sched: sched, est: est10 }),
  fl({ no: 'AY867', sched: sched, est: t('2026-11-22T18:40:00Z') })
]);
assert.equal(tied[0]._follow, undefined);
assert.ok(tied[0]._followCands && tied[0]._followCands.length === 2);
api.applyFollows(tied, []);
assert.equal(tied[0]._follow, undefined);
assert.equal(tied[0]._followCands, undefined);

console.log('FOLJ_FLYG_UNIT_OK');
