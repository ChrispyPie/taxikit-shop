'use strict';
// Enhetstest: utloggning med ogiltig session ska inte fastna på "Kontrollerar inloggning" (2026-11-21login1).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const index = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lazy = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');

assert.match(index, /lazy-views\.js\?v=20261121login1/);
assert.match(lazy, /changelog\.js\?v=20261121login1/);
assert.match(lazy, /window\.NOTIS=\{[^;]*logout:function\(\)\{\}/);
assert.match(index, /function safe\(fn\) \{ try \{ fn\(\); \} catch \(e\) \{\} \}/);
assert.match(index, /safe\(function \(\) \{ if \(window\.NOTIS && NOTIS\.logout\) NOTIS\.logout\(\); \}\);/);
assert.match(index, /safe\(function \(\) \{ if \(window\.INKORG && INKORG\.logout\) INKORG\.logout\(\); \}\);/);
assert.match(index, /safe\(function \(\) \{ if \(window\.DELAD && DELAD\.onClearSession\) DELAD\.onClearSession\(\); \}\);/);
assert.match(changelog, /id: '2026-11-21login1'/);
assert.ok(changelog.indexOf("'2026-11-21login1'") < changelog.indexOf("'2026-11-14lokal1'"), 'nyheten överst');
const block = changelog.split("id: '2026-11-21login1'")[1].split(']},')[0];
assert.match(block, /Kontrollerar inloggning/);
assert.match(block, /\[.Fixat./);
assert.doesNotMatch(block, /\bStig\b/);
assert.doesNotMatch(block, /\bhen\b/);
assert.match(block.split('rader:')[0], /tid: '15:45'/);

console.log('UNIT_OK');
