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
  Kb: "Kungsbacka", A: "Alvesta", Av: "Alvesta", N: "Nässjö C",
  Lp: "Linköping C", Nr: "Norrköping C", K: "Katrineholm", Fle: "Floda",
  Hr: "Herrljunga", F: "Falköping C", Sk: "Skövde C", Hpbg: "Hallsberg",
  "Ör": "Örebro C", Tnd: "Trollhättan", Thn: "Trollhättan", J: "Jönköping C",
  Blg: "Borlänge", "Gä": "Gävle C", "Söö": "Södertälje Syd", So: "Solna",
  "Öslo": "Oslo S", Xoslo: "Oslo S", "Oslo S": "Oslo S", Yb: "Ytterby",
  Vg: "Vänersborg C", "Vgå": "Vårgårda", Gro: "Gubbero", Gbm: "Göteborg Marieholm",
  Or: "Olskroken", Alh: "Alingsås", "Äh": "Älvängen", Sts: "Stenungsund",
  Kac: "Kalmar C", Bsc: "Borås C", Sfl: "Säffle",
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
  return String(n).padStart(2, "0") + ":00:00";
}

function stationName(sig) {
  return STATIONS[sig] || sig || "";
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

async function lastSeenMap(key, trains) {
  const idents = uniqueIdents(trains, 160);
  if (!idents.length) return {};
  const q =
    '<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="800">' +
    '<FILTER><AND><GT name="TimeAtLocation" value="$dateadd(-03:00:00)" />' +
    "<OR>" + orIdents(idents) + "</OR></AND></FILTER>" +
    "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE>" +
    "<INCLUDE>TimeAtLocation</INCLUDE></QUERY>";
  const best = {};
  for (const row of rowsOf(await tvPost(key, q))) {
    const tid = row.AdvertisedTrainIdent;
    const ts = row.TimeAtLocation;
    if (!tid || !ts) continue;
    const prev = best[tid];
    if (!prev || String(ts) > String(prev.ts)) best[tid] = { ts, sig: row.LocationSignature || "" };
  }
  return best;
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
  const trains = await stationQuery(key);
  const [seen, routes] = await Promise.all([
    lastSeenMap(key, trains).catch(() => ({})),
    routesMap(key, trains).catch(() => ({})),
  ]);
  for (const f of trains) {
    const hit = seen[f.id];
    if (hit && hit.sig) {
      f.lastSeen = stationName(hit.sig) || hit.sig;
      f.lastSeenSig = hit.sig;
      f.lastSeenTs = hit.ts;
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
