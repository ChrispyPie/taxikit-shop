'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalp.js'), 'utf8');
function el() {
  return {
    style: {}, classList: { add(){}, remove(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){ return null; }, addEventListener(){},
    appendChild(){}, insertBefore(){}, remove(){}, querySelector(){ return el(); },
    querySelectorAll(){ return []; }, innerHTML: '', textContent: '', isConnected: true,
    firstChild: null, offsetParent: {}
  };
}
const documentStub = {
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return el(); },
  head: { appendChild(){} },
  body: { appendChild(){} },
  addEventListener(){},
  readyState: 'complete'
};
const windowObj = { current: null, addEventListener(){} };
const ctx = {
  window: windowObj,
  document: documentStub,
  location: { pathname: '/TaxiData/index.html' },
  setInterval(){},
  addEventListener(){},
  getComputedStyle(){ return { display: 'block' }; },
  console
};
windowObj.HJALP = undefined;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const H = ctx.window.HJALP;
assert.ok(H && H.texter, 'HJALP.texter');
const keys = Object.keys(H.texter);
['hem', 'vader', 'kordata', 'ankomster', 'installningar', 'login', 'admin'].forEach(k => assert.ok(keys.includes(k), k));
keys.forEach(k => {
  const rows = H.texter[k];
  assert.ok(rows.length >= 3 && rows.length <= 6, k + ' lines ' + rows.length);
  const blob = rows.join(' ');
  assert.doesNotMatch(blob, /\bStig\b/);
  assert.doesNotMatch(blob, /\bhen\b/);
  assert.doesNotMatch(blob, /klädsel|outfit|snöanimation|regn- och snö|överraska/);
});
assert.doesNotMatch(H.fallback.join(' '), /\bStig\b|\bhen\b/);
console.log('UNIT_OK screens', keys.length);
keys.forEach(k => console.log(k + ' (' + H.texter[k].length + '): ' + H.texter[k].join(' / ')));
