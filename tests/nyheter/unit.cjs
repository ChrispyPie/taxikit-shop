'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/nyheter.js'), 'utf8');
const ls = { _s: {}, getItem(k){ return Object.prototype.hasOwnProperty.call(this._s,k) ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
const documentStub = {
  getElementById(){ return null; },
  createElement(){ return { style:{}, textContent:'', setAttribute(){}, appendChild(){} }; },
  head: { appendChild(){} },
  addEventListener(){},
  readyState: 'complete'
};
const windowObj = { NYHETER: undefined, addEventListener(){}, current: 'nyheter' };
let fetches = 0;
const ctx = {
  window: windowObj, document: documentStub, localStorage: ls,
  fetch(){ fetches++; return Promise.reject(new Error('network should not run yet')); },
  Intl, Date, Array, String, Object, Math, JSON, Promise, Error,
  console
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const N = ctx.window.NYHETER;

assert.equal(N.id, 'nyheter');
assert.equal(N.title, 'Nyheter');
assert.equal(N._readSel().join(','), 'goteborg');

ls.setItem('taxi_driver', '900001');
N._writeSel(['goteborg', 'sport', 'noje', 'goteborg', 'okant']);
assert.equal(N._readSel().join(','), 'goteborg,sport,noje');
assert.equal(ls.getItem('taxi_nyheter_feeds:900001'), JSON.stringify(['sport','noje']));

N._writeSel(['goteborg']);
assert.equal(ls.getItem('taxi_nyheter_feeds:900001'), null);
assert.equal(N._readSel().join(','), 'goteborg');

const now = new Date('2026-11-11T12:00:00+01:00');
assert.equal(N._fmtTime('2026-11-11T05:30:04+01:00', now), '05:30');
assert.equal(N._fmtTime('2026-11-10T18:12:00+01:00', now), 'i går 18:12');
assert.match(N._fmtTime('2026-11-08T09:00:00+01:00', now), /8 nov/i);

assert.equal(N._esc('<b>x</b>'), '&lt;b&gt;x&gt;'.replace('x&gt;','x&lt;/b&gt;'));
assert.equal(N._esc('a&b'), 'a&amp;b');

const pack = {
  feeds: {
    goteborg: { source: 'SVT Väst', items: [
      { title: 'Lokal nyhet', summary: 'Kort text.', source: 'SVT Väst', published: '2026-11-11T08:00:00Z', url: 'https://www.svt.se/a' }
    ]},
    sport: { source: 'SVT Sport', items: [
      { title: 'Sportnyhet', summary: 'Matchen.', source: 'SVT Sport', published: '2026-11-11T09:00:00Z', url: 'https://www.svt.se/b' }
    ]},
    politik: { source: 'SR Studio Ett', items: [
      { title: '', url: 'https://sverigesradio.se/x' }
    ]}
  }
};
N._writeSel(['goteborg']);
let items = N._itemsFor(N._readSel(), pack);
assert.equal(items.length, 1);
assert.equal(items[0].title, 'Lokal nyhet');
N._writeSel(['goteborg','sport']);
items = N._itemsFor(N._readSel(), pack);
assert.equal(items.length, 2);
assert.equal(items[0].title, 'Sportnyhet'); // newer first
assert.equal(items[1].title, 'Lokal nyhet');

assert.equal(fetches, 0, 'ingen hämtning innan sidan öppnas');

const help = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalp.js'), 'utf8');
const nyh = help.split('nyheter: [')[1].split('],')[0];
assert.doesNotMatch(nyh, /\bStig\b|\bhen\b/);
assert.doesNotMatch(src, /\bStig\b|\bhen\b/);

const cl = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/changelog.js'), 'utf8');
assert.match(cl, /2026-11-11nyheter1/);
assert.match(cl, /Under Moduler finns Nyheter/);

const ho = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hem-ordning.js'), 'utf8');
assert.match(ho, /DEFAULT_OFF = \{ nyheter: 1 \}/);

console.log('UNIT_OK');
