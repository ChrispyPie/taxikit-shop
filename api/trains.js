// Göteborg C tåg (Trafikverket TrainAnnouncement) som Vercel-funktion.
//
// Alla användare läser samma svar från Vercels CDN. Svaret cachas i 60 s
// (s-maxage=60) + 30 s stale-while-revalidate, så Trafikverket får ungefär
// en uppdatering per minut per CDN-region oavsett hur många som använder appen.
//
// Svaret har samma form som skiftlogg/feed/tag.json:
//   { station, updated, error, trains: [...] }
// plus några extra fält (source, windowHours) som frontenden ignorerar.
//
// Nyckeln läses från miljövariabeln TRAFIKVERKET_API_KEY (eller TRAFIKVERKET_KEY).
// Logiken speglar scripts/fetch_got_trains.py.

"use strict";

const TV_URL = "https://api.trafikinfo.trafikverket.se/v2/data.json";
const STATION = "G";
const BACK_HOURS = clampInt(process.env.TRAIN_BACK_HOURS, 24, 1, 36);
const AHEAD_HOURS = clampInt(process.env.TRAIN_AHEAD_HOURS, 16, 1, 24);
const TV_TIMEOUT_MS = 12000;

const CACHE_OK = "public, s-maxage=60, stale-while-revalidate=30";
const CACHE_ERR = "public, s-maxage=15, stale-while-revalidate=15";

const STATIONS = {
  G: "Göteborg C", Cst: "Stockholm C", Arnc: "Arlanda C", Sci: "Stockholm City",
  M: "Malmö C", Mc: "Malmö C", Lu: "Lund C", Kh: "Köpenhamn H",
  Hel: "Helsingborg C", Hb: "Helsingborg C", Hd: "Halmstad C", "Vå": "Varberg",
  Kb: "Kungsbacka", A: "Alingsås", Av: "Alvesta", N: "Nässjö C",
  Lp: "Linköping C", Nr: "Norrköping C", K: "Katrineholm", Fle: "Floda",
  Hr: "Herrljunga", F: "Falköping C", Sk: "Skövde C", Hpbg: "Hallsberg",
  "Ör": "Örebro C", Tnd: "Trollhättan", Thn: "Trollhättan", J: "Jönköping C",
  Blg: "Borlänge", "Gä": "Gävle C", "Söö": "Södertälje Syd", So: "Solna",
  "Öslo": "Oslo S", Xoslo: "Oslo S", "Oslo S": "Oslo S", Yb: "Ytterby",
  Vg: "Vänersborg C", "Vgå": "Vårgårda", Gro: "Gubbero", Gbm: "Göteborg Marieholm",
  Or: "Olskroken", Alh: "Alingsås", "Äh": "Älvängen", Sts: "Stenungsund",
  Kac: "Kalmar C", Bsc: "Borås C", Sfl: "Säffle",
  // samma namn som den gamla flödesappen (skiftlogg/js/app-2.js) använder
  "Än": "Älvängen", Ldo: "Lindome", Uv: "Uddevalla", Snu: "Stenungsund",
  Vbc: "Varberg C", Smd: "Strömstad", Mst: "Mellerud", Ksc: "Karlstad C",
  "Dk.kh": "Köpenhamn H", "No.osl": "Oslo S", Khn: "Kristinehamn", T: "Töreboda",
  Hie: "Helsingör", Arb: "Arboga", Lkp: "Lidköping", Ed: "Ed",
};

// Senaste lyckade svar i den här (varma) instansen. Används om Trafikverket
// svarar fel, så att användarna får lite äldre data i stället för inget.
let lastGood = null;

