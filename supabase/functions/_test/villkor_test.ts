// Kör: deno test -A --import-map=supabase/functions/_test/import_map.json supabase/functions/_test/villkor_test.ts
// Villkor för tågbevakningar: när notis och ljud får gå ut (villkor.ts) + att appens kopia (TaxiData/tag-villkor.js)
// ger exakt samma svar, + att tick i edge-funktionen följer villkoren för tillfälliga bevakningar,
// Mina tågnotiser och fasta ruttbevakningar (attrapper, ingen databas, ingen riktig push).
import { decide, DEFAULTS, depKey, estStep, normalize, resolve, routeKey, type Villkor } from "../bevakning/villkor.ts";
import { decide as decideRules, sentMap, type TrainWatch } from "../bevakning/tagnotis.ts";
import { decideRoutes, routeSentMap, type RouteWatch } from "../bevakning/routewatch.ts";

function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); }

const NOW = Date.parse("2026-11-12T15:00:00Z"); // 16:00 svensk tid
const M = (min: number) => NOW + min * 60e3;
const est = (schedMin: number, lateMin: number, o: Record<string, unknown> = {}) =>
  ({ type: "est" as const, sched: M(schedMin), est: M(schedMin + lateMin), ...o });

Deno.test("små förseningar långt bort: varken notis eller ljud", () => {
  const d = decide(est(180, 7, { seenEst: M(180 + 4) }), null, NOW);
  eq([d.notify, d.sound, d.reason], [false, false, "small"], "7 min sen, 3 h bort");
  const d2 = decide(est(180, 14, { seenEst: M(180 + 10) }), DEFAULTS, NOW);
  eq([d2.notify, d2.sound], [false, false], "14 min: under 15");
});

Deno.test("fem timmar sent långt bort: notis och ljud", () => {
  // Driver upp förseningen i små steg (ingen plötslig ändring) men passerar 30 min: notis.
  const d = decide(est(180, 32, { seenEst: M(180 + 28) }), null, NOW);
  eq([d.notify, d.sound, d.reason], [true, true, "big"], "30+ min");
  // Fem timmar sent i ett hopp
  const d5 = decide(est(180, 300, { seenEst: M(180) }), null, NOW);
  eq([d5.notify, d5.sound, d5.reason], [true, true, "jump"], "5 h på en gång");
  // Redan notis om 40 min, nu 5 h (i små steg): förseningen har vuxit kraftigt => notis igen
  const d6 = decide(est(180, 300, { seenEst: M(180 + 295), notifiedLate: 40, notifiedEst: M(220) }), null, NOW);
  eq([d6.notify, d6.reason], [true, "bigger"], "40 → 300 min");
  // 40 → 45 min i små steg, långt bort: tyst
  const d7 = decide(est(180, 45, { seenEst: M(180 + 42), notifiedLate: 40, notifiedEst: M(220) }), null, NOW);
  eq([d7.notify, d7.reason], [false, "drip"], "40 → 45 långt bort");
});

Deno.test("plötsligt +20 min i en uppdatering: notis och ljud", () => {
  const d = decide(est(150, 22, { seenEst: M(150 + 2) }), null, NOW);
  eq([d.notify, d.sound, d.reason], [true, true, "jump"], "+20 på en gång");
  // Tar igen: 40 → 10 min sen på en gång, föraren har fått notis om 40 => notis
  const back = decide(est(150, 10, { seenEst: M(190), notifiedLate: 40, notifiedEst: M(190) }), null, NOW);
  eq([back.notify, back.reason], [true, "jump"], "tar igen förseningen");
  // Samma hopp men föraren har aldrig fått notis och det blir litet: tyst
  const tiny = decide(est(150, 3, { seenEst: M(150 + 20) }), null, NOW);
  eq(tiny.notify, false, "20 → 3 min utan tidigare notis");
});

