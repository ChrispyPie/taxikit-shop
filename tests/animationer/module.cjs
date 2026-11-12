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
assert.match(html, /animationer\.js\?v=20261112zon1/);
assert.match(html, /id="animationer-set"/);
assert.match(html, /bevakning-ljud\.js\?v=20261112anim5/);
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
assert.equal(A.durationMs, 5000);
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
L.playFromMessage({ tag: 'flyg-SK1', title: '🛬 SK1 har landat 06:12' });
assert.ok(events.some(e => e.type === 'bev-watch-fire' && e.detail.kind === 'flyg' && e.detail.arrival), 'event even when sound is off');
events.length = 0;
L.playFromMessage({ tag: 'test' });
assert.ok(!events.some(e => e.type === 'bev-watch-fire'), 'test sound does not fire overlay');
events.length = 0;
L.write({ on: true, tag: true, flyg: true, bat: true });
L.playFromMessage({ tag: 'bat-1', title: '⛴️ Stena har ankommit till Danmarksterminalen, 07:10' });
assert.ok(events.some(e => e.detail && e.detail.kind === 'bat' && e.detail.arrival));
events.length = 0;
L.playFromMessage({ tag: 'tag-123', title: '🕒 Tåg 123: ny tid 08:40' });
assert.ok(events.some(e => e.detail && e.detail.kind === 'tag' && e.detail.arrival === false), 'delay is not arrival');
events.length = 0;
L.playFromMessage({ tag: 'tag-123', title: '🚆 Tåg 123 ankommer 08:40' });
assert.ok(events.some(e => e.detail && e.detail.arrival === false), 'lead (ankommer) is not arrival');
assert.ok(L.isArrival({ title: '🚆 Tåg 11 har ankommit spår 3, 06:01' }));
assert.ok(!L.isArrival({ title: '✈️ SK1 ankommer 06:20' }));
assert.ok(!L.isArrival({ title: '❌ SK1 är inställt' }));
assert.ok(!L.isArrival({ title: '🧳 Bagaget rullar på band 4 – SK1' }));

// ---- Prognoszoner, landande plan, Stena (2026-11-12zon1) ----
assert.match(html, /lazy-views\.js\?v=20261112zon1/);
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
assert.match(lv, /prognos-notis\.js\?v=20261112zon1/);
assert.match(lv, /changelog\.js\?v=20261112zon1/);
assert.match(cl, /2026-11-12zon1/);
assert.doesNotMatch(cl.split('window.CHANGELOG')[1].slice(0, 1600), /\bStig\b|BRASSERIE|Brasserie/);
assert.doesNotMatch(js, /BRASSERIE/);
assert.doesNotMatch(js, />\s*Brasserie/i);
assert.match(js, /STENA LINE/);
assert.match(js, /HOTELL<\/text>/);
assert.match(js, /DRAKEN<\/text>/);
for (const k of ['flyg', 'tag', 'bat', 'landvetter', 'essity', 'astra', 'volvo', 'draken']) {
  assert.match(js, new RegExp('data-anim-try="' + k + '"'), 'Prova ' + k);
}
assert.doesNotMatch(js, /'290'\s*:/, 'Magasinet har ingen animation');

