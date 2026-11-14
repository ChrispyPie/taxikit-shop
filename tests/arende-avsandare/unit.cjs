'use strict';
// Ärenden: "Du" bara på det tittaren själv skrev (2026-11-13avs1, t1588u).
// Fall: Felanmälan Bil A191, OP + "Test" av Christian (710022), svar av Berra (693340), båda med ägarroll.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'TaxiData/arende-status.js'), 'utf8');
const ctx = { window: {}, document: { createElement: () => ({ style: {} }), head: { appendChild() {} }, documentElement: { appendChild() {} }, querySelector: () => null, getElementById: () => null }, console, Date, Intl, localStorage: { getItem: () => null, setItem() {} } };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const A = ctx.ARENDE || ctx.window.ARENDE;
assert(A && A.view, 'ARENDE.view finns');
const issue = viewerIsChristian => ({ kind: 'issue', data: {
  car: 'A191', body: 'Service lampan … Har rickard bokat än?', mine: viewerIsChristian, created_at: '2026-11-12T10:00:00Z', reporter_name: 'Christian Test', status: 'ny', history: [],
  msgs: [
    { id: 5, role: 'owner', body: 'Vi har vart på verkstad. Jag återkommer när vi vet mera.', at: '2026-11-12T18:46:12Z', mine: !viewerIsChristian, who: 'Berra Bertilsson' },
    { id: 6, role: 'owner', body: 'Test', at: '2026-11-12T21:38:48Z', mine: viewerIsChristian, who: 'Christian Test' }
  ] } });
const heads = h => [...h.matchAll(/class="tk-ev-who">([^<]*)</g)].map(m => m[1]);
// Christian tittar (admin = owner-vy)
let h = A.view(issue(true), 'owner');
let w = heads(h);
assert.ok(w.length >= 3, 'tre händelser: ' + JSON.stringify(w) + '\n' + h.slice(0, 400));
assert.equal(w.length, 3); assert.equal(w[0], 'Du'); assert.match(w[1], /^Berra/); assert.equal(w[2], 'Du');
// Berra tittar
h = A.view(issue(false), 'owner');
w = heads(h);
assert.equal(w[w.length - 2], 'Du', 'Berra ser sitt eget svar som Du');
assert.match(w[w.length - 1], /^Christian/, 'Berra ser Christians Test som Christian');
// Äldre data utan mine: rollen avgör som förut
const old = issue(true); old.data.msgs.forEach(m => { delete m.mine; });
w = heads(A.view(old, 'driver'));
assert.ok(!w.slice(-2).includes('Du'), 'förare: ägarsvar utan mine är inte Du');
console.log('ARENDE_AVSANDARE_OK');
