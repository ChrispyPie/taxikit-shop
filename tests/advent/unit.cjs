/* Adventskalender: 24 källbelagda fakta, luckor bara t.o.m. idag, pin, grind. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const fakta = fs.readFileSync(path.join(root, 'TaxiData/advent-fakta.js'), 'utf8');
const advent = fs.readFileSync(path.join(root, 'TaxiData/advent.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning-core.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261123b_advent_polkagris.sql'), 'utf8');
const lazy = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');

assert.doesNotMatch(fakta + advent, /\bStig\b|\bhen\b/);
const days = [...fakta.matchAll(/dag:\s*(\d+)/g)].map((m) => +m[1]);
assert.deepStrictEqual(days, Array.from({ length: 24 }, (_, i) => i + 1));
assert.strictEqual((fakta.match(/kalla:/g) || []).length, 24);
assert.strictEqual((fakta.match(/url:/g) || []).length, 24);
assert.match(fakta, /Daimler/);
assert.match(fakta, /Landvetter/);
assert.match(fakta, /Sleipner/);
assert.match(fakta, /Halda/);

assert.match(advent, /710022/);
assert.match(advent, /adventdatum|juldatum/);
assert.match(advent, /24 luckor/);
assert.match(advent, /function canOpen/);
assert.match(advent, /d <= st\.day/);
assert.match(advent, /st\.month !== 12/);

assert.match(core, /id === 'advent'/);
assert.match(core, /ADVENT_GATE/);
assert.match(index, /ADVENT\.id/);
assert.match(index, /item\.id === 'advent'/);
assert.match(fs.readFileSync(path.join(root, 'TaxiData/polkagris.js'), 'utf8'), /LIVE_FROM = '2026-12-01'/);
assert.match(sql, /not_open_yet/);
assert.match(sql, /advent_is_test/);
assert.match(sql, /return 0;/); // test season/year
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
assert.match(cl, /id: '2026-12-01zadv1'/);
assert.match(cl, /datum: '2026-12-01'/);
assert.match(cl, /tid: '00:00'/);
assert.doesNotMatch(cl, /\bStig\b|\bhen\b/);
const om = fs.readFileSync(path.join(root, 'TaxiData/om.js'), 'utf8');
assert.match(om, /function nyhLive/);
assert.match(om, /if \(!nyhLive\(dag\)\) return;/);

assert.match(lazy, /"advent":/);
assert.match(lazy, /"ADVENT":/);

assert.match(sql, /create table if not exists public\.advent_opens/);
assert.match(sql, /too_early/);
assert.match(sql, /p_driver = '710022'/);
assert.match(sql, /Europe\/Stockholm/);

console.log('advent unit ok');
