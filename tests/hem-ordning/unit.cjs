'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hem-ordning.js'), 'utf8');
const ls = { _s: {}, getItem(k){ return this._s[k] || null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
const documentStub = {
  getElementById(){ return null; }, querySelector(){ return null; },
  createElement(){ return { style:{}, textContent:'', setAttribute(){}, appendChild(){}, addEventListener(){} }; },
  head: { appendChild(){} }, body: { classList:{ add(){}, remove(){}, toggle(){} } }, addEventListener(){}, readyState: 'complete'
};
const windowObj = { addEventListener(){}, driverData: {}, HEM_ORDNING: undefined };
const ctx = { window: windowObj, document: documentStub, localStorage: ls, fetch(){ return Promise.resolve({ ok:false, text:()=>Promise.resolve('') }); }, addEventListener(){}, console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const H = ctx.window.HEM_ORDNING;
const menu = ['kordata','lonekoll','ankomster','prognos','vader','kalender','installningar','om'].map(id => ({ id, label: id, icon: 'x' }));
H.setCatalog(menu);
H.preview(['vader','kordata','prognos']);
const out = H.arrange(menu).map(x => x.id);
assert.equal(out[0], 'vader');
assert.ok(out.indexOf('vader') < out.indexOf('kordata') && out.indexOf('kordata') < out.indexOf('prognos'));
assert.ok(out.includes('installningar') && out.includes('om'));

H.preview(['vader','kordata'], ['lonekoll','vader']); // vader is requested hidden but also in order — hidden wins for non-core? Wait vader can be hidden.
// actually preview sets hidden=['lonekoll','vader'], so vader should be removed from arrange
const hiddenOut = H.arrange(menu).map(x => x.id);
assert.ok(!hiddenOut.includes('lonekoll'));
assert.ok(!hiddenOut.includes('vader'));
assert.ok(hiddenOut.includes('installningar') && hiddenOut.includes('om'));
assert.ok(hiddenOut.includes('kordata'));

H.preview(['kordata'], ['installningar','om','admin']); // core cannot be hidden
assert.ok(H.hidden().indexOf('installningar') < 0);
assert.ok(H.arrange(menu).map(x => x.id).includes('installningar'));
assert.ok(H.isCore('installningar') && H.isCore('om') && H.isCore('admin') && H.isCore('sadmin'));
assert.ok(!H.isCore('vader'));

const help = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalp.js'), 'utf8');
assert.match(help, /skiftnyckeln vid verktygen/);
assert.match(help, /Rutan Moduler/);
const hem = help.split('hem: [')[1].split('],')[0];
assert.doesNotMatch(hem, /\bStig\b|\bhen\b/);
assert.doesNotMatch(hem, /regn|snö|klädsel|outfit/i);

const menu2 = menu.concat([{ id: 'nyheter', label: 'Nyheter', icon: 'x' }]);
H.setCatalog(menu2);
H.preview([], []);
assert.ok(!H.isInstalled('nyheter'), 'nyheter default off');
assert.ok(!H.arrange(menu2).map(x => x.id).includes('nyheter'));
assert.ok(H.arrange(menu2).map(x => x.id).includes('vader'));
H.install('nyheter');
assert.ok(H.isInstalled('nyheter'));
assert.ok(H.arrange(menu2).map(x => x.id).includes('nyheter'));
H.uninstall('nyheter');
assert.ok(!H.isInstalled('nyheter'));
assert.ok(!H.arrange(menu2).map(x => x.id).includes('nyheter'));

const nyh = help.split('nyheter: [')[1].split('],')[0];
assert.doesNotMatch(nyh, /\bStig\b|\bhen\b/);
assert.match(help, /Göteborg från SVT Väst/);

console.log('UNIT_OK', hiddenOut.join(','));
