// prognos-sync v2: ren planeringslogik (inga nätverksanrop, ingen databas).
// index.ts hämtar prognosen och öppna bokningar, anropar plan() och utför sedan ops i ordning.
// Samma fil körs av simuleringen (scripts/prognos-sim.ts) mot sparad historik.
//
// Det nya jämfört med v1 (t833u):
//  1) Glappskydd: en minskning som inte är en korsning räknas först när den syns två minuter i rad.
//     Helt tomt svar när förra minuten hade bokningar = fel hos källan -> ignoreras helt.
//  2) Samma zon+kategori som försvann de senaste 10 min och dyker upp igen -> ingen ny push.
//  3) Tid för nya bokningar i 0–40: Övriga +10 (trolig), övriga bilkategorier +30 (osäker).
//  4) Städning: öppna bokningar som är >15 min passerade stängs ('expired') när prognosen
//     inte längre har så många i zonen/kategorin.
//  5) Barnstol/babyskydd är tillval: de blir en flagga (addons) på bilbokningen i samma zon/block,
//     helst den bil som dök upp eller flyttade samma minut. Inga egna bokningar längre.

export const CAR_CATS = ["app", "ovrigt", "storbil", "elbil"] as const;
export const CHILD_CATS = ["barnstol", "babyskydd"] as const;
export const ALL_FEED_CATS = [...CAR_CATS, ...CHILD_CATS];
export const BOUNDARY_MIN = [40, 80, 120];
export const DEDUPE_MS = 10 * 60_000;
export const EXPIRE_AFTER_MS = 15 * 60_000;

export type Conf = "saker" | "trolig" | "osaker";
export type Trip = [number, number, number];
export type ZoneCounts = Record<string, Trip>;
/** Prognosen i normaliserad form: zon -> { namn, kategori -> [0–40, 40–80, 80–120] } */
export type Feed = Record<string, { name: string; c: ZoneCounts }>;

export type SyncState = {
  v: 2;
  conf: Record<string, ZoneCounts>; // bekräftat läge (det bokningarna i databasen motsvarar)
  raw: Record<string, ZoneCounts>; // senaste råa svar som inte var ett glapp
  gone: Record<string, number[]>; // "zon/kat" -> tider (ms) då något försvann (för push-avdubblering)
  empty?: number; // antal tomma svar i rad som ignorerats
  at: number;
};

export type OpenB = {
  id: number | string; // number i databasen, "t1".. för nya i samma körning
  zone_id: string;
  zone_name?: string;
  category: string;
  block: number; // nuvarande block (current_block)
  est: number; // ms
  obs: number; // ms
  confidence: Conf;
  addons: string[];
};

export type Op =
  | { op: "insert"; tmp: string; zone: string; zname: string; cat: string; est: number; obs: number; block: number; confidence: Conf; addons: string[] }
  | { op: "move"; id: number | string; est: number; block: number; confidence: Conf }
  | { op: "close"; id: number | string; status: "canceled" | "expired" | "merged" }
  | { op: "addons"; id: number | string; addons: string[] };

export type Notice = {
  kind: "new" | "addon";
  zone: string;
  zname: string;
  watchCat: string; // vilken bevakning som ska få pushen (bilkategori eller barnstol/babyskydd)
  carCat: string;
  est: number;
  ref: number | string; // bokningens id eller tmp-id
  confidence: Conf;
  block: number;
  addons: string[];
};

export type PlanStats = {
  glitch: boolean;
  seed: boolean;
  created: number;
  moved: number;
  canceled: number;
  expired: number;
  merged: number;
  pendingFalls: number;
  suppressedPush: number;
  flagsAdded: number;
  flagsRemoved: number;
};

export type PlanResult = { ops: Op[]; notices: Notice[]; state: SyncState; stats: PlanStats };

