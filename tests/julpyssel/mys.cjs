'use strict';
// Julpyssel mys: girlang, snö, vignett. Bara 710022, hemskärm, ingen Nyheter-rad, reduced-motion.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const js = fs.readFileSync(path.join(root, 'TaxiData/julpyssel.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'TaxiData/julpyssel.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'TaxiData/sw.js'), 'utf8');

assert.doesNotMatch(js + css + cl, /\bStig\b/);
assert.doesNotMatch(js + css, /\bhen\b/);
assert.doesNotMatch(cl, /id: '2026-11-23zmys1'/);
assert.doesNotMatch(cl, /girlang|julgransbelysning|snöfall|juldekoration/i);
assert.match(js, /ALLOW = \{ '710022': 1 \}/);
assert.match(js, /JUL_ALLA = false/);
assert.match(js, /function ensureMys/);
assert.match(js, /function paintMys/);
assert.match(js, /function girlangSvg/);
assert.match(js, /function snowHtml/);
assert.match(js, /jul-girlang/);
assert.match(js, /jul-vignette/);
assert.match(js, /jul-flinga/);
assert.match(js, /peppar|tomte/);
assert.match(css, /#jul-mys/);
assert.match(css, /#jul-girlang/);
assert.match(css, /pointer-events:\s*none/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /jul-fall/);
assert.match(css, /html:not\(\[data-theme="dark"\]\) #jul-mys \.jul-vignette/);
assert.match(css, /html\[data-theme="dark"\] #jul-mys \.jul-vignette/);
assert.match(css, /#jul-ljusstake/);
assert.match(css, /#jul-slingor/);
assert.match(html, /julpyssel\.css\?v=20261123zmys1/);
assert.match(html, /julpyssel\.js\?v=20261123zmys1/);
assert.match(sw, /CACHE_VER = '20261123zmys1'/);

function boot(opts) {
  opts = opts || {};
  const store = {
    _s: Object.assign({}, opts.local || {}),
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; }
  };
  if (opts.driver != null) store.setItem('taxi_driver', opts.driver);
  const els = {};
  function attach(parent, n) {
    if (n.parentNode && n.parentNode !== parent && n.parentNode.children) {
      const i = n.parentNode.children.indexOf(n);
      if (i >= 0) n.parentNode.children.splice(i, 1);
    }
    n.parentNode = parent;
    if (parent.children && parent.children.indexOf(n) < 0) parent.children.push(n);
    if (n.id) els[n.id] = n;
  }
  const header = { id: '', children: [], appendChild(n) { attach(this, n); return n; }, removeChild(n) {
    const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1);
    if (n.parentNode === this) n.parentNode = null;
    if (n.id && els[n.id] === n) delete els[n.id]; return n;
  } };
  const app = {
    id: 'app',
    className: opts.onHome ? 'is-home' : '',
    style: { display: opts.onHome ? 'block' : 'none' },
    classList: { contains(c) { return (' ' + app.className + ' ').indexOf(' ' + c + ' ') >= 0; } }
  };
  els.app = app;
  const body = { children: [], appendChild(n) { attach(this, n); return n; }, removeChild(n) {
    const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1);
    if (n.parentNode === this) n.parentNode = null;
    if (n.id && els[n.id] === n) delete els[n.id]; return n;
  } };
  function qs(sel) {
    if (sel === '#app > header' || sel === '#app header' || sel === 'header') return header;
    return null;
  }
  const documentStub = {
    body, documentElement: body, readyState: 'complete',
    getElementById(id) { return els[id] || null; },
    querySelector: qs,
    createElement(tag) {
      const el = {
        tagName: tag, id: '', type: '', hidden: false, title: '', innerHTML: '',
        parentNode: null, children: [], className: '',
        classList: {
          _s: new Set(),
          add() { Array.prototype.forEach.call(arguments, (c) => { el.classList._s.add(c); }); el.className = [...el.classList._s].join(' '); },
          remove() { Array.prototype.forEach.call(arguments, (c) => { el.classList._s.delete(c); }); el.className = [...el.classList._s].join(' '); },
          toggle(c, on) {
            if (on === false) el.classList._s.delete(c);
            else if (on === true) el.classList._s.add(c);
            else if (el.classList._s.has(c)) el.classList._s.delete(c);
            else el.classList._s.add(c);
            el.className = [...el.classList._s].join(' ');
          },
          contains(c) { return el.classList._s.has(c); }
        },
        attributes: {},
        setAttribute(k, v) { this.attributes[k] = String(v); },
        addEventListener() {},
        appendChild(n) { attach(el, n); return n; },
        removeChild(n) {
          const i = el.children.indexOf(n);
          if (i >= 0) el.children.splice(i, 1);
          if (n.parentNode === el) n.parentNode = null;
          if (n.id && els[n.id] === n) delete els[n.id];
          return n;
        }
      };
      return el;
    },
    addEventListener() {}
  };
  const win = { addEventListener() {}, current: opts.current || null, innerHeight: 812, HEM_SIDOR: { headerTop() {} } };
  const ctx = { window: win, document: documentStub, localStorage: store, location: { search: opts.search || '', pathname: '/TaxiData/' }, Intl, Date, URLSearchParams, console, Math, setInterval() { return 0; }, clearInterval() {}, MutationObserver: function () { return { observe() {} }; } };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return { J: ctx.window.JULPYSSEL, store, els, doc: documentStub };
}

const other = boot({ driver: '123456', onHome: true });
assert.equal(other.J.allowed(), false);
assert.equal(other.doc.getElementById('jul-mys'), null);
assert.equal(other.doc.getElementById('jul-girlang'), null);

const home = boot({ driver: '710022', onHome: true, search: '?juldatum=2026-12-13' });
const mys = home.doc.getElementById('jul-mys');
assert.ok(mys, 'jul-mys på hemskärmen');
assert.ok(mys.classList.contains('jul-on'));
assert.equal(mys.hidden, false);
assert.equal(mys.attributes['aria-hidden'], 'true');
assert.match(String(mys.innerHTML || ''), /jul-vignette/);
assert.match(String(mys.innerHTML || ''), /jul-flinga/);
const gir = home.doc.getElementById('jul-girlang');
assert.ok(gir, 'girlang i ljusraden');
assert.equal(gir.hidden, false);
assert.match(String(gir.innerHTML || ''), /jul-barr/);
assert.match(String(gir.innerHTML || ''), /jul-stjarna/);
assert.match(String(gir.innerHTML || ''), /jul-kula-rod/);
assert.match(String(gir.innerHTML || ''), /#8a4b1f/); // pepparkaka
assert.match(String(gir.innerHTML || ''), /#c53030/); // tomte
assert.ok(home.doc.getElementById('jul-ljusstake'), 'ljusstake kvar');
assert.ok(home.doc.getElementById('jul-slingor'), 'slingor kvar');

const away = boot({ driver: '710022', onHome: false });
const off = away.doc.getElementById('jul-mys');
assert.ok(off);
assert.equal(off.hidden, true);
assert.ok(!off.classList.contains('jul-on'));

console.log('JULPYSSEL_MYS_OK');
