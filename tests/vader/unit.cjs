'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/vader.js'), 'utf8');
const window = {};
const sessionStorage = { _s: {}, getItem(k){ return this._s[k] || null; }, setItem(k,v){ this._s[k]=String(v); } };
const document = {
  createElement(tag){ return { tagName: tag, style: {}, setAttribute(){}, appendChild(){}, getContext(){ return null; } }; },
  head: { appendChild(){} },
  querySelector(){ return null; },
  hidden: false
};
const ctx = { window, document, sessionStorage, Date, Math, JSON, Int32Array, Promise, Image: function(){}, fetch(){ return Promise.reject(new Error('no fetch in unit')); }, console };
ctx.window = window;
ctx.self = window;
vm.runInNewContext(src, ctx);
const V = window.VADER;
assert.ok(V && V.id === 'vader' && V.title === 'Väder');

// Gothenburg inside the SMHI composite (not tens of km outside)
const gbg = V.radarPixel(57.7089, 11.9746);
assert.ok(gbg.x > 40 && gbg.x < 430, 'gbg x in raster: ' + gbg.x);
assert.ok(gbg.y > 80 && gbg.y < 800, 'gbg y in raster: ' + gbg.y);
// Stockholm too, roughly
const sth = V.radarPixel(59.33, 18.07);
assert.ok(sth.x > 0 && sth.x < 471 && sth.y > 0 && sth.y < 887, 'sthlm ' + JSON.stringify(sth));

// roundtrip of projection
const tm = V.llToTm(57.7089, 11.9746);
const back = V.tmToLl(tm.e, tm.n);
assert.ok(Math.abs(back.lat - 57.7089) < 0.001, 'lat rt ' + back.lat);
assert.ok(Math.abs(back.lon - 11.9746) < 0.001, 'lon rt ' + back.lon);

const csv = 'version;year;month;day;hours;minutes;seconds;nanoseconds;lat;lon;x\n0;2026;11;10;19;27;38;0;58.3156;11.3846;5\n';
const rows = V.parseBlixt(csv);
assert.equal(rows.length, 1);
assert.equal(rows[0].lat, 58.3156);
assert.equal(rows[0].lon, 11.3846);
assert.equal(rows[0].t, Date.UTC(2026, 10, 10, 19, 27, 38));

assert.equal(V.fillUrl('y{y}/m{m}/d{d}', { y: 2026, m: 1, day: 5 }), 'y2026/m01/d05');
assert.equal(V.gridPoints().length, 20);

const text = src + fs.readFileSync(path.resolve(__dirname, '../../TaxiData/vader.css'), 'utf8')
  + fs.readFileSync(path.resolve(__dirname, '../../TaxiData/changelog.js'), 'utf8');
assert.doesNotMatch(text, /\bStig\b/);
assert.doesNotMatch(text, /\bhen\b/);
assert.doesNotMatch(src, /klädsel|outfit|snöanimation|regn- och snö/);
console.log('UNIT_OK', 'gbg', { x: +gbg.x.toFixed(1), y: +gbg.y.toFixed(1) });
