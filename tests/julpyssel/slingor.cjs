'use strict';
// Julgransbelysning: slinga i vänster/höger marginal, bara 710022, inga klick, reduced-motion.
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
assert.doesNotMatch(js, /\bhen\b/);
assert.doesNotMatch(cl, /id: '2026-11-22zjul3'/);
assert.doesNotMatch(cl, /id: '2026-11-22zjul4'/);
assert.doesNotMatch(cl, /id: '2026-11-22zjul5'/);
assert.match(js, /ALLOW = \{ '710022': 1 \}/);
assert.match(js, /JUL_ALLA = false/);
assert.match(js, /jul-slingor/);
assert.match(js, /jul-slinga-' \+ side/);
assert.match(css, /\.jul-slinga-v/);
assert.match(css, /\.jul-slinga-h/);
assert.match(js, /function paintSlingor/);
assert.match(html, /julpyssel\.css\?v=20261123zscn1/);
assert.match(html, /julpyssel\.js\?v=20261123zscn1/);
assert.match(sw, /CACHE_VER = '20261123zscn1'/);
assert.match(css, /#jul-slingor/);
assert.match(css, /pointer-events:\s*none/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /prefers-reduced-motion:\s*no-preference/);
assert.match(css, /jul-twinkle/);
assert.match(css, /animation:\s*none/);

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
assert.equal(other.doc.getElementById('jul-slingor'), null);

const home = boot({ driver: '710022', onHome: true });
const wrap = home.doc.getElementById('jul-slingor');
assert.ok(wrap);
assert.ok(wrap.classList.contains('jul-on'));
assert.equal(wrap.hidden, false);
assert.match(String(wrap.innerHTML || ''), /jul-slinga-v/);
assert.match(String(wrap.innerHTML || ''), /jul-slinga-h/);
assert.match(String(wrap.innerHTML || ''), /jul-lampa/);
assert.match(String(wrap.innerHTML || ''), /jul-trad/);
assert.equal(wrap.attributes['aria-hidden'], 'true');

const away = boot({ driver: '710022', onHome: false });
const off = away.doc.getElementById('jul-slingor');
assert.ok(off);
assert.equal(off.hidden, true);
assert.ok(!off.classList.contains('jul-on'));

console.log('JULPYSSEL_SLINGOR_OK');
