'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const stageSrc = fs.readFileSync(path.join(root, 'TaxiData/hb-stage.js'), 'utf8');
const botSrc = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'TaxiData/sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');

assert.match(sw, /CACHE_VER = '20261123adv5'/);
assert.match(html, /hb-stage\.js\?v=20261123adv5/);
assert.match(lv, /hjalpbot\.js\?v=20261123adv5/);
assert.doesNotMatch(stageSrc + botSrc, /\bStig\b|\bhen\b/);

// Stage stays hidden off the start screen, and place() must not un-hide it.
assert.match(stageSrc, /if \(dv && !dv\.classList\.contains\('hidden'\)\) return false;/);
assert.match(stageSrc, /if \(window\.NAV_VIEW\(\)\) return false;/);
assert.match(stageSrc, /function place\(force\) \{\s*if \(!isHome\(\) \|\| charId\(\) === 'off'\) \{ hide\(\); return null; \}/);

// Körpassdata skips renderMenu; hide the stage immediately when opening it.
assert.match(html, /dashboard-view'\)\.classList\.remove\('hidden'\);\s*navPush\('kordata', opts\);\s*if \(window\.HB_STAGE && HB_STAGE\.sync\) HB_STAGE\.sync\(\);\s*if \(window\.HJALPBOT && HJALPBOT\.tick\) HJALPBOT\.tick\(\);/);

// Bot page() must use NAV_VIEW so Lönekoll/Topplistor/Prognos are not mistaken for hem.
assert.match(botSrc, /if \(typeof window\.NAV_VIEW === 'function'\)/);
assert.match(botSrc, /if \(app\.classList && !app\.classList\.contains\('is-home'\)\) return null;/);
assert.match(botSrc, /if \(c === 'off' \|\| page\(\) !== 'hem'\)/);
assert.match(botSrc, /var stationOn = on && page\(\) === 'hem';/);
assert.match(botSrc, /if \(page\(\) !== 'hem'\) return null;/);
assert.match(botSrc, /followedInto\(p\)/);
assert.match(botSrc, /function hopOutThroughHome/);
assert.match(botSrc, /if \(el\.station\) \{\s*el\.station\.style\.display = 'none';\s*el\.station\.classList\.add\('hb-hidden'\);/);

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
    _s: { taxi_driver: '900001', hb_char_900001: opts.char || 'robot' },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); }
  };
  const headerR = { left: 0, top: 0, right: vw, bottom: 56, width: vw, height: 56 };
  const dotsR = { left: vw / 2 - 35, top: vh - 62, right: vw / 2 + 35, bottom: vh - 8, width: 70, height: 54 };
  const header = node({ getBoundingClientRect: () => headerR });
  const dots = node({ id: 'td-dots', getBoundingClientRect: () => dotsR, style: { display: '' } });
  const isHomeCls = opts.isHome !== false;
  const app = node({
    classList: { contains: k => k === 'is-home' && isHomeCls, add() {}, remove() {} },
    style: { display: opts.appDisplay != null ? opts.appDisplay : '' },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  });
  const dashHidden = { hidden: !opts.dashboardVisible };
  const dashboard = node({
    id: 'dashboard-view',
    classList: {
      add(k) { dashHidden[k] = true; },
      remove(k) { delete dashHidden[k]; },
      contains(k) { return !!dashHidden[k]; }
    }
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
      if (id === 'dashboard-view') return opts.withDashboard || opts.dashboardVisible ? dashboard : null;
      if (id === 'animationer-vader-plats') return null;
      if (id === 'profile-menu') return null;
      if (id === 'login-screen') return null;
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
  const win = {
    addEventListener() {},
    innerWidth: vw, innerHeight: vh,
    LAZY: { ensure(id) { win._ensured = win._ensured || []; win._ensured.push(id); return Promise.resolve(); } }
  };
  if (opts.navView !== undefined) win.NAV_VIEW = function () { return opts.navView; };
  win.window = win;
  const ctx = { window: win, document: doc, localStorage: ls, console, setTimeout() { return 0; }, clearTimeout() {}, LAZY: win.LAZY };
  vm.createContext(ctx);
  vm.runInContext(stageSrc, ctx);
  const S = ctx.window.HB_STAGE;
  S.render();
  return { S, host, ls, win, ctx, app };
}

const home = boot();
assert.ok(home.S.room(), 'stationen saknas på hemskärmen');
assert.ok(!home.host.classList.contains('hb-hidden'), 'stationen dold på hemskärmen');

function assertHidden(label, env) {
  assert.equal(env.S.room(), null, label + ': room() skulle vara null');
  assert.ok(env.host.classList.contains('hb-hidden') || !env.host.innerHTML, label + ': #hb-stage syns');
  env.S.place(true);
  assert.equal(env.S.room(), null, label + ': place() visade stationen igen');
  assert.ok(env.host.classList.contains('hb-hidden') || !env.host.innerHTML, label + ': place() tog bort hb-hidden');
}

assertHidden('Körpassdata', boot({ dashboardVisible: true, appDisplay: 'none' }));
assertHidden('Lönekoll via NAV_VIEW', boot({ navView: 'lonekoll', isHome: false }));
assertHidden('Topplistor via NAV_VIEW', boot({ navView: 'topplistor', isHome: false }));
assertHidden('Prognos via NAV_VIEW', boot({ navView: 'prognos', isHome: false }));
assertHidden('Körpassdata med kvarvarande is-home', boot({ dashboardVisible: true, isHome: true, appDisplay: 'none' }));

// Still visible after a resize-like place() on home
const stay = boot();
stay.S.place(true);
assert.ok(stay.S.room(), 'place() på hem dolde stationen');
assert.ok(!stay.host.classList.contains('hb-hidden'), 'place() på hem dolde #hb-stage');

// Taxi and makeup table also hide off home
for (const c of ['chauffor', 'diva']) {
  assertHidden(c + ' på Lönekoll', boot({ char: c, navView: 'lonekoll', isHome: false }));
  const h = boot({ char: c });
  assert.ok(h.S.room(), c + ' saknas på hem');
}

console.log('HB_STATION_HEM_OK');
