// bevakning: webbnotiser (push) för bevakade flyg (Landvetter) och tåg (Göteborg C).
//  - action "vapid": publik VAPID-nyckel (skapas första gången och sparas i Supabase Vault, privata nyckeln lämnar aldrig servern)
//  - action "test":  skickar en testnotis till förarens egna enheter (kräver inloggning, token)
//  - action "tick":  körs av pg_cron varje minut NÄR det finns aktiva bevakningar (kräver x-tick-key)
// Flygdata: samma cache som appen (skiftlogg/feed/got.json, uppdateras ca var 5:e minut från Swedavia).
// Tågdata: samma Vercel-funktion som appen (/api/trains, CDN-cache 60 s) – ingen extra last på Trafikverket.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { notisKey, saveNotice } from "./notis.ts";

// Hur länge en bevakning ligger kvar efter sista händelsen (tåg ankommit / sista väskan ute). EN konstant.
const AFTER_MIN = 30;
// Flyg: om inget bagage-besked kommer efter landning väntar vi så här länge extra innan bevakningen tas bort.
const BAG_WAIT_MIN = 45;
// Flyg: om första väskan kommit men inget "sista väskan"-besked kommer väntar vi så här länge innan bevakningen tas bort.
const LASTBAG_WAIT_MIN = 45;
// Säkerhetsgräns: ingen bevakning ligger kvar mer än så här länge efter planerad/beräknad tid.
const MAX_AFTER_SCHED_H = 3;
// Ny beräknad tid meddelas när den flyttats minst så här mycket sedan förra beskedet.
const EST_STEP_MIN = 10;

const ORIGINS = ["https://taxikit.shop", "https://www.taxikit.shop", "https://chrispypie.github.io", "http://localhost:8765"];
const FLIGHT_URLS = ["https://taxikit.shop/skiftlogg/feed/got.json",
  "https://raw.githubusercontent.com/ChrispyPie/taxikit-shop/main/skiftlogg/feed/got.json"];
const TRAIN_URLS = ["https://taxikit-shop.vercel.app/api/trains", "https://taxikit.shop/skiftlogg/feed/tag.json"];
const APP_URL = "/TaxiData/?sida=ankomster";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

async function secret(name: string): Promise<string | null> {
  const { data } = await sb.rpc("bev_svc_secret", { p_name: name });
  return (data as string) || null;
}

let vapidReady = false;
async function vapid(): Promise<string> {
  let pub = await secret("VAPID_PUBLIC_KEY");
  if (!pub) {
    const k = webpush.generateVAPIDKeys();
    const { data, error } = await sb.rpc("bev_svc_init_vapid", { p_public: k.publicKey, p_private: k.privateKey });
    if (error) throw new Error("vapid_init");
    pub = data as string;
  }
  if (!vapidReady) {
    const priv = await secret("VAPID_PRIVATE_KEY");
    if (!priv) throw new Error("vapid_missing");
    webpush.setVapidDetails("https://taxikit.shop", pub, priv);
    vapidReady = true;
  }
  return pub;
}

type Msg = { title: string; body: string; tag: string };
async function sendTo(driver: string, msg: Msg) {
  await vapid();
  const { data } = await sb.rpc("bev_svc_targets", { p_driver: driver });
  const subs = (data || []) as { id: number; endpoint: string; p256dh: string; auth: string }[];
  let sent = 0, failed = 0;
  const ts = Date.now();
  const nkey = notisKey(msg, ts);
  // Spara i notisflödet först (även om föraren inte har någon telefon med push påslagen)
  const saved = await saveNotice(sb, driver, msg, nkey);
  const payload = JSON.stringify({ ...msg, url: APP_URL, ts, nkey });
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
        { TTL: 3600, urgency: "high" });
      sent++;
      await sb.rpc("bev_svc_result", { p_id: s.id, p_ok: true, p_gone: false });
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode || 0;
      await sb.rpc("bev_svc_result", { p_id: s.id, p_ok: false, p_gone: code === 404 || code === 410 });
    }
  }
  return { sent, failed, devices: subs.length, saved };
}

