// Kör: deno test -A --import-map=supabase/functions/_test/import_map.json supabase/functions/_test/tagnotis_test.ts
// Mina tågnotiser: matchning (Stockholm, snabbtåg, tågnummer), förvarning, försening, inställt, inga dubbletter,
// och att tick i edge-funktionen markerar + skickar (attrapper, ingen databas, ingen riktig push).
import { decide, groupOf, isFast, matches, sentMap, MAX_PER_TICK, type TrainWatch } from "../bevakning/tagnotis.ts";

function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); }

const NOW = Date.parse("2026-10-29T19:00:00Z"); // 20:00 svensk tid
const T = (min: number) => new Date(NOW + min * 60e3).toISOString();
const W = (o: Partial<TrainWatch> = {}): TrainWatch => ({ id: 1, driver_id: "A", origins: ["sthlm"], fast_only: true, train_nos: [],
  lead_min: 20, notify_delay: true, delay_min: 10, notify_cancel: true, ...o });
const sj = (o: Record<string, unknown> = {}) => ({ id: "423", dir: "ANK", other: "Stockholm C", otherSig: "Cst", product: "SJ Snabbtåg",
  snabb: true, sched: T(15), est: null, act: null, track: "5", canceled: false, ...o });

Deno.test("matchning: grupp, snabbtåg, tågnummer", () => {
  eq(groupOf(sj()), "sthlm", "Cst"); eq(groupOf({ otherSig: "Sci", other: "Stockholm City" }), "sthlm", "Sci");
  eq(groupOf({ otherSig: "Dk.kh", other: "København H" }), "kbh", "kbh"); eq(groupOf({ otherSig: "Bs", other: "Borås" }), "", "Borås");
  assert(isFast(sj()), "snabb"); assert(isFast({ product: "SJ 3000" }), "SJ 3000"); assert(isFast({ product: "X 2000" }), "X 2000");
  assert(!isFast({ product: "SJ Regional" }), "regional inte snabb");
  assert(matches(W(), sj()), "preset matchar SJ Snabbtåg från Cst");
  assert(!matches(W(), sj({ product: "SJ Regional", snabb: false })), "preset: inte regionaltåg");
  assert(!matches(W(), sj({ other: "Oslo S", otherSig: "No.osl", product: "Vy Snabbtåg" })), "preset: inte Oslo");
  assert(matches(W({ origins: [], fast_only: false, train_nos: ["423"] }), sj()), "tågnummer");
  assert(!matches(W({ origins: [], fast_only: false, train_nos: ["425"] }), sj()), "fel tågnummer");
  assert(matches(W({ origins: ["sthlm", "kbh"], fast_only: false }), sj({ other: "Köpenhamn H", otherSig: "Dk.kh", product: "Öresundståg" })), "flera ursprung");
});

Deno.test("förvarning: X min före ankomst, en gång", () => {
  let r = decide([W()], [sj({ sched: T(25) })], new Map(), NOW);
  eq(r.length, 0, "25 min kvar, 20 min förvarning: inget än");
  r = decide([W()], [sj({ sched: T(18) })], new Map(), NOW);
  eq(r.length, 1, "18 min kvar: notis");
  eq(r[0].msg.title, "🚆 SJ Snabbtåg 423 från Stockholm C ankommer 20:18", "titel");
  eq(r[0].msg.body, "Om 18 min. Spår 5. I tid.", "text"); eq(r[0].msg.tag, "tag-423", "tagg");
  const sent = sentMap([{ driver_id: "A", ident: "423", sched: T(18), state: r[0].state }]);
  eq(decide([W()], [sj({ sched: T(18) })], sent, NOW + 60e3).length, 0, "inte igen");
  eq(decide([W({ lead_min: 0, notify_delay: false })], [sj({ sched: T(5) })], new Map(), NOW).length, 0, "ingen förvarning vald");
  eq(decide([W()], [sj({ sched: T(5), act: T(-1) })], new Map(), NOW).length, 0, "redan ankommit");
});

Deno.test("försening: över gränsen, nytt besked var 10:e min; förvarning tar med förseningen", () => {
  eq(decide([W()], [sj({ sched: T(60), est: T(67) })], new Map(), NOW).length, 0, "7 min: under 10");
  let r = decide([W()], [sj({ sched: T(60), est: T(75) })], new Map(), NOW);
  eq(r[0].msg.title, "🕒 SJ Snabbtåg 423 från Stockholm C: ny tid 21:15", "försenad titel");
  eq(r[0].msg.body, "Planerad 21:00, försenat 15 min. Spår 5.", "försenad text");
  let sent = sentMap([{ driver_id: "A", ident: "423", sched: T(60), state: r[0].state }]);
  eq(decide([W()], [sj({ sched: T(60), est: T(80) })], sent, NOW).length, 0, "+5 min: inget nytt");
  r = decide([W()], [sj({ sched: T(60), est: T(86) })], sent, NOW);
  eq(r.length, 1, "+11 min: nytt besked");
  sent = sentMap([{ driver_id: "A", ident: "423", sched: T(60), state: r[0].state }]);
  r = decide([W()], [sj({ sched: T(60), est: T(86) })], sent, NOW + 70 * 60e3);
  eq(r[0].msg.body, "Om 16 min. Spår 5. 26 min sen (planerad 21:00).", "förvarning med försening");
  eq(decide([W({ notify_delay: false })], [sj({ sched: T(60), est: T(90) })], new Map(), NOW).length, 0, "försening avstängd");
  eq(decide([W()], [sj({ sched: T(240), est: T(260) })], new Map(), NOW).length, 0, "mer än 3 h bort: inget");
});

