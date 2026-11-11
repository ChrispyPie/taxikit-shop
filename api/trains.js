// Valbar stations tåg (Trafikverket TrainAnnouncement) som Vercel-funktion.
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
const QUICK_STATIONS = new Map(require("../TaxiData/train-stations.js").map(s => [s.id, s.label]));
const STATION_CACHE = new Map(), STATION_PENDING = new Map(), ROUTE_PENDING = new Map();
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
  "Än": "Älvängen", Ndv: "Norsesund västra", Ldo: "Lindome", Uv: "Uddevalla", Snu: "Stenungsund",
  Vbc: "Varberg C", Smd: "Strömstad", Mst: "Mellerud", Ksc: "Karlstad C",
  "Dk.kh": "Köpenhamn H", "No.osl": "Oslo S", Khn: "Kristinehamn", T: "Töreboda",
  Hie: "Helsingör", Arb: "Arboga", Lkp: "Lidköping", Ed: "Ed",
};

// Senaste lyckade svar i den här (varma) instansen. Används om Trafikverket
// svarar fel, så att användarna får lite äldre data i stället för inget.
// Warm-instance caches are station-scoped; no station can inherit another station's stale board.

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
// per varm instans; officiella namn går före reservnamnen. Vid fel används reservnamn/signaturen.
let TS_NAMES = null;
let CATALOG=null,CATALOG_AT=0,CATALOG_PENDING=null,CATALOG_FAIL_AT=0;
const CATALOG_TTL=24*3600*1000, CATALOG_STALE_MAX=7*24*3600*1000;
function regionalStation(row){
  if(row.Advertised!==true||row.Deleted===true||row.CountryCode!=="SE")return false;
  const counties=(Array.isArray(row.CountyNo)?row.CountyNo:[row.CountyNo]).map(Number);
  if(counties.includes(14))return true;
  const point=String((row.Geometry||{}).WGS84||"").match(/^POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/i);
  // North Halland = Kungsbacka/Varberg area (north of latitude 57.0). No guess when coordinates are missing.
  return counties.includes(13)&&!!point&&Number(point[2])>=57.0;
}
async function loadCatalog(key){
  if(CATALOG&&Date.now()-CATALOG_AT<CATALOG_TTL)return CATALOG;
  if(Date.now()-CATALOG_FAIL_AT<60000){if(CATALOG&&Date.now()-CATALOG_AT<CATALOG_STALE_MAX)return CATALOG;throw new Error("station_catalog_unavailable");}
  if(CATALOG_PENDING)return CATALOG_PENDING;
  CATALOG_PENDING=(async()=>{try{
    const q='<QUERY objecttype="TrainStation" namespace="rail.infrastructure" schemaversion="1.5"><FILTER><AND><EQ name="Deleted" value="false"/><EQ name="CountryCode" value="SE"/></AND></FILTER><INCLUDE>LocationSignature</INCLUDE><INCLUDE>AdvertisedLocationName</INCLUDE><INCLUDE>OfficialLocationName</INCLUDE><INCLUDE>Advertised</INCLUDE><INCLUDE>Deleted</INCLUDE><INCLUDE>CountryCode</INCLUDE><INCLUDE>CountyNo</INCLUDE><INCLUDE>Geometry.WGS84</INCLUDE></QUERY>';
    const json=await tvPost(key,q), all=[];for(const b of ((json||{}).RESPONSE||{}).RESULT||[])all.push(...(b.TrainStation||[]));
    const list=new Map(),names={};for(const r of all){const name=r.AdvertisedLocationName||r.OfficialLocationName;if(r.LocationSignature&&name)names[r.LocationSignature]=name;if(regionalStation(r)&&/^[A-Za-zÅÄÖåäö.]{1,8}$/.test(r.LocationSignature||'')&&r.AdvertisedLocationName)list.set(r.LocationSignature,{id:r.LocationSignature,label:r.AdvertisedLocationName});}
    if(!list.has('G'))throw new Error('invalid_station_catalog');
    CATALOG=Array.from(list.values()).sort((a,b)=>a.label.localeCompare(b.label,'sv'));CATALOG_AT=Date.now();TS_NAMES=names;return CATALOG;
  }catch(e){CATALOG_FAIL_AT=Date.now();if(CATALOG&&Date.now()-CATALOG_AT<CATALOG_STALE_MAX)return CATALOG;throw e;}
  finally{CATALOG_PENDING=null;}})();return CATALOG_PENDING;
}
async function loadStationNames(key){await loadCatalog(key);}

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

