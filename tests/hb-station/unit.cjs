'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalpbot.js'), 'utf8');
assert.doesNotMatch(src, /function coolSvg|name: 'Cool'|hb-dummy-arm/);
assert.match(src, /c === 'cool'/);
assert.match(src, /hb-shades/);
assert.match(src, /pappaskämt/);
function node() {
  return {
    style: {}, className: '', id: '', innerHTML: '', textContent: '',
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    setAttribute(){}, getAttribute(){ return null; }, appendChild(){ return this; },
    addEventListener(){}, querySelector(){ return node(); }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { left:0, top:0, right:40, bottom:40, width:40, height:40 }; },
    offsetHeight: 0
  };
}
const ls = { _s: { taxi_driver: '900001', hb_char_900001: 'cool' }, getItem(k){ return Object.prototype.hasOwnProperty.call(this._s,k) ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
const documentStub = Object.assign(node(), {
  getElementById(){ return null; },
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  createElement(){ return node(); },
  head: node(), body: node(),
  readyState: 'complete',
  documentElement: { style: { setProperty(){} } }
});
const windowObj = {
  addEventListener(){}, driverData: {}, HJALPBOT: undefined,
  ANIMATIONER: { isOn(){ return true; } },
  matchMedia(){ return { matches: false, addEventListener(){} }; },
  innerWidth: 412, innerHeight: 780
};
windowObj.window = windowObj;
const ctx = {
  window: windowObj, document: documentStub, localStorage: ls,
  sessionStorage: { getItem(){ return null; }, setItem(){} },
  fetch(){ return Promise.resolve({ ok:false, text:()=>Promise.resolve('') }); },
  addEventListener(){}, console, setTimeout, clearTimeout, setInterval, clearInterval,
  MutationObserver: function(){ return { observe(){}, disconnect(){} }; }
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const H = ctx.window.HJALPBOT;
assert.ok(H && H.chars);
assert.ok(H.chars.robot && H.chars.chauffor && H.chars.diva);
assert.ok(!H.chars.cool);
assert.equal(ls.getItem('hb_char_900001'), 'robot');
assert.deepEqual(Object.keys(H.chars).sort(), ['chauffor','diva','robot']);
console.log('UNIT_OK', Object.keys(H.chars).join(','));
process.exit(0);
