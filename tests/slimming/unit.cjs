'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');

async function testSw() {
  const swSrc = fs.readFileSync(path.join(root, 'TaxiData/sw.js'), 'utf8');
  const listeners = {};
  const cachesStore = { 'taxidata-static-old': new Map([['a', { ok: true }]]) };
  let posted = [];
  const cachesApi = {
    open(name) {
      if (!cachesStore[name]) cachesStore[name] = new Map();
      const m = cachesStore[name];
      return Promise.resolve({
        match: (req) => Promise.resolve(m.get(typeof req === 'string' ? req : req.url) || null),
        put: (req, res) => { m.set(typeof req === 'string' ? req : req.url, res); return Promise.resolve(); }
      });
    },
    keys: () => Promise.resolve(Object.keys(cachesStore)),
    delete: (name) => { delete cachesStore[name]; return Promise.resolve(true); }
  };
  const selfStub = {
    location: { origin: 'https://taxikit.shop', pathname: '/TaxiData/sw.js' },
    registration: { scope: 'https://taxikit.shop/TaxiData/' },
    addEventListener(ev, fn) { listeners[ev] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve([{ postMessage: (msg) => posted.push(msg) }])
    }
  };
  const ctx = {
    self: selfStub, caches: cachesApi, URL, Promise,
    fetch: (req) => Promise.resolve({ ok: true, status: 200, type: 'basic', clone() { return this; } })
  };
  vm.createContext(ctx);
  vm.runInContext(swSrc, ctx);

  let waitP = null;
  listeners.install({ waitUntil(p) { waitP = p; } });
  await waitP;
  listeners.activate({ waitUntil(p) { waitP = p; } });
  await waitP;
  assert.ok(!cachesStore['taxidata-static-old'], 'old static cache purged');
  assert.equal(posted[0] && posted[0].type, 'sw-updated', 'clients notified on cache upgrade');

  function dispatchFetch(url, mode) {
    let resp = null;
    listeners.fetch({
      request: { method: 'GET', url, mode: mode || 'no-cors' },
      respondWith(p) { resp = p; }
    });
    return resp;
  }
  assert.equal(dispatchFetch('https://taxikit.shop/TaxiData/rest/v1/rpc/get_me'), null, 'never intercepts API');
  assert.equal(dispatchFetch('https://lpfdryvukqmjlgenuzpb.supabase.co/rest/v1/x'), null, 'never intercepts Supabase');
  assert.equal(dispatchFetch('https://taxikit.shop/TaxiData/sw.js'), null, 'never intercepts sw.js');
  const jsResp = await dispatchFetch('https://taxikit.shop/TaxiData/tema.js?v=1');
  assert.ok(jsResp && jsResp.ok, 'static JS cached and returned');
  const htmlResp = await dispatchFetch('https://taxikit.shop/TaxiData/index.html', 'navigate');
  assert.ok(htmlResp && htmlResp.ok, 'HTML fetched network-first');
}

function testTema() {
  const src = fs.readFileSync(path.join(root, 'TaxiData/tema.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'TaxiData/tema.css'), 'utf8');
  function run(init) {
    const ls = { _s: Object.assign({}, init || {}), getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
    const attrs = {};
    const doc = {
      documentElement: {
        style: { setProperty() {} },
        setAttribute(k, v) { attrs[k] = v; },
        removeAttribute(k) { delete attrs[k]; },
        getAttribute(k) { return attrs[k] || null; }
      },
      addEventListener() {}, querySelector: () => null, createElement: () => ({ setAttribute() {} }), head: { addEventListener() {}, querySelector: () => null, appendChild() {} }
    };
    const win = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), TEMA: undefined };
    vm.runInNewContext(src, { window: win, LAZY: win.LAZY, document: doc, localStorage: ls });
    return { T: win.TEMA, ls, attrs };
  }
  assert.equal(run({ taxi_home_layout: '2' }).T.getLayout(), '3', 'migrates 2 -> 3');
  assert.equal(run({ taxi_home_layout: 'fyll' }).T.getLayout(), '4', 'migrates fyll -> 4');
  assert.equal(run({ taxi_home_layout: 'lista' }).T.getLayout(), '4', 'migrates lista -> 4');
  assert.equal(run({}).T.getLayout(), '4', 'default is 4');
  const delad = run({ taxi_delad_enhet: '1', taxi_driver: '710022', taxi_home_layout: '5' });
  delad.T.setLayout('6');
  assert.equal(delad.ls.getItem('taxi_home_layout:710022'), '6', 'delad enhet saves layout per driver');
  assert.equal(delad.ls.getItem('taxi_home_layout'), '5', 'device layout untouched on delad enhet');
  assert.equal(delad.T.getIcons, undefined, 'getIcons removed');
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /data-home="6"/);
}

