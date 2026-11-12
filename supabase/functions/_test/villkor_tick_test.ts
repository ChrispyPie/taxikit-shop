// Kör: deno test -A --import-map=supabase/functions/_test/import_map.json supabase/functions/_test/villkor_tick_test.ts
// Edge-funktionen bevakning, tick: tillfälliga tågbevakningar och Mina tågnotiser följer förarens villkor.
// Små förseningar: ingen push, ingen rad i notisflödet (men senast sedd tid sparas). 5 h sent: push.
// Ljud av: push med silent. Villkoren saknas (migrationen inte körd): standard (tystare). Attrapper, inget nätverk.
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); }
type Call = { fn: string; args: Record<string, unknown> };
const g = globalThis as unknown as Record<string, unknown>;
let handler: ((r: Request) => Promise<Response>) | null = null;
(Deno as unknown as { serve: unknown }).serve = (h: (r: Request) => Promise<Response>) => { handler = h; return {}; };
Deno.env.set("SUPABASE_URL", "http://mock"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "mock");

const iso = (min: number) => new Date(Date.now() + min * 60e3).toISOString();
const schedA = iso(150), schedB = iso(120), schedC = iso(100);
const trains = [
  { id: "423", dir: "ANK", sched: schedA, est: iso(150 + 12), other: "Stockholm C", otherSig: "Cst", product: "SJ Snabbtåg", snabb: true, track: "5" },
  { id: "425", dir: "ANK", sched: schedB, est: iso(120 + 300), other: "Stockholm C", otherSig: "Cst", product: "SJ Snabbtåg", snabb: true, track: "6" },
  { id: "427", dir: "ANK", sched: schedC, est: iso(100 + 12), other: "Stockholm C", otherSig: "Cst", product: "SJ Snabbtåg", snabb: true, track: "7" },
];
const watches = [
  { id: 1, driver_id: "D", ident: "423", sched: schedA, label: "", state: {}, expires_at: iso(400) },
  { id: 2, driver_id: "D", ident: "425", sched: schedB, label: "", state: {}, expires_at: iso(400) },
];
const rule = { id: 5, driver_id: "R", origins: ["sthlm"], fast_only: true, train_nos: [], lead_min: 0, notify_delay: true, delay_min: 10, notify_cancel: true };

async function tick(villkor: unknown) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((u: string) => String(u).includes("train") || String(u).includes("tag.json")
    ? Promise.resolve(new Response(JSON.stringify({ trains }))) : Promise.reject(new Error("no net"))) as typeof fetch;
  g.__calls = []; g.__sent = [];
  g.__rpc = (fn: string, a: Record<string, unknown>) => {
    if (fn === "bev_svc_secret") return a.p_name === "BEVAKNING_TICK_KEY" ? "k" : "v";
    if (fn === "bev_svc_active") return a.p_kind === "tag" ? watches : [];
    if (fn === "tw_svc_active") return { watches: [rule], sent: [] };
    if (fn === "bev_svc_villkor") return villkor;
    if (fn === "bev_svc_targets") return [{ id: 1, endpoint: "https://push.example/" + a.p_driver, p256dh: "x", auth: "y" }];
    if (fn === "notis_svc_add") return true;
  };
  await import("../bevakning/index.ts");
  assert(handler, "Deno.serve");
  const r = await handler!(new Request("http://x/", { method: "POST", headers: { "x-tick-key": "k" }, body: JSON.stringify({ action: "tick" }) }));
  globalThis.fetch = realFetch;
  const calls = g.__calls as Call[];
  const sent = (g.__sent as { endpoint: string; payload: string }[]).map((s) => ({ to: s.endpoint.split("/").pop(), ...JSON.parse(s.payload) }));
  return { j: await r.json(), calls, sent };
}

Deno.test("tick: villkoren saknas (ingen migration) → standard: bara 5 h-tåget ger notis, med ljud", async () => {
  const { j, calls, sent } = await tick(null);
  eq(j.tag, 1, "tillfälliga: en notis");
  eq(j.tagnotis, 1, "Mina tågnotiser: en notis");
  eq(sent.map((s) => [s.to, s.tag, s.silent, s.v]).sort(), [["D", "tag-425", false, 1], ["R", "tag-425", false, 1]], "bara 425 (5 h), med ljud");
  eq(calls.filter((c) => c.fn === "notis_svc_add").map((c) => c.args.p_tag).sort(), ["tag-425", "tag-425"], "notisflödet: inget för små förseningar");
  const upd = calls.filter((c) => c.fn === "bev_svc_update");
  const a = upd.find((c) => c.args.p_id === 1);
  assert(a, "423: tillstånd sparas fast ingen notis");
  eq((a!.args.p_state as Record<string, unknown>).seen, trains[0].est, "423: senast sedd");
  assert(!("est" in (a!.args.p_state as Record<string, unknown>)), "423: ingen notis-tid");
  const marks = calls.filter((c) => c.fn === "tw_svc_mark").map((c) => c.args.p_ident).sort();
  eq(marks, ["423", "425", "427"], "Mina tågnotiser: alla tre markeras (senast sedd), bara en skickas");
  assert(calls.some((c) => c.fn === "bev_svc_villkor"), "villkoren hämtas");
});

Deno.test("tick: ljud av för D, per avgång för R (427 med egna villkor: tyst under 5 min, nära ankomst 120)", async () => {
  const { sent } = await tick({
    D: { v: 1, tag: { default: { sound: false } } },
    R: { v: 1, tag: { default: {}, dep: { ["t427|" + new Date(Date.parse(schedC)).toISOString()]: { small_min: 5, lead_min: 120, sound: true } } } },
  });
  const byTo = (to: string) => sent.filter((s) => s.to === to).map((s) => [s.tag, s.silent]).sort();
  eq(byTo("D"), [["tag-425", true]], "D: 5 h-tåget som tyst notis");
  eq(byTo("R"), [["tag-425", false], ["tag-427", false]], "R: 427 (12 min sen, inom 120 min) med egna villkor + 425");
});