Deno.test("inom X min från ankomst: liten försening fortfarande tyst, större ger notis en gång", () => {
  const small = decide(est(10, 8, { seenEst: M(10 + 5) }), null, NOW);
  eq([small.notify, small.sound, small.reason], [false, false, "small"], "8 min sen, 18 min kvar");
  const sig = decide(est(5, 17, { seenEst: M(5 + 13) }), null, NOW);
  eq([sig.notify, sig.sound, sig.reason], [true, true, "window"], "17 min sen, 22 min kvar");
  // utanför fönstret: samma försening tyst
  const far = decide(est(90, 17, { seenEst: M(90 + 13) }), null, NOW);
  eq([far.notify, far.reason], [false, "drip"], "17 min sen, 107 min kvar");
  // fönstret räknas på beräknad tid: planerad om 5 min men 40 min sen => 45 min kvar, X = 30 => utanför (bara stor-regeln)
  const x45 = decide(est(5, 20, { seenEst: M(5 + 17) }), { lead_min: 20 }, NOW);
  eq(x45.notify, false, "25 min kvar, X = 20");
  const x30 = decide(est(5, 20, { seenEst: M(5 + 17) }), { lead_min: 30 }, NOW);
  eq(x30.notify, true, "25 min kvar, X = 30");
  // redan notis inom fönstret: nästa först efter 10 min ändring
  const again = decide(est(5, 20, { seenEst: M(5 + 17), notifiedLate: 17, notifiedEst: M(22) }), null, NOW);
  eq(again.notify, false, "17 → 20 inom fönstret");
  const again2 = decide(est(0, 28, { seenEst: M(25), notifiedLate: 17, notifiedEst: M(17) }), { big_min: 60 }, NOW);
  eq([again2.notify, again2.reason], [true, "window"], "17 → 28 inom fönstret");
  // X = 0: inget fönster
  eq(decide(est(5, 17, { seenEst: M(5 + 13) }), { lead_min: 0 }, NOW).notify, false, "X = 0");
});

Deno.test("ankomst och inställt: notis, ljud om ljud är på, oavsett fönster", () => {
  eq(decide({ type: "arrived", sched: M(-2) }, null, NOW), { notify: true, sound: true, reason: "arrived", late: 0 }, "ankommit");
  eq(decide({ type: "arrived", sched: M(-2) }, { sound: false }, NOW).sound, false, "ankommit, ljud av");
  eq(decide({ type: "arrived", sched: M(-2) }, { lead_min: 0 }, NOW).notify, true, "ankommit utan fönster");
  eq(decide({ type: "canceled", sched: M(200) }, null, NOW).notify, true, "inställt långt bort");
});

Deno.test("ljud av: notis enligt samma regler men utan ljud", () => {
  const off = { sound: false };
  const big = decide(est(180, 300, { seenEst: M(180) }), off, NOW);
  eq([big.notify, big.sound], [true, false], "5 h: tyst notis");
  const small = decide(est(180, 5, { seenEst: M(181) }), off, NOW);
  eq([small.notify, small.sound], [false, false], "liten: ingenting");
});

Deno.test("egna siffror, per avgång före standard, saknas = nya tystare standarden", () => {
  eq(normalize(null), DEFAULTS, "saknas");
  eq(normalize({ lead_min: "45", small_min: -3, big_min: 99999, jump_min: "x", sound: "ja" }),
    { sound: true, lead_min: 45, small_min: 0, big_min: 1440, jump_min: 15 }, "begränsas");
  const data = { v: 1, tag: { default: { sound: false, lead_min: 20, small_min: 10, big_min: 60, jump_min: 20 },
    dep: { [depKey("423", "2026-11-12T17:00:00+01:00")]: { sound: true, lead_min: 45 }, [routeKey(7)]: { small_min: 5 } } } };
  const dep = resolve(data, { ident: "423", sched: "2026-11-12T16:00:00Z", routeId: 7 });
  eq([dep.source, dep.settings], ["dep", { sound: true, lead_min: 45, small_min: 10, big_min: 60, jump_min: 20 }], "avgångens egna går före (resten från standard)");
  eq(resolve(data, { ident: "425", sched: "2026-11-12T16:00:00Z", routeId: 7 }).source, "route", "fasta bevakningens");
  eq(resolve(data, { ident: "425", sched: "2026-11-12T16:00:00Z" }).settings.lead_min, 20, "standard");
  eq(resolve(null, { ident: "423", sched: NOW }).settings, DEFAULTS, "inga villkor alls");
  eq(resolve({ tag: { dep: { x: 5 } } } as never, {}).settings, DEFAULTS, "trasig data");
  // standarden gör en 17-min-försening tyst, avgångens override med small 5 och X 45 ger notis
  const s1 = resolve(data, { ident: "425", sched: M(10) }).settings;
  eq(decide(est(10, 7, { seenEst: M(12) }), s1, NOW).notify, false, "standard: 7 min tyst");
  const s2 = { ...s1, small_min: 5, lead_min: 45, sound: true };
  const d2 = decide(est(10, 7, { seenEst: M(12) }), s2, NOW);
  eq([d2.notify, d2.sound], [true, true], "override: 7 min inom 45 ger notis + ljud");
  eq(depKey("423", "2026-11-12T17:00:00+01:00"), "t423|2026-11-12T16:00:00.000Z", "nyckel i UTC");
});

