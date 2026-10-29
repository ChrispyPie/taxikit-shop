// onskemal-foto: bilder till Admin › Önskemål och idéer, i den privata bucketen "onskemal-foton".
// Samma mönster som bil-foto: varje anrop kontrolleras i databasen med inloggningen (token),
// bara den som skrev önskemålet och S admin ser bilderna. Deploy med verify_jwt = false.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "onskemal-foton";
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

const isId = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

Deno.serve(async (req) => {
  const h = headers(req.headers.get("origin") || "");
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  const fail = (e: { message?: string; code?: string } | null, status = 400) =>
    out({ error: (e && e.message) || "error", code: (e && e.code) || "" },
      e && e.code === "28000" ? 401 : e && e.code === "42501" ? 403 : e && e.code === "P0002" ? 404 : status);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return out({ error: "method" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return out({ error: "bad_json" }, 400); }
  const token = b.token;
  if (typeof token !== "string" || token.length < 8 || token.length > 300) return out({ error: "invalid_session", code: "28000" }, 401);
  try {
    if (b.action === "upload") {
      if (!isId(b.wish_id)) return out({ error: "not_found" }, 404);
      const img = b.image;
      if (typeof img !== "string" || !img.length) return out({ error: "bad_image" }, 400);
      if (img.length > MAX_B64) return out({ error: "too_big" }, 413);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(img), (c) => c.charCodeAt(0)); } catch { return out({ error: "bad_image" }, 400); }
      if (bytes.length < 200 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return out({ error: "bad_image" }, 400);
      const { data, error } = await sb.rpc("dev_wish_photo_begin", { p_token: token, p_wish_id: b.wish_id });
      if (error) return fail(error);
      const up = await sb.storage.from(BUCKET).upload(data.path, bytes, { contentType: "image/jpeg", upsert: false });
      await sb.rpc("dev_wish_photo_finish", { p_photo_id: data.id, p_ok: !up.error });
      if (up.error) return out({ error: "upload_failed" }, 500);
      return out({ id: data.id });
    }
    if (b.action === "list") {
      if (!isId(b.wish_id)) return out({ error: "not_found" }, 404);
      const { data, error } = await sb.rpc("dev_wish_photo_list", { p_token: token, p_wish_id: b.wish_id });
      if (error) return fail(error);
      const list = (data || []) as { id: number; path: string }[];
      if (!list.length) return out({ photos: [] });
      const s = await sb.storage.from(BUCKET).createSignedUrls(list.map((p) => p.path), 900);
      if (s.error) return out({ error: "sign_failed" }, 500);
      return out({ photos: list.map((p, i) => ({ id: p.id, url: s.data?.[i]?.signedUrl || null })) });
    }
    if (b.action === "delete_photo") {
      if (!isId(b.photo_id)) return out({ error: "not_found" }, 404);
      const { data, error } = await sb.rpc("dev_wish_photo_delete_svc", { p_token: token, p_photo_id: b.photo_id });
      if (error) return fail(error);
      await sb.storage.from(BUCKET).remove([data.path]);
      return out({ ok: true });
    }
    if (b.action === "delete_wish") {
      if (!isId(b.wish_id)) return out({ error: "not_found" }, 404);
      const { data, error } = await sb.rpc("dev_wish_delete_svc", { p_token: token, p_id: b.wish_id });
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