/** Avrunda som v1 (snap5): sekunder bort, minuter till närmaste 5. */
export function snap5(ms: number): number {
  const m = Math.floor(ms / 60_000);
  return Math.round(m / 5) * 5 * 60_000;
}
export function plusMin(now: number, mins: number): number {
  return snap5(now + mins * 60_000);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// deno-lint-ignore no-explicit-any
export function feedFromPayload(payload: any): Feed {
  const out: Feed = {};
  const zones = payload && payload.zones;
  if (!zones || typeof zones !== "object") return out;
  for (const zid of Object.keys(zones)) {
    const z = zones[zid] || {};
    const c: ZoneCounts = {};
    for (const cat of ALL_FEED_CATS) {
      c[cat] = [0, 1, 2].map((i) => num(z.blocks?.[i]?.[cat])) as Trip;
    }
    out[zid] = { name: String(z.name || zid), c };
  }
  return out;
}

function carTotal(f: Record<string, ZoneCounts> | Feed, isFeed: boolean): number {
  let t = 0;
  for (const zid of Object.keys(f)) {
    // deno-lint-ignore no-explicit-any
    const c: ZoneCounts = isFeed ? (f as Feed)[zid].c : (f as any)[zid];
    for (const cat of CAR_CATS) for (const v of c?.[cat] || []) t += v;
  }
  return t;
}

export function isEmptyFeed(feed: Feed): boolean {
  return carTotal(feed, true) === 0;
}

/**
 * Helt tomt svar (inga bilar alls) när vi har bekräftade bokningar = glapp hos källan,
 * om det är första tomma svaret i rad. Är det tomt även nästa minut gäller det (t.ex. sent på natten).
 */
export function isGlitch(feed: Feed, state: SyncState | null): boolean {
  if (!state || !isEmptyFeed(feed)) return false;
  return carTotal(state.conf, false) > 0 && (state.empty || 0) < 1;
}

function countsOf(feed: Feed): Record<string, ZoneCounts> {
  const o: Record<string, ZoneCounts> = {};
  for (const zid of Object.keys(feed)) {
    o[zid] = {};
    for (const cat of ALL_FEED_CATS) o[zid][cat] = [...(feed[zid].c[cat] || [0, 0, 0])] as Trip;
  }
  return o;
}

const Z3: Trip = [0, 0, 0];

/**
 * Räknar fram nytt bekräftat läge för en zon/kategori.
 * - Korsningar (fall i block N+1 och ökning i block N samma minut) gäller direkt.
 * - Ökningar gäller direkt.
 * - Övriga minskningar gäller bara om förra råa svaret också var lägre (två minuter i rad).
 */
export function debounce(old: Trip, nw: Trip, prevRaw: Trip | null) {
  const fall = [0, 1, 2].map((i) => Math.max(0, old[i] - nw[i]));
  const rise = [0, 1, 2].map((i) => Math.max(0, nw[i] - old[i]));
  const moves: { from: number; to: number; n: number }[] = [];
  for (const from of [2, 1]) {
    const to = from - 1;
    const n = Math.min(fall[from], rise[to]);
    if (n > 0) {
      moves.push({ from, to, n });
      fall[from] -= n;
      rise[to] -= n;
    }
  }
  const cur = [...old] as Trip;
  for (const m of moves) { cur[m.from] -= m.n; cur[m.to] += m.n; }
  for (let b = 0; b < 3; b++) cur[b] += rise[b];
  const confirmedFall = [0, 0, 0];
  let pending = 0;
  for (let b = 0; b < 3; b++) {
    if (nw[b] >= cur[b]) continue;
    const pr = prevRaw ? prevRaw[b] : cur[b];
    if (pr < cur[b]) {
      const n = cur[b] - Math.max(nw[b], pr);
      confirmedFall[b] = n;
      cur[b] -= n;
    }
    if (nw[b] < cur[b]) pending += cur[b] - nw[b];
  }
  return { moves, rise, confirmedFall, next: cur, pending };
}

function byEst(a: OpenB, b: OpenB) {
  return a.est - b.est || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
}

export function newBookingTiming(cat: string, block: number, now: number): { est: number; confidence: Conf } {
  if (block === 2) return { est: plusMin(now, 120), confidence: "trolig" };
  if (block === 1) return { est: plusMin(now, 60), confidence: "osaker" };
  // Block 0 (0–40): Övriga försvinner nästan alltid ~10 min efter att de syns (14 av 15 i historiken).
  if (cat === "ovrigt") return { est: plusMin(now, 10), confidence: "trolig" };
  return { est: plusMin(now, 30), confidence: "osaker" };
}

export type PlanInput = {
  feed: Feed;
  state: SyncState | null;
  prevFeed: Feed | null; // senaste sparade prognos (bara när state saknas, t.ex. första körningen)
  open: OpenB[];
  now: number;
};

export function plan(inp: PlanInput): PlanResult {
  const { feed, now } = inp;
  const stats: PlanStats = {
    glitch: false, seed: false, created: 0, moved: 0, canceled: 0, expired: 0, merged: 0,
    pendingFalls: 0, suppressedPush: 0, flagsAdded: 0, flagsRemoved: 0,
  };
  const ops: Op[] = [];
  const notices: Notice[] = [];

  let state = inp.state;
  const seed = !state && !inp.prevFeed;
  stats.seed = seed;
  if (!state) {
    const base = inp.prevFeed ? countsOf(inp.prevFeed) : {};
    state = { v: 2, conf: base, raw: JSON.parse(JSON.stringify(base)), gone: {}, at: now };
  }
  if (isGlitch(feed, state)) {
    stats.glitch = true;
    return { ops, notices, state: { ...state, empty: (state.empty || 0) + 1, at: now }, stats };
  }
  // Andra tomma svaret i rad: räkna det förra tomma som sett (minskningen är då sedd två gånger).
  const rawPrev: Record<string, ZoneCounts> = (state.empty || 0) > 0 && isEmptyFeed(feed) ? countsOf(feed) : (state.raw || {});

  const conf: Record<string, ZoneCounts> = JSON.parse(JSON.stringify(state.conf || {}));
  const gone: Record<string, number[]> = {};
  for (const k of Object.keys(state.gone || {})) {
    const l = (state.gone[k] || []).filter((t) => now - t < DEDUPE_MS);
    if (l.length) gone[k] = l;
  }
  const noteGone = (key: string) => { (gone[key] = gone[key] || []).push(now); };
  const takeGone = (key: string): boolean => {
    const l = gone[key];
    if (!l || !l.length) return false;
    l.shift();
    return true;
  };

  const open: OpenB[] = inp.open.map((b) => ({ ...b, addons: [...(b.addons || [])] }));
  const isOpen = new Set(open.map((b) => String(b.id)));
  let tmpN = 0;
  const touched = new Map<string, number>(); // id -> block den skapades/flyttades till denna minut

  // Gamla fristående barnstol/babyskydd-bokningar: stängs (de är nu flaggor på bilen).
  for (const b of open) {
    if ((CHILD_CATS as readonly string[]).includes(b.category)) {
      ops.push({ op: "close", id: b.id, status: "merged" });
      isOpen.delete(String(b.id));
      stats.merged++;
    }
  }
  const live = () => open.filter((b) => isOpen.has(String(b.id)));
  const close = (b: OpenB, status: "canceled" | "expired") => {
    ops.push({ op: "close", id: b.id, status });
    isOpen.delete(String(b.id));
    for (const a of b.addons) noteGone(b.zone_id + "/" + a);
  };

  const zoneIds = new Set([...Object.keys(feed), ...Object.keys(conf)]);
  for (const zid of zoneIds) {
    const zname = feed[zid]?.name || open.find((b) => b.zone_id === zid)?.zone_name || zid;
    conf[zid] = conf[zid] || {};
    const prevRawZ: ZoneCounts = rawPrev[zid] || {}; // zon som saknades i förra svaret = nollor
    const newCar = new Map<string, Notice>();
    // Tillvalens korsningar räknas först: flyttar barnstolen 2→1 samma minut som en bil,
    // så är det bilen med barnstol som flyttade.
    const childD: Record<string, ReturnType<typeof debounce>> = {};
    const childMoveLeft: Record<string, number> = {}; // "kat:from" -> antal
    for (const ch of CHILD_CATS) {
      const old = (conf[zid][ch] || Z3) as Trip;
      const nw = (feed[zid]?.c[ch] || Z3) as Trip;
      childD[ch] = debounce(old, nw, (prevRawZ[ch] || Z3) as Trip);
      for (const m of childD[ch].moves) childMoveLeft[ch + ":" + m.from] = m.n;
    }

    for (const cat of CAR_CATS) {
      const old = (conf[zid][cat] || Z3) as Trip;
      const nw = (feed[zid]?.c[cat] || Z3) as Trip;
      const pr = (prevRawZ[cat] || Z3) as Trip;
      const d = seed ? { moves: [], rise: [...nw], confirmedFall: [0, 0, 0], next: [...nw] as Trip, pending: 0 } : debounce(old, nw, pr);
      stats.pendingFalls += d.pending;
      const key = zid + "/" + cat;
      const inBlock = (blk: number) => live().filter((b) => b.zone_id === zid && b.category === cat && b.block === blk).sort(byEst);

      const notify = (b: OpenB) => {
        if (seed) return;
        if (takeGone(key)) { stats.suppressedPush++; return; }
        const n: Notice = { kind: "new", zone: zid, zname, watchCat: cat, carCat: cat, est: b.est, ref: b.id, confidence: b.confidence, block: b.block, addons: b.addons };
        notices.push(n);
        newCar.set(String(b.id), n);
      };
      const insert = (blk: number, est: number, c: Conf) => {
        const tmp = "t" + (++tmpN);
        const b: OpenB = { id: tmp, zone_id: zid, zone_name: zname, category: cat, block: blk, est, obs: now, confidence: c, addons: [] };
        ops.push({ op: "insert", tmp, zone: zid, zname, cat, est, obs: now, block: blk, confidence: c, addons: [] });
        open.push(b); isOpen.add(tmp); touched.set(tmp, blk);
        stats.created++;
        notify(b);
      };

      // Korsningar: 2→1 (exakt 80 min), 1→0 (exakt 40 min) – säker
      for (const m of d.moves) {
        const all = inBlock(m.from);
        const pref: OpenB[] = [];
        for (const b of all) {
          const ch = b.addons.find((a) => (childMoveLeft[a + ":" + m.from] || 0) > 0);
          if (ch && pref.length < m.n) { pref.push(b); childMoveLeft[ch + ":" + m.from]--; }
        }
        const cands = [...pref, ...all.filter((b) => !pref.includes(b))];
        for (let i = 0; i < m.n; i++) {
          const est = plusMin(now, BOUNDARY_MIN[m.to]);
          const it = cands[i];
          if (it) {
            ops.push({ op: "move", id: it.id, est, block: m.to, confidence: "saker" });
            it.est = est; it.block = m.to; it.confidence = "saker";
            touched.set(String(it.id), m.to);
            stats.moved++;
          } else insert(m.to, est, "saker");
        }
      }
      // Nya
      for (const blk of [2, 1, 0]) {
        for (let i = 0; i < d.rise[blk]; i++) {
          const t = newBookingTiming(cat, blk, now);
          insert(blk, t.est, t.confidence);
        }
      }
      // Bekräftade minskningar (sett två minuter i rad): äldsta tiden i blocket först
      for (let blk = 0; blk < 3; blk++) {
        if (!d.confirmedFall[blk]) continue;
        const cands = inBlock(blk);
        for (let i = 0; i < Math.min(d.confirmedFall[blk], cands.length); i++) {
          close(cands[i], "canceled");
          noteGone(key);
          stats.canceled++;
        }
      }
      conf[zid][cat] = d.next;

      // Städning: passerade (>15 min) som prognosen inte längre stöder
      const total = d.next[0] + d.next[1] + d.next[2];
      const mine = live().filter((b) => b.zone_id === zid && b.category === cat);
      let surplus = mine.length - total;
      if (surplus > 0) {
        const old15 = mine.filter((b) => b.est < now - EXPIRE_AFTER_MS).sort(byEst);
        for (const b of old15) {
          if (surplus <= 0) break;
          close(b, "expired");
          stats.expired++;
          surplus--;
        }
      }
    }

    // Tillval: barnstol/babyskydd som flagga på en bil i samma block
    for (const ch of CHILD_CATS) {
      const nw = (feed[zid]?.c[ch] || Z3) as Trip;
      const d = seed ? { next: [...nw] as Trip, pending: 0 } : childD[ch];
      stats.pendingFalls += d.pending;
      conf[zid][ch] = d.next;
      const key = zid + "/" + ch;
      for (let blk = 0; blk < 3; blk++) {
        const cars = live().filter((b) => b.zone_id === zid && b.block === blk && (CAR_CATS as readonly string[]).includes(b.category));
        const flagged = cars.filter((b) => b.addons.includes(ch)).sort((a, b) => byEst(b, a));
        const want = d.next[blk];
        if (flagged.length > want) {
          for (const b of flagged.slice(0, flagged.length - want)) {
            b.addons = b.addons.filter((a) => a !== ch);
            ops.push({ op: "addons", id: b.id, addons: [...b.addons] });
            noteGone(key);
            stats.flagsRemoved++;
          }
        } else if (flagged.length < want) {
          const free = cars.filter((b) => !b.addons.includes(ch));
          const pri = free.filter((b) => touched.get(String(b.id)) === blk).sort(byEst);
          const rest = free.filter((b) => touched.get(String(b.id)) !== blk).sort(byEst);
          for (const b of [...pri, ...rest].slice(0, want - flagged.length)) {
            b.addons = [...b.addons, ch];
            const isTmp = typeof b.id === "string" && b.id.startsWith("t");
            const insOp = isTmp ? ops.find((o) => o.op === "insert" && o.tmp === b.id) : null;
            if (insOp && insOp.op === "insert") insOp.addons = [...b.addons];
            else ops.push({ op: "addons", id: b.id, addons: [...b.addons] });
            stats.flagsAdded++;
            const carNote = newCar.get(String(b.id));
            if (carNote) carNote.addons = [...b.addons];
            if (seed) continue;
            if (takeGone(key)) { stats.suppressedPush++; continue; }
            notices.push({ kind: carNote ? "new" : "addon", zone: zid, zname, watchCat: ch, carCat: b.category, est: b.est, ref: b.id, confidence: b.confidence, block: b.block, addons: [...b.addons] });
          }
        }
      }
    }
  }

  const raw = countsOf(feed);
  return { ops, notices, state: { v: 2, conf, raw, gone, empty: 0, at: now }, stats };
}

/** Pushtext. Behåller "ca HH:MM" (notisKey i notis.ts/sw.js läser tiden därifrån). */
export function noticeText(n: Notice, hm: string, catSv: Record<string, string>): { title: string; body: string; tag: string } {
  const car = catSv[n.carCat] || n.carCat;
  const extra = n.addons.length ? " + " + n.addons.map((a) => (catSv[a] || a).toLowerCase()).join(" + ") : "";
  const what = n.watchCat === n.carCat ? car + extra : (catSv[n.watchCat] || n.watchCat) + " (" + car + ")";
  const when = n.confidence === "osaker" && n.block === 1 ? "om 40–80 min (ca " + hm + ")" : "ca " + hm;
  const title = n.kind === "addon" ? (catSv[n.watchCat] || n.watchCat) + " på förbokning" : "Ny förbokning";
  return { title, body: `${n.zname} · ${what} · ${when}`, tag: "prognos-" + n.zone + "-" + n.watchCat };
}
