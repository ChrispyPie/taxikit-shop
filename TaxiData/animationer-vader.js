/* Väderanimation på samma överlager som Animationer.
 * Hämtar nuvarande nederbörd från Open-Meteo current (inte dagsprognos eller sannolikhet).
 * Ingen nyckel. Cachas 20 minuter i localStorage 'taxi_animationer_vader_v2'.
 * Plats: enhetens läge om tillstånd redan finns, eller efter en artig fråga en gång;
 * annars centrala Göteborg. Koordinater avrundas till ~1 km. Sparas inte på servern.
 * Samma inställning Animationer.
 * Ångra: ta bort den här filen och script-taggen. */
(function () {
  'use strict';
  var CACHE_KEY = 'taxi_animationer_vader_v2';
  var GEO_ASK_KEY = 'taxi_animationer_vader_plats';
  var TTL_MS = 20 * 60 * 1000;
  var GBG = { lat: 57.71, lon: 11.97 };
  var METEO = 'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,precipitation,weather_code,rain,showers,snowfall&timezone=Europe%2FStockholm';
  var timer = null;
  var started = false;
  var asking = false;

  function num(v) {
    if (v == null || v === 9999) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // Avrunda till 2 decimaler (~1 km i lat, ~0,6 km i lon vid Göteborg).
  function roundCoord(lat, lon) {
    function r(v) {
      var n = Number(v);
      if (!isFinite(n)) return null;
      return Math.round(n * 100) / 100;
    }
    return { lat: r(lat), lon: r(lon) };
  }

  // Open-Meteo current: visa bara om det faktiskt faller nederbörd just nu.
  // weather_code används bara för typ (regn/snö/snöblandat), inte för att slå på animationen.
  function kindFrom(data) {
    if (!data || typeof data !== 'object') return '';
    var precip = num(data.precipitation);
    var rain = num(data.rain);
    var showers = num(data.showers);
    var snow = num(data.snowfall);
    var code = num(data.weather_code);
    var amount = precip;
    if (amount == null) {
      amount = (rain || 0) + (showers || 0);
      if (snow != null && snow > 0) amount = Math.max(amount, snow);
    }
    if (amount == null || amount < 0.05) return '';
    var snowy = (snow != null && snow >= 0.05) ||
      (code != null && (code >= 71 && code <= 77 || code === 85 || code === 86));
    var rainy = (rain != null && rain >= 0.05) || (showers != null && showers >= 0.05) ||
      (code != null && (code >= 51 && code <= 67 || code >= 80 && code <= 82 || code >= 95));
    if (snowy && rainy) return 'sleet';
    if (snowy) return 'snow';
    return 'rain';
  }

  function readCache() {
    try {
      var o = JSON.parse(localStorage.getItem(CACHE_KEY) || '');
      if (!o || typeof o !== 'object') return null;
      if (o.at && Date.now() - o.at < TTL_MS) return o;
    } catch (e) {}
    return null;
  }
  function writeCache(o) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(o)); } catch (e) {}
  }

  function canShow() {
    try {
      if (!window.ANIMATIONER || !window.ANIMATIONER.isOn()) return false;
      if (ANIMATIONER.reduceMotion && ANIMATIONER.reduceMotion()) return false;
    } catch (e) { return false; }
    return true;
  }

  function ensureWxStyle() {
    if (document.getElementById('animationer-vader-style')) return;
    var css = document.createElement('style');
    css.id = 'animationer-vader-style';
    css.textContent =
      '#animationer-layer .anim-wx{position:absolute;left:0;top:-12%;pointer-events:none!important;will-change:transform,opacity}' +
      '#animationer-layer.anim-wx-paused .anim-wx{animation-play-state:paused!important}' +
      '.anim-wx-drop{width:1.5px;height:11px;border-radius:1px;background:rgba(160,200,230,.32);animation:anim-wx-fall linear infinite}' +
      'html[data-theme="dark"] .anim-wx-drop{background:rgba(186,214,240,.28)}' +
      '.anim-wx-flake{width:7px;height:7px;color:rgba(230,240,255,.4);font-size:7px;line-height:7px;text-align:center;animation:anim-wx-drift linear infinite}' +
      'html[data-theme="dark"] .anim-wx-flake{color:rgba(240,248,255,.38)}' +
      '@keyframes anim-wx-fall{0%{transform:translate3d(0,0,0);opacity:0}8%{opacity:1}92%{opacity:1}100%{transform:translate3d(8px,120vh,0);opacity:0}}' +
      '@keyframes anim-wx-drift{0%{transform:translate3d(0,0,0) rotate(0deg);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translate3d(18px,120vh,0) rotate(120deg);opacity:0}}' +
      '#animationer-vader-plats{position:fixed;left:8px;right:8px;bottom:8px;z-index:80;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:rgba(20,28,36,.92);color:#eef4fa;font-size:13px;line-height:1.25;box-shadow:0 2px 10px rgba(0,0,0,.25)}' +
      'html:not([data-theme="dark"]) #animationer-vader-plats{background:rgba(245,248,252,.96);color:#1a2430;box-shadow:0 2px 10px rgba(0,0,0,.12)}' +
      '#animationer-vader-plats p{margin:0;flex:1;min-width:0}' +
      '#animationer-vader-plats button{flex:0 0 auto;min-height:32px;padding:4px 10px;border:0;border-radius:8px;font-size:13px;cursor:pointer}' +
      '#animationer-vader-plats .avp-yes{background:#2b6cb0;color:#fff}' +
      '#animationer-vader-plats .avp-no{background:transparent;color:inherit;opacity:.85}';
    document.head.appendChild(css);
  }

  function host() {
    ensureWxStyle();
    var el = document.getElementById('animationer-layer');
    if (!el && window.ANIMATIONER && ANIMATIONER.layer) el = ANIMATIONER.layer();
    if (!el) {
      el = document.createElement('div');
      el.id = 'animationer-layer';
      el.setAttribute('aria-hidden', 'true');
      if (document.body) document.body.appendChild(el);
    }
    return el;
  }

  function clearWx() {
    var el = document.getElementById('animationer-layer');
    if (!el) return;
    var list = el.querySelectorAll('.anim-wx');
    for (var i = 0; i < list.length; i++) list[i].parentNode.removeChild(list[i]);
  }

  function spawn(kind) {
    clearWx();
    if (!kind || !canShow()) return;
    var box = host();
    if (!box) return;
    var rainN = kind === 'sleet' ? 5 : kind === 'rain' ? 10 : 0;
    var snowN = kind === 'sleet' ? 5 : kind === 'snow' ? 9 : 0;
    var i, n, dur, left, delay;
    for (i = 0; i < rainN; i++) {
      n = document.createElement('span');
      n.className = 'anim-wx anim-wx-drop';
      n.setAttribute('aria-hidden', 'true');
      left = (4 + (i * 93 / Math.max(1, rainN)) + (i % 3) * 2) % 96;
      dur = 1.8 + (i % 5) * 0.28;
      delay = (i * 0.37) % 2.2;
      n.style.left = left + 'vw';
      n.style.animationDuration = dur + 's';
      n.style.animationDelay = (-delay) + 's';
      n.style.height = (9 + (i % 3) * 2) + 'px';
      box.appendChild(n);
    }
    for (i = 0; i < snowN; i++) {
      n = document.createElement('span');
      n.className = 'anim-wx anim-wx-flake';
      n.setAttribute('aria-hidden', 'true');
      n.textContent = '✲';
      left = (6 + (i * 89 / Math.max(1, snowN)) + (i % 2) * 3) % 96;
      dur = 4.2 + (i % 4) * 0.7;
      delay = (i * 0.61) % 3.5;
      n.style.left = left + 'vw';
      n.style.animationDuration = dur + 's';
      n.style.animationDelay = (-delay) + 's';
      n.style.fontSize = (6 + (i % 3)) + 'px';
      box.appendChild(n);
    }
  }

  function applyKind(kind) {
    if (!canShow()) { clearWx(); return; }
    spawn(kind);
  }

  function syncHidden() {
    var el = document.getElementById('animationer-layer');
    if (!el) return;
    if (document.hidden) el.classList.add('anim-wx-paused');
    else el.classList.remove('anim-wx-paused');
  }

  function snapshotFrom(json) {
    var cur = json && json.current;
    if (!cur || typeof cur !== 'object') return { kind: '', temp: null, symbol: null };
    return {
      kind: kindFrom(cur) || '',
      temp: num(cur.temperature_2m),
      symbol: num(cur.weather_code)
    };
  }
  // Klädsel till hjälpboten (överraskning: nämns inte i Om/hjälp/nyheter).
  // snö > snöblandat > regn > kallt (<5 °C) > sol/varmt.
  function outfitFrom(snap, opts) {
    opts = opts || {};
    if (!opts.force) {
      try { if (!window.ANIMATIONER || !window.ANIMATIONER.isOn()) return ''; } catch (e) { return ''; }
    }
    if (!snap || typeof snap !== 'object') return '';
    var kind = snap.kind || '';
    var temp = num(snap.temp);
    var sym = num(snap.symbol);
    var cold = temp != null && temp < 5;
    var warm = temp != null && temp >= 18;
    var sun = (sym === 0 || sym === 1 || sym === 2) && (temp == null || temp >= 5);
    if (kind === 'snow' || kind === 'sleet') return 'snow';
    if (kind === 'rain') return 'rain';
    if (cold) return 'cold';
    if (sun || warm) return 'sun';
    return '';
  }
  function emitSnap(snap) {
    try { document.dispatchEvent(new CustomEvent('animationer-vader', { detail: snap || null })); } catch (e) {}
  }
  function animOn() {
    try { return !!(window.ANIMATIONER && window.ANIMATIONER.isOn && window.ANIMATIONER.isOn()); } catch (e) { return false; }
  }

  function meteoUrl(coord) {
    var r = roundCoord(coord.lat, coord.lon);
    return METEO.replace('{lat}', String(r.lat)).replace('{lon}', String(r.lon));
  }

  function fetchKind(coord) {
    var r = roundCoord(coord.lat, coord.lon);
    if (r.lat == null || r.lon == null) r = { lat: GBG.lat, lon: GBG.lon };
    return fetch(meteoUrl({ lat: r.lat, lon: r.lon }), { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('meteo ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var snap = snapshotFrom(json);
        snap.at = Date.now();
        snap.source = coord.source || 'gbg';
        writeCache(snap);
        emitSnap(snap);
        return snap;
      });
  }

  function geoState(cb) {
    if (!navigator.permissions || !navigator.permissions.query) { cb('unknown'); return; }
    try {
      var p = navigator.permissions.query({ name: 'geolocation' });
      if (!p || !p.then) { cb('unknown'); return; }
      p.then(function (s) { cb((s && s.state) || 'unknown'); }).catch(function () { cb('unknown'); });
    } catch (e) { cb('unknown'); }
  }

  function askedChoice() {
    try { return localStorage.getItem(GEO_ASK_KEY) || ''; } catch (e) { return ''; }
  }
  function rememberChoice(v) {
    try { localStorage.setItem(GEO_ASK_KEY, v); } catch (e) {}
  }

  function hideAsk() {
    asking = false;
    var el = document.getElementById('animationer-vader-plats');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showAsk(onYes, onNo) {
    if (asking || document.getElementById('animationer-vader-plats')) return;
    asking = true;
    ensureWxStyle();
    var bar = document.createElement('div');
    bar.id = 'animationer-vader-plats';
    bar.setAttribute('role', 'dialog');
    var p = document.createElement('p');
    p.textContent = 'Visa vädret där du är?';
    var yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'avp-yes';
    yes.textContent = 'Ja';
    var no = document.createElement('button');
    no.type = 'button';
    no.className = 'avp-no';
    no.textContent = 'Inte nu';
    yes.addEventListener('click', function () { hideAsk(); if (onYes) onYes(); });
    no.addEventListener('click', function () { hideAsk(); if (onNo) onNo(); });
    bar.appendChild(p);
    bar.appendChild(no);
    bar.appendChild(yes);
    (document.body || document.documentElement).appendChild(bar);
  }

  function takePosition(onOk, onFail) {
    var done = false;
    var to = setTimeout(function () { if (!done) { done = true; onFail(); } }, 2500);
    try {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (done) return;
          done = true; clearTimeout(to);
          var r = roundCoord(pos.coords.latitude, pos.coords.longitude);
          if (r.lat == null || r.lon == null) { onFail(); return; }
          onOk({ lat: r.lat, lon: r.lon, source: 'device' });
        },
        function () { if (!done) { done = true; clearTimeout(to); onFail(); } },
        { enableHighAccuracy: false, timeout: 2000, maximumAge: 10 * 60 * 1000 }
      );
    } catch (e) { if (!done) { done = true; clearTimeout(to); onFail(); } }
  }

  // cb kan anropas två gånger: först Göteborg, sedan enhetens läge om användaren säger ja.
  function locate(cb) {
    var gbg = { lat: GBG.lat, lon: GBG.lon, source: 'gbg' };
    if (!navigator.geolocation) { cb(gbg); return; }
    geoState(function (state) {
      if (state === 'granted' || (askedChoice() === 'ja' && state !== 'denied')) {
        takePosition(cb, function () { cb(gbg); });
        return;
      }
      if (state === 'denied' || askedChoice() === 'nej') { cb(gbg); return; }
      cb(gbg);
      if (document.hidden) return;
      showAsk(function () {
        rememberChoice('ja');
        takePosition(cb, function () {});
      }, function () { rememberChoice('nej'); });
    });
  }

  function refresh(force) {
    if (!animOn()) { clearWx(); hideAsk(); return; }
    if (document.hidden) return;
    var cached = !force && readCache();
    if (cached) { applyKind(cached.kind); emitSnap(cached); return; }
    locate(function (coord) {
      if (!animOn()) return;
      fetchKind(coord).then(function (snap) { applyKind(snap && snap.kind); }).catch(function () { /* tyst: visa inget */ });
    });
  }

  function start() {
    if (started) { refresh(false); return; }
    started = true;
    if (document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        syncHidden();
        if (!document.hidden) refresh(false);
      });
      document.addEventListener('animationer-change', function () { refresh(false); });
    }
    refresh(false);
    if (timer) clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) refresh(false); }, 5 * 60 * 1000);
  }

  function preview(kind) {
    applyKind(kind === 'snow' || kind === 'sleet' || kind === 'rain' ? kind : '');
  }

  window.ANIMATIONER_VADER = {
    kindFrom: kindFrom,
    outfitFrom: outfitFrom,
    roundCoord: roundCoord,
    readCache: readCache,
    refresh: refresh,
    preview: preview,
    start: start,
    clear: clearWx,
    cacheKey: CACHE_KEY,
    ttlMs: TTL_MS,
    gbg: GBG
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