function clampInt(raw, def, min, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function getKey() {
  return String(process.env.TRAFIKVERKET_API_KEY || process.env.TRAFIKVERKET_KEY || "").trim();
}

function xmlAttr(v) {
  return String(v).replace(/[<>&"]/g, "");
}

function hh(n) {
  // Trafikverket vill ha [d.]hh:mm:ss, timmar max 23.
  const d = Math.floor(n / 24), h = n % 24;
  return (d ? d + "." : "") + String(h).padStart(2, "0") + ":00:00";
}

// Stationsnamn från Trafikverket TrainStation (signatur -> namn). Hämtas högst en gång per dygn
// per varm instans; STATIONS ovan går före. Misslyckas hämtningen används STATIONS/signaturen.
let TS_NAMES = null;
let TS_AT = 0;
async function loadStationNames(key) {
  if (TS_NAMES && Date.now() - TS_AT < 24 * 3600 * 1000) return;
  const q = '<QUERY objecttype="TrainStation" schemaversion="1.4">' +
    "<INCLUDE>LocationSignature</INCLUDE><INCLUDE>AdvertisedLocationName</INCLUDE></QUERY>";
  const json = await tvPost(key, q);
  const map = {};
  for (const block of ((json || {}).RESPONSE || {}).RESULT || []) {
    for (const r of block.TrainStation || []) {
      if (r && r.LocationSignature && r.AdvertisedLocationName) map[r.LocationSignature] = r.AdvertisedLocationName;
    }
  }
  if (Object.keys(map).length > 100) { TS_NAMES = map; TS_AT = Date.now(); }
}

function stationName(sig) {
  return (TS_NAMES && TS_NAMES[sig]) || STATIONS[sig] || sig || "";
}

async function tvPost(key, queryXml) {
  const body = '<REQUEST><LOGIN authenticationkey="' + xmlAttr(key) + '" />' + queryXml + "</REQUEST>";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TV_TIMEOUT_MS);
  try {
    const res = await fetch(TV_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* ignore */ }
    const err = json && json.RESPONSE && json.RESPONSE.RESULT && json.RESPONSE.RESULT[0] && json.RESPONSE.RESULT[0].ERROR;
    if (err) throw new Error("Trafikverket: " + (err.MESSAGE || "fel"));
    if (!res.ok) throw new Error("Trafikverket HTTP " + res.status);
    if (!json) throw new Error("Trafikverket: ogiltigt svar");
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function rowsOf(payload) {
  const out = [];
  const results = ((payload || {}).RESPONSE || {}).RESULT || [];
  for (const block of results) {
    let rows = block.TrainAnnouncement || [];
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    for (const r of rows) if (r && typeof r === "object") out.push(r);
  }
  return out;
}

function locSig(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") return item.LocationName || item.LocationSignature || "";
  return "";
}

function locList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(locSig).filter(Boolean);
  const s = locSig(raw);
  return s ? [s] : [];
}

function productName(f) {
  let info = f.ProductInformation || [];
  if (!Array.isArray(info)) info = [info];
  return info
    .map((p) => (p && typeof p === "object" ? p.Description || p.Code || "" : p ? String(p) : ""))
    .filter(Boolean)
    .join(" ");
}

function slimTrain(f) {
  const act = String(f.ActivityType || "");
  const dir = act.toLowerCase().startsWith("ank") ? "ANK" : "AVG";
  const frm = locList(f.FromLocation);
  const to = locList(f.ToLocation);
  const otherSig = (dir === "ANK" ? frm[0] : to[to.length - 1]) || "";
  const traffic = f.TypeOfTraffic || "";
  const prod = productName(f);
  const hay = (JSON.stringify(traffic) + " " + prod).toLowerCase();
  const snabb = ["snabbtåg", "x 2000", "x2000", "sx2000"].some((w) => hay.includes(w));
  return {
    id: f.AdvertisedTrainIdent || "",
    dir,
    other: stationName(otherSig) || otherSig,
    otherSig,
    from: frm.map((s) => stationName(s) || s),
    to: to.map((s) => stationName(s) || s),
    sched: f.AdvertisedTimeAtLocation || "",
    est: f.EstimatedTimeAtLocation || "",
    act: f.TimeAtLocation || "",
    track: f.TrackAtLocation || "",
    canceled: !!f.Canceled,
    product: prod,
    traffic,
    snabb,
  };
}

function uniqueIdents(trains, limit) {
  const now = Date.now();
  const seen = new Set();
  const ranked = [];
  for (const f of trains) {
    const i = f.id;
    if (!i || seen.has(i)) continue;
    seen.add(i);
    const ts = Date.parse(f.act || f.est || f.sched);
    const dist = Number.isFinite(ts) ? Math.abs(ts - now) : 1e15;
    ranked.push([f.stops ? 1 : 0, dist, i]);
  }
  ranked.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return ranked.slice(0, limit).map((r) => r[2]);
}

function orIdents(idents) {
  return idents.map((i) => '<EQ name="AdvertisedTrainIdent" value="' + xmlAttr(i) + '" />').join("");
}

async function stationQuery(key) {
  const q =
    '<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" orderby="AdvertisedTimeAtLocation" limit="2000">' +
    "<FILTER><AND>" +
    '<EQ name="LocationSignature" value="' + STATION + '" />' +
    '<EQ name="Advertised" value="true" />' +
    '<GT name="AdvertisedTimeAtLocation" value="$dateadd(-' + hh(BACK_HOURS) + ')" />' +
    '<LT name="AdvertisedTimeAtLocation" value="$dateadd(' + hh(AHEAD_HOURS) + ')" />' +
    "</AND></FILTER>" +
    "<INCLUDE>ActivityType</INCLUDE><INCLUDE>AdvertisedTimeAtLocation</INCLUDE>" +
    "<INCLUDE>EstimatedTimeAtLocation</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE>" +
    "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>Canceled</INCLUDE>" +
    "<INCLUDE>TrackAtLocation</INCLUDE><INCLUDE>FromLocation</INCLUDE>" +
    "<INCLUDE>ToLocation</INCLUDE><INCLUDE>ProductInformation</INCLUDE>" +
    "<INCLUDE>TypeOfTraffic</INCLUDE></QUERY>";
  return rowsOf(await tvPost(key, q)).map(slimTrain);
}

// Senast sedd: tågets senaste faktiska händelse (TimeAtLocation) på någon driftplats,
// även tekniska platser som inte annonseras. EN fråga per uppdatering, bara för ankommande tåg
// som inte har ankommit ännu och väntas inom POS_AHEAD_H timmar. Sorterad nyast först, så den
// första raden per tåg är den senaste.
const POS_AHEAD_H = 5;
function positionIdents(trains) {
  const now = Date.now();
  const ids = new Set();
  for (const f of trains) {
    if (f.dir !== "ANK" || f.act || f.canceled || !f.id) continue;
    const t = Date.parse(f.est || f.sched);
    if (!Number.isFinite(t) || t < now - 3 * 3600 * 1000 || t > now + POS_AHEAD_H * 3600 * 1000) continue;
    ids.add(f.id);
  }
  return Array.from(ids).slice(0, 120);
}

async function lastSeenMap(key, trains) {
  const idents = positionIdents(trains);
  if (!idents.length) return { best: {}, idents };
  const q =
    '<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" orderby="TimeAtLocation desc" limit="10000">' +
    '<FILTER><AND><GT name="TimeAtLocation" value="$dateadd(-06:00:00)" />' +
    "<OR>" + orIdents(idents) + "</OR></AND></FILTER>" +
    "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE>" +
    "<INCLUDE>ActivityType</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE></QUERY>";
  const best = {};
  for (const row of rowsOf(await tvPost(key, q))) {
    const tid = row.AdvertisedTrainIdent;
    const ts = row.TimeAtLocation;
    if (!tid || !ts) continue;
    const prev = best[tid];
    if (!prev || Date.parse(ts) > Date.parse(prev.ts)) best[tid] = { ts, sig: row.LocationSignature || "", act: row.ActivityType || "" };
  }
  return { best, idents };
}

async function routesMap(key, trains) {
  const idents = uniqueIdents(trains, 240);
  const batches = [];
  for (let i = 0; i < idents.length; i += 40) batches.push(idents.slice(i, i + 40));
  const results = await Promise.all(
    batches.map((batch) => {
      const q =
        '<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" orderby="AdvertisedTimeAtLocation" limit="1500">' +
        '<FILTER><AND><EQ name="Advertised" value="true" />' +
        '<GT name="AdvertisedTimeAtLocation" value="$dateadd(-12:00:00)" />' +
        '<LT name="AdvertisedTimeAtLocation" value="$dateadd(16:00:00)" />' +
        "<OR>" + orIdents(batch) + "</OR></AND></FILTER>" +
        "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE>" +
        "<INCLUDE>AdvertisedTimeAtLocation</INCLUDE><INCLUDE>EstimatedTimeAtLocation</INCLUDE>" +
        "<INCLUDE>TimeAtLocation</INCLUDE><INCLUDE>TrackAtLocation</INCLUDE>" +
        "<INCLUDE>Canceled</INCLUDE></QUERY>";
      // En misslyckad batch ska inte fälla hela svaret.
      return tvPost(key, q).then(rowsOf, () => []);
    })
  );
  const by = {};
  for (const rows of results) {
    for (const row of rows) {
      const tid = row.AdvertisedTrainIdent;
      const sig = row.LocationSignature || "";
      if (!tid || !sig) continue;
      const t = row.TimeAtLocation || row.EstimatedTimeAtLocation || row.AdvertisedTimeAtLocation || "";
      by[tid] = by[tid] || {};
      const prev = by[tid][sig];
      if (!prev || String(t) < String(prev.t || "9999")) {
        by[tid][sig] = {
          sig, t,
          act: row.TimeAtLocation || "",
          est: row.EstimatedTimeAtLocation || "",
          sched: row.AdvertisedTimeAtLocation || "",
          track: row.TrackAtLocation || "",
        };
      }
    }
  }
  return by;
}

async function buildTrains(key) {
  await loadStationNames(key).catch(() => {});
  const trains = await stationQuery(key);
  const [pos, routes] = await Promise.all([
    lastSeenMap(key, trains).catch(() => ({ best: {}, idents: [] })),
    routesMap(key, trains).catch(() => ({})),
  ]);
  const seen = pos.best;
  const checked = new Set(pos.idents);
  for (const f of trains) {
    const hit = seen[f.id];
    // Bara positioner från den här körningen av tåget (inte gårdagens med samma nummer).
    const tArr = Date.parse(f.est || f.sched);
    const okHit = hit && hit.sig && (!Number.isFinite(tArr) || Date.parse(hit.ts) > tArr - 8 * 3600 * 1000);
    if (f.dir === "ANK" && checked.has(f.id)) f.posChecked = true;
    if (okHit) {
      f.lastSeen = stationName(hit.sig) || hit.sig;
      f.lastSeenSig = hit.sig;
      f.lastSeenTs = hit.ts;
      f.lastSeenAct = hit.act;
    }
    const locs = routes[f.id];
    if (locs) {
      const stops = Object.values(locs).sort((a, b) => String(a.t).localeCompare(String(b.t)));
      if (stops.length) {
        f.stops = stops.map((s) => ({
          sig: s.sig, name: stationName(s.sig) || s.sig, t: s.t || "",
          act: s.act || "", est: s.est || "", sched: s.sched || "", track: s.track || "",
        }));
        const acted = f.stops.filter((s) => s.act);
        if (acted.length) {
          const last = acted.reduce((a, b) => (b.act > a.act ? b : a));
          if (!f.lastSeenTs || String(last.act) >= String(f.lastSeenTs)) {
            f.lastSeen = last.name;
            f.lastSeenSig = last.sig;
            f.lastSeenTs = last.act;
          }
        }
      }
    }
  }
  // Samma nyckel som merge_keep i Python-scriptet: (id, dir, sched).
  const uniq = new Map();
  for (const f of trains) uniq.set(f.id + "|" + f.dir + "|" + f.sched, f);
  return Array.from(uniq.values());
}

// Stationslista för ETT tåg (på begäran när man trycker på raden): ?route=<tågnr>&sched=<ankomst G>.
// En Trafikverket-fråga per tåg, cachad 45 s i CDN och 30 s i instansen.
const ROUTE_CACHE = new Map();
const CACHE_ROUTE = "public, s-maxage=45, stale-while-revalidate=30";
async function routeFor(key, ident, schedIso) {
  const sched = Date.parse(schedIso);
  const ck = ident + "|" + schedIso;
  const hit = ROUTE_CACHE.get(ck);
  if (hit && Date.now() - hit.at < 30000) return hit.body;
  const now = Date.now();
  const back = Math.min(36, Math.max(1, Math.ceil((now - sched) / 3600000 + 12)));
  const ahead = Math.min(24, Math.max(1, Math.ceil((sched - now) / 3600000 + 2)));
  const q =
    '<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" orderby="AdvertisedTimeAtLocation" limit="1500">' +
    '<FILTER><AND><EQ name="AdvertisedTrainIdent" value="' + xmlAttr(ident) + '" />' +
    '<GT name="AdvertisedTimeAtLocation" value="$dateadd(-' + hh(back) + ')" />' +
    '<LT name="AdvertisedTimeAtLocation" value="$dateadd(' + hh(ahead) + ')" />' +
    "</AND></FILTER>" +
    "<INCLUDE>LocationSignature</INCLUDE><INCLUDE>ActivityType</INCLUDE><INCLUDE>Advertised</INCLUDE>" +
    "<INCLUDE>AdvertisedTimeAtLocation</INCLUDE><INCLUDE>EstimatedTimeAtLocation</INCLUDE>" +
    "<INCLUDE>TimeAtLocation</INCLUDE><INCLUDE>TrackAtLocation</INCLUDE><INCLUDE>Canceled</INCLUDE></QUERY>";
  const rows = rowsOf(await tvPost(key, q));
  // Bara den körning som ankommer G vid sched (±3 h) – inte gårdagens/morgondagens med samma nummer.
  const lo = sched - 14 * 3600000, hi = sched + 3 * 3600000;
  const stops = new Map();
  let seen = null;
  for (const r of rows) {
    const t = Date.parse(r.AdvertisedTimeAtLocation);
    if (!Number.isFinite(t) || t < lo || t > hi) continue;
    const sig = r.LocationSignature || "";
    if (!sig) continue;
    if (r.TimeAtLocation && (!seen || Date.parse(r.TimeAtLocation) > Date.parse(seen.ts))) {
      seen = { sig, name: stationName(sig), ts: r.TimeAtLocation, type: r.ActivityType || "" };
    }
    if (!r.Advertised) continue;
    const s = stops.get(sig) || { sig, name: stationName(sig), t, track: "", canceled: false };
    const arr = String(r.ActivityType || "").toLowerCase().startsWith("ank");
    const pre = arr ? "arr" : "dep";
    if (!s[pre + "Sched"] || t < Date.parse(s[pre + "Sched"])) {
      s[pre + "Sched"] = r.AdvertisedTimeAtLocation || "";
      s[pre + "Est"] = r.EstimatedTimeAtLocation || "";
      s[pre + "Act"] = r.TimeAtLocation || "";
    }
    if (r.TrackAtLocation) s.track = r.TrackAtLocation;
    if (r.Canceled) s.canceled = true;
    s.t = Math.min(s.t, t);
    stops.set(sig, s);
  }
  let list = Array.from(stops.values()).sort((a, b) => a.t - b.t);
  const gi = list.findIndex((s) => s.sig === STATION && s.arrSched);
  if (gi >= 0) list = list.slice(0, gi + 1);
  list = list.map((s) => { const o = Object.assign({}, s); delete o.t; return o; });
  const body = { id: ident, sched: schedIso, updated: new Date().toISOString(), error: null, stops: list, lastSeen: seen };
  ROUTE_CACHE.set(ck, { at: Date.now(), body });
  if (ROUTE_CACHE.size > 300) ROUTE_CACHE.delete(ROUTE_CACHE.keys().next().value);
  return body;
}

function send(res, status, cacheControl, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "no-store", { error: "method not allowed", trains: [] });
  }
  const key = getKey();
  if (!key) {
    return send(res, 503, CACHE_ERR, { station: "Göteborg C", updated: null, error: "TRAFIKVERKET_API_KEY saknas", trains: [] });
  }
  const url = new URL(req.url || "/", "http://x");
  const routeId = url.searchParams.get("route");
  if (routeId !== null) {
    const sched = url.searchParams.get("sched") || "";
    if (!/^\d{1,6}$/.test(routeId) || !Number.isFinite(Date.parse(sched))) {
      return send(res, 400, "no-store", { error: "route/sched saknas eller fel", stops: [] });
    }
    try {
      await loadStationNames(key).catch(() => {});
      return send(res, 200, CACHE_ROUTE, await routeFor(key, routeId, sched));
    } catch (e) {
      const msg = (e && e.name === "AbortError") ? "Trafikverket timeout" : String((e && e.message) || e);
      return send(res, 502, CACHE_ERR, { error: msg, stops: [] });
    }
  }
  try {
    const trains = await buildTrains(key);
    const body = {
      station: "Göteborg C",
      updated: new Date().toISOString(),
      error: null,
      source: "live",
      windowHours: { back: BACK_HOURS, ahead: AHEAD_HOURS },
      trains,
    };
    lastGood = body;
    return send(res, 200, CACHE_OK, body);
  } catch (e) {
    const msg = (e && e.name === "AbortError") ? "Trafikverket timeout" : String((e && e.message) || e);
    if (lastGood) {
      return send(res, 200, CACHE_ERR, Object.assign({}, lastGood, { error: msg, source: "stale" }));
    }
    return send(res, 502, CACHE_ERR, { station: "Göteborg C", updated: null, error: msg, trains: [] });
  }
}

module.exports = handler;
module.exports._internal = { slimTrain, buildTrains, uniqueIdents, rowsOf };
