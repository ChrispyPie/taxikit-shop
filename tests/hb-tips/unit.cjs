'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalpbot-tips.js'), 'utf8');

const ls = { _s: {}, getItem(k){ return Object.prototype.hasOwnProperty.call(this._s,k) ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
const windowObj = { VERKSTAD_LAST: null };
windowObj.window = windowObj;
const ctx = { window: windowObj, document: { querySelectorAll(){ return []; }, getElementById(){ return null; } }, localStorage: ls, Date, console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const T = ctx.window.HJALPBOT_TIPS;
assert.ok(T && T.pick && T.all);
const ids = T.all().map(x => x.id);
assert.ok(ids.includes('verkstadstimmar-flyttad'));
const tip = T.all().find(x => x.id === 'verkstadstimmar-flyttad');
assert.equal(typeof tip.audience, 'function');
assert.equal(tip.audience(), true, 'audience always true for this tip');
assert.match(tip.text, /Meddelanden i din profil/);
assert.match(tip.text, /verkstadstimmar/i);
assert.doesNotMatch(tip.text, /\bStig\b|\bhen\b/);
assert.equal(tip.maxShows, 3);

ls.setItem('taxi_driver', '900001');
let hit = T.pick({ char: 'robot' });
assert.equal(hit && hit.id, 'verkstadstimmar-flyttad');

// skip if opened Meddelanden
T.markUsed('inkorg');
assert.equal(T.pick({ char: 'robot' }), null);
ls._s = { taxi_driver: '900001' };

// skip if opened Ärenden/verkstad
T.markUsed('verkstad');
assert.equal(T.pick({ char: 'robot' }), null);
ls._s = { taxi_driver: '900001' };

// skip if submitted (flag)
T.markUsed('submitted');
assert.equal(T.pick({ char: 'robot' }), null);
ls._s = { taxi_driver: '900001' };

// skip if VERKSTAD_LAST has history
windowObj.VERKSTAD_LAST = { entries: [{ id: 1 }], summary: { pending_n: 0 } };
assert.equal(T.pick({ char: 'robot' }), null);
windowObj.VERKSTAD_LAST = null;

// max 3 shows
T.markShown('verkstadstimmar-flyttad');
T.markShown('verkstadstimmar-flyttad');
T.markShown('verkstadstimmar-flyttad');
assert.equal(T.shownCount('verkstadstimmar-flyttad'), 3);
assert.equal(T.pick({ char: 'robot' }), null);
assert.ok(T.pick({ char: 'robot', skipShows: true }));

// other driver still sees it
ls.setItem('taxi_driver', '900002');
assert.equal(T.pick({ char: 'diva' }).id, 'verkstadstimmar-flyttad');

const bot = fs.readFileSync(path.resolve(__dirname, '../../TaxiData/hjalpbot.js'), 'utf8');
assert.match(bot, /HJALPBOT_TIPS/);
assert.match(bot, /previewTip/);
assert.match(bot, /maybeTip/);
assert.doesNotMatch(src + tip.text, /\bStig\b|\bhen\b/);
console.log('UNIT_OK');
