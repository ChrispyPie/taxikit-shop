'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const sc = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot-scenarier.js'), 'utf8');
const bot = fs.readFileSync(path.join(root, 'TaxiData/hjalpbot.js'), 'utf8');

assert.match(bot, /HJALPBOT_SCENARIER\.marvinLine/);
assert.match(bot, /mood: 'marvin'/);
assert.match(bot, /Tryck på figuren så svarar den/);
assert.match(bot, /nästa tryck ger en ny replik/);
assert.doesNotMatch(bot, /HB_STAGE\.onFigTap/);
assert.match(sc, /id: 'robot-marvin-prat'/);
assert.match(sc, /chance: 0\.7/);
assert.match(sc, /cooldownMs: 8 \* 60 \* 1000/);
assert.doesNotMatch(sc, /id: 'robot-marvin-planet'/);

const ctx = { window: {}, sessionStorage: { getItem() { return null; }, setItem() {} }, Math, Date, JSON, Intl, console };
vm.createContext(ctx);
vm.runInContext(sc, ctx);
const S = ctx.window.HJALPBOT_SCENARIER;
assert.ok(S && typeof S.marvinLine === 'function');
const all = S.marvinLines();
assert.ok(all.length >= 65, 'för få Marvin-repliker: ' + all.length);
assert.equal(all.length, new Set(all).size, 'dubbletter i Marvin-repliker');
const joined = all.join('\n');
assert.doesNotMatch(joined, /\bStig\b/);
assert.doesNotMatch(joined, /\bhen\b/);
assert.match(joined, /Hjärna stor som en planet/);
const seen = new Set();
for (let i = 0; i < 80; i++) seen.add(S.marvinLine());
assert.ok(seen.size >= 20, 'marvinLine upprepar sig för ofta: ' + seen.size);

const hit = S.pick({ context: 'random', char: 'robot', skipCooldown: true, skipChance: true });
assert.ok(hit && hit.id === 'robot-marvin-prat', 'idle plockar inte Marvin: ' + (hit && hit.id));
assert.ok(hit.mood === 'marvin');
assert.ok(all.includes(hit.text), 'idle-rad saknas i högen');

assert.doesNotMatch(bot + sc, /\bStig\b/);
console.log('MARVIN_UNIT_OK', 'lines=' + all.length, 'uniquePicks=' + seen.size);
