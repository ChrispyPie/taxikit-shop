'use strict';
// Enhetstest: Landvetter-bokning följer flygets nya tid när den planerade landningen stämmer (20261122zfly1).
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
assert.match(cl.split("id: '2026-11-22zfly1'")[1].split(']},')[0], /ursprungliga tiden/);
assert.match(lv, /prognos\.js\?v=20261122zfly1/);
assert.match(html, /style\.css\?v=20261122zfly1/);
assert.match(css, /\.pg-n\.pg-fly-follow/);
assert.match(css, /\.pg-fly-from/);
assert.match(css, /\.pg-pop-follow-box/);
assert.match(js, /function followMatch\(/);
assert.match(js, /FOLLOW_MAX_MS = 5 \* 60000/);
assert.match(js, /pg-fly-follow/);
assert.match(js, /Bokningen följer flygets nya tid/);
assert.doesNotMatch(js, /tiderna i schemat flyttas aldrig/);

const floorSrc = js.match(/function floor5\(d\) \{[\s\S]*?\n  \}/)[0];
const shownSrc = js.match(/function followShown\(f\) \{[\s\S]*?\n  \}/)[0];
const matchSrc = js.match(/function followMatch\(b, flights\) \{[\s\S]*?\n  \}/)[0];
const applySrc = js.match(/function applyFollows\(list, flights\) \{[\s\S]*?\n  \}/)[0];
const whenSrc = js.match(/function bookingWhen\(b\) \{[\s\S]*?\n  \}/)[0];
assert.ok(floorSrc && shownSrc && matchSrc && applySrc && whenSrc, 'helpers present');

const api = new Function(
  'var FLIGHT_ZONE = "293";\n' +
  'var FOLLOW_MAX_MS = 5 * 60000;\n' +
  floorSrc + '\n' + shownSrc + '\n' + matchSrc + '\n' + applySrc + '\n' + whenSrc + '\n' +
  'return { followMatch: followMatch, applyFollows: applyFollows, bookingWhen: bookingWhen, floor5: floor5 };'
)();

function t(iso) { return Date.parse(iso); }
function fl(o) {
  return Object.assign({ no: 'EW8220', from: 'Berlin', canceled: false, removed: false }, o);
}

const sched = t('2026-11-22T18:25:00Z'); // 19:25 Stockholm
const est10 = t('2026-11-22T18:35:00Z'); // 19:35
const book = { id: 'b1', zone_id: '293', estimated_at: '2026-11-22T18:25:00.000Z' };

// Christian's case: booking 19:25, flight sched 19:25, est 19:35 → move
const hit = api.followMatch(book, [fl({ sched: sched, est: est10 })]);
assert.ok(hit, 'matches delayed flight at same scheduled time');
assert.equal(hit.at, est10);
assert.equal(hit.from, sched);
assert.equal(hit.flight.no, 'EW8220');
assert.equal(hit.later, true);
assert.equal(api.bookingWhen(Object.assign({}, book, { _follow: hit })), est10);

// Early arrival
const early = t('2026-11-22T18:15:00Z');
const earlyHit = api.followMatch(book, [fl({ sched: sched, est: early })]);
assert.ok(earlyHit, 'follows early arrival');
assert.equal(earlyHit.at, early);
assert.equal(earlyHit.later, false);

// On time (est = sched) → no move
assert.equal(api.followMatch(book, [fl({ sched: sched, est: sched })]), null);

// Same 5-min slot (3 min delay) → no visual move
assert.equal(api.followMatch(book, [fl({ sched: sched, est: t('2026-11-22T18:28:00Z') })]), null);

// Within 5 min of scheduled, pick closest
const other = t('2026-11-22T18:30:00Z');
const close = api.followMatch(book, [
  fl({ no: 'BA1', sched: other, est: t('2026-11-22T18:40:00Z') }),
  fl({ no: 'EW8220', sched: sched, est: est10 })
]);
assert.ok(close);
assert.equal(close.flight.no, 'EW8220', 'closest scheduled time wins');

// Two flights with the same scheduled time → skip (not unambiguous)
assert.equal(api.followMatch(book, [
  fl({ no: 'EW8220', sched: sched, est: est10 }),
  fl({ no: 'AY867', sched: sched, est: t('2026-11-22T18:40:00Z') })
]), null, 'tie is skipped');

// Other zone: no
assert.equal(api.followMatch({ zone_id: '147', estimated_at: book.estimated_at }, [fl({ sched: sched, est: est10 })]), null);

// Canceled / removed
assert.equal(api.followMatch(book, [fl({ sched: sched, est: est10, canceled: true })]), null);
assert.equal(api.followMatch(book, [fl({ sched: sched, est: est10, removed: true })]), null);

// No estimated/actual time
assert.equal(api.followMatch(book, [fl({ sched: sched })]), null);

// Landing already happened (act) still moves to that time
const act = t('2026-11-22T18:36:00Z');
const landed = api.followMatch(book, [fl({ sched: sched, est: est10, act: act })]);
assert.ok(landed);
assert.equal(landed.at, act, 'actual landing wins over estimate');

// applyFollows writes _follow and can clear it
const list = [Object.assign({}, book), { id: 'b2', zone_id: '147', estimated_at: book.estimated_at }];
api.applyFollows(list, [fl({ sched: sched, est: est10 })]);
assert.ok(list[0]._follow);
assert.equal(list[0]._follow.flight.no, 'EW8220');
assert.equal(list[1]._follow, undefined);
api.applyFollows(list, []);
assert.equal(list[0]._follow, undefined);

console.log('FOLJ_FLYG_UNIT_OK');
