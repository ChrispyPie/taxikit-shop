'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const berra = fs.readFileSync(path.join(root, 'TaxiData/berra.js'), 'utf8');
const bot = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot.js'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');

function body(src, name) {
  const a = src.indexOf('function ' + name + '(');
  assert.ok(a >= 0, 'saknar ' + name);
  let i = src.indexOf('{', a), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(a, i + 1);
  }
  throw new Error('obalanserad ' + name);
}

const placeB = body(berra, 'placeBubble');
assert.match(placeB, /width = 'max-content'/);
assert.match(placeB, /maxWidth = maxW \+ 'px'/);
assert.match(placeB, /Math\.min\(260, vw - pad \* 2\)/);
assert.doesNotMatch(placeB, /var bw = Math\.min\(260, vw - pad \* 2\)/);
assert.match(berra, /\.td-berra-bubble\{position:fixed;width:max-content;max-width:min\(260px,calc\(100vw - 16px\)\)/);

const placeC = body(bot, 'placeChrome');
assert.match(placeC, /width = 'max-content'/);
assert.match(placeC, /Math\.min\(280, vw - pad \* 2\)/);
assert.doesNotMatch(placeC, /var bw = Math\.min\(280, vw - pad \* 2\)/);
assert.doesNotMatch(placeC, /Math\.max\(200, bw - 64\)/);
assert.match(bot, /\.hb-bubble\{position:fixed;width:max-content;max-width:min\(280px,calc\(100vw - 16px\)\)/);

assert.match(cl, /2026-11-25zbub1/);
const slice = cl.slice(cl.indexOf('2026-11-25zbub1'), cl.indexOf('2026-11-25zbub1') + 500);
assert.doesNotMatch(slice, /\bhen\b|\bStig\b/);
console.log('bubble-width.cjs ok');