Deno.test("inställt: en gång, bara om valt", () => {
  const r = decide([W()], [sj({ sched: T(90), canceled: true })], new Map(), NOW);
  eq(r[0].msg.title, "❌ SJ Snabbtåg 423 från Stockholm C är inställt", "inställt"); eq(r[0].msg.body, "Skulle ankomma 21:30.", "text");
  const sent = sentMap([{ driver_id: "A", ident: "423", sched: T(90), state: r[0].state }]);
  eq(decide([W()], [sj({ sched: T(15), canceled: true })], sentMap([{ driver_id: "A", ident: "423", sched: T(15), state: { canceled: true } }]), NOW).length, 0, "inte igen");
  eq(decide([W({ notify_cancel: false })], [sj({ sched: T(15), canceled: true })], new Map(), NOW).length, 0, "inställt avstängt");
  assert(sent.size === 1, "map");
});

Deno.test("flera bevakningar och förare, tak per minut", () => {
  const r = decide([W(), W({ id: 2, origins: [], fast_only: false, train_nos: ["423"], lead_min: 30 }), W({ id: 3, driver_id: "B" })],
    [sj({ sched: T(25) })], new Map(), NOW);
  eq(r.map((x) => x.driver), ["A"], "A: 30 min förvarning via tågnummer, B: 20 min så inte än");
  const many = Array.from({ length: 8 }, (_, i) => sj({ id: String(500 + i), sched: T(5 + i) }));
  eq(decide([W()], many, new Map(), NOW).length, MAX_PER_TICK, "max per minut");
});

// Edge-funktionen: tick hämtar aktiva tågnotiser, markerar och skickar
const g = globalThis as unknown as Record<string, unknown>;
let handler: ((r: Request) => Promise<Response>) | null = null;
(Deno as unknown as { serve: unknown }).serve = (h: (r: Request) => Promise<Response>) => { handler = h; return {}; };
Deno.env.set("SUPABASE_URL", "http://mock"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "mock");

Deno.test("tick: tågnotis markeras och skickas, tåglistan hämtas en gång", async () => {
  const realFetch = globalThis.fetch;
  let trainFetches = 0;
  const sched = new Date(Date.now() + 12 * 60e3).toISOString();
  globalThis.fetch = ((u: string) => {
    if (String(u).includes("train") || String(u).includes("tag.json")) {
      trainFetches++;
      return Promise.resolve(new Response(JSON.stringify({ trains: [sj({ sched }), sj({ id: "3911", product: "SJ Regional", snabb: false, sched })] })));
    }
    return Promise.reject(new Error("no net"));
  }) as typeof fetch;
  g.__calls = []; g.__sent = [];
  g.__rpc = (fn: string, a: Record<string, unknown>) => {
    if (fn === "bev_svc_secret") return a.p_name === "BEVAKNING_TICK_KEY" ? "k" : "v";
    if (fn === "bev_svc_active") return a.p_kind === "tag" ? [{ id: 9, driver_id: "B", ident: "3911", sched, label: "", state: {}, expires_at: sched }] : [];
    if (fn === "tw_svc_active") return { watches: [W()], sent: [] };
    if (fn === "bev_svc_targets") return [{ id: 1, endpoint: "https://push.example/a", p256dh: "x", auth: "y" }];
    if (fn === "notis_svc_add") return true;
  };
  await import("../bevakning/index.ts");
  const r = await handler!(new Request("http://x/", { method: "POST", headers: { "x-tick-key": "k" }, body: JSON.stringify({ action: "tick" }) }));
  const j = await r.json();
  globalThis.fetch = realFetch;
  eq(j, { flyg: 0, tag: 0, tagnotis: 1 }, "tick-svar");
  eq(trainFetches, 1, "tåglistan hämtad en gång");
  const calls = g.__calls as { fn: string; args: Record<string, unknown> }[];
  const mark = calls.find((c) => c.fn === "tw_svc_mark")!;
  eq([mark.args.p_driver, mark.args.p_ident, mark.args.p_state], ["A", "423", { lead: true }], "markerad");
  const iMark = calls.findIndex((c) => c.fn === "tw_svc_mark"), iAdd = calls.findIndex((c) => c.fn === "notis_svc_add");
  assert(iMark < iAdd, "markeras före sändning");
  const sent = (g.__sent as { payload: string }[]).map((s) => JSON.parse(s.payload));
  eq(sent.length, 1, "en push"); assert(String(sent[0].title).startsWith("🚆 SJ Snabbtåg 423"), "titel " + sent[0].title);
  assert(String(sent[0].url).includes("flik=tag"), "öppnar Tåg-fliken: " + sent[0].url);
  // utan SQL (tw_svc_active saknas) → inga tågnotiser, inget fel
  g.__rpc = (fn: string, a: Record<string, unknown>) => fn === "bev_svc_secret" ? (a.p_name === "BEVAKNING_TICK_KEY" ? "k" : "v") : fn === "bev_svc_active" ? [] : null;
  const r2 = await (await handler!(new Request("http://x/", { method: "POST", headers: { "x-tick-key": "k" }, body: JSON.stringify({ action: "tick" }) }))).json();
  eq(r2, { flyg: 0, tag: 0, tagnotis: 0 }, "utan SQL");
});
