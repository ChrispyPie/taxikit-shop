'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalpbot.js'), 'utf8');
assert.doesNotMatch(src, /function coolSvg|name: 'Cool'|hb-dummy-arm/);
assert.match(src, /c === 'cool'/);
assert.match(src, /hb-shades/);
assert.match(src, /pappaskämt/);
function node() {
  return {
    style: {}, className: '', id: '', innerHTML: '', textContent: '',
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    setAttribute(){}, getAttribute(){ return null; }, appendChild(){ return this; },
    addEventListener(){}, querySelector(){ return node(); }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { left:0, top:0, right:40, bottom:40, width:40, height:40 }; },
    offsetHeight: 0
  };
}
const ls = { _s: { taxi_driver: '900001', hb_char_900001: 'cool' }, getItem(k){ return Object.prototype.hasOwnProperty.call(this._s,k) ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
const documentStub = Object.assign(node(), {
  getElementById(){ return null; },
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  createElement(){ return node(); },
  head: node(), body: node(),
  readyState: 'complete',
  documentElement: { style: { setProperty(){} } }
});
const windowObj = {
  addEventListener(){}, driverData: {}, HJALPBOT: undefined,
  ANIMATIONER: { isOn(){ return true; } },
  matchMedia(){ return { matches: false, addEventListener(){} }; },
  innerWidth: 412, innerHeight: 780
};
windowObj.window = windowObj;
const ctx = {
  window: windowObj, document: documentStub, localStorage: ls,
  sessionStorage: { getItem(){ return null; }, setItem(){} },
  fetch(){ return Promise.resolve({ ok:false, text:()=>Promise.resolve('') }); },
  addEventListener(){}, console, setTimeout, clearTimeout, setInterval, clearInterval,
  MutationObserver: function(){ return { observe(){}, disconnect(){} }; }
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const H = ctx.window.HJALPBOT;
assert.ok(H && H.chars);
assert.ok(H.chars.robot && H.chars.chauffor && H.chars.diva);
assert.ok(!H.chars.cool);
assert.equal(ls.getItem('hb_char_900001'), 'robot');
assert.deepEqual(Object.keys(H.chars).sort(), ['chauffor','diva','robot']);
console.log('UNIT_OK chars', Object.keys(H.chars).join(','));

// ---------- stationen som viloläge, unik per figur, undviker ikoner och sidprickar (2026-11-14ladd1) ----------
const root = path.resolve(__dirname, '../..');
const index = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lazy = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');

assert.match(src, /function stationSvg/);
assert.match(src, /hb-batt-fill/);
assert.match(src, /id === 'diva'/);
assert.match(src, /id === 'chauffor'/);
assert.match(src, /id === 'robot'/);
function stationFn() {
  const a = src.indexOf('function stationSvg(');
  const b = src.indexOf('function stationObstacles(', a);
  assert.ok(a >= 0 && b > a, 'stationSvg-block saknas');
  return src.slice(a, b);
}
const stSvg = stationFn();
assert.match(stSvg, /hb-batt-fill/);
assert.match(stSvg, /#2a3340|#3a4554/);
assert.match(stSvg, /ellipse/);
assert.match(stSvg, /#e11d48/);
assert.match(stSvg, /circle cx="50"/);
assert.match(stSvg, /#7dd3fc/);

assert.match(src, /prefers-reduced-motion/);
assert.match(src, /if \(!atStation\(\)\) \{ goToStation\(\); return; \}/);
assert.match(src, /if \(!atPerch\(\)\)/);
assert.match(src, /returnToPerch\(function \(\) \{ if \(gen === state\.sayGen\) showSay\(text, opt\); \}\)/);
assert.doesNotMatch(src, /function pickWalkTarget/);
assert.match(index, /hjalpbot\.js\?v=20261114ladd1/);
assert.match(lazy, /changelog\.js\?v=20261114ladd1/);
assert.match(changelog, /id: '2026-11-14ladd1'/);
assert.ok(changelog.indexOf("'2026-11-14ladd1'") < changelog.indexOf("'2026-11-14sidor1'"), 'nyheten överst');
const block = changelog.split("id: '2026-11-14ladd1'")[1].split(']},')[0];
assert.doesNotMatch(block, /\btid:/, 'ingen tid före kör live');
assert.doesNotMatch(src + block, /\bStig\b|\bhen\b/);
assert.match(src, /laddstation/);
assert.match(src, /sminkbordet/);

function body(name) {
  const a = src.indexOf('function ' + name + '(');
  assert.ok(a >= 0, 'saknar ' + name);
  let i = src.indexOf('{', a), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(a, i + 1);
  }
  throw new Error('obalanserad ' + name);
}
assert.match(body('stationRoom'), /td-dots/);
assert.match(body('reserveBottom'), /td-dots/);
assert.match(body('show'), /standAtStation\(room, charId\(\)\) \|\| perchSpot\(\)/);
assert.doesNotMatch(body('arriveHome'), /returnToPerch/);

function rect(l, t, w, h) { return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h, x: l, y: t }; }
function overlaps(a, b) { return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t; }

function runLayout(opts) {
  opts = opts || {};
  const vw = opts.vw || 412, vh = opts.vh || 780, cols = opts.cols || 4;
  const nItems = opts.nItems == null ? 8 : opts.nItems;
  const W = opts.iconW || 90, H = opts.iconH || 72, withDots = opts.dots !== false;
  const items = [];
  for (let i = 0; i < nItems; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const R = rect(10 + c * (W + 4), 63 + r * (H + 6), W, H);
    const self = {
      r: R, style: { display: '' },
      classList: { contains: k => k === 'icon' },
      getBoundingClientRect: () => R,
      getAttribute: () => 'm' + i,
      closest: () => self,
      querySelector: () => ({ getBoundingClientRect: () => rect(R.left + 25, R.top + 4, 40, 34), closest: () => self, style: { display: '' } })
    };
    items.push(self);
  }
  const last = items.length ? items[items.length - 1].r : rect(10, 63, 0, 0);
  const gridR = rect(10, 63, Math.max(1, cols) * (W + 4), Math.max(0, last.bottom - 63));
  const grid = {
    children: items,
    classList: { contains: k => k === 'grid' },
    getBoundingClientRect: () => gridR,
    querySelectorAll: sel => (sel.indexOf('.icon') >= 0 || sel.indexOf('.td-folder') >= 0 || sel.indexOf('.td-slot') >= 0 ? items : []),
    style: { display: '' }
  };
  const header = { getBoundingClientRect: () => rect(0, 0, vw, 56), style: { display: '' }, classList: { contains() { return false; } } };
  const dotsW = 70, dotsH = 54;
  const dotsR = rect(Math.round(vw / 2 - dotsW / 2), vh - 8 - dotsH, dotsW, dotsH);
  const dots = withDots ? {
    id: 'td-dots', style: { display: '' }, classList: { contains() { return false; } },
    getBoundingClientRect: () => dotsR
  } : null;
  function empty() {
    return { style: { setProperty() {}, display: '', transform: '' }, className: '', id: '', innerHTML: '', textContent: '',
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      setAttribute() {}, getAttribute() { return null; }, appendChild() { return this; }, addEventListener() {},
      querySelector() { return empty(); }, querySelectorAll() { return []; },
      getBoundingClientRect() { return rect(0, 0, 0, 0); }, offsetHeight: 0 };
  }
  const content = {
    style: { display: '' },
    classList: { contains() { return false; } },
    getBoundingClientRect: () => gridR,
    querySelector: sel => (sel.indexOf('.grid') >= 0 ? grid : null),
    querySelectorAll: sel => {
      if (sel.indexOf('.grid') >= 0 && sel.indexOf('.icon') < 0 && sel.indexOf('.td-') < 0) return [grid];
      if (sel.indexOf('.icon') >= 0 || sel.indexOf('.td-folder') >= 0 || sel.indexOf('.td-slot') >= 0) return items;
      return [];
    }
  };
  const app = Object.assign(empty(), {
    classList: { contains: k => k === 'is-home', add() {}, remove() {} },
    querySelector: sel => (sel.indexOf('#content') >= 0 || sel === '#content' ? content : (sel.indexOf('.grid') >= 0 ? grid : (sel.indexOf('header') >= 0 ? header : null))),
    querySelectorAll: sel => (sel.indexOf('.icon') >= 0 || sel.indexOf('.td-folder') >= 0 ? items : (sel.indexOf('.grid') >= 0 ? [grid] : []))
  });
  const qAll = sel => {
    if (sel.indexOf('td-dots') >= 0 || sel.indexOf('#td-dots') >= 0) return dots ? [dots] : [];
    if (sel.indexOf('.icon .emoji') >= 0) return items.map(n => n.querySelector());
    if (sel.indexOf('.icon') >= 0 || sel.indexOf('.td-folder') >= 0 || sel.indexOf('.td-slot') >= 0) return items;
    if (sel.indexOf('.grid') >= 0) return [grid];
    return [];
  };
  const qOne = sel => {
    if (sel.indexOf('td-sida') >= 0) return null;
    if (sel === '#app.is-home #content' || sel === '#content') return content;
    if (sel === '#app.is-home' || sel === '#app') return app;
    if (sel.indexOf('.grid') >= 0 && sel.indexOf('.icon') < 0) return grid;
    if (sel.indexOf('header') >= 0) return header;
    if (sel.indexOf('td-dots') >= 0) return dots;
    return null;
  };
  const doc = Object.assign(empty(), {
    getElementById: id => (id === 'app' ? app : id === 'td-dots' ? dots : id === 'content' ? content : id === 'animationer-vader-plats' ? null : null),
    querySelector: qOne,
    querySelectorAll: qAll,
    createElement: () => empty(), head: empty(), body: empty(), readyState: 'complete',
    documentElement: { style: { setProperty() {} } }
  });
  const ls2 = { _s: { taxi_driver: '900001', hb_char_900001: opts.char || 'robot' }, getItem(k) { return this._s[k] == null ? null : this._s[k]; }, setItem(k, v) { this._s[k] = String(v); }, removeItem() {} };
  const win = { addEventListener() {}, driverData: {}, ANIMATIONER: { isOn() { return true; } },
    matchMedia() { return { matches: !!opts.reduce, addEventListener() {} }; }, innerWidth: vw, innerHeight: vh };
  win.window = win;
  const ctx = { window: win, document: doc, localStorage: ls2, sessionStorage: { getItem() { return null; }, setItem() {} },
    console, setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    MutationObserver: function () { return { observe() {} }; } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const HB = ctx.window.HJALPBOT;
  return { station: HB._station(), stand: HB._stand(), perch: HB._perch(), reserve: HB._reserveBottom(), dots: dotsR, items, last, vw, vh, HB };
}

function boxOf(st) { return { l: st.x, t: st.y, r: st.x + 96, b: st.y + 56 }; }
function iconBoxes(items) { return items.map(n => ({ l: n.r.left - 4, t: n.r.top - 4, r: n.r.right + 4, b: n.r.bottom + 4 })); }

// telefon 4 i bredd: stationen finns, täcker inte prickar eller ikoner
let L = runLayout({ cols: 4, nItems: 8, vw: 412, vh: 780 });
assert.ok(L.station, 'station saknas ' + JSON.stringify(L.station));
assert.ok(L.stand, 'ståplats saknas');
assert.ok(L.reserve > 8, 'reserverar yta för prickarna ' + L.reserve);
{
  const box = boxOf(L.station);
  const dotsBox = { l: L.dots.left - 8, t: L.dots.top - 8, r: L.dots.right + 8, b: L.dots.bottom + 8 };
  assert.ok(!overlaps(box, dotsBox), 'stationen täcker sidprickarna ' + JSON.stringify({ box, dotsBox }));
  iconBoxes(L.items).forEach((ib, i) => {
    assert.ok(!overlaps(box, ib), 'stationen täcker ikon ' + i + JSON.stringify({ box, ib }));
  });
  const char = { l: L.stand.x, t: L.stand.y, r: L.stand.x + 40, b: L.stand.y + 40 };
  assert.ok(!overlaps(char, dotsBox), 'figuren täcker sidprickarna ' + JSON.stringify({ char, dotsBox }));
}
// sittplatsen för prat ligger ovanför prickarna
assert.ok(L.perch.y + 40 <= L.dots.top + 0.5, 'sittplatsen hamnar på prickarna ' + JSON.stringify({ perch: L.perch, dots: L.dots }));

// smal telefon (320): fortfarande plats bredvid prickarna, ingen överlappning
L = runLayout({ cols: 4, nItems: 8, vw: 320, vh: 640, iconW: 70, iconH: 64 });
assert.ok(L.station, 'ingen station på 320');
{
  const box = boxOf(L.station);
  const dotsBox = { l: L.dots.left - 6, t: L.dots.top - 6, r: L.dots.right + 6, b: L.dots.bottom + 6 };
  assert.ok(!overlaps(box, dotsBox), '320: stationen täcker prickarna ' + JSON.stringify({ box, dots: L.dots }));
  iconBoxes(L.items).forEach((ib, i) => {
    assert.ok(!overlaps(box, ib), '320: stationen täcker ikon ' + i);
  });
}

// stora ikoner, 4 i bredd, fler rader: fortfarande inte på ikoner/prickar
L = runLayout({ cols: 4, nItems: 12, vw: 412, vh: 780, iconW: 96, iconH: 88 });
assert.ok(L.station, 'ingen station med stora ikoner');
{
  const box = boxOf(L.station);
  const dotsBox = { l: L.dots.left - 8, t: L.dots.top - 8, r: L.dots.right + 8, b: L.dots.bottom + 8 };
  assert.ok(!overlaps(box, dotsBox), 'stora ikoner: täcker prickarna');
  iconBoxes(L.items).forEach((ib, i) => {
    assert.ok(!overlaps(box, ib), 'stora ikoner: täcker ikon ' + i);
  });
}

// varje figur har en egen ståplats vid sin station
const stands = ['robot', 'diva', 'chauffor'].map(c => {
  const r = runLayout({ char: c, cols: 4, nItems: 8, vw: 412, vh: 780 });
  assert.ok(r.station && r.stand, 'saknar station för ' + c);
  return { c, stand: r.stand, station: r.station };
});
assert.ok(stands[0].stand.x !== stands[1].stand.x || stands[0].stand.y !== stands[1].stand.y, 'robot och diva samma ståplats');
assert.ok(stands[0].stand.x !== stands[2].stand.x || stands[0].stand.y !== stands[2].stand.y, 'robot och chaufför samma ståplats');

// utan sidprickar: stationen finns ändå längst ner till höger
L = runLayout({ dots: false, cols: 3, nItems: 6, vw: 412, vh: 780 });
assert.ok(L.station, 'station saknas utan prickar');
assert.equal(L.reserve, 8);
assert.ok(L.station.x > 200, 'förväntad höger sida ' + JSON.stringify(L.station));

console.log('UNIT_OK station', 'room=' + JSON.stringify(stands[0].station));
process.exit(0);
