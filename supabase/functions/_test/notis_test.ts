// Kör: deno test -A --import-map=supabase/functions/_test/import_map.json supabase/functions/_test/notis_test.ts
// Startar edge-funktionerna bevakning och prognos-sync lokalt med attrapper (ingen databas, ingen riktig push)
// och kontrollerar att notisen sparas i notisflödet (notis_svc_add) med samma nyckel som pushen och appen.
import { notisKey, notisKind } from "../bevakning/notis.ts";

const g = globalThis as unknown as Record<string, unknown>;
type Call = { fn: string; args: Record<string, unknown> };
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); }

// sw.js notisKey (samma kod som telefonen kör)
const swSrc = Deno.readTextFileSync(new URL("../../../TaxiData/sw.js", import.meta.url));
const swFns = new Function("self", "indexedDB", swSrc + "\nreturn { notisKey, notisTarget, notisUrl };")(
  { addEventListener() {}, registration: { scope: "https://taxikit.shop/TaxiData/" } }, {}) as {
  notisKey: (d: unknown, now: number) => string; notisTarget: (d: unknown) => Record<string, string> | null; notisUrl: (d: unknown, t: unknown) => string };
const swKey = swFns.notisKey;

let handler: ((r: Request) => Promise<Response>) | null = null;
(Deno as unknown as { serve: unknown }).serve = (h: (r: Request) => Promise<Response>) => { handler = h; return {}; };
Deno.env.set("SUPABASE_URL", "http://mock"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "mock");
const out: Record<string, unknown> = {};

function reset(rpc: (fn: string, a: Record<string, unknown>) => unknown) { g.__calls = []; g.__sent = []; g.__rpc = rpc; }
const SUB = [{ id: 1, endpoint: "https://push.example/abc", p256dh: "x", auth: "y" }];

Deno.test("nyckel och typ: samma som sw.js / notis.js", () => {
  eq(notisKind("flyg-SK1427"), "flyg", "flyg"); eq(notisKind("tag-123"), "tag", "tag"); eq(notisKind("prognos-110-app"), "prognos", "prognos");
  const m = { tag: "flyg-SK1427", title: "t", body: "b" }, ts = 1761660000000;
  eq(notisKey(m, ts), swKey({ ...m, ts }, ts + 5000), "flyg-nyckel = sw.js");
  const p = { tag: "prognos-110-app", title: "Ny förbokning", body: "Landvetter · App · ca 15:40" };
  eq(notisKey(p, ts), swKey(p, ts), "prognos-nyckel = sw.js");
  eq(swKey({ ...p, nkey: "X|1" }, ts), "X|1", "sw.js använder serverns nyckel");
  // prognos-dagen tas från förbokningens tid (svensk tid), som prognos-notis.js i appen
  eq(notisKey(p, Date.parse("2026-10-28T22:50:00Z"), Date.parse("2026-10-28T23:10:00Z")), "prognos|prognos-110-app@1540|20261029", "dag efter midnatt");
  out.keys = "OK";
});

Deno.test("sw.js: tryck på push leder rätt (även push från gammal server utan target)", () => {
  const old = { tag: "prognos-161-app", title: "Ny förbokning", body: "Essity · Kombi · ca 14:35", url: "/TaxiData/?sida=prognos" };
  const t = swFns.notisTarget(old)!;
  eq(t, { zone: "161", cat: "app" }, "zon ur taggen");
  eq(swFns.notisUrl(old, t), "https://taxikit.shop/TaxiData/?sida=prognos&zon=161&kat=app", "url med zon");
  const nw = { ...old, url: "/TaxiData/?sida=prognos&zon=161&kat=app&tid=x&bok=7", target: { zone: "161", cat: "app", at: "x", id: "7" } };
  eq(swFns.notisTarget(nw), nw.target, "serverns target");
  eq(swFns.notisUrl(nw, nw.target), "https://taxikit.shop/TaxiData/?sida=prognos&zon=161&kat=app&tid=x&bok=7", "serverns url orörd");
  eq(swFns.notisUrl({ tag: "flyg-SK1427", url: "/TaxiData/?sida=ankomster" }, null), "https://taxikit.shop/TaxiData/?sida=ankomster&flik=flyg", "flyg-fliken");
  eq(swFns.notisUrl({ tag: "tag-3911", url: "/TaxiData/?sida=ankomster" }, null), "https://taxikit.shop/TaxiData/?sida=ankomster&flik=tag", "tåg-fliken");
  eq(swFns.notisTarget({ tag: "flyg-SK1" }), null, "flyg har ingen target");
});

