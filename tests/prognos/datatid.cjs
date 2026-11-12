'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '../..');
const js = fs.readFileSync(path.join(root, 'TaxiData/prognos.js'), 'utf8');
const arrival = fs.readFileSync(path.join(root, 'TaxiData/arrival-data.js'), 'utf8');
const ank = fs.readFileSync(path.join(root, 'TaxiData/ankomster.js'), 'utf8');
const help = fs.readFileSync(path.join(root, 'TaxiData/hjalp.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');

assert.doesNotMatch(js, /\bStig\b/);
assert.doesNotMatch(ank, /\bStig\b/);
assert.doesNotMatch(help, /'[^']*\bStig\b/);
assert.doesNotMatch(cl, /\bStig\b/);

assert.match(html, /hjalp\.js\?v=20261111datatid1/);
assert.match(lv, /prognos\.js\?v=20261111datatid1/);
assert.match(lv, /arrival-data\.js\?v=20261111datatid1/);
assert.match(lv, /ankomster\.js\?v=20261111datatid1/);
assert.match(lv, /changelog\.js\?v=20261112anim5/);
assert.match(cl, /2026-11-11datatid1/);

assert.match(arrival, /function flightFeed\(/);
assert.match(arrival, /updated:r\.updated\|\|null/);
assert.match(js, /flightFeed/);
assert.match(js, /st\.flightUpdated/);
assert.match(js, /FLY_STALE_MIN = 30/);
assert.match(js, /statusStamp/);
assert.match(help, /Swedavia/);

const clockSrc = js.match(/function clockSv\(iso, sec\) \{[\s\S]*?\n  \}/)[0];
const ageSrc = js.match(/function minutesOld\(iso, now\) \{[\s\S]*?\n  \}/)[0];
const stampSrc = js.match(/function statusStamp\(opts\) \{[\s\S]*?\n  \}/)[0];
const api = new Function(
  clockSrc + '\n' + ageSrc + '\n' + 'var FLY_STALE_MIN = 30;\n' + stampSrc +
  '\nreturn { clockSv: clockSv, minutesOld: minutesOld, statusStamp: statusStamp, FLY_STALE_MIN: FLY_STALE_MIN };'
)();

const now = Date.parse('2026-11-11T22:30:00+01:00');
const flyOk = '2026-11-11T22:25:31+01:00';
const flyOld = '2026-11-11T21:40:00+01:00';
const lastOk = '2026-11-11T22:26:10+01:00';

assert.equal(api.clockSv(flyOk, true), '22:25:31');
assert.equal(api.clockSv(null, true), '');
assert.equal(api.minutesOld(flyOld, now), 50);

const land = api.statusStamp({ onFly: true, flyUpdated: flyOk, lastOkAt: lastOk, now: now });
assert.deepEqual(land.parts, [{ k: 'flyg', t: '22:25:31' }, { k: 'prognos', t: '22:26:10' }]);
assert.equal(land.warn, '');

const stale = api.statusStamp({ onFly: true, flyUpdated: flyOld, lastOkAt: lastOk, now: now });
assert.equal(stale.parts[0].t, '21:40:00');
assert.equal(stale.warn, 'Flygdata är 50 min gammal');

const other = api.statusStamp({ onFly: false, flyUpdated: flyOk, lastOkAt: lastOk, now: now });
assert.deepEqual(other.parts, [{ k: '', t: '22:26:10' }]);
assert.equal(other.warn, '');

const pgStale = api.statusStamp({
  onFly: false, lastOkAt: '2026-11-11T22:20:00+01:00', now: now
});
assert.equal(pgStale.warn, 'Data är 10 min gammal');

// På Landvetter: gammal flygdata går före prognosens 5-minutersvarning
const both = api.statusStamp({
  onFly: true, flyUpdated: flyOld, lastOkAt: '2026-11-11T22:20:00+01:00', now: now
});
assert.equal(both.warn, 'Flygdata är 50 min gammal');

const noFly = api.statusStamp({ onFly: true, flyUpdated: null, lastOkAt: lastOk, now: now });
assert.equal(noFly.parts[0].t, '–');
assert.equal(noFly.parts[1].t, '22:26:10');

assert.equal(api.FLY_STALE_MIN, 30);

console.log('ok prognos datatid unit');