Deno.test("estStep: sparar senast sedda tid, notis bara när villkoren säger det", () => {
  const sched = M(180);
  let s = {} as Record<string, unknown>;
  let late = 0, notes = 0;
  // en lång resa: förseningen kryper upp 2 min i taget till 26 min => ingen notis
  for (let i = 1; i <= 13; i++) {
    late = i * 2;
    const r = estStep(s, sched, sched + late * 60e3, null, NOW);
    assert(r.changed, "ändrad " + i);
    s = r.state; if (r.d?.notify) notes++;
  }
  eq(notes, 0, "dropp till 26 min: tyst");
  eq(s.seen, new Date(sched + 26 * 60e3).toISOString(), "senast sedd sparas");
  const r30 = estStep(s, sched, sched + 30 * 60e3, null, NOW);
  eq([r30.d?.notify, r30.d?.reason, r30.state.late], [true, "big", 30], "30 min: notis");
  const same = estStep(r30.state, sched, sched + 30 * 60e3, null, NOW);
  eq(same.changed, false, "samma tid igen: inget");
  // äldre tillstånd (bara est, från före villkoren): räknas som förra notisen
  const old = estStep({ est: new Date(sched + 40 * 60e3).toISOString() }, sched, sched + 44 * 60e3, null, NOW);
  eq(old.d?.notify, false, "äldre tillstånd 40 → 44");
});

// ---------- appens kopia ska ge samma svar ----------
Deno.test("TaxiData/tag-villkor.js ger samma svar som villkor.ts", async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.TAG_VILLKOR;
  await import("../../../TaxiData/tag-villkor.js");
  const J = g.TAG_VILLKOR as { decide: typeof decide; normalize: typeof normalize; resolve: typeof resolve; depKey: typeof depKey; DEFAULTS: Villkor };
  assert(J && J.decide, "laddad");
  eq(J.DEFAULTS, DEFAULTS, "samma standard");
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < 4000; i++) {
    const sched = M(Math.round(rnd() * 400 - 30));
    const ev = { type: pick(["est", "est", "est", "arrived", "canceled", "lead"]) as "est", sched,
      est: sched + Math.round(rnd() * 400 - 30) * 60e3, seenEst: rnd() < 0.2 ? undefined : sched + Math.round(rnd() * 400 - 30) * 60e3,
      notifiedLate: rnd() < 0.4 ? 0 : Math.round(rnd() * 300), notifiedEst: rnd() < 0.5 ? undefined : sched + Math.round(rnd() * 300) * 60e3 };
    const s = rnd() < 0.2 ? null : { sound: rnd() < 0.7, lead_min: pick([0, 15, 20, 30, 45, 60, 600]), small_min: pick([0, 5, 15, 20]),
      big_min: pick([1, 30, 60, 300]), jump_min: pick([1, 10, 15, 60]) };
    eq(J.decide(ev, s, NOW), decide(ev, s, NOW), "fall " + i + " " + JSON.stringify([ev, s]));
  }
  const data = { tag: { default: { lead_min: 20 }, dep: { [depKey("1", M(5))]: { sound: false }, rw3: { small_min: 2 } } } };
  eq(J.resolve(data, { ident: "1", sched: M(5) }), resolve(data, { ident: "1", sched: M(5) }), "resolve avgång");
  eq(J.resolve(data, { ident: "2", sched: M(5), routeId: 3 }), resolve(data, { ident: "2", sched: M(5), routeId: 3 }), "resolve fast");
  eq(J.depKey("423", "2026-11-12T17:00:00+01:00"), depKey("423", "2026-11-12T17:00:00+01:00"), "samma nyckel");
});

// ---------- Mina tågnotiser (alla snabbtåg från Stockholm) ----------
const T = (min: number) => new Date(M(min)).toISOString();
const W = (o: Partial<TrainWatch> = {}): TrainWatch => ({ id: 1, driver_id: "A", origins: ["sthlm"], fast_only: true, train_nos: [],
  lead_min: 0, notify_delay: true, delay_min: 10, notify_cancel: true, ...o });
const sj = (o: Record<string, unknown> = {}) => ({ id: "423", dir: "ANK", other: "Stockholm C", otherSig: "Cst", product: "SJ Snabbtåg",
  snabb: true, sched: T(150), est: null, act: null, track: "5", canceled: false, ...o });