Deno.test("bevakning tick: flyg landat → notis sparas + push med samma nyckel", async () => {
  const realFetch = globalThis.fetch;
  const sched = new Date(Date.now() - 30 * 60e3).toISOString(), act = new Date(Date.now() - 2 * 60e3).toISOString();
  globalThis.fetch = ((u: string) => {
    if (String(u).includes("got.json")) return Promise.resolve(new Response(JSON.stringify({ arrivals: [{ id: "SK1427", sched, act, status: "LAN", other: "Köpenhamn", baggage: "3" }] })));
    if (String(u).includes("train") || String(u).includes("tag.json")) return Promise.resolve(new Response(JSON.stringify({ trains: [{ id: "3911", dir: "ANK", sched, act, product: "SJ Regional", other: "Borås", track: "5" }] })));
    return realFetch(u);
  }) as typeof fetch;
  reset((fn, a) => {
    if (fn === "bev_svc_secret") return a.p_name === "BEVAKNING_TICK_KEY" ? "k" : "v";
    if (fn === "bev_svc_active") return a.p_kind === "flyg"
      ? [{ id: 11, driver_id: "ZZTEST-NF-F", ident: "SK1427", sched, label: "Köpenhamn", state: {}, expires_at: sched }]
      : [{ id: 12, driver_id: "ZZTEST-NF-F", ident: "3911", sched, label: "Borås", state: {}, expires_at: sched }];
    if (fn === "bev_svc_targets") return SUB;
    if (fn === "notis_svc_add") return true;
  });
  await import("../bevakning/index.ts");
  assert(handler, "Deno.serve anropades inte");
  const r = await handler!(new Request("http://x/", { method: "POST", headers: { "x-tick-key": "k", "content-type": "application/json" }, body: JSON.stringify({ action: "tick" }) }));
  const j = await r.json(); eq(j, { flyg: 1, tag: 1, tagnotis: 0 }, "tick-svar (tagnotis 0: tw_svc_active saknas = inga tågnotiser)");
  globalThis.fetch = realFetch;
  const adds = (g.__calls as Call[]).filter((c) => c.fn === "notis_svc_add");
  const sent = (g.__sent as { payload: string }[]).map((s) => JSON.parse(s.payload));
  eq(adds.length, 2, "två sparade notiser"); eq(sent.length, 2, "två push");
  for (let i = 0; i < 2; i++) {
    const a = adds[i].args, p = sent[i];
    eq(a.p_key, p.nkey, "sparad nyckel = pushens nkey");
    eq(a.p_key, swKey(p, Date.now()), "sw.js räknar fram samma nyckel");
    eq(a.p_key, p.tag + "|" + p.ts, "även gammal sw.js (utan nkey) ger samma nyckel");
    eq(a.p_title, p.title, "titel"); eq(a.p_driver, "ZZTEST-NF-F", "förare");
    eq(p.url, "/TaxiData/?sida=ankomster&flik=" + (i === 0 ? "flyg" : "tag"), "länk till rätt flik");
    assert(!("p_target" in a), "flyg/tåg skickar ingen p_target (6-args-versionen)");
  }
  eq(adds.map((c) => c.args.p_kind), ["flyg", "tag"], "typ → Ankomster");
  out.bevakning = adds.map((c) => c.args);
  // Testnotis sparas inte i flödet
  reset((fn) => fn === "bev_svc_driver" ? "ZZTEST-NF-F" : fn === "bev_svc_targets" ? SUB : fn === "bev_svc_secret" ? "v" : null);
  const r2 = await handler!(new Request("http://x/", { method: "POST", body: JSON.stringify({ action: "test", token: "testtoken123" }) }));
  const j2 = await r2.json(); eq(j2.sent, 1, "testpush skickad");
  eq((g.__calls as Call[]).filter((c) => c.fn === "notis_svc_add").length, 0, "testnotis sparas inte");
  // Föraren har ingen telefon med push: notisen sparas ändå
  reset((fn, a) => fn === "bev_svc_secret" ? (a.p_name === "BEVAKNING_TICK_KEY" ? "k" : "v") : fn === "bev_svc_active" ? (a.p_kind === "flyg" ? [{ id: 13, driver_id: "D2", ident: "SK1427", sched, label: "", state: {}, expires_at: sched }] : []) : fn === "bev_svc_targets" ? [] : fn === "notis_svc_add" ? true : null);
  globalThis.fetch = ((u: string) => Promise.resolve(new Response(JSON.stringify({ arrivals: [{ id: "SK1427", sched, act, status: "LAN" }] })))) as typeof fetch;
  await handler!(new Request("http://x/", { method: "POST", headers: { "x-tick-key": "k" }, body: JSON.stringify({ action: "tick" }) }));
  globalThis.fetch = realFetch;
  eq((g.__calls as Call[]).filter((c) => c.fn === "notis_svc_add").length, 1, "sparas utan telefon");
});

