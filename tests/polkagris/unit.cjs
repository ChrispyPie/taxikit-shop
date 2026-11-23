/* Polkagrisjakt: en klubba, först till kvarn, 5–60 min, namnlista, nyårsvinnare. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const js = fs.readFileSync(path.join(root, 'TaxiData/polkagris.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'TaxiData/polkagris.css'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261123b_advent_polkagris.sql'), 'utf8');
const undo = fs.readFileSync(path.join(root, 'supabase/migrations/undo/20261123b_advent_polkagris_undo.sql'), 'utf8');
const index = fs.readFileSync(path.join(root, 'TaxiData/index.html'), 'utf8');
const advent = fs.readFileSync(path.join(root, 'TaxiData/advent.js'), 'utf8');

assert.doesNotMatch(js + advent + css, /\bStig\b|\bhen\b/);
assert.match(js, /ALLOW = \{ '710022': 1 \}/);
assert.match(js, /LIVE_FROM = '2026-12-01'/);
assert.match(js, /function isLive/);
assert.match(js, /realToday/);
assert.match(js, /polkagris_claim/);
assert.match(js, /polkagris_state/);
assert.match(js, /fireworks/);
assert.match(js, /prefers-reduced-motion/);
assert.match(css, /prefers-reduced-motion/);
assert.match(js, /td-pk-board/);
assert.match(advent, /data-tab="jakt"/);
assert.match(advent, /data-tab="vinnare"/);
assert.match(index, /polkagris\.js\?v=20261123adv2/);

const places = [...js.matchAll(/^\s+(hem|kordata|lonekoll|ankomster|prognos|kalender|topplistor|forum|installningar|om|vader|nyheter|advent|inkorg|hb):/gm)].map((m) => m[1]);
assert.ok(places.length >= 12, 'enough places, got ' + places.length);

assert.match(sql, /polkagris_one_open/);
assert.match(sql, /claimed_by is null/);
assert.match(sql, /5 \+ floor\(random\(\) \* 56\)/);
assert.match(sql, /private\.polkagris_display_name/);
assert.match(sql, /first_name/);
assert.match(sql, /show_winner/);
assert.match(sql, /v_month = 12 and v_day >= 31/);
assert.match(sql, /demo_read_only/);
assert.match(sql, /pg_advisory_xact_lock/);
assert.match(sql, /grant execute on function public\.polkagris_claim/);
assert.match(undo, /drop table if exists public\.polkagris_canes/);
assert.match(undo, /drop function if exists public\.advent_open/);
assert.match(sql, /private\.advent_is_live/);
assert.match(sql, /private\.advent_is_test/);
assert.match(sql, /2026-12-01 00:00:00/);
assert.match(sql, /not_open_yet/);
assert.match(sql, /advent_season_year/);
assert.match(sql, /advent_purge_prelive/);
assert.match(sql, /season <> 0/);
assert.match(js, /isLive\(\) && inSeasonReal/);


console.log('polkagris unit ok');
