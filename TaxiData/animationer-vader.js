/* Väderanimation på samma överlager som Animationer.
 * Hämtar nuvarande typ från SMHI SNOW1g (efterföljare till pmp3g, avvecklad 31 mars 2026).
 * Ingen nyckel. Cachas 20 minuter i localStorage 'taxi_animationer_vader'.
 * Plats: enhetens läge om det finns, annars Göteborg. Samma inställning Animationer.
 * Ångra: ta bort den här filen och script-taggen. */
(function () {
  'use strict';
  var CACHE_KEY = 'taxi_animationer_vader';
  var TTL_MS = 20 * 60 * 1000;
  var GBG = { lat: 57.7089, lon: 11.9746 };
  var SMHI = 'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/{lon}/lat/{lat}/data.json?timeseries=8&parameters=predominant_precipitation_type_at_surface,precipitation_amount_mean,precipitation_frozen_part,probability_of_precipitation,air_temperature,symbol_code';
  var timer = null;
  var started = false;

  function num(v) {
    if (v == null || v === 9999) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // SNOW1g ptype (skiljer sig från gamla pmp3g där 1 = snö):
  // 0 ingen, 1 regn, 2 snöblandat, 5/6 snö eller underkylt, 11 duggregn.
  // Kompletteras med symbol_code (samma 1–27 som tidigare) och frozen_part.
  function kindFrom(data) {
    if (!data || typeof data !== 'object') return '';
    var pcat = num(data.predominant_precipitation_type_at_surface);
    var amount = num(data.precipitation_amount_mean);
    var frozen = num(data.precipitation_frozen_part);
    var prob = num(data.probability_of_precipitation);
    var sym = num(data.symbol_code);
    if (frozen != null && frozen > 1) frozen = frozen / 100;
    var wet = (amount != null && amount >= 0.05) || (prob != null && prob >= 50 && amount != null && amount >= 0.02);
    if (pcat === 0 && !wet) return '';
    if (pcat === 5 || pcat === 6 || pcat === 8 || pcat === 9 || pcat === 10) return 'snow';
    if (pcat === 2 || pcat === 7) return 'sleet';
    if (pcat === 1 || pcat === 3 || pcat === 4 || pcat === 11 || pcat === 12) return wet || pcat === 1 || pcat === 11 ? 'rain' : '';
    if (sym >= 15 && sym <= 17 || sym >= 25 && sym <= 27) return 'snow';
    if (sym >= 12 && sym <= 14 || sym >= 22 && sym <= 24) return 'sleet';
    if (frozen != null && frozen >= 0.8 && wet) return 'snow';
    if (frozen != null && frozen >= 0.2 && wet) return 'sleet';
    if (sym >= 8 && sym <= 11 || sym >= 18 && sym <= 21) return wet ? 'rain' : '';
    return wet ? 'rain' : '';
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
      if (!window.ANIMATIONER || !ANIMATIONER.isOn()) return false;
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
      '@keyframes anim-wx-drift{0%{transform:translate3d(0,0,0) rotate(0deg);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translate3d(18px,120vh,0) rotate(120deg);opacity:0}}';
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

  function pickTimeSeries(ts) {
    if (!ts || !ts.length) return null;
    var now = Date.now(), best = ts[0], bestDt = Infinity, i, t, dt;
    for (i = 0; i < ts.length; i++) {
      t = Date.parse(ts[i].time || ts[i].validTime || '');
      if (!isFinite(t)) continue;
      dt = Math.abs(t - now);
      if (dt < bestDt) { bestDt = dt; best = ts[i]; }
    }
    return best;
  }

  function parseResponse(json) {
    var row = pickTimeSeries(json && json.timeSeries);
    var data = row && row.data;
    return kindFrom(data || {});
  }

  function smhiUrl(coord) {
    var lon = Number(coord.lon).toFixed(4);
    var lat = Number(coord.lat).toFixed(4);
    return SMHI.replace('{lon}', lon).replace('{lat}', lat);
  }

  function fetchKind(coord) {
    return fetch(smhiUrl(coord), { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('smhi ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var kind = parseResponse(json) || '';
        writeCache({ at: Date.now(), lat: coord.lat, lon: coord.lon, kind: kind, source: coord.source || 'gbg' });
        return kind;
      });
  }

  function locate(cb) {
    var cached = readCache();
    if (cached && cached.lat && cached.lon && cached.source === 'device') {
      cb({ lat: cached.lat, lon: cached.lon });
      return;
    }
    if (!navigator.geolocation) { cb(GBG); return; }
    var done = false;
    var to = setTimeout(function () { if (!done) { done = true; cb(GBG); } }, 2500);
    try {
      navigator.geolocation.getCurrentPosition(
        function (p) {
          if (done) return;
          done = true; clearTimeout(to);
          cb({ lat: p.coords.latitude, lon: p.coords.longitude, source: 'device' });
        },
        function () { if (!done) { done = true; clearTimeout(to); cb(GBG); } },
        { enableHighAccuracy: false, timeout: 2000, maximumAge: 30 * 60 * 1000 }
      );
    } catch (e) { if (!done) { done = true; clearTimeout(to); cb(GBG); } }
  }

  function refresh(force) {
    if (!canShow()) { clearWx(); return; }
    if (document.hidden) return;
    var cached = !force && readCache();
    if (cached) { applyKind(cached.kind); return; }
    locate(function (coord) {
      if (!canShow()) return;
      fetchKind(coord).then(function (kind) { applyKind(kind); }).catch(function () { /* tyst: visa inget */ });
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
    refresh: refresh,
    preview: preview,
    start: start,
    clear: clearWx,
    cacheKey: CACHE_KEY,
    ttlMs: TTL_MS
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