Deno.test("prognos-sync tick: ny förbokning → notis sparas + push med samma nyckel", async () => {
  handler = null;
  const realFetch = globalThis.fetch;
  const zone = (n: number) => ({ id: "110", name: "Landvetter", total: n, blocks: [{ app: n, total: n }, { app: 0, total: 0 }, { app: 0, total: 0 }] });
  globalThis.fetch = ((u: string) => {
    if (String(u).includes("prognos-login")) return Promise.resolve(new Response(JSON.stringify({ ok: true, token: "t" })));
    if (String(u).includes("prognos-public-data")) return Promise.resolve(new Response(JSON.stringify({ zones: { "110": zone(1) } })));
    return realFetch(u);
  }) as typeof fetch;
  reset((fn) => {
    if (fn === "prognos_svc_secret") return "k";
    if (fn === "prognos_svc_latest_payload") return { zones: { "110": zone(0) } };
    if (fn === "prognos_svc_open_bookings") return [];
    if (fn === "prognos_svc_insert_snapshot") return 1;
    if (fn === "prognos_svc_watch_drivers_active") return ["ZZTEST-NF-F"];
    if (fn === "bev_svc_targets") return SUB;
    if (fn === "notis_svc_add") return true;
    if (fn === "prognos_svc_insert_booking") return 4242;
  });
  await import("../prognos-sync/index.ts");
  assert(handler, "Deno.serve anropades inte");
  const r = await handler!(new Request("http://x/", { method: "POST", headers: { "x-tick-key": "k" }, body: JSON.stringify({ action: "tick" }) }));
  const j = await r.json(); globalThis.fetch = realFetch;
  assert(j.ok, "tick ok " + JSON.stringify(j));
  const adds = (g.__calls as Call[]).filter((c) => c.fn === "notis_svc_add");
  const sent = (g.__sent as { payload: string }[]).map((s) => JSON.parse(s.payload));
  eq(adds.length, 1, "en sparad notis"); eq(sent.length, 1, "en push");
  const a = adds[0].args, p = sent[0];
  eq(a.p_kind, "prognos", "typ → Prognos");
  eq(a.p_key, p.nkey, "sparad nyckel = pushens nkey"); eq(a.p_key, swKey(p, Date.now()), "sw.js samma nyckel");
  // samma nyckel som prognos-notis.js i appen räknar fram från förbokningens tid
  const ins = (g.__calls as Call[]).find((c) => c.fn === "prognos_svc_insert_booking")!.args;
  const t = new Date(String(ins.p_est)), p2 = (n: number) => (n < 10 ? "0" : "") + n;
  eq(a.p_key, "prognos|prognos-110-app@" + p2(t.getHours()) + p2(t.getMinutes()) + "|" + t.getFullYear() + p2(t.getMonth() + 1) + p2(t.getDate()), "= prognos-notis.js");
  // vart notisen leder: zon, kategori, tid och bokningens id (t551u)
  const want = { zone: "110", cat: "app", at: String(ins.p_est), id: "4242" };
  eq(a.p_target, want, "sparad target"); eq(p.target, want, "pushens target");
  eq(p.url, "/TaxiData/?sida=prognos&zon=110&kat=app&tid=" + encodeURIComponent(String(ins.p_est)) + "&bok=4242", "länk till rätt zon");
  out.prognos = a;
  await Deno.writeTextFile(Deno.env.get("NOTIS_TEST_OUT") || "/tmp/notis_test_out.json", JSON.stringify(out, null, 1));
});
