'use strict';
// Egna svar i ärenden ska gå att läsa i mörkt tema (2026-11-13lasbar1).
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'TaxiData/arende-status.js'), 'utf8');
const tema = fs.readFileSync(path.join(root, 'TaxiData/tema.css'), 'utf8');
// Sedan 2026-11-13chatt1 ritas alla händelser med .tk-ev (samma för egna och andras).
const ev = src.match(/\.tk-ev\{[^}]*\}/)[0];
assert.doesNotMatch(ev, /background:#/, 'ingen hårdkodad ljus bakgrund');
assert.match(ev, /background:var\(--c-edf2f7/);
assert.match(ev, /color:var\(--text/);
assert.doesNotMatch(src, /\.ar-msg\.me\{[^}]*background:#/);
assert.ok((tema.match(/--c-edf2f7:/g) || []).length >= 2, 'mörkt tema har egen färg');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
assert.match(cl, /2026-11-13lasbar1/);
console.log('ARENDE_LASBAR_OK');
