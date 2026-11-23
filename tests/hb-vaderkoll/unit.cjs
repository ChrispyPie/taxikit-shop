'use strict';
// Enhetstest: väderkollen fungerar oavsett var Väder-ikonen ligger (2026-11-14 vkoll1).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot.js'), 'utf8');
const scen = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot-scenarier.js'), 'utf8');
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

// lookup kräver inte längre .grid (mappar och applådan ligger utanför rutnätet)
assert.doesNotMatch(body('iconNode'), /\.grid /);
assert.match(body('iconNode'), /querySelectorAll\('\.icon\[data-tool="/);
assert.match(body('iconNode'), /iconIsOnScreen/);
assert.match(body('iconIsOnScreen'), /#td-mapp-forrad/);
assert.match(body('iconIsOnScreen'), /\.td-lada/);
assert.match(body('iconIsOnScreen'), /#td-mapp/);
assert.match(body('iconIsOnScreen'), /\.td-sida/);
assert.match(body('iconIsOnScreen'), /td-vis/);
assert.match(body('iconIsOnScreen'), /getBoundingClientRect/);

// syns inte ikonen, eller saknas replik: prata från sittplatsen (ingen tyst promenad)
const visit = body('visitIcon');
assert.ok(visit.indexOf('iconNode(tool)') < visit.indexOf('speakHit'));
assert.match(visit, /if \(!node \|\| !el\.walker \|\| !canWalk\(\)\) return speakHit\(hit, tool\);/);
assert.match(visit, /if \(!hit \|\| !hit\.text\) return speakHit\(hit, tool\);/);
assert.ok(visit.indexOf('speakHit') < visit.indexOf('sweepTo(dest'), 'ingen svepning innan ikon och replik är klara');
assert.match(body('speakHit'), /if \(!hit \|\| !hit\.text\) \{ scheduleWander\(\); return false; \}/);
assert.match(body('speakHit'), /say\(hit\.text/);
const demo = body('runDemoTrip');
assert.match(demo, /visitIcon\(d\.tool, hit\)/);
assert.doesNotMatch(demo, /if \(!iconNode/);
assert.match(src, /Ligger ikonen i en mapp, på en annan sida eller bara i applådan stannar den på sin vanliga plats och pratar där/);

// cache och nyhet, utan tid (sätts vid live)
assert.match(lazy, /hjalpbot\.js\?v=20261123adv4/);
assert.match(lazy, /hjalpbot-scenarier\.js\?v=20261122zdelad1/);
assert.match(index, /lazy-views\.js\?v=20261123adv4/);
assert.match(lazy, /changelog\.js\?v=20261123adv4/);
assert.match(changelog, /id: '2026-11-14vkoll1'/);
assert.match(changelog.split("id: '2026-11-14vkoll1'")[1].split('rader:')[0], /tid: '21:03'/);
assert.ok(changelog.indexOf("'2026-11-14vkoll1'") < changelog.indexOf("'2026-11-14bil1'"), 'nyheten överst');
const block = changelog.split("id: '2026-11-14vkoll1'")[1].split(']},')[0];
assert.match(block, /väderkollen/i);
assert.match(block, /mapp/);
assert.match(block, /applådan|sida/);
assert.doesNotMatch(src + scen + changelog, /\bStig\b/);
assert.doesNotMatch(block, /\bhen\b/);
assert.match(scen, /id: 'vader-annat'/);

function rect(l, t, w, h) {
  return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h, x: l, y: t };
}
function node() {
  return {
    style: { setProperty() {}, display: '' }, className: '', innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    setAttribute() {}, getAttribute() { return null; }, appendChild() { return this; },
    addEventListener() {}, querySelector() { return node(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return rect(0, 0, 0, 0); }, offsetHeight: 0, closest() { return null; }
  };
}

function makeEmoji(opts) {
  const r = opts.rect;
  const ancestors = opts.ancestors || [];
  function closest(sel) {
    for (const a of ancestors) {
      if (sel.charAt(0) === '#' && a.id === sel.slice(1)) return a;
      if (sel.charAt(0) === '.') {
        const cls = (a.className || '') + ' ' + ((a.classList && a.classList._n) || '');
        if (cls.split(/\s+/).includes(sel.slice(1))) return a;
      }
    }
    return null;
  }
  const emoji = {
    className: 'emoji',
    closest,
    getBoundingClientRect() { return r; }
  };
  const icon = {
    className: 'icon',
    getAttribute(n) { return n === 'data-tool' ? opts.tool : null; },
    querySelector(s) { return String(s).indexOf('emoji') >= 0 ? emoji : null; },
    closest,
    getBoundingClientRect() { return r; }
  };
  emoji._icon = icon;
  return emoji;
}

function load(emojis) {
  const doc = Object.assign(node(), {
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(sel) {
      const m = String(sel).match(/\.icon\[data-tool="([^"]+)"\] \.emoji/);
      if (m) return emojis.filter(e => e._icon.getAttribute('data-tool') === m[1]);
      if (String(sel).indexOf('.icon[data-tool]') >= 0) return emojis.map(e => e._icon);
      return [];
    },
    createElement: () => node(), head: node(), body: node(), readyState: 'complete',
    documentElement: { style: { setProperty() {} } }
  });
  const ls = {
    _s: { taxi_driver: '900001', hb_char_900001: 'robot' },
    getItem(k) { return this._s[k] == null ? null : this._s[k]; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem() {}
  };
  const win = {
    addEventListener() {}, driverData: {}, ANIMATIONER: { isOn() { return true; } },
    matchMedia() { return { matches: false, addEventListener() {} }; },
    innerWidth: 412, innerHeight: 780
  };
  win.window = win;
  const ctx = {
    window: win, document: doc, localStorage: ls,
    sessionStorage: { getItem() { return null; }, setItem() {} },
    console, setTimeout() { return 0; }, clearTimeout() {},
    setInterval() { return 0; }, clearInterval() {},
    MutationObserver: function () { return { observe() {} }; }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.HJALPBOT;
}

const onScreen = makeEmoji({
  tool: 'vader',
  rect: rect(16, 80, 48, 48)
});
const moved = makeEmoji({
  tool: 'vader',
  rect: rect(280, 420, 48, 48)
});
const inFolder = makeEmoji({
  tool: 'vader',
  rect: rect(40, 200, 48, 48),
  ancestors: [{ id: 'td-mapp-forrad', className: '' }]
});
const inOpenFolder = makeEmoji({
  tool: 'vader',
  rect: rect(80, 200, 48, 48),
  ancestors: [{ id: 'td-mapp', className: 'td-mapp' }]
});
const otherPage = makeEmoji({
  tool: 'vader',
  rect: rect(500, 80, 48, 48),
  ancestors: [{ id: '', className: 'td-sida td-extra-grid', classList: { contains(k) { return k !== 'td-vis'; }, _n: 'td-sida' } }]
});
const otherPageHiddenClass = makeEmoji({
  tool: 'vader',
  rect: rect(20, 80, 48, 48),
  ancestors: [{ id: '', className: 'td-sida', classList: { contains(k) { return false; }, _n: 'td-sida' } }]
});
const inDrawer = makeEmoji({
  tool: 'vader',
  rect: rect(20, 200, 48, 48),
  ancestors: [{ id: '', className: 'td-lada', classList: { contains(k) { return k === 'td-lada'; }, _n: 'td-lada' } }]
});
const visibleOnPage = makeEmoji({
  tool: 'vader',
  rect: rect(20, 80, 48, 48),
  ancestors: [{ id: '', className: 'td-sida td-vis', classList: { contains(k) { return k === 'td-vis' || k === 'td-sida'; }, _n: 'td-sida td-vis' } }]
});

// flyttad men synlig på startskärmen: boten hittar ikonen och kan gå dit
let hb = load([moved]);
assert.equal(hb._iconNode('vader'), moved, 'flyttad synlig ikon hittas');
assert.equal(hb._iconOnScreen(moved), true);

// i stängd mapp: ingen promenad, prata från sittplatsen
hb = load([inFolder]);
assert.equal(hb._iconNode('vader'), null, 'ikon i mappförråd räknas inte som synlig');
assert.equal(hb._iconOnScreen(inFolder), false);

// öppen mappdialog: gå inte bakom overlayn
hb = load([inOpenFolder]);
assert.equal(hb._iconNode('vader'), null, 'ikon i öppen mapp är inte gångmål');
assert.equal(hb._iconOnScreen(inOpenFolder), false);

// annan hemsida (avsveppt / utan td-vis): prata från sittplatsen
hb = load([otherPage]);
assert.equal(hb._iconNode('vader'), null, 'avsveppt sida: ikonen är utanför skärmen');
assert.equal(hb._iconOnScreen(otherPage), false);
hb = load([otherPageHiddenClass]);
assert.equal(hb._iconNode('vader'), null, 'sida utan td-vis räknas inte som synlig');
assert.equal(hb._iconOnScreen(otherPageHiddenClass), false);

// inte på startskärmen, bara i applådan
hb = load([inDrawer]);
assert.equal(hb._iconNode('vader'), null, 'ikon enbart i applådan är inte synlig');
assert.equal(hb._iconOnScreen(inDrawer), false);

// borta från hemskärmen helt
hb = load([]);
assert.equal(hb._iconNode('vader'), null, 'ingen Väder-ikon i DOM');

// synlig på aktuell sida fortfarande fungerar
hb = load([visibleOnPage]);
assert.equal(hb._iconNode('vader'), visibleOnPage);
assert.equal(hb._iconOnScreen(visibleOnPage), true);

// om både förrådskopia och synlig ikon finns väljs den synliga
hb = load([inFolder, onScreen]);
assert.equal(hb._iconNode('vader'), onScreen, 'synlig kopia vinner över mappförrådet');

console.log('UNIT_OK');
