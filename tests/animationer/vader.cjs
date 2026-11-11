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
assert.match(js, /snow1g/);
assert.match(js, /taxi_animationer_vader/);
assert.match(js, /pointer-events:\s*none/);
assert.match(js, /anim-wx-paused/);
assert.match(js, /prefers-reduced-motion|reduceMotion/);
assert.match(html, /animationer-vader\.js\?v=20261111vader1/);
assert.match(html, /animationer\.js\?v=20261111vader1/);
assert.match(cl, /2026-11-11vader1/);
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
assert.equal(V.kindFrom({ predominant_precipitation_type_at_surface: 0, precipitation_amount_mean: 0 }), '');
assert.equal(V.kindFrom({ predominant_precipitation_type_at_surface: 1, precipitation_amount_mean: 0.3 }), 'rain');
assert.equal(V.kindFrom({ predominant_precipitation_type_at_surface: 11, precipitation_amount_mean: 0.2 }), 'rain');
assert.equal(V.kindFrom({ predominant_precipitation_type_at_surface: 2, precipitation_amount_mean: 0.4 }), 'sleet');
assert.equal(V.kindFrom({ predominant_precipitation_type_at_surface: 5, precipitation_amount_mean: 0.4 }), 'snow');
assert.equal(V.kindFrom({ predominant_precipitation_type_at_surface: 0, symbol_code: 26, precipitation_amount_mean: 0.5 }), 'snow');
assert.equal(V.kindFrom({ predominant_precipitation_type_at_surface: 0, symbol_code: 23, precipitation_amount_mean: 0.4 }), 'sleet');
assert.equal(V.kindFrom({ predominant_precipitation_type_at_surface: 9999, precipitation_amount_mean: 9999 }), '');
// current Göteborg snapshot style
assert.equal(V.kindFrom({ predominant_precipitation_type_at_surface: 1, precipitation_amount_mean: 0.3, precipitation_frozen_part: 0, symbol_code: 8 }), 'rain');
console.log('PASS vader: snow1g kinds, cache key, reduced-motion, no Stig');
