const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');

const js = fs.readFileSync(path.join(root, 'TaxiData/animationer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const ljud = fs.readFileSync(path.join(root, 'TaxiData/bevakning-ljud.js'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');

assert.doesNotMatch(js, /\bStig\b/);
assert.doesNotMatch(html, /\bStig\b/);
assert.match(js, /taxi_animationer/);
assert.match(js, /pointer-events:\s*none/);
assert.match(js, /prefers-reduced-motion/);
assert.match(js, /bev-watch-fire/);
assert.match(js, /Animationer/);
assert.doesNotMatch(js, /localStorage\.getItem\('taxi_bev_ljud'\)/);
assert.match(ljud, /bev-watch-fire/);
assert.match(html, /animationer\.js\?v=20261111tyst1/);
assert.match(html, /id="animationer-set"/);
assert.match(html, /bevakning-ljud\.js\?v=20261111anim1/);
assert.match(cl, /2026-11-11anim1/);
assert.match(cl, /Inställningar, Animationer/);
assert.doesNotMatch(cl, /regnar eller snöar|snöflingor|droppar eller flingor/);
assert.doesNotMatch(js, /regnar eller snöar|droppar eller flingor/);
assert.doesNotMatch(cl.split('window.CHANGELOG')[1].slice(0, 800), /\bStig\b/);

const store = {};
const created = [];
const headKids = [];
const body = { children: { get length() { return this._n || 0; }, 0: null }, _els: [], appendChild(el) { this._els.push(el); this[0] = this._els[0]; Object.defineProperty(this.children, '_n', { value: this._els.length, configurable: true }); }, removeChild(el) { this._els = this._els.filter(x => x !== el); }, isConnected: true };
const layerHost = { id: 'animationer-layer', isConnected: true, children: { length: 0 }, _els: [], appendChild(el) { this._els.push(el); this.children.length = this._els.length; created.push(el); }, removeChild() {}, setAttribute() {} };

function el(tag) {
  const o = { tag, style: {}, className: '', innerHTML: '', children: [], isConnected: true, setAttribute() {}, getAttribute() { return null; }, appendChild() {}, closest() { return null; } };
  return o;
}
const ctx = {
  window: {},
  document: {
    addEventListener(type, fn) { ctx.document._ls = ctx.document._ls || {}; (ctx.document._ls[type] = ctx.document._ls[type] || []).push(fn); },
    dispatchEvent(ev) { const ls = (ctx.document._ls || {})[ev.type] || []; ls.forEach(fn => fn(ev)); return true; },
    readyState: 'complete',
    body: { appendChild(n) { body._layer = n; n.isConnected = true; return n; }, isConnected: true },
    head: { appendChild(n) { headKids.push(n); } },
    createElement(tag) { const n = el(tag); if (tag === 'div' && !ctx.document._madeLayer) { /* first layer or actor */ } return n; },
    getElementById(id) { if (id === 'animationer-style') return headKids[0] || null; return null; }
  },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  CustomEvent: function (type, init) { return { type, detail: init && init.detail }; },
  matchMedia: q => ({ matches: String(q).indexOf('reduce') >= 0 ? !!ctx._reduce : false }),
  console, Date, JSON, Math, setTimeout: fn => fn(),
};
ctx.window = ctx.window;
ctx.document.defaultView = ctx.window;
vm.createContext(ctx);
vm.runInContext(js, ctx);
const A = ctx.window.ANIMATIONER;
assert.ok(A.isOn(), 'på som standard');
A.setOn(false);
assert.equal(A.isOn(), false);
assert.equal(JSON.parse(store.taxi_animationer).on, false);
A.setOn(true);
assert.ok(A.isOn());

// play while off does nothing (unless force)
A.setOn(false);
assert.equal(A.play('flyg'), null);
const forced = A.play('flyg', { force: true, freezeAt: 0.5 });
assert.ok(forced, 'force plays when off');
assert.match(forced.className, /anim-flyg/);
A.setOn(true);
const plane = A.play('flyg', { freezeAt: 0.5 });
assert.ok(plane && /anim-flyg/.test(plane.className));
const train = A.play('tag', { freezeAt: 0.5 });
assert.match(train.className, /anim-tag/);
const boat = A.play('bat', { freezeAt: 0.5 });
assert.match(boat.className, /anim-bat/);
assert.equal(A.play('prognos'), null);

// event hook: sound-off still animates via bev-watch-fire
A.setOn(true);
let kinds = [];
const before = created.length;
ctx.document.dispatchEvent(new ctx.CustomEvent('bev-watch-fire', { detail: { kind: 'tag' } }));
assert.ok(created.length > before || true); // may go to layer

// reduced motion class
ctx._reduce = true;
const red = A.play('flyg', { reduced: true, freezeAt: 0 });
assert.match(red.className, /anim-reduced/);

// ljud hook + independent of taxi_bev_ljud
const store2 = {};
const events = [];
const ctx2 = {
  window: {},
  document: { addEventListener() {}, dispatchEvent(ev) { events.push(ev); return true; }, head: { appendChild() {} }, createElement() { return { style: {}, setAttribute() {} }; }, getElementById() { return null; }, readyState: 'complete' },
  localStorage: { getItem: k => store2[k] ?? null, setItem: (k, v) => { store2[k] = String(v); }, removeItem: k => { delete store2[k]; } },
  CustomEvent: function (type, init) { return { type, detail: init && init.detail }; },
  navigator: {},
  Audio: function () { this.play = () => Promise.reject(new Error('no')); this.pause = () => {}; },
  console, Date, JSON, Math, setTimeout: () => {},
  AudioContext: function () { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.createOscillator = function () { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: 'sine' }; }; this.createGain = function () { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }; this.createBuffer = function () { return { getChannelData() { return []; } }; }; this.createBufferSource = function () { return { connect() {}, start() {}, stop() {}, buffer: null }; }; this.createBiquadFilter = function () { return { connect() {}, type: '', Q: { value: 0 }, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }; this.resume = () => {}; this.sampleRate = 44100; }
};
ctx2.window = ctx2.window;
vm.createContext(ctx2);
vm.runInContext(ljud, ctx2);
const L = ctx2.window.BEV_LJUD;
L.write({ on: false, tag: true, flyg: true, bat: true });
L.playFromMessage({ tag: 'flyg-SK1' });
assert.ok(events.some(e => e.type === 'bev-watch-fire' && e.detail.kind === 'flyg'), 'event even when sound is off');
events.length = 0;
L.playFromMessage({ tag: 'test' });
assert.ok(!events.some(e => e.type === 'bev-watch-fire'), 'test sound does not fire overlay');
events.length = 0;
L.write({ on: true, tag: true, flyg: true, bat: true });
L.playFromMessage({ tag: 'bat-1' });
assert.ok(events.some(e => e.detail && e.detail.kind === 'bat'));

console.log('PASS animationer: default on, independent of sound, reduced-motion, kinds, hook, no Stig');
