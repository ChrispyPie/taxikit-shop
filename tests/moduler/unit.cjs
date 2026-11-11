'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ls = {
  _s: {},
  getItem(k){ return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem(k,v){ this._s[k]=String(v); },
  removeItem(k){ delete this._s[k]; }
};
const ss = { _s: {}, getItem(k){ return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
function el() {
  return {
    style: {}, classList: { add(){}, remove(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){ return null; }, addEventListener(){},
    appendChild(){}, insertBefore(){}, remove(){}, querySelector(){ return el(); },
    querySelectorAll(){ return []; }, innerHTML: '', textContent: '', isConnected: true
  };
}
const documentStub = {
  getElementById(){ return null; }, querySelector(){ return null; }, querySelectorAll(){ return []; },
  createElement(){ return el(); }, head: { appendChild(){} }, body: { appendChild(){}, classList:{ add(){}, remove(){} } },
  addEventListener(){}, removeEventListener(){}, readyState: 'complete'
};
const windowObj = { addEventListener(){}, HEM_ORDNING: {
  catalog(){ return [{ id: 'kordata', label: 'Kördata', icon: 'x' }, { id: 'installningar', label: 'Inställningar', icon: 'x' }]; },
  isInstalled(id){ return id === 'installningar'; },
  install(){},
  isCore(id){ return id === 'installningar'; }
}, LAZY: { manifest: { kordata: ['kordata.js?v=20261111komm1'], installningar: [] } } };
const ctx = {
  window: windowObj, document: documentStub, localStorage: ls, sessionStorage: ss,
  fetch(){ return Promise.resolve({ blob(){ return Promise.resolve({ size: 0 }); } }); },
  performance: { getEntriesByType(){ return []; } },
  addEventListener(){}, console
};
windowObj.MODULER = undefined;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../TaxiData/moduler.js'), 'utf8'), ctx);
const M = ctx.window.MODULER;
assert.ok(M && M.showInfo && M.clearCache && M.isProtectedKey, 'MODULER API');
assert.ok(M.isProtectedKey('taxi_session'));
assert.ok(M.isProtectedKey('taxi_driver'));
assert.ok(M.isProtectedKey('taxi_logged_in'));
assert.ok(M.isProtectedKey('taxi_theme'));
assert.ok(M.isProtectedKey('taxi_animationer'));
assert.ok(!M.isProtectedKey('taxi_animationer_vader'));
assert.ok(M.isProtectedKey('taxi_home_order:900001'));
assert.ok(M.isProtectedKey('taxi_kal_watches'));
assert.ok(M.isProtectedKey('lk_settings'));
assert.ok(M.isProtectedKey('taxi_bev_foo'));

ls.setItem('taxi_session', 'KEEP');
ls.setItem('taxi_driver', '900001');
ls.setItem('taxi_animationer', '1');
ls.setItem('taxi_theme', 'dark');
ls.setItem('taxi_home_order:900001', '{"ids":[]}');
ls.setItem('taxi_kal_watches', '[]');
ls.setItem('taxi_animationer_vader', '{"ok":1}');
ls.setItem('taxi_train_stations_v1', '{"s":1}');
M.clearCache('vader');
M.clearCache('ankomster');
M.clearCache('kordata');
assert.equal(ls.getItem('taxi_session'), 'KEEP');
assert.equal(ls.getItem('taxi_driver'), '900001');
assert.equal(ls.getItem('taxi_animationer'), '1');
assert.equal(ls.getItem('taxi_theme'), 'dark');
assert.equal(ls.getItem('taxi_home_order:900001'), '{"ids":[]}');
assert.equal(ls.getItem('taxi_kal_watches'), '[]');
assert.equal(ls.getItem('taxi_animationer_vader'), null);
assert.equal(ls.getItem('taxi_train_stations_v1'), null);

const help = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalp.js'), 'utf8');
assert.match(help, /function openFor/);
assert.match(help, /Modulinfo, Flytta, Hjälp/);
assert.match(help, /Rutan Moduler/);
const ho = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hem-ordning.js'), 'utf8');
assert.match(ho, /navigator\.vibrate\(10\)/);
assert.match(ho, /data-lp="move"/);
assert.match(ho, /data-lp="help"/);
assert.doesNotMatch(ho, /border\s*:\s*2px dashed/);
assert.match(ho, /aria-label', 'Moduler'/);
console.log('UNIT_OK');
