'use strict';
// Adventsljusstake (julpyssel): smal rad under headern, bara 710022, förhandsvisning.
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
const core = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning-core.js'), 'utf8');
const lazy = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const sid = fs.readFileSync(path.join(root, 'TaxiData/hem-sidor.js'), 'utf8');

assert.doesNotMatch(js + css + cl, /\bStig\b/);
assert.doesNotMatch(js, /\bhen\b/);
assert.doesNotMatch(cl, /id: '2026-11-22zjul1'/);
assert.doesNotMatch(cl, /id: '2026-11-22zjul2'/);
assert.doesNotMatch(cl, /id: '2026-11-22zjul3'/);
assert.doesNotMatch(cl, /id: '2026-11-22zjul4'/);
assert.doesNotMatch(cl, /id: '2026-11-22zjul5'/);
assert.match(js, /ALLOW = \{ '710022': 1 \}/);
assert.match(js, /JUL_ALLA = false/);
assert.match(js, /ADVENT = \['2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20'\]/);
assert.match(js, /taxi_jul_ljus_preview/);
assert.match(js, /juldatum/);
assert.match(js, /class="jul-flame-pos"/);
assert.match(js, /class="jul-wick"/);
assert.doesNotMatch(js, /class="jul-flame" transform=/);
assert.match(js, /class="jul-glow"/);
assert.match(js, /visibilitychange/);
assert.match(css, /jul-glow/);
assert.match(css, /td-fx-pause/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);

