'use strict';
// När "Dölj privata moduler" är på: notisklockan och en begränsad profil (namn, förarnummer, logga ut) ska synas.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const js = fs.readFileSync(path.join(root, 'TaxiData/delad-enhet.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const notis = fs.readFileSync(path.join(root, 'TaxiData/notis.js'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'TaxiData/sw.js'), 'utf8');

assert.doesNotMatch(js, /\bStig\b/);
assert.doesNotMatch(html, /\bStig\b/);
assert.doesNotMatch(notis, /\bStig\b/);
assert.doesNotMatch(cl.split("id: '2026-11-22zprof1'")[1].split(']},')[0], /\b(Stig|hen)\b/);
assert.match(cl, /id: '2026-11-22zprof1'/);
assert.match(cl.split("id: '2026-11-22zprof1'")[1].split(']},')[0].split('rader:')[0], /tid: '18:55'/);
assert.match(cl.split("id: '2026-11-22zprof1'")[1].split(']},')[0], /begränsad profil/);
assert.match(cl.split("id: '2026-11-22zprof1'")[1].split(']},')[0], /notiser/i);

assert.match(html, /delad-enhet\.js\?v=20261122zprof1/);
assert.match(html, /lazy-views\.js\?v=20261123ztid1/);
assert.match(lv, /changelog\.js\?v=20261123ztid1/);
assert.match(lv, /notis\.js\?v=20261122zprof1/);
assert.match(sw, /CACHE_VER = '20261123ztid1'/);

// notiser är inte längre en dold vy, så klockan kan laddas
const priv = js.split('var PRIVATE_VIEWS')[1].split(';')[0];
assert.match(priv, /profil:\s*1/);
assert.match(priv, /inkorg:\s*1/);
assert.doesNotMatch(priv, /notiser:\s*1/);

// klockan och namnet ska synas; fullständig profil, inkorg och påminnelse förblir dolda
const css = html.split('html.delad-hide-private')[1] ? html.slice(html.indexOf('html.delad-hide-private')) : html;
assert.doesNotMatch(html, /html\.delad-hide-private #notis-btn/);
assert.doesNotMatch(html, /html\.delad-hide-private \.notis-btn/);
assert.doesNotMatch(html, /html\.delad-hide-private #full-name/);
assert.match(html, /html\.delad-hide-private #menu-profile/);
assert.match(html, /html\.delad-hide-private #menu-inkorg/);
assert.match(html, /html\.delad-hide-private #profile-reminder/);
assert.match(html, /html\.delad-hide-private #home-devices/);

// begränsad profil: namn + förar-ID skrivs även när hide är på, men ingen profilbild
const setFull = html.split('function setFullName()')[1].split('window.onDeladModeChange')[0];
assert.match(setFull, /fn\.textContent = fullName \|\| driverId/);
assert.match(setFull, /Förar-ID /);
assert.match(setFull, /if \(hidePrivateOn\(\)\) \{[\s\S]*?PROFILBILD\.reset/);
assert.doesNotMatch(setFull.split('if (hidePrivateOn())')[1], /fn\.textContent = ''/);

// openProfile och inkorg förblir spärrade
assert.match(html, /function openProfile\(opts\) \{\s*if \(hidePrivateOn\(\)\) return;/);
assert.match(html, /function openInbox\(opts\) \{\s*if \(hidePrivateOn\(\)\) return;/);

// badges hämtas även när hide är på, men inte för inkorg/forum/bil/profil
assert.doesNotMatch(lv, /refreshBadges=function\(force\)\{if\(window\.DELAD&&DELAD\.isHidePrivate/);
assert.match(lv, /var hide=!!\(window\.DELAD&&DELAD\.isHidePrivate&&DELAD\.isHidePrivate\(\)\)/);
assert.match(lv, /if\(hide\)\{window\.INKORG_HAS=false/);
assert.match(lv, /setBadge\('notiser',d\.notices\|\|0\)/);
assert.match(lv, /setBadge\('inkorg',0\);setBadge\('profbtn',false\)/);
assert.doesNotMatch(lv, /bev-open'\)\{if\(window\.DELAD&&DELAD\.isHidePrivate/);

// inställningstexten nämner begränsad profil och notiser
assert.match(js, /begränsad profil \(namn, förarnummer och logga ut\)/);
assert.match(js, /Notiser och en begränsad profil/);

// privat-notiser som döljs i flödet och inte öppnar dolda sidor
assert.match(notis, /PRIVATE_NOTIS_CATS = \{ meddelanden: 1, forum: 1, bil: 1, sjuk: 1, konto: 1 \}/);
assert.match(notis, /function hiddenNotis\(it\)/);
assert.match(notis, /if \(hiddenNotis\(it\)\) return;/);
assert.match(notis, /if \(hidePriv\(\)\) \{\s*return allItems\(\)\.filter\(function \(x\) \{ return !x\.read && !hiddenNotis\(x\); \}\)\.length;/);

// Runtime: dolda kategorier filtreras bara när hide är på
function catOf(it) {
  if (!it) return 'other';
  if (it.case_kind && it.case_id) return 'meddelanden';
  var k = String(it.kind || '');
  if (k === 'tag') return 'tag';
  if (k === 'flyg') return 'flyg';
  if (k === 'bat') return 'bat';
  if (k === 'reminder' || k === 'event' || k.indexOf('kal') === 0) return 'event';
  if (k === 'nyheter') return 'nyheter';
  if (k === 'konto') return 'konto';
  if (k === 'prognos') return 'prognos';
  if (k.indexOf('forum') === 0) return 'forum';
  if (k.indexOf('bil') === 0) return 'bil';
  if (k === 'sjuk') return 'sjuk';
  if (k === 'test') return 'test';
  return 'other';
}
const PRIVATE_NOTIS_CATS = { meddelanden: 1, forum: 1, bil: 1, sjuk: 1, konto: 1 };
function hidden(hide, it) { return hide && !!PRIVATE_NOTIS_CATS[catOf(it)]; }

assert.equal(hidden(true, { kind: 'flyg' }), false);
assert.equal(hidden(true, { kind: 'tag' }), false);
assert.equal(hidden(true, { kind: 'bat' }), false);
assert.equal(hidden(true, { kind: 'prognos' }), false);
assert.equal(hidden(true, { kind: 'nyheter' }), false);
assert.equal(hidden(true, { kind: 'event' }), false);
assert.equal(hidden(true, { kind: 'test' }), false);
assert.equal(hidden(true, { kind: 'sjuk' }), true);
assert.equal(hidden(true, { kind: 'forum' }), true);
assert.equal(hidden(true, { kind: 'forum_reply' }), true);
assert.equal(hidden(true, { kind: 'bil_fault' }), true);
assert.equal(hidden(true, { kind: 'konto' }), true);
assert.equal(hidden(true, { case_kind: 'arende', case_id: 1 }), true);
assert.equal(hidden(false, { kind: 'sjuk' }), false);
assert.equal(hidden(false, { kind: 'flyg' }), false);

console.log('HIDE_LIMITED_UNIT_OK');
