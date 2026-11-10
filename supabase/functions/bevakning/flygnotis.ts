// Flyg-Bevakningar: fasta notiser för ankomster till Landvetter (ursprung, flygbolag, flygnummer).
// Ren logik utan nätverk, så den kan testas (supabase/functions/_test/flygnotis_test.ts).
// Vilka bevakningar som är aktiva just nu avgör databasen (fw_svc_active).
// I got.json saknas ofta fältet iata – avreseorten ligger då i "other" (t.ex. "London LHR" eller "Helsingfors").

export type FlightWatch = {
  id: number; driver_id: string; origins: string[]; airlines: string[]; flight_nos: string[];
  lead_min: number; notify_delay: boolean; delay_min: number; notify_cancel: boolean;
};
export type Flight = Record<string, unknown>;
export type SentState = { lead?: boolean; est?: string; canceled?: boolean };
export type Msg = { title: string; body: string; tag: string };

export const HORIZON_MIN = 180;
export const EST_STEP_MIN = 10;
export const MAX_PER_TICK = 4;

// Vanliga avreseorter till GOT, när IATA saknas i cachen och bara stadsnamnet finns.
const CITY: Record<string, string> = {
  "stockholm": "ARN", "stockholm arn": "ARN", "arlanda": "ARN",
  "stockholm bma": "BMA", "bromma": "BMA",
  "malmö": "MMX", "malmo": "MMX",
  "köpenhamn": "CPH", "kopenhamn": "CPH", "københavn": "CPH", "copenhagen": "CPH",
  "oslo": "OSL",
  "london": "LHR", "london lhr": "LHR", "heathrow": "LHR",
  "london stn": "STN", "stansted": "STN",
  "london lgw": "LGW", "gatwick": "LGW",
  "amsterdam": "AMS",
  "frankfurt": "FRA",
  "münchen": "MUC", "munchen": "MUC", "munich": "MUC",
  "helsingfors": "HEL", "helsinki": "HEL",
  "antalya": "AYT", "malaga": "AGP", "málaga": "AGP",
  "teneriffa": "TFS", "tenerife": "TFS",
  "palma": "PMI", "palma de mallorca": "PMI",
  "barcelona": "BCN",
  "düsseldorf": "DUS", "dusseldorf": "DUS",
  "zürich": "ZRH", "zurich": "ZRH",
  "genève": "GVA", "geneve": "GVA", "geneva": "GVA",
  "istanbul": "IST", "istanbul ist": "IST",
  "warszawa": "WAW", "warsaw": "WAW",
  "krakow": "KRK", "kraków": "KRK",
  "alicante": "ALC", "faro": "FAO",
  "bergen": "BGO", "stavanger": "SVG",
  "umeå": "UME", "umea": "UME", "luleå": "LLA", "lulea": "LLA",
  "kiruna": "KRN", "visby": "VBY",
  "paris": "CDG", "paris cdg": "CDG",
  "bryssel": "BRU", "brussels": "BRU",
  "milano": "MXP", "milano mxp": "MXP",
  "manchester": "MAN",
  "gdansk": "GDN", "gdańsk": "GDN",
  "tirana": "TIA", "lanzarote": "ACE",
};

// Flygbolagskod (IATA) mot namn i got.json, när bevakningen är vald på bolag.
const AIRLINE_NAME: Record<string, RegExp> = {
  SK: /sas/i, DY: /norwegian/i, D8: /norwegian/i, FR: /ryanair/i, KL: /klm/i,
  LH: /lufthansa/i, AY: /finnair/i, BA: /british\s*airways/i, EW: /eurowings/i,
  WF: /wideroe|widerøe/i, W6: /wizz/i, W4: /wizz/i, TK: /turkish/i, AF: /air\s*france/i,
  SN: /brussels/i, LX: /swiss/i, LO: /lot/i, PC: /pegasus/i, DK: /sunclass/i,
  "6B": /tui/i, BT: /air\s*baltic/i,
};

const ms = (v: unknown) => { if (!v) return 0; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : 0; };
export const hm = (t: number) => new Date(t).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });

export function originCode(f: Flight): string {
  const iata = String(f.iata || "").toUpperCase().trim();
  if (/^[A-Z]{3}$/.test(iata)) return iata;
  const other = String(f.other || "").trim();
  const tail = /\b([A-Z]{3})$/.exec(other);
  if (tail) return tail[1];
  return CITY[other.toLowerCase()] || "";
}

