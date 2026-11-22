'use strict';
// Ny inloggning på delad enhet får inte bli ogiltig bara för att timkörningen är tyst (20261122a).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261122a_delad_login_stale.sql'), 'utf8');
const undo = fs.readFileSync(path.join(root, 'supabase/migrations/undo/20261122a_delad_login_stale_undo.sql'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'TaxiData/sw.js'), 'utf8');

assert.match(sql, /function private\.delad_enhet_reason/);
assert.match(sql, /coalesce\(p_since, '-infinity'::timestamptz\) <= now\(\) - private\.delad_enhet_stale_after\(\)/);
assert.match(sql, /return 'stale'/);
assert.doesNotMatch(sql, /\bStig\b/);
assert.doesNotMatch(sql, /\bhen\b/);
assert.match(undo, /function private\.delad_enhet_reason/);
// undo ska inte ha den nya p_since-spärren på stale
const undoStale = undo.split("return 'pass'")[1] || undo;
assert.doesNotMatch(undoStale, /p_since.*<= now\(\) - private\.delad_enhet_stale_after/);
assert.match(cl, /id: '2026-11-22zdelad1'/);
assert.match(cl.split("id: '2026-11-22zdelad1'")[1].split(']},')[0].split('rader:')[0], /tid: '18:19'/);
assert.match(cl.split("id: '2026-11-22zdelad1'")[1].split(']},')[0], /inloggningsskärmen/);
assert.doesNotMatch(cl.split("id: '2026-11-22zdelad1'")[1].split(']},')[0], /\b(Stig|hen)\b/);
assert.match(sw, /CACHE_VER = '20261122zfly3'/);
console.log('STALE_LOGIN_UNIT_OK');
