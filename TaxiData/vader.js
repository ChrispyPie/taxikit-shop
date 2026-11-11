/* Väder: karta över Västsverige. Allt (Leaflet, rutor, data) laddas först när sidan öppnas.
 * Lager: nederbörd (SMHI-radar, sista timmen), blixt (SMHI öppna data),
 * vind och temperatur (Open-Meteo, grovt rutnät). Ingen nyckel.
 * Ångra: ta bort den här filen, vader.css och posten i menyn/lazy-views. */
(function () {
  'use strict';

  var V = window.VADER = window.VADER || {};
  V.id = 'vader';
  V.title = 'Väder';
  V.icon = '🌦️';

  var GBG = [57.7089, 11.9746];
  var LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
  var RADAR_LIST = 'https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp/{y}/{m}/{d}';
  var BLIXT = 'https://opendata-download-lightning.smhi.se/api/version/latest/year/{y}/month/{m}/day/{d}/data.csv';
  var METEO = 'https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&current=temperature_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms';

  // SMHI-kompositen är i SWEREF99 TM (EPSG:3006). 471×887, 2014.96 m/px.
  var RADAR_E0 = 126648.404, RADAR_N0 = 7771252.876, RADAR_SC = 2014.9581656050955, RADAR_W = 471, RADAR_H = 887;
  var A = 6378137.0, F = 1 / 298.257222101, E2 = F * (2 - F), K0 = 0.9996, LON0 = 15 * Math.PI / 180, FE = 500000, FN = 0;
  var MERC = 20037508.34;

  var st = { el: null, map: null, layers: { nederbord: true, blixt: false, vind: false, temperatur: false },
    radar: null, blixt: null, grid: null, timer: null, frame: 0, warped: [], lookup: null, dest: null, loadTok: 0 };

  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function reduceMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function cacheGet(key, ttl) {
    try {
      var o = JSON.parse(sessionStorage.getItem(key) || '');
      if (o && o.at && Date.now() - o.at < ttl && o.data != null) return o.data;
    } catch (e) {}
    return null;
  }
  function cacheSet(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
  }

  function llToTm(lat, lon) {
    lat = lat * Math.PI / 180; lon = lon * Math.PI / 180;
    var N = A / Math.sqrt(1 - E2 * Math.sin(lat) * Math.sin(lat));
    var T = Math.tan(lat) * Math.tan(lat);
    var C = (E2 / (1 - E2)) * Math.cos(lat) * Math.cos(lat);
    var AA = (lon - LON0) * Math.cos(lat);
    var e4 = E2 * E2, e6 = e4 * E2;
    var M = A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat
      - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * lat)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * lat)
      - (35 * e6 / 3072) * Math.sin(6 * lat));
    var E = FE + K0 * N * (AA + (1 - T + C) * AA * AA * AA / 6
      + (5 - 18 * T + T * T + 72 * C - 58 * (E2 / (1 - E2))) * Math.pow(AA, 5) / 120);
    var North = FN + K0 * (M + N * Math.tan(lat) * (AA * AA / 2
      + (5 - T + 9 * C + 4 * C * C) * Math.pow(AA, 4) / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * (E2 / (1 - E2))) * Math.pow(AA, 6) / 720));
    return { e: E, n: North };
  }
  function tmToLl(E, N) {
    var e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    var M = (N - FN) / K0;
    var mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256));
    var phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);
    var e2p = E2 / (1 - E2);
    var C1 = e2p * Math.cos(phi1) * Math.cos(phi1);
    var T1 = Math.tan(phi1) * Math.tan(phi1);
    var N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) * Math.sin(phi1));
    var R1 = A * (1 - E2) / Math.pow(1 - E2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
    var D = (E - FE) / (N1 * K0);
    var lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2p) * Math.pow(D, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2p - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lon = LON0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2p + 24 * T1 * T1) * Math.pow(D, 5) / 120) / Math.cos(phi1);
    return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
  }
  function toMerc(lat, lon) {
    return { x: lon * MERC / 180, y: Math.log(Math.tan((90 + lat) * Math.PI / 360)) * MERC / Math.PI };
  }
  function fromMerc(x, y) {
    var lon = (x / MERC) * 180;
    var lat = (y / MERC) * 180;
    lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return { lat: lat, lon: lon };
  }
  function radarCorners() {
    var c = [
      tmToLl(RADAR_E0, RADAR_N0),
      tmToLl(RADAR_E0 + RADAR_W * RADAR_SC, RADAR_N0),
      tmToLl(RADAR_E0, RADAR_N0 - RADAR_H * RADAR_SC),
      tmToLl(RADAR_E0 + RADAR_W * RADAR_SC, RADAR_N0 - RADAR_H * RADAR_SC)
    ];
    return c;
  }
  function radarPixel(lat, lon) {
    var t = llToTm(lat, lon);
    return { x: (t.e - RADAR_E0) / RADAR_SC, y: (RADAR_N0 - t.n) / RADAR_SC };
  }
  V.radarPixel = radarPixel;

  function destBox() {
    if (st.dest) return st.dest;
    var cs = radarCorners(), i, m, xs = [], ys = [];
    for (i = 0; i < 4; i++) { m = toMerc(cs[i].lat, cs[i].lon); xs.push(m.x); ys.push(m.y); }
    var west = Math.min.apply(null, xs), east = Math.max.apply(null, xs);
    var south = Math.min.apply(null, ys), north = Math.max.apply(null, ys);
    var w = 360, h = Math.max(280, Math.round(w * (north - south) / (east - west)));
    var sw = fromMerc(west, south), ne = fromMerc(east, north);
    st.dest = { w: w, h: h, west: west, east: east, south: south, north: north,
      bounds: [[sw.lat, sw.lon], [ne.lat, ne.lon]] };
    return st.dest;
  }
  function buildLookup() {
    if (st.lookup) return st.lookup;
    var d = destBox(), n = d.w * d.h, ix = new Int32Array(n), i, x, y, ll, t, px, py, src;
    for (y = 0; y < d.h; y++) {
      for (x = 0; x < d.w; x++) {
        ll = fromMerc(d.west + (x + 0.5) / d.w * (d.east - d.west),
          d.north - (y + 0.5) / d.h * (d.north - d.south));
        t = llToTm(ll.lat, ll.lon);
        px = (t.e - RADAR_E0) / RADAR_SC;
        py = (RADAR_N0 - t.n) / RADAR_SC;
        i = y * d.w + x;
        if (px < 0 || py < 0 || px >= RADAR_W - 1 || py >= RADAR_H - 1) { ix[i] = -1; continue; }
        src = (Math.round(py) * RADAR_W + Math.round(px)) * 4;
        ix[i] = src;
      }
    }
    st.lookup = ix;
    return ix;
  }
  function warpImage(img) {
    var d = destBox(), look = buildLookup();
    var srcC = document.createElement('canvas');
    srcC.width = RADAR_W; srcC.height = RADAR_H;
    var sctx = srcC.getContext('2d');
    sctx.drawImage(img, 0, 0);
    var src = sctx.getImageData(0, 0, RADAR_W, RADAR_H).data;
    var outC = document.createElement('canvas');
    outC.width = d.w; outC.height = d.h;
    var octx = outC.getContext('2d');
    var out = octx.createImageData(d.w, d.h), dst = out.data;
    var i, s, n = d.w * d.h;
    for (i = 0; i < n; i++) {
      s = look[i];
      if (s < 0) continue;
      dst[i * 4] = src[s];
      dst[i * 4 + 1] = src[s + 1];
      dst[i * 4 + 2] = src[s + 2];
      dst[i * 4 + 3] = src[s + 3];
    }
    octx.putImageData(out, 0, 0);
    return outC.toDataURL('image/png');
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.L && window.L.map) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('leaflet')); };
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    if (document.querySelector('link[data-vd-leaflet]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-vd-leaflet', '1');
    document.head.appendChild(l);
  }

  function ymdUtc(d) { return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() }; }
  function fillUrl(tpl, p) {
    return tpl.replace('{y}', p.y).replace('{m}', p2(p.m)).replace('{d}', p2(p.day))
      .replace('{lats}', p.lats || '').replace('{lons}', p.lons || '');
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }
  function fetchText(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (r.status === 404) return '';
      if (!r.ok) throw new Error('http ' + r.status);
      return r.text();
    });
  }
  function loadImg(url) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('img')); };
      im.src = url;
    });
  }

  function radarFiles() {
    var cached = cacheGet('taxi_vader_radar', 5 * 60 * 1000);
    if (cached) return Promise.resolve(cached);
    var now = new Date(), days = [ymdUtc(now)];
    var yest = new Date(now.getTime() - 24 * 3600 * 1000);
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 70) days.push(ymdUtc(yest));
    return Promise.all(days.map(function (d) {
      return fetchJson(fillUrl(RADAR_LIST, d)).catch(function () { return { files: [] }; });
    })).then(function (js) {
      var items = [], i, f, fmt, png, t;
      js.forEach(function (j) {
        (j.files || []).forEach(function (file) {
          fmt = (file.formats || []).filter(function (x) { return x.key === 'png'; })[0];
          if (!fmt || !fmt.link) return;
          t = Date.parse(String(file.valid || '').replace(' ', 'T') + 'Z');
          if (!isFinite(t)) return;
          items.push({ t: t, url: fmt.link, valid: file.valid });
        });
      });
      items.sort(function (a, b) { return a.t - b.t; });
      var cut = Date.now() - 70 * 60 * 1000;
      var last = items.filter(function (x) { return x.t >= cut; });
      if (last.length < 3) last = items.slice(-12);
      else last = last.slice(-12);
      cacheSet('taxi_vader_radar', last);
      return last;
    });
  }

  function parseBlixt(csv) {
    var lines = String(csv || '').split(/\r?\n/), out = [], i, p, lat, lon, y, mo, d, h, mi, s, t;
    for (i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      p = lines[i].split(';');
      if (p.length < 10) continue;
      y = +p[1]; mo = +p[2]; d = +p[3]; h = +p[4]; mi = +p[5]; s = +p[6];
      lat = +p[8]; lon = +p[9];
      if (!isFinite(lat) || !isFinite(lon)) continue;
      t = Date.UTC(y, mo - 1, d, h, mi, s || 0);
      out.push({ lat: lat, lon: lon, t: t });
    }
    return out;
  }
  function blixtItems() {
    var cached = cacheGet('taxi_vader_blixt', 5 * 60 * 1000);
    if (cached) return Promise.resolve(cached);
    var now = new Date(), days = [ymdUtc(now), ymdUtc(new Date(now.getTime() - 24 * 3600 * 1000))];
    return Promise.all(days.map(function (d) { return fetchText(fillUrl(BLIXT, d)); }))
      .then(function (txts) {
        var all = parseBlixt(txts[0]).concat(parseBlixt(txts[1]));
        var cut = Date.now() - 3 * 3600 * 1000;
        var recent = all.filter(function (x) { return x.t >= cut; });
        cacheSet('taxi_vader_blixt', recent);
        return recent;
      });
  }

  function gridPoints() {
    var lats = [56.7, 57.15, 57.71, 58.25, 58.7];
    var lons = [11.2, 11.85, 12.5, 13.15];
    var out = [], i, j;
    for (i = 0; i < lats.length; i++) for (j = 0; j < lons.length; j++) out.push({ lat: lats[i], lon: lons[j] });
    return out;
  }
  function meteoGrid() {
    var cached = cacheGet('taxi_vader_grid', 15 * 60 * 1000);
    if (cached) return Promise.resolve(cached);
    var pts = gridPoints();
    var url = fillUrl(METEO, {
      y: 0, m: 0, day: 0,
      lats: pts.map(function (p) { return p.lat; }).join(','),
      lons: pts.map(function (p) { return p.lon; }).join(',')
    });
    return fetchJson(url).then(function (arr) {
      if (!Array.isArray(arr)) arr = [arr];
      var out = arr.map(function (r) {
        var c = r && r.current || {};
        return { lat: r.latitude, lon: r.longitude, temp: c.temperature_2m, wind: c.wind_speed_10m, dir: c.wind_direction_10m };
      });
      cacheSet('taxi_vader_grid', out);
      return out;
    });
  }

  function hmStockholm(ms) {
    try {
      return new Date(ms).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      var d = new Date(ms + 60 * 60 * 1000);
      return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
    }
  }
  function setMeta(text) {
    var el = st.el && st.el.querySelector('.vd-time');
    if (el) el.textContent = text || '';
  }

  function ensureMap() {
    if (st.map) return st.map;
    var box = st.el.querySelector('.vd-map');
    st.map = window.L.map(box, { zoomControl: true, attributionControl: true }).setView(GBG, 8);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, minZoom: 6,
      attribution: '&copy; OpenStreetMap'
    }).addTo(st.map);
    setTimeout(function () { try { st.map.invalidateSize(); } catch (e) {} }, 80);
    setTimeout(function () { try { st.map.invalidateSize(); } catch (e) {} }, 400);
    return st.map;
  }

  function clearLayerGroup(name) {
    if (st[name] && st.map) { try { st.map.removeLayer(st[name]); } catch (e) {} }
    st[name] = null;
  }
  function stopRadarAnim() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }

  function showRadarFrame() {
    if (!st.radar || !st.warped.length) return;
    var i = st.frame % st.warped.length;
    var it = st.warped[i];
    st.radar.setUrl(it.url);
    setMeta('Nederbörd kl ' + hmStockholm(it.t));
  }
  function startRadarAnim() {
    stopRadarAnim();
    if (st.warped.length < 2 || reduceMotion() || !st.layers.nederbord) { if (st.warped.length) showRadarFrame(); return; }
    st.timer = setInterval(function () {
      if (document.hidden || !st.layers.nederbord) return;
      st.frame = (st.frame + 1) % st.warped.length;
      showRadarFrame();
    }, 450);
  }

  function applyRadar(files) {
    if (!st.layers.nederbord) { clearLayerGroup('radar'); stopRadarAnim(); return; }
    var map = ensureMap();
    var tok = ++st.loadTok;
    setMeta('Hämtar radar…');
    var d = destBox();
    Promise.all(files.map(function (f) {
      return loadImg(f.url).then(function (img) { return { t: f.t, url: warpImage(img) }; }).catch(function () { return null; });
    })).then(function (frames) {
      if (tok !== st.loadTok) return;
      frames = frames.filter(Boolean);
      st.warped = frames;
      st.frame = frames.length ? frames.length - 1 : 0;
      if (!frames.length) { setMeta('Kunde inte hämta radarn just nu.'); return; }
      if (st.radar) st.radar.setUrl(frames[st.frame].url);
      else {
        st.radar = window.L.imageOverlay(frames[st.frame].url, d.bounds, { opacity: 0.72, interactive: false });
        st.radar.addTo(map);
      }
      startRadarAnim();
      showRadarFrame();
    }).catch(function () { if (tok === st.loadTok) setMeta('Kunde inte hämta radarn just nu.'); });
  }

  function applyBlixt(items) {
    clearLayerGroup('blixtLayer');
    if (!st.layers.blixt) return;
    var map = ensureMap();
    var g = window.L.layerGroup();
    (items || []).forEach(function (s) {
      window.L.circleMarker([s.lat, s.lon], {
        radius: 4, color: '#facc15', weight: 1, fillColor: '#f59e0b', fillOpacity: 0.85
      }).addTo(g);
    });
    st.blixtLayer = g;
    g.addTo(map);
    if (!st.layers.nederbord) {
      setMeta(items && items.length ? (items.length + ' blixtar senaste 3 timmarna') : 'Inga blixtar senaste timmarna');
    }
  }

  function tempColor(t) {
    if (t == null || !isFinite(t)) return '#94a3b8';
    if (t <= -5) return '#1e3a8a';
    if (t <= 0) return '#3b82f6';
    if (t <= 5) return '#67e8f9';
    if (t <= 10) return '#86efac';
    if (t <= 15) return '#fde047';
    if (t <= 20) return '#fb923c';
    return '#ef4444';
  }
  function applyGrid(pts) {
    clearLayerGroup('gridLayer');
    if (!st.layers.vind && !st.layers.temperatur) return;
    var map = ensureMap();
    var g = window.L.layerGroup();
    (pts || []).forEach(function (p) {
      if (st.layers.temperatur && p.temp != null) {
        var lab = window.L.divIcon({ className: 'vd-tlab', html: Math.round(p.temp) + '°', iconSize: [28, 16], iconAnchor: [14, 8] });
        var m = window.L.marker([p.lat, p.lon], { icon: lab, interactive: false });
        if (m._icon) m._icon.style.background = tempColor(p.temp);
        m.on('add', function () { if (this._icon) this._icon.style.background = tempColor(p.temp); });
        m.addTo(g);
      }
      if (st.layers.vind && p.dir != null) {
        var rot = (p.dir || 0); // meteorological: direction FROM; arrow should point where the wind goes = dir+180
        var html = '<div class="vd-arrow" style="transform:rotate(' + (rot + 180) + 'deg)" title="' + (p.wind != null ? p.wind.toFixed(1) + ' m/s' : '') + '"><i></i></div>';
        window.L.marker([p.lat, p.lon], {
          icon: window.L.divIcon({ className: '', html: html, iconSize: [28, 28], iconAnchor: [14, 14] }),
          interactive: false
        }).addTo(g);
      }
    });
    st.gridLayer = g;
    g.addTo(map);
    if (!st.layers.nederbord && !st.layers.blixt && pts && pts[0] && pts[0].temp != null) {
      setMeta('Just nu omkring ' + Math.round(pts[0].temp) + '°');
    }
  }

  function refreshLayers() {
    if (!st.map && !(st.layers.nederbord || st.layers.blixt || st.layers.vind || st.layers.temperatur)) return;
    ensureMap();
    if (st.layers.nederbord) {
      radarFiles().then(applyRadar).catch(function () { setMeta('Kunde inte hämta radarn just nu.'); });
    } else { clearLayerGroup('radar'); stopRadarAnim(); st.warped = []; }
    if (st.layers.blixt) {
      blixtItems().then(applyBlixt).catch(function () { applyBlixt([]); setMeta('Kunde inte hämta blixtarna just nu.'); });
    } else clearLayerGroup('blixtLayer');
    if (st.layers.vind || st.layers.temperatur) {
      meteoGrid().then(applyGrid).catch(function () { if (!st.layers.nederbord) setMeta('Kunde inte hämta vind och temperatur just nu.'); });
    } else clearLayerGroup('gridLayer');
  }

  function onChip(id) {
    st.layers[id] = !st.layers[id];
    if (!st.layers.nederbord && !st.layers.blixt && !st.layers.vind && !st.layers.temperatur) {
      st.layers[id] = true; // minst ett lager
    }
    paintChips();
    refreshLayers();
  }
  function paintChips() {
    if (!st.el) return;
    var ids = [['nederbord', 'Nederbörd'], ['blixt', 'Blixt'], ['vind', 'Vind'], ['temperatur', 'Temperatur']];
    var box = st.el.querySelector('.vd-chips');
    box.innerHTML = ids.map(function (x) {
      return '<button type="button" class="vd-chip" data-vd="' + x[0] + '" aria-pressed="' + (st.layers[x[0]] ? 'true' : 'false') + '">' + x[1] + '</button>';
    }).join('');
  }

  function shell() {
    return '<div class="vd">' +
      '<div class="vd-chips" role="group" aria-label="Kartlager"></div>' +
      '<div class="vd-map" role="application" aria-label="Väderkarta"></div>' +
      '<div class="vd-meta"><span class="vd-time"></span><span class="vd-cred">Data: SMHI, Open-Meteo. Karta: OpenStreetMap.</span></div>' +
      '</div>';
  }

  V.render = function (el) {
    st.el = el;
    el.innerHTML = shell();
    paintChips();
    el.onclick = function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-vd]');
      if (!b) return;
      onChip(b.getAttribute('data-vd'));
    };
    setMeta('Laddar karta…');
    loadCss(LEAFLET_CSS);
    loadScript(LEAFLET_JS).then(function () {
      if (!st.el) return;
      ensureMap();
      refreshLayers();
    }).catch(function () {
      setMeta('');
      if (st.el) {
        var m = st.el.querySelector('.vd-map');
        if (m) m.innerHTML = '<p class="vd-msg">Kartan kunde inte laddas. Kontrollera nätet och försök igen.</p>';
      }
    });
  };

  V.stop = function () {
    stopRadarAnim();
    st.loadTok++;
    if (st.map) { try { st.map.remove(); } catch (e) {} }
    st.map = null; st.radar = null; st.blixtLayer = null; st.gridLayer = null;
    st.warped = []; st.el = null;
  };

  // För TESTVY / enhetstester.
  V.parseBlixt = parseBlixt;
  V.gridPoints = gridPoints;
  V.fillUrl = fillUrl;
  V.llToTm = llToTm;
  V.tmToLl = tmToLl;
  V.layers = function () { return st.layers; };
  V.previewStrikes = function (items) { applyBlixt(items || []); };
})();
