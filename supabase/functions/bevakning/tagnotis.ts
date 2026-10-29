// Mina tågnotiser: fasta notiser för vissa tåg (t.ex. snabbtågen från Stockholm) under förarens valda tider.
// Ren logik utan nätverk, så den kan testas (supabase/functions/_test/tagnotis_test.ts).
// Vilka bevakningar som är aktiva just nu (påslagna, inom tiderna, föraren har push) avgör databasen (tw_svc_active).

export type TrainWatch = {
  id: number; driver_id: string; origins: string[]; fast_only: boolean; train_nos: string[];
  lead_min: number; notify_delay: boolean; delay_min: number; notify_cancel: boolean;
};
export type Train = Record<string, unknown>;
export type SentState = { lead?: boolean; est?: string; canceled?: boolean };
export type Msg = { title: string; body: string; tag: string };

// Samma grupper som i appen (TaxiData/ankomster.js TRAIN_GROUPS)
const GROUPS: Record<string, { sig: RegExp; name: RegExp }> = {
  sthlm: { sig: /^(Cst|Sci|Arnc)$/, name: /^(Stockholm|Arlanda)/i },
  kbh: { sig: /^(Dk\.|Kh$)/, name: /^(Köpenhamn|København|Kastrup)/i },
  oslo: { sig: /^(No\.|Öslo$|Xoslo$)/, name: /^Oslo/i },
};
// Tåg som ska fram inom så här lång tid räknas (förseningar och inställt)
export const HORIZON_MIN = 180;
// Ny tid meddelas igen när den flyttats minst så här mycket sedan förra beskedet
export const EST_STEP_MIN = 10;
// Säkerhetsgräns: max antal notiser per förare och minut
export const MAX_PER_TICK = 4;

const ms = (v: unknown) => { if (!v) return 0; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : 0; };
export const hm = (t: number) => new Date(t).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });

export function groupOf(t: Train): string {
  const sig = String(t.otherSig || ""), name = String(t.other || "");
  for (const [k, g] of Object.entries(GROUPS)) if (g.sig.test(sig) || g.name.test(name)) return k;
  return "";
}
export function isFast(t: Train): boolean {
  return t.snabb === true || /snabbt[åa]g|x\s?2000|sj\s?3000/i.test(String(t.product || ""));
}
export function matches(w: TrainWatch, t: Train): boolean {
  if (w.origins?.length && !w.origins.includes(groupOf(t))) return false;
  if (w.fast_only && !isFast(t)) return false;
  if (w.train_nos?.length && !w.train_nos.includes(String(t.id || ""))) return false;
  return true;
}
export const sentKey = (driver: string, ident: string, sched: number) => driver + "|" + ident + "|" + sched;

type Out = { driver: string; ident: string; sched: string; state: SentState; msg: Msg };

// Avgör vilka notiser som ska skickas nu. sent: tidigare skickat (nyckel sentKey). Returnerar notiser + nytt tillstånd.
export function decide(watches: TrainWatch[], trains: Train[], sent: Map<string, SentState>, now: number): Out[] {
  const byDriver = new Map<string, TrainWatch[]>();
  for (const w of watches) { const a = byDriver.get(w.driver_id) || []; a.push(w); byDriver.set(w.driver_id, a); }
  const out: Out[] = [];
  for (const [driver, ws] of byDriver) {
    let n = 0;
    const cands = trains.filter((t) => t.dir === undefined || t.dir === "ANK")
      .map((t) => ({ t, sched: ms(t.sched), est: ms(t.est) }))
      .filter((x) => x.sched && !ms(x.t.act))
      .sort((a, b) => (a.est || a.sched) - (b.est || b.sched));
    for (const { t, sched, est } of cands) {
      if (n >= MAX_PER_TICK) break;
      const eta = est || sched;
      if (eta < now - 60e3 || eta > now + HORIZON_MIN * 60e3) continue;
      const m = ws.filter((w) => matches(w, t));
      if (!m.length) continue;
      // Flera bevakningar på samma tåg: slå ihop (längsta förvarning, minsta förseningsgräns)
      const lead = Math.max(...m.map((w) => w.lead_min || 0));
      const wantDelay = m.some((w) => w.notify_delay);
      const delayMin = Math.min(...m.filter((w) => w.notify_delay).map((w) => w.delay_min || 10), 999);
      const wantCancel = m.some((w) => w.notify_cancel);
      const ident = String(t.id || "");
      const key = sentKey(driver, ident, sched);
      const prev = sent.get(key) || {};
      const s: SentState = { ...prev };
      const from = String(t.other || "");
      const prod = String(t.product || "Tåg").replace(/\s*\(.*\)$/, "");
      const name = prod + " " + ident + (from ? " från " + from : "");
      const track = t.track ? " Spår " + t.track + "." : "";
      const late = est && est > sched ? Math.round((est - sched) / 60e3) : 0;
      const canceled = t.canceled === true || String(t.canceled) === "true";
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
        title = "🚆 " + name + " ankommer " + hm(eta);
        body = (mins > 0 ? "Om " + mins + " min." : "Nu.") + track +
          (late >= 1 ? " " + late + " min sen (planerad " + hm(sched) + ")." : " I tid.");
      } else if (wantDelay && est && late >= delayMin) {
        const prevEst = ms(s.est) || sched;
        if (Math.abs(est - prevEst) >= EST_STEP_MIN * 60e3) {
          s.est = new Date(est).toISOString();
          title = "🕒 " + name + ": ny tid " + hm(est);
          body = "Planerad " + hm(sched) + ", försenat " + late + " min." + track;
        }
      }
      if (!title) continue;
      n++;
      out.push({ driver, ident, sched: new Date(sched).toISOString(), state: s, msg: { title, body, tag: "tag-" + ident } });
    }
  }
  return out;
}

// Gör om skickat-listan från databasen till en Map
export function sentMap(rows: { driver_id: string; ident: string; sched: string; state: SentState }[]): Map<string, SentState> {
  const m = new Map<string, SentState>();
  for (const r of rows || []) m.set(sentKey(r.driver_id, r.ident, ms(r.sched)), r.state || {});
  return m;
}
