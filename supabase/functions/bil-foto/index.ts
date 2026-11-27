// bil-foto: tar emot/visar/raderar foton för felanmälningar och underhållsförslag i den privata bucketen "bil-foton".
// Varje anrop kontrolleras i databasen med förarens inloggning (p_token) – samma regler som appen.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "bil-foton";
const MAX_B64 = 1_400_000; // ~1 MB jpeg
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
    if (b.action === "upload") {
      const img = b.image;
      if (typeof img !== "string" || !img.length) return out({ error: "bad_image" }, 400);
      if (img.length > MAX_B64) return out({ error: "too_big" }, 413);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(img), (c) => c.charCodeAt(0)); } catch { return out({ error: "bad_image" }, 400); }
      if (bytes.length < 200 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return out({ error: "bad_image" }, 400);
      const { data, error } = await sb.rpc("bil_photo_begin", { p_token: token, p_issue_id: b.issue_id ?? null, p_maint_id: b.maint_id ?? null });
      if (error) return fail(error);
      const up = await sb.storage.from(BUCKET).upload(data.path, bytes, { contentType: "image/jpeg", upsert: false });
      await sb.rpc("bil_photo_finish", { p_photo_id: data.id, p_ok: !up.error });
      if (up.error) return out({ error: "upload_failed" }, 500);
      return out({ id: data.id });
    }
    if (b.action === "list") {
      const { data, error } = await sb.rpc("bil_photo_list", { p_token: token, p_issue_id: b.issue_id ?? null, p_maint_id: b.maint_id ?? null });
      if (error) return fail(error);
      type Ph = { id: number; path: string | null; created_at?: string; can_delete?: boolean; deleted?: boolean; deleted_by?: string | null; deleted_at?: string | null };
      const list = (data || []) as Ph[];
      if (!list.length) return out({ photos: [] });
      const live = list.filter((p) => !p.deleted && p.path);
      const s = live.length ? await sb.storage.from(BUCKET).createSignedUrls(live.map((p) => p.path as string), 900) : { data: [], error: null };
      if (s.error) return out({ error: "sign_failed" }, 500);
      const url = new Map(live.map((p, i) => [p.id, s.data?.[i]?.signedUrl || null]));
      return out({ photos: list.map((p) => p.deleted
        ? { id: p.id, deleted: true, deleted_by: p.deleted_by || null, deleted_at: p.deleted_at || null, url: null }
        : { id: p.id, url: url.get(p.id) || null, can_delete: !!p.can_delete }) });
    }
    if (b.action === "delete_photo") {
      // Riktig radering (2026-11-27bilaga1): markering i databasen + filen raderas ur lagringen; backas om raderingen misslyckas.
      const { data, error } = await sb.rpc("bil_photo_delete_svc", { p_token: token, p_photo_id: b.photo_id });
      if (error) return fail(error);
      let rm = await sb.storage.from(BUCKET).remove([data.path]);
      if (rm.error) rm = await sb.storage.from(BUCKET).remove([data.path]);
      if (rm.error) {
        await sb.rpc("bil_photo_unmark", { p_photo_id: b.photo_id });
        return out({ error: "delete_failed" }, 500);
      }
      return out({ ok: true });
    }
    if (b.action === "delete_issue") {
      const { data, error } = await sb.rpc("delete_car_issue_svc", { p_token: token, p_id: b.issue_id });
      if (error) return fail(error);
      const paths = (data && data.paths) || [];
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      return out({ ok: true });
    }
    if (b.action === "delete_maint") {
      const { data, error } = await sb.rpc("delete_car_maintenance", { p_token: token, p_id: b.maint_id });
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
