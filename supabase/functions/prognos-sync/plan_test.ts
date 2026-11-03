// deno test supabase/functions/prognos-sync/plan_test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { type Feed, type OpenB, plan, type SyncState } from "./plan.ts";

const T0 = Date.UTC(2026, 10, 3, 12, 0, 0);
const MIN = 60_000;
function feed(c: Record<string, [number, number, number]>): Feed {
  const f: Feed = {};
  for (const [k, v] of Object.entries(c)) {
    const [z, cat] = k.split("/");
    f[z] = f[z] || { name: "Zon " + z, c: {} };
    f[z].c[cat] = v;
  }
  return f;
}
// Kör en serie minuter och håller en låtsasdatabas.
function run(seq: Record<string, [number, number, number]>[]) {
  let state: SyncState | null = null;
  const db: (OpenB & { status: string })[] = [];
  let nid = 0;
  const out = [];
  for (let i = 0; i < seq.length; i++) {
    const now = T0 + i * MIN;
    const r = plan({ feed: feed(seq[i]), state, prevFeed: null, open: db.filter((b) => b.status === "open").map((b) => ({ ...b, addons: [...b.addons] })), now });
    const ids = new Map<string, number>();
    const g = (id: number | string) => db.find((b) => b.id === (typeof id === "number" ? id : ids.get(id)))!;
    for (const o of r.ops) {
      if (o.op === "insert") { ids.set(o.tmp, ++nid); db.push({ id: nid, zone_id: o.zone, category: o.cat, block: o.block, est: o.est, obs: o.obs, confidence: o.confidence, addons: [...o.addons], status: "open" }); }
      else if (o.op === "move") Object.assign(g(o.id), { est: o.est, block: o.block, confidence: o.confidence });
      else if (o.op === "close") g(o.id).status = o.status;
      else g(o.id).addons = [...o.addons];
    }
    state = r.state;
    out.push(r);
  }
  return { out, db };
}

Deno.test("ett tomt svar ignoreras, inga bokningar stängs eller pushas igen", () => {
  const { out, db } = run([{ "293/app": [0, 0, 1] }, {}, { "293/app": [0, 0, 1] }]);
  assertEquals(out[1].stats.glitch, true);
  assertEquals(db.filter((b) => b.status === "open").length, 1);
  assertEquals(out[2].notices.length, 0);
});

Deno.test("två tomma svar i rad gäller (natt)", () => {
  const { db } = run([{ "293/app": [0, 0, 1] }, {}, {}]);
  assertEquals(db.filter((b) => b.status === "open").length, 0);
});

Deno.test("minskning i en zon räknas först andra minuten", () => {
  const { out, db } = run([{ "293/app": [0, 0, 2], "1/app": [0, 0, 1] }, { "293/app": [0, 0, 1], "1/app": [0, 0, 1] }, { "293/app": [0, 0, 2], "1/app": [0, 0, 1] }]);
  assertEquals(out[1].stats.canceled, 0);
  assertEquals(out[2].stats.created, 0);
  assertEquals(db.length, 3);
});

Deno.test("ny bokning direkt efter en som försvann pushas inte", () => {
  const { out } = run([{ "293/app": [0, 0, 1] }, { "293/app": [0, 0, 0], "1/app": [1, 0, 0] }, { "1/app": [1, 0, 0] }, { "293/app": [0, 0, 1], "1/app": [1, 0, 0] }]);
  assertEquals(out[2].stats.canceled, 1);
  assertEquals(out[3].stats.created, 1);
  assertEquals(out[3].notices.length, 0);
});

Deno.test("tider i 0–40: Övriga +10 trolig, Kombi +30 osäker", () => {
  const { out, db } = run([{ "1/app": [0, 0, 1] }, { "1/app": [0, 0, 1], "293/ovrigt": [1, 0, 0], "293/app": [1, 0, 0] }]);
  const ov = db.find((b) => b.category === "ovrigt")!;
  const ap = db.find((b) => b.zone_id === "293" && b.category === "app")!;
  // 12:01 + 10 = 12:11 -> 12:10 (5-minutersstreck), 12:01 + 30 -> 12:30
  assertEquals([(ov.est - T0) / MIN, ov.confidence], [10, "trolig"]);
  assertEquals([(ap.est - T0) / MIN, ap.confidence], [30, "osaker"]);
  assertEquals(out[1].notices.length, 2);
});

Deno.test("barnstol blir flagga på bilen som kom samma minut, ingen egen bokning", () => {
  const { out, db } = run([
    { "293/app": [0, 0, 1] },
    { "293/app": [0, 0, 2], "293/barnstol": [0, 0, 1] },
  ]);
  assertEquals(db.length, 2);
  assertEquals(db[1].addons, ["barnstol"]);
  assertEquals(db[0].addons, []);
  const watch = out[1].notices.map((n) => n.watchCat).sort();
  assertEquals(watch, ["app", "barnstol"]);
});

Deno.test("flaggan följer med bilen över 80-gränsen", () => {
  const { db } = run([
    { "293/app": [0, 0, 1] },
    { "293/app": [0, 0, 2], "293/barnstol": [0, 0, 1] },
    { "293/app": [0, 1, 1], "293/barnstol": [0, 1, 0] },
  ]);
  const moved = db.find((b) => b.block === 1)!;
  assertEquals(moved.addons, ["barnstol"]);
  assertEquals(moved.confidence, "saker");
});

Deno.test("osäker som passerat sin tid stängs inte så länge prognosen har den", () => {
  const seq: Record<string, [number, number, number]>[] = [{ "1/app": [0, 0, 1] }, { "1/app": [0, 0, 1], "293/app": [1, 0, 0] }];
  for (let i = 0; i < 50; i++) seq.push({ "1/app": [0, 0, 1], "293/app": [1, 0, 0] });
  const { db } = run(seq);
  assertEquals(db.find((b) => b.zone_id === "293")!.status, "open");
});

Deno.test("städning: passerad >15 min utan stöd i prognosen stängs som expired", () => {
  const conf = { "293": { app: [1, 0, 0] as [number, number, number] } };
  const st: SyncState = { v: 2, conf, raw: JSON.parse(JSON.stringify(conf)), gone: {}, at: T0 };
  const open: OpenB[] = [
    { id: 1, zone_id: "293", category: "app", block: 0, est: T0 - 40 * MIN, obs: T0 - 70 * MIN, confidence: "osaker", addons: [] },
    { id: 2, zone_id: "293", category: "app", block: 0, est: T0 + 10 * MIN, obs: T0 - 20 * MIN, confidence: "osaker", addons: [] },
  ];
  const r = plan({ feed: feed({ "293/app": [1, 0, 0] }), state: st, prevFeed: null, open, now: T0 });
  assertEquals(r.ops, [{ op: "close", id: 1, status: "expired" }]);
});
