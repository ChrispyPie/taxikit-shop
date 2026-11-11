'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hem-ordning.js'), 'utf8');
const ls = { _s: {}, getItem(k){ return this._s[k] || null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
const documentStub = {
  getElementById(){ return null; }, querySelector(){ return null; },
  createElement(){ return { style:{}, textContent:'', setAttribute(){}, appendChild(){} }; },
  head: { appendChild(){} }, body: {}, addEventListener(){}, readyState: 'complete'
};
const windowObj = { addEventListener(){}, driverData: {}, HEM_ORDNING: undefined };
const ctx = { window: windowObj, document: documentStub, localStorage: ls, fetch(){ return Promise.resolve({ ok:false, text:()=>Promise.resolve('') }); }, addEventListener(){}, console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const H = ctx.window.HEM_ORDNING;
const menu = ['kordata','lonekoll','ankomster','prognos','vader','kalender'].map(id => ({ id, label: id }));
H.preview(['vader','kordata','prognos']);
const out = H.arrange(menu).map(x => x.id);
assert.equal(out[0], 'vader');
assert.ok(out.indexOf('vader') < out.indexOf('kordata') && out.indexOf('kordata') < out.indexOf('prognos'));
assert.ok(out.includes('lonekoll') && out.includes('ankomster') && out.includes('kalender'));
assert.equal(out.length, 6);
const help = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalp.js'), 'utf8');
assert.match(help, /Tryck på Ordna/);
const hem = help.split('hem: [')[1].split('],')[0];
assert.doesNotMatch(hem, /\bStig\b|\bhen\b/);
console.log('UNIT_OK', out.join(','));
