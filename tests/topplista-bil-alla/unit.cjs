'use strict';
// Topplistor Bil: alla i åkeriet ser alla bilar öppet (nummer, modell, plats,
// belopp). Förare-vyn är oförändrad. Rankning räknas på hela listan.
// Kör: node tests/topplista-bil-alla/unit.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot } = require('../lazy-views/dom.cjs');

const root = path.resolve(__dirname, '../..');
const pause = ms => new Promise(r => setTimeout(r, ms || 150));

const js = fs.readFileSync(path.join(root, 'TaxiData/topplistor.js'), 'utf8');
const cl = fs.readFileSync(path.join(root, 'TaxiData/changelog.js'), 'utf8');
const lv = fs.readFileSync(path.join(root, 'TaxiData/lazy-views.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261114f_topplista_bil_alla.sql'), 'utf8');
const undo = fs.readFileSync(path.join(root, 'supabase/migrations/undo/20261114f_topplista_bil_alla_undo.sql'), 'utf8');

assert.doesNotMatch(cl, /\bhen\b|\bStig\b/);
assert.match(cl, /id: '2026-11-14bil1'/);
assert.match(cl, /Topplistor, Bil: du ser nu alla bilar med nummer, modell, plats och belopp/);
assert.doesNotMatch(cl.split("id: '2026-11-14bil1'")[1].split(']},')[0], /anonym/);
assert.match(cl.split("id: '2026-11-14bil1'")[1].split('rader:')[0], /tid: '20:33'/);
assert.ok(cl.indexOf("'2026-11-14bil1'") < cl.indexOf("'2026-11-14ladd1'"), 'nyheten överst');

assert.match(lv, /topplistor\.js\?v=20261123adv2/);
assert.match(lv, /changelog\.js\?v=20261123adv2/);
assert.match(html, /lazy-views\.js\?v=20261123adv2/);

assert.match(mig, /get_topplista_metric/);
assert.match(mig, /get_rekord_metric/);
assert.match(mig, /'scope', 'all'/);
assert.doesNotMatch(mig, /then 'own'|scope = 'own'|scope', 'anon'/);
assert.doesNotMatch(mig, /or vals\.ent = v_car/);
assert.doesNotMatch(mig, /or b\.ent = v_car/);
assert.match(mig, /own_row/);
assert.match(mig, /from ranked\)/);
assert.match(mig, /v_entity = 'forare' and v_owner/);
assert.match(mig, /Applicera inte förrän go-live/);
assert.match(undo, /get_topplista_metric/);
assert.match(undo, /then 'own'/);
assert.match(undo, /filtered/);
assert.doesNotMatch(js, /Andra bilar visas anonymt/);
assert.match(js, /Din bil är markerad/);

const octRows = [
  { pos: 1, v: 176595, id: 'A191', modell: 'Renault Trafic' },
  { pos: 2, v: 175379, id: 'A420', modell: 'Renault Trafic' },
  { pos: 3, v: 131807, id: 'A94', modell: 'Renault Trafic' },
  { pos: 4, v: 110732, id: 'A70', modell: 'Toyota Mirai', du: true },
  { pos: 5, v: 96761, id: 'A419', modell: 'Toyota Mirai' },
  { pos: 6, v: 88732, id: 'A198', modell: 'Toyota Mirai' },
  { pos: 7, v: 74949, id: 'A446', modell: 'Toyota Mirai' }
];

async function openBil(data) {
  const a = await boot(
    { tl_mode: 'bil', tl_tab: 'manad', tl_view: 'topplista' },
    '#view=topplistor',
    { navType: 'reload', fixtures: { get_topplista_metric: data, get_rekord_metric: data } }
  );
  await a.w.openItem('topplistor');
  for (let i = 0; i < 40 && !a.w.document.getElementById('tl-body')?.textContent; i++) await pause(50);
  return a;
}

