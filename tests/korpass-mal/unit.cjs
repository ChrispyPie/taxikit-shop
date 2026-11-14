'use strict';
// Körpassdata: förarens mål sparades bara i minnet och hoppade tillbaka till
// standard 100 000 kr/månad vid omladdning (2026-11-14mal1).
// Offline-DOM (jsdom) via tests/lazy-views/dom.cjs. Kör: node tests/korpass-mal/unit.cjs
const assert = require('node:assert/strict');
const { boot } = require('../lazy-views/dom.cjs');

const pause = ms => new Promise(r => setTimeout(r, ms || 150));
const kr = s => String(s || '').replace(/[\s\u00a0]/g, '');
const goalText = dash => {
  const row = [...(dash?.querySelectorAll('.stat-row') || [])].find(r => /^\s*Mål\s*$/.test(r.querySelector('.label')?.textContent || '') || (r.querySelector('.label')?.textContent || '').trim() === 'Mål');
  return row ? row.querySelector('.value').textContent.trim() : null;
};

async function openKordata(saved, opts) {
  const st = Object.assign({
    'taxi_view_state:fixture:view': JSON.stringify('kordata'),
    'taxi_view_state:fixture:kordata': JSON.stringify({ tab: 'manad', date: '2026-11-14T12:00:00' })
  }, saved || {});
  const a = await boot(st, '#view=kordata', Object.assign({ navType: 'reload' }, opts || {}));
  for (let i = 0; i < 40 && !/Mål/.test(a.w.document.getElementById('dashboard')?.textContent || ''); i++) await pause(100);
  return a;
}

(async () => {
  // 1) Utan sparat mål visas standard 100 000 kr i månadsvyn.
  const fresh = await openKordata();
  assert.match(kr(goalText(fresh.w.document.getElementById('dashboard'))), /100000kr/, 'standard månadsmål 100 000 kr: ' + goalText(fresh.w.document.getElementById('dashboard')));
  assert.ok(fresh.requests.includes('korpass_mal_get'), 'hämtar målet från servern');
  assert.ok(!fresh.requests.includes('korpass_mal_set'), 'laddar inte upp standardvärden');
  assert.deepEqual(fresh.errors, []);
  fresh.dom.window.close();

  // 2) Ändrat mål sparas i telefonen och skickas till servern, och syns efter omladdning även utan serversvar.
  const edited = await openKordata();
  edited.w.prompt = () => '80000';
  edited.w.editGoal();
  await pause(80);
  const stored = JSON.parse(edited.w.localStorage.getItem('taxi_korpass_mal:fixture') || 'null');
  assert.equal(stored && stored.manad, 80000, 'sparat i localStorage: ' + JSON.stringify(stored));
  assert.equal(stored.dag, 4000);
  assert.equal(stored.vecka, 25000);
  assert.equal(stored.ar, 1200000);
  assert.match(kr(goalText(edited.w.document.getElementById('dashboard'))), /80000kr/, 'visar 80 000 efter ändring');
  assert.ok(edited.requests.includes('korpass_mal_set'), 'anropar korpass_mal_set');
  const storage = {};
  for (let i = 0; i < edited.w.localStorage.length; i++) {
    const k = edited.w.localStorage.key(i);
    storage[k] = edited.w.localStorage.getItem(k);
  }
  assert.deepEqual(edited.errors, []);
  edited.dom.window.close();

  const reloaded = await openKordata(storage, { fixtures: { korpass_mal_get: null } });
  assert.match(kr(goalText(reloaded.w.document.getElementById('dashboard'))), /80000kr/, 'efter omladdning utan serverrad: fortfarande 80 000, inte 100 000');
  assert.ok(reloaded.requests.includes('korpass_mal_set'), 'skickar upp det som fanns i telefonen när servern saknade rad');
  assert.deepEqual(reloaded.errors, []);
  reloaded.dom.window.close();

  // 3) Värde från servern slår ut standard och ev. äldre värde i telefonen.
  const fromSrv = await openKordata(
    { 'taxi_korpass_mal:fixture': JSON.stringify({ dag: 4000, vecka: 25000, manad: 70000, ar: 1200000 }) },
    { fixtures: { korpass_mal_get: { dag: 5000, vecka: 30000, manad: 90000, ar: 1000000 } } }
  );
  assert.match(kr(goalText(fromSrv.w.document.getElementById('dashboard'))), /90000kr/, 'servervärde 90 000 vinner: ' + goalText(fromSrv.w.document.getElementById('dashboard')));
  const afterSrv = JSON.parse(fromSrv.w.localStorage.getItem('taxi_korpass_mal:fixture') || 'null');
  assert.equal(afterSrv.manad, 90000);
  assert.equal(afterSrv.dag, 5000);
  assert.deepEqual(fromSrv.errors, []);
  fromSrv.dom.window.close();

  // 4) Avbruten eller ogiltig inmatning ändrar inget.
  const cancel = await openKordata();
  cancel.w.prompt = () => null;
  cancel.w.editGoal();
  assert.match(kr(goalText(cancel.w.document.getElementById('dashboard'))), /100000kr/);
  cancel.w.prompt = () => 'abc';
  cancel.w.editGoal();
  assert.match(kr(goalText(cancel.w.document.getElementById('dashboard'))), /100000kr/);
  assert.ok(!cancel.requests.includes('korpass_mal_set'));
  assert.deepEqual(cancel.errors, []);
  cancel.dom.window.close();

  console.log('KORPASS_MAL_OK');
})().catch(e => { console.error(e); process.exit(1); });
