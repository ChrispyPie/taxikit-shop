'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '../../TaxiData/ankomster.js'), 'utf8');
const listeners = [];
const windowObj = {
  addEventListener(t, f) { listeners.push([t, f]); },
  removeEventListener() {},
};
const ctx = {
  window: windowObj,
  document: { addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; }, createElement() { return { style: {}, appendChild() {}, addEventListener() {}, className: '' }; } },
  localStorage: { getItem() { return null; }, setItem() {} },
  fetch() { return Promise.reject(new Error('no')); },
  console, Date, Math, Intl,
  setInterval() { return 0; }, clearInterval() {}, setTimeout() {}, clearTimeout() {},
  requestAnimationFrame(f) { try { f(); } catch (e) {} },
  CustomEvent: function () {},
};
ctx.window.ANKOMSTER = undefined;
vm.createContext(ctx);
vm.runInContext(src, ctx);
assert.ok(ctx.window.ANKOMSTER && ctx.window.ANKOMSTER.sources.length >= 2);

// Extrahera reasonText ur källan och kör den i isolation.
const m = src.match(/function reasonText\(it, extra\) \{[\s\S]*?\n  \}/);
assert.ok(m, 'reasonText finns');
const box = vm.runInNewContext(m[0] + '; ({ reasonText })');
assert.equal(box.reasonText({ reason: 'Banarbete', reasonInfo: 'Buss ersätter' }), 'Banarbete. Buss ersätter');
assert.equal(box.reasonText({ reason: '' }, { reason: 'Banarbete', info: 'Buss ersätter' }), 'Banarbete. Buss ersätter');
assert.equal(box.reasonText({ reason: 'Banarbete', reasonInfo: 'Banarbete' }), 'Banarbete');
assert.equal(box.reasonText({ reason: '' }, null), '');
console.log('5 orsak/ankomster assertions passed');