(async () => {
  const all = {
    view: 'topplista', metric: 'inkort', sort: 'desc', entity: 'bil',
    scope: 'all', own: 'A70', n: 7, me: { pos: 4, v: 110732 },
    rows: octRows
  };
  const a = await openBil(all);
  assert.deepEqual(a.errors, [], 'js-fel: ' + a.errors.join('; '));
  const body = a.w.document.getElementById('tl-body').innerHTML;
  const text = a.w.document.getElementById('tl-body').textContent;
  assert.doesNotMatch(text, /Visar bara din bil|Andra bilar visas inte|Andra bilar visas anonymt/);
  assert.match(text, /Din bil är markerad/);
  assert.match(text, /Du: plats 4 av 7/);
  assert.match(text, /7 bilar/);
  for (const r of octRows) {
    assert.match(body, new RegExp(r.id), 'saknar ' + r.id);
    assert.match(body, new RegExp(r.modell), 'saknar modell ' + r.modell);
  }
  assert.match(text.replace(/\u00a0/g, ' '), /110\s*732/);
  assert.match(body, /4\./);
  const ownRow = [...a.w.document.querySelectorAll('#tl-body .tl-row')].find(el => /A70/.test(el.textContent));
  assert.ok(ownRow, 'egen rad');
  assert.ok(ownRow.classList.contains('du'), 'egen bil markerad');
  const first = [...a.w.document.querySelectorAll('#tl-body .tl-row')].find(el => /A191/.test(el.textContent));
  assert.ok(first && !first.classList.contains('du'), 'andras bilar inte markerade som du');
  assert.ok(a.requests.includes('get_topplista_metric'), 'anropar get_topplista_metric');
  a.dom.window.close();
  console.log('UNIT_OK bil öppen lista, plats 4, egen markerad');

  const legacy = {
    view: 'topplista', metric: 'inkort', entity: 'bil',
    scope: 'own', own: 'A70', n: 7, me: { pos: 1, v: 110732 },
    rows: [{ pos: 1, v: 110732, id: 'A70', modell: 'Toyota Mirai', du: true }]
  };
  const b = await openBil(legacy);
  const t2 = b.w.document.getElementById('tl-body').textContent;
  assert.match(t2, /Visar bara din bil \(A70\)/);
  assert.doesNotMatch(t2, /A191/);
  b.dom.window.close();
  console.log('UNIT_OK äldre scope=own visar fortfarande låstext');

  const forare = {
    view: 'topplista', metric: 'inkort', entity: 'forare',
    scope: 'all', named: false, n: 3, me: { pos: 2, v: 50000 },
    rows: [
      { pos: 1, v: 90000 },
      { pos: 2, v: 50000, du: true },
      { pos: 3, v: 20000 }
    ]
  };
  const c = await boot(
    { tl_mode: 'forare', tl_tab: 'manad', tl_view: 'topplista' },
    '#view=topplistor',
    { navType: 'reload', fixtures: { get_topplista_metric: forare } }
  );
  await c.w.openItem('topplistor');
  for (let i = 0; i < 40 && !c.w.document.getElementById('tl-body')?.textContent; i++) await pause(50);
  const t3 = c.w.document.getElementById('tl-body').textContent;
  const h3 = c.w.document.getElementById('tl-body').innerHTML;
  assert.match(t3, /Bara din egen rad visas som "Du"/);
  assert.match(t3, /Du: plats 2 av 3/);
  assert.match(h3, />Du</);
  assert.doesNotMatch(t3, /710022|417480|A70|Visar bara din bil/);
  const du = [...c.w.document.querySelectorAll('#tl-body .tl-row')].filter(el => el.classList.contains('du'));
  assert.equal(du.length, 1);
  assert.deepEqual(c.errors, []);
  c.dom.window.close();
  console.log('UNIT_OK förare-vyn oförändrad (andras id syns inte)');
})().catch(e => { console.error(e); process.exitCode = 1; });