function lastChangeIdOf(payload) {
  const results = ((payload || {}).RESPONSE || {}).RESULT || [];
  for (const block of results) {
    const info = block.INFO || block.Info || {};
    const id = info.LASTCHANGEID != null ? info.LASTCHANGEID : info.LastChangeId;
    if (id != null && String(id) !== "") return String(id);
  }
  return "";
}

function rowDeleted(row) {
  const d = row && (row.Deleted != null ? row.Deleted : row.deleted);
  return d === true || d === "true" || d === "True";
}

function trainKey(f) {
  return (f.id || "") + "|" + (f.dir || "") + "|" + (f.sched || "");
}

function trainFingerprint(f) {
  return [f.est || "", f.act || "", f.canceled ? "1" : "0", f.track || "", f.lastSeenTs || "", f.lastSeenSig || "", f.reason || "", f.info || ""].join("\t");
}

function slimBoardRows(payload) {
  const trains = [], removed = [];
  for (const row of rowsOf(payload)) {
    const t = slimTrain(row);
    if (rowDeleted(row)) {
      if (t.id && t.sched) removed.push(t);
      continue;
    }
    trains.push(t);
  }
  return { trains, removed, changeId: lastChangeIdOf(payload) };
}

// Operational date in Europe/Stockholm of ScheduledDepartureDateTime (origin advertised
// departure of this run). Same value on every announcement of the run.
function stockholmDate(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function runDateOf(rowOrTrain) {
  if (!rowOrTrain) return "";
  if (rowOrTrain.depDate) return String(rowOrTrain.depDate);
  return stockholmDate(rowOrTrain.ScheduledDepartureDateTime || rowOrTrain.depAt || "");
}

function runKey(ident, dep) {
  const d = typeof dep === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dep) ? dep : stockholmDate(dep);
  return d ? String(ident) + "|" + d : String(ident);
}

// Last-seen belongs to this arrival if operational dates match, otherwise if the
// timestamp falls in this journey window (not yesterday's train with the same number,
// and not the continuation after this station, e.g. Göteborg → Uddevalla).
function sameRunTs(f, ts, rowDep) {
  const a = runDateOf(f);
  const b = typeof rowDep === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rowDep) ? rowDep : stockholmDate(rowDep);
  if (a && b) return a === b;
  const arr = Date.parse(f.est || f.sched);
  const t = Date.parse(ts);
  if (!Number.isFinite(arr) || !Number.isFinite(t)) return false;
  return t > arr - 8 * 3600 * 1000 && t < arr + 30 * 60 * 1000;
}

function lastSeenOnRoute(f, sig, ts) {
  if (!sig) return false;
  const arr = Date.parse(f.est || f.sched);
  const t = Date.parse(ts);
  if (Number.isFinite(arr) && Number.isFinite(t) && (t > arr + 30 * 60 * 1000 || t < arr - 8 * 3600 * 1000)) return false;
  const stops = f.stops;
  if (!stops || !stops.length) return true;
  if (stops.some((s) => s.sig === sig)) return true;
  // Technical mid-route locations are allowed if they occurred before this arrival.
  return Number.isFinite(arr) && Number.isFinite(t) && t <= arr + 5 * 60 * 1000;
}

function lookupLastSeen(seen, f) {
  if (!seen || !f || !f.id) return null;
  const rd = runDateOf(f);
  if (rd) {
    const hit = seen[runKey(f.id, rd)];
    return hit || null;
  }
  const prefix = f.id + "|";
  let best = null;
  for (const k of Object.keys(seen)) {
    if (k !== f.id && !k.startsWith(prefix)) continue;
    const hit = seen[k];
    if (!hit || !sameRunTs(f, hit.ts, hit.depDate || k.slice(prefix.length))) continue;
    if (!best || Date.parse(hit.ts) > Date.parse(best.ts)) best = hit;
  }
  return best;
}

