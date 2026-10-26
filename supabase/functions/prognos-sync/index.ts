// prognos-sync: hämtar prognos-public-data.json varje minut, sparar snapshot,
// spårar bokningar per zon/kategori/block med tidsuppskattning + konfidens.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = ["https://taxikit.shop", "https://www.taxikit.shop", "https://chrispypie.github.io", "http://localhost:8765"];
const LOGIN_URL = "https://prognos.taxigoteborg.nu/api/prognos-login";
const DATA_URL = "https://prognos.taxigoteborg.nu/prognos-public-data.json";
const APP_URL = "/TaxiData/?sida=prognos";
const CATS = ["app", "barnstol", "ovrigt", "storbil", "elbil", "babyskydd"] as const;
// Blockgränser: 0 = 0–40, 1 = 40–80, 2 = 80–120 minuter framåt
const BOUNDARY_MIN = [40, 80, 120]; // när en bokning korsar in i block i från i+1
const CAT_SV: Record<string, string> = {
  app: "Kombi",
  barnstol: "Barnstol",
  ovrigt: "Övriga",
  storbil: "Storbil",
  elbil: "Miljöbil",
  babyskydd: "Babyskydd",
};

type Conf = "saker" | "trolig" | "osaker";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tick-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
}

async function secret(name: string): Promise<string | null> {
  const { data } = await sb.rpc("prognos_svc_secret", { p_name: name });
  return (data as string) || null;
}

let vapidReady = false;
async function ensureVapid() {
  if (vapidReady) return;
  const pub = await secret("VAPID_PUBLIC_KEY");
  const priv = await secret("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return;
  webpush.setVapidDetails("https://taxikit.shop", pub, priv);
  vapidReady = true;
}

async function sendTo(driver: string, msg: { title: string; body: string; tag: string }) {
  await ensureVapid();
  if (!vapidReady) return;
  const { data } = await sb.rpc("bev_svc_targets", { p_driver: driver });
  const subs = (data || []) as { id: number; endpoint: string; p256dh: string; auth: string }[];
  const payload = JSON.stringify({ ...msg, url: APP_URL, ts: Date.now() });
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 3600, urgency: "high" },
      );
      await sb.rpc("bev_svc_result", { p_id: s.id, p_ok: true, p_gone: false });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode || 0;
      await sb.rpc("bev_svc_result", { p_id: s.id, p_ok: false, p_gone: code === 404 || code === 410 });
    }
  }
}

type Block = Record<string, number> & { total?: number };
type Zone = { id: string; name: string; total: number; blocks: Block[] } & Record<string, number>;
type Payload = { zones: Record<string, Zone>; morgonprognos?: unknown; generated_at?: string };

type Tracked = {
  id: number;
  block: number;
  estimated_at: string;
  confidence: Conf;
  observed_at: string;
};

