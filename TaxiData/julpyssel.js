/* Julpyssel i TaxiData. Syns bara för utvalda förar-id (ALLOW).
 * För att visa för alla: sätt JUL_ALLA = true, eller lägg fler id i ALLOW.
 * Ångra: ta bort script- och css-taggarna i index.html. */
(function () {
  'use strict';
  if (window.JULPYSSEL) return;

  var JUL_ALLA = false;
  var ALLOW = { '710022': 1 };
  var ADVENT = ['2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20'];
  var PREVIEW_KEY = 'taxi_jul_ljus_preview';
  var BURN_END = '2026-12-25';
  var CANDLE_FULL = 18;
  var CANDLE_STUB = 4.5;
  var BODY_BOTTOM = 34;
  var burnTimer = 0;
  var LABELS = [
    'Inget ljus tänt än (första advent är 29 nov)',
    '1:a advent',
    '2:a advent',
    '3:e advent',
    '4:e advent'
  ];

  function driverId() {
    try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; }
  }
  function allowed() {
    if (JUL_ALLA) return true;
    return !!ALLOW[driverId()];
  }
  function ymd(d) {
    try {
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(d);
    } catch (e) {
      var x = d || new Date();
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    }
  }
  function dateOverride() {
    try {
      var q = new URLSearchParams(location.search).get('juldatum');
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    } catch (e) {}
    return '';
  }
  function previewLevel() {
    try {
      var v = localStorage.getItem(PREVIEW_KEY);
      if (v === '0' || v === '1' || v === '2' || v === '3' || v === '4') return +v;
    } catch (e) {}
    return null;
  }
  function setPreview(n) {
    try {
      if (n == null) localStorage.removeItem(PREVIEW_KEY);
      else localStorage.setItem(PREVIEW_KEY, String(n));
    } catch (e) {}
  }
  function litOn(day) {
    var n = 0, i;
    for (i = 0; i < ADVENT.length; i++) if (day >= ADVENT[i]) n++;
    return n;
  }
  function litCount(now) {
    var over = dateOverride();
    if (over) return litOn(over);
    var prev = previewLevel();
    if (prev != null) return prev;
    return litOn(ymd(now || new Date()));
  }
  function isPreviewing() {
    return !dateOverride() && previewLevel() != null;
  }
  // Advent 2026 är vintertid (UTC+1). Ett ljus tänds midnatt på sin adventssöndag
  // och brinner ner till en kort stump vid jul (25 dec kl 00).
  function atStockholm(day) {
    return Date.parse(day + 'T00:00:00+01:00');
  }
  function clockMs(now) {
    var over = dateOverride();
    if (over) return atStockholm(over);
    var prev = previewLevel();
    if (prev != null) {
      if (prev <= 0) return atStockholm('2026-11-28');
      return atStockholm(ADVENT[Math.min(prev, ADVENT.length) - 1]);
    }
    if (now == null) return Date.now();
    if (typeof now === 'number' && isFinite(now)) return now;
    var t = +now;
    return isFinite(t) ? t : Date.now();
  }
  function candleRemain(i, ms) {
    var start = atStockholm(ADVENT[i]), end = atStockholm(BURN_END);
    if (!(end > start)) return 1;
    var t = (ms - start) / (end - start);
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    return 1 - t;
  }
  function candleHeight(i, lit, ms) {
    if (!lit) return CANDLE_FULL;
    return CANDLE_STUB + candleRemain(i, ms) * (CANDLE_FULL - CANDLE_STUB);
  }

  function flame(x, y) {
    // Yttre g håller läget. CSS-animationen på .jul-flame får inte skriva över translate.
    return '<g class="jul-flame-pos" transform="translate(' + Number(x).toFixed(2) + ' ' + Number(y).toFixed(2) + ')">' +
      '<g class="jul-flame">' +
      '<path d="M0 8c2.2-2.4 3.2-4.2 2.2-6.4C1.6.4 0-1.2 0-1.2S-1.6.4-2.2 1.6C-3.2 3.8-2.2 5.6 0 8z" fill="#f6e05e"/>' +
      '<path d="M0 7c1.2-1.4 1.6-2.6 1-4.1C.6 1.8 0 .8 0 .8s-.6 1-1 2.1C-1.6 4.4-1.2 5.6 0 7z" fill="#ed8936"/>' +
      '</g></g>';
  }
  function candle(n, lit, x, h) {
    var body = lit ? '#f7fafc' : '#cbd5e0';
    var stroke = lit ? '#e2e8f0' : '#a0aec0';
    if (h == null) h = CANDLE_FULL;
    var bodyY = BODY_BOTTOM - h;
    var wickY = bodyY - 2.5;
    return '<g class="jul-c' + n + (lit ? ' on' : '') + '" transform="translate(' + x + ' 0)">' +
      '<rect class="jul-body" x="-3" y="' + bodyY.toFixed(2) + '" width="6" height="' + h.toFixed(2) + '" rx="1.2" fill="' + body + '" stroke="' + stroke + '" stroke-width=".6"/>' +
      '<rect class="jul-wick" x="-0.7" y="' + wickY.toFixed(2) + '" width="1.4" height="3" fill="' + (lit ? '#ed8936' : '#a0aec0') + '"/>' +
      (lit ? flame(0, bodyY - 8) : '') +
      '</g>';
  }
  function svg(lit, ms) {
    var xs = [14, 28, 42, 56], h = '', i, on, height;
    ms = ms == null ? clockMs() : ms;
    for (i = 0; i < 4; i++) {
      on = i < lit;
      height = candleHeight(i, on, ms);
      h += candle(i + 1, on, xs[i], height);
    }
    return '<svg viewBox="0 0 70 50" width="72" height="52" aria-hidden="true">' +
      '<path d="M6 42h58l-3 5H9z" fill="#8b2942"/>' +
      '<path d="M8 40h54c1 0 2 1 2 2H6c0-1 1-2 2-2z" fill="#9b3a52"/>' +
      '<path d="M10 36h50c.8 0 1.5.8 1.5 1.6H8.5C8.5 36.8 9.2 36 10 36z" fill="#6b1f33"/>' +
      h +
      '</svg>';
  }

  function onHome() {
    var app = document.getElementById('app');
    return !!(app && app.classList.contains('is-home') && app.style.display !== 'none' && !window.current);
  }

  function labelOf(lit, preview) {
    var base = 'Adventsljusstake, ' + (LABELS[lit] || (lit + ' ljus tända'));
    if (preview) base += '. Förhandsvisning, tryck för att byta.';
    else if (lit < 4) base += '. Tryck för att förhandsvisa.';
    return base;
  }

  function headerEl() {
    return document.querySelector('#app > header') || document.querySelector('#app header') || document.querySelector('header');
  }
  function syncSidaTop() {
    var hs = window.HEM_SIDOR;
    if (hs && typeof hs.headerTop === 'function') hs.headerTop();
  }

  function paint() {
    var el = document.getElementById('jul-ljusstake');
    var rad = document.getElementById('jul-ljus-rad');
    if (!el) { paintSlingor(); paintMys(); return; }
    if (!allowed() || !onHome()) {
      el.classList.remove('jul-on', 'jul-preview');
      el.hidden = true;
      if (rad) {
        rad.classList.remove('jul-on', 'jul-preview');
        rad.hidden = true;
      }
      syncSidaTop();
      paintSlingor(); paintMys();
      return;
    }
    var lit = litCount();
    var preview = isPreviewing() || !!dateOverride();
    el.innerHTML = svg(lit, clockMs()) + '<span class="jul-hint">' + (preview ? 'Förhandsvisning' : '') + '</span>';
    el.classList.toggle('jul-preview', preview);
    el.classList.add('jul-on');
    el.hidden = false;
    if (rad) {
      rad.classList.toggle('jul-preview', preview);
      rad.classList.add('jul-on');
      rad.hidden = false;
    }
    el.setAttribute('aria-label', labelOf(lit, preview));
    el.title = preview
      ? ('Förhandsvisning: ' + (LABELS[lit] || '') + ' – tryck för att byta')
      : 'Adventsljusstake';
    syncSidaTop();
    paintSlingor(); paintMys();
  }

  function cyclePreview() {
    if (!allowed()) return;
    var cur = previewLevel();
    if (cur == null) setPreview(1);
    else if (cur >= 4) setPreview(0);
    else if (cur === 0) setPreview(null);
    else setPreview(cur + 1);
    paint();
  }

  function ensure() {
    var rad = document.getElementById('jul-ljus-rad');
    var btn = document.getElementById('jul-ljusstake');
    if (!allowed()) {
      if (rad && rad.parentNode) rad.parentNode.removeChild(rad);
      else if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
      var sl0 = document.getElementById('jul-slingor');
      if (sl0 && sl0.parentNode) sl0.parentNode.removeChild(sl0);
      var mys0 = document.getElementById('jul-mys');
      if (mys0 && mys0.parentNode) mys0.parentNode.removeChild(mys0);
      var g0 = document.getElementById('jul-girlang');
      if (g0 && g0.parentNode) g0.parentNode.removeChild(g0);
      return null;
    }
    if (!rad) {
      rad = document.createElement('div');
      rad.id = 'jul-ljus-rad';
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'jul-ljusstake';
      btn.type = 'button';
      btn.hidden = true;
      btn.addEventListener('click', cyclePreview);
    }
    if (btn.parentNode !== rad) rad.appendChild(btn);
    var hdr = headerEl();
    if (hdr) {
      if (rad.parentNode !== hdr) hdr.appendChild(rad);
    } else if (!rad.parentNode) {
      (document.body || document.documentElement).appendChild(rad);
    }
    ensureSlingor();
    ensureMys();
    return btn;
  }

  var LAMP_COLORS = ['#e53e3e', '#ecc94b', '#38a169', '#4299e1', '#ed8936', '#faf089'];
  function slingaSvg(side, h) {
    h = Math.max(120, Math.round(h || 400));
    var waves = side === 'h' ? 3.15 : 2.75;
    var phase = side === 'h' ? 1.15 : 0.15;
    var n = Math.max(7, Math.min(16, Math.round(h / 48)));
    var d = '', i, t, x, y, lamps = '';
    for (i = 0; i <= n * 5; i++) {
      t = i / (n * 5);
      y = 4 + t * (h - 8);
      x = 6 + 3.1 * Math.sin(t * Math.PI * waves + phase);
      d += (i ? ' L ' : 'M ') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    for (i = 0; i < n; i++) {
      t = (i + 0.55) / n;
      y = 4 + t * (h - 8);
      x = 6 + 3.1 * Math.sin(t * Math.PI * waves + phase);
      lamps += '<circle class="jul-lampa" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) +
        '" r="2.35" fill="' + LAMP_COLORS[i % LAMP_COLORS.length] +
        '" style="animation-delay:' + (i * 0.22).toFixed(2) + 's"/>';
    }
    return '<svg class="jul-slinga jul-slinga-' + side + '" viewBox="0 0 12 ' + h +
      '" width="12" height="' + h + '" aria-hidden="true"><path class="jul-trad" d="' + d +
      '"/>' + lamps + '</svg>';
  }
  function ensureSlingor() {
    var wrap = document.getElementById('jul-slingor');
    if (!allowed()) {
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      return null;
    }
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'jul-slingor';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.hidden = true;
      (document.body || document.documentElement).appendChild(wrap);
    }
    return wrap;
  }
  function layoutLights() {
    var wrap = document.getElementById('jul-slingor');
    if (!wrap || wrap.hidden || !wrap.classList || !wrap.classList.contains('jul-on')) return;
    if (typeof wrap.querySelector !== 'function') {
      if (!wrap.innerHTML) wrap.innerHTML = slingaSvg('v', 400) + slingaSvg('h', 400);
      return;
    }
    var hdr = headerEl();
    var top = 56, vh = (window.innerHeight || 600);
    if (hdr && hdr.getBoundingClientRect) top = Math.ceil(hdr.getBoundingClientRect().bottom) + 4;
    function stopAbove(sel, fallback) {
      var el = document.querySelector(sel);
      if (!el || !el.getBoundingClientRect) return fallback;
      var r = el.getBoundingClientRect();
      if (!r.width || r.bottom <= 0) return fallback;
      return Math.min(fallback, Math.floor(r.top) - 6);
    }
    var leftBot = vh - 12;
    var rightBot = vh - 12;
    leftBot = stopAbove('.td-berra', leftBot);
    rightBot = stopAbove('#hb-stage, .hb-stage', rightBot);
    var dots = document.getElementById('td-dots');
    if (dots && dots.getBoundingClientRect) {
      var dr = dots.getBoundingClientRect();
      if (dr.width) {
        var mid = vh - 16;
        if (dr.top) mid = Math.floor(dr.top) - 4;
        leftBot = Math.min(leftBot, mid);
        rightBot = Math.min(rightBot, mid);
      }
    }
    function place(side, bottom) {
      var h = Math.max(80, bottom - top);
      var html = slingaSvg(side, h);
      var old = wrap.querySelector('.jul-slinga-' + side);
      if (old) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        var neu = tmp.firstChild;
        if (neu) {
          neu.style.top = top + 'px';
          neu.style.height = h + 'px';
          wrap.replaceChild(neu, old);
        }
      } else {
        wrap.insertAdjacentHTML('beforeend', html);
        var el = wrap.querySelector('.jul-slinga-' + side);
        if (el) { el.style.top = top + 'px'; el.style.height = h + 'px'; }
      }
    }
    if (!wrap.querySelector('.jul-slinga-v')) wrap.innerHTML = slingaSvg('v', 400) + slingaSvg('h', 400);
    place('v', leftBot);
    place('h', rightBot);
  }
  function paintSlingor() {
    var wrap = ensureSlingor();
    if (!wrap) return;
    if (!allowed() || !onHome()) {
      wrap.classList.remove('jul-on');
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    wrap.classList.add('jul-on');
    layoutLights();
  }


  function snowHtml() {
    var h = '', i, x, s, dur, del, dx;
    for (i = 0; i < 12; i++) {
      x = (6 + (i * 7.7 + (i % 3) * 3) % 88).toFixed(1);
      s = (2.4 + (i % 4) * 1.1).toFixed(1) + 'px';
      dur = (14 + (i % 5) * 2.2).toFixed(1) + 's';
      del = (-(i * 1.7)).toFixed(1) + 's';
      dx = ((i % 2 ? 18 : -16) + (i % 3) * 4) + 'px';
      h += '<span class="jul-flinga" style="--x:' + x + ';--s:' + s + ';--dur:' + dur +
        ';--del:' + del + ';--dx:' + dx + '"></span>';
    }
    return h;
  }
  function ensureMys() {
    var wrap = document.getElementById('jul-mys');
    if (!allowed()) {
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      var g0 = document.getElementById('jul-girlang');
      if (g0 && g0.parentNode) g0.parentNode.removeChild(g0);
      return null;
    }
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'jul-mys';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.hidden = true;
      wrap.innerHTML = '<div class="jul-vignette"></div><div class="jul-sno">' + snowHtml() + '</div>';
      (document.body || document.documentElement).appendChild(wrap);
    }
    return wrap;
  }
  function girlangSvg(w) {
    w = Math.max(280, Math.round(w || 390));
    var i, t, x, y, a, x2, y2, d = '', leaves = '', berries = '', hang = '';
    var n = 28;
    for (i = 0; i <= n * 3; i++) {
      t = i / (n * 3);
      y = 9 + 2.4 * Math.sin(t * Math.PI * 5.5);
      x = t * w;
      d += (i ? ' L ' : 'M ') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    for (i = 0; i < 70; i++) {
      t = (i + 0.4) / 70;
      x = t * w;
      y = 9 + 2.4 * Math.sin(t * Math.PI * 5.5);
      a = ((i % 2) ? -58 : 56) * Math.PI / 180;
      x2 = x + 7 * Math.cos(a);
      y2 = y + 7 * Math.sin(a);
      leaves += '<ellipse class="' + (i % 3 ? 'jul-barr' : 'jul-barr2') + '" cx="' +
        ((x + x2) / 2).toFixed(1) + '" cy="' + ((y + y2) / 2).toFixed(1) +
        '" rx="4.2" ry="1.7" transform="rotate(' + (a * 180 / Math.PI).toFixed(0) + ' ' +
        ((x + x2) / 2).toFixed(1) + ' ' + ((y + y2) / 2).toFixed(1) + ')"/>';
    }
    for (i = 0; i < 11; i++) {
      t = (i + 0.6) / 11;
      x = t * w;
      y = 9 + 2.4 * Math.sin(t * Math.PI * 5.5) + 1.2;
      berries += '<circle class="jul-bar" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="1.35"/>';
    }
    function snore(x0, y0, y1) {
      return '<path class="jul-snore" d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) +
        ' Q ' + (x0 + 1.5).toFixed(1) + ' ' + ((y0 + y1) / 2).toFixed(1) + ' ' +
        x0.toFixed(1) + ' ' + y1.toFixed(1) + '"/>';
    }
    function star(cx, cy, r) {
      var pts = '', k, ang, rr;
      for (k = 0; k < 10; k++) {
        ang = -Math.PI / 2 + k * Math.PI / 5;
        rr = k % 2 ? r * 0.42 : r;
        pts += (k ? ' ' : '') + (cx + rr * Math.cos(ang)).toFixed(1) + ',' + (cy + rr * Math.sin(ang)).toFixed(1);
      }
      return '<polygon class="jul-stjarna" points="' + pts + '"/>';
    }
    function ball(cx, cy, r, klass) {
      return '<g class="jul-kula">' + snore(cx, 11, cy - r) +
        '<circle class="' + klass + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' +
        '<circle cx="' + (cx - r * 0.3) + '" cy="' + (cy - r * 0.35) + '" r="' + (r * 0.28) +
        '" fill="#fff" opacity="0.35"/>' +
        '<rect class="jul-trad-guld" x="' + (cx - 1.3) + '" y="' + (cy - r - 2.2) +
        '" width="2.6" height="2.2" rx="0.4"/></g>';
    }
    function peppar(cx, cy) {
      return '<g class="jul-kula">' + snore(cx, 11, cy - 6) +
        '<path fill="#8a4b1f" stroke="#6b3512" stroke-width="0.6" d="M' + cx + ' ' + (cy + 6.2) +
        ' C ' + (cx + 7) + ' ' + (cy + 1) + ' ' + (cx + 6) + ' ' + (cy - 5) + ' ' + cx + ' ' + (cy - 2.2) +
        ' C ' + (cx - 6) + ' ' + (cy - 5) + ' ' + (cx - 7) + ' ' + (cy + 1) + ' ' + cx + ' ' + (cy + 6.2) + 'Z"/>' +
        '<circle fill="#f4efe6" cx="' + (cx - 1.8) + '" cy="' + (cy - 0.2) + '" r="0.7"/>' +
        '<circle fill="#f4efe6" cx="' + (cx + 1.8) + '" cy="' + (cy - 0.2) + '" r="0.7"/>' +
        '<circle fill="#f4efe6" cx="' + cx + '" cy="' + (cy + 2.2) + '" r="0.7"/></g>';
    }
    function tomte(cx, cy) {
      return '<g class="jul-kula">' + snore(cx, 11, cy - 8) +
        '<circle fill="#f0d5b8" cx="' + cx + '" cy="' + (cy + 0.4) + '" r="3.1"/>' +
        '<path fill="#c53030" d="M' + (cx - 3.4) + ' ' + (cy - 1) + ' L ' + cx + ' ' + (cy - 8.2) +
        ' L ' + (cx + 3.4) + ' ' + (cy - 1) + ' Z"/>' +
        '<circle fill="#f7f3ea" cx="' + cx + '" cy="' + (cy - 8.2) + '" r="1.05"/>' +
        '<circle fill="#1a202c" cx="' + (cx - 1.05) + '" cy="' + (cy + 0.2) + '" r="0.45"/>' +
        '<circle fill="#1a202c" cx="' + (cx + 1.05) + '" cy="' + (cy + 0.2) + '" r="0.45"/>' +
        '<ellipse fill="#c53030" cx="' + cx + '" cy="' + (cy + 6.4) + '" rx="3.3" ry="3.1"/>' +
        '<ellipse fill="#f7f3ea" cx="' + cx + '" cy="' + (cy + 3.3) + '" rx="2.4" ry="1.1"/></g>';
    }
    var spots = [
      [0.10, 'star'], [0.20, 'ball-rod'], [0.30, 'peppar'],
      [0.70, 'tomte'], [0.80, 'ball-gron'], [0.90, 'ball-guld']
    ];
    for (i = 0; i < spots.length; i++) {
      x = spots[i][0] * w;
      if (spots[i][1] === 'star') hang += '<g>' + snore(x, 11, 20) + star(x, 25, 5.2) + '</g>';
      else if (spots[i][1] === 'ball-rod') hang += ball(x, 24, 4.2, 'jul-kula-rod');
      else if (spots[i][1] === 'ball-gron') hang += ball(x, 25, 4.0, 'jul-kula-gron');
      else if (spots[i][1] === 'ball-guld') hang += ball(x, 23, 3.8, 'jul-kula-guld');
      else if (spots[i][1] === 'peppar') hang += peppar(x, 24);
      else if (spots[i][1] === 'tomte') hang += tomte(x, 24);
    }
    return '<svg viewBox="0 0 ' + w + ' 40" width="' + w + '" height="40" preserveAspectRatio="xMidYMin meet" aria-hidden="true">' +
      '<path class="jul-gren" d="' + d + '" fill="none" stroke-width="1.6" stroke-linecap="round"/>' +
      leaves + berries + hang + '</svg>';
  }
  function layoutGirlang() {
    var rad = document.getElementById('jul-ljus-rad');
    if (!rad || !allowed() || !onHome()) {
      var g0 = document.getElementById('jul-girlang');
      if (g0) g0.hidden = true;
      return;
    }
    var g = document.getElementById('jul-girlang');
    if (!g) {
      g = document.createElement('div');
      g.id = 'jul-girlang';
      g.setAttribute('aria-hidden', 'true');
      rad.appendChild(g);
    } else if (g.parentNode !== rad && rad.appendChild) {
      rad.appendChild(g);
    }
    g.hidden = false;
    var w = 390;
    if (rad.getBoundingClientRect) {
      var r = rad.getBoundingClientRect();
      if (r.width) w = Math.max(280, Math.round(r.width));
    }
    g.innerHTML = girlangSvg(w);
  }
  function paintMys() {
    var wrap = ensureMys();
    if (!wrap) return;
    if (!allowed() || !onHome()) {
      wrap.classList.remove('jul-on');
      wrap.hidden = true;
      var g0 = document.getElementById('jul-girlang');
      if (g0) g0.hidden = true;
      return;
    }
    wrap.hidden = false;
    wrap.classList.add('jul-on');
    layoutGirlang();
  }

  var obs = null;
  var slingorResize = false;
  function start() {
    if (burnTimer) { clearInterval(burnTimer); burnTimer = 0; }
    if (!allowed()) { paint(); return; }
    ensure();
    paint();
    burnTimer = setInterval(function () { if (allowed()) paint(); }, 60000);
    if (!slingorResize) {
      slingorResize = true;
      window.addEventListener('resize', function () { if (onHome()) { layoutLights(); layoutGirlang(); } });
    }
    if (obs || typeof MutationObserver !== 'function') return;
    var app = document.getElementById('app');
    if (!app) return;
    obs = new MutationObserver(paint);
    obs.observe(app, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  var J = window.JULPYSSEL = {
    allowed: allowed,
    litCount: litCount,
    litOn: litOn,
    advent: ADVENT.slice(),
    burnEnd: BURN_END,
    candleFull: CANDLE_FULL,
    candleStub: CANDLE_STUB,
    candleHeight: candleHeight,
    bodyBottom: BODY_BOTTOM,
    svg: svg,
    clockMs: clockMs,
    ymd: ymd,
    paint: paint,
    start: start,
    cyclePreview: cyclePreview,
    previewKey: PREVIEW_KEY
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.addEventListener('taxi:features', start);
})();
