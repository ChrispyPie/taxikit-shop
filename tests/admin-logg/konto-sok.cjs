'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'TaxiData/admin.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261124c_logg_sok_konto.sql'), 'utf8');
const undo = fs.readFileSync(path.join(root, 'supabase/migrations/undo/20261124c_logg_sok_konto_undo.sql'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'TaxiData/sw.js'), 'utf8');

assert.match(html, /Sök konto, IP eller enhet/);
assert.match(html, /Sök konto eller enhet/);
assert.doesNotMatch(html, /Sök IP-adress eller enhets-id/);
assert.match(html, /function logFilterLink/);
assert.match(html, /function addLogExkludera/);
assert.match(html, /function removeLogExkludera/);
assert.match(html, /onLogFilterPointerDown/);
assert.match(html, /onLogFilterContext/);
assert.match(html, /p_exkludera: logExkludera/);
assert.match(html, /taxi_admin_log_exkludera/);
assert.match(html, /Långtryck för att dölja/);
assert.match(html, /Filter: \$\{esc\(logSokLabel\(logSok\)\)\}/);
assert.match(html, /logExLabel\(v\)/);
assert.match(html, /setTimeout\(function \(\) \{[\s\S]{0,80}addLogExkludera\(v\);[\s\S]{0,20}\}, 500\)/);
assert.match(sw, /CACHE_VER = '20261124log1'/);
assert.match(sql, /p_exkludera text\[\]/);
assert.match(sql, /d\.first_name/);
assert.match(sql, /x\.actor_id ilike v_like/);
assert.match(sql, /x\.target_id ilike v_like/);
assert.match(undo, /drop function if exists public\.admin_log_page_v2\(text, integer, timestamp with time zone, bigint, text\[\], text, text, text\[\]\)/);
assert.match(cl, /2026-11-24zlog1/);
const clSlice = cl.slice(cl.indexOf('2026-11-24zlog1'), cl.indexOf('2026-11-24zlog1') + 700);
assert.match(clSlice, /'admin'\]/);
assert.doesNotMatch(clSlice, /\bhen\b|\bStig\b/);

function sliceFn(name, next) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  const end = next ? html.indexOf('function ' + next + '(', start + 1) : html.length;
  assert.ok(end > start, 'end for ' + name);
  return html.slice(start, end);
}

const src = [
  sliceFn('logExLabel', 'onLogFilterPointerDown').replace(/let logHoldTimer[\s\S]*$/, ''),
  sliceFn('logFilterLink', 'showLogToast'),
  sliceFn('logSokLabel', 'logAccountIds'),
  sliceFn('logAccountIds', 'linkifyLogAccounts'),
  sliceFn('linkifyLogAccounts', 'logRowMatchesSok'),
  sliceFn('logRowMatchesSok', 'logRowIsExcluded'),
  sliceFn('logRowIsExcluded', 'filterLog')
].join('\n');

const factory = new Function('esc', 'drivers', 'plainName', 'logSeesIp', 'logExkludera', src +
  '; return { logSokLabel, logExLabel, logAccountIds, linkifyLogAccounts, logRowMatchesSok, logRowIsExcluded, logFilterLink };');

const drivers = { '710022': { first_name: 'Christian', last_name: 'P', last_initial: 'P' } };
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function plainName(id) {
  const d = drivers[id];
  if (!d) return id;
  const first = d.first_name || '';
  const last = d.last_name || d.last_initial || '';
  if (!first && !last) return id;
  return last ? first + ' ' + last[0] : first;
}

const fns = factory(esc, drivers, plainName, true, ['710022']);
assert.strictEqual(fns.logSokLabel('710022'), 'Konto Christian P · 710022');
assert.strictEqual(fns.logSokLabel('77.218.228.75'), 'IP 77.218.228.75');
assert.strictEqual(fns.logSokLabel('dc3ddf00aabb'), 'Enhet dc3ddf00');
assert.strictEqual(fns.logExLabel('710022'), 'Dölj 710022');
assert.strictEqual(fns.logExLabel('dc3ddf00aabbcc'), 'Dölj dc3ddf00');

const e = { actor_id: '710022', target_id: null, ip: '77.218.228.75', device: 'dc3ddf00-aaaa-bbbb' };
const linked = fns.linkifyLogAccounts(esc('S admin Christian P · 710022 slutade bevaka flyg KL1239'), e);
assert.match(linked, /onLogFilterClick\(&quot;710022&quot;\)/);
assert.match(linked, />710022<\/a>/);
assert.doesNotMatch(linked, /KL1239<\/a>/);

assert.strictEqual(fns.logRowMatchesSok(e, '710022'), true);
assert.strictEqual(fns.logRowMatchesSok(e, 'Christian'), true);
assert.strictEqual(fns.logRowMatchesSok(e, '77.218'), true);
assert.strictEqual(fns.logRowMatchesSok(e, 'dc3ddf'), true);
assert.strictEqual(fns.logRowMatchesSok(e, '999999'), false);

assert.strictEqual(fns.logRowIsExcluded(e), true);
const fns2 = factory(esc, drivers, plainName, true, ['77.218.228.75']);
assert.strictEqual(fns2.logRowIsExcluded(e), true);
const fns3 = factory(esc, drivers, plainName, true, ['dc3ddf00']);
assert.strictEqual(fns3.logRowIsExcluded(e), true);
const fns4 = factory(esc, drivers, plainName, true, ['888888']);
assert.strictEqual(fns4.logRowIsExcluded(e), false);

const link = fns.logFilterLink('710022', '710022');
assert.match(link, /onpointerdown="onLogFilterPointerDown\(event, &quot;710022&quot;\)"/);
assert.match(link, /oncontextmenu="return onLogFilterContext\(event, &quot;710022&quot;\)"/);

console.log('admin-logg/konto-sok.cjs ok');
