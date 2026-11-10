// Kör: deno test -A --import-map=supabase/functions/_test/import_map.json supabase/functions/_test/flygnotis_test.ts
import { decide, matches, originCode, airlineCode, sentMap, MAX_PER_TICK, type FlightWatch } from "../bevakning/flygnotis.ts";

function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); }

const NOW = Date.parse("2026-11-10T19:00:00Z"); // 20:00 svensk tid
const T = (min: number) => new Date(NOW + min * 60e3).toISOString();
const W = (o: Partial<FlightWatch> = {}): FlightWatch => ({ id: 1, driver_id: "A", origins: ["ARN"], airlines: [], flight_nos: [],
  lead_min: 20, notify_delay: true, delay_min: 10, notify_cancel: true, ...o });
const fl = (o: Record<string, unknown> = {}) => ({ id: "SK169", iata: "", airline: "SAS Scandinavian Airlines", other: "Stockholm ARN",
  status: "SCH", sched: T(15), est: null, act: null, ...o });

Deno.test("matchning: iata-fält, IATA i other, stadsnamn, flygnummer, bolag", () => {
  eq(originCode(fl()), "ARN", "ARN i other");
  eq(originCode({ iata: "FRA", other: "Frankfurt" }), "FRA", "iata-fält");
  eq(originCode({ iata: "", other: "Helsingfors" }), "HEL", "stadsnamn utan IATA");
  eq(originCode({ iata: "", other: "London STN" }), "STN", "trailing IATA slår london-default");
  eq(airlineCode(fl()), "SK", "SK från id");
  assert(matches(W(), fl()), "ARN via other");
  assert(matches(W({ origins: ["HEL"] }), fl({ other: "Helsingfors", id: "AY863" })), "Helsingfors → HEL");
  assert(!matches(W(), fl({ other: "Frankfurt", iata: "FRA" })), "inte Frankfurt");
  assert(matches(W({ origins: [], flight_nos: ["SK169"] }), fl()), "flygnummer");
  assert(!matches(W({ origins: [], flight_nos: ["SK163"] }), fl()), "fel flygnummer");
  assert(matches(W({ origins: [], airlines: ["SK"] }), fl()), "bolag via id-prefix");
  assert(matches(W({ origins: [], airlines: ["SK"] }), fl({ id: "SK169" })), "SAS-namn också ok");
  assert(!matches(W({ origins: [], airlines: ["AY"] }), fl()), "fel bolag");
});

Deno.test("förvarning: X min före ankomst, en gång; landat och borttaget hoppas över", () => {
  let r = decide([W()], [fl({ sched: T(25) })], new Map(), NOW);
  eq(r.length, 0, "25 min kvar: inget än");
  r = decide([W()], [fl({ sched: T(18) })], new Map(), NOW);
  eq(r.length, 1, "18 min kvar: notis");
  eq(r[0].msg.title, "✈️ SK169 från Stockholm ARN ankommer 20:18", "titel");
  eq(r[0].msg.body, "Om 18 min. I tid.", "text"); eq(r[0].msg.tag, "flyg-SK169", "tagg");
  const sent = sentMap([{ driver_id: "A", ident: "SK169", sched: T(18), state: r[0].state }]);
  eq(decide([W()], [fl({ sched: T(18) })], sent, NOW + 60e3).length, 0, "inte igen");
  eq(decide([W({ lead_min: 0, notify_delay: false })], [fl({ sched: T(5) })], new Map(), NOW).length, 0, "ingen förvarning");
  eq(decide([W()], [fl({ sched: T(5), act: T(-1) })], new Map(), NOW).length, 0, "redan landat (act)");
  eq(decide([W()], [fl({ sched: T(5), status: "LAN" })], new Map(), NOW).length, 0, "status LAN");
  eq(decide([W()], [fl({ sched: T(5), status: "DEL" })], new Map(), NOW).length, 0, "borttaget");
});

Deno.test("försening och inställt", () => {
  eq(decide([W()], [fl({ sched: T(60), est: T(67) })], new Map(), NOW).length, 0, "7 min: under 10");
  let r = decide([W()], [fl({ sched: T(60), est: T(75) })], new Map(), NOW);
  eq(r[0].msg.title, "🕒 SK169 från Stockholm ARN: ny tid 21:15", "försenad titel");
  eq(r[0].msg.body, "Planerad 21:00, försenat 15 min.", "försenad text");
  let sent = sentMap([{ driver_id: "A", ident: "SK169", sched: T(60), state: r[0].state }]);
  eq(decide([W()], [fl({ sched: T(60), est: T(80) })], sent, NOW).length, 0, "+5 min: inget nytt");
  r = decide([W()], [fl({ sched: T(60), est: T(86) })], sent, NOW);
  eq(r.length, 1, "+11 min: nytt besked");
  const c = decide([W()], [fl({ sched: T(90), status: "CAN" })], new Map(), NOW);
  eq(c[0].msg.title, "❌ SK169 från Stockholm ARN är inställt", "inställt");
  eq(decide([W({ notify_cancel: false })], [fl({ sched: T(15), status: "CAN" })], new Map(), NOW).length, 0, "inställt avstängt");
  eq(decide([W()], [fl({ sched: T(240), est: T(260) })], new Map(), NOW).length, 0, "mer än 3 h bort");
});

Deno.test("tak per minut", () => {
  const many = Array.from({ length: 8 }, (_, i) => fl({ id: "SK" + (100 + i), sched: T(5 + i) }));
  eq(decide([W()], many, new Map(), NOW).length, MAX_PER_TICK, "max per minut");
});