function filterLocsWindow(locs, f) {
  const arr = Date.parse(f.est || f.sched);
  const out = {};
  for (const [sig, s] of Object.entries(locs || {})) {
    if (!s) continue;
    const rd = runDateOf(f);
    if (rd && s.depDate && s.depDate !== rd) continue;
    const t = Date.parse(s.sched || s.t || s.est || s.act);
    if (Number.isFinite(arr) && Number.isFinite(t) && (t < arr - 8 * 3600 * 1000 || t > arr + 60 * 60 * 1000)) continue;
    out[sig] = s;
  }
  return out;
}

function routesForTrain(routes, f) {
  if (!routes || !f || !f.id) return null;
  const rd = runDateOf(f);
  if (rd && routes[runKey(f.id, rd)]) return routes[runKey(f.id, rd)];
  const prefix = f.id + "|";
  const bag = {};
  for (const k of Object.keys(routes)) {
    if (k !== f.id && !k.startsWith(prefix)) continue;
    if (rd && k !== f.id && k !== runKey(f.id, rd)) continue;
    Object.assign(bag, rd ? routes[k] : filterLocsWindow(routes[k], f));
  }
  return filterLocsWindow(bag, f);
}

function sliceStopsAtStation(stops, f, station) {
  if (!station || !stops || !stops.length || f.dir !== "ANK") return stops;
  const arr = Date.parse(f.est || f.sched);
  let gi = -1;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].sig !== station) continue;
    const t = Date.parse(stops[i].sched || stops[i].t);
    if (!Number.isFinite(t) || !Number.isFinite(arr) || Math.abs(t - arr) < 3 * 3600 * 1000) gi = i;
  }
  return gi >= 0 ? stops.slice(0, gi + 1) : stops;
}

function applyLastSeenFromStops(f) {
  if (!f.stops || !f.stops.length) return;
  const acted = f.stops.filter((s) => s.act && sameRunTs(f, s.act, f.depDate) && lastSeenOnRoute(f, s.sig, s.act));
  if (!acted.length) {
    if (f.lastSeenTs && (!sameRunTs(f, f.lastSeenTs, f.depDate) || !lastSeenOnRoute(f, f.lastSeenSig, f.lastSeenTs))) {
      delete f.lastSeen;
      delete f.lastSeenSig;
      delete f.lastSeenTs;
      delete f.lastSeenAct;
    }
    return;
  }
  const last = acted.reduce((a, b) => (b.act > a.act ? b : a));
  if (!f.lastSeenTs || String(last.act) >= String(f.lastSeenTs) || !sameRunTs(f, f.lastSeenTs, f.depDate) || !lastSeenOnRoute(f, f.lastSeenSig, f.lastSeenTs)) {
    f.lastSeen = last.name;
    f.lastSeenSig = last.sig;
    f.lastSeenTs = last.act;
  }
}

function attachLastSeen(trains, pos, routes, station) {
  const seen = (pos && pos.best) || {};
  const checked = new Set((pos && pos.idents) || []);
  for (const f of trains) {
    if (routes) {
      const locs = routesForTrain(routes, f);
      if (locs && Object.keys(locs).length) {
        const stops = sliceStopsAtStation(
          Object.values(locs).sort((a, b) => String(a.t).localeCompare(String(b.t))),
          f,
          station
        );
        if (stops.length) {
          f.stops = stops.map((s) => ({
            sig: s.sig, name: stationName(s.sig) || s.sig, t: s.t || "",
            act: s.act || "", est: s.est || "", sched: s.sched || "", track: s.track || "",
          }));
        }
      }
    }
    const hit = lookupLastSeen(seen, f);
    const okHit = hit && hit.sig && sameRunTs(f, hit.ts, hit.depDate) && lastSeenOnRoute(f, hit.sig, hit.ts);
    if (okHit) {
      f.lastSeen = stationName(hit.sig) || hit.sig;
      f.lastSeenSig = hit.sig;
      f.lastSeenTs = hit.ts;
      f.lastSeenAct = hit.act;
    }
    applyLastSeenFromStops(f);
    const hasRoute = !!(f.stops && f.stops.length);
    if (f.dir === "ANK" && (checked.has(f.id) || hasRoute || runDateOf(f))) f.posChecked = true;
  }
  return trains;
}

