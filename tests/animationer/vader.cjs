const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const js = fs.readFileSync(path.join(root, 'TaxiData/animationer-vader.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const anim = fs.readFileSync(path.join(root, 'TaxiData/animationer.js'), 'utf8');

assert.doesNotMatch(js, /\bStig\b/);
assert.doesNotMatch(anim.split('window.ANIMATIONER')[0].slice(-800) + 'x', /\bStig\b/);
assert.match(js, /open-meteo\.com/);
assert.doesNotMatch(js, /probability_of_precipitation|snow1g/);
assert.match(js, /permissions\.query/);
assert.match(js, /Visa vädret där du är/);
assert.match(js, /taxi_animationer_vader_v2/);
assert.match(js, /pointer-events:\s*none/);
assert.match(js, /anim-wx-paused/);
assert.match(js, /prefers-reduced-motion|reduceMotion/);
assert.match(html, /animationer-vader\.js\?v=20261111regn1/);
assert.match(html, /animationer\.js\?v=20261112anim5/);
assert.doesNotMatch(cl, /2026-11-11vader1|regnar eller snöar|snöflingor/);
assert.match(anim, /ANIMATIONER\.layer|layer: ensureLayer/);

const ctx = {
  window: { ANIMATIONER: { isOn() { return true; }, reduceMotion() { return false; }, layer() { return ctx._layer; } } },
  document: {
    addEventListener() {},
    readyState: 'complete',
    hidden: false,
    body: { appendChild() {} },
    head: { appendChild() {} },
    getElementById() { return null; },
    createElement() { return { style: {}, setAttribute() {}, classList: { add() {}, remove() {} } }; }
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  navigator: {},
  fetch: () => Promise.reject(new Error('no')),
  console, Date, JSON, Math, setTimeout: () => {}, setInterval: () => {}, clearInterval() {},
};
ctx.window.ANIMATIONER_VADER = undefined;
vm.createContext(ctx);
vm.runInContext(js, ctx);
const V = ctx.window.ANIMATIONER_VADER;
assert.ok(V && V.kindFrom);
assert.equal(V.kindFrom({ precipitation: 0, weather_code: 61, rain: 0, showers: 0, snowfall: 0 }), '', 'code without amount is not rain');
assert.equal(V.kindFrom({ precipitation: 0, weather_code: 3 }), '');
assert.equal(V.kindFrom({ precipitation: 0.02, weather_code: 51, rain: 0.02 }), '', 'tiny amount stays dry');
assert.equal(V.kindFrom({ precipitation: 0.2, weather_code: 61, rain: 0.2, showers: 0, snowfall: 0 }), 'rain');
assert.equal(V.kindFrom({ precipitation: 0.2, weather_code: 51, rain: 0.2 }), 'rain');
assert.equal(V.kindFrom({ precipitation: 0.3, weather_code: 73, rain: 0, showers: 0, snowfall: 0.3 }), 'snow');
assert.equal(V.kindFrom({ precipitation: 0.4, weather_code: 85, snowfall: 0.4 }), 'snow');
assert.equal(V.kindFrom({ precipitation: 0.4, weather_code: 68, rain: 0.2, snowfall: 0.2 }), 'sleet');
assert.equal(V.kindFrom({ precipitation: 0.4, rain: 0.2, snowfall: 0.2 }), 'sleet');
assert.equal(V.roundCoord(57.7089, 11.9746).lat, 57.71);
assert.equal(V.roundCoord(57.7089, 11.9746).lon, 11.97);
assert.equal(V.gbg.lat, 57.71);
const of = V.outfitFrom;
assert.ok(of, 'outfitFrom exported');
// ANIMATIONER is on in ctx
assert.equal(of({ kind: 'snow', temp: 12, symbol: 1 }), 'snow');
assert.equal(of({ kind: 'sleet', temp: -2 }), 'snow');
assert.equal(of({ kind: 'rain', temp: 8 }), 'rain');
assert.equal(of({ kind: '', temp: 2, symbol: 1 }), 'cold');
assert.equal(of({ kind: '', temp: 21, symbol: 4 }), 'sun');
assert.equal(of({ kind: '', temp: 12, symbol: 1 }), 'sun');
assert.equal(of({ kind: '', temp: 12, symbol: 4 }), '');
assert.equal(of({ kind: 'rain' }, { force: true }), 'rain');
ctx.window.ANIMATIONER.isOn = function () { return false; };
assert.equal(of({ kind: 'snow', temp: -5 }), '', 'off toggle uses default outfit');
assert.equal(of({ kind: 'snow', temp: -5 }, { force: true }), 'snow');
assert.ok(V.readCache, 'readCache exported so bot adds no extra request');
const bot = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot.js'), 'utf8');
assert.match(bot, /hb-gear-cold/);
assert.match(bot, /hb-gear-rain/);
assert.match(bot, /hb-gear-snow/);
assert.match(bot, /hb-gear-sun/);
assert.match(bot, /animationer-vader/);
assert.match(bot, /previewOutfit/);
assert.doesNotMatch(bot, /\bStig\b/);
assert.doesNotMatch(cl, /hjälpboten.*(regn|snö|mössa|solglas)/i);
console.log('PASS vader: open-meteo current kinds, rounded coords, cache key, reduced-motion, outfits, no Stig');
