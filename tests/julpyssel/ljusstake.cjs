'use strict';
// Adventsljusstake (julpyssel): bara 710022, ett nytt ljus varje adventssöndag, förhandsvisning.
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
assert.doesNotMatch(cl, /id: '2026-11-22zjul1'/);
assert.match(js, /ALLOW = \{ '710022': 1 \}/);
assert.match(js, /JUL_ALLA = false/);
assert.match(js, /ADVENT = \['2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20'\]/);
assert.match(js, /taxi_jul_ljus_preview/);
assert.match(js, /juldatum/);
assert.match(html, /julpyssel\.css\?v=20261122zjul1/);
assert.match(html, /julpyssel\.js\?v=20261122zjul1/);
assert.match(sw, /CACHE_VER = '20261122zfly2'/);
assert.match(css, /#jul-ljusstake/);
assert.match(css, /z-index:\s*28/);

function boot(opts) {
  opts = opts || {};
  const store = {
    _s: Object.assign({}, opts.local || {}),
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; }
  };
  if (opts.driver != null) store.setItem('taxi_driver', opts.driver);
  const app = {
    id: 'app',
    className: opts.onHome ? 'is-home' : '',
    style: { display: opts.onHome ? 'block' : 'none' },
    classList: {
      contains(c) { return (' ' + app.className + ' ').indexOf(' ' + c + ' ') >= 0; }
    }
  };
  const els = { app };
  const body = {
    children: [],
    appendChild(n) { this.children.push(n); if (n.id) els[n.id] = n; }
  };
  const loc = { search: opts.search || '', pathname: '/TaxiData/' };
  const documentStub = {
    body,
    documentElement: body,
    readyState: 'complete',
    getElementById(id) { return els[id] || null; },
    createElement(tag) {
      const el = {
        tagName: tag, id: '', type: '', hidden: false, title: '', innerHTML: '',
        className: '', classList: {
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
        addEventListener(type, fn) { this._click = fn; }
      };
      return el;
    },
    addEventListener() {}
  };
  const win = { addEventListener() {}, current: opts.current || null };
  const ctx = {
    window: win,
    document: documentStub,
    localStorage: store,
    location: loc,
    Intl, Date, URLSearchParams, console,
    MutationObserver: function () { return { observe() {} }; }
  };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return { J: ctx.window.JULPYSSEL, store, els, doc: documentStub };
}

const j = boot({ driver: '710022', onHome: true }).J;
assert.equal(j.allowed(), true);
assert.deepEqual(JSON.parse(JSON.stringify(j.advent)), ['2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20']);
assert.equal(j.litOn('2026-11-28'), 0);
assert.equal(j.litOn('2026-11-29'), 1);
assert.equal(j.litOn('2026-12-05'), 1);
assert.equal(j.litOn('2026-12-06'), 2);
assert.equal(j.litOn('2026-12-13'), 3);
assert.equal(j.litOn('2026-12-20'), 4);
assert.equal(j.litOn('2027-01-01'), 4);

const other = boot({ driver: '123456', onHome: true });
assert.equal(other.J.allowed(), false);
assert.equal(other.doc.getElementById('jul-ljusstake'), null);

const preview = boot({ driver: '710022', onHome: true });
assert.equal(preview.J.previewKey, 'taxi_jul_ljus_preview');
preview.J.cyclePreview();
assert.equal(preview.store.getItem('taxi_jul_ljus_preview'), '1');
assert.equal(preview.J.litCount(), 1);
preview.J.cyclePreview();
assert.equal(preview.J.litCount(), 2);
preview.J.cyclePreview();
preview.J.cyclePreview();
assert.equal(preview.J.litCount(), 4);
preview.J.cyclePreview();
assert.equal(preview.J.litCount(), 0);
preview.J.cyclePreview();
assert.equal(preview.store.getItem('taxi_jul_ljus_preview'), null);

const dated = boot({ driver: '710022', onHome: true, search: '?juldatum=2026-12-13' });
assert.equal(dated.J.litCount(), 3);

const el = preview.doc.getElementById('jul-ljusstake');
assert.ok(el);
assert.match(String(el.innerHTML || ''), /jul-c1/);

console.log('JULPYSSEL_LJUSSTAKE_OK');