async function getJson(urls: string[]) {
  let last: unknown = null;
  for (const u of urls) {
    try {
      const r = await fetch(u + (u.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 30000),
        { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last || new Error("no_source");
}

const ms = (v: unknown) => { if (!v) return 0; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : 0; };
const hm = (t: number) => new Date(t).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
const iso = (t: number) => new Date(t).toISOString();

type Watch = { id: number; driver_id: string; ident: string; sched: string; label: string | null;
  state: Record<string, unknown>; expires_at: string };

function findItem<T extends { id?: string; sched?: string }>(list: T[], w: Watch): T | null {
  const ws = ms(w.sched);
  let best: T | null = null, bestD = 6 * 3600e3;
  for (const f of list) {
    if (String(f.id || "") !== w.ident) continue;
    const dd = Math.abs(ms(f.sched) - ws);
    if (dd < 60e3) return f;
    if (dd < bestD) { best = f; bestD = dd; }
  }
  return best;
}

// Fallback-utgång: max 3 h efter planerad/beräknad tid
function capOf(sched: number, est: number) { return Math.max(sched, est || 0) + MAX_AFTER_SCHED_H * 3600e3; }

async function tickFlights(watches: Watch[]) {
  if (!watches.length) return 0;
  const j = await getJson(FLIGHT_URLS);
  const list = (j.arrivals || []) as Record<string, string>[];
  let n = 0;
  for (const w of watches) {
    const f = findItem(list, w);
    if (!f) continue;
    const s = { ...(w.state || {}) } as Record<string, unknown>;
    const code = String(f.status || "").toUpperCase();
    const sched = ms(f.sched) || ms(w.sched), est = ms(f.est);
    const act = ms(f.act) || (code === "LAN" ? est || sched : 0);
    let fb = ms(f.firstBag);
    if (fb && act && fb < act - 30 * 60e3) fb = 0;   // gammal tid från tidigare flyg
    if (fb && !act) fb = 0;
    // Sista väskan: Swedavia baggage.lastBagUtc (i got.json "lastBag")
    let lb = ms(f.lastBag);
    if (lb && (!act || lb < act - 30 * 60e3 || (fb && lb < fb - 60e3))) lb = 0;   // gammal/orimlig tid
    const belt = String(f.baggage || "");
    const from = f.other || w.label || "";
    const name = f.id + (from ? " från " + from : "");
    const lines: string[] = [];
    let title = "", exp = capOf(sched, est);
    if (code === "CAN" && !s.canceled) { s.canceled = true; title = "❌ " + name + " är inställt"; }
    else if ((code === "RER" || code === "DIV") && !s.diverted) { s.diverted = true; title = "⚠️ " + name + " är omdirigerat"; }
    if (code === "CAN" || code === "RER" || code === "DIV") exp = Math.min(exp, Date.now() + AFTER_MIN * 60e3);
    if (act && !s.landed) {
      s.landed = true;
      title = "🛬 " + name + " har landat " + hm(act);
      if (belt) lines.push("Bagaget kommer på band " + belt + ".");
      else if (f.firstBagEst) lines.push("Väskor beräknas ca " + hm(ms(f.firstBagEst)) + ".");
    }
    if (fb && !s.firstBag && lb && !s.lastBag) s.firstBag = true;   // båda samtidigt: bara "sista väskan"-notisen
    if (fb && !s.firstBag) {
      s.firstBag = true;
      const t2 = "🧳 Bagaget rullar" + (belt ? " på band " + belt : "") + " – " + f.id + (from ? " från " + from : "");
      if (title) lines.unshift(t2.replace(/^🧳 /, "")); else title = t2;
      lines.push("Första väskan " + hm(fb) + ".");
    }
    if (lb && !s.lastBag) {
      s.lastBag = true; s.firstBag = true;
      const t3 = "🧳 Sista väskan ute" + (belt ? " på band " + belt : "") + " – " + f.id + (from ? " från " + from : "");
      if (title) lines.unshift("Sista väskan ute" + (belt ? " på band " + belt : "") + "."); else title = t3;
      lines.push("Sista väskan " + hm(lb) + ".");
    }
    if (!act && !s.canceled && est && sched) {
      const prev = ms(s.est as string) || sched;
      if (Math.abs(est - prev) >= EST_STEP_MIN * 60e3) {
        s.est = iso(est);
        if (!title) title = "🕒 " + name + ": ny tid " + hm(est);
        lines.push("Planerad " + hm(sched) + (est > sched ? ", försenat " + Math.round((est - sched) / 60e3) + " min." : "."));
      }
    }
    // Utgång: 30 min efter sista väskan; bara första väskan: väntetid + 30 min; landat utan bagagebesked: väntetid + 30 min;
    // annars 3 h-gränsen (gäller alltid som tak)
    if (lb) exp = Math.min(exp, lb + AFTER_MIN * 60e3);
    else if (fb) exp = Math.min(exp, fb + (LASTBAG_WAIT_MIN + AFTER_MIN) * 60e3);
    else if (act) exp = Math.min(exp, act + (BAG_WAIT_MIN + AFTER_MIN) * 60e3);
    if (belt) s.belt = belt;
    if (title) { await sendTo(w.driver_id, { title, body: lines.join(" "), tag: "flyg-" + f.id }); n++; }
    if (title || ms(w.expires_at) !== exp) await sb.rpc("bev_svc_update", { p_id: w.id, p_state: s, p_expires: iso(exp) });
  }
  return n;
}

async function tickTrains(watches: Watch[]) {
  if (!watches.length) return 0;
  const j = await getJson(TRAIN_URLS);
  const list = ((j.trains || []) as Record<string, unknown>[]).filter((t) => t.dir === "ANK") as Record<string, string>[];
  let n = 0;
  for (const w of watches) {
    const t = findItem(list, w);
    if (!t) continue;
    const s = { ...(w.state || {}) } as Record<string, unknown>;
    const sched = ms(t.sched) || ms(w.sched), est = ms(t.est), act = ms(t.act);
    const from = String(t.other || w.label || "");
    const prod = String(t.product || "Tåg").replace(/\s*\(.*\)$/, "");
    const name = prod + " " + t.id + (from ? " från " + from : "");
    const canceled = String(t.canceled) === "true";
    let title = "", body = "", exp = capOf(sched, est);
    if (canceled && !s.canceled) { s.canceled = true; title = "❌ " + name + " är inställt"; }
    if (canceled) exp = Math.min(exp, Date.now() + AFTER_MIN * 60e3);
    if (act && !s.arrived) {
      s.arrived = true;
      title = "🚆 " + name + " har ankommit" + (t.track ? " spår " + t.track : "") + ", " + hm(act);
      const late = Math.round((act - sched) / 60e3);
      body = late >= 1 ? late + " min sen." : "I tid.";
    } else if (!act && !canceled && est && sched) {
      const prev = ms(s.est as string) || sched;
      if (Math.abs(est - prev) >= EST_STEP_MIN * 60e3) {
        s.est = iso(est);
        title = "🕒 " + name + ": ny tid " + hm(est);
        body = "Planerad " + hm(sched) + (est > sched ? ", försenat " + Math.round((est - sched) / 60e3) + " min." : ".") +
          (t.track ? " Spår " + t.track + "." : "");
      }
    }
    if (act) exp = Math.min(exp, act + AFTER_MIN * 60e3);
    if (title) { await sendTo(w.driver_id, { title, body, tag: "tag-" + t.id }); n++; }
    if (title || ms(w.expires_at) !== exp) await sb.rpc("bev_svc_update", { p_id: w.id, p_state: s, p_expires: iso(exp) });
  }
  return n;
}

Deno.serve(async (req) => {
  const h = headers(req.headers.get("origin") || "");
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return out({ error: "method" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return out({ error: "bad_json" }, 400); }
  try {
    if (b.action === "vapid") return out({ key: await vapid() });
    if (b.action === "test") {
      const token = b.token;
      if (typeof token !== "string" || token.length < 8 || token.length > 300) return out({ error: "invalid_session", code: "28000" }, 401);
      const { data, error } = await sb.rpc("bev_svc_driver", { p_token: token });
      if (error || !data) return out({ error: "invalid_session", code: "28000" }, 401);
      const r = await sendTo(data as string, { title: "🔔 Testnotis från TaxiData",
        body: "Det fungerar! Så här låter det när ett bevakat flyg eller tåg ändras.", tag: "test" });
      return out(r);
    }
    if (b.action === "tick") {
      const key = await secret("BEVAKNING_TICK_KEY");
      if (!key || req.headers.get("x-tick-key") !== key) return out({ error: "forbidden" }, 403);
      const [fl, tr] = await Promise.all([sb.rpc("bev_svc_active", { p_kind: "flyg" }), sb.rpc("bev_svc_active", { p_kind: "tag" })]);
      const res: Record<string, unknown> = {};
      try { res.flyg = await tickFlights((fl.data || []) as Watch[]); } catch (e) { res.flygErr = String(e).slice(0, 100); }
      try { res.tag = await tickTrains((tr.data || []) as Watch[]); } catch (e) { res.tagErr = String(e).slice(0, 100); }
      return out(res);
    }
    return out({ error: "bad_action" }, 400);
  } catch (_e) {
    return out({ error: "server_error" }, 500);
  }
});
