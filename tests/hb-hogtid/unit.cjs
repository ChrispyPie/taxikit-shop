/* eslint-disable */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot-hogtid.js'), 'utf8');
const bot = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot.js'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const om = fs.readFileSync(path.join(root, 'TaxiData/om.js'), 'utf8') + fs.readFileSync(path.join(root, 'TaxiData/om-data.js'), 'utf8');
const help = fs.readFileSync(path.join(root, 'TaxiData/hjalp.js'), 'utf8');

const ss = { _s: {}, getItem(k){ return Object.prototype.hasOwnProperty.call(this._s,k) ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
const doc = {
  visibilityState: 'visible',
  getElementById(){ return null; },
  createElement(){ return { style: {}, setAttribute(){}, appendChild(){}, className: '', innerHTML: '' }; },
  querySelector(){ return null; },
  head: { appendChild(){} },
  body: { appendChild(){} }
};
const windowObj = { ANIMATIONER: { isOn(){ return true; } } };
windowObj.window = windowObj;
const ctx = { window: windowObj, document: doc, sessionStorage: ss, Date, Intl, console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const H = ctx.window.HJALPBOT_HOGTID;
assert.ok(H && H.all && H.active && H.setTestDate);

const ids = H.all().map(x => x.id);
assert.ok(ids.includes('lucia'));
assert.ok(ids.includes('halloween'));
assert.equal(H.tz, 'Europe/Stockholm');
assert.equal(H.capMs, 10 * 60 * 1000);

const lucia = H.all().find(x => x.id === 'lucia');
assert.equal(lucia.month, 12);
assert.equal(lucia.day, 13);
assert.equal(lucia.mode, 'tag');
assert.equal(lucia.order && lucia.order.join(','), 'diva,chauffor,robot');
assert.equal(lucia.outfits.diva, 'lucia');
assert.equal(lucia.outfits.robot, 'pepparkaka');
assert.equal(lucia.outfits.chauffor, 'stjarngosse');
assert.match(lucia.lines.diva, /God Lucia/);
assert.match(lucia.lines.robot, /pepparkaka|Luciatåg/i);
assert.match(lucia.lines.chauffor, /stjärngosse|God Lucia/i);

const hw = H.all().find(x => x.id === 'halloween');
assert.equal(hw.month, 10);
assert.equal(hw.day, 31);
assert.ok(hw.effects.includes('ghosts') && hw.effects.includes('pumpkins'));
assert.ok(hw.outfits.robot && hw.outfits.diva && hw.outfits.chauffor);
assert.ok(hw.lines.robot && hw.lines.diva && hw.lines.chauffor);

function allText() {
  return H.all().map(d => [d.lines.robot, d.lines.chauffor, d.lines.diva].join('\n')).join('\n') + src;
}
assert.doesNotMatch(allText(), /\bhen\b/);
assert.doesNotMatch(allText(), /\bStig\b/);

// Recurring every year, date in Europe/Stockholm
H.setTestDate('2026-12-13');
assert.equal(H.active().id, 'lucia');
assert.equal(H.outfitFor('diva'), 'lucia');
assert.equal(H.outfitFor('robot'), 'pepparkaka');
assert.equal(H.outfitFor('chauffor'), 'stjarngosse');
H.setTestDate('2027-12-13');
assert.equal(H.active().id, 'lucia');
H.setTestDate('2026-10-31');
assert.equal(H.active().id, 'halloween');
H.setTestDate('2027-10-31');
assert.equal(H.active().id, 'halloween');
H.setTestDate('2026-11-11');
assert.equal(H.active(), null);

// Timezone edges: Stockholm CET in December
H.setTestDate(new Date('2026-12-12T23:30:00Z')); // 00:30 on the 13th in Stockholm
assert.equal(H.active() && H.active().id, 'lucia');
H.setTestDate(new Date('2026-12-12T22:30:00Z')); // 23:30 on the 12th
assert.equal(H.active(), null);
// Oct 31 2026 is CET (DST ended Oct 25)
H.setTestDate(new Date('2026-10-31T21:30:00Z')); // 22:30 Oct 31
assert.equal(H.active() && H.active().id, 'halloween');
H.setTestDate(new Date('2026-10-31T23:30:00Z')); // 00:30 Nov 1
assert.equal(H.active(), null);

// TESTVY override via sessionStorage
H.clearTestDate();
ss.setItem('hb_test_date', '2026-12-13');
assert.equal(H.active().id, 'lucia');
H.clearTestDate();

// Visibility + animation gate
H.setTestDate('2026-12-13');
doc.visibilityState = 'hidden';
assert.equal(H.pageVisible(), false);
assert.equal(H.canStart(H.active()), false);
assert.equal(H.play(H.active()), false);
doc.visibilityState = 'visible';
windowObj.ANIMATIONER.isOn = function () { return false; };
assert.equal(H.canStart(H.active()), false);
windowObj.ANIMATIONER.isOn = function () { return true; };
assert.equal(H.canStart(H.active(), { skipCap: true }), true);

// outfits exist as SVG
['lucia', 'pepparkaka', 'stjarngosse', 'halloween-diva', 'halloween-robot', 'halloween-chauffor'].forEach(function (o) {
  const g = H.gearSvg(o);
  assert.ok(g && g.indexOf('<g') === 0, 'gear ' + o);
});

// Surprise: nothing in Om, help or changelog
['lucia', 'Halloween', 'luciatåg', 'pepparkaka', 'stjärngosse', 'högtid'].forEach(function (w) {
  const re = new RegExp(w, 'i');
  assert.doesNotMatch(changelog, re, 'changelog mentions ' + w);
  assert.doesNotMatch(om, re, 'om mentions ' + w);
  assert.doesNotMatch(help, re, 'help mentions ' + w);
});

// Wired into the app
assert.match(idx, /hjalpbot-hogtid\.js\?v=20261111hogtid1/);
assert.match(idx, /hjalpbot\.js\?v=20261111hogtid1/);
assert.match(bot, /HJALPBOT_HOGTID/);
assert.match(bot, /previewHoliday/);
assert.match(bot, /pageVisible/);
assert.match(bot, /pauseStickyBubble/);
assert.match(bot, /flushPendingTip/);
assert.match(bot, /persist: true/);
// Tip: count only when visible, no auto-timeout for sticky tips
assert.match(bot, /sticky && pageVisible\(\) && opt\.tip && opt\.tip\.id/);
assert.match(bot, /if \(!sticky\) state\.hideT = setTimeout\(hideBubble, BUBBLE_MS\)/);
assert.match(bot, /if \(!pageVisible\(\)\) return false;/);
assert.doesNotMatch(bot, /if \(T\.markShown\) T\.markShown\(hit\.id\);\s*say\(hit\.text/);
assert.match(bot, /visibilityState === 'visible'/);
assert.match(bot, /HJALPBOT_HOGTID\.onVisibility/);
assert.doesNotMatch(bot + src, /\bhen\b|\bStig\b/);

console.log('UNIT_OK');
