// Simulering av prognos-sync v1 (gamla logiken) mot v2 (plan.ts) på sparad historik.
// Kör: deno run --allow-read scripts/prognos-sim.ts <snaps.json>
// snaps.json: [{ t: sekunder, c: { "zon/kat": [b0, b1, b2] } }, ...] (bara nollskilda nycklar)
import { CAR_CATS, CHILD_CATS, type Feed, type OpenB, plan, plusMin, type SyncState } from "../supabase/functions/prognos-sync/plan.ts";

type Snap = { t: number; c: Record<string, [number, number, number]> | null };
const snaps: Snap[] = JSON.parse(await Deno.readTextFile(Deno.args[0] || "snaps.json"));

function toFeed(c: Snap["c"]): Feed {
  const f: Feed = {};
  for (const [k, v] of Object.entries(c || {})) {
    const [z, cat] = k.split("/");
    f[z] = f[z] || { name: z, c: {} };
    f[z].c[cat] = [v[0] || 0, v[1] || 0, v[2] || 0];
  }
  return f;
}

type Bk = OpenB & { status: string; closedAt?: number; blk0: number; conf0: string; flagT?: number; pushed: boolean };
type Run = { bks: Bk[]; pushes: { t: number; key: string; watch: string }[]; closes: { t: number; key: string; blk: number }[]; snart: number; hidden: number };

function floor5(ms: number) { return ms - (ms % 300_000); }

function evalTick(run: Run, now: number, feed: Feed, showSnart: boolean) {
  for (const b of run.bks) {
    if (b.status !== "open") continue;
    if ((CHILD_CATS as readonly string[]).includes(b.category)) continue;
    if (b.est < floor5(now)) {
      // Bokningen är fortfarande öppen (prognosen har den kvar) men tiden har passerat
      const inFeed = (feed[b.zone_id]?.c[b.category] || [0, 0, 0]).reduce((a, x) => a + x, 0) > 0;
      if (!inFeed) continue;
      if (showSnart && b.est >= now - 3 * 3600_000) run.snart++;
      else run.hidden++;
    }
  }
}

// ---------- v1: samma logik som gamla reconcileZoneCat ----------
function runV1(): Run {
  const run: Run = { bks: [], pushes: [], closes: [], snart: 0, hidden: 0 };
  let prev: Feed | null = null;
  let nid = 0;
  const ALL = [...CAR_CATS, ...CHILD_CATS];
  for (const s of snaps) {
    const now = s.t * 1000;
    const feed = toFeed(s.c);
    const seed = !prev;
    const zones = new Set([...Object.keys(feed), ...Object.keys(prev || {})]);
    for (const z of zones) for (const cat of ALL) {
      const nw = feed[z]?.c[cat] || [0, 0, 0];
      const old = seed ? [0, 0, 0] : (prev![z]?.c[cat] || [0, 0, 0]);
      const rise = [0, 1, 2].map((i) => Math.max(0, nw[i] - old[i]));
      const fall = [0, 1, 2].map((i) => Math.max(0, old[i] - nw[i]));
      const key = z + "/" + cat;
      const byB = (blk: number) => run.bks.filter((b) => b.status === "open" && b.zone_id === z && b.category === cat && b.block === blk).sort((a, b) => a.est - b.est || Number(a.id) - Number(b.id));
      const ins = (blk: number, est: number, conf: OpenB["confidence"]) => {
        run.bks.push({ id: ++nid, zone_id: z, category: cat, block: blk, est, obs: now, confidence: conf, addons: [], status: "open", blk0: blk, conf0: conf, pushed: !seed });
        if (!seed) run.pushes.push({ t: now, key, watch: cat });
      };
      for (const from of [2, 1]) {
        const to = from - 1;
        const mv = Math.min(fall[from], rise[to]);
        if (mv <= 0) continue;
        const c = byB(from);
        for (let i = 0; i < mv; i++) {
          const est = plusMin(now, [40, 80, 120][to]);
          if (c[i]) { c[i].est = est; c[i].block = to; c[i].confidence = "saker"; } else ins(to, est, "saker");
        }
        fall[from] -= mv; rise[to] -= mv;
      }
      for (let i = 0; i < rise[2]; i++) ins(2, plusMin(now, 120), "trolig");
      for (let i = 0; i < rise[1]; i++) ins(1, plusMin(now, 60), "osaker");
      for (let i = 0; i < rise[0]; i++) ins(0, plusMin(now, 20), "osaker");
      for (const blk of [0, 1, 2]) {
        const c = byB(blk);
        for (let i = 0; i < Math.min(fall[blk], c.length); i++) { c[i].status = "canceled"; c[i].closedAt = now; run.closes.push({ t: now, key, blk }); }
      }
    }
    prev = feed;
    evalTick(run, now, feed, false);
  }
  return run;
}

