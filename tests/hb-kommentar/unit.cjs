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
 'tid-binar-01','tid-binar-10','tid-sekvens','tid-overflow','tid-1111','kalender-idag','kalender-vecka'].forEach(id => {
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


// Kalender: only cached events, skip if none, prefer big/today, per-character voices
function isoStockholm(y, m, d, h, min) {
  const pad = n => String(n).padStart(2, '0');
  // Europe/Stockholm offset: CET +01 Nov–Mar, CEST +02 last Sun Mar–last Sun Oct (approx: month 3-10 handled loosely by Date)
  return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:00+01:00`).toISOString();
}
function ymdParts(d, zone) {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {}; f.formatToParts(d).forEach(p => { o[p.type] = p.value; });
  return { y: +o.year, m: +o.month, d: +o.day, key: o.year + '-' + o.month + '-' + o.day };
}
const zone = 'Europe/Stockholm';
const nowP = ymdParts(new Date(), zone);
function addDaysKey(key, n) {
  const a = key.split('-');
  const d = new Date(Date.UTC(+a[0], +a[1]-1, +a[2]+n));
  const p2 = x => String(x).padStart(2,'0');
  return d.getUTCFullYear() + '-' + p2(d.getUTCMonth()+1) + '-' + p2(d.getUTCDate());
}
function dowOf(key) {
  const a = key.split('-');
  return new Date(Date.UTC(+a[0], +a[1]-1, +a[2])).getUTCDay(); // 0 sun
}

windowObj.PROGNOS = { cachedBookings(){ return null; }, cachedProblem(){ return null; } };
windowObj.ANKOMSTER = { cachedProblem(){ return null; } };
windowObj.taxiStats = function () { return null; };
windowObj.ANIMATIONER_VADER = { readCache(){ return null; } };
windowObj.KALENDER = { cachedEvents(){ return null; } };
let kal = S.pick({ context: 'home', tool: 'kalender', char: 'robot', skipCooldown: true, skipChance: true });
assert.equal(kal, null, 'no cache -> skip');
windowObj.KALENDER = { cachedEvents(){ return { events: [], timezone: zone }; } };
kal = S.pick({ context: 'home', tool: 'kalender', char: 'robot', skipCooldown: true, skipChance: true });
assert.equal(kal, null, 'empty -> skip');

const tonight = isoStockholm(nowP.y, nowP.m, nowP.d, 19, 0);
windowObj.KALENDER = { cachedEvents(){ return { events: [
  { title: 'IFK Göteborg – AIK', venue: 'Gamla Ullevi', category: 'sport', starts_at: tonight, ends_at: isoStockholm(nowP.y, nowP.m, nowP.d, 21, 0) },
  { title: 'Liten klubbkväll', venue: 'Något hörn', category: 'ovrigt', starts_at: tonight }
], timezone: zone }; } };
const kRobot = S.pick({ context: 'home', tool: 'kalender', char: 'robot', skipCooldown: true, skipChance: true });
const kMan = S.pick({ context: 'home', tool: 'kalender', char: 'chauffor', skipCooldown: true, skipChance: true });
const kDiva = S.pick({ context: 'home', tool: 'kalender', char: 'diva', skipCooldown: true, skipChance: true });
assert.equal(kRobot && kRobot.id, 'kalender-idag');
assert.match(kRobot.text, /IFK/);
assert.match(kRobot.text, /Gamla Ullevi/);
assert.match(kRobot.text, /ikväll 19:00/);
assert.notEqual(kRobot.text, kMan.text);
assert.notEqual(kRobot.text, kDiva.text);
assert.match(kDiva.text, /😉/);
const kPage = S.pick({ context: 'page', tool: 'kalender', char: 'robot', skipCooldown: true, skipChance: true });
assert.equal(kPage && kPage.id, 'kalender-idag');

// later this week: concert on Saturday (or Sunday if today is Saturday)
let satKey = nowP.key;
for (let i = 1; i <= 7; i++) {
  const k = addDaysKey(nowP.key, i);
  if (dowOf(k) === 6 || (dowOf(nowP.key) === 6 && dowOf(k) === 0)) { satKey = k; break; }
}
const sa = satKey.split('-');
// only test weekend phrase when the event is still this week (Sun or before) and not today
windowObj.KALENDER = { cachedEvents(){ return { events: [
  { title: 'Stora konserten', venue: 'Scandinavium', category: 'konsert', starts_at: isoStockholm(+sa[0], +sa[1], +sa[2], 20, 0) }
], timezone: zone }; } };
const week = S.pick({ context: 'home', tool: 'kalender', char: 'robot', skipCooldown: true, skipChance: true });
if (satKey > nowP.key && satKey <= addDaysKey(nowP.key, (dowOf(nowP.key)===0?0:7-dowOf(nowP.key)))) {
  assert.equal(week && week.id, 'kalender-vecka', week && week.text);
  assert.match(week.text, /Konsert på Scandinavium/);
  if (dowOf(nowP.key) >= 1 && dowOf(nowP.key) <= 5 && dowOf(satKey) === 6) assert.match(week.text, /i helgen/);
}

// past-only events are skipped
windowObj.KALENDER = { cachedEvents(){ return { events: [
  { title: 'IFK', venue: 'Gamla Ullevi', category: 'sport', starts_at: isoStockholm(nowP.y, nowP.m, nowP.d, 1, 0), ends_at: isoStockholm(nowP.y, nowP.m, nowP.d, 2, 0) }
], timezone: zone }; } };
// if it's already after 02:00, should skip; if before 02:00 this still is "today" — only assert skip when ended
const ended = Date.parse(isoStockholm(nowP.y, nowP.m, nowP.d, 2, 0)) < Date.now();
if (ended) {
  const past = S.pick({ context: 'home', tool: 'kalender', char: 'robot', skipCooldown: true, skipChance: true });
  assert.equal(past, null, 'past events skipped');
}


console.log('UNIT_OK', ids.length, 'scenarios');
process.exit(0);
