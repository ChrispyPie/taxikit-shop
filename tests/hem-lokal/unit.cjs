'use strict';
// Enhetstest: startskärmens layout är lokal per enhet och migrerar äldre mappar utan dataförlust.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const core = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning-core.js'), 'utf8');
const src = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lazy = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');

assert.doesNotMatch(core + src, /rpc\('home_tool_order_set'/);
assert.match(core, /home_tool_order_get/);
assert.match(core, /if \(isSeeded\(\) \|\| readLocal\(\)/);
assert.match(core, /markSeeded\(\)/);
assert.match(index, /hem-ordning-core\.js\?v=20261123ztid1/);
assert.match(lazy, /hem-ordning\.js\?v=20261122zdelad1/);
assert.match(changelog, /id: '2026-11-14lokal1'/);
assert.doesNotMatch(core + src + changelog, /\bStig\b/);

function ls(init) {
  const _s = Object.assign({}, init || {});
  return {
    _s,
    getItem(k) { return Object.prototype.hasOwnProperty.call(_s, k) ? _s[k] : null; },
    setItem(k, v) { _s[k] = String(v); },
    removeItem(k) { delete _s[k]; }
  };
}

function tick() { return new Promise((r) => setImmediate(r)); }
function plain(x) { return JSON.parse(JSON.stringify(x)); }

function boot(opts) {
  opts = opts || {};
  const store = opts.store || ls(opts.local);
  const server = opts.server || { row: null, sets: [], gets: 0 };
  const fetches = [];
  function fetch(url, init) {
    fetches.push({ url: String(url), body: init && init.body });
    if (/home_tool_order_get/.test(String(url))) {
      server.gets = (server.gets || 0) + 1;
      const body = server.row == null ? 'null' : JSON.stringify(server.row);
      return Promise.resolve({ ok: true, text: () => Promise.resolve(body) });
    }
    if (/home_tool_order_set/.test(String(url))) {
      server.sets.push(init && init.body ? JSON.parse(init.body) : {});
      return Promise.resolve({ ok: true, text: () => Promise.resolve('true') });
    }
    return Promise.resolve({ ok: false, text: () => Promise.resolve('') });
  }
  const documentStub = {
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }; },
    head: { appendChild() {} }, body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
    addEventListener() {}, readyState: opts.readyState || 'loading',
    documentElement: { getAttribute() { return null; } }
  };
  const win = { addEventListener() {}, driverData: {}, TRIP_API_URL: 'https://example.test', TRIP_API_KEY: 'k' };
  if (!opts.skipSession) {
    store.setItem('taxi_driver', opts.driver || '710022');
    store.setItem('taxi_session', opts.token || 'tok');
  }
  const ctx = { window: win, document: documentStub, localStorage: store, fetch, console, setTimeout, clearTimeout, Promise, TRIP_API_URL: win.TRIP_API_URL, TRIP_API_KEY: win.TRIP_API_KEY };
  vm.createContext(ctx);
  vm.runInContext(core, ctx);
  vm.runInContext(src, ctx);
  return { H: ctx.window.HEM_ORDNING, store, server, fetches, win };
}

function orderKey(driver) { return 'taxi_home_order:' + (driver || '710022'); }
function uninstKey(driver) { return 'taxi_mod_uninst_vader_nyheter:' + (driver || '710022'); }
function parseOrder(store, driver) {
  const raw = store.getItem(orderKey(driver));
  return raw ? JSON.parse(raw) : null;
}

async function main() {
  const shared = {
    row: {
      ids: ['vader', 'kordata', 'mapp-aa1', 'moduler'],
      hidden: [],
      folders: [{ id: 'mapp-aa1', name: 'Körning', items: ['prognos', 'ankomster'] }],
      pos: { 4: { vader: [0, 0] }, sida2: ['kalender'] }
    },
    sets: [], gets: 0
  };

  const phoneLocal = {};
  phoneLocal[orderKey()] = JSON.stringify({ ids: ['vader', 'moduler'], hidden: [] });
  phoneLocal[uninstKey()] = '1';
  const tabletLocal = {};
  tabletLocal[orderKey()] = JSON.stringify({
    ids: ['mapp-bb2', 'kordata', 'moduler'],
    hidden: [],
    folders: [{ id: 'mapp-bb2', name: 'Platta', items: ['vader', 'prognos'] }],
    pos: { sida2: ['lonekoll'] }
  });
  tabletLocal[uninstKey()] = '1';

  const phone = boot({ local: phoneLocal, server: shared, readyState: 'complete' });
  await tick();
  assert.equal(phone.H.isLocal(), true);
  assert.deepEqual(plain(phone.H.order()), ['vader', 'moduler']);

  const tablet = boot({ local: tabletLocal, server: shared, readyState: 'complete' });
  await tick();
  assert.equal(tablet.H.isLocal(), true);
  // Äldre mapp plattas ut till rak lista utan att tappa ikoner eller sida2
  assert.deepEqual(plain(tablet.H.order()), ['vader', 'prognos', 'kordata', 'moduler']);
  assert.deepEqual(plain(tablet.H.extraIds()), ['lonekoll']);
  assert.equal(shared.gets, 0, 'befintlig lokal layout ger ingen serverläsning');

  phone.H.preview(['kordata', 'vader', 'moduler'], [], [], { sida2: ['kalender'] });
  phone.H.persist();
  await tick();
  assert.equal(shared.sets.length, 0, 'ingen skrivning till servern');
  assert.deepEqual(plain(parseOrder(phone.store).ids), ['kordata', 'vader', 'moduler']);
  assert.deepEqual(plain(parseOrder(phone.store).sida2), ['kalender']);

  // Tom enhet: sås en gång från servern och plattar ut mappar; Delad enhet läser aldrig servern
  const delad = boot({ local: { taxi_delad_enhet: '1' }, server: shared, readyState: 'complete' });
  await tick();
  assert.equal(shared.gets, 0, 'delad enhet hämtar inte kontoordning från servern');

  const fresh = boot({ local: {}, server: shared, readyState: 'loading' });
  fresh.H.load();
  await tick();
  assert.equal(shared.gets, 1);
  assert.deepEqual(plain(fresh.H.order()), ['kordata', 'prognos', 'ankomster', 'moduler']);
  assert.deepEqual(plain(fresh.H.extraIds()), ['kalender']);
  assert.equal(shared.sets.length, 0);
  assert.ok(fresh.H.hidden().indexOf('vader') >= 0);
  assert.ok(fresh.H.hidden().indexOf('nyheter') >= 0);
  assert.equal(fresh.H.isInstalled('vader'), false);
  assert.equal(fresh.H.isInstalled('nyheter'), false);
  assert.equal(fresh.store.getItem(uninstKey()), '1');

  console.log('UNIT_OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
