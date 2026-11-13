'use strict';
// Start på hemskärmen (2026-11-13hem1, t1584u): ny start / efter inloggning -> startskärmen,
// minnet av senaste sida bara vid omladdning. Notislänkar (?sida=) öppnar alltid sin sida.
// Offline-DOM (jsdom) via tests/lazy-views/dom.cjs. Kör: node tests/start-hem/unit.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { boot } = require('../lazy-views/dom.cjs');
const pause = ms => new Promise(r => setTimeout(r, ms || 80));
const html = fs.readFileSync(path.join(__dirname, '../../TaxiData/index.html'), 'utf8');
assert.match(html, /getEntriesByType\('navigation'\)/);
assert.match(html, /performance\.navigation\.type === 1/);
assert.match(html, /sessionStorage\.setItem\('taxi_go_home', '1'\)/);
assert.match(html, /localStorage\.setItem\('taxi_view', savedView\)/, 'PR #163: omladdning sätter taxi_view');
const saved = { taxi_view: 'prognos', 'taxi_view_state:fixture:view': JSON.stringify('prognos') };
const atHome = a => !a.js.includes('prognos.js') && !a.w.LAZY.ready('prognos') && a.w.location.hash === '';
(async () => {
  // 1) Omladdning: minnet gäller (#view=prognos och sparad vy), taxi_view sätts (PR #163).
  let a = await boot(saved, '#view=prognos', { navType: 'reload' }); await pause();
  assert(a.w.LAZY.ready('prognos'), 'omladdning återställer Prognos');
  assert.equal(a.w.localStorage.getItem('taxi_view'), 'prognos');
  assert.deepEqual(a.errors, []); a.dom.window.close();
  a = await boot({ 'taxi_view_state:fixture:view': JSON.stringify('prognos') }, '#view=prognos', { navType: 'reload' }); await pause();
  assert(a.w.LAZY.ready('prognos'), 'omladdning med bara hash (delad enhet, PR #163)');
  assert.equal(a.w.localStorage.getItem('taxi_view'), 'prognos'); a.dom.window.close();
  // 2) Ny start (navigate): startskärmen, hash och sparad vy rensas.
  for (const nav of ['navigate', 'back_forward', 'prerender']) {
    a = await boot(saved, '#view=prognos', { navType: nav }); await pause();
    assert(atHome(a), nav + ': startskärmen');
    assert.equal(a.w.location.hash, '', nav + ': hash rensad');
    assert.equal(a.w.localStorage.getItem('taxi_view'), null, nav + ': taxi_view rensad');
    assert.notEqual(a.w.localStorage.getItem('taxi_view_state:fixture:view'), JSON.stringify('prognos'), nav + ': sparad vy rensad');
    assert.deepEqual(a.errors, [], nav + ': inga fel'); a.dom.window.close();
  }
  // 3) Direkt efter inloggning (login gör location.reload()): alltid startskärmen, flaggan förbrukas.
  {
    const b = await (async () => {
      const r = await boot(Object.assign({}, saved), '#view=prognos', { navType: 'reload', beforeScripts: w => w.sessionStorage.setItem('taxi_go_home', '1') });
      await pause(); return r;
    })();
    // boot kör skripten innan vi hinner sätta sessionStorage om beforeScripts inte stöds -> kontrollera båda vägarna
    if (b.w.LAZY.ready('prognos') && b.w.sessionStorage.getItem('taxi_go_home') === '1') throw new Error('beforeScripts stöds inte av dom.cjs');
    assert(atHome(b), 'efter inloggning: startskärmen');
    assert.equal(b.w.sessionStorage.getItem('taxi_go_home'), null, 'flaggan förbrukad');
    assert.equal(b.w.location.hash, ''); b.dom.window.close();
  }
  // 4) Notislänk vid ny start: ?sida=prognos öppnar Prognos ändå.
  a = await boot({}, '?sida=prognos', { navType: 'navigate' }); await pause();
  assert(a.w.LAZY.ready('prognos'), 'notislänk ?sida=prognos öppnar Prognos');
  assert.deepEqual(a.errors, []); a.dom.window.close();
  console.log('START_HEM_OK');
})().catch(e => { console.error(e); process.exit(1); });
