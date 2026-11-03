// prognos-sync: hämtar prognos-public-data.json varje minut, sparar snapshot,
// spårar bokningar per zon/kategori/block med tidsuppskattning + konfidens.
// v2 (t833u): själva logiken ligger i plan.ts (glappskydd, tider per kategori, tillval, städning).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type NotisTarget, notisKey, notisUrl, saveNotice } from "./notis.ts";
import { type Conf, type Feed, feedFromPayload, noticeText, type OpenB, type Op, plan, type SyncState } from "./plan.ts";

const ORIGINS = ["https://taxikit.shop", "https://www.taxikit.shop", "https://chrispypie.github.io", "http://localhost:8765"];
const LOGIN_URL = "https://prognos.taxigoteborg.nu/api/prognos-login";
const DATA_URL = "https://prognos.taxigoteborg.nu/prognos-public-data.json";
const APP_URL = "/TaxiData/?sida=prognos";
const CAT_SV: Record<string, string> = {
  app: "Kombi",
  barnstol: "Barnstol",
  ovrigt: "Övriga",
  storbil: "Storbil",
  elbil: "Miljöbil",
  babyskydd: "Babyskydd",
};


// Tidsgräns mot prognos.taxigoteborg.nu: om deras server hänger avbryts anropet,
// körningen hoppas över och senaste bra data ligger kvar.
const FETCH_TIMEOUT_MS = 10_000;

// Hämtar och läser hela svaret inom tidsgränsen. Kastar vid timeout eller nätverksfel.
async function fetchTimed(url: string, init: RequestInit): Promise<{ res: Response; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(timer);
  }
}

function isAbort(e: unknown): boolean {
  return (e as { name?: string })?.name === "AbortError";
}

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

