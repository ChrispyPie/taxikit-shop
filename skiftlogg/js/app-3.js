/* app-3.js */
  function escAttr(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function sameStation(a, b) {
    function norm(s) {
      return String(s || "").toLowerCase()
        .replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o")
        .replace(/[^a-z0-9]+/g, "");
    }
    var x = norm(a), y = norm(b);
    if (!x || !y) return false;
    return x === y || x.indexOf(y) === 0 || y.indexOf(x) === 0;
  }
  function ruttStopHtml(time, name, track, cls, rail) {
    var extra = track ? '<span class="rutt-track">Spår ' + escAttr(track) + "</span>" : '<span class="rutt-track">&nbsp;</span>';
    return '<div class="rutt-stop ' + (cls || "") + '">' +
      '<div class="rutt-t">' + (time || "") + "</div>" +
      '<div class="rutt-line"><div class="rutt-dot"></div><div class="rutt-rail' + (rail === "dash" ? " dash" : "") + '"></div></div>' +
      '<div class="rutt-n">' + escAttr(stationLabel(name) || name || "") + extra + "</div></div>";
  }
  function ruttListHtml(stops) {
    var nowIdx = -1;
    stops.forEach(function (s, i) { if (s.cls && s.cls.indexOf("now") >= 0) nowIdx = i; });
    return '<div class="rutt-list">' + stops.map(function (s, i) {
      var rail = "solid";
      if (nowIdx >= 0 && i < nowIdx) rail = "dash";
      if (i === stops.length - 1) rail = "";
      return ruttStopHtml(s.time, s.name, s.track || "", s.cls, rail);
    }).join("") + "</div>";
  }
  function trainEndsAtG(f) {
    return (f.dir || "ANK") === "ANK";
  }
  function trainMiniStops(f, clockG, routeStops) {
    var startName = trainEndsAtG(f)
      ? stationLabel((f.from && f.from[0]) || f.other || f.fromSig || "")
      : "Göteborg C";
    var endName = trainEndsAtG(f)
      ? "Göteborg C"
      : stationLabel((f.to && f.to[f.to.length - 1]) || f.other || "");
    var midName = stationLabel(f.lastSeen || f.lastSeenSig || "");
    var midTime = f.lastSeenTs ? fmtClock(f.lastSeenTs) : "";
    var startTime = "";
    var endTime = clockG || "";
    if (!trainEndsAtG(f)) { startTime = clockG || ""; endTime = ""; }
    if (routeStops && routeStops.length) {
      var first = routeStops[0];
      var last = routeStops[routeStops.length - 1];
      var g = null, seen = null;
      routeStops.forEach(function (s) {
        if (s.sig === "G" || sameStation(s.name, "Göteborg C")) g = s;
        if (s.act) seen = s;
      });
      if (!seen && f.lastSeenSig) {
        routeStops.forEach(function (s) {
          if (s.sig === f.lastSeenSig) seen = s;
        });
      }
      startName = stationLabel(first.name || first.sig);
      startTime = fmtClock(first.act || first.est || first.sched || first.t);
      if (g) {
        endName = "Göteborg C";
        endTime = fmtClock(g.act || g.est || g.sched || g.t) || endTime;
      } else {
        endName = stationLabel(last.name || last.sig);
        endTime = fmtClock(last.act || last.est || last.sched || last.t);
      }
      if (seen && !sameStation(seen.name, startName) && !sameStation(seen.name, endName)) {
        midName = stationLabel(seen.name || seen.sig);
        midTime = fmtClock(seen.act || seen.t);
      }
    }
    var stops = [{ time: startTime, name: startName, cls: "" }];
    if (midName && !sameStation(midName, startName) && !sameStation(midName, endName)) {
      stops.push({ time: midTime, name: midName, cls: "now" });
    }
    stops.push({ time: endTime, name: endName, cls: f.act ? "now" : "" });
    return stops;
  }
  function trainStopsPayload(f) {
    return encodeURIComponent(JSON.stringify(f.stops || []));
  }
  function trainExtraHtml(f, clockG) {
    var typ = f.product || f.traffic || "";
    var mini = ruttListHtml(trainMiniStops(f, clockG, f.stops || []));
    var full = "";
    if (f.stops && f.stops.length) {
      full = ruttListHtml((f.stops || []).map(function (s) {
        return {
          time: fmtClock(s.act || s.est || s.sched || s.t),
          name: s.name || s.sig,
          track: s.track,
          cls: (s.sig && s.sig === f.lastSeenSig) ? "now" : ""
        };
      }));
    }
    return (typ ? '<div class="feed-type">' + escAttr(typ) + "</div>" : "") +
      '<div class="rutt collapsed" data-tid="' + escAttr(f.id || "") +
      '" data-dir="' + escAttr(f.dir || "") +
      '" data-sched="' + escAttr(f.sched || "") +
      '" data-seen="' + escAttr(f.lastSeenSig || "") +
      '" data-seen-name="' + escAttr(f.lastSeen || "") +
      '" data-seen-ts="' + escAttr(f.lastSeenTs || "") +
      '" data-clock="' + escAttr(clockG || "") +
      '" data-stops="' + trainStopsPayload(f) + '">' +
      '<div class="rutt-mini">' + mini + "</div>" +
      '<div class="rutt-full"' + (full ? ' data-ready="1"' : "") + '>' + full + "</div></div>";
  }
  function parseTrainRoute(json) {
    var rows = [];
    ((((json || {}).RESPONSE || {}).RESULT) || []).forEach(function (block) {
      var list = block.TrainAnnouncement || [];
      if (!Array.isArray(list)) list = list ? [list] : [];
      list.forEach(function (row) { rows.push(row); });
    });
    var by = {};
    rows.forEach(function (row) {
      var sig = row.LocationSignature || "";
      if (!sig) return;
      var t = row.TimeAtLocation || row.EstimatedTimeAtLocation || row.AdvertisedTimeAtLocation || "";
      var prev = by[sig];
      if (!prev || String(t) < String(prev.t)) {
        by[sig] = {
          sig: sig,
          name: stationLabel(sig) || sig,
          t: t,
          act: row.TimeAtLocation || "",
          est: row.EstimatedTimeAtLocation || "",
          sched: row.AdvertisedTimeAtLocation || "",
          track: row.TrackAtLocation || "",
          canceled: !!row.Canceled,
          actType: row.ActivityType || ""
        };
      }
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) {
      return String(a.t).localeCompare(String(b.t));
    });
  }
  function fetchTrainRoute(tid, sched, embedded) {
    var cacheKey = tid + "|" + (sched || "").slice(0, 16);
    if (trainRouteCache[cacheKey]) return Promise.resolve(trainRouteCache[cacheKey]);
    if (embedded && embedded.length) {
      trainRouteCache[cacheKey] = embedded;
      return Promise.resolve(embedded);
    }
    var hit = null;
    liveTrainItems.forEach(function (it) {
      if (!hit && String(it.trainId || "") === String(tid || "") && (it.stops || []).length) hit = it.stops;
    });
    if (hit && hit.length) {
      trainRouteCache[cacheKey] = hit;
      return Promise.resolve(hit);
    }
    return Promise.resolve(null);
  }
  function renderRuttFull(box, stops, seenSig) {
    var now = Date.now();
    var seenIdx = -1;
    var lastAct = -1;
    stops.forEach(function (s, i) {
      if (s.sig && seenSig && s.sig === seenSig) seenIdx = i;
      if (s.act) lastAct = i;
    });
    var nowIdx = seenIdx >= 0 ? seenIdx : lastAct;
    if (nowIdx < 0) {
      for (var i = 0; i < stops.length; i++) {
        var when = stops[i].t ? new Date(stops[i].t) : null;
        if (when && when.getTime() <= now) nowIdx = i;
      }
    }
    var rows = stops.map(function (s, i) {
      return {
        time: fmtClock(s.t),
        name: s.name,
        track: s.track,
        cls: i === nowIdx ? "now" : ""
      };
    });
    box.innerHTML = ruttListHtml(rows) || '<p class="rutt-hint">Ingen rutt just nu.</p>';
  }
  function fillMiniFromRoute(rutt, stops) {
    var mini = rutt.querySelector(".rutt-mini");
    if (!mini) return;
    var fake = {
      dir: rutt.getAttribute("data-dir") || "ANK",
      from: [],
      to: [],
      lastSeen: rutt.getAttribute("data-seen-name") || "",
      lastSeenSig: rutt.getAttribute("data-seen") || "",
      lastSeenTs: rutt.getAttribute("data-seen-ts") || "",
      act: ""
    };
    mini.innerHTML = ruttListHtml(trainMiniStops(fake, rutt.getAttribute("data-clock") || "", stops));
  }
  function toggleTrainRutt(row) {
    var rutt = row.querySelector(".rutt");
    if (!rutt) return;
    if (row.classList.contains("rutt-open")) {
      row.classList.remove("rutt-open");
      rutt.classList.add("collapsed");
      return;
    }
    row.classList.add("rutt-open");
    rutt.classList.remove("collapsed");
    var full = rutt.querySelector(".rutt-full");
    if (!full) return;
    if (full.getAttribute("data-ready") === "1") return;
    full.innerHTML = '<p class="rutt-hint">Hämtar rutt…</p>';
    loadRouteInto(rutt, full);
  }
  function loadRouteInto(rutt, full) {
    var tid = rutt.getAttribute("data-tid");
    var sched = rutt.getAttribute("data-sched");
    var embedded = [];
    try {
      var rawStops = rutt.getAttribute("data-stops") || "";
      embedded = JSON.parse(rawStops ? decodeURIComponent(rawStops) : "[]") || [];
    } catch (e) { embedded = []; }
    var work = fetchTrainRoute(tid, sched, embedded);
    work.then(function (stops) {
      if (stops && stops.length) fillMiniFromRoute(rutt, stops);
      if (!full) return;
      if (!stops || !stops.length) {
        full.innerHTML = '<p class="rutt-hint">Ingen full stationslista i cachen ännu.</p>';
        full.setAttribute("data-ready", "1");
        return;
      }
      renderRuttFull(full, stops, rutt.getAttribute("data-seen"));
      full.setAttribute("data-ready", "1");
    }).catch(function () {
      if (full) full.innerHTML = "";
      var row = rutt.closest(".feed-item");
      if (row) row.classList.remove("rutt-open");
      rutt.classList.add("collapsed");
    });
  }
  function prefetchTrainRoute(row) {
    var rutt = row && row.querySelector(".rutt");
    if (!rutt || rutt.getAttribute("data-mini") === "1") return;
    rutt.setAttribute("data-mini", "1");
    loadRouteInto(rutt, null);
  }

  function trainCountryIso(name) {
    var n = String(name || "").toLowerCase();
    if (/oslo/.test(n)) return "NO";
    if (/köpenhamn|kobenhavn|københavn|copenhagen/.test(n)) return "DK";
    if (/malmö|stockholm|göteborg|helsingborg|nässjö|linköping|norrköping|halmst/.test(n)) return "SE";
    return "SE";
  }

  function trainIncoming(f) {
    if (f.dir !== "ANK" || f.act || !f.track) return false;
    var when = parseIsoLocal(f.est || f.sched);
    var minsTo = when ? (when.getTime() - Date.now()) / 60000 : 999;
    var near = /^(G|Gb|Or|Gro|Gbm|Gsv|Lis|Am|Gas)$/i.test(f.lastSeenSig || "");
    return near || (minsTo >= -2 && minsTo <= 15);
  }

  function trainLatestEvent(f, delay) {
    if (f.canceled) return "Inställd";
    if (f.act && f.dir === "ANK") return f.track ? "Framme · spår " + f.track : "Framme";
    if (f.act && f.dir === "AVG") return "Avgånget";
    if (trainIncoming(f)) return "På väg in · spår " + f.track;
    if (f.deviation) return String(f.deviation);
    return "I tid";
  }

  function shortTrainBrand(s, snabb) {
    var x = String(s || "").toLowerCase();
    if (/västtåg/.test(x)) return "VT";
    if (/öresund/.test(x)) return "ÖT";
    if (/snabbtåg|x ?2000/.test(x) || snabb) return "SX";
    if (/pendel/.test(x)) return "PT";
    if (/regional/.test(x)) return "RG";
    if (/mälartåg/.test(x)) return "MÄL";
    if (/\bvy\b/.test(x)) return "VY";
    if (/\bsj\b/.test(x)) return "SJ";
    var first = String(s || "").split(" ")[0];
    return first ? first.slice(0, 3).toUpperCase() : (snabb ? "SX" : "");
  }

  function trainEventHtml(f, delay) {
    var ev = trainLatestEvent(f, delay);
    var sig = f.lastSeenSig || "";
    var name = f.lastSeen || "";
    if (!sig || !name || ev.indexOf(name) !== 0) return ev;
    return '<span class="feed-place" data-sig="' + String(sig).replace(/"/g, "") +
      '" data-name="' + String(name).replace(/"/g, "") + '">' + name + "</span>" + ev.slice(name.length);
  }

  function trainToItem(f) {
    var when = parseIsoLocal(f.act || f.est || f.sched);
    var t = when ? fmtClock(when.toISOString()) : "--";
    var sched = parseIsoLocal(f.sched);
    var shown = parseIsoLocal(f.act || f.est || f.sched);
    var delay = "";
    var delayCls = "";
    if (f.canceled) {
      delay = "";
    } else if (sched && shown) {
      var mins = Math.round((shown - sched) / 60000);
      if (Math.abs(mins) >= 5) {
        delay = (mins > 0 ? "+" : "") + mins + " min";
        delayCls = mins > 0 ? "late" : "early";
      }
    }
    var city = prettyTrainCity(f.other || "Göteborg C");
    var dest = trainDestKey(city);
    var iso = trainCountryIso(city);
    var ident = (f.id || "").replace(/\s+/g, "");
    var rawBrand = String(f.product || f.traffic || "");
    var brand = shortTrainBrand(rawBrand, !!f.snabb);
    var extra = trainExtraHtml(f, t);
    return {
      t: t,
      planT: sched ? "(" + fmtClock(sched.toISOString()) + ")" : "",
      delay: f.canceled ? "" : delay,
      delayCls: delayCls,
      type: "tag",
      dir: f.dir || "ANK",
      title: (brand || "") + ident,
      city: city,
      cityLine: city + (iso ? " " + iso : ""),
      event: trainLatestEvent(f, delay),
      eventHtml: trainEventHtml(f, delay),
      placeSig: f.lastSeenSig || "",
      snabb: !!f.snabb,
      meta: city,
      extra: extra,
      tags: [dest, f.dir === "AVG" ? "tagAvgang" : "tagAnkomst"],
      live: true,
      sort: when ? when.getTime() : 0,
      dest: dest,
      trainId: ident,
      kind: trainKindOf(f),
      stops: f.stops || [],
      lastSeen: f.lastSeen || "",
      lastSeenSig: f.lastSeenSig || "",
      lastSeenTs: f.lastSeenTs || "",
      sid: "tag:" + ident + ":" + (f.dir || "") + ":" + (f.sched || t)
    };
  }

  function parseTvTrains(json) {
    var out = [];
    var results = (((json || {}).RESPONSE || {}).RESULT) || [];
    results.forEach(function (block) {
      var rows = block.TrainAnnouncement || [];
      if (!Array.isArray(rows)) rows = rows ? [rows] : [];
      rows.forEach(function (f) {
        var act = f.ActivityType || "";
        var direction = /^ank/i.test(act) ? "ANK" : "AVG";
        function sigs(raw) {
          if (!raw) return [];
          if (!Array.isArray(raw)) raw = [raw];
          return raw.map(function (x) {
            return (typeof x === "string" ? x : (x.LocationName || x.LocationSignature || ""));
          }).filter(Boolean);
        }
        var frm = sigs(f.FromLocation);
        var to = sigs(f.ToLocation);
        var otherSig = direction === "ANK" ? frm[0] : to[to.length - 1];
        var names = {
          G: "Göteborg C", Cst: "Stockholm C", Arnc: "Arlanda C", Sci: "Stockholm City",
          M: "Malmö C", Kh: "Köpenhamn H", Hel: "Helsingborg C", Hd: "Halmstad C",
          Thn: "Trollhättan", Tnd: "Trollhättan", Sk: "Skövde C", Lp: "Linköping C",
          Nr: "Norrköping C", J: "Jönköping C", Kb: "Kungsbacka", "Vå": "Varberg", Yb: "Ytterby", Vg: "Vänersborg C", "Vgå": "Vårgårda", Sts: "Stenungsund", "Äh": "Älvängen",
          A: "Alvesta", Av: "Alvesta", N: "Nässjö C", F: "Falköping C", Hr: "Herrljunga",
          Hpbg: "Hallsberg", "Ör": "Örebro C", "Gä": "Gävle C", So: "Solna",
          "Söö": "Södertälje Syd", Fle: "Floda", K: "Katrineholm"
        };
        names["Oslo S"] = "Oslo S";
        names.Xoslo = "Oslo S";
        names.Öslo = "Oslo S";
        var other = stationLabel(otherSig) || otherSig || "Göteborg C";
        var prod = "";
        var info = f.ProductInformation || [];
        if (!Array.isArray(info)) info = info ? [info] : [];
        prod = info.map(function (p) { return (p && (p.Description || p.Code)) || ""; }).filter(Boolean).join(" ");
        var traffic = f.TypeOfTraffic || "";
        var blob = (traffic + " " + prod).toLowerCase();
        out.push({
          id: f.AdvertisedTrainIdent || "",
          dir: direction,
          other: other,
          from: frm.map(stationLabel),
          to: to.map(stationLabel),
          sched: f.AdvertisedTimeAtLocation || "",
          est: f.EstimatedTimeAtLocation || "",
          act: f.TimeAtLocation || "",
          track: f.TrackAtLocation || "",
          canceled: !!f.Canceled,
          product: prod,
          traffic: traffic,
          snabb: /snabbtåg|x ?2000|sx2000/.test(blob)
        });
      });
    });
    return out;
  }

  var TRAIN_STATION_CACHE = "taxikit-train-stations";
  var trainStationNames = null;
  var TRAIN_STATIC_NAMES = {
    G: "Göteborg C", Cst: "Stockholm C", Arnc: "Arlanda C", Sci: "Stockholm City",
    M: "Malmö C", Mc: "Malmö C", Tri: "Malmö C",
    Kh: "Köpenhamn H", Hel: "Helsingborg C", Hb: "Helsingborg C", Hd: "Halmstad C",
    Thn: "Trollhättan", Tnd: "Trollhättan", Sk: "Skövde C", Lp: "Linköping C",
    Nr: "Norrköping C", J: "Jönköping C", Kb: "Kungsbacka", "Vå": "Varberg",
    Yb: "Ytterby", Vg: "Vänersborg C", "Vgå": "Vårgårda", Sts: "Stenungsund",
    "Äh": "Älvängen", A: "Alvesta", Av: "Alvesta", N: "Nässjö C", F: "Falköping C",
    Hr: "Herrljunga", Hpbg: "Hallsberg", "Ör": "Örebro C", "Gä": "Gävle C",
    So: "Solna", "Söö": "Södertälje Syd", Fle: "Floda", K: "Katrineholm",
    Alh: "Alingsås",
    Gro: "Gubbero", Gbm: "Göteborg Marieholm", Gb: "Göteborgs norra",
    Or: "Olskroken", Gsv: "Göteborg Sävenäs", Gas: "Gamlestaden",
    Lis: "Liseberg", Am: "Almedal", Mdn: "Mölndal", Agb: "Agnesberg",
    Lu: "Lund C", Hie: "Helsingör", Hbg: "Helsingborg C",
    My: "Mjölby", Gn: "Gnesta", Fle: "Floda",
    Bsc: "Borås C", Uv: "Uddevalla C", Smd: "Strömstad",
    Ksc: "Karlstad C", Khn: "Kristinehamn", T: "Töreboda",
    "Dk.kh": "Köpenhamn H", "No.osl": "Oslo S"
  };

  function stationLabel(sig) {
    if (!sig) return "";
    var s = String(sig).trim();
    if (trainStationNames && trainStationNames[s]) return trainStationNames[s];
    if (TRAIN_STATIC_NAMES[s]) return TRAIN_STATIC_NAMES[s];
    var pretty = prettyTrainCity(s);
    if (pretty && pretty !== s) return pretty;
    if (s.length <= 4 && s === s.toUpperCase()[0] + s.slice(1)) {
      /* short signature left as-is only if unknown */
    }
    return pretty || s;
  }

  function tvPost(key, queryXml) {
    var xml = "<REQUEST><LOGIN authenticationkey=\"" + key.replace(/[<>&\"]/g, "") + "\" />" + queryXml + "</REQUEST>";
    return fetch("https://api.trafikinfo.trafikverket.se/v2/data.json", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: xml
    }).then(function (r) { return r.json(); }).then(function (json) {
      var err = json && json.RESPONSE && json.RESPONSE.RESULT && json.RESPONSE.RESULT[0] && json.RESPONSE.RESULT[0].ERROR;
      if (err) throw new Error(err.MESSAGE || "TV-fel");
      return json;
    });
  }

  function loadTrainStations(key) {
    if (trainStationNames) return Promise.resolve(trainStationNames);
    try {
      var cached = JSON.parse(localStorage.getItem(TRAIN_STATION_CACHE) || "null");
      if (cached && cached.at && Date.now() - cached.at < 7 * 86400000 && cached.map) {
        trainStationNames = cached.map;
        return Promise.resolve(trainStationNames);
      }
    } catch (e) {}
    var q =
      "<QUERY objecttype=\"TrainStation\" schemaversion=\"1.4\">" +
      "<FILTER><EQ name=\"Advertised\" value=\"true\" /></FILTER>" +
      "<INCLUDE>LocationSignature</INCLUDE><INCLUDE>AdvertisedLocationName</INCLUDE></QUERY>";
    return tvPost(key, q).then(function (json) {
      var map = {};
      var results = (((json || {}).RESPONSE || {}).RESULT) || [];
      results.forEach(function (block) {
        var rows = block.TrainStation || [];
        if (!Array.isArray(rows)) rows = rows ? [rows] : [];
        rows.forEach(function (s) {
          if (s.LocationSignature && s.AdvertisedLocationName) {
            map[s.LocationSignature] = s.AdvertisedLocationName;
          }
        });
      });
      trainStationNames = map;
      try { localStorage.setItem(TRAIN_STATION_CACHE, JSON.stringify({ at: Date.now(), map: map })); } catch (e) {}
      return map;
    }).catch(function () { trainStationNames = trainStationNames || {}; return trainStationNames; });
  }

  function fetchTvLastSeen(key, idents) {
    idents = (idents || []).filter(Boolean).filter(function (id, i, a) { return a.indexOf(id) === i; }).slice(0, 80);
    if (!idents.length) return Promise.resolve({});
    var or = idents.map(function (id) {
      return "<EQ name=\"AdvertisedTrainIdent\" value=\"" + String(id).replace(/[<>&\"]/g, "") + "\" />";
    }).join("");
    var q =
      "<QUERY objecttype=\"TrainAnnouncement\" schemaversion=\"1.9\" limit=\"800\">" +
      "<FILTER><AND>" +
      "<GT name=\"TimeAtLocation\" value=\"$dateadd(-03:00:00)\" />" +
      "<OR>" + or + "</OR>" +
      "</AND></FILTER>" +
      "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE>" +
      "<INCLUDE>TimeAtLocation</INCLUDE><INCLUDE>ActivityType</INCLUDE></QUERY>";
    return tvPost(key, q).then(function (json) {
      var best = {};
      var results = (((json || {}).RESPONSE || {}).RESULT) || [];
      results.forEach(function (block) {
        var rows = block.TrainAnnouncement || [];
        if (!Array.isArray(rows)) rows = rows ? [rows] : [];
        rows.forEach(function (row) {
          var id = row.AdvertisedTrainIdent;
          var ts = row.TimeAtLocation;
          if (!id || !ts) return;
          var prev = best[id];
          if (!prev || String(ts) > String(prev.ts)) {
            best[id] = { ts: ts, sig: row.LocationSignature || "", act: row.ActivityType || "" };
          }
        });
      });
      return best;
    }).catch(function () { return {}; });
  }

  function fetchTvTrains() {
    var key = getTvKey();
    if (!key) return Promise.resolve(null);
    var q =
      "<QUERY objecttype=\"TrainAnnouncement\" schemaversion=\"1.9\" orderby=\"AdvertisedTimeAtLocation\" limit=\"400\">" +
      "<FILTER><AND>" +
      "<EQ name=\"LocationSignature\" value=\"G\" />" +
      "<EQ name=\"Advertised\" value=\"true\" />" +
      "<GT name=\"AdvertisedTimeAtLocation\" value=\"$dateadd(-01:00:00)\" />" +
      "<LT name=\"AdvertisedTimeAtLocation\" value=\"$dateadd(12:00:00)\" />" +
      "</AND></FILTER>" +
      "<INCLUDE>ActivityType</INCLUDE><INCLUDE>AdvertisedTimeAtLocation</INCLUDE>" +
      "<INCLUDE>EstimatedTimeAtLocation</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE>" +
      "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>Canceled</INCLUDE>" +
      "<INCLUDE>TrackAtLocation</INCLUDE><INCLUDE>FromLocation</INCLUDE>" +
      "<INCLUDE>ToLocation</INCLUDE><INCLUDE>ProductInformation</INCLUDE>" +
      "<INCLUDE>TypeOfTraffic</INCLUDE></QUERY>";
    return loadTrainStations(key).then(function () {
      return tvPost(key, q);
    }).then(function (json) {
      var rows = parseTvTrains(json);
      return fetchTvLastSeen(key, rows.map(function (r) { return r.id; })).then(function (seen) {
        rows.forEach(function (r) {
          var hit = seen[r.id];
          if (hit && hit.sig) {
            r.lastSeen = stationLabel(hit.sig);
            r.lastSeenSig = hit.sig;
            r.lastSeenTs = hit.ts || "";
          }
        });
        return rows;
      });
    });
  }

  function fetchGotTrains() {
    function tryUrl(i) {
      if (i >= TRAIN_CACHE_URLS.length) return fetchTvTrains();
      return fetch(TRAIN_CACHE_URLS[i], { cache: "no-store" }).then(function (r) {
        if (!r.ok) return tryUrl(i + 1);
        return r.json();
      }).then(function (json) {
        if (json && (json.trains || []).length) return json.trains;
        return tryUrl(i + 1);
      }).catch(function () { return tryUrl(i + 1); });
    }
    return tryUrl(0).then(function (rows) {
      if (!rows || !rows.length) {
        return fetchTvTrains().then(function (live) {
          if (live && live.length) {
            liveTrainItems = live.map(trainToItem);
            liveTrainMeta = { status: "ok", error: "", at: Date.now() };
          } else {
            liveTrainMeta = { status: "err", error: "ingen tågdata", at: Date.now() };
          }
        });
      }
      liveTrainItems = rows.map(trainToItem);
      liveTrainMeta = { status: "ok", error: "", at: Date.now() };
    }).catch(function (e) {
      liveTrainMeta = { status: "err", error: (e && e.message) || "nätfel", at: Date.now() };
    });
  }

  function fetchGotFlights() {
    function tryUrl(i) {
      if (i >= GOT_CACHE_URLS.length) {
        liveFlightMeta = { status: "err", error: "cache saknas", at: Date.now() };
        return Promise.resolve();
      }
      return fetch(GOT_CACHE_URLS[i], { cache: "no-store" }).then(function (r) {
        if (!r.ok) return tryUrl(i + 1);
        return r.json();
      }).then(function (json) {
        if (!json) return;
        var rows = (json.arrivals || []).concat(json.departures || []);
        liveFlightItems = rows.map(flightToItem);
        liveFlightMeta = { status: "ok", error: json.error || "", at: Date.now(), updated: json.updated };
        var seen = liveFlightItems.map(function (it) { return { city: it.city, apt: it.apt || "" }; });
        (json.destinations || []).forEach(function (d) {
          if (d && (d.city || d.apt)) seen.push({ city: d.city || d.apt, apt: d.apt || "" });
        });
        rememberFlyDest(seen);
      }).catch(function () { return tryUrl(i + 1); });
    }
    return tryUrl(0);
  }

  function loadFeedPrefs() {
    try {
      var raw = localStorage.getItem(FEED_PREFS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_FEED_PREFS);
      return Object.assign({}, DEFAULT_FEED_PREFS, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, DEFAULT_FEED_PREFS);
    }
  }
  function saveFeedPrefs() {
    localStorage.setItem(FEED_PREFS_KEY, JSON.stringify(feedPrefs));
  }
  var FEED_STARS_KEY = "taxikit-feed-stars";
  function loadStars() {
    try { return JSON.parse(localStorage.getItem(FEED_STARS_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveStars(arr) {
    localStorage.setItem(FEED_STARS_KEY, JSON.stringify(arr));
  }
  var feedStars = loadStars();
  var lastFeedItems = [];
  var flodeLookbackH = 1;
  var flodeAheadH = 12;
  var FLODE_MAX_BACK = 24;
  var FLODE_MAX_AHEAD = 24;
  var flodeScrollPos = {};
  var flodeKeepScroll = false;
  var flodePin = "now";
  var flodeLiveTimer = null;
  var FLODE_LIVE_MS = 60000;

  function refreshFlodeLive(opts) {
    opts = opts || {};
    flodeKeepScroll = opts.keepScroll !== false;
    return Promise.all([fetchGotFlights(), fetchGotTrains()]).then(function () {
      renderFlode();
    });
  }

  function startFlodeLive() {
    stopFlodeLive();
    flodeLiveTimer = setInterval(function () {
      refreshFlodeLive({ keepScroll: true });
    }, FLODE_LIVE_MS);
  }

  function stopFlodeLive() {
    if (flodeLiveTimer) {
      clearInterval(flodeLiveTimer);
      flodeLiveTimer = null;
    }
  }

  function flodeRange() {
    var now = Date.now();
    return { now: now, from: now - flodeLookbackH * 3600000, to: now + flodeAheadH * 3600000 };
  }
  function inFlodeRange(item, r) {
    if (!item.sort) return flodeTab !== "summary";
    return item.sort >= r.from && item.sort <= r.to;
  }
  function flodePageY() {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  function saveFlodeScroll() {
    flodeScrollPos[flodeTab] = flodePageY();
  }
  function scrollFlodeToNow() {
    var box = $("flodeList");
    if (!box) return;
    var node = box.querySelector(".feed-item.feed-now") || box.querySelector(".feed-item");
    if (!node) return;
    var sticky = document.querySelector(".flode-sticky");
    var topBar = document.querySelector(".top-bar");
    var offset = (sticky ? sticky.getBoundingClientRect().height : 0) +
      (topBar ? topBar.getBoundingClientRect().height : 0) + 8;
    var y = node.getBoundingClientRect().top + flodePageY() - offset;
    window.scrollTo(0, Math.max(0, y));
  }
  function updateFlodeMoreBtns() {
    var past = $("flodeMorePast");
    var fut = $("flodeMoreFuture");
    if (!past || !fut) return;
    var y = flodePageY();
    var atTop = y <= 12;
    var atBot = y + window.innerHeight >= document.documentElement.scrollHeight - 16;
    past.disabled = !atTop || flodeLookbackH >= FLODE_MAX_BACK;
    fut.disabled = !atBot || flodeAheadH >= FLODE_MAX_AHEAD;
  }
  function feedSid(item) {
    return item.sid || (item.type + ":" + item.title + ":" + item.t);
  }
  function isStarred(item) {
    return feedStars.indexOf(feedSid(item)) >= 0;
  }
  function toggleStar(sid) {
    var i = feedStars.indexOf(sid);
    if (i >= 0) feedStars.splice(i, 1);
    else feedStars.push(sid);
    saveStars(feedStars);
  }

  var DEMO_FEED = [];


  function feedItemVisible(item) {
    if (item.type === "flyg") {
      if (item.dir === "ANK" && !feedPrefs.flygAnkomst) return false;
      if (item.dir === "AVG" && !feedPrefs.flygAvgang) return false;
      if (feedPrefs.flygDelayedOnly && !/\+|försen|delay/i.test(item.meta + " " + item.title)) return false;
      var dest = item.dest || (item.tags || []).filter(function (t) { return t.indexOf("dest") === 0; })[0];
      if (dest && feedPrefs[dest] === false) return false;
      if (item.apt && dest && feedPrefs[flygAptKey(dest, item.apt)] === false) return false;
      return true;
    }
    if (item.type === "tag") {
      if (item.dir === "ANK" && !feedPrefs.tagAnkomst) return false;
      if (item.dir === "AVG" && !feedPrefs.tagAvgang) return false;
      if (feedPrefs.tagSnabbtagOnly && !item.snabb) return false;
      if (item.dest && feedPrefs[item.dest] === false) return false;
      if (item.dest && item.kind && feedPrefs[trainKindKey(item.dest, item.kind)] === false) return false;
      return true;
    }
    return item.tags.some(function (tag) { return !!feedPrefs[tag]; });
  }

  function feedKindLabel(type) {
    return { trafik: "VÄG", bro: "BRO", event: "EVT", bat: "BÅT", tag: "TÅG", flyg: "FLY" }[type] || type;
  }

  function hisingsSlotsForDate(d) {
    var day = d.getDay();
    var weekend = day === 0 || day === 6;
    var month = d.getMonth() + 1;
    var summer = month === 7 || month === 8 || (month === 6 && d.getDate() >= 15);
    var slots = weekend
      ? ["05:35", "07:35", "09:35", "11:35", "14:35", "16:35", "18:35", "20:35"]
      : ["05:35", "09:35", "11:35", "14:35", "18:35", "20:35"];
    if (summer && slots.indexOf("13:35") < 0) slots.splice(weekend ? 4 : 3, 0, "13:35");
    return slots;
  }

  function upcomingBridgeItems() {
    var now = new Date();
    var r = flodeRange();
    var items = [];
    var days = Math.max(1, Math.ceil(flodeAheadH / 24) + 1);
    var backDays = Math.max(0, Math.ceil(flodeLookbackH / 24));
    for (var dayOff = -backDays; dayOff <= days; dayOff++) {
      var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOff);
      hisingsSlotsForDate(day).forEach(function (hhmm) {
        var p = hhmm.split(":");
        var when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +p[0], +p[1]);
        var ts = when.getTime();
        if (ts < r.from - 12 * 60000 || ts > r.to) return;
        var soon = ts - now.getTime() < 40 * 60000 && ts >= now.getTime();
        var label = dayOff < 0 ? "igår · " : dayOff > 0 ? "i morgon · " : "";
        items.push({
          t: hhmm,
          planT: "(" + hhmm + ")",
          type: "bro",
          dir: "",
          title: "Hisingsbron",
          city: "Göteborg",
          cityLine: "Göteborg SE",
          event: (soon ? "Snart · " : "") + "Öppning · 8–12 min",
          meta: label + "planerad öppning",
          tags: ["broHisingsbron"],
          sort: ts,
          sid: "bro:hising:" + day.toISOString().slice(0,10) + ":" + hhmm
        });
      });
    }

    return items.sort(function (a, b) { return a.sort - b.sort; });
  }


  function atHm(base, hm) {
    var p = String(hm).split(":");
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), +p[0], +p[1], 0, 0);
    return d;
  }

  function boatItem(when, dir, title, city, tag, extraMeta) {
    var t = pad2(when.getHours()) + ":" + pad2(when.getMinutes());
    return {
      t: t,
      planT: "(" + t + ")",
      delay: "",
      delayCls: "",
      type: "bat",
      dir: dir,
      title: title,
      city: city,
      cityLine: city,
      event: extraMeta || "Tidtabell",
      meta: city,
      extra: "",
      tags: [tag, dir === "AVG" ? "batAvgang" : "batAnkomst"],
      live: true,
      sort: when.getTime(),
      dest: tag,
      sid: "bat:" + title + ":" + when.toISOString()
    };
  }

  function upcomingBoatItems() {
    var out = [];
    var now = new Date();
    var days = [0, 1].map(function (off) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
    });
    days.forEach(function (day) {
      ["01:05", "09:00", "15:45", "18:30"].forEach(function (hm) {
        out.push(boatItem(atHm(day, hm), "AVG", "Stena Danmark", "Frederikshavn DK", "batDanmark"));
      });
      ["04:50", "12:35", "19:20", "22:05"].forEach(function (hm) {
        out.push(boatItem(atHm(day, hm), "ANK", "Stena Danmark", "Frederikshavn DK", "batDanmark"));
      });
      out.push(boatItem(atHm(day, "17:45"), "AVG", "Stena Kiel", "Kiel DE", "batTyskland"));
      out.push(boatItem(atHm(day, "09:15"), "ANK", "Stena Kiel", "Kiel DE", "batTyskland"));
    });
    var loop = new Date(now.getTime() - (now.getMinutes() % 20) * 60000);
    loop.setSeconds(0, 0);
    for (var i = -2; i < 20; i++) {
      var w = new Date(loop.getTime() + i * 20 * 60000);
      var hh = w.getHours();
      if (hh < 6 || hh > 23) continue;
      out.push(boatItem(w, "AVG", "Hönöleden", "Lilla Varholmen SE", "batVarholmen", "Ca 13 min"));
    }
    out.push({
      t: pad2(now.getHours()) + ":" + pad2(now.getMinutes()),
      planT: "",
      delay: "",
      type: "bat",
      dir: "",
      title: "Kornhalls färja",
      city: "Gunnesby–Kornhall",
      cityLine: "Gunnesby–Kornhall SE",
      event: "Går löpande · 2 min",
      meta: "Går löpande",
      extra: "",
      tags: ["batKornhall"],
      live: true,
      sort: now.getTime(),
      dest: "batKornhall",
      sid: "bat:kornhall:loop"
    });
    return out;
  }

  function renderFlode() {
    var titles = {
      summary: "Sammanfattning",
      star: "Sparat",
      bro: "Broar",
      event: "Event",
      bat: "Båt",
      tag: "Tåg",
      flyg: "Flyg"
    };
    $("flodeTitle").textContent = titles[flodeTab] || "Flöde";
    if ($("flodeLivePill")) {
      $("flodeLivePill").textContent = liveFlightMeta.status === "ok" ? "live flyg" : "tider";
    }
    document.querySelectorAll(".flode-icon").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-flode") === flodeTab);
    });
    var typeOn = { flyg: "showFlyg", tag: "showTag", bat: "showBat", bro: "showBro", event: "showEvent" };
    var r = flodeRange();
    var now = r.now;
    var demo = DEMO_FEED.filter(function (item) {
      if (item.type === "trafik") return false;
      if (item.type === "flyg" && liveFlightMeta.status === "ok") return false;
      if (item.type === "tag" && liveTrainMeta.status === "ok") return false;
      if (item.type === "bat") return false;
      if (item.type === "bro" && item.tags && item.tags[0] === "broHisingsbron") return false;
      if (!feedItemVisible(item)) return false;
      if (flodeTab === "star") return isStarred(item);
      if (flodeTab === "summary") {
        if (feedPrefs[typeOn[item.type]] === false) return false;
        return inFlodeRange(item, r);
      }
      if (item.type !== flodeTab) return false;
      return inFlodeRange(item, r);
    });
    var flights = liveFlightItems.filter(function (item) {
      if (!feedItemVisible(item)) return false;
      if (flodeTab === "star") return isStarred(item);
      if (flodeTab === "flyg") return inFlodeRange(item, r);
      if (flodeTab === "summary") {
        if (feedPrefs.showFlyg === false) return false;
        return inFlodeRange(item, r);
      }
      return false;
    });
    var trains = liveTrainItems.filter(function (item) {
      if (!feedItemVisible(item)) return false;
      if (flodeTab === "star") return isStarred(item);
      if (flodeTab === "tag") return inFlodeRange(item, r);
      if (flodeTab === "summary") {
        if (feedPrefs.showTag === false) return false;
        return inFlodeRange(item, r);
      }
      return false;
    });
    var bridges = upcomingBridgeItems().filter(function (item) {
      if (!feedItemVisible(item)) return false;
      if (flodeTab === "summary") return feedPrefs.showBro !== false;
      return flodeTab === "bro";
    });
    var boats = upcomingBoatItems().filter(function (item) {
      if (!feedItemVisible(item)) return false;
      if (flodeTab === "star") return isStarred(item);
      if (flodeTab === "bat") return inFlodeRange(item, r);
      if (flodeTab === "summary") {
        if (feedPrefs.showBat === false) return false;
        return inFlodeRange(item, r);
      }
      return false;
    });
    var items = bridges.concat(flights).concat(trains).concat(boats).concat(demo);
    items.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    lastFeedItems = items;
    var allStarred = items.length && items.every(function (it) { return isStarred(it); });
    var allBtn = $("flodeStarAllBtn");
    if (allBtn) {
      allBtn.classList.toggle("on", !!allStarred);
      allBtn.setAttribute("aria-label", allStarred ? "Rensa listan" : "Märk alla");
    }
    var box = $("flodeList");
    if (!items.length) {
      box.innerHTML = '<p class="empty-hint" style="padding:16px 0">Inget att visa med dina filter. Tryck Filter och välj vad du följer.</p>';
      updateFlodeMoreBtns();
      return;
    }
    box.innerHTML = items.map(function (item) {
      var sid = feedSid(item);
      var chips = '<span class="feed-chip ' + item.type + '">' + feedKindLabel(item.type) + "</span>";
      if (item.dir === "ANK") chips += '<span class="feed-chip ank">ANK</span>';
      if (item.dir === "AVG") chips += '<span class="feed-chip avg">AVG</span>';
      var extra = item.extra || "";
      var delayHtml = item.delay
        ? '<div class="feed-dev ' + (item.delayCls || "") + '">' + item.delay + "</div>"
        : "";
      return '<div class="feed-item" data-sid="' + sid.replace(/"/g, "") + '">' +
        '<div class="feed-left">' +
          '<div class="feed-time">' + (item.t || "") + "</div>" +
          (item.planT ? '<div class="feed-plan">' + item.planT + "</div>" : "") +
          delayHtml +
        "</div>" +
        "<div>" +
          '<div class="feed-title feed-chips">' + chips + '<span class="feed-id">' + item.title + '</span><span class="feed-now-tag" hidden>NÄSTA</span></div>' +
          '<div class="feed-meta">' + (item.cityLine || item.city || item.meta || "") + "</div>" +
          (item.event ? '<div class="feed-event">' + (item.eventHtml || item.event) + "</div>" : "") +
          '<div class="feed-extra">' + extra + "</div>" +
        "</div>" +
        '<button type="button" class="feed-star' + (isStarred(item) ? " on" : "") + '" data-star="' + sid.replace(/"/g, "") + '" aria-label="Spara">★</button>' +
        "</div>";
    }).join("");
    var focusIdx = -1;
    for (var fi = 0; fi < items.length; fi++) {
      if ((items[fi].sort || 0) >= now - 2 * 60000) { focusIdx = fi; break; }
    }
    if (focusIdx < 0 && items.length) focusIdx = items.length - 1;
    var nodes = box.querySelectorAll(".feed-item");
    if (nodes[focusIdx]) {
      nodes[focusIdx].classList.add("feed-now");
      var ntag = nodes[focusIdx].querySelector(".feed-now-tag");
      if (ntag) ntag.hidden = false;
    }
    requestAnimationFrame(function () {
      if (flodeKeepScroll && flodeScrollPos[flodeTab] != null) {
        window.scrollTo(0, flodeScrollPos[flodeTab]);
      } else if (flodePin === "bottom") {
        window.scrollTo(0, document.documentElement.scrollHeight);
      } else if (flodePin === "top") {
        window.scrollTo(0, 0);
      } else {
        scrollFlodeToNow();
      }
      flodeKeepScroll = false;
      flodePin = "now";
      updateFlodeMoreBtns();
    });
  }

  var filterOpen = {};

  function prefOn(key) {
    return feedPrefs[key] !== false;
  }
  function switchBtn(key, label) {
    return '<button type="button" class="switch' + (prefOn(key) ? " on" : "") +
      '" data-pref="' + key + '" aria-label="' + label + '"></button>';
  }
  function chevBtn(id) {
    var open = !!filterOpen[id];
    return '<button type="button" class="filter-chev" data-open="' + id +
      '" aria-expanded="' + (open ? "true" : "false") + '">' + (open ? "▾" : "▸") + "</button>";
  }
  function cmpSv(a, b) {
    return String(a).localeCompare(String(b), "sv");
  }

  function collectTrainTree(dir) {
    var cities = {};
    liveTrainItems.forEach(function (it) {
      if (it.dir !== dir) return;
      var key = it.dest || trainDestKey(it.city);
      var label = prettyTrainCity(it.city);
      if (!cities[key]) cities[key] = { key: key, label: label, kinds: {} };
      var kind = it.kind || "other";
      cities[key].kinds[kind] = (cities[key].kinds[kind] || 0) + 1;
    });
    return Object.keys(cities).map(function (k) { return cities[k]; }).sort(function (a, b) {
      return cmpSv(a.label, b.label);
    });
  }
  function collectFlightCities(dir) {
    var map = {};
    function add(city, apt) {
      var key = destKey(city + " " + (apt || ""));
      if (!map[key]) map[key] = { key: key, label: destLabel(key, city), apts: {} };
      if (apt) map[key].apts[apt] = true;
    }
    GOT_FLY_CATALOG.forEach(function (row) { add(row[0], row[1]); });
    seenFlyDest.forEach(function (row) { add(row.city, row.apt); });
    liveFlightItems.forEach(function (it) {
      if (dir && it.dir !== dir) return;
      add(it.city || destLabel(it.dest, it.dest), it.apt || "");
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return cmpSv(a.label, b.label);
    });
  }

  function filterRow(cls, left, key, label) {
    return '<div class="filter-row ' + (cls || "") + '"><div class="filter-left">' + left +
      "</div>" + switchBtn(key, label) + "</div>";
  }

  function renderFeedFilterBody() {
    var html = "";
    if (flodeTab === "summary") {
      [["showFlyg", "Visa flyg"], ["showTag", "Visa tåg"], ["showBat", "Visa båt"],
        ["showBro", "Visa broar"], ["showEvent", "Visa event"]].forEach(function (row) {
        html += filterRow("", "<span>" + row[1] + "</span>", row[0], row[1]);
      });
    } else if (flodeTab === "tag") {
      html += filterRow("", "<span>Bara snabbtåg</span>", "tagSnabbtagOnly", "Bara snabbtåg");
      [["tagAnkomst", "ANK", "Ankommande"], ["tagAvgang", "AVG", "Avgående"]].forEach(function (row) {
        var oid = "dir-" + row[1];
        var tree = collectTrainTree(row[1]);
        html += filterRow("", chevBtn(oid) + "<span>" + row[2] +
          '</span><span class="filter-count">' + tree.length + " orter</span>", row[0], row[2]);
        if (filterOpen[oid]) {
          tree.forEach(function (city) {
            var cid = oid + "-" + city.key;
            var kinds = Object.keys(city.kinds);
            html += filterRow("sub", (kinds.length > 1 ? chevBtn(cid) : "") + "<span>" + city.label +
              '</span><span class="filter-count">' + kinds.length + " typ</span>", city.key, city.label);
            if (filterOpen[cid] && kinds.length > 1) {
              kinds.sort(function (a, b) {
                return cmpSv(TRAIN_KIND_LABEL[a] || a, TRAIN_KIND_LABEL[b] || b);
              }).forEach(function (kind) {
                var lab = TRAIN_KIND_LABEL[kind] || kind;
                html += filterRow("sub2", "<span>" + lab + "</span>", trainKindKey(city.key, kind), lab);
              });
            }
          });
        }
      });
    } else if (flodeTab === "flyg") {
      html += filterRow("", "<span>Bara försenade</span>", "flygDelayedOnly", "Bara försenade");
      [["flygAnkomst", "ANK", "Ankommande"], ["flygAvgang", "AVG", "Avgående"]].forEach(function (row) {
        var oid = "fdir-" + row[1];
        var cities = collectFlightCities(row[1]);
        html += filterRow("", chevBtn(oid) + "<span>" + row[2] +
          '</span><span class="filter-count">' + cities.length + " orter</span>", row[0], row[2]);
        if (filterOpen[oid]) {
          cities.forEach(function (city) {
            var apts = Object.keys(city.apts || {});
            var cid = oid + "-" + city.key;
            html += filterRow("sub", (apts.length > 1 ? chevBtn(cid) : "") + "<span>" + city.label +
              "</span>", city.key, city.label);
            if (filterOpen[cid] && apts.length > 1) {
              apts.sort().forEach(function (apt) {
                html += filterRow("sub2", "<span>" + aptLabel(apt) + "</span>", flygAptKey(city.key, apt), apt);
              });
            }
          });
        }
      });
    } else if (flodeTab === "bro") {
      [["broHisingsbron", "Hisingsbron"], ["broJordfall", "Jordfallsbron"], ["broBohus", "Bohusbron"]].forEach(function (row) {
        html += filterRow("", "<span>" + row[1] + "</span>", row[0], row[1]);
      });
    } else if (flodeTab === "event") {
      [["eventUllevi", "Ullevi"], ["eventScandinavium", "Scandinavium"], ["eventMassan", "Svenska Mässan"]].forEach(function (row) {
        html += filterRow("", "<span>" + row[1] + "</span>", row[0], row[1]);
      });
    } else if (flodeTab === "bat") {
      [["batDanmark", "Stena Danmark"], ["batTyskland", "Stena Tyskland"],
        ["batSaltholmen", "Saltholmen"], ["batVarholmen", "Hönöleden"],
        ["batKornhall", "Kornhall"], ["batMarstrand", "Marstrand"]].forEach(function (row) {
        html += filterRow("", "<span>" + row[1] + "</span>", row[0], row[1]);
      });
    }
    return '<div class="filter-group" id="filterTree">' + html +
      '</div><p class="hint" style="margin-top:10px">Först ankomst/avgång, sedan ort. På tåg kan du fälla ut enskilda tågnummer.</p>';
  }

  function bindFeedFilter() {
    var tree = document.getElementById("filterTree");
    if (!tree) return;
    tree.onclick = function (e) {
      var chev = e.target.closest(".filter-chev");
      var sw = e.target.closest(".switch");
      if (chev) {
        e.preventDefault();
        var id = chev.getAttribute("data-open");
        filterOpen[id] = !filterOpen[id];
        tree.parentNode.innerHTML = renderFeedFilterBody();
        bindFeedFilter();
        return;
      }
      if (sw) {
        e.preventDefault();
        var key = sw.getAttribute("data-pref");
        feedPrefs[key] = !prefOn(key);
        sw.classList.toggle("on", prefOn(key));
        saveFeedPrefs();
      }
    };
  }

  function openFeedFilter() {
    var titles = {
      summary: "Visa i Allt",
      bro: "Broar",
      event: "Event",
      bat: "Båtar & färjor",
      tag: "Tåg",
      flyg: "Flyg"
    };
    openModal({
      title: titles[flodeTab] || "Filter",
      bodyHtml: renderFeedFilterBody(),
      okText: "Klar",
      cancelText: null
    }).then(function () {
      renderFlode();
    });
    setTimeout(bindFeedFilter, 30);
  }

  var trafikMap = null;
  var trafikMarkers = [];
  var GBG = { lat: 57.7089, lng: 11.9746 };

  function kmBetween(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function nearbyTraffic() {
    return liveTrafficItems.filter(function (it) {
      if (it.lat == null || it.lng == null) return false;
      return kmBetween(GBG, { lat: it.lat, lng: it.lng }) <= 28;
    });
  }

  function renderTrafikMap() {
    var list = $("trafikList");
    var near = nearbyTraffic();
    if (typeof L === "undefined") {
      if (list) list.innerHTML = "<p class=\"empty-hint\">Kartan kunde inte laddas (Leaflet).</p>";
      return;
    }
    if (!trafikMap) {
      trafikMap = L.map("trafikMap").setView([GBG.lat, GBG.lng], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap"
      }).addTo(trafikMap);
    }
    setTimeout(function () { trafikMap.invalidateSize(); }, 80);
    trafikMarkers.forEach(function (m) { trafikMap.removeLayer(m); });
    trafikMarkers = [];
    near.forEach(function (it) {
      var mk = L.marker([it.lat, it.lng]).addTo(trafikMap);
      mk.bindPopup("<strong>" + it.title + "</strong><br>" + it.meta);
      trafikMarkers.push(mk);
    });
    if (!list) return;
    if (!getTvKey()) {
      list.innerHTML = "<p class=\"empty-hint\">Live-karta för olyckor kommer i ett senare steg. Tåg och flyg i flödet uppdateras utan nyckel.</p>";
      return;
    }
    if (!near.length) {
      list.innerHTML = "<p class=\"empty-hint\">Inget inom ~3 mil just nu. (Hela länet kan fortfarande ha vägarbeten längre bort.)</p>";
      return;
    }
    list.innerHTML = near.map(function (it, i) {
      return '<div class="feed-item" data-idx="' + i + '">' +
        '<div class="feed-kind trafik">VÄG</div><div>' +
        '<div class="feed-title">' + it.title + "</div>" +
        '<div class="feed-meta">' + it.meta + "</div></div></div>";
    }).join("");
    list.querySelectorAll(".feed-item").forEach(function (row) {
      row.addEventListener("click", function () {
        var it = near[+row.getAttribute("data-idx")];
        if (!it || !trafikMap) return;
        trafikMap.setView([it.lat, it.lng], 13);
        trafikMarkers[+row.getAttribute("data-idx")].openPopup();
      });
    });
  }

  function layoutFlodeChrome() {
    var bar = document.querySelector(".top-bar");
    var sticky = document.querySelector(".flode-sticky");
    var root = document.documentElement;
    if (!document.body.classList.contains("flode-on")) {
      root.style.removeProperty("--topbar-h");
      root.style.removeProperty("--flode-chrome-h");
      return;
    }
    var bh = bar ? Math.ceil(bar.getBoundingClientRect().height) : 56;
    root.style.setProperty("--topbar-h", bh + "px");
    if (sticky) sticky.style.top = bh + "px";
    var sh = sticky ? Math.ceil(sticky.getBoundingClientRect().height) : 80;
    root.style.setProperty("--flode-chrome-h", (bh + sh) + "px");
  }
  window.addEventListener("resize", layoutFlodeChrome);
  function showView(name) {
    if (name !== "flode") stopFlodeLive();
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.remove("active");
    });
    var el = $("view-" + name);
    if (el) el.classList.add("active");
    var nav = $("navSkiftBtn");
    if (nav) nav.classList.toggle("active", name === "skift");
    var navF = $("navFlodeBtn");
    if (navF) navF.classList.toggle("active", name === "flode");
    var navT = $("navTrafikBtn");
    if (navT) navT.classList.toggle("active", name === "trafik");
    var actionBar = document.querySelector(".action-bar");
    if (actionBar) actionBar.style.display = name === "skift" ? "" : "none";
    document.body.classList.toggle("flode-on", name === "flode");
    layoutFlodeChrome();
    if (name === "flode") window.scrollTo(0, 0);
    if (name === "skift") renderHistory();
    if (name === "settings") {
      renderSettings();
      var keyIn = $("tvApiKeyInput");
      if (keyIn) keyIn.value = getTvKey();
    }
    if (name === "flode") {
      renderFlode();
      startFlodeLive();
      refreshFlodeLive({ keepScroll: false });
    }
    if (name === "trafik") {
      fetchLiveTraffic().then(function () {
        renderTrafikMap();
      });
    }
  }

  $("navSkiftBtn").addEventListener("click", function () {
    showView("skift");
  });
  $("navFlodeBtn").addEventListener("click", function () {
    showView("flode");
  });
  $("navTrafikBtn").addEventListener("click", function () {
    showView("trafik");
  });
  document.querySelectorAll(".flode-icon").forEach(function (btn) {
    btn.addEventListener("click", function () {
      saveFlodeScroll();
      flodeTab = btn.getAttribute("data-flode") || "summary";
      flodeKeepScroll = true;
      renderFlode();
    });
  });
  $("flodeFilterBtn").addEventListener("click", openFeedFilter);
  $("flodeStarAllBtn").addEventListener("click", function () {
    var allOn = lastFeedItems.length && lastFeedItems.every(function (item) { return isStarred(item); });
    if (allOn) {
      var drop = {};
      lastFeedItems.forEach(function (item) { drop[feedSid(item)] = true; });
      feedStars = feedStars.filter(function (sid) { return !drop[sid]; });
    } else {
      lastFeedItems.forEach(function (item) {
        var sid = feedSid(item);
        if (feedStars.indexOf(sid) < 0) feedStars.push(sid);
      });
    }
    saveStars(feedStars);
    flodeKeepScroll = true;
    renderFlode();
  });
  $("flodeRefreshBtn").addEventListener("click", function () {
    flodeLookbackH = 1;
    flodeAheadH = 12;
    flodeKeepScroll = false;
    flodePin = "now";
    Promise.all([fetchGotFlights(), fetchGotTrains()]).then(renderFlode);
  });
  if ($("flodeNowBtn")) {
    $("flodeNowBtn").addEventListener("click", function () {
      flodeKeepScroll = false;
      flodePin = "now";
      renderFlode();
      scrollFlodeToNow();
    });
  }
  if ($("flodeMorePast")) {
    $("flodeMorePast").addEventListener("click", function () {
      if (flodeLookbackH >= FLODE_MAX_BACK) return;
      flodeLookbackH += 1;
      flodeKeepScroll = false;
      flodePin = "top";
      renderFlode();
    });
  }
  if ($("flodeMoreFuture")) {
    $("flodeMoreFuture").addEventListener("click", function () {
      if (flodeAheadH >= FLODE_MAX_AHEAD) return;
      flodeAheadH += 1;
      flodeKeepScroll = false;
      flodePin = "bottom";
      renderFlode();
    });
  }
  window.addEventListener("scroll", function () {
    if (document.body.classList.contains("flode-on")) updateFlodeMoreBtns();
  }, { passive: true });
  $("flodeList").addEventListener("click", function (e) {
    var star = e.target.closest("[data-star]");
    if (star) {
      e.stopPropagation();
      toggleStar(star.getAttribute("data-star"));
      saveFlodeScroll();
      flodeKeepScroll = true;
      renderFlode();
      return;
    }
    var row = e.target.closest(".feed-item");
    if (!row) return;
    var rutt = e.target.closest(".rutt");
    if (rutt && row.classList.contains("open")) {
      toggleTrainRutt(row);
      return;
    }
    var opening = !row.classList.contains("open");
    row.classList.toggle("open");
    if (!opening) {
      row.classList.remove("rutt-open");
      var rr = row.querySelector(".rutt");
      if (rr) rr.classList.add("collapsed");
    } else {
      prefetchTrainRoute(row);
    }
  });
  if ($("trafikRefreshBtn")) {
    $("trafikRefreshBtn").addEventListener("click", function () {
      fetchLiveTraffic().then(renderTrafikMap);
    });
  }
  if ($("saveTvKeyBtn")) {
    $("saveTvKeyBtn").addEventListener("click", function () {
      setTvKey($("tvApiKeyInput").value);
      toast("Nyckel sparad på den här enheten");
    });
  }

  var FONT_STORE = "taxikit-font-scale";
  function applyFontScale(size) {
    var ok = { sm: 1, md: 1, lg: 1, xl: 1 };
    size = ok[size] ? size : "md";
    document.documentElement.setAttribute("data-font", size);
    try { localStorage.setItem(FONT_STORE, size); } catch (e) {}
    document.querySelectorAll("#fontSizeRow [data-font]").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-font") === size);
    });
  }
  applyFontScale((function () {
    try { return localStorage.getItem(FONT_STORE) || "md"; } catch (e) { return "md"; }
  })());
  if ($("fontSizeRow")) {
    $("fontSizeRow").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-font]");
      if (btn) applyFontScale(btn.getAttribute("data-font"));
    });
  }

  $("accountChip").addEventListener("click", function () {
    showView("settings");
  });

  $("backToSkiftBtn").addEventListener("click", function () {
    showView("skift");
  });

  $("openAboutBtn").addEventListener("click", function () {
    showView("about");
  });

  $("backFromAboutBtn").addEventListener("click", function () {
    showView("settings");
  });

  // History mode pills
  document.querySelectorAll(".mode-pill").forEach(function (pill) {
    pill.addEventListener("click", function () {
      setHistoryMode(pill.dataset.mode);
    });
  });

  // History day
  $("historyDate").addEventListener("change", renderHistory);
  $("histDayPrev").addEventListener("click", function () {
    var input = $("historyDate");
    input.value = shiftDateKey(input.value || toDateKey(new Date()), -1);
    renderHistory();
  });
  $("histDayNext").addEventListener("click", function () {
    if (this.disabled) return;
    var input = $("historyDate");
    var next = shiftDateKey(input.value || toDateKey(new Date()), 1);
    var todayKey = toDateKey(new Date());
    if (next > todayKey) return;
    input.value = next;
    renderHistory();
  });
  $("historyTodayBtn").addEventListener("click", function () {
    $("historyDate").value = effectiveTodayKey();
    renderHistory();
  });

  // History week
  $("histWeekSelect").addEventListener("change", function () {
    var d = parseWeekKey($("histWeekSelect").value);
    if (d) {
      histWeekRef = d;
      renderHistory();
    }
  });
  $("histWeekPrev").addEventListener("click", function () {
    histWeekRef = shiftWeek(histWeekRef, -1);
    renderHistory();
  });
  $("histWeekNext").addEventListener("click", function () {
    if (this.disabled) return;
    var next = shiftWeek(histWeekRef, 1);
    if (weekKeyFromDate(next) > weekKeyFromDate(new Date())) return;
    histWeekRef = next;
    renderHistory();
  });
  $("histWeekNowBtn").addEventListener("click", function () {
    histWeekRef = startOfISOWeek(new Date());
    renderHistory();
  });

  // History month
  $("histMonthSelect").addEventListener("change", function () {
    var d = parseMonthKey($("histMonthSelect").value);
    if (d) {
      histMonthRef = d;
      renderHistory();
    }
  });
  $("histMonthPrev").addEventListener("click", function () {
    histMonthRef = shiftMonth(histMonthRef, -1);
    renderHistory();
  });
  $("histMonthNext").addEventListener("click", function () {
    if (this.disabled) return;
    var next = shiftMonth(histMonthRef, 1);
    if (monthKeyFromDate(next) > monthKeyFromDate(new Date())) return;
    histMonthRef = next;
    renderHistory();
  });
  $("histMonthNowBtn").addEventListener("click", function () {
    histMonthRef = startOfMonth(new Date());
    renderHistory();
  });

  $("historyList").addEventListener("click", function (e) {
    // Week/month: click a day row → jump to that day in Dag view
    var dayRow = e.target.closest(".day-row");
    if (dayRow && dayRow.dataset.dayKey) {
      $("historyDate").value = dayRow.dataset.dayKey;
      setHistoryMode("day");
      return;
    }

    // Day view: open shift for editing
    var item = e.target.closest(".day-report-card, .shift-item");
    if (!item) return;
    if (historyMode !== "day") return;
    if (item.dataset.active) {
      toast("Avsluta skiftet via knappen Avsluta skift");
      return;
    }
    var shiftId = item.dataset.shiftId;
    if (shiftId) openEditShift(shiftId);
  });

  $("exportBtn").addEventListener("click", function () {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      weekGoal: state.weekGoal,
      monthGoal: state.monthGoal,
      activeShift: state.activeShift,
      shifts: state.shifts
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "taxigbg-backup-" + toDateKey(new Date()) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("JSON exporterad");
  });

  $("importBtn").addEventListener("click", function () {
    $("importFile").click();
  });

  $("importFile").addEventListener("change", async function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      var text = await file.text();
      var data = JSON.parse(text);
      if (!data || !Array.isArray(data.shifts)) {
        toast("Ogiltig fil");
        return;
      }
      var ok = await openModal({
        mode: "confirm",
        title: "Importera backup?",
        bodyHtml: "<p>All nuvarande data ersätts med innehållet i filen.</p>",
        okText: "Importera",
        okClass: "danger",
        cancelText: "Avbryt"
      });
      if (!ok) return;
      state = {
        weekGoal: Number(data.weekGoal) || DEFAULT_STATE.weekGoal,
        monthGoal: Number(data.monthGoal) || DEFAULT_STATE.monthGoal,
        activeShift: data.activeShift || null,
        shifts: data.shifts.map(function (s) {
          return {
            id: s.id || uid(),
            start: s.start,
            end: s.end || null,
            amount: s.amount != null ? Number(s.amount) : null,
            breaks: Array.isArray(s.breaks) ? s.breaks : [],
            updatedAt: s.updatedAt || Date.now()
          };
        }).filter(function (s) { return s.start; }),
        _metaUpdatedAt: Date.now()
      };
      saveState();
      renderAll();
      if (isActive()) startTick();
      else stopTick();
      toast("Import klar");
    } catch (err) {
      toast("Kunde inte läsa filen");
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      renderAll();
      if (fbUser && navigator.onLine) scheduleCloudSync();
    }
  });

  window.addEventListener("online", function () {
    if (fbUser) fullCloudSync(false);
    renderAccountUI();
  });

  window.addEventListener("offline", function () {
    renderAccountUI();
  });

  $("reportCloseBtn").addEventListener("click", closeReportCard);
  $("reportCloseBtn2").addEventListener("click", closeReportCard);
  $("reportPrintBtn").addEventListener("click", exportReportPdf);
  $("reportImageBtn").addEventListener("click", function () {
    exportReportImage();
  });

  // Init
  $("historyDate").value = effectiveTodayKey();
  renderAll();
  if (isActive()) startTick();
  initFirebase();
})();
