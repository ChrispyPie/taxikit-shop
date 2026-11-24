'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');

const js = fs.readFileSync(path.join(root, 'TaxiData/delad-enhet.js'), 'utf8');
const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261121a_slimming_enhet_notis.sql'), 'utf8');
const undo = fs.readFileSync(path.join(root, 'supabase/migrations/undo/20261121a_slimming_enhet_notis_undo.sql'), 'utf8');

function boot(opts) {
  opts = opts || {};
  const ls = { _s: Object.assign({}, opts.local || {}), getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
  const rpcs = [];
  const win = {
    addEventListener() {},
    rpc(fn, args) {
      rpcs.push({ fn, args });
      if (opts.rpcHandler) return opts.rpcHandler(fn, args);
      return Promise.resolve({ ok: true, label: '🚕 Samsung Galaxy Tab A8' });
    }
  };
  const doc = {
    readyState: 'complete',
    documentElement: { classList: { toggle() {} } },
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const nav = {
    userAgent: opts.ua || 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36',
    maxTouchPoints: opts.touchPoints != null ? opts.touchPoints : 5,
    userAgentData: opts.uad || { mobile: false, getHighEntropyValues: () => Promise.resolve({ model: 'SM-X200' }) }
  };
  const ctx = {
    window: win, document: doc, localStorage: ls, sessionStorage: ls,
    navigator: nav, screen: opts.screen || { width: 800, height: 1280 },
    console, Promise, setTimeout, clearTimeout
  };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return { D: win.DELAD, rpcs, ls };
}

async function main() {
  const { D } = boot();
  const chromeReducedUa = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36';
  assert.equal(D.detectDeviceKind(chromeReducedUa, 800, 1280, 5, null, false), 'platta', 'tablet screen beats reduced Android Mobile UA');
  assert.equal(D.detectDeviceKind(chromeReducedUa, 1280, 800, 5, null, false), 'platta', 'landscape tablet beats reduced Android Mobile UA');
  assert.equal(D.detectDeviceKind(chromeReducedUa, 600, 960, 5, null, false), 'platta', 'small 8-inch tablet still classified as platta');
  assert.equal(D.detectDeviceKind(chromeReducedUa, 390, 844, 5, true, false), 'telefon', 'phone viewport classified as telefon');
  assert.equal(D.detectDeviceKind(chromeReducedUa, 412, 915, 5, false, false), 'platta', 'userAgentData.mobile=false classified as platta');
  assert.equal(D.detectDeviceKind(chromeReducedUa, 390, 844, 5, true, true), 'platta', 'deladOn=true always platta');
  assert.equal(D.detectDeviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 1024, 1366, 5, null, false), 'platta', 'iPadOS desktop UA with touch -> platta');
  assert.equal(D.detectDeviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 1440, 900, 0, null, false), 'dator', 'desktop Windows -> dator');

  assert.equal(D.parseUaModel(chromeReducedUa), '', 'reduced K model ignored');
  assert.equal(D.parseUaModel('Mozilla/5.0 (Linux; Android 13; SM-X200 Build/TP1A) AppleWebKit/537.36'), 'SM-X200', 'legacy Android UA model extracted');

  const b = boot({ local: { taxi_session: 'tok1', taxi_driver: '710022' }, screen: { width: 800, height: 1280 } });
  await b.D.reportDevice();
  const call = b.rpcs.find((x) => x.fn === 'session_set_device');
  assert.ok(call, 'session_set_device called');
  assert.equal(call.args.p_kind, 'platta');
  assert.equal(call.args.p_model, 'Samsung Galaxy Tab A8');
  assert.equal(b.D.currentLabel(), '🚕 Samsung Galaxy Tab A8');

  assert.equal(D.mapModelCode('SM-S918B'), 'Samsung Galaxy S23 Ultra');
  assert.equal(D.mapModelCode('SM-S928U'), 'Samsung Galaxy S24 Ultra');
  assert.equal(D.mapModelCode('Pixel 8 Pro'), 'Pixel 8 Pro');
  assert.equal(D.mapModelCode('SM-XYZ999'), 'Samsung SM-XYZ999', 'unknown Samsung code keeps raw with brand');
  assert.equal(D.friendlyDeviceName('', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'telefon', '', ''), 'iPhone');
  assert.equal(D.friendlyDeviceName('', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'platta', '', ''), 'iPad');
  assert.equal(D.friendlyDeviceName('', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'dator', 'Windows', '15.0.0'), 'Chrome på Windows 11');
  assert.equal(D.friendlyDeviceName('', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'dator', 'macOS', '15.0.0'), 'Safari på macOS');

  const phone = boot({
    local: { taxi_session: 'tok2', taxi_driver: '710022' },
    ua: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    uad: { mobile: true, getHighEntropyValues: () => Promise.resolve({ model: 'SM-S918B', platform: 'Android', platformVersion: '14.0.0' }) },
    screen: { width: 412, height: 915 },
    touchPoints: 5,
    rpcHandler(fn, args) { return Promise.resolve({ ok: true, label: '📱 Samsung Galaxy S23 Ultra' }); }
  });
  await phone.D.reportDevice();
  const pcall = phone.rpcs.find((x) => x.fn === 'session_set_device');
  assert.ok(pcall);
  assert.equal(pcall.args.p_kind, 'telefon');
  assert.equal(pcall.args.p_model, 'Samsung Galaxy S23 Ultra');
  assert.equal(phone.D.currentLabel(), '📱 Samsung Galaxy S23 Ultra');
  assert.ok(phone.ls.getItem('taxi_device_hint'), 'hint cached');

  const desk = boot({
    local: { taxi_session: 'tok3', taxi_driver: '710022' },
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    uad: { mobile: false, getHighEntropyValues: () => Promise.resolve({ model: '', platform: 'Windows', platformVersion: '15.0.0' }) },
    screen: { width: 1440, height: 900 },
    touchPoints: 0,
    rpcHandler(fn, args) { return Promise.resolve({ ok: true, label: '💻 Chrome på Windows 11' }); }
  });
  await desk.D.reportDevice();
  const dcall = desk.rpcs.find((x) => x.fn === 'session_set_device');
  assert.equal(dcall.args.p_kind, 'dator');
  assert.equal(dcall.args.p_model, 'Chrome på Windows 11');
  assert.equal(desk.D.currentLabel(), '💻 Chrome på Windows 11');


  assert.match(js, /session_rename_device/);
  assert.match(js, /data-dev-save/);
  assert.match(js, /data-dev-reset/);
  assert.match(mig, /create table if not exists private\.driver_devices/);
  assert.match(mig, /create or replace function public\.session_rename_device/);
  assert.match(mig, /short >= 580 and big >= 800/);
  assert.match(undo, /drop function if exists public\.session_rename_device/);
  assert.match(undo, /drop table if exists private\.driver_devices/);

  console.log('DEVICE_LABEL_OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