function cloneTrain(f) {
  const o = {};
  for (const k of Object.keys(f)) {
    if (k === "stops") continue; // delta path never carries the heavy route list
    o[k] = f[k];
  }
  return o;
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

// Deviation / OtherInformation / Booking: { Code, Description } eller sträng.
// Hoppar över tomma och rena statusord som "Inställt" (det syns redan på raden).
const SKIP_REASON = new Set(["inställt", "installd", "inställd", "canceled", "cancelled", "borttagen"]);
function codesText(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const item of arr) {
    let s = "";
    if (typeof item === "string") s = item.trim();
    else if (item && typeof item === "object") s = String(item.Description || item.Text || item.Code || "").trim();
    if (!s) continue;
    if (SKIP_REASON.has(s.toLowerCase())) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

// Kort orsakstext till UI. reason = huvudsak (Deviation), info = övrigt (OtherInformation + Booking).
function reasonParts(f) {
  const reason = codesText(f.Deviation).join(". ");
  const info = codesText(f.OtherInformation).concat(codesText(f.Booking)).join(". ");
  return { reason: reason || "", info: info || "" };
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
  const parts = reasonParts(f);
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
    reason: parts.reason,
    info: parts.info,
    depAt: f.ScheduledDepartureDateTime || "",
    depDate: stockholmDate(f.ScheduledDepartureDateTime) || "",
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

function stationAnnouncementQuery(station, changeId) {
  // changeid="0" on a full fetch is what makes Trafikverket return INFO.LASTCHANGEID.
  const incremental = !!(changeId && changeId !== "0");
  const extra = 'orderby="AdvertisedTimeAtLocation" limit="2000" changeid="' + xmlAttr(incremental ? changeId : "0") + '"' +
    (incremental ? ' includedeletedobjects="true"' : "");
  return (
    '<QUERY objecttype="TrainAnnouncement" namespace="rail.trafficinfo" schemaversion="1.9" ' + extra + ">" +
    "<FILTER><AND>" +
    '<EQ name="LocationSignature" value="' + xmlAttr(station) + '" />' +
    '<EQ name="Advertised" value="true" />' +
    '<GT name="AdvertisedTimeAtLocation" value="$dateadd(-' + hh(BACK_HOURS) + ')" />' +
    '<LT name="AdvertisedTimeAtLocation" value="$dateadd(' + hh(AHEAD_HOURS) + ')" />' +
    "</AND></FILTER>" +
    "<INCLUDE>ActivityType</INCLUDE><INCLUDE>AdvertisedTimeAtLocation</INCLUDE>" +
    "<INCLUDE>EstimatedTimeAtLocation</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE>" +
    "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>Canceled</INCLUDE>" +
    "<INCLUDE>TrackAtLocation</INCLUDE><INCLUDE>FromLocation</INCLUDE>" +
    "<INCLUDE>ToLocation</INCLUDE><INCLUDE>ProductInformation</INCLUDE>" +
    "<INCLUDE>TypeOfTraffic</INCLUDE>" +
    "<INCLUDE>Deviation</INCLUDE><INCLUDE>OtherInformation</INCLUDE><INCLUDE>Booking</INCLUDE>" +
    "<INCLUDE>ScheduledDepartureDateTime</INCLUDE></QUERY>"
  );
}

async function stationQuery(key, station = STATION, changeId) {
  return slimBoardRows(await tvPost(key, stationAnnouncementQuery(station, changeId)));
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
    '<QUERY objecttype="TrainAnnouncement" namespace="rail.trafficinfo" schemaversion="1.9" orderby="TimeAtLocation desc" limit="10000">' +
    '<FILTER><AND><GT name="TimeAtLocation" value="$dateadd(-06:00:00)" />' +
    "<OR>" + orIdents(idents) + "</OR></AND></FILTER>" +
    "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE>" +
    "<INCLUDE>ActivityType</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE>" +
    "<INCLUDE>ScheduledDepartureDateTime</INCLUDE></QUERY>";
  const best = {};
  for (const row of rowsOf(await tvPost(key, q))) {
    const tid = row.AdvertisedTrainIdent;
    const ts = row.TimeAtLocation;
    if (!tid || !ts) continue;
    const depDate = stockholmDate(row.ScheduledDepartureDateTime);
    const keyId = runKey(tid, depDate);
    const prev = best[keyId];
    if (!prev || Date.parse(ts) > Date.parse(prev.ts)) best[keyId] = { ts, sig: row.LocationSignature || "", act: row.ActivityType || "", depDate };
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
        '<QUERY objecttype="TrainAnnouncement" namespace="rail.trafficinfo" schemaversion="1.9" orderby="AdvertisedTimeAtLocation" limit="1500">' +
        '<FILTER><AND><EQ name="Advertised" value="true" />' +
        '<GT name="AdvertisedTimeAtLocation" value="$dateadd(-12:00:00)" />' +
        '<LT name="AdvertisedTimeAtLocation" value="$dateadd(16:00:00)" />' +
        "<OR>" + orIdents(batch) + "</OR></AND></FILTER>" +
        "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE>" +
        "<INCLUDE>AdvertisedTimeAtLocation</INCLUDE><INCLUDE>EstimatedTimeAtLocation</INCLUDE>" +
        "<INCLUDE>TimeAtLocation</INCLUDE><INCLUDE>TrackAtLocation</INCLUDE>" +
        "<INCLUDE>Canceled</INCLUDE><INCLUDE>ScheduledDepartureDateTime</INCLUDE></QUERY>";
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
      const depDate = stockholmDate(row.ScheduledDepartureDateTime);
      const keyId = runKey(tid, depDate);
      by[keyId] = by[keyId] || {};
      const prev = by[keyId][sig];
      if (!prev || String(t) < String(prev.t || "9999")) {
        by[keyId][sig] = {
          sig, t,
          act: row.TimeAtLocation || "",
          est: row.EstimatedTimeAtLocation || "",
          sched: row.AdvertisedTimeAtLocation || "",
          track: row.TrackAtLocation || "",
          depDate,
        };
      }
    }
  }
  return by;
}

async function buildTrains(key, station = STATION) {
  await loadStationNames(key).catch(() => {});
  const board = await stationQuery(key, station);
  const trains = board.trains;
  const [pos, routes] = await Promise.all([
    lastSeenMap(key, trains).catch(() => ({ best: {}, idents: [] })),
    routesMap(key, trains).catch(() => ({})),
  ]);
  attachLastSeen(trains, pos, routes, station);
  // Samma nyckel som merge_keep i Python-scriptet: (id, dir, sched).
  const uniq = new Map();
  for (const f of trains) uniq.set(trainKey(f), f);
  const list = Array.from(uniq.values());
  rememberDeltaState(station, list, board.changeId);
  return list;
}

const CACHE_DELTA = "public, s-maxage=10, stale-while-revalidate=10";
const DELTA_CACHE = new Map();
const DELTA_PENDING = new Map();
const DELTA_STATE = new Map();

function rememberDeltaState(station, trains, changeId) {
  const list = trains.map(cloneTrain);
  const prev = DELTA_STATE.get(station);
  DELTA_STATE.set(station, {
    trains: list,
    changeId: changeId || (prev && prev.changeId) || "",
    fingerprints: new Map(list.map((f) => [trainKey(f), trainFingerprint(f)])),
    at: Date.now(),
  });
}

function seedDeltaState(station) {
  if (DELTA_STATE.get(station)) return DELTA_STATE.get(station);
  const cached = STATION_CACHE.get(station);
  const body = cached && (cached.lastGood || cached.body);
  if (body && Array.isArray(body.trains) && body.trains.length) {
    rememberDeltaState(station, body.trains, "");
    return DELTA_STATE.get(station);
  }
  return null;
}

function mergeBoard(prevTrains, incoming, removed) {
  const uniq = new Map();
  for (const f of prevTrains || []) uniq.set(trainKey(f), cloneTrain(f));
  for (const f of removed || []) uniq.delete(trainKey(f));
  for (const f of incoming || []) uniq.set(trainKey(f), cloneTrain(f));
  return Array.from(uniq.values());
}

function diffBoard(prev, next) {
  const prevMap = new Map((prev || []).map((f) => [trainKey(f), f]));
  const nextMap = new Map((next || []).map((f) => [trainKey(f), f]));
  const changed = [];
  const removed = [];
  for (const [k, f] of nextMap) {
    const before = prevMap.get(k);
    if (!before || trainFingerprint(before) !== trainFingerprint(f)) changed.push(cloneTrain(f));
  }
  for (const k of prevMap.keys()) if (!nextMap.has(k)) {
    const f = prevMap.get(k);
    removed.push({ id: f.id, dir: f.dir, sched: f.sched });
  }
  return { changed, removed };
}

// Light board for near-live polls: station arrivals + last-seen only, never the full route rebuild.
async function buildTrainsDelta(key, station = STATION) {
  await loadStationNames(key).catch(() => {});
  const prev = seedDeltaState(station);
  let trains, changeId;
  if (prev && prev.changeId) {
    try {
      const patch = await stationQuery(key, station, prev.changeId);
      trains = mergeBoard(prev.trains, patch.trains, patch.removed);
      changeId = patch.changeId || prev.changeId;
    } catch (e) {
      const board = await stationQuery(key, station);
      trains = board.trains;
      changeId = board.changeId;
    }
  } else {
    const board = await stationQuery(key, station);
    trains = board.trains;
    changeId = board.changeId;
  }
  const pos = await lastSeenMap(key, trains).catch(() => ({ best: {}, idents: [] }));
  attachLastSeen(trains, pos);
  const uniq = new Map();
  for (const f of trains) uniq.set(trainKey(f), f);
  trains = Array.from(uniq.values());
  const before = (prev && prev.trains) || [];
  const diff = prev ? diffBoard(before, trains) : { changed: [], removed: [] };
  rememberDeltaState(station, trains, changeId);
  return {
    station: (TS_NAMES && TS_NAMES[station]) || QUICK_STATIONS.get(station) || station,
    stationSignature: station,
    updated: new Date().toISOString(),
    error: null,
    source: "delta",
    delta: true,
    changeId: changeId || "",
    trains: diff.changed,
    removed: diff.removed,
  };
}

// Stationslista för ETT tåg (på begäran när man trycker på raden): ?station=<signatur>&route=<tågnr>&sched=<ankomst>.
// En Trafikverket-fråga per tåg, cachad 45 s i CDN och 30 s i instansen.
const ROUTE_CACHE = new Map();
const CACHE_ROUTE = "public, s-maxage=45, stale-while-revalidate=30";
async function routeFor(key, ident, schedIso, station = STATION) {
  const sched = Date.parse(schedIso);
  const ck = station + "|" + ident + "|" + schedIso;
  const hit = ROUTE_CACHE.get(ck);
  if (hit && Date.now() - hit.at < 30000) return hit.body;
  const now = Date.now();
  const back = Math.min(36, Math.max(1, Math.ceil((now - sched) / 3600000 + 12)));
  const ahead = Math.min(24, Math.max(1, Math.ceil((sched - now) / 3600000 + 2)));
  const q =
    '<QUERY objecttype="TrainAnnouncement" namespace="rail.trafficinfo" schemaversion="1.9" orderby="AdvertisedTimeAtLocation" limit="1500">' +
    '<FILTER><AND><EQ name="AdvertisedTrainIdent" value="' + xmlAttr(ident) + '" />' +
    '<GT name="AdvertisedTimeAtLocation" value="$dateadd(-' + hh(back) + ')" />' +
    '<LT name="AdvertisedTimeAtLocation" value="$dateadd(' + hh(ahead) + ')" />' +
    "</AND></FILTER>" +
    "<INCLUDE>LocationSignature</INCLUDE><INCLUDE>ActivityType</INCLUDE><INCLUDE>Advertised</INCLUDE>" +
    "<INCLUDE>AdvertisedTimeAtLocation</INCLUDE><INCLUDE>EstimatedTimeAtLocation</INCLUDE>" +
    "<INCLUDE>TimeAtLocation</INCLUDE><INCLUDE>TrackAtLocation</INCLUDE><INCLUDE>Canceled</INCLUDE>" +
    "<INCLUDE>Deviation</INCLUDE><INCLUDE>OtherInformation</INCLUDE><INCLUDE>Booking</INCLUDE>" +
    "<INCLUDE>ScheduledDepartureDateTime</INCLUDE></QUERY>";
  const rows = rowsOf(await tvPost(key, q));
  // Bara den körning som ankommer vald station vid sched (±3 h) – inte gårdagens/morgondagens med samma nummer.
  const lo = sched - 14 * 3600000, hi = sched + 3 * 3600000;
  const stops = new Map();
  for (const r of rows) {
    const t = Date.parse(r.AdvertisedTimeAtLocation || r.TimeAtLocation);
    if (!Number.isFinite(t) || t < lo || t > hi) continue;
    const sig = r.LocationSignature || "";
    if (!sig) continue;
    if (!r.Advertised && !r.TimeAtLocation) continue;
    const s = stops.get(sig) || { sig, name: stationName(sig) || sig, t, track: "", canceled: false };
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
  const gi = list.findIndex((s) => s.sig === station && s.arrSched);
  if (gi >= 0) list = list.slice(0, gi + 1);
  // Last seen only at or before the selected station on this run (not the continuation after G).
  const routeSigs = new Set(list.map((s) => s.sig));
  const cut = list.length ? list[list.length - 1].t : sched;
  let seen = null;
  for (const r of rows) {
    if (!r.TimeAtLocation) continue;
    const t = Date.parse(r.AdvertisedTimeAtLocation || r.TimeAtLocation);
    if (!Number.isFinite(t) || t < lo || t > hi) continue;
    const ts = Date.parse(r.TimeAtLocation);
    if (!Number.isFinite(ts) || ts > cut + 5 * 60 * 1000) continue;
    const sig = r.LocationSignature || "";
    if (routeSigs.size && !routeSigs.has(sig) && ts > cut) continue;
    if (!seen || ts > Date.parse(seen.ts)) seen = { sig, name: stationName(sig) || sig, ts: r.TimeAtLocation, type: r.ActivityType || "" };
  }
  list = list.map((s) => { const o = Object.assign({}, s); delete o.t; return o; });
  let reason = "", info = "";
  for (const r of rows) {
    if ((r.LocationSignature || "") !== station) continue;
    const t = Date.parse(r.AdvertisedTimeAtLocation);
    if (!Number.isFinite(t) || Math.abs(t - sched) > 3 * 3600000) continue;
    const parts = reasonParts(r);
    if (parts.reason && !reason) reason = parts.reason;
    if (parts.info && !info) info = parts.info;
  }
  const body = { station: (TS_NAMES&&TS_NAMES[station])||QUICK_STATIONS.get(station)||station, stationSignature: station, id: ident, sched: schedIso, updated: new Date().toISOString(), error: null, stops: list, lastSeen: seen, reason, info };
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
  const url = new URL(req.url || "/", "http://x");
  const station = url.searchParams.get("station") || STATION;
  if (url.searchParams.getAll("station").length > 1 || !/^[A-Za-zÅÄÖåäö.]{1,8}$/.test(station))
    return send(res,400,"no-store",{error:"Okänd station",trains:[]});
  const key = getKey();
  if (!key) return send(res,503,CACHE_ERR,{station:(TS_NAMES&&TS_NAMES[station])||QUICK_STATIONS.get(station)||station,stationSignature:station,updated:null,error:"TRAFIKVERKET_API_KEY saknas",trains:[]});
  if(url.searchParams.get('stations')==='1'){
    try{const stations=await loadCatalog(key);return send(res,200,'public, s-maxage=86400, stale-while-revalidate=3600',{updated:new Date(CATALOG_AT).toISOString(),stations,stale:Date.now()-CATALOG_AT>=CATALOG_TTL});}
    catch(e){return send(res,503,CACHE_ERR,{error:'Stationslistan kunde inte hämtas',stations:[]});}
  }
  // Default G works during catalog outages; every other signature must be in the cached live advertised regional list.
  if(station!=='G'){
    let stations;try{stations=await loadCatalog(key);}catch(e){return send(res,503,CACHE_ERR,{error:'Stationslistan kunde inte hämtas',trains:[]});}
    if(!stations.some(s=>s.id===station))return send(res,400,'no-store',{error:'Stationen finns inte i stationslistan',trains:[]});
  }
  const routeId = url.searchParams.get("route");
  if (routeId !== null) {
    const sched = url.searchParams.get("sched") || "";
    if (!/^\d{1,6}$/.test(routeId) || !Number.isFinite(Date.parse(sched)))
      return send(res,400,"no-store",{error:"route/sched saknas eller fel",stops:[]});
    const rk=station+"|"+routeId+"|"+sched;
    try {
      if(!ROUTE_PENDING.has(rk))ROUTE_PENDING.set(rk,(async()=>{await loadStationNames(key).catch(()=>{});return routeFor(key,routeId,sched,station);})().finally(()=>ROUTE_PENDING.delete(rk)));
      return send(res,200,CACHE_ROUTE,await ROUTE_PENDING.get(rk));
    } catch(e) {return send(res,502,CACHE_ERR,{error:e.name==="AbortError"?"Trafikverket timeout":"Kunde inte hämta stationslistan",stops:[]});}
  }
  const wantDelta = url.searchParams.get("delta") === "1" || url.searchParams.get("mode") === "delta";
  if (wantDelta) {
    const cached=DELTA_CACHE.get(station), now=Date.now();
    if(cached&&now-cached.at<cached.ttl)return send(res,cached.status,cached.status===200&&!cached.body.error?CACHE_DELTA:CACHE_ERR,cached.body);
    if(!DELTA_PENDING.has(station))DELTA_PENDING.set(station,(async()=>{
      try {
        const body=await buildTrainsDelta(key,station);
        const value={at:Date.now(),ttl:10000,status:200,body};DELTA_CACHE.set(station,value);return value;
      }catch(e){
        const msg=e.name==="AbortError"?"Trafikverket timeout":"Kunde inte hämta tågtider";
        const body={station:(TS_NAMES&&TS_NAMES[station])||QUICK_STATIONS.get(station)||station,stationSignature:station,updated:null,error:msg,delta:true,trains:[],removed:[]};
        const value={at:Date.now(),ttl:5000,status:502,body};DELTA_CACHE.set(station,value);return value;
      }
    })().finally(()=>DELTA_PENDING.delete(station)));
    const result=await DELTA_PENDING.get(station);
    return send(res,result.status,result.status===200&&!result.body.error?CACHE_DELTA:CACHE_ERR,result.body);
  }
  const cached=STATION_CACHE.get(station), now=Date.now();
  if(cached&&now-cached.at<cached.ttl)return send(res,cached.status,cached.status===200&&!cached.body.error?CACHE_OK:CACHE_ERR,cached.body);
  if(!STATION_PENDING.has(station))STATION_PENDING.set(station,(async()=>{
    try {
      const trains=await buildTrains(key,station),body={station:(TS_NAMES&&TS_NAMES[station])||QUICK_STATIONS.get(station)||station,stationSignature:station,updated:new Date().toISOString(),error:null,source:"live",windowHours:{back:BACK_HOURS,ahead:AHEAD_HOURS},trains};
      const value={at:Date.now(),ttl:60000,status:200,body,lastGood:body};STATION_CACHE.set(station,value);return value;
    }catch(e){
      // Never disclose upstream request/key material in an error response.
      const msg=e.name==="AbortError"?"Trafikverket timeout":"Kunde inte hämta tågtider";
      const prior=STATION_CACHE.get(station),good=prior&&prior.lastGood;
      const usable=good&&Date.now()-Date.parse(good.updated)<15*60000;
      const body=usable?Object.assign({},good,{error:msg,source:"stale"}):{station:(TS_NAMES&&TS_NAMES[station])||QUICK_STATIONS.get(station)||station,stationSignature:station,updated:null,error:msg,trains:[]};
      const value={at:Date.now(),ttl:15000,status:usable?200:502,body,lastGood:good};STATION_CACHE.set(station,value);return value;
    }
  })().finally(()=>STATION_PENDING.delete(station)));
  const result=await STATION_PENDING.get(station);
  return send(res,result.status,result.status===200&&!result.body.error?CACHE_OK:CACHE_ERR,result.body);
}

module.exports = handler;
module.exports._internal = { slimTrain, buildTrains, buildTrainsDelta, uniqueIdents, rowsOf, lastChangeIdOf, codesText, reasonParts, routeFor, loadCatalog, regionalStation, QUICK_STATIONS, trainKey, trainFingerprint, mergeBoard, diffBoard, stockholmDate, runDateOf, runKey, sameRunTs, lastSeenOnRoute, lookupLastSeen, routesForTrain, attachLastSeen, sliceStopsAtStation };
