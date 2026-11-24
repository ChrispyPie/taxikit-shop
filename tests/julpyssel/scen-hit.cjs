'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/julpyssel.js'), 'utf8');
assert.match(src, /function onScenTap/);
assert.match(src, /function inTreeCrown/);
assert.match(src, /B\.treeTap/);
assert.match(src, /B\.nearTap/);
assert.doesNotMatch(src, /skateBump\('scen'\)/);
assert.doesNotMatch(src, /\bhen\b|\bStig\b/);

const store = { _s: { taxi_driver: '710022' }, getItem(k){ return Object.prototype.hasOwnProperty.call(this._s,k) ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
function el() {
  return { style: {}, classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    setAttribute(){}, getAttribute(){ return null; }, appendChild(){}, addEventListener(){},
    innerHTML: '', hidden: false, querySelector(){ return null; }, querySelectorAll(){ return []; } };
}
const documentStub = {
  readyState: 'complete', getElementById(){ return null; }, querySelector(){ return null; },
  querySelectorAll(){ return []; }, createElement(){ return el(); },
  head: { appendChild(){} }, body: { appendChild(){} }, addEventListener(){},
  documentElement: { style: { setProperty(){} }, classList: { toggle(){}, contains(){ return false; } } },
  hidden: false, visibilityState: 'visible'
};
const windowObj = { JULPYSSEL: undefined, addEventListener(){}, innerWidth: 412, innerHeight: 780, location: { search: '' } };
windowObj.window = windowObj;
const ctx = {
  window: windowObj, document: documentStub, localStorage: store, sessionStorage: store,
  setInterval(){}, setTimeout(){}, clearTimeout(){}, console, Math, Date, JSON, Array, String, Error, parseInt, parseFloat
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const J = ctx.window.JULPYSSEL;
assert.ok(J && J.inTree && J.inTreeCrown && J.onScenTap && J.rink);

// Mid crown (star / upper tree) in viewBox
const crown = { x: 140, y: (40 - 136) * 1.85 + 219 }; // orig 120,40
assert.equal(J.inTree(crown), true);
assert.equal(J.inTreeCrown(crown), true);

// Ice center (orig 120,136)
const ice = { x: 140, y: 219 };
assert.equal(J.inTreeCrown(ice), false);

// Far left of rink, not tree
const leftIce = { x: 140 - 90, y: 219 };
assert.equal(J.inTree(leftIce), false);
assert.equal(J.inTreeCrown(leftIce), false);

// Empty snow above left
const snow = { x: 40, y: 40 };
assert.equal(J.inTree(snow), false);

const calls = [];
ctx.window.BERRA = {
  isSkating() { return this._on; },
  _on: false,
  treeTap() { calls.push('tree'); return 'start'; },
  nearTap(x, y) { return this._near; },
  _near: false,
  skateBump(why) { calls.push('stunt:' + why); return true; }
};
function ev(x, y) {
  return { clientX: x, clientY: y, preventDefault(){} };
}
const scen = {
  getBoundingClientRect() { return { left: 0, top: 0, width: 280, height: 262 }; }
};

// Crown tap, not skating → tree
calls.length = 0;
assert.equal(J.onScenTap(scen, ev(crown.x, crown.y)), 'tree');
assert.deepEqual(calls, ['tree']);

// Ice far from Berra while skating → nothing
ctx.window.BERRA._on = true;
ctx.window.BERRA._near = false;
calls.length = 0;
assert.equal(J.onScenTap(scen, ev(leftIce.x, leftIce.y)), 'none');
assert.deepEqual(calls, []);

// Ice near Berra while skating → stunt
ctx.window.BERRA._near = true;
calls.length = 0;
assert.equal(J.onScenTap(scen, ev(leftIce.x, leftIce.y)), 'stunt');
assert.deepEqual(calls, ['stunt:near']);

// Crown while skating and "near" still starts/stops via tree
calls.length = 0;
assert.equal(J.onScenTap(scen, ev(crown.x, crown.y)), 'tree');
assert.deepEqual(calls, ['tree']);

console.log('julpyssel/scen-hit.cjs ok');
