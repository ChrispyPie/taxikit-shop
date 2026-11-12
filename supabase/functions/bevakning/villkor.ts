// Villkor för tågbevakningar (12 nov 2026): NÄR en bevakning får ge notis och ljud.
// Gäller både push/notisflödet (här i edge-funktionen) och ljudet i appen (pushen bär silent/v).
// Samma logik finns i TaxiData/tag-villkor.js (appen). Ändra båda; testet
// supabase/functions/_test/villkor_test.ts jämför dem.
//
// Regler (standard, föraren kan ändra siffrorna i Mina bevakningar, både som standard och per avgång):
//  * Små förseningar (under small_min, 15 min): varken notis eller ljud. Syns bara i appen.
//  * Stor försening (big_min, 30 min, första gången) eller förseningen har vuxit kraftigt sedan förra notisen
//    (minst big_min och minst lika mycket som förra förseningen, t.ex. 30 → 60 → 120): notis, även långt bort.
//  * Plötslig ändring: beräknad tid hoppar minst jump_min (15 min) i en uppdatering: notis, även långt bort.
//    Gäller även när tåget tar igen förseningen (t.ex. 40 → 10 min sen) om föraren redan fått notis om förseningen.
//  * Inom lead_min (30) minuter från beräknad ankomst: försening från small_min ger notis (en gång,
//    sedan igen först när tiden flyttats minst 10 min).
//  * Ankommit, inställt och förarens egen förvarning ("X min före"): alltid notis.
//  * Ljud: bara om notisen går ut OCH ljudet är på (sound). Ljud av = tyst notis.
//  * Saknas inställningar används DEFAULTS (tystare än förut).

export type Villkor = { sound: boolean; lead_min: number; small_min: number; big_min: number; jump_min: number };
export const DEFAULTS: Villkor = { sound: true, lead_min: 30, small_min: 15, big_min: 30, jump_min: 15 };
export const LIMITS: Record<Exclude<keyof Villkor, "sound">, [number, number]> = {
  lead_min: [0, 600], small_min: [0, 600], big_min: [1, 1440], jump_min: [1, 1440],
};
// Inom fönstret: ny notis först när tiden flyttats så här mycket sedan förra notisen
export const WINDOW_STEP_MIN = 10;

export type VillkorData = { v?: number; tag?: { default?: Partial<Villkor>; dep?: Record<string, Partial<Villkor> & { at?: string }> } };

function num(v: unknown, d: number, lo: number, hi: number): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return d;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
export function normalize(o: unknown, base: Villkor = DEFAULTS): Villkor {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  return {
    sound: typeof x.sound === "boolean" ? x.sound : base.sound,
    lead_min: num(x.lead_min, base.lead_min, ...LIMITS.lead_min),
    small_min: num(x.small_min, base.small_min, ...LIMITS.small_min),
    big_min: num(x.big_min, base.big_min, ...LIMITS.big_min),
    jump_min: num(x.jump_min, base.jump_min, ...LIMITS.jump_min),
  };
}

const ms = (v: unknown) => { if (!v) return 0; const t = typeof v === "number" ? v : Date.parse(String(v)); return Number.isFinite(t) ? t : 0; };
// Nyckel för en enskild avgång: t + tågnr + | + planerad tid (ISO, UTC). Fast bevakning: rw + id.
export function depKey(ident: unknown, sched: unknown): string {
  const t = ms(sched);
  return "t" + String(ident ?? "") + "|" + (t ? new Date(t).toISOString() : String(sched ?? ""));
}
export const routeKey = (id: unknown) => "rw" + String(id);

// Avgångens egna villkor går före den fasta bevakningens, som går före standarden.
export function resolve(data: VillkorData | null | undefined, q: { ident?: unknown; sched?: unknown; routeId?: unknown } = {}):
  { settings: Villkor; source: "dep" | "route" | "default" } {
  const tag = (data && typeof data === "object" && data.tag) || {};
  const def = normalize(tag.default);
  const dep = (tag.dep && typeof tag.dep === "object") ? tag.dep : {};
  if (q.ident != null && q.sched != null) {
    const o = dep[depKey(q.ident, q.sched)];
    if (o && typeof o === "object") return { settings: normalize(o, def), source: "dep" };
  }
  if (q.routeId != null) {
    const o = dep[routeKey(q.routeId)];
    if (o && typeof o === "object") return { settings: normalize(o, def), source: "route" };
  }
  return { settings: def, source: "default" };
}