Deno.test("Mina tågnotiser: liten försening långt bort tyst, 5 h sent ger notis, ljud enligt villkoren", () => {
  let r = decideRules([W()], [sj({ est: T(162) })], new Map(), NOW);
  eq(r.length, 1, "tillstånd sparas"); eq(r[0].msg, undefined, "12 min: ingen notis");
  eq(r[0].state.seen, T(162), "senast sedd");
  const sent = sentMap([{ driver_id: "A", ident: "423", sched: T(150), state: r[0].state }]);
  eq(decideRules([W()], [sj({ est: T(162) })], sent, NOW).length, 0, "samma tid: inget alls");
  r = decideRules([W()], [sj({ est: T(150 + 300) })], sent, NOW);
  eq(r[0].msg?.title, "🕒 SJ Snabbtåg 423 från Stockholm C: ny tid 23:30", "5 h sent: notis trots att den är långt bort");
  eq([r[0].msg?.silent, r[0].msg?.v], [false, 1], "med ljud, servern har avgjort");
  r = decideRules([W()], [sj({ est: T(150 + 300) })], new Map(), NOW, () => ({ sound: false }));
  eq(r[0].msg?.silent, true, "ljud av: tyst notis");
  r = decideRules([W({ notify_delay: false })], [sj({ est: T(150 + 300) })], new Map(), NOW);
  eq(r.length, 0, "försening avstängd på bevakningen");
  // regelns egen gräns (delay_min 45) gäller också
  r = decideRules([W({ delay_min: 45 })], [sj({ est: T(150 + 32) })], sentMap([{ driver_id: "A", ident: "423", sched: T(150), state: { seen: T(150 + 28) } }]), NOW);
  eq([r[0].msg, r[0].reason], [undefined, "rule_min"], "32 min men regeln säger 45");
});

Deno.test("Mina tågnotiser: förvarning och inställt med villkorens ljud, per avgång före standard", () => {
  const vill = (_d: string, ident: string) => ident === "423" ? { sound: false } : null;
  let r = decideRules([W({ lead_min: 20 })], [sj({ sched: T(15) })], new Map(), NOW, vill);
  eq([r[0].msg?.title.includes("ankommer"), r[0].msg?.silent], [true, true], "förvarning, avgången har ljud av");
  r = decideRules([W({ lead_min: 20 })], [sj({ id: "425", sched: T(15) })], new Map(), NOW, vill);
  eq(r[0].msg?.silent, false, "annan avgång: standard med ljud");
  r = decideRules([W()], [sj({ canceled: true })], new Map(), NOW, vill);
  eq([r[0].msg?.title.includes("inställt"), r[0].msg?.silent], [true, true], "inställt, tyst");
});

Deno.test("Fasta ruttbevakningar (tåg): samma villkor, flyg som förut", () => {
  const rw = (o: Partial<RouteWatch> = {}): RouteWatch => ({ id: 7, driver_id: "A", kind: "tag", route: "sthlm", sched_min: 18 * 60 + 30,
    days: [], lead_min: 0, notify_delay: true, delay_min: 10, notify_cancel: true, ...o });
  const tr = sj({ sched: "2026-11-12T17:30:00Z" }); // 18:30 svensk tid, 150 min bort
  let r = decideRoutes([rw()], [{ ...tr, est: "2026-11-12T17:42:00Z" }], [], new Map(), NOW);
  eq([r.length, r[0].msg], [1, undefined], "12 min: tyst, bara tillstånd");
  r = decideRoutes([rw()], [{ ...tr, est: "2026-11-12T18:10:00Z" }], [], new Map(), NOW);
  eq([r[0].msg?.title.startsWith("🕒"), r[0].reason], [true, "jump"], "40 min på en gång: notis");
  let got: unknown[] = [];
  r = decideRoutes([rw()], [{ ...tr, est: "2026-11-12T17:42:00Z" }], [], new Map(), NOW, (d, i, s, id) => { got = [d, i, s, id]; return { small_min: 5 }; });
  eq(got, ["A", "423", Date.parse("2026-11-12T17:30:00Z"), 7], "villkor frågas per avgång och fast bevakning");
  eq(r[0].reason, "drip", "small 5: 12 min långt bort är dropp, inte stor");
  // flyg oförändrat: 15 min sen ger "ny tid" som förut
  const fw: RouteWatch = { ...rw(), kind: "flyg", route: "ARN", id: 8 };
  const fl = { id: "SK123", status: "", sched: "2026-11-12T17:30:00Z", est: "2026-11-12T17:45:00Z", other: "Stockholm", otherCode: "ARN", act: null, from: "ARN" };
  const rf = decideRoutes([fw], [], [fl], new Map(), NOW);
  assert(rf.every((x) => !("v" in (x.msg || {}))), "flyg utan villkor");
});

Deno.test("5 h sent: tåget räknas även om beräknad tid är bortom horisonten", () => {
  const r = decideRules([W()], [sj({ sched: T(120), est: T(120 + 300) })], new Map(), NOW);
  eq(r[0].msg?.title.includes("ny tid"), true, "planerad inom 3 h, beräknad om 7 h");
});
