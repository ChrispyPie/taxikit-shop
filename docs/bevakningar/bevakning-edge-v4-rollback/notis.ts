// Notisflödet i appen (t547u): spara pushen på servern samtidigt som den skickas,
// så att den finns under Notiser även om telefonen aldrig visade den.
// Nyckeln (nkey) måste vara exakt samma som appen räknar fram (TaxiData/sw.js notisKey
// och notis.js NOTIS.keyOf) – då blir det bara EN rad även när telefonen också sparar den.
// OBS: samma fil finns i bevakning/ och prognos-sync/ – ändra båda.

export type NotisMsg = { title: string; body: string; tag: string };
// Vart notisen leder (t551u). Prognos: zon, kategori, förbokningens tid (ISO) och id.
export type NotisTarget = { zone?: string; cat?: string; at?: string; id?: string };

// Länken som pushen öppnar (sw.js notificationclick). Samma sidor som i notisflödet.
//  flyg/tåg -> Ankomster på rätt flik, prognos -> Prognos på rätt zon (och förbokningen markerad)
export function notisUrl(msg: NotisMsg, target?: NotisTarget | null): string {
  const kind = notisKind(msg.tag);
  if (kind === "flyg" || kind === "tag") return "/TaxiData/?sida=ankomster&flik=" + kind;
  if (kind === "prognos") {
    const q = new URLSearchParams({ sida: "prognos" });
    if (target?.zone) q.set("zon", target.zone);
    if (target?.cat) q.set("kat", target.cat);
    if (target?.at) q.set("tid", target.at);
    if (target?.id) q.set("bok", target.id);
    return "/TaxiData/?" + q.toString();
  }
  return "/TaxiData/";
}

function sthlmYmd(ms: number): string {
  // sv-SE ger "2026-10-28"
  return new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }).replace(/-/g, "");
}

export function notisKind(tag: string): string {
  tag = String(tag || "");
  if (tag.indexOf("flyg") === 0) return "flyg";
  if (tag.indexOf("tag") === 0) return "tag";
  if (tag.indexOf("prognos") === 0) return "prognos";
  if (tag === "test") return "test";
  return "push";
}

// ts = samma ts som skickas i pushen. dayMs = vilken dag förbokningen gäller (prognos),
// annars används ts.
export function notisKey(msg: NotisMsg, ts: number, dayMs?: number): string {
  const tag = String(msg.tag || "push");
  if (tag.indexOf("prognos") === 0) {
    const m = /ca (\d\d):(\d\d)/.exec(msg.body || "");
    if (m) return "prognos|" + tag + "@" + m[1] + m[2] + "|" + sthlmYmd(dayMs ?? ts);
  }
  return tag + "|" + ts;
}

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

// Sparar notisen (en gång per förare och nyckel). Testnotiser sparas inte.
// Fel här får aldrig stoppa själva pushen.
// target (valfri) sparas med notisen så att appen öppnar rätt ställe (notis_svc_add med p_target, 20261028v).
export async function saveNotice(sb: Rpc, driver: string, msg: NotisMsg, key: string, target?: NotisTarget | null): Promise<boolean> {
  const kind = notisKind(msg.tag);
  if (kind === "test") return false;
  try {
    const args: Record<string, unknown> = {
      p_driver: driver, p_key: key, p_kind: kind, p_tag: msg.tag,
      p_title: msg.title, p_body: msg.body,
    };
    if (target) args.p_target = target;
    const { data, error } = await sb.rpc("notis_svc_add", args);
    if (error) { console.error("notis_svc_add", error); return false; }
    return data === true;
  } catch (e) {
    console.error("notis_svc_add", e);
    return false;
  }
}