function blockVal(b: Block | undefined, cat: string): number {
  if (!b) return 0;
  const v = b[cat];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Avrunda till närmaste jämna 5-minutersstreck (bokningar landar nästan alltid där). */
function snap5(d: Date): Date {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const m = x.getMinutes();
  const rounded = Math.round(m / 5) * 5;
  if (rounded === 60) {
    x.setHours(x.getHours() + 1);
    x.setMinutes(0);
  } else {
    x.setMinutes(rounded);
  }
  return x;
}

function plusMin(obs: Date, mins: number): Date {
  return snap5(new Date(obs.getTime() + mins * 60_000));
}

async function openTracked(zone: string, cat: string): Promise<Tracked[]> {
  const { data } = await sb.rpc("prognos_svc_open_bookings", { p_zone: zone, p_cat: cat });
  return ((data || []) as Tracked[]).map((t) => ({
    ...t,
    block: Number(t.block),
    confidence: (t.confidence as Conf) || "trolig",
  }));
}

async function insertBooking(
  zone: string,
  zname: string,
  cat: string,
  est: Date,
  obs: Date,
  block: number,
  snapId: number | null,
  confidence: Conf,
  notifyList: { zone_id: string; zone_name: string; category: string; estimated_at: string }[],
  notify: boolean,
) {
  await sb.rpc("prognos_svc_insert_booking", {
    p_zone: zone,
    p_zone_name: zname,
    p_cat: cat,
    p_est: est.toISOString(),
    p_obs: obs.toISOString(),
    p_block: block,
    p_snap: snapId,
    p_confidence: confidence,
  });
  if (notify) {
    notifyList.push({
      zone_id: zone,
      zone_name: zname,
      category: cat,
      estimated_at: est.toISOString(),
    });
  }
}

/**
 * Diff per zon/kategori:
 * 1) Korsningar (FIFO): block N+1 minskar och block N ökar → flyttad, tid = now+boundary (säker).
 * 2) Nya i block 2 (80–120) utan korsning: now+120, trolig.
 * 3) Nya i block 1 (40–80) utan korsning från 2: osäker (direktbokning), tid mitt i fönstret tills den korsar till 0.
 * 4) Nya i block 0 (0–40): osäker/direkt, now+20 tills mer info.
 * 5) Kvarvarande minskningar = cancelled/assigned/announced.
 */
async function reconcileZoneCat(
  zid: string,
  zname: string,
  cat: string,
  oldBlocks: number[],
  newBlocks: number[],
  observed: Date,
  snapId: number | null,
  isSeed: boolean,
  newEvents: { zone_id: string; zone_name: string; category: string; estimated_at: string }[],
): Promise<{ created: number; canceled: number; updated: number }> {
  let created = 0, canceled = 0, updated = 0;
  const delta = [0, 1, 2].map((i) => newBlocks[i] - oldBlocks[i]);
  // Arbetskopior av hur många "slots" som återstår att förklara per block
  const rise = delta.map((d) => Math.max(0, d));
  const fall = delta.map((d) => Math.max(0, -d));

  let tracked = await openTracked(zid, cat);
  // Sortera FIFO per block: äldst estimated_at först
  const byBlock = (b: number) =>
    tracked.filter((t) => t.block === b).sort((a, b2) =>
      a.estimated_at < b2.estimated_at ? -1 : a.estimated_at > b2.estimated_at ? 1 : a.id - b2.id
    );

  // --- Korsningar: 2→1 (exakt 80 min), 1→0 (exakt 40 min) ---
  for (const from of [2, 1] as const) {
    const to = from - 1;
    const moves = Math.min(fall[from], rise[to]);
    if (moves <= 0) continue;
    const candidates = byBlock(from);
    for (let i = 0; i < moves; i++) {
      const item = candidates[i];
      const est = plusMin(observed, BOUNDARY_MIN[to]); // 80 resp 40
      if (item) {
        await sb.rpc("prognos_svc_update_booking", {
          p_id: item.id,
          p_est: est.toISOString(),
          p_block: to,
          p_confidence: "saker",
        });
        updated++;
        item.block = to;
        item.estimated_at = est.toISOString();
        item.confidence = "saker";
      } else {
        // Ingen spårad post att flytta (t.ex. efter prune) – skapa säker vid gränsen
        await insertBooking(zid, zname, cat, est, observed, to, snapId, "saker", newEvents, !isSeed);
        created++;
      }
    }
    fall[from] -= moves;
    rise[to] -= moves;
    // Uppdatera lokal tracked-vy
    tracked = await openTracked(zid, cat);
  }

  // --- Nya som inte förklaras av korsning ---
  // Block 2: ny förbokning ~120 min fram, trolig
  for (let i = 0; i < rise[2]; i++) {
    const est = plusMin(observed, 120);
    await insertBooking(zid, zname, cat, est, observed, 2, snapId, "trolig", newEvents, !isSeed);
    created++;
  }
  rise[2] = 0;

  // Block 1: direktbokning i 40–80 utan dropp i block 2 → osäker
  for (let i = 0; i < rise[1]; i++) {
    const est = plusMin(observed, 60); // mitt tills den bekräftas vid 40-gränsen
    await insertBooking(zid, zname, cat, est, observed, 1, snapId, "osaker", newEvents, !isSeed);
    created++;
  }
  rise[1] = 0;

  // Block 0: syns nära i tid (direkt / redan nära) → osäker runt +20
  for (let i = 0; i < rise[0]; i++) {
    const est = plusMin(observed, 20);
    await insertBooking(zid, zname, cat, est, observed, 0, snapId, "osaker", newEvents, !isSeed);
    created++;
  }
  rise[0] = 0;

  // --- Kvarvarande fall: cancelled/assigned/announced (FIFO i det blocket) ---
  tracked = await openTracked(zid, cat);
  for (const b of [0, 1, 2] as const) {
    if (fall[b] <= 0) continue;
    const candidates = byBlock(b);
    const n = Math.min(fall[b], candidates.length);
    for (let i = 0; i < n; i++) {
      const { error } = await sb.from("prognos_bookings").update({ status: "canceled" }).eq("id", candidates[i].id);
      if (error) {
        await sb.rpc("prognos_svc_cancel_n", { p_zone: zid, p_cat: cat, p_n: 1 });
      }
      canceled++;
    }
    // Om fler fall än spårade poster (bör inte hända ofta)
    const leftover = fall[b] - n;
    if (leftover > 0) {
      const { data: nCancel } = await sb.rpc("prognos_svc_cancel_n", { p_zone: zid, p_cat: cat, p_n: leftover });
      canceled += (nCancel as number) || 0;
    }
    fall[b] = 0;
  }

  return { created, canceled, updated };
}

async function tick(): Promise<Response> {
  const pin = await secret("PROGNOS_PIN");
  if (!pin) {
    await sb.rpc("prognos_svc_set_status", { p_status: "code_needed", p_err: "saknar_kod" });
    return new Response(JSON.stringify({ ok: false, reason: "code_needed" }), { status: 200 });
  }

  let loginRes: Response;
  try {
    loginRes = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
  } catch {
    await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: "login_network" });
    return new Response(JSON.stringify({ ok: false, reason: "login_network" }), { status: 200 });
  }
  if (loginRes.status === 401 || loginRes.status === 403) {
    await sb.rpc("prognos_svc_set_status", { p_status: "code_needed", p_err: "http_" + loginRes.status });
    await sb.rpc("prognos_svc_insert_snapshot", {
      p_payload: {},
      p_ok: false,
      p_http: loginRes.status,
      p_err: "login_unauthorized",
    });
    return new Response(JSON.stringify({ ok: false, reason: "code_needed" }), { status: 200 });
  }
  if (!loginRes.ok) {
    await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: "login_" + loginRes.status });
    return new Response(JSON.stringify({ ok: false, reason: "login_fail" }), { status: 200 });
  }
  const loginJson = await loginRes.json().catch(() => ({})) as { ok?: boolean; token?: string };
  const token = loginJson.token;
  if (!loginJson.ok || !token) {
    await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: "no_token" });
    return new Response(JSON.stringify({ ok: false, reason: "no_token" }), { status: 200 });
  }

  let dataRes: Response;
  try {
    dataRes = await fetch(
      DATA_URL + "?token=" + encodeURIComponent(token) + "&t=" + Date.now(),
      { headers: { Accept: "application/json" }, cache: "no-store" as RequestCache },
    );
  } catch {
    await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: "data_network" });
    return new Response(JSON.stringify({ ok: false, reason: "data_network" }), { status: 200 });
  }
  if (dataRes.status === 401 || dataRes.status === 403) {
    await sb.rpc("prognos_svc_set_status", { p_status: "code_needed", p_err: "data_" + dataRes.status });
    await sb.rpc("prognos_svc_insert_snapshot", {
      p_payload: {},
      p_ok: false,
      p_http: dataRes.status,
      p_err: "data_unauthorized",
    });
    return new Response(JSON.stringify({ ok: false, reason: "code_needed" }), { status: 200 });
  }
  if (!dataRes.ok) {
    await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: "data_" + dataRes.status });
    return new Response(JSON.stringify({ ok: false, reason: "data_fail" }), { status: 200 });
  }
  const payload = await dataRes.json() as Payload;
  const observed = new Date();

  const { data: prevRaw } = await sb.rpc("prognos_svc_latest_payload");
  const prev = (prevRaw || null) as Payload | null;

  const { data: snapId } = await sb.rpc("prognos_svc_insert_snapshot", {
    p_payload: payload,
    p_ok: true,
    p_http: 200,
    p_err: null,
  });

  let created = 0, canceled = 0, updated = 0;
  const newEvents: { zone_id: string; zone_name: string; category: string; estimated_at: string }[] = [];
  const isSeed = !prev || !prev.zones;

  if (payload.zones) {
    const zoneIds = new Set([
      ...Object.keys(payload.zones),
      ...((prev && prev.zones) ? Object.keys(prev.zones) : []),
    ]);
    for (const zid of zoneIds) {
      const nz = payload.zones[zid];
      const oz = prev && prev.zones ? prev.zones[zid] : undefined;
      const zname = (nz && nz.name) || (oz && oz.name) || zid;
      for (const cat of CATS) {
        const newBlocks = [0, 1, 2].map((i) => blockVal(nz?.blocks?.[i], cat));
        const oldBlocks = isSeed
          ? [0, 0, 0]
          : [0, 1, 2].map((i) => blockVal(oz?.blocks?.[i], cat));
        // Seed: behandla nuvarande block som "nya" utan push
        const r = await reconcileZoneCat(
          zid, zname, cat, oldBlocks, newBlocks, observed,
          (snapId as number) || null, isSeed, newEvents,
        );
        created += r.created;
        canceled += r.canceled;
        updated += r.updated;
      }
    }
  }

  for (const ev of newEvents) {
    const { data: drivers } = await sb.rpc("prognos_svc_watch_drivers", {
      p_zone: ev.zone_id,
      p_cat: ev.category,
    });
    const list = (drivers || []) as string[];
    const t = new Date(ev.estimated_at);
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    const body = `${ev.zone_name} · ${CAT_SV[ev.category] || ev.category} · ca ${hh}:${mm}`;
    for (const d of list) {
      await sendTo(d, { title: "Ny förbokning", body, tag: "prognos-" + ev.zone_id + "-" + ev.category });
    }
  }

  await sb.rpc("prognos_svc_prune");
  await sb.rpc("prognos_svc_set_status", { p_status: "ok", p_err: null });

  return new Response(
    JSON.stringify({
      ok: true,
      created,
      canceled,
      updated,
      seed: isSeed,
      zones: Object.keys(payload.zones || {}).length,
    }),
    { status: 200 },
  );
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const h = headers(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method" }), { status: 405, headers: h });

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = body.action || "tick";

  if (action === "tick") {
    const key = req.headers.get("x-tick-key") || "";
    const expect = await secret("PROGNOS_TICK_KEY");
    if (!expect || key !== expect) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: h });
    }
    try {
      const res = await tick();
      const text = await res.text();
      return new Response(text, { status: res.status, headers: h });
    } catch (e) {
      await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: "tick_exception" });
      return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: h });
    }
  }

  return new Response(JSON.stringify({ error: "unknown_action" }), { status: 400, headers: h });
});
