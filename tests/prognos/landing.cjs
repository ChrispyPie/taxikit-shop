'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '../..');
const js = fs.readFileSync(path.join(root, 'TaxiData/prognos.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'TaxiData/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');

assert.doesNotMatch(js, /\bStig\b/);
assert.doesNotMatch(css, /\bStig\b/);
assert.doesNotMatch(cl, /\bStig\b/);
assert.match(html, /style\.css\?v=20261111land1/);
assert.match(lv, /prognos\.js\?v=20261111land1/);
assert.match(lv, /changelog\.js\?v=20261111tyst1/);
assert.match(cl, /2026-11-11land1/);
assert.match(js, /taxi_animationer/);
assert.match(js, /ANIMATIONER/);
assert.match(js, /previewLanding/);
assert.match(js, /tickFlyLandings/);
assert.match(js, /prefers-reduced-motion/);
assert.match(css, /pg-fly-land-port/);
assert.match(css, /pg-fly-land-land/);
assert.match(css, /scaleX\(-1\)/);
assert.match(css, /pointer-events:\s*none/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);

const chunk = js.match(/function landMs\(f\) \{[\s\S]*?\n  function shouldLandAnim\(f, now, played\) \{[\s\S]*?\n  \}/);
assert.ok(chunk, 'helpers present');
const fns = new Function(chunk[0] + '; return { landMs: landMs, shouldLandAnim: shouldLandAnim, LAND_WIN_MS: LAND_WIN_MS };');
// LAND_WIN_MS is in outer scope of IIFE, not in chunk
const landMsSrc = js.match(/function landMs\(f\) \{[\s\S]*?\n  \}/)[0];
const shouldSrc = js.match(/function shouldLandAnim\(f, now, played\) \{[\s\S]*?\n  \}/)[0];
const win = js.match(/var LAND_WIN_MS = ([^;]+);/)[1];
const api = new Function('var LAND_WIN_MS = ' + win + ';\n' + landMsSrc + '\n' + shouldSrc + '\nreturn { landMs: landMs, shouldLandAnim: shouldLandAnim, LAND_WIN_MS: LAND_WIN_MS };')();

const now = Date.parse('2026-11-11T08:20:00Z');
assert.equal(api.landMs(null), 0);
assert.equal(api.landMs({ canceled: true, act: now }), 0);
assert.equal(api.landMs({ removed: true, est: now }), 0);
assert.equal(api.landMs({ sched: now }), 0, 'sched-only is not a landing');
assert.equal(api.landMs({ est: now, act: now - 1000 }), now - 1000, 'act wins over est');
assert.equal(api.landMs({ est: now }), now);

assert.equal(api.shouldLandAnim({ est: now }, now, true), false, 'already played');
assert.equal(api.shouldLandAnim({ est: now }, now, false), true, 'just landed');
assert.equal(api.shouldLandAnim({ act: now - 30 * 1000 }, now, false), true, 'landed 30s ago');
assert.equal(api.shouldLandAnim({ act: now - 2 * 60 * 1000 }, now, false), false, 'too old');
assert.equal(api.shouldLandAnim({ est: now + 20 * 1000 }, now, false), false, 'still incoming');
assert.equal(api.shouldLandAnim({ sched: now }, now, false), false, 'no act/est');
assert.equal(api.LAND_WIN_MS, 90 * 1000);

console.log('ok landing unit');
