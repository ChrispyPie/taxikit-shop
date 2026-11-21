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
      return Promise.resolve({ ok: true, label: '🚕 SM-X200' });
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
  assert.equal(call.args.p_model, 'SM-X200');
  assert.equal(b.D.currentLabel(), '🚕 SM-X200');

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