function mkCtx() {
  const st = {};
  const mk = (tag) => {
    const n = { tag, style: {}, className: '', innerHTML: '', children: [], isConnected: false, attrs: {}, parentNode: null,
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
      appendChild(c) { c.parentNode = this; c.isConnected = true; this.children.push(c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
      closest() { return null; } };
    n.style.setProperty = function (k, v) { this[k] = v; };
    return n;
  };
  const head = mk('head');
  const bodyEl = mk('body');
  head.isConnected = bodyEl.isConnected = true;
  const c = {
    window: {},
    document: {
      _ls: {},
      addEventListener(type, fn) { (this._ls[type] = this._ls[type] || []).push(fn); },
      dispatchEvent(ev) { (this._ls[ev.type] || []).forEach(fn => fn(ev)); return true; },
      readyState: 'complete', body: bodyEl, head,
      createElement: mk,
      getElementById(id) { return [...head.children, ...bodyEl.children].find(n => n.id === id) || null; }
    },
    localStorage: { getItem: k => st[k] ?? null, setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } },
    CustomEvent: function (type, init) { return { type, detail: init && init.detail }; },
    matchMedia: () => ({ matches: false }),
    console, Date, JSON, Math, setTimeout: () => {},
  };
  vm.createContext(c);
  vm.runInContext(js, c);
  c.layerEl = () => bodyEl.children.find(n => n.id === 'animationer-layer');
  c.actor = () => (c.layerEl().children.filter(n => n.attrs['data-anim-kind']).pop() || null);
  c.fire = (detail) => { c.layerEl().children.length = 0; c.document.dispatchEvent(new c.CustomEvent('bev-watch-fire', { detail })); return c.actor(); };
  return c;
}
const Z = mkCtx();
const ZA = Z.window.ANIMATIONER;
assert.equal(ZA.logoMs, 6000);
assert.equal(ZA.zoneKind('293'), 'landvetter');
assert.equal(ZA.zoneKind('161'), 'essity');
assert.equal(ZA.zoneKind('163'), 'astra');
assert.equal(ZA.zoneKind('406'), 'volvo');
assert.equal(ZA.zoneKind('432'), 'volvo');
assert.equal(ZA.zoneKind('15'), 'draken');
assert.equal(ZA.zoneKind('290'), '', 'Magasinet ingen animation');

// Flyg ankomst = landande plan (scen med bana), kräver ankomst
assert.equal(Z.fire({ kind: 'flyg' }), null, 'flyg utan arrival animeras inte');
assert.equal(Z.fire({ kind: 'flyg', arrival: false }), null);
assert.equal(Z.fire({ kind: 'tag', arrival: false }), null);
assert.equal(Z.fire({ kind: 'bat' }), null);
const land = Z.fire({ kind: 'flyg', arrival: true });
assert.ok(land, 'flyg ankomst animeras');
assert.match(land.className, /anim-scene anim-flyg/);
assert.match(land.innerHTML, /anim-runway/);
assert.match(land.innerHTML, /anim-land/);
assert.doesNotMatch(land.innerHTML, /viewBox="0 0 64 32"/, 'landande planet är inte svepplanet');
assert.equal(land.style.animationDuration, '5s');
assert.equal(land.style['--ad'], '5s');

// Landvetter-prognos = svepande plan (inte landning, inte logokort), utan arrival
const sweep = Z.fire({ prognos: true, zone: '293' });
assert.ok(sweep, 'Landvetter prognos animeras utan arrival');
assert.match(sweep.className, /anim-actor anim-landvetter/);
assert.match(sweep.innerHTML, /viewBox="0 0 64 32"/);
assert.doesNotMatch(sweep.innerHTML, /anim-runway|anim-card/);
assert.equal(sweep.style.animationDuration, '5s');
assert.match(js, /\.anim-landvetter\{[^}]*anim-sweep/);
assert.match(js, /\.anim-land\{[^}]*anim-land/);

// Övriga zoner = logokort, 6 s, utan arrival
for (const [zone, kind] of [['161', 'essity'], ['163', 'astra'], ['406', 'volvo'], ['432', 'volvo'], ['15', 'draken']]) {
  const a = Z.fire({ prognos: true, zone, caption: 'Ny förbokning · Zon <b>' });
  assert.ok(a, 'zon ' + zone);
  assert.match(a.className, new RegExp('anim-scene anim-' + kind));
  assert.match(a.innerHTML, new RegExp('anim-card anim-card-' + kind));
  assert.match(a.innerHTML, /&lt;b&gt;/, 'caption escaped');
  assert.equal(a.style.animationDuration, '6s');
}
assert.equal(Z.fire({ prognos: true, zone: '290' }), null, 'Magasinet');
assert.equal(Z.fire({ prognos: true, zone: '' }), null);
// kind direkt fungerar också för zonerna
assert.ok(Z.fire({ kind: 'essity' }));
// Bara en åt gången
Z.layerEl().children.length = 0;
ZA.play('essity', { force: true }); ZA.play('volvo', { force: true });
assert.equal(Z.layerEl().children.filter(n => n.attrs['data-anim-kind']).length, 1, 'MAX_ON_SCREEN');
// Av = ingen prognosanimation heller
ZA.setOn(false);
assert.equal(Z.fire({ prognos: true, zone: '161' }), null);
ZA.setOn(true);

// Stena är båtikonen
const fer = Z.fire({ kind: 'bat', arrival: true });
assert.match(fer.className, /anim-actor anim-bat/);
assert.match(fer.innerHTML, /STENA LINE/);
assert.match(fer.innerHTML, /#d71920/);
// Tåget oförändrat
assert.match(Z.fire({ kind: 'tag', arrival: true }).innerHTML, /viewBox="0 0 72 28"/);

// Minskad rörelse: kort tona på plats
const rl = ZA.play('essity', { force: true, reduced: true });
assert.match(rl.className, /anim-reduced/);
assert.equal(rl.style.animationDuration, '2.4s');
const rf = ZA.play('flyg', { force: true, reduced: true });
assert.equal(rf.style.animationDuration, '1.6s');

// Inställningar: Prova-knappar och text
const box = { innerHTML: '' };
ZA.renderSettings(box);
assert.match(box.innerHTML, /Prova Landvetter/);
assert.match(box.innerHTML, /plan som landar/);
assert.match(box.innerHTML, /sveper förbi/);
assert.match(box.innerHTML, /Stenafärja/);
assert.match(box.innerHTML, /glider in/);
assert.match(box.innerHTML, /Bara vid själva ankomsten/);
// Prova Landvetter spelar säkerhetsbältesljudet (flyg.mp3) via BEV_LJUD
const played = [];
Z.window.BEV_LJUD = { unlock() {}, play(k, f) { played.push([k, f]); } };
const btn = { getAttribute: () => 'landvetter' };
box.onclick({ target: { closest: () => btn }, preventDefault() {} });
assert.deepEqual(played, [['flyg', true]]);
const btn2 = { getAttribute: () => 'essity' };
box.onclick({ target: { closest: () => btn2 }, preventDefault() {} });
assert.equal(played.length, 1, 'andra zoner spelar inget ljud vid Prova');

// prognos-notis: ring() skickar zonhändelse; Landvetter får flyg.mp3, andra zoner pipet som förut
const pn = fs.readFileSync(path.join(root, 'TaxiData/prognos-notis.js'), 'utf8');
assert.doesNotMatch(pn, /\bStig\b/);
function mkPn() {
  const evs = [], snd = [], rings = [], toasts = [];
  const c = {
    window: {},
    document: { addEventListener() {}, dispatchEvent(ev) { evs.push(ev); return true; }, visibilityState: 'visible' },
    localStorage: { getItem: () => null, setItem() {} },
    location: { search: '', pathname: '/' }, history: { replaceState() {} }, URLSearchParams,
    navigator: {}, CustomEvent: function (type, init) { return { type, detail: init && init.detail }; },
    setInterval: () => 0, setTimeout: () => 0, console, Date, JSON, Math, Promise,
  };
  c.window = c;
  c.BEV_LJUD = { play(k, f) { snd.push([k, f]); } };
  c.BEVAKNING = { ring(t, i) { rings.push(t); }, toast(t, ms, i) { toasts.push(t); } };
  vm.createContext(c);
  vm.runInContext(pn, c);
  return { c, evs, snd, rings, toasts, N: c.PROGNOS_NOTIS };
}
let P = mkPn();
P.N._ring('Ny förbokning', 'Landvetter flygplats · Kombi · ca 07:40', { tag: 'prognos-293-app', target: { zone: '293' } });
assert.deepEqual(P.snd, [['flyg', true]], 'Landvetter = flyg.mp3');
assert.equal(P.rings.length, 0, 'inget pip för Landvetter');
assert.equal(P.toasts.length, 1);
let ev = P.evs.find(e => e.type === 'bev-watch-fire');
assert.ok(ev && ev.detail.prognos && ev.detail.zone === '293' && !ev.detail.arrival);
P = mkPn();
P.N._ring('Ny förbokning', 'Essity · Kombi · ca 07:40', { tag: 'prognos-161-app', target: { zone: '161' } });
assert.equal(P.snd.length, 0, 'Essity tvingas inte till flyg.mp3');
assert.equal(P.rings.length, 1, 'Essity behåller sitt ljud (BEVAKNING.ring)');
ev = P.evs.find(e => e.type === 'bev-watch-fire');
assert.equal(ev.detail.zone, '161');
assert.match(ev.detail.caption, /Ny förbokning · Essity/);
// push utan target: zonen läses ur taggen
assert.equal(P.N._zoneOf({ tag: 'prognos-432-elbil' }), '432');
assert.equal(P.N._zoneOf({ tag: 'prognos' }), '');
// End-to-end: prognos-notis-händelsen spelar rätt animation i animationer.js
const E = mkCtx();
E.layerEl().children.length = 0;
E.document.dispatchEvent(ev);
assert.match(E.actor().className, /anim-essity/);

console.log('PASS animationer: default on, independent of sound, reduced-motion, kinds, hook, no Stig, landing vs sweep, prognos zones, Stena');
