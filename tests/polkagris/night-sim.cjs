/* Simulerar ett typiskt nattpass (17–06) mot samma kadensregler som SQL. */
'use strict';

const COMMON = ['hem', 'ankomster', 'prognos', 'kordata'];
const ALL = [
  'hem', 'kordata', 'lonekoll', 'ankomster', 'prognos', 'kalender',
  'topplistor', 'forum', 'installningar', 'om', 'vader', 'nyheter',
  'advent', 'inkorg', 'hb'
];
const RARE = ALL.filter((p) => !COMMON.includes(p));
const START = 17 * 60; // minutes from midnight of shift start date
const END = 24 * 60 + 6 * 60; // 06:00 next day = 1800
const TICK = 25 / 60; // minutes
const RUSHES = [17 * 60 + 15, 21 * 60, 24 * 60, 24 * 60 + 3 * 60];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashDelay(driver, shiftKey) {
  let h = 0;
  const s = String(driver) + shiftKey;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return 3 + (Math.abs(h) % 8);
}

function pickPageCommon(rng, used) {
  const pool = COMMON.filter((p) => !used.has(p));
  const src = pool.length ? pool : COMMON;
  return src[Math.floor(rng() * src.length)];
}

function pickPage(rng, used) {
  const commonPool = COMMON.filter((p) => !used.has(p));
  const allPool = ALL.filter((p) => !used.has(p));
  let pool;
  if (rng() < 0.67 && commonPool.length) pool = commonPool;
  else if (allPool.length) pool = allPool;
  else pool = ALL;
  return pool[Math.floor(rng() * pool.length)];
}

function weightedPage(rng) {
  const r = rng();
  if (r < 0.20) return 'hem';
  if (r < 0.55) return 'ankomster';
  if (r < 0.80) return 'prognos';
  if (r < 0.95) return 'kordata';
  return RARE[Math.floor(rng() * RARE.length)];
}

function usedPlaces(canes, now) {
  const s = new Set();
  for (const c of canes) {
    if (!c.claimed && !c.retired && c.expires > now) s.add(c.place);
  }
  return s;
}