async function sendTo(driver: string, msg: { title: string; body: string; tag: string }, dayMs?: number, target?: NotisTarget) {
  const ts = Date.now();
  const nkey = notisKey(msg, ts, dayMs);
  // Spara i notisflödet först – samma nyckel som appen, så den syns bara en gång (t547u).
  // target = zon/kategori/tid/id så att notisen öppnar rätt zon i Prognos (t551u).
  await saveNotice(sb, driver, msg, nkey, target);
  await ensureVapid();
  if (!vapidReady) return;
  const { data } = await sb.rpc("bev_svc_targets", { p_driver: driver });
  const subs = (data || []) as { id: number; endpoint: string; p256dh: string; auth: string }[];
  const payload = JSON.stringify({ ...msg, url: target ? notisUrl(msg, target) : APP_URL, ts, nkey, target });
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

type Payload = { zones?: Record<string, unknown>; morgonprognos?: unknown; generated_at?: string };

const STATE_KEY = "sync_state_v2";
const OPEN_COLS = "id, zone_id, zone_name, category, estimated_at, observed_at, block_index, current_block, confidence";

// Alla öppna bokningar i ett anrop. Faller tillbaka utan addons om kolumnen inte finns (SQL ej körd).
async function loadOpen(): Promise<{ open: OpenB[]; hasAddons: boolean }> {
  let hasAddons = true;
  // deno-lint-ignore no-explicit-any
  let res: { data: any[] | null; error: unknown } = await sb.from("prognos_bookings").select(OPEN_COLS + ", addons").eq("status", "open");
  if (res.error) {
    hasAddons = false;
    res = await sb.from("prognos_bookings").select(OPEN_COLS).eq("status", "open");
  }
  // deno-lint-ignore no-explicit-any
  const rows = (res.data || []) as any[];
  return {
    hasAddons,
    open: rows.map((r) => ({
      id: Number(r.id),
      zone_id: String(r.zone_id),
      zone_name: r.zone_name || String(r.zone_id),
      category: String(r.category),
      block: Number(r.current_block ?? r.block_index ?? 0),
      est: Date.parse(r.estimated_at),
      obs: Date.parse(r.observed_at),
      confidence: (r.confidence as Conf) || "trolig",
      addons: Array.isArray(r.addons) ? r.addons : [],
    })),
  };
}

async function loadState(): Promise<SyncState | null> {
  const { data } = await sb.from("prognos_meta").select("value").eq("key", STATE_KEY).maybeSingle();
  const v = (data as { value?: SyncState } | null)?.value;
  return v && v.v === 2 && v.conf ? v : null;
}

async function saveState(st: SyncState) {
  await sb.from("prognos_meta").upsert({ key: STATE_KEY, value: st, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Utför planens ops i ordning. Returnerar tmp-id -> riktigt id. */
async function applyOps(ops: Op[], snapId: number | null, hasAddons: boolean): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const real = (id: number | string) => (typeof id === "number" ? id : ids.get(id));
  for (const o of ops) {
    if (o.op === "insert") {
      const { data: bid } = await sb.rpc("prognos_svc_insert_booking", {
        p_zone: o.zone,
        p_zone_name: o.zname,
        p_cat: o.cat,
        p_est: new Date(o.est).toISOString(),
        p_obs: new Date(o.obs).toISOString(),
        p_block: o.block,
        p_snap: snapId,
        p_confidence: o.confidence,
      });
      if (bid != null) {
        ids.set(o.tmp, Number(bid));
        if (hasAddons && o.addons.length) {
          await sb.from("prognos_bookings").update({ addons: o.addons }).eq("id", Number(bid));
        }
      }
    } else if (o.op === "move") {
      const id = real(o.id);
      if (id == null) continue;
      await sb.rpc("prognos_svc_update_booking", {
        p_id: id,
        p_est: new Date(o.est).toISOString(),
        p_block: o.block,
        p_confidence: o.confidence,
      });
    } else if (o.op === "close") {
      const id = real(o.id);
      if (id == null) continue;
      await sb.from("prognos_bookings").update({ status: o.status }).eq("id", id).eq("status", "open");
    } else if (o.op === "addons") {
      const id = real(o.id);
      if (id == null || !hasAddons) continue;
      await sb.from("prognos_bookings").update({ addons: o.addons }).eq("id", id);
    }
  }
  return ids;
}

async function tick(): Promise<Response> {
  const pin = await secret("PROGNOS_PIN");
  if (!pin) {
    await sb.rpc("prognos_svc_set_status", { p_status: "code_needed", p_err: "saknar_kod" });
    return new Response(JSON.stringify({ ok: false, reason: "code_needed" }), { status: 200 });
  }

  let loginRes: Response;
  let loginText = "";
  try {
    ({ res: loginRes, text: loginText } = await fetchTimed(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }));
  } catch (e) {
    const reason = isAbort(e) ? "login_timeout" : "login_network";
    console.warn("prognos-sync: hoppar över körningen,", reason);
    await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: reason });
    return new Response(JSON.stringify({ ok: false, reason }), { status: 200 });
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
  let loginJson: { ok?: boolean; token?: string } = {};
  try { loginJson = JSON.parse(loginText); } catch { loginJson = {}; }
  const token = loginJson.token;
  if (!loginJson.ok || !token) {
    await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: "no_token" });
    return new Response(JSON.stringify({ ok: false, reason: "no_token" }), { status: 200 });
  }

  let dataRes: Response;
  let dataText = "";
  try {
    ({ res: dataRes, text: dataText } = await fetchTimed(
      DATA_URL + "?token=" + encodeURIComponent(token) + "&t=" + Date.now(),
      { headers: { Accept: "application/json" }, cache: "no-store" as RequestCache },
    ));
  } catch (e) {
    const reason = isAbort(e) ? "data_timeout" : "data_network";
    console.warn("prognos-sync: hoppar över körningen,", reason);
    await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: reason });
    return new Response(JSON.stringify({ ok: false, reason }), { status: 200 });
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
  let payload: Payload;
  try {
    payload = JSON.parse(dataText) as Payload;
  } catch {
    console.warn("prognos-sync: hoppar över körningen, data_bad_json");
    await sb.rpc("prognos_svc_set_status", { p_status: "error", p_err: "data_bad_json" });
    return new Response(JSON.stringify({ ok: false, reason: "data_bad_json" }), { status: 200 });
  }
  const now = Date.now();
  const feed = feedFromPayload(payload);

  // Läge från förra körningen. Saknas det (första v2-körningen) byggs det från senaste sparade prognos.
  const state = await loadState();
  let prevFeed: Feed | null = null;
  if (!state) {
    const { data: prevRaw } = await sb.rpc("prognos_svc_latest_payload");
    const prev = (prevRaw || null) as Payload | null;
    prevFeed = prev && prev.zones ? feedFromPayload(prev) : null;
  }

  const { open, hasAddons } = await loadOpen();
  const res = plan({ feed, state, prevFeed, open, now });

  // Helt tomt svar fast förra minuten hade bokningar = glapp hos källan (första tomma i rad).
  // Sparas som ej ok (syns inte i Original-fliken och används inte som "förra"), inga bokningar ändras.
  if (res.stats.glitch) {
    await sb.rpc("prognos_svc_insert_snapshot", { p_payload: payload, p_ok: false, p_http: 200, p_err: "tomt_svar_ignorerat" });
    await saveState(res.state);
    await sb.rpc("prognos_svc_set_status", { p_status: "ok", p_err: null });
    return new Response(JSON.stringify({ ok: true, glitch: true }), { status: 200 });
  }

  const { data: snapId } = await sb.rpc("prognos_svc_insert_snapshot", {
    p_payload: payload,
    p_ok: true,
    p_http: 200,
    p_err: null,
  });

  const ids = await applyOps(res.ops, (snapId as number) || null, hasAddons);
  await saveState(res.state);
  const stats = res.stats;

  // Utan addons-kolumnen (SQL inte körd) kan flaggorna inte sparas – då bara vanliga bilpushar.
  const notices = hasAddons ? res.notices : res.notices.filter((n) => n.watchCat === n.carCat).map((n) => ({ ...n, addons: [] }));
  for (const n of notices) {
    // Bara förare som är inloggade (giltig session) – ingen push till utloggade (t335u)
    const { data: drivers } = await sb.rpc("prognos_svc_watch_drivers_active", {
      p_zone: n.zone,
      p_cat: n.watchCat,
    });
    const list = (drivers || []) as string[];
    if (!list.length) continue;
    // Edge-runtime går i UTC → formatera i svensk tid
    const hm = new Date(n.est).toLocaleTimeString("sv-SE", {
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm",
    });
    const msg = noticeText(n, hm, CAT_SV);
    const id = typeof n.ref === "number" ? n.ref : ids.get(n.ref);
    const estIso = new Date(n.est).toISOString();
    for (const d of list) {
      await sendTo(d, msg, n.est, { zone: String(n.zone), cat: n.carCat, at: estIso, id: id != null ? String(id) : undefined });
    }
  }

  await sb.rpc("prognos_svc_prune");
  await sb.rpc("prognos_svc_set_status", { p_status: "ok", p_err: null });

  return new Response(
    JSON.stringify({
      ok: true,
      created: stats.created,
      canceled: stats.canceled,
      updated: stats.moved,
      expired: stats.expired,
      pending: stats.pendingFalls,
      suppressed: stats.suppressedPush,
      flags: stats.flagsAdded,
      seed: stats.seed,
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