assert.match(js, /jul-ljus-rad/);
assert.match(js, /querySelector\('#app > header'\)/);
assert.doesNotMatch(js, /document\.body \|\| document\.documentElement\)\.appendChild\(btn\)/);
assert.match(html, /julpyssel\.css\?v=20261123adv16/);
assert.match(html, /julpyssel\.js\?v=20261123adv14/);
assert.match(sw, /CACHE_VER = '20261123adv16'/);
assert.match(css, /#jul-ljus-rad/);
assert.doesNotMatch(css, /grid-area:\s*jul/);
assert.match(css, /border-bottom:\s*none/);
assert.match(js, /putInApp\(gir, rad/);
assert.doesNotMatch(css.split('Julgransbelysning')[0], /position:\s*fixed/);
assert.doesNotMatch(css, /z-index:\s*28/);
assert.doesNotMatch(css, /bottom:\s*calc\(8px/);
assert.match(core, /LAZY\.ensure\('berra'\)/);
assert.match(lazy, /"berra": \["berra\.js\?v=20261123adv14"\]/);
assert.match(lazy, /berra\.js\?v=20261123adv14/);
assert.match(sid, /headerTop: headerTop/);

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
  const header = {
    id: '',
    children: [],
    appendChild(n) { attach(this, n); return n; },
    removeChild(n) {
      const i = this.children.indexOf(n);
      if (i >= 0) this.children.splice(i, 1);
      if (n.parentNode === this) n.parentNode = null;
      if (n.id && els[n.id] === n) delete els[n.id];
      return n;
    }
  };
  const app = {
    id: 'app',
    className: opts.onHome ? 'is-home' : '',
    style: { display: opts.onHome ? 'block' : 'none' },
    classList: {
      contains(c) { return (' ' + app.className + ' ').indexOf(' ' + c + ' ') >= 0; },
      add(c) { if (!this.contains(c)) app.className = (app.className + ' ' + c).trim(); },
      remove(c) { app.className = (' ' + app.className + ' ').replace(' ' + c + ' ', ' ').trim(); }
    }
  };
  els.app = app;

  const content = { id: 'content', children: [], parentNode: null, appendChild(n) { attach(this, n); return n; }, removeChild(n) {
    const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1);
    if (n.parentNode === this) n.parentNode = null;
    if (n.id && els[n.id] === n) delete els[n.id]; return n;
  } };
  els.content = content;
  function installContainer(node) {
    node.children = node.children || [];
    node.appendChild = function (n) { attach(node, n); return n; };
    node.removeChild = function (n) {
      const i = node.children.indexOf(n); if (i >= 0) node.children.splice(i, 1);
      if (n.parentNode === node) n.parentNode = null;
      if (n.id && els[n.id] === n) delete els[n.id]; return n;
    };
    node.insertBefore = function (n, ref) {
      if (n.parentNode && n.parentNode !== node && n.parentNode.removeChild) n.parentNode.removeChild(n);
      if (n.parentNode === node) {
        const j = node.children.indexOf(n); if (j >= 0) node.children.splice(j, 1);
      }
      n.parentNode = node;
      if (n.id) els[n.id] = n;
      const i = ref ? node.children.indexOf(ref) : -1;
      if (i >= 0) node.children.splice(i, 0, n);
      else node.children.push(n);
      return n;
    };
  }
  installContainer(app);
  app.appendChild(content);
  const body = {
    children: [],
    appendChild(n) { attach(this, n); return n; },
    removeChild(n) {
      const i = this.children.indexOf(n);
      if (i >= 0) this.children.splice(i, 1);
      if (n.parentNode === this) n.parentNode = null;
      if (n.id && els[n.id] === n) delete els[n.id];
      return n;
    }
  };
  function qs(sel) {
    if (sel === '#app > header' || sel === '#app header' || sel === 'header') return header;
    return null;
  }
  const loc = { search: opts.search || '', pathname: '/TaxiData/' };
  const documentStub = {
    body,
    documentElement: body,
    readyState: 'complete',
    getElementById(id) { return els[id] || null; },
    querySelector: qs,
    createElement(tag) {
      const el = {
        tagName: tag, id: '', type: '', hidden: false, title: '', innerHTML: '',
        parentNode: null,
        children: [],
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
        addEventListener(type, fn) { this._click = fn; },
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
  const win = { addEventListener() {}, current: opts.current || null, HEM_SIDOR: { headerTop() { win._headerTop = (win._headerTop || 0) + 1; } } };
  const ctx = {
    window: win,
    document: documentStub,
    localStorage: store,
    location: loc,
    Intl, Date, URLSearchParams, console, setInterval() { return 0; }, clearInterval() {},
    MutationObserver: function () { return { observe() {} }; }
  };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return { J: ctx.window.JULPYSSEL, store, els, doc: documentStub, header, win };
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

function bodyHeights(html) {
  return [...String(html).matchAll(/class="jul-body"[^>]*height="([\d.]+)"/g)].map(m => +m[1]);
}

function wickYs(html) {
  return [...String(html).matchAll(/class="jul-wick"[^>]*y="([\d.-]+)"/g)].map(m => +m[1]);
}
function flameYs(html) {
  return [...String(html).matchAll(/class="jul-flame-pos" transform="translate\(([\d.-]+) ([\d.-]+)\)"/g)].map(m => +m[2]);
}
function assertFollowsBodies(html, lit, label) {
  const hs = bodyHeights(html);
  const wy = wickYs(html);
  const fy = flameYs(html);
  assert.equal(hs.length, 4, label + ' saknar ljus');
  assert.equal(wy.length, 4, label + ' saknar vekar');
  assert.equal(fy.length, lit, label + ' fel antal lågor ' + fy.length);
  for (let i = 0; i < 4; i++) {
    const bodyY = 34 - hs[i];
    assert.ok(Math.abs(wy[i] - (bodyY - 2.5)) < 0.05, label + ' veke ' + i + ': ' + wy[i] + ' vs ' + (bodyY - 2.5));
  }
  for (let i = 0; i < lit; i++) {
    const bodyY = 34 - hs[i];
    assert.ok(Math.abs(fy[i] - (bodyY - 8)) < 0.05, label + ' låga ' + i + ': ' + fy[i] + ' vs ' + (bodyY - 8));
  }
  if (lit >= 2) {
    for (let i = 1; i < lit; i++) {
      if (hs[i] > hs[i - 1] + 0.05) {
        assert.ok(fy[i] < fy[i - 1] - 0.05, label + ' lågor ska följa höjd ' + JSON.stringify({ fy, hs }));
        assert.ok(wy[i] < wy[i - 1] - 0.05, label + ' vekar ska följa höjd ' + JSON.stringify({ wy, hs }));
      }
    }
  }
  return { hs, wy, fy };
}

function msDay(d) { return Date.parse(d + 'T00:00:00+01:00'); }

assert.equal(j.candleFull, 18);
assert.ok(j.candleStub > 2 && j.candleStub < 8);
assert.equal(j.burnEnd, '2026-12-25');
assert.equal(j.candleHeight(0, false, msDay('2026-11-28')), j.candleFull);
assert.equal(j.candleHeight(3, false, msDay('2026-12-13')), j.candleFull);
assert.equal(j.candleHeight(0, true, msDay('2026-11-29')), j.candleFull);
assert.equal(j.candleHeight(2, true, msDay('2026-12-13')), j.candleFull);
{
  const d13 = msDay('2026-12-13');
  const h0 = j.candleHeight(0, true, d13);
  const h1 = j.candleHeight(1, true, d13);
  const h2 = j.candleHeight(2, true, d13);
  assert.ok(h0 < h1 && h1 < h2, 'tredje advent: nyare ljus ska vara längre ' + JSON.stringify({ h0, h1, h2 }));
  assert.equal(h2, j.candleFull);
  const late = Date.parse('2026-12-13T18:00:00+01:00');
  assert.ok(j.candleHeight(0, true, late) < h0, 'samma dag: kontinuerlig nersmältning');
}
assert.equal(j.candleHeight(0, true, msDay('2026-12-25')), j.candleStub);
assert.equal(j.candleHeight(3, true, msDay('2026-12-25')), j.candleStub);
{
  const d24 = Date.parse('2026-12-24T18:00:00+01:00');
  const s0 = j.candleHeight(0, true, d24);
  const s3 = j.candleHeight(3, true, d24);
  assert.ok(s0 > j.candleStub && s0 < j.candleFull);
  assert.ok(s3 > s0, 'julafton: fjärde ljuset längre än första');
  assert.ok(s0 < 8, 'nästan stump vid julafton');
}


const other = boot({ driver: '123456', onHome: true });
assert.equal(other.J.allowed(), false);
assert.equal(other.doc.getElementById('jul-ljusstake'), null);
assert.equal(other.doc.getElementById('jul-ljus-rad'), null);

const preview = boot({ driver: '710022', onHome: true });
assert.equal(preview.J.previewKey, 'taxi_jul_ljus_preview');
const rad = preview.doc.getElementById('jul-ljus-rad');
const el = preview.doc.getElementById('jul-ljusstake');
assert.ok(rad);
assert.ok(el);
assert.equal(el.parentNode, rad);
assert.ok(preview.els.app.children.includes(rad), 'ljusstaken ska ligga i body, inte i headern');
assert.ok(!preview.header.children.includes(rad), 'ljusstaken kvar i headern');
const girPrev = preview.doc.getElementById('jul-girlang');
assert.ok(girPrev, 'girlang som avskiljare');
assert.ok(preview.els.app.children.includes(girPrev));
assert.ok(preview.els.app.children.indexOf(girPrev) < preview.els.app.children.indexOf(rad), 'girlang ovanför ljusstaken');
assert.ok(el.classList.contains('jul-on'));
assert.ok(rad.classList.contains('jul-on'));
assert.equal(el.hidden, false);
preview.J.cyclePreview();
assert.equal(preview.store.getItem('taxi_jul_ljus_preview'), '1');
assert.equal(preview.J.litCount(), 1);
preview.J.cyclePreview();
assert.equal(preview.J.litCount(), 2);
preview.J.cyclePreview();
assert.equal(preview.J.litCount(), 3);
{
  const tops = assertFollowsBodies(el.innerHTML, 3, 'preview 3');
  assert.ok(tops.hs[0] < tops.hs[1] && tops.hs[1] < tops.hs[2], 'preview 3: höjder ' + JSON.stringify(tops.hs));
  assert.equal(tops.hs[2], 18);
  assert.equal(tops.hs[3], 18);
  assert.ok(tops.fy[0] > tops.fy[1] && tops.fy[1] > tops.fy[2], 'preview 3: lågor samma höjd? ' + JSON.stringify(tops.fy));
}
preview.J.cyclePreview();
assert.equal(preview.J.litCount(), 4);
assertFollowsBodies(el.innerHTML, 4, 'preview 4');
preview.J.cyclePreview();
assert.equal(preview.J.litCount(), 0);
preview.J.cyclePreview();
assert.equal(preview.store.getItem('taxi_jul_ljus_preview'), null);
assert.match(String(el.innerHTML || ''), /jul-c1/);
assert.ok((preview.win._headerTop || 0) >= 1);

const dated = boot({ driver: '710022', onHome: true, search: '?juldatum=2026-12-13' });
assert.equal(dated.J.litCount(), 3);
{
  const tops = assertFollowsBodies(dated.doc.getElementById('jul-ljusstake').innerHTML, 3, 'juldatum 13 dec');
  assert.ok(tops.hs[0] < tops.hs[1] && tops.hs[1] < tops.hs[2], 'juldatum 13 dec: höjder ' + JSON.stringify(tops.hs));
  assert.equal(tops.hs[2], 18);
  assert.equal(tops.hs[3], 18);
  assert.ok(tops.fy[0] > tops.fy[1] && tops.fy[1] > tops.fy[2], 'juldatum: lågor samma höjd? ' + JSON.stringify(tops.fy));
}

{
  const html = j.svg(3, msDay('2026-12-13'));
  const tops = assertFollowsBodies(html, 3, 'svg 13 dec');
  assert.ok(tops.fy[0] !== tops.fy[1] && tops.fy[1] !== tops.fy[2]);
}

const away = boot({ driver: '710022', onHome: false });
const awayBtn = away.doc.getElementById('jul-ljusstake');
const awayRad = away.doc.getElementById('jul-ljus-rad');
assert.ok(awayBtn && awayRad);
assert.equal(awayBtn.hidden, true);
assert.ok(!awayBtn.classList.contains('jul-on'));
assert.ok(!awayRad.classList.contains('jul-on'));

console.log('JULPYSSEL_LJUSSTAKE_OK');
