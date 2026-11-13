'use strict';
// Egna svar i ärenden ska gå att läsa i mörkt tema (2026-11-13lasbar1).
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'TaxiData/arende-status.js'), 'utf8');
const tema = fs.readFileSync(path.join(root, 'TaxiData/tema.css'), 'utf8');
const me = src.match(/\.ar-msg\.me\{[^}]*\}/)[0];
assert.doesNotMatch(me, /background:#/, 'ingen hårdkodad ljus bakgrund');
assert.match(me, /background:var\(--c-bee3f8/);
assert.match(me, /color:var\(--text/);
assert.ok((tema.match(/--c-bee3f8:/g) || []).length >= 2, 'mörkt tema har egen färg');
assert.match(fs.readFileSync(path.join(root, 'TaxiData/admin.html'), 'utf8'), /arende-status\.js\?v=20261113lasbar1/);
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
assert.match(lv, /arende-status\.js\?v=20261113lasbar1/);
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
assert.match(cl, /2026-11-13lasbar1/);
assert.doesNotMatch(cl.split("2026-11-13lasbar1")[1].split(']},')[0], /\bStig\b|\bhen\b/);
console.log('ARENDE_LASBAR_OK');
