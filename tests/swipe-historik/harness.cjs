// Gemensam testmiljö: falsk window/history (som en webbläsare: popstate kommer asynkront) och appvyer.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../..');

function makeEnv(opts = {}) {
  const listeners = {};
  const docListeners = {};
  const ss = {};
  const queue = [];
  const hist = {
    entries: [{ state: opts.initialState === undefined ? null : opts.initialState }], i: 0,
    get length() { return this.entries.length; },
    get state() { return this.entries[this.i].state; },
    pushState(state) { this.entries.length = this.i + 1; this.entries.push({ state: clone(state) }); this.i++; },
    replaceState(state) { this.entries[this.i] = { state: clone(state) }; },
    back() { this.go(-1); },
    forward() { this.go(1); },
    go(n) { queue.push(n); }
  };
  function clone(s) { return s == null ? null : JSON.parse(JSON.stringify(s)); }
  function flush() {
    let guard = 0;
    while (queue.length && guard++ < 100) {
      const n = queue.shift();
      const to = hist.i + n;
      if (to < 0 || to >= hist.entries.length || n === 0) continue;
      hist.i = to;
      (listeners.popstate || []).forEach(f => f({ state: clone(hist.state) }));
    }
  }
  const els = {};
  const document = {
    head: { appendChild() {} },
    body: { appendChild(el) { els[el.id] = el; } },
    createElement() {
      return { id: '', style: {}, textContent: '', setAttribute() {}, classList: { add() {}, remove() {} } };
    },
    getElementById(id) { return els[id] || null; },
    addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); }
  };
  const win = {
    history: hist,
    innerWidth: 400,
    sessionStorage: {
      getItem: k => (k in ss ? ss[k] : null),
      setItem: (k, v) => { ss[k] = String(v); },
      removeItem: k => { delete ss[k]; }
    },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    document
  };
  const ctx = {
    window: win, document, history: hist,
    localStorage: { getItem: k => (k === 'taxi_session' ? 'x' : null), setItem() {}, removeItem() {} },
    getComputedStyle: () => ({ overflowX: 'visible', display: 'block' }),
    Math, JSON, String, Object, Array, console
  };
  win.window = win;
  vm.createContext(ctx);
  return { ctx, win, hist, flush, docListeners, listeners, ss };
}

function load(env, file) {
  vm.runInContext(fs.readFileSync(path.join(root, 'TaxiData', file), 'utf8'), env.ctx, { filename: file });
}

// Liten "app" som index.html: tryck = ny sida (NAV.push), popstate = NAV.handlePop.
function makeApp(env) {
  const app = { view: '', sub: {}, shown: [], subBackCalls: 0 };
  env.win.NAV_VIEW = () => app.view;
  load(env, 'nav-historik.js');
  const NAV = env.win.NAV;
  env.win.addEventListener('popstate', ev => {
    NAV.handlePop(ev.state, {
      notis: () => {
        if (app.notisSkip) { app.notisSkip = false; return true; }
        if (app.notisOpen) { app.notisOpen = false; return true; }
        return false;
      },
      locked: () => false,
      subBack: () => {
        if (app.sub[app.view]) { app.subBackCalls++; delete app.sub[app.view]; return true; }
        return false;
      },
      here: () => app.view,
      show: v => { app.view = v; app.shown.push(v); }
    });
  });
  app.tap = v => { app.view = v; NAV.push(v); };
  app.home = () => app.tap('');
  app.openSub = (name) => { app.sub[app.view] = name; env.hist.pushState({ view: app.view, sub: name }, ''); };
  app.openNotis = () => { app.notisOpen = true; env.hist.pushState({ notis: 1 }, ''); };
  app.closeNotis = () => { app.notisOpen = false; app.notisSkip = true; env.hist.back(); };
  app.back = () => { const ok = NAV.back(); env.flush(); return ok; };
  app.forward = () => { const ok = NAV.forward(); env.flush(); return ok; };
  return { app, NAV };
}

module.exports = { makeEnv, load, makeApp, root };
