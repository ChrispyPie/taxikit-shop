'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const stage = fs.readFileSync(path.join(root, 'TaxiData/hb-stage.js'), 'utf8');
const bot = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'TaxiData/sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const hem = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning-core.js'), 'utf8');

assert.match(sw, /CACHE_VER = '20261123zmys1'/);
assert.match(html, /hb-stage\.js\?v=20261123zmys1/);
assert.match(lv, /hjalpbot\.js\?v=20261123zmys1/);
assert.match(lv, /"berra":\s*\["berra\.js\?v=20261123zmys1"\]/);
assert.match(hem, /LAZY\.ensure\('berra'\)/);
assert.match(cl, /id: '2026-11-22zhb1'/);
assert.match(cl.split("id: '2026-11-22zhb1'")[1].split(']},')[0], /strålkastare|lampan/);
assert.doesNotMatch(stage + bot + cl.split("id: '2026-11-22zhb1'")[1].split(']},')[0], /\bStig\b|\bhen\b/);

assert.doesNotMatch(stage, /hb-stage-toggle/);
assert.doesNotMatch(stage, /lit \? 'På' : 'Av'/);
assert.match(stage, /hb-stage-lamp-btn/);
assert.match(stage, /beamOverlay/);
assert.match(stage, /standLocal/);
assert.match(stage, /sameView && fits\(placed\.x, placed\.y/);
assert.match(bot, /if \(stagedStand\) return stagedStand;/);
assert.match(bot, /HJALPBOT\.bubbleOn = bubbleOn/);
assert.match(bot, /Tryck på lampan eller figuren/);
assert.doesNotMatch(bot, /visar På eller Av/);

function node(extra) {
  const n = {
    style: { display: '', transform: '' }, className: '', id: '', innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    setAttribute() {}, getAttribute() { return null; }, appendChild() { return this; },
    addEventListener() {}, querySelector() { return node(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    offsetHeight: 0
  };
  return Object.assign(n, extra || {});
}

function boot(opts) {
  opts = opts || {};
  const vw = opts.vw || 458, vh = opts.vh || 812;
  const ls = {
    _s: { taxi_driver: '900001', hb_char_900001: 'robot' },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); }
  };
  const headerR = { left: 0, top: 0, right: vw, bottom: 56, width: vw, height: 56 };
  const dotsR = { left: vw / 2 - 35, top: vh - 62, right: vw / 2 + 35, bottom: vh - 8, width: 70, height: 54 };
  const header = node({ getBoundingClientRect: () => headerR });
  const dots = node({ id: 'td-dots', getBoundingClientRect: () => dotsR, style: { display: '' } });
  const app = node({
    classList: { contains: k => k === 'is-home', add() {}, remove() {} },
    style: { display: '' },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  });
  const host = node({ id: 'hb-stage', style: { display: '', transform: '' }, classList: { _s: {}, add(k){ this._s[k]=1; }, remove(k){ delete this._s[k]; }, contains(k){ return !!this._s[k]; } } });
  const cssEl = node({ id: 'hb-stage-css' });
  const created = [];
  const doc = {
    getElementById(id) {
      if (id === 'app') return app;
      if (id === 'td-dots') return dots;
      if (id === 'hb-stage') return host.parentNode ? host : null;
      if (id === 'hb-stage-css') return cssEl.id ? cssEl : null;
      if (id === 'hb-stage-lamp-btn') return lampBtn;
      if (id === 'hb-stage-scene') return scene;
      if (id === 'animationer-vader-plats') return null;
      if (id === 'profile-menu') return null;
      return null;
    },
    querySelector(sel) {
      if (sel === '#app header' || sel === 'header') return header;
      if (sel === '#app.is-home' || sel === '#app') return app;
      return null;
    },
    querySelectorAll(sel) {
      if (sel.indexOf('td-dots') >= 0) return [dots];
      return [];
    },
    createElement(tag) {
      if (tag === 'style') { cssEl.id = 'hb-stage-css'; created.push(cssEl); return cssEl; }
      if (tag === 'div' && !host.parentNode) { created.push(host); return host; }
      const n = node();
      created.push(n);
      return n;
    },
    head: node({ appendChild(el) { this._child = el; el.parentNode = this; return el; } }),
    body: node({ appendChild(el) { if (el === host || el.id === 'hb-stage' || !host.parentNode) { host.parentNode = this; } this._child = el; el.parentNode = this; return el; } }),
    documentElement: node()
  };
  let lampBtn = node({ id: 'hb-stage-lamp-btn' });
  let scene = node({ id: 'hb-stage-scene' });
  // After paint, getElementById should still find lamp/scene stubs
  const win = {
    addEventListener() {},
    innerWidth: vw, innerHeight: vh,
    LAZY: { ensure(id) { win._ensured = win._ensured || []; win._ensured.push(id); return Promise.resolve(); } }
  };
  win.window = win;
  const ctx = { window: win, document: doc, localStorage: ls, console, setTimeout() { return 0; }, clearTimeout() {}, LAZY: win.LAZY };
  vm.createContext(ctx);
  vm.runInContext(stage, ctx);
  const S = ctx.window.HB_STAGE;
  // render needs host append – hook ensureHost via render
  // force app as home and body append
  S.render();
  return { S, host, ls, win, ctx, lampBtn, scene, dotsR, vw, vh };
}

const r = boot();
assert.ok(r.S, 'HB_STAGE saknas');
assert.equal(r.S.isLit(), false);
assert.ok(r.host.innerHTML.indexOf('hb-stage-lamp-btn') >= 0, 'lampa saknas');
assert.ok(r.host.innerHTML.indexOf('hb-stage-toggle') < 0, 'På/Av-knapp fanns kvar');
assert.ok(!/\\bPå\\b|\\bAv\\b/.test(r.host.innerHTML.replace(/aria-label="[^"]*"/g, '')), 'På/Av-text i scenen');
const yOff = r.S.room() && (r.S.room().y);
assert.ok(yOff > 0, 'ingen rum y ' + yOff);
r.S.setLit(true);
assert.equal(r.S.isLit(), true);
assert.ok(r.host.innerHTML.indexOf('hb-stage-beam') >= 0, 'stråle saknas när tänd');
const yOn = r.S.room() && r.S.room().y;
assert.equal(yOn, yOff, 'y hoppade vid tändning: ' + yOff + ' → ' + yOn);
const stand = r.S.standPoint('robot');
assert.ok(stand, 'ståplats saknas');
assert.equal(Math.round(stand.y), Math.round(yOn + 64 - 40 - 2), 'fötterna inte på golvet ' + JSON.stringify({ stand, yOn }));
// ljusfläck ungefär under roboten (mitt i scenen / lampan)
const localX = stand.x - r.S.room().x;
assert.ok(Math.abs(localX + 20 - 56) <= 3, 'roboten inte under lampan ' + localX);
r.S.setLit(false);
assert.equal(r.S.isLit(), false);
assert.ok(r.host.innerHTML.indexOf('hb-stage-beam') < 0, 'stråle kvar när släckt');
assert.equal(r.S.room() && r.S.room().y, yOff, 'y hoppade vid släckning');

// lamp-knapp finns med aria-pressed
r.S.setLit(true);
assert.match(r.host.innerHTML, /aria-pressed="true"/);
r.S.setLit(false);
assert.match(r.host.innerHTML, /aria-pressed="false"/);

console.log('HB_STAGE_UNIT_OK', 'y=' + yOff, 'stand=' + JSON.stringify(stand));
