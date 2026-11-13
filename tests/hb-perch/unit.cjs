'use strict';
// Enhetstest: hjälpboten pratar bara på sittplatsen efter sista ikonen (2026-11-12 bot1).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lazy = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');

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

// (a) bubblan visas bara på sittplatsen, utom när boten leder (tips med guide)
const say = body('say');
assert.match(say, /isLead\(opt\)/);
assert.match(say, /if \(!atPerch\(\)\)/);
assert.match(say, /returnToPerch\(function \(\) \{ if \(gen === state\.sayGen\) showSay\(text, opt\); \}\)/);
assert.ok(say.indexOf('isLead(opt)') < say.indexOf('if (!atPerch())'), 'ledning kontrolleras före sittplatsregeln');
// ledning: gå först, bubbla när boten är framme
assert.match(say, /state\.leadShow = function/);
assert.match(src, /if \(state\.leadShow\) state\.leadShow\(\);/);
// bubblor är fortfarande kortlivade (kortare än Berras)
assert.match(src, /var BUBBLE_MS = 8000;/);
assert.match(src, /var TIP_BUBBLE_MS = 30000;/);

// (b) väderresan: svep till ikon → in → ut → svep tillbaka → sittplats → prata
const visit = body('visitIcon');
const steps = ['svep-till-ikon', "'in'", "'ut'", 'svep-tillbaka', "'sittplats'", "'pratar'"];
let last = -1;
for (const st of steps) {
  const at = visit.indexOf(st);
  assert.ok(at > last, 'ordning: ' + st);
  last = at;
}
assert.ok(visit.indexOf('say(hit.text') > visit.indexOf("tripNote('sittplats')"), 'pratar först på sittplatsen');
assert.match(visit, /sweepTo\(dest,/);
assert.match(visit, /sweepTo\(perchSpot\(\),/);
assert.doesNotMatch(visit, /walkPath\(/, 'ingen långsam gång på resan');
assert.match(src, /SWEEP_MIN = 0\.45, SWEEP_MAX = 0\.9/);

// ingen fri vandring längre
assert.doesNotMatch(src, /function pickWalkTarget/);
assert.doesNotMatch(src, /function pickSpot/);
const wander = body('scheduleWander');
assert.match(wander, /if \(!atPerch\(\)\) \{ returnToPerch\(scheduleWander\); return; \}/);
assert.match(wander, /bubbleOn\(\) \|\| userBusy\(\)/);
assert.doesNotMatch(wander, /findPath|pickWalk/);
// stationen: tyst svep dit, tillbaka till sittplatsen efteråt
assert.match(body('goToStation'), /sweepTo\(stand,/);
assert.match(body('arriveHome'), /returnToPerch\(scheduleWander\)/);
// spontant prat väntar när föraren håller på
assert.match(body('maybeRandomComment'), /userBusy\(\)/);
assert.match(body('maybeTimeComment'), /userBusy\(\)/);
assert.match(body('tryIconVisit'), /userBusy\(\)/);

// (d) bubblan sitter fast i boten och undviker ikonerna
const place = body('placeChrome');
assert.match(place, /botRect\(\)/);
assert.match(place, /bubbleSpot\(/);
assert.doesNotMatch(place, /pos\.y - bh/, 'inte gamla målpositionen');
assert.match(body('botRect'), /el\.walker\.getBoundingClientRect\(\)/);
assert.match(body('bubbleSpot'), /side: 'above'[\s\S]*side: 'below'[\s\S]*side: 'left'[\s\S]*side: 'right'/);
assert.match(body('bubbleSpot'), /avoidRects\(\)/);
assert.match(body('showSay'), /followBubble\(\)/);
assert.match(src, /\.hb-bubble\[data-side="left"\]/);

// (e) hopp ut genom 🏠 och bara hemskärmen gäller fortfarande
const tick = body('tick');
assert.match(tick, /followedInto\(p\)/);
assert.match(tick, /hopOutThroughHome\(\)/);
assert.match(tick, /var on = charId\(\) !== 'off' && \(!!state\.preview \|\| p === 'hem'\);/);
assert.match(body('hopOutThroughHome'), /homeBtn\(\)/);
assert.match(src, /state\.enteredTool = id;\s*state\.enteredAt = Date\.now\(\);\s*window\.openItem\(id\);/);
// tryck: stänger bubbla, annars reaktion
assert.match(body('poke'), /if \(bubbleOn\(\)\) \{\s*hideBubble\(\);/);

// cache och nyheter
assert.match(index, /hjalpbot\.js\?v=20261112bot1/);
assert.match(lazy, /changelog\.js\?v=2026111[23](bot1|mapp1|ljud1|mod2|lasbar1|skroll1|chatt1)/);
assert.match(changelog, /id: '2026-11-12bot1'/);
assert.ok(changelog.indexOf("'2026-11-12bot1'") < changelog.indexOf("'2026-11-12zon2'"), 'överst');
assert.doesNotMatch(src + changelog.slice(0, 3000), /\bStig\b/);

// (c) sittplatsen räknas från sista ikonen (funktionellt, med påhittad DOM)
function rect(l, t, w, h) { return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h, x: l, y: t }; }
function run(nItems, vh, layout) {
  const cols = layout === 'lista' ? 1 : 3, W = layout === 'lista' ? 392 : 128, H = 64;
  const items = [];
  for (let i = 0; i < nItems; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const R = rect(10 + c * (W + 4), 63 + r * (H + 6), W, H);
    const isSlot = i === nItems - 1;
    items.push({
      r: R,
      classList: { contains: k => (isSlot ? k === 'td-slot-empty' : k === 'icon') },
      getBoundingClientRect: () => R,
      getAttribute: () => (isSlot ? null : 'm' + i),
      closest: () => null
    });
  }
  const gridR = rect(10, 63, 392, items.length ? items[items.length - 1].r.bottom - 63 : 0);
  const grid = { children: items, getBoundingClientRect: () => gridR };
  const header = { getBoundingClientRect: () => rect(0, 0, 412, 56) };
  const emo = items.map(n => ({ getBoundingClientRect: () => rect(n.r.left + 44, n.r.top + 4, 40, 34), closest: () => n }));
  function node() {
    return { style: { setProperty() {} }, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      setAttribute() {}, getAttribute() { return null; }, appendChild() { return this; }, addEventListener() {}, querySelector() { return node(); },
      querySelectorAll() { return []; }, getBoundingClientRect() { return rect(0, 0, 0, 0); }, offsetHeight: 0 };
  }
  const app = Object.assign(node(), { classList: { contains: k => k === 'is-home', add() {}, remove() {} } });
  const doc = Object.assign(node(), {
    getElementById: id => (id === 'app' ? app : null),
    querySelector: sel => (sel.indexOf('.grid') >= 0 && sel.indexOf('.icon') < 0 ? grid : (sel.indexOf('header') >= 0 ? header : null)),
    querySelectorAll: sel => (sel.indexOf('.icon .emoji') >= 0 ? emo : (sel.indexOf('.grid .icon,') >= 0 ? items : [])),
    createElement: () => node(), head: node(), body: node(), readyState: 'complete',
    documentElement: { style: { setProperty() {} } }
  });
  const ls = { _s: { taxi_driver: '900001', hb_char_900001: 'robot' }, getItem(k) { return this._s[k] == null ? null : this._s[k]; }, setItem(k, v) { this._s[k] = String(v); }, removeItem() {} };
  const win = { addEventListener() {}, driverData: {}, ANIMATIONER: { isOn() { return true; } },
    matchMedia() { return { matches: false, addEventListener() {} }; }, innerWidth: 412, innerHeight: vh };
  win.window = win;
  const ctx = { window: win, document: doc, localStorage: ls, sessionStorage: { getItem() { return null; }, setItem() {} },
    console, setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    MutationObserver: function () { return { observe() {} }; } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { perch: ctx.window.HJALPBOT._perch(), last: items[items.length - 1].r };
}
// full sista rad (11 ikoner + Moduler): under sista ikonen
let r = run(12, 780);
assert.equal(r.perch.at, 'under', JSON.stringify(r));
assert.ok(r.perch.y >= r.last.bottom && r.perch.y <= r.last.bottom + 12, JSON.stringify(r));
assert.ok(r.perch.x >= r.last.left && r.perch.x + 40 <= r.last.right, JSON.stringify(r));
// plats kvar i raden (10 + Moduler): direkt till höger om sista ikonen, samma rad
r = run(11, 780);
assert.equal(r.perch.at, 'rad', JSON.stringify(r));
assert.ok(r.perch.x >= r.last.right && r.perch.x <= r.last.right + 12, JSON.stringify(r));
assert.ok(r.perch.y + 40 <= r.last.bottom && r.perch.y + 40 > r.last.top, JSON.stringify(r));
// färre moduler (4 + Moduler): flyttar upp
const few = run(5, 780);
assert.ok(few.perch.y < run(12, 780).perch.y, 'färre moduler → högre upp');
// listläge: under raden, i högra änden
r = run(8, 780, 'lista');
assert.equal(r.perch.at, 'under', JSON.stringify(r));
assert.ok(r.perch.x > 300, JSON.stringify(r));
// rutnätet längre än skärmen: längst ner på skärmen, inte på en ikon
r = run(30, 600);
assert.equal(r.perch.at, 'botten', JSON.stringify(r));
assert.ok(r.perch.y + 40 <= 600 - 8 + 0.5, JSON.stringify(r));

console.log('UNIT_OK');
