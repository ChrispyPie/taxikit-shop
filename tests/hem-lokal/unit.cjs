'use strict';
// Enhetstest: startskärmens layout är lokal per enhet (2026-11-14lokal1).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'TaxiData/hem-ordning.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const lazy = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');

assert.match(src, /2026-11-14lokal1/);
assert.match(src, /layouten är lokal per enhet/i);
assert.doesNotMatch(src, /rpc\('home_tool_order_set'/);
assert.match(src, /rpc\('home_tool_order_get'/);
assert.match(src, /if \(isSeeded\(\) \|\| local\)/);
assert.match(src, /markSeeded\(\)/);
assert.match(index, /hem-ordning\.js\?v=20261114lokal1/);
assert.match(index, /lazy-views\.js\?v=(20261114lokal1|20261118login1|20261121login1)/);
assert.match(lazy, /changelog\.js\?v=(20261114lokal1|20261121login1)/);
assert.match(changelog, /id: '2026-11-14lokal1'/);
assert.match(changelog.split("id: '2026-11-14lokal1'")[1].split('rader:')[0], /tid: '22:02'/);
assert.ok(changelog.indexOf("'2026-11-14lokal1'") < changelog.indexOf("'2026-11-14vkoll1'"), 'nyheten överst');
const block = changelog.split("id: '2026-11-14lokal1'")[1].split(']},')[0];
assert.match(block, /enheten/);
assert.match(block, /mapp/);
assert.doesNotMatch(src + changelog, /\bStig\b/);
assert.doesNotMatch(block, /\bhen\b/);

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
      const payload = init && init.body ? JSON.parse(init.body) : {};
      server.sets.push(payload);
      server.row = {
        ids: payload.p_ids || [],
        hidden: payload.p_hidden || [],
        folders: payload.p_folders || [],
        pos: payload.p_pos || {}
      };
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
  const win = {
    addEventListener() {}, driverData: {},
    TRIP_API_URL: 'https://example.test', TRIP_API_KEY: 'k'
  };
  if (!opts.skipSession) {
    store.setItem('taxi_driver', opts.driver || '710022');
    store.setItem('taxi_session', opts.token || 'tok');
  }
  const ctx = {
    window: win, document: documentStub, localStorage: store,
    fetch, console, setTimeout, clearTimeout, Promise
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { H: ctx.window.HEM_ORDNING, store, server, fetches, win };
}

function orderKey(driver) { return 'taxi_home_order:' + (driver || '710022'); }
function seedKey(driver) { return 'taxi_home_order_local:' + (driver || '710022'); }
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
      pos: { 4: { vader: [0, 0], kordata: [0, 3], 'mapp-aa1': [1, 0], moduler: [2, 3] }, sida2: ['kalender'] }
    },
    sets: [],
    gets: 0
  };

  // Två enheter med olika lokal layout: de skriver inte över varandra, servern lämnas orörd.
  const phoneLocal = {};
  phoneLocal[orderKey()] = JSON.stringify({
    ids: ['vader', 'moduler'],
    hidden: [],
    folders: [],
    pos: { 3: { vader: [0, 0], moduler: [1, 2] } }
  });
  const tabletLocal = {};
  tabletLocal[orderKey()] = JSON.stringify({
    ids: ['mapp-bb2', 'kordata', 'moduler'],
    hidden: [],
    folders: [{ id: 'mapp-bb2', name: 'Platta', items: ['vader', 'prognos'] }],
    pos: { 4: { 'mapp-bb2': [0, 0], kordata: [0, 3], moduler: [2, 0] }, sida2: ['lonekoll'] }
  });

  const phone = boot({ local: phoneLocal, server: shared, readyState: 'complete' });
  await tick();
  assert.equal(phone.H.isLocal(), true, 'telefonen är sådd från egen kopia');
  assert.deepEqual(plain(phone.H.order().slice(0), 2), ['vader', 'moduler'])
  assert.deepEqual(plain(phone.H.folders()), [])
  assert.deepEqual(plain(phone.H.positions()['3'].vader), [0, 0])
  const getsAfterPhoneLoad = shared.gets;

  const tablet = boot({ local: tabletLocal, server: shared, readyState: 'complete' });
  await tick();
  assert.equal(tablet.H.isLocal(), true);
  assert.equal(tablet.H.folders()[0].name, 'Platta');
  assert.deepEqual(plain(tablet.H.extraIds()), ['lonekoll'])
  assert.equal(phone.H.folders().length, 0, 'telefonens mappar orörda när plattan laddas');
  assert.deepEqual(plain(parseOrder(phone.store).ids.slice(0), 2), ['vader', 'moduler'])

  // Sparning på telefonen ska inte skriva till servern och inte ändra plattan
  phone.H.preview(['kordata', 'vader', 'moduler'], [], [], { 3: { kordata: [0, 2], vader: [1, 0], moduler: [2, 0] } });
  phone.H.persist();
  await tick();
  assert.equal(shared.sets.length, 0, 'ingen skrivning till servern');
  assert.deepEqual(plain(shared.row.ids[0]), 'vader', 'serverns kopia lämnas orörd')
  assert.equal(parseOrder(tablet.store).folders[0].name, 'Platta');
  assert.deepEqual(plain(parseOrder(phone.store).ids.slice(0), 3), ['kordata', 'vader', 'moduler'])
  tablet.H.load();
  await tick();
  assert.equal(tablet.H.folders()[0].name, 'Platta');
  assert.deepEqual(plain(tablet.H.positions()['4'].kordata), [0, 3])
  assert.ok(shared.gets === getsAfterPhoneLoad || shared.gets === getsAfterPhoneLoad, 'redan sådda enheter hämtar inte servern');
  // (telefonen körde load vid boot; plattan också — båda hade local så get ska inte ha ökat)
  assert.equal(shared.gets, 0, 'befintlig lokal layout ger ingen serverläsning');

  // Befintlig lokal layout bevaras efter uppdateringen, även om servern har en annan (från en annan enhet).
  const keepServer = {
    row: { ids: ['lonekoll', 'moduler'], hidden: ['vader'], folders: [], pos: { 4: { lonekoll: [0, 0], moduler: [0, 3] } } },
    sets: [], gets: 0
  };
  const keepLocal = {};
  keepLocal[orderKey()] = JSON.stringify({
    ids: ['vader', 'mapp-cc3', 'moduler'],
    hidden: [],
    folders: [{ id: 'mapp-cc3', name: 'Behåll', items: ['prognos', 'ankomster'] }],
    pos: { 3: { vader: [2, 1], 'mapp-cc3': [0, 0], moduler: [3, 2] } }
  });
  const keep = boot({ local: keepLocal, server: keepServer, readyState: 'complete' });
  await tick();
  assert.equal(keepServer.gets, 0, 'ingen serverläsning när lokal kopia finns');
  assert.equal(keep.H.folders()[0].name, 'Behåll');
  assert.deepEqual(plain(keep.H.order().slice(0), 3), ['vader', 'mapp-cc3', 'moduler'])
  assert.ok(!keep.H.hidden().includes('vader'), 'serverns hidden ska inte skriva över');
  assert.deepEqual(plain(keep.H.positions()['3'].vader), [2, 1])
  keep.H.persist();
  await tick();
  assert.equal(keepServer.sets.length, 0);
  assert.deepEqual(plain(keepServer.row.ids), ['lonekoll', 'moduler'])

  // Tom enhet: sås en gång från senaste serverkopian, därefter lämnas servern ifred.
  const seedServer = {
    row: {
      ids: ['vader', 'mapp-dd4', 'moduler'],
      hidden: [],
      folders: [{ id: 'mapp-dd4', name: 'Från servern', items: ['kordata', 'prognos'] }],
      pos: { 4: { vader: [0, 1], 'mapp-dd4': [1, 0], moduler: [2, 3] }, sida2: ['kalender'] }
    },
    sets: [], gets: 0
  };
  const fresh = boot({ local: {}, server: seedServer, readyState: 'loading' });
  assert.equal(fresh.store.getItem(orderKey()), null, 'ingen lokal kopia före load');
  fresh.H.load();
  await tick();
  assert.equal(seedServer.gets, 1);
  assert.equal(fresh.H.isLocal(), true);
  assert.equal(fresh.H.folders()[0].name, 'Från servern');
  assert.deepEqual(plain(fresh.H.extraIds()), ['kalender'])
  assert.ok(parseOrder(fresh.store).folders[0].name === 'Från servern');
  // En senare serverändring (som från en annan, äldre klient) ska inte tas in
  seedServer.row = { ids: ['lonekoll', 'moduler'], hidden: [], folders: [], pos: {} };
  fresh.H.load();
  await tick();
  assert.equal(seedServer.gets, 1, 'andra laddningen läser inte servern igen');
  assert.equal(fresh.H.folders()[0].name, 'Från servern');
  assert.equal(seedServer.sets.length, 0, 'sådden skriver inte tillbaka till servern');

  console.log('UNIT_OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