export type Ev = {
  type: "arrived" | "canceled" | "lead" | "est";
  sched: number;            // planerad ankomst (ms)
  est?: number;             // ny beräknad ankomst (ms), saknas = planerad
  seenEst?: number;         // beräknad tid vid förra uppdateringen (ms)
  notifiedEst?: number;     // beräknad tid i förra notisen (ms), saknas = planerad
  notifiedLate?: number;    // försening (min) i förra notisen, 0 = ingen notis om försening än
};
export type Decision = { notify: boolean; sound: boolean; reason: string; late: number };

export function decide(ev: Ev, settings: Partial<Villkor> | null | undefined, now: number): Decision {
  const s = normalize(settings);
  const sched = ms(ev.sched), est = ms(ev.est) || sched;
  const late = sched ? Math.round((est - sched) / 60e3) : 0;
  const yes = (reason: string): Decision => ({ notify: true, sound: s.sound, reason, late });
  const no = (reason: string): Decision => ({ notify: false, sound: false, reason, late });
  if (ev.type === "arrived") return yes("arrived");
  if (ev.type === "canceled") return yes("canceled");
  if (ev.type === "lead") return yes("lead");
  const prev = ms(ev.seenEst) || sched;
  const jump = Math.round((est - prev) / 60e3);
  const nLate = Math.max(0, Math.round(Number(ev.notifiedLate) || 0));
  const nEst = ms(ev.notifiedEst) || sched;
  if (Math.abs(jump) >= s.jump_min && (late >= s.small_min || nLate >= s.small_min) && est !== nEst) return yes("jump");
  if (late < s.small_min) return no("small");
  if (late >= s.big_min && nLate < s.big_min) return yes("big");
  if (late >= s.big_min && late - nLate >= Math.max(s.big_min, nLate)) return yes("bigger");
  if (s.lead_min > 0 && est - now <= s.lead_min * 60e3 &&
    (nLate < s.small_min || Math.abs(est - nEst) >= WINDOW_STEP_MIN * 60e3)) return yes("window");
  return no("drip");
}

// Tillstånd per bevakad avgång: est = tid i förra notisen, late = försening i förra notisen,
// seen = senast sedda beräknade tid (sparas även när ingen notis går ut, annars kan inte "plötsligt" räknas).
export type EstState = { est?: string; seen?: string; late?: number };
export function estStep<T extends EstState>(prev: T, sched: number, eta: number, settings: Partial<Villkor> | null | undefined, now: number):
  { state: T; changed: boolean; d: Decision | null } {
  const seenPrev = ms(prev.seen) || ms(prev.est) || sched;
  if (!sched || !eta || eta === seenPrev) return { state: prev, changed: false, d: null };
  const nLate = typeof prev.late === "number" ? prev.late : (ms(prev.est) ? Math.round((ms(prev.est) - sched) / 60e3) : 0);
  const d = decide({ type: "est", sched, est: eta, seenEst: seenPrev, notifiedEst: ms(prev.est) || sched, notifiedLate: nLate }, settings, now);
  const state = { ...prev, seen: new Date(eta).toISOString() } as T;
  if (d.notify) { state.est = new Date(eta).toISOString(); state.late = Math.max(0, d.late); }
  return { state, changed: true, d };
}

// Läser förarnas villkor (en gång per tick). Saknas funktionen/tabellen (migrationen inte körd) => {} => standard.
type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export async function loadVillkor(sb: Rpc, drivers: string[]): Promise<Record<string, VillkorData>> {
  const ids = Array.from(new Set(drivers.filter(Boolean))).slice(0, 2000);
  if (!ids.length) return {};
  try {
    const { data, error } = await sb.rpc("bev_svc_villkor", { p_drivers: ids });
    if (error || !data || typeof data !== "object") return {};
    return data as Record<string, VillkorData>;
  } catch { return {}; }
}
