// Fasta ruttbevakningar: samma tur och klockslag (±15 min, svensk tid), inte tåg-/flygnummer.
// Ren logik utan nätverk, så den kan testas.

import { groupOf, hm as hmTag, HORIZON_MIN as HORIZON_TAG, EST_STEP_MIN as EST_TAG, MAX_PER_TICK } from "./tagnotis.ts";
import { originCode, hm as hmFlyg, HORIZON_MIN as HORIZON_FLYG, EST_STEP_MIN as EST_FLYG } from "./flygnotis.ts";

export type RouteWatch = {
  id: number; driver_id: string; kind: "tag" | "flyg" | "bat";
  route: string; sched_min: number; days: number[];
  lead_min: number; notify_delay: boolean; delay_min: number; notify_cancel: boolean;
};
export type SentState = { lead?: boolean; est?: string; canceled?: boolean };
export type Msg = { title: string; body: string; tag: string };
export const SLACK_MIN = 15;

const ms = (v: unknown) => { if (!v) return 0; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : 0; };

function stockholmParts(at: number): { min: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit",
    weekday: "short", hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  const wd = get("weekday").toLowerCase().slice(0, 2);
  const dow = wd === "mo" ? 1 : wd === "tu" ? 2 : wd === "we" ? 3 : wd === "th" ? 4 : wd === "fr" ? 5 : wd === "sa" ? 6 : 7;
  return { min: hour * 60 + minute, dow };
}

export function inWindow(w: RouteWatch, sched: number, slack = SLACK_MIN): boolean {
  if (!sched) return false;
  const p = stockholmParts(sched);
  const gap = Math.min(Math.abs(p.min - w.sched_min), 1440 - Math.abs(p.min - w.sched_min));
  if (gap > slack) return false;
  if (w.days?.length && !w.days.includes(p.dow)) return false;
  return true;
}

export function matches(w: RouteWatch, item: Record<string, unknown>, kind: "tag" | "flyg" | "bat"): boolean {
  if (w.kind !== kind) return false;
  if (!inWindow(w, ms(item.sched))) return false;
  if (kind === "tag") return groupOf(item) === w.route;
  if (kind === "flyg") return originCode(item) === String(w.route || "").toUpperCase();
  return String(item.group || item.route || "") === w.route;
}

export const sentKey = (driver: string, ident: string, sched: number) => driver + "|" + ident + "|" + sched;

type Out = { driver: string; ident: string; sched: string; state: SentState; msg: Msg };

function decideKind(
  kind: "tag" | "flyg",
  watches: RouteWatch[],
  items: Record<string, unknown>[],
  sent: Map<string, SentState>,
  now: number,
): Out[] {
  const byDriver = new Map<string, RouteWatch[]>();
  for (const w of watches) {
    if (w.kind !== kind) continue;
    const a = byDriver.get(w.driver_id) || [];
    a.push(w);
    byDriver.set(w.driver_id, a);
  }
  const out: Out[] = [];
  const horizon = kind === "tag" ? HORIZON_TAG : HORIZON_FLYG;
  const step = kind === "tag" ? EST_TAG : EST_FLYG;
  const hm = kind === "tag" ? hmTag : hmFlyg;
  for (const [driver, ws] of byDriver) {
    let n = 0;
    const cands = items
      .filter((it) => kind !== "tag" || it.dir === undefined || it.dir === "ANK")
      .map((it) => ({ it, sched: ms(it.sched), est: ms(it.est) }))
      .filter((x) => x.sched && !ms(x.it.act))
      .sort((a, b) => (a.est || a.sched) - (b.est || b.sched));
    for (const { it, sched, est } of cands) {
      if (n >= MAX_PER_TICK) break;
      if (kind === "flyg") {
        const code = String(it.status || "").toUpperCase();
        if (code === "DEL" || code === "LAN") continue;
      }
      const eta = est || sched;
      if (eta < now - 60e3 || eta > now + horizon * 60e3) continue;
      const m = ws.filter((w) => matches(w, it, kind));
      if (!m.length) continue;
      const lead = Math.max(...m.map((w) => w.lead_min || 0));
      const wantDelay = m.some((w) => w.notify_delay);
      const delayMin = Math.min(...m.filter((w) => w.notify_delay).map((w) => w.delay_min || 10), 999);
      const wantCancel = m.some((w) => w.notify_cancel);
      const ident = String(it.id || "");
      const key = sentKey(driver, ident, sched);
      const prev = sent.get(key) || {};
      const s: SentState = { ...prev };
      const from = String(it.other || "");
      const late = est && est > sched ? Math.round((est - sched) / 60e3) : 0;
      const canceled = kind === "tag"
        ? (it.canceled === true || String(it.canceled) === "true")
        : String(it.status || "").toUpperCase() === "CAN";
      const prod = kind === "tag" ? String(it.product || "Tåg").replace(/\s*\(.*\)$/, "") + " " + ident : ident;
      const name = prod + (from ? " från " + from : "");
      const track = kind === "tag" && it.track ? " Spår " + it.track + "." : "";
      const icon = kind === "tag" ? "🚆 " : "✈️ ";
      let title = "", body = "";
      if (canceled) {
        if (wantCancel && !s.canceled) {
          s.canceled = true;
          title = "❌ " + name + " är inställt";
          body = "Skulle ankomma " + hm(sched) + ".";
        }
      } else if (lead > 0 && !s.lead && eta - now <= lead * 60e3) {
        s.lead = true;
        if (est) s.est = new Date(est).toISOString();
        const mins = Math.max(0, Math.round((eta - now) / 60e3));
        title = icon + name + " ankommer " + hm(eta);
        body = (mins > 0 ? "Om " + mins + " min." : "Nu.") + track +
          (late >= 1 ? " " + late + " min sen (planerad " + hm(sched) + ")." : " I tid.");
      } else if (wantDelay && est && late >= delayMin) {
        const prevEst = ms(s.est) || sched;
        if (Math.abs(est - prevEst) >= step * 60e3) {
          s.est = new Date(est).toISOString();
          title = "🕒 " + name + ": ny tid " + hm(est);
          body = "Planerad " + hm(sched) + ", försenat " + late + " min." + track;
        }
      }
      if (!title) continue;
      n++;
      out.push({ driver, ident, sched: new Date(sched).toISOString(), state: s, msg: { title, body, tag: kind + "-" + ident } });
    }
  }
  return out;
}

export function decideRoutes(
  watches: RouteWatch[],
  trains: Record<string, unknown>[],
  flights: Record<string, unknown>[],
  sent: Map<string, SentState>,
  now: number,
): Out[] {
  return [
    ...decideKind("tag", watches, trains, sent, now),
    ...decideKind("flyg", watches, flights, sent, now),
  ];
}

export function routeSentMap(rows: { driver_id: string; ident: string; sched: string; state: SentState }[]): Map<string, SentState> {
  const m = new Map<string, SentState>();
  for (const r of rows || []) m.set(sentKey(r.driver_id, r.ident, ms(r.sched)), r.state || {});
  return m;
}
