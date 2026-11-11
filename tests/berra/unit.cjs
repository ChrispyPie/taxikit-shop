'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/berra.js'), 'utf8');
const store = { _s: {}, getItem(k){ return Object.prototype.hasOwnProperty.call(this._s,k) ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
function el() {
  return {
    style: {}, classList: { add(){}, remove(){}, contains(){ return false; } },
    setAttribute(){}, appendChild(){}, addEventListener(){}, innerHTML: '',
    textContent: '', offsetWidth: 40, offsetHeight: 40
  };
}
const documentStub = {
  readyState: 'complete',
  getElementById(){ return null; },
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  createElement(){ return el(); },
  head: { appendChild(){} },
  body: { appendChild(){} },
  addEventListener(){},
  documentElement: { style: { setProperty(){} } }
};
const windowObj = {
  BERRA: undefined,
  addEventListener(){},
  ANIMATIONER: { isOn(){ return true; } },
  matchMedia(){ return { matches: false }; },
  MutationObserver: function () { this.observe = function () {}; },
  innerWidth: 412, innerHeight: 780
};
windowObj.window = windowObj;
const ctx = {
  window: windowObj, document: documentStub,
  localStorage: store, sessionStorage: store,
  setInterval(){}, setTimeout(){}, clearTimeout(){},
  console, Math, Date, JSON, Array, String, Error, parseInt, parseFloat
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const B = ctx.window.BERRA;
assert.ok(B && B.jokes && B.pickJoke && B.poke);
const jokes = B.jokes();
assert.ok(jokes.length >= 190, 'enough jokes: ' + jokes.length);
assert.equal(jokes.length, new Set(jokes).size, 'unique');
jokes.forEach((j, i) => {
  assert.equal(typeof j, 'string');
  assert.ok(j.length >= 20 && j.length <= 90, 'len ' + j.length + ' ' + j);
  assert.match(j, /Berra/);
  assert.doesNotMatch(j, /\bStig\b|\bhen\b/);
});
assert.doesNotMatch(src, /\bStig\b|\bhen\b/);
assert.match(src, /EYE/);
assert.match(src, /HAIR/);
const svgRet = src.slice(src.indexOf("return '<svg"), src.indexOf('function css'));
assert.doesNotMatch(svgRet, /badge|glasses|beard|zip/i);

const seen = new Set();
for (let i = 0; i < 8; i++) {
  const a = B.pickJoke();
  const b = B.pickJoke();
  assert.notEqual(a, b, 'no immediate repeat at ' + i);
  seen.add(a); seen.add(b);
}
assert.ok(seen.size >= 8);

store._s = {};
const bag = new Set();
for (let i = 0; i < jokes.length; i++) bag.add(B.pickJoke());
assert.equal(bag.size, jokes.length, 'all jokes before any repeat');
assert.match(src, /td_berra_bag/);
assert.match(src, /BUBBLE_MS = 30000/);

assert.match(src, /td-berra-slot/);
assert.ok(src.includes('.td-berra{position:relative'));
assert.ok(!src.includes('.td-berra{position:fixed'));
assert.doesNotMatch(src, /Inställningar|installningar/);

const cl = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/changelog.js'), 'utf8');
assert.match(cl, /2026-11-11berra1/);
assert.match(cl, /På startskärmen finns Berra/);

console.log('UNIT_OK', jokes.length);