export function airlineCode(f: Flight): string {
  const id = String(f.id || "").toUpperCase();
  const m = /^([A-Z]{1,3})\d/.exec(id);
  return m ? m[1] : "";
}

export function matches(w: FlightWatch, f: Flight): boolean {
  if (w.origins?.length) {
    const code = originCode(f);
    if (!code || !w.origins.map((x) => x.toUpperCase()).includes(code)) return false;
  }
  if (w.airlines?.length) {
    const ac = airlineCode(f);
    const name = String(f.airline || "");
    const ok = w.airlines.some((a) => {
      const k = String(a || "").toUpperCase();
      if (ac && k === ac) return true;
      const re = AIRLINE_NAME[k];
      return !!(re && re.test(name));
    });
    if (!ok) return false;
  }
  if (w.flight_nos?.length) {
    const id = String(f.id || "").toUpperCase();
    if (!w.flight_nos.map((x) => String(x).toUpperCase()).includes(id)) return false;
  }
  return true;
}

export const sentKey = (driver: string, ident: string, sched: number) => driver + "|" + ident + "|" + sched;

type Out = { driver: string; ident: string; sched: string; state: SentState; msg: Msg };

export function decide(watches: FlightWatch[], flights: Flight[], sent: Map<string, SentState>, now: number): Out[] {
  const byDriver = new Map<string, FlightWatch[]>();
  for (const w of watches) { const a = byDriver.get(w.driver_id) || []; a.push(w); byDriver.set(w.driver_id, a); }
  const out: Out[] = [];
  for (const [driver, ws] of byDriver) {
    let n = 0;
    const cands = flights
      .map((f) => ({ f, sched: ms(f.sched), est: ms(f.est) }))
      .filter((x) => x.sched && !ms(x.f.act))
      .sort((a, b) => (a.est || a.sched) - (b.est || b.sched));
    for (const { f, sched, est } of cands) {
      if (n >= MAX_PER_TICK) break;
      const code = String(f.status || "").toUpperCase();
      if (code === "DEL" || code === "LAN") continue;
      const eta = est || sched;
      if (eta < now - 60e3 || eta > now + HORIZON_MIN * 60e3) continue;
      const m = ws.filter((w) => matches(w, f));
      if (!m.length) continue;
      const lead = Math.max(...m.map((w) => w.lead_min || 0));
      const wantDelay = m.some((w) => w.notify_delay);
      const delayMin = Math.min(...m.filter((w) => w.notify_delay).map((w) => w.delay_min || 10), 999);
      const wantCancel = m.some((w) => w.notify_cancel);
      const ident = String(f.id || "");
      const key = sentKey(driver, ident, sched);
      const prev = sent.get(key) || {};
      const s: SentState = { ...prev };
      const from = String(f.other || "");
      const name = ident + (from ? " från " + from : "");
      const late = est && est > sched ? Math.round((est - sched) / 60e3) : 0;
      const canceled = code === "CAN";
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
        title = "✈️ " + name + " ankommer " + hm(eta);
        body = (mins > 0 ? "Om " + mins + " min." : "Nu.") +
          (late >= 1 ? " " + late + " min sen (planerad " + hm(sched) + ")." : " I tid.");
      } else if (wantDelay && est && late >= delayMin) {
        const prevEst = ms(s.est) || sched;
        if (Math.abs(est - prevEst) >= EST_STEP_MIN * 60e3) {
          s.est = new Date(est).toISOString();
          title = "🕒 " + name + ": ny tid " + hm(est);
          body = "Planerad " + hm(sched) + ", försenat " + late + " min.";
        }
      }
      if (!title) continue;
      n++;
      out.push({ driver, ident, sched: new Date(sched).toISOString(), state: s, msg: { title, body, tag: "flyg-" + ident } });
    }
  }
  return out;
}

export function sentMap(rows: { driver_id: string; ident: string; sched: string; state: SentState }[]): Map<string, SentState> {
  const m = new Map<string, SentState>();
  for (const r of rows || []) m.set(sentKey(r.driver_id, r.ident, ms(r.sched)), r.state || {});
  return m;
}