async function testNotisEnhet() {
  const src = fs.readFileSync(path.join(root, 'TaxiData/notis-enhet.js'), 'utf8');
  const ls = { _s: { taxi_session: 'tok', taxi_driver: '710022' }, getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
  const rpcs = [];
  const win = {
    DELAD: { currentLabel: () => '📱 Telefon' },
    rpc(fn, args) {
      rpcs.push({ fn, args });
      if (fn === 'notis_device_settings_list') {
        return Promise.resolve([{ device_key: 'other', device_name: '🚕 Platta', data: { prefs: { tag: false, flyg: true, bat: false, prognos: true } } }]);
      }
      return Promise.resolve({ ok: true });
    }
  };
  const fetchStub = (url) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(/notis_device_settings_list/.test(url) ? [{ device_key: 'other', device_name: '🚕 Platta', data: { prefs: { tag: false, flyg: true, bat: false, prognos: true } } }] : { ok: true })) });
  vm.runInNewContext(src, { window: win, document: { addEventListener() {} }, localStorage: ls, navigator: {}, console, Promise, setTimeout, clearTimeout, fetch: fetchStub, TRIP_API_URL: 'https://example.test', TRIP_API_KEY: 'k' });
  const N = win.NOTIS_ENHET;
  assert.equal(N.allows('tag'), true);
  assert.equal(N.allows('tag-ank'), true);
  assert.equal(N.allows('prognos-flyg'), true);
  N.write({ tag: false, flyg: true, bat: false, prognos: false });
  assert.equal(N.allows('tag'), false);
  assert.equal(N.allows('flyg'), true);
  assert.equal(N.allows('bat'), false);
  assert.equal(N.allows('prognos'), false);
  assert.equal(N.allows('admin-meddelande'), true, 'non-category notices unaffected');
  const list = await N.listOtherDevices();
  assert.equal(list[0].device_name, '🚕 Platta');
  N.applyCopied(list[0].data);
  assert.equal(N.read().flyg, true);
  assert.equal(N.read().tag, false);
}

function testSpotlight() {
  const src = fs.readFileSync(path.join(root, 'TaxiData/hb-stage.js'), 'utf8');
  const ls = { _s: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); } };
  let ensured = [];
  const win = { LAZY: { ensure(id) { ensured.push(id); return Promise.resolve(); } } };
  const doc = {
    getElementById: () => null, head: { appendChild() {} },
    createElement: () => ({ id: '', textContent: '', style: {} })
  };
  vm.runInNewContext(src, { window: win, LAZY: win.LAZY, document: doc, localStorage: ls });
  assert.equal(win.HB_STAGE.isLit(), false, 'spotlight defaults off');
  assert.equal(ensured.length, 0, 'hjalpbot not loaded when off');
  win.HB_STAGE.setLit(true);
  assert.equal(win.HB_STAGE.isLit(), true);
  assert.deepEqual(ensured, ['hjalpbot'], 'turning spotlight on lazy-loads hjalpbot');
}

function testDefaultsAndChangelog() {
  const core = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning-core.js'), 'utf8');
  const ls = { _s: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
  const win = { addEventListener() {} };
  const doc = { readyState: 'complete', addEventListener() {}, querySelector: () => null };
  vm.runInNewContext(core, { window: win, document: doc, localStorage: ls });
  const H = win.HEM_ORDNING;
  assert.equal(H.isInstalled('vader'), false, 'vader off by default');
  assert.equal(H.isInstalled('nyheter'), false, 'nyheter off by default');
  const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
  const top = cl.split("id: '2026-11-21zslim1'")[1].split(']},')[0];
  assert.match(top.split('rader:')[0], /tid: '17:30'/, 'tid set at go-live');
  assert.doesNotMatch(top, /\b(Stig|hen)\b/i);
}

Promise.resolve()
  .then(testSw)
  .then(testTema)
  .then(testNotisEnhet)
  .then(testSpotlight)
  .then(testDefaultsAndChangelog)
  .then(() => console.log('SLIMMING_UNIT_OK'))
  .catch((e) => { console.error(e); process.exit(1); });