function simulateNight(seed, opts) {
  opts = opts || {};
  const others = opts.others != null ? opts.others : 8;
  const quota = opts.quota != null ? opts.quota : 1;
  const rng = mulberry32(seed);
  const drivers = [];
  // 0 = typical
  for (let i = 0; i <= others; i++) {
    drivers.push({
      id: i === 0 ? 'typical' : 'd' + i,
      page: weightedPage(rng),
      nextPageAt: START + 8 + rng() * 7,
      online: true,
      offlineUntil: 0,
      firstSeen: null,
      claims: { personal: 0, shared: 0, golden: 0 },
      seen: 0,
      points: 0
    });
  }
  // others are away ~15% of the night in chunks
  for (let i = 1; i < drivers.length; i++) {
    if (rng() < 0.5) {
      const gapStart = START + 60 + rng() * 400;
      drivers[i]._plannedGap = [gapStart, gapStart + 40 + rng() * 80];
    }
  }

  const canes = [];
  let nextId = 1;
  let lastSharedAt = -1e9;
  let lastSharedNext = START; // due immediately at shift start
  let lastShiftSpawnIsThis = false;

  function openShared(now) {
    return canes.filter((c) => c.kind === 'shared' && !c.claimed && !c.retired && c.expires > now).length;
  }
  function openGolden(now) {
    return canes.filter((c) => c.kind === 'golden' && !c.claimed && !c.retired && c.expires > now).length;
  }
  function goldMade() {
    return canes.filter((c) => c.kind === 'golden').length;
  }

  function spawnSharedOrGold(now) {
    const gold = quota > 0 && openGolden(now) === 0 && goldMade() < quota;
    const kind = gold ? 'golden' : 'shared';
    const cane = {
      id: nextId++,
      kind,
      points: gold ? 3 : 1,
      place: pickPage(rng, usedPlaces(canes, now)),
      appears: now,
      expires: now + (gold ? 90 : 45),
      nextAt: now + (15 + Math.floor(rng() * 16)),
      claimed: null,
      retired: false,
      forDriver: null
    };
    canes.push(cane);
    lastSharedAt = now;
    lastSharedNext = cane.nextAt;
    lastShiftSpawnIsThis = true;
  }

  function spawnPersonal(now, d) {
    const made = canes.filter((c) => c.kind === 'personal' && c.forDriver === d.id).length;
    if (made >= 2) return;
    const open = canes.some((c) => c.kind === 'personal' && c.forDriver === d.id && !c.claimed && !c.retired && c.expires > now);
    if (open) return;
    const delay = hashDelay(d.id, 'night');
    if (made === 0) {
      if (d.firstSeen == null || now < d.firstSeen + delay) return;
    } else {
      const last = canes.filter((c) => c.kind === 'personal' && c.forDriver === d.id).reduce((m, c) => Math.max(m, c.appears), 0);
      if (now < last + 90) return;
    }
    const exp = Math.min(now + 180, END);
    if (exp <= now) return;
    canes.push({
      id: nextId++,
      kind: 'personal',
      points: 1,
      place: pickPageCommon(rng, usedPlaces(canes, now)),
      appears: now,
      expires: exp,
      nextAt: now + 90,
      claimed: null,
      retired: false,
      forDriver: d.id
    });
  }

  function maybeSpawnShared(now) {
    if (openShared(now) >= 3) return;
    let due = !lastShiftSpawnIsThis || now >= lastSharedNext;
    let rush = false;
    for (const r of RUSHES) {
      if (now >= r && now < r + 20) {
        const already = canes.some((c) => (c.kind === 'shared' || c.kind === 'golden') && c.appears >= r);
        if (!already) rush = true;
      }
    }
    if (!due && !rush) return;
    spawnSharedOrGold(now);
  }

  for (let now = START; now < END; now += TICK) {
    // retire
    for (const c of canes) {
      if (!c.claimed && !c.retired && c.expires <= now) c.retired = true;
    }
    // presence
    for (let i = 0; i < drivers.length; i++) {
      const d = drivers[i];
      if (d._plannedGap && now >= d._plannedGap[0] && now < d._plannedGap[1]) d.online = false;
      else d.online = true;
      if (!d.online) continue;
      if (d.firstSeen == null) d.firstSeen = now;
      if (now >= d.nextPageAt) {
        d.page = weightedPage(rng);
        d.nextPageAt = now + 8 + rng() * 7;
      }
    }

    // spawn on first online typical+anyone "poll"
    const anyoneOnline = drivers.some((d) => d.online);
    if (anyoneOnline) {
      maybeSpawnShared(now);
      for (const d of drivers) {
        if (d.online) spawnPersonal(now, d);
      }
    }

    // claims: shuffle online drivers
    const order = drivers.filter((d) => d.online);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    for (const d of order) {
      for (const c of canes) {
        if (c.claimed || c.retired || c.expires <= now || c.appears > now) continue;
        if (c.kind === 'personal' && c.forDriver !== d.id) continue;
        if (c.place !== d.page) continue;
        d.seen += 1;
        if (c.kind === 'shared' && d.claims.shared >= 3) continue;
        if (c.kind === 'golden' && d.claims.golden >= 1) continue;
        c.claimed = d.id;
        d.claims[c.kind] += 1;
        d.points += c.points;
      }
    }
  }

  const t = drivers[0];
  t.canes = t.claims.personal + t.claims.shared + t.claims.golden;
  t.spawnedShared = canes.filter((c) => c.kind === 'shared').length;
  t.spawnedGolden = canes.filter((c) => c.kind === 'golden').length;
  t.expiredShared = canes.filter((c) => c.kind === 'shared' && c.retired).length;
  return t;
}

function pct(arr, p) {
  const a = arr.slice().sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))));
  return a[i];
}

function mean(arr) {
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

const N = 200;
const rows = [];
for (let i = 0; i < N; i++) rows.push(simulateNight(1000 + i * 17, { others: 8, quota: 1 }));
const canes = rows.map((r) => r.canes);
const points = rows.map((r) => r.points);
const seen = rows.map((r) => r.seen);
const in36 = canes.filter((n) => n >= 3 && n <= 6).length;
const summary = {
  nights: N,
  others: 8,
  quota: 1,
  claimed: {
    p10: pct(canes, 10),
    median: pct(canes, 50),
    p90: pct(canes, 90),
    mean: +mean(canes).toFixed(2),
    in_3_to_6: +(100 * in36 / N).toFixed(1)
  },
  points: {
    p10: pct(points, 10),
    median: pct(points, 50),
    p90: pct(points, 90),
    mean: +mean(points).toFixed(2)
  },
  seen: {
    median: pct(seen, 50),
    mean: +mean(seen).toFixed(2)
  },
  parts: {
    personal_mean: +mean(rows.map((r) => r.claims.personal)).toFixed(2),
    shared_mean: +mean(rows.map((r) => r.claims.shared)).toFixed(2),
    golden_mean: +mean(rows.map((r) => r.claims.golden)).toFixed(2)
  }
};
console.log(JSON.stringify(summary, null, 2));
if (summary.claimed.median < 3 || summary.claimed.median > 6) {
  console.error('median claimed canes outside 3–6:', summary.claimed.median);
  process.exitCode = 1;
} else {
  console.log('night-sim ok: typisk förare tar median', summary.claimed.median, 'klubbor (mål 3–6)');
}
