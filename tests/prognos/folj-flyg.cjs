'use strict';
// Landvetter-bokning följer planet vid första visade tid; vid lika planerad tid läggs den mitt emellan de beräknade ankomsterna.
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
assert.match(cl, /id: '2026-11-23zfly7'/);
assert.match(cl.split("id: '2026-11-23zfly7'")[1].split(']},')[0], /mitt emellan/);
assert.match(cl.split("id: '2026-11-23zfly7'")[1].split(']},')[0].split('rader:')[0], /tid: '/);
assert.doesNotMatch(cl.split("id: '2026-11-23zfly7'")[1].split(']},')[0], /\b(Stig|hen)\b/);
assert.match(js, /function followMidpoint\(/);
assert.match(js, /följer flera plan/);
assert.match(js, /why: 'flera'/);
assert.match(js, /function followExplainHtml\(/);
assert.match(js, /function followNoBtn\(/);
assert.match(js, /class="pg-fly-no"/);
assert.match(css, /\.pg-pop \.pg-fly-no/);
assert.match(cl.split("id: '2026-11-23zfly7'")[1].split(']},')[0], /flygnummer/);
assert.match(cl, /id: '2026-11-23zfly8'/);
assert.match(cl.split("id: '2026-11-23zfly8'")[1].split(']},')[0], /Låg från början/);
assert.match(cl.split("id: '2026-11-23zfly8'")[1].split(']},')[0].split('rader:')[0], /tid: '/);
assert.doesNotMatch(cl.split("id: '2026-11-23zfly8'")[1].split(']},')[0], /\b(Stig|hen)\b/);
assert.match(js, /function bookingOrigHm\(/);
assert.match(js, /Låg från början /);


assert.match(cl, /id: '2026-11-22zfly6'/);
assert.match(cl.split("id: '2026-11-22zfly6'")[1].split(']},')[0], /först visades/);
assert.match(cl.split("id: '2026-11-22zfly6'")[1].split(']},')[0].split('rader:')[0], /tid: '/);
assert.doesNotMatch(cl.split("id: '2026-11-22zfly6'")[1].split(']},')[0], /\b(Stig|hen)\b/);
assert.match(js, /function followFirstTime\(/);
assert.match(js, /b\.first_estimated_at/);
assert.doesNotMatch(js, /taxi_pg_follow_lock|taxi_pg_follow_first/);
assert.doesNotMatch(js, /FOLLOW_LOCK_KEY/);
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
assert.match(lv, /prognos\.js\?v=20261123adv4/);
assert.match(html, /style\.css\?v=20261123adv4/);

const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261122c_prognos_list_first_estimated.sql'), 'utf8');
const undo = fs.readFileSync(path.join(root, 'supabase/migrations/undo/20261122c_prognos_list_first_estimated_undo.sql'), 'utf8');
assert.match(mig, /first_estimated_at/);
assert.match(mig, /prognos_booking_history/);
assert.match(undo, /20261103a/);
assert.doesNotMatch(undo.split('create or replace')[1], /first_estimated_at/);

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
  'return { followMatch: followMatch, followCandidates: followCandidates, followExplain: followExplain, followCandLine: followCandLine, applyFollows: applyFollows, followFirstTime: followFirstTime, followPlace: followPlace, followMidpoint: followMidpoint, bookingWhen: bookingWhen, bookingOrigHm: bookingOrigHm, floor5: floor5, round5: round5, nearTime: nearTime, followPick: followPick };'
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

// Christian: booking 20 min after planned 19:25, flight now 19:35 → same row as flight (19:35), no extra offset
const book20 = { id: 'b20', zone_id: '293', estimated_at: '2026-11-22T18:45:00.000Z' };
const late = api.followMatch(book20, [fl({ sched: sched, est: est10 })]);
assert.ok(late && !late.cands, 'matches booking 20 min after scheduled landing');
assert.equal(late.offset, 20 * 60000);
assert.equal(late.at, est10, 'visas på planets beräknade tid, utan extra förskjutning');
assert.equal(late.why, 'bagage');
const txt20 = api.followExplain(late);
assert.match(txt20, /Bokningen ligger 20 min efter planerad landning, troligen på grund av bagage, för EW8220 \(planerad 19:25, beräknad 19:35\) och visas kl 19:35\./);
assert.match(api.followExplain(late, 3), /Bokningarna ligger 20 min efter planerad landning, troligen på grund av bagage, för EW8220 \(planerad 19:25, beräknad 19:35\) och visas kl 19:35\./);

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
assert.equal(dk10.at, est2141, 'ingen extra förskjutning: samma rad som DK1727');
assert.equal(dk10.why, 'bagage');
assert.match(api.followExplain(dk10), /troligen på grund av bagage/);
assert.match(api.followExplain(dk10), /visas kl 21:41/);

// On time (est = sched): still follows, same row as the flight
const onTime = api.followMatch(book, [fl({ sched: sched, est: sched })]);
assert.ok(onTime && !onTime.cands);
assert.equal(onTime.at, sched);
assert.equal(onTime.why, 'planned');
assert.equal(+api.round5(new Date(onTime.at)), +api.round5(new Date(sched)));

// 2 min delay still same rounded slot (19:27 → 19:25): follows, same row
const tiny = api.followMatch(book, [fl({ sched: sched, est: t('2026-11-22T18:27:00Z') })]);
assert.ok(tiny && !tiny.cands);
assert.equal(tiny.at, t('2026-11-22T18:27:00Z'));
assert.equal(+api.round5(new Date(tiny.at)), t('2026-11-22T18:25:00Z'));

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

// Two flights with the same planned time, different est → midpoint, rounded to 5 min
const tie = api.followMatch(book, [
  fl({ no: 'EW8220', sched: sched, est: est10 }),
  fl({ no: 'AY867', from: 'Helsingfors', sched: sched, est: t('2026-11-22T18:40:00Z') })
]);
assert.ok(tie && !tie.cands && tie.why === 'flera' && tie.ties && tie.ties.length === 2);
// est 19:35 and 19:40 → mid 19:37:30 → round5 (sekunder nollställs) 19:35? 19:37 → 19:35 or 19:40
// 19:35 + 19:40 = mid 19:37:30; setSeconds 0 → 19:37; Math.round(37/5)*5 = 35 → 19:35
assert.equal(+tie.at, +api.round5(new Date((est10 + t('2026-11-22T18:40:00Z')) / 2)));
assert.match(api.followExplain(tie), /^Bokningen följer flera plan:/);
assert.match(api.followExplain(tie), /EW8220 från Berlin, planerad 19:25, beräknad 19:35/);
assert.match(api.followExplain(tie), /AY867 från Helsingfors, planerad 19:25, beräknad 19:40/);
assert.match(api.followExplain(tie, 2), /^Bokningarna följer flera plan:/);
assert.doesNotMatch(api.followExplain(tie, 2), /Bokningen följer/);

// Ingen planerad träff: närmast före inom 20 min (bagage), visas på planets beräknade tid
const book1935 = { id: 'be', zone_id: '293', estimated_at: '2026-11-22T18:35:00.000Z' };
const byBefore = api.followMatch(book1935, [
  fl({ no: 'EW8220', sched: sched, est: t('2026-11-22T18:35:00Z') }),
  fl({ no: 'BA1', from: 'London LHR', sched: t('2026-11-22T18:20:00Z'), est: t('2026-11-22T18:22:00Z') })
]);
assert.ok(byBefore && !byBefore.cands);
assert.equal(byBefore.flight.no, 'EW8220');
assert.equal(byBefore.why, 'bagage');
assert.equal(byBefore.at, t('2026-11-22T18:35:00Z'), 'samma rad som flyget, utan extra förskjutning');

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
assert.equal(onlyBefore.at, t('2026-11-22T21:13:00Z'), 'samma rad som FR964 (22:13), utan +15');
assert.match(api.followExplain(onlyBefore), /troligen på grund av bagage/);

// Bagage-steg med samma planerade tid, olika beräknad: också mittpunkt
const bagTie = api.followMatch(book2220, [
  fl({ no: 'AA1', from: 'Paris', sched: t('2026-11-22T21:10:00Z'), est: t('2026-11-22T21:08:00Z') }),
  fl({ no: 'BB2', from: 'Rom', sched: t('2026-11-22T21:10:00Z'), est: t('2026-11-22T21:12:00Z') })
]);
assert.ok(bagTie && bagTie.why === 'flera' && bagTie.ties && bagTie.ties.length === 2 && !bagTie.cands);
assert.equal(+bagTie.at, +api.round5(new Date((t('2026-11-22T21:08:00Z') + t('2026-11-22T21:12:00Z')) / 2)));
assert.equal(+bagTie.at, t('2026-11-22T21:10:00Z')); // 22:08 och 22:12 → 22:10

// Other zone: no
assert.equal(api.followMatch({ zone_id: '147', estimated_at: book.estimated_at }, [fl({ sched: sched, est: est10 })]), null);

// Canceled / removed
assert.equal(api.followMatch(book, [fl({ sched: sched, est: est10, canceled: true })]), null);
assert.equal(api.followMatch(book, [fl({ sched: sched, est: est10, removed: true })]), null);

// No estimated/actual time
assert.equal(api.followMatch(book, [fl({ sched: sched })]), null);

// Landat: ikonen ligger på beräknad tid, bokningen samma rad (est före act)
const act = t('2026-11-22T18:36:00Z');
const landed = api.followMatch(book, [fl({ sched: sched, est: est10, act: act })]);
assert.ok(landed && !landed.cands);
assert.equal(landed.at, est10, 'samma rad som flygikonen (beräknad tid)');
assert.match(api.followExplain(landed), /landat 19:36/);
assert.match(api.followExplain(landed), /visas kl 19:35/);

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
assert.equal(onlyLate[0]._follow.at, est10);
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
assert.ok(tied[0]._follow);
assert.equal(tied[0]._follow.why, 'flera');
assert.equal(tied[0]._followCands, undefined);
assert.equal(+api.bookingWhen(tied[0]), +tied[0]._follow.at);
api.applyFollows(tied, []);
assert.equal(tied[0]._follow, undefined);
assert.equal(tied[0]._followCands, undefined);


// LO495: bokningar som först visades 22:20 läggs på beräknad 22:14 (rad 22:15), samma rad som flyget.
const loGroup = [1, 2, 3, 4].map((n) => ({
  id: 'lo-g' + n, zone_id: '293', estimated_at: '2026-11-22T21:20:00.000Z',
  first_estimated_at: '2026-11-22T21:20:00.000Z'
}));
api.applyFollows(loGroup, [fr964, lo495, kl1239]);
loGroup.forEach((b) => {
  assert.equal(b._follow.flight.no, 'LO495');
  assert.equal(b._follow.at, est2214);
  assert.equal(+api.round5(new Date(b._follow.at)), t('2026-11-22T21:15:00Z'));
  assert.equal(b._follow.why, 'planned');
});

// 4013: första visade tid 21:55 från servern, nuvarande tid 22:10 (40-min-resnap) → kvar på DK1727, rad 21:40.
const dk1727b = fl({ no: 'DK1727', from: 'Teneriffa', sched: t('2026-11-22T20:55:00Z'), est: t('2026-11-22T20:41:00Z'), act: t('2026-11-22T20:38:00Z') });
const fr964b = fl({ no: 'FR964', from: 'London STN', sched: t('2026-11-22T21:05:00Z'), est: t('2026-11-22T21:13:00Z') });
const lo495b = fl({ no: 'LO495', from: 'Warszawa', sched: t('2026-11-22T21:20:00Z'), est: t('2026-11-22T21:14:00Z') });
const b4013 = {
  id: 4013, zone_id: '293', category: 'ovrigt', confidence: 'saker',
  estimated_at: '2026-11-22T21:10:00.000Z',
  first_estimated_at: '2026-11-22T20:55:00.000Z'
};
assert.equal(api.followFirstTime(b4013), t('2026-11-22T20:55:00Z'));
api.applyFollows([b4013], [dk1727b, fr964b, lo495b]);
assert.equal(b4013._follow.flight.no, 'DK1727', '4013 stannar på DK1727 efter 22:10-resnap');
assert.equal(+b4013._follow.from, t('2026-11-22T20:55:00Z'));
assert.equal(+b4013._follow.at, t('2026-11-22T20:41:00Z'), 'samma rad som DK1727:s beräknade tid');
assert.equal(+api.round5(new Date(b4013._follow.at)), t('2026-11-22T20:40:00Z'));
assert.equal(+api.bookingWhen(b4013), t('2026-11-22T20:41:00Z'));

// Utan historik: bara nuvarande 22:10 → FR964 (närmast före), visas kl 22:13
const loose4013 = { id: 4013, zone_id: '293', confidence: 'saker', estimated_at: '2026-11-22T21:10:00.000Z' };
assert.equal(api.followFirstTime(loose4013), t('2026-11-22T21:10:00.000Z'));
api.applyFollows([loose4013], [dk1727b, fr964b, lo495b]);
assert.equal(loose4013._follow.flight.no, 'FR964', 'utan first_estimated_at följs 22:10 till FR964');
assert.equal(+loose4013._follow.at, t('2026-11-22T21:13:00Z'));


// Ikväll 22 nov: SK167+LH2432 planerad 23:20 (est 00:02 och 23:36) → mitt 23:49 → rad 23:50.
const sk167 = fl({ no: 'SK167', from: 'Stockholm ARN', sched: t('2026-11-22T22:20:00Z'), est: t('2026-11-22T23:02:00Z') });
const lh2432 = fl({ no: 'LH2432', from: 'München', sched: t('2026-11-22T22:20:00Z'), est: t('2026-11-22T22:36:00Z') });
const b2320 = { id: 's2320', zone_id: '293', first_estimated_at: '2026-11-22T22:20:00.000Z', estimated_at: '2026-11-22T22:30:00.000Z' };
api.applyFollows([b2320], [sk167, lh2432]);
assert.equal(b2320._follow.why, 'flera');
assert.equal(b2320._follow.ties.length, 2);
assert.equal(+b2320._follow.at, t('2026-11-22T22:50:00Z'), 'mitt 23:49 → 23:50');
assert.equal(+api.round5(new Date(b2320._follow.at)), t('2026-11-22T22:50:00Z'));
const txt2320 = api.followExplain(b2320._follow, 3);
assert.match(txt2320, /^Bokningarna följer flera plan:/);
assert.match(txt2320, /LH2432 från München, planerad 23:20, beräknad 23:36/);
assert.match(txt2320, /SK167 från Stockholm ARN, planerad 23:20, beräknad 00:02/);
assert.match(txt2320, /visas kl 23:50/);
assert.doesNotMatch(txt2320, /Flera plan är möjliga, så tiden är inte flyttad/);

// SK448+LH820 planerad 23:55 (est 00:08 och 00:03) → mitt 00:05:30 → rad 00:05.
const sk448 = fl({ no: 'SK448', from: 'Köpenhamn', sched: t('2026-11-22T22:55:00Z'), est: t('2026-11-22T23:08:00Z') });
const lh820 = fl({ no: 'LH820', from: 'Frankfurt', sched: t('2026-11-22T22:55:00Z'), est: t('2026-11-22T23:03:00Z') });
const b2355a = { id: 'c1', zone_id: '293', first_estimated_at: '2026-11-22T22:55:00.000Z', estimated_at: '2026-11-22T22:55:00.000Z' };
const b2355b = { id: 'c2', zone_id: '293', first_estimated_at: '2026-11-22T22:55:00.000Z', estimated_at: '2026-11-23T00:05:00+01:00' };
api.applyFollows([b2355a, b2355b], [sk448, lh820]);
assert.equal(b2355a._follow.why, 'flera');
assert.equal(+b2355a._follow.at, t('2026-11-22T23:05:00Z'), 'mitt 00:05:30 → 00:05');
assert.equal(+b2355b._follow.at, +b2355a._follow.at);
const txt2355 = api.followExplain(b2355a._follow, 2);
assert.match(txt2355, /^Bokningarna följer flera plan:/);
assert.match(txt2355, /LH820 från Frankfurt, planerad 23:55, beräknad 00:03/);
assert.match(txt2355, /SK448 från Köpenhamn, planerad 23:55, beräknad 00:08/);
assert.match(txt2355, /visas kl 00:05/);


assert.equal(api.bookingOrigHm({ zone_id: '293', estimated_at: '2026-11-22T20:55:00.000Z', first_estimated_at: '2026-11-22T20:55:00.000Z' }), '');
assert.equal(api.bookingOrigHm({ zone_id: '293', estimated_at: '2026-11-22T21:20:00.000Z', first_estimated_at: '2026-11-22T20:55:00.000Z' }), '21:55');
assert.equal(api.bookingOrigHm({ zone_id: '293', estimated_at: '2026-11-22T20:55:00.000Z', first_estimated_at: '2026-11-22T20:53:00.000Z' }), '', 'samma 5-minutersrad räknas inte som flyttad');
assert.equal(api.bookingOrigHm(b4013), '21:55');
assert.equal(api.bookingOrigHm(b2320), '23:20');
assert.equal(api.bookingOrigHm(b2355a), '23:55');

console.log('FOLJ_FLYG_UNIT_OK');
