'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalpbot-scenarier.js'), 'utf8');
const bot = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalpbot.js'), 'utf8');

assert.doesNotMatch(src, /pil i knät/);
assert.match(src, /pil i servon/);
assert.match(src, /All your base are belong to us/);
assert.match(src, /Svaret är 42/);
assert.match(src, /Don.?t panic/);
assert.match(src, /handduken/);
assert.match(src, /Hjärna stor som en planet/);
assert.match(src, /mood: 'marvin'/);
assert.doesNotMatch(src, /EasyJet/);
assert.doesNotMatch(src, /Många bilar på Landvetter/);
assert.doesNotMatch(bot + src, /\bStig\b/);

const ls = { getItem(){ return null; }, setItem(){}, removeItem(){} };
const ss = { _s: {}, getItem(k){ return Object.prototype.hasOwnProperty.call(this._s,k) ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); } };
const windowObj = { ANIMATIONER: { isOn(){ return true; } }, taxiStats: null, PROGNOS: null, ANKOMSTER: null, TOPPLISTOR_LAST: null, TOPPLISTOR: null };
windowObj.window = windowObj;
const ctx = { window: windowObj, document: {}, localStorage: ls, sessionStorage: ss, Math, Date, console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const S = ctx.window.HJALPBOT_SCENARIER;
assert.ok(S && S.all && S.pick);
const ids = S.all().map(x => x.id);
['vader-regn','kordata-over','kordata-42','prognos-landvetter','prognos-storbil','prognos-marvin',
 'ankomster-nasta','topplistor-etta','robot-dont-panic','robot-marvin-planet','robot-handduk',
 'robot-aybabtu-slump','robot-skyrim-servo','robot-42-slump','tid-leet','tid-pi','tid-404',
 'tid-binar-01','tid-binar-10','tid-sekvens','tid-overflow','tid-1111'].forEach(id => {
  assert.ok(ids.includes(id), 'missing ' + id);
});

// chauffeur never gets robot-only nerd lines
['robot-skyrim-servo','robot-aybabtu-slump','tid-leet','kordata-42','robot-marvin-planet','robot-dont-panic','robot-handduk'].forEach(id => {
  const sc = S.all().find(x => x.id === id);
  assert.ok(sc.chars && sc.chars.length === 1 && sc.chars[0] === 'robot', id);
});

// 42 from real counters
windowObj.taxiStats = function (tab) {
  if (tab !== 'manad') return { tab, inkort: 10, goal: 10, diff: 0, antal: 3, own: true, mil: 1, hours: 1 };
  return { tab: 'manad', inkort: 100, goal: 100, diff: 0, antal: 42, own: true, mil: 10, hours: 8 };
};
let hit = S.pick({ context: 'home', tool: 'kordata', char: 'robot', skipCooldown: true, skipChance: true });
assert.equal(hit && hit.id, 'kordata-42');
assert.match(hit.text, /Svaret är 42/);
assert.match(hit.text, /körningar/);
hit = S.pick({ context: 'home', tool: 'kordata', char: 'chauffor', skipCooldown: true, skipChance: true });
assert.ok(!hit || hit.id !== 'kordata-42');

// per-character voices on rain
windowObj.taxiStats = function () { return null; };
windowObj.ANIMATIONER_VADER = { readCache(){ return { kind: 'rain', temp: 8, symbol: 9, at: Date.now() }; } };
const rRobot = S.pick({ context: 'home', tool: 'vader', char: 'robot', skipCooldown: true, skipChance: true });
const rMan = S.pick({ context: 'home', tool: 'vader', char: 'chauffor', skipCooldown: true, skipChance: true });
const rDiva = S.pick({ context: 'home', tool: 'vader', char: 'diva', skipCooldown: true, skipChance: true });
assert.equal(rRobot.id, 'vader-regn');
assert.notEqual(rRobot.text, rMan.text);
assert.notEqual(rRobot.text, rDiva.text);
assert.match(rMan.text, /paraply/i);
assert.match(rDiva.text, /stjärna|😉/);

// Landvetter bookings exist; airline-storbil does not
windowObj.ANIMATIONER_VADER = { readCache(){ return null; } };
const now = Date.now() + 40 * 60 * 1000;
windowObj.PROGNOS = { cachedBookings(){ return [
  { zone_id: '293', category: 'app', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'app', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'app', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'app', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'app', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'app', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'app', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'app', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'storbil', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'storbil', estimated_at: new Date(now).toISOString() },
  { zone_id: '293', category: 'storbil', estimated_at: new Date(now).toISOString() }
]; } };
const lv = S.pick({ context: 'page', tool: 'prognos', char: 'chauffor', skipCooldown: true, skipChance: true });
assert.equal(lv.id, 'prognos-landvetter');
assert.match(lv.text, /Landvetter/);

// time 13:37 robot only
S._clock = function () { return '13:37'; };
const t = S.pick({ context: 'time', char: 'robot', clock: '13:37', skipCooldown: true, skipChance: true });
assert.equal(t.id, 'tid-leet');
assert.match(t.text, /Leet/i);
const tNo = S.pick({ context: 'time', char: 'diva', clock: '13:37', skipCooldown: true, skipChance: true });
assert.equal(tNo, null);

// don't panic on real error
windowObj.PROGNOS = { cachedBookings(){ return null; }, cachedProblem(){ return { kind: 'error', source: 'prognos', message: 'Kunde inte hämta prognos just nu.' }; } };
windowObj.ANKOMSTER = { cachedProblem(){ return null; } };
const pan = S.pick({ context: 'home', char: 'robot', skipCooldown: true, skipChance: true });
assert.equal(pan.id, 'robot-dont-panic');
assert.match(pan.text, /panic/i);

// random robot lines exist
const randomIds = S.all().filter(x => (Array.isArray(x.context) ? x.context.includes('random') : x.context === 'random')).map(x => x.id);
assert.ok(randomIds.includes('robot-skyrim-servo'));
assert.ok(randomIds.includes('robot-handduk'));
assert.ok(randomIds.includes('robot-marvin-planet'));

console.log('UNIT_OK', ids.length, 'scenarios');
process.exit(0);
