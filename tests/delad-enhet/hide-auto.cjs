'use strict';
// När "Dölj privata moduler" är på ska automatisk utloggning vara av (grå ruta, ingen serverflagga).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const js = fs.readFileSync(path.join(root, 'TaxiData/delad-enhet.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'TaxiData/sw.js'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');

assert.doesNotMatch(js, /\bStig\b/);
assert.doesNotMatch(html, /\bStig\b/);
assert.doesNotMatch(cl.split("id: '2026-11-22zhide1'")[1].split(']},')[0], /\b(Stig|hen)\b/);
assert.match(cl, /id: '2026-11-22zhide1'/);
assert.match(cl.split("id: '2026-11-22zhide1'")[1].split(']},')[0].split('rader:')[0], /tid: '18:30'/);
assert.match(cl.split("id: '2026-11-22zhide1'")[1].split(']},')[0], /automatisk utloggning/);
assert.match(html, /delad-enhet\.js\?v=20261122zprof1/);
assert.match(lv, /changelog\.js\?v=20261122zmod1/);
assert.match(sw, /CACHE_VER = '20261122zmod1'/);
assert.match(html, /\.delad-chk-disabled/);
assert.match(html, /cursor:\s*not-allowed/);

assert.match(js, /function isAutoLogout\(\) \{ return isOn\(\) && get\(AUTO_KEY\) !== '0' && !isHidePrivate\(\); \}/);
assert.match(js, /function applyAutoLogoutState\(/);
assert.match(js, /function setHidePrivate\(on\) \{[\s\S]*?applyAutoLogoutState\(\);/);
assert.doesNotMatch(js.split('function setHidePrivate')[1].split('function isDemo')[0], /put\(AUTO_KEY/);
assert.match(js, /if \(!isAutoLogout\(\) \|\| isDemo\(\)\) \{ stop\(\); del\(AT\); if \(!isDemo\(\)\) syncFlag\(false\); return; \}/);
assert.match(js, /autoLocked \? ' disabled'/);
assert.match(js, /delad-chk-disabled/);
assert.match(js, /Av så länge privata moduler är dolda/);
assert.match(js, /Går tillbaka till ditt val/);

console.log('HIDE_AUTO_UNIT_OK');
