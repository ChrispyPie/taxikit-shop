// sjuk: läkarintyg (privat bucket "sjuk-intyg") och pushnotiser för Sjukanmälan.
// Varje anrop kontrolleras i databasen med förarens inloggning (token) – samma regler som appen:
// bara flaggade (funktionsflagga 'sjuk'), bara föraren själv, ägaren och S admin. Demo nekas.
//  - action "flush":       skickar köade pushnotiser (sjukanmälan, beslut, friskanmälan, intyg). Kräver giltig token.
//  - action "upload":      laddar upp ett intyg (JPEG eller PDF, base64) till en sjukperiod
//  - action "list":        intygen för en sjukperiod som signerade länkar (15 min)
//  - action "delete_cert": raderar ett intyg
//  - action "delete":      raderar en sjukperiod (och dess intyg)
// Inga hälsouppgifter skrivs till loggarna här.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "sjuk-intyg";
const MAX_B64 = 4_200_000; // 3 MB fil = 4 194 304 tecken base64
const APP_URL = "/TaxiData/?sida=sjuk";
const ORIGINS = ["https://taxikit.shop", "https://www.taxikit.shop", "https://chrispypie.github.io", "http://localhost:8765"];
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

let vapidReady = false;
async function vapid(): Promise<boolean> {
  if (vapidReady) return true;
  const pub = (await sb.rpc("bev_svc_secret", { p_name: "VAPID_PUBLIC_KEY" })).data as string | null;
  const priv = (await sb.rpc("bev_svc_secret", { p_name: "VAPID_PRIVATE_KEY" })).data as string | null;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("https://taxikit.shop", pub, priv);
  vapidReady = true;
  return true;
}

type Push = { id: number; recipient: string; title: string; body: string | null; tag: string };
async function flush() {
  const { data, error } = await sb.rpc("sjuk_svc_take_pushes", {});
  if (error) throw new Error("take");
  const list = (data || []) as Push[];
  if (!list.length) return { sent: 0, queued: 0 };
  const canPush = await vapid();
  let sent = 0;
  for (const p of list) {
    const ts = Date.now();
    const nkey = p.tag + "|" + ts;
    const msg = { title: p.title, body: p.body || "", tag: p.tag };
    // Notisflödet (klockan i appen) – även om föraren inte har push påslagen
    try {
      await sb.rpc("notis_svc_add", { p_driver: p.recipient, p_key: nkey, p_kind: "sjuk", p_tag: p.tag, p_title: p.title, p_body: p.body || "" });
    } catch (_e) { /* får aldrig stoppa pushen */ }
    if (!canPush) continue;
    const { data: t } = await sb.rpc("bev_svc_targets", { p_driver: p.recipient });
    const subs = (t || []) as { id: number; endpoint: string; p256dh: string; auth: string }[];
    const payload = JSON.stringify({ ...msg, url: APP_URL, ts, nkey });
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
          { TTL: 86400, urgency: "high" });
        sent++;
        await sb.rpc("bev_svc_result", { p_id: s.id, p_ok: true, p_gone: false });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode || 0;
        await sb.rpc("bev_svc_result", { p_id: s.id, p_ok: false, p_gone: code === 404 || code === 410 });
      }
    }
  }
  return { sent, queued: list.length };
}

function decode(b64: string): Uint8Array | null {
  try { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { return null; }
}

Deno.serve(async (req) => {
  const h = headers(req.headers.get("origin") || "");
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  const fail = (e: { message?: string; code?: string } | null, status = 400) =>
    out({ error: (e && e.message) || "error", code: (e && e.code) || "" },
      e && e.code === "28000" ? 401 : e && e.code === "42501" ? 403 : status);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return out({ error: "method" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return out({ error: "bad_json" }, 400); }
  const token = b.token;
  if (typeof token !== "string" || token.length < 8 || token.length > 300) return out({ error: "invalid_session", code: "28000" }, 401);
  try {
    if (b.action === "flush") {
      // Bara flaggade inloggade får trigga utskicket (sjuk_get kontrollerar inloggning + flagga + inte demo).
      const { error } = await sb.rpc("sjuk_get", { p_token: token });
      if (error) return fail(error);
      return out(await flush());
    }
    if (b.action === "upload") {
      const file = b.file;
      const mime = b.mime === "application/pdf" ? "application/pdf" : "image/jpeg";
      if (typeof file !== "string" || !file.length) return out({ error: "bad_file" }, 400);
      if (file.length > MAX_B64) return out({ error: "too_big" }, 413);
      const bytes = decode(file);
      if (!bytes || bytes.length < 200) return out({ error: "bad_file" }, 400);
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
      if ((mime === "image/jpeg" && !isJpeg) || (mime === "application/pdf" && !isPdf)) return out({ error: "bad_file" }, 400);
      const { data, error } = await sb.rpc("sjuk_svc_cert_begin", { p_token: token, p_report: b.report_id ?? null, p_mime: mime });
      if (error) return fail(error);
      const up = await sb.storage.from(BUCKET).upload(data.path, bytes, { contentType: mime, upsert: false });
      await sb.rpc("sjuk_svc_cert_finish", { p_token: token, p_cert: data.id, p_ok: !up.error });
      if (up.error) return out({ error: "upload_failed" }, 500);
      try { await flush(); } catch (_e) { /* pushen är inte kritisk */ }
      return out({ id: data.id });
    }
    if (b.action === "list") {
      const { data, error } = await sb.rpc("sjuk_svc_cert_list", { p_token: token, p_report: b.report_id ?? null });
      if (error) return fail(error);
      const list = (data || []) as { id: number; path: string; mime: string; created_at: string; mine: boolean }[];
      if (!list.length) return out({ certs: [] });
      const s = await sb.storage.from(BUCKET).createSignedUrls(list.map((p) => p.path), 900);
      if (s.error) return out({ error: "sign_failed" }, 500);
      return out({ certs: list.map((p, i) => ({ id: p.id, mime: p.mime, created_at: p.created_at, mine: p.mine, url: s.data?.[i]?.signedUrl || null })) });
    }
    if (b.action === "delete_cert") {
      const { data, error } = await sb.rpc("sjuk_svc_cert_delete", { p_token: token, p_cert: b.cert_id ?? null });
      if (error) return fail(error);
      await sb.storage.from(BUCKET).remove([data.path]);
      return out({ ok: true });
    }
    if (b.action === "delete") {
      const { data, error } = await sb.rpc("sjuk_svc_delete", { p_token: token, p_id: b.report_id ?? null });
      if (error) return fail(error);
      const paths = (data && data.paths) || [];
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      return out({ ok: true });
    }
    return out({ error: "bad_action" }, 400);
  } catch (_e) {
    return out({ error: "server_error" }, 500);
  }
});