// ---------- v2: plan.ts ----------
function runV2(): Run & { glitches: number; expired: number; flags: number; flagsOnTouched: number; suppressed: number; merged: number } {
  const run = { bks: [] as Bk[], pushes: [] as Run["pushes"], closes: [] as Run["closes"], snart: 0, hidden: 0, glitches: 0, expired: 0, flags: 0, flagsOnTouched: 0, suppressed: 0, merged: 0 };
  let state: SyncState | null = null;
  let nid = 0;
  let lastFeed: Feed = {};
  for (const s of snaps) {
    const now = s.t * 1000;
    const feed = toFeed(s.c);
    const open = run.bks.filter((b) => b.status === "open").map((b) => ({ ...b, addons: [...b.addons] }));
    const res = plan({ feed, state, prevFeed: null, open, now });
    if (res.stats.glitch) { run.glitches++; state = res.state; evalTick(run, now, lastFeed, true); continue; }
    const ids = new Map<string, number>();
    const get = (id: number | string) => run.bks.find((b) => b.id === (typeof id === "number" ? id : ids.get(id)));
    for (const o of res.ops) {
      if (o.op === "insert") {
        const id = ++nid; ids.set(o.tmp, id);
        run.bks.push({ id, zone_id: o.zone, category: o.cat, block: o.block, est: o.est, obs: o.obs, confidence: o.confidence, addons: [...o.addons], status: "open", blk0: o.block, conf0: o.confidence, pushed: false });
      } else if (o.op === "move") { const b = get(o.id)!; b.est = o.est; b.block = o.block; b.confidence = o.confidence; }
      else if (o.op === "close") {
        const b = get(o.id)!; b.status = o.status; b.closedAt = now;
        if (o.status === "canceled") run.closes.push({ t: now, key: b.zone_id + "/" + b.category, blk: b.block });
      } else if (o.op === "addons") { get(o.id)!.addons = [...o.addons]; }
    }
    for (const n of res.notices) run.pushes.push({ t: now, key: n.zone + "/" + n.watchCat, watch: n.watchCat });
    run.expired += res.stats.expired; run.flags += res.stats.flagsAdded; run.suppressed += res.stats.suppressedPush; run.merged += res.stats.merged;
    state = res.state;
    lastFeed = feed;
    evalTick(run, now, feed, true);
  }
  return run;
}

function summarize(name: string, r: Run) {
  const car = r.bks.filter((b) => (CAR_CATS as readonly string[]).includes(b.category));
  // Återskapade: en bokning stängs och samma zon/kategori/block får en ny inom 5 min (glapp i källan)
  let recreated = 0, dupPush = 0;
  for (const b of car) {
    if (b.blk0 === undefined) continue;
    const key = b.zone_id + "/" + b.category;
    if (r.closes.some((c) => c.key === key && c.blk === b.blk0 && b.obs - c.t > 0 && b.obs - c.t <= 300_000)) recreated++;
  }
  for (const p of r.pushes) {
    if (r.closes.some((c) => c.key === p.key && p.t - c.t > 0 && p.t - c.t <= 600_000)) dupPush++;
  }
  // Tidsfel: stängd (försvann ur prognosen) minus uppskattad tid, per startblock/kategori
  const groups: Record<string, number[]> = {};
  for (const b of car) {
    if (b.status !== "canceled" || b.closedAt == null) continue;
    const g = (b.conf0 === "saker" ? "säker" : b.blk0 === 0 ? (b.category === "ovrigt" ? "0–40 Övriga" : "0–40 bil") : b.blk0 === 1 ? (b.confidence === "saker" ? "40–80 → säker" : "40–80 osäker") : (b.confidence === "saker" ? "80–120 → säker" : "80–120 trolig"));
    (groups[g] = groups[g] || []).push((b.closedAt - b.est) / 60000);
  }
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const mae = (a: number[]) => a.reduce((s, x) => s + Math.abs(x), 0) / (a.length || 1);
  console.log(`\n=== ${name} ===`);
  console.log(`bilbokningar skapade: ${car.length}, fristående barn-bokningar: ${r.bks.length - car.length}, pushar: ${r.pushes.length}`);
  console.log(`återskapade (samma block inom 5 min): ${recreated}, pushar inom 10 min efter att samma zon/kategori försvann: ${dupPush}`);
  console.log(`bokningsminuter dolda fast prognosen har dem kvar: ${r.hidden}, visade som "snart": ${r.snart}`);
  console.log("tidsfel (försvann − uppskattad tid), minuter:");
  for (const g of Object.keys(groups).sort()) console.log(`  ${g.padEnd(16)} n=${String(groups[g].length).padStart(4)}  median ${med(groups[g]).toFixed(0).padStart(4)}  medel |fel| ${mae(groups[g]).toFixed(1)}`);
  return { recreated, dupPush, pushes: r.pushes.length, hidden: r.hidden, snart: r.snart, groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, { n: v.length, median: med(v), mae: +mae(v).toFixed(1) }])) };
}

const v1 = runV1();
const v2 = runV2();
const s1 = summarize("v1 (nu)", v1);
const s2 = summarize("v2 (PR)", v2);
const flagged = v2.bks.filter((b) => b.addons.length).length;
console.log(`v2: ignorerade tomma svar: ${v2.glitches}, stängda som passerade >15 min ('expired'): ${v2.expired}, flaggor satta: ${v2.flags}, bilbokningar med barnstol/babyskydd: ${flagged}, nedtystade pushar: ${v2.suppressed}`);
const out = { from: snaps[0].t, to: snaps[snaps.length - 1].t, ticks: snaps.length, v1: s1, v2: { ...s2, glitches: v2.glitches, expired: v2.expired, flags: v2.flags, flaggedBookings: flagged, suppressed: v2.suppressed } };
if (Deno.args[1]) await Deno.writeTextFile(Deno.args[1], JSON.stringify(out, null, 2));
