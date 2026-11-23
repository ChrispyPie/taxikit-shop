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
    var login = document.getElementById('login-screen');
    if (login && login.style.display !== 'none') return false;
    var dv = document.getElementById('dashboard-view');
    if (dv && !dv.classList.contains('hidden')) return false;
    if (typeof window.NAV_VIEW === 'function') {
      try { if (window.NAV_VIEW()) return false; } catch (e) {}
    }
    var app = document.getElementById('app');
    return !!(app && app.classList.contains('is-home') && app.style.display !== 'none' && !window.current);
  }
  function appEl() { return document.getElementById('app'); }
  function contentEl() { return document.getElementById('content'); }
  function markHem(on) {
    var app = appEl();
    if (!app || !app.classList) return;
    if (on) {
      if (app.classList.contains && app.classList.contains('jul-hem')) return;
      if (app.classList.add) app.classList.add('jul-hem');
    } else if (app.classList.contains && app.classList.contains('jul-hem') && app.classList.remove) {
      app.classList.remove('jul-hem');
    }
  }
  function putInApp(node, before) {
    var app = appEl();
    if (!node) return;
    if (!app) {
      var host = document.body || document.documentElement;
      if (!node.parentNode && host && host.appendChild) host.appendChild(node);
      return;
    }
    if (before && before.parentNode === app && typeof app.insertBefore === 'function') {
      if (node.parentNode !== app || (node.nextSibling !== before && before.previousSibling !== node)) {
        app.insertBefore(node, before);
      }
      return;
    }
    if (typeof app.appendChild === 'function') {
      if (node.parentNode !== app) app.appendChild(node);
      return;
    }
    var host2 = document.body || document.documentElement;
    if (!node.parentNode && host2 && host2.appendChild) host2.appendChild(node);
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

  var painting = false;
  function paint() {
    if (painting) return;
    painting = true;
    try { paintInner(); } finally { painting = false; }
  }
  function paintInner() {
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
      markHem(false);
      syncSidaTop();
      paintSlingor(); paintMys();
      maybeMountAdvent();
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
    markHem(true);
    syncSidaTop();
    paintSlingor(); paintMys();
    if (window.BERRA && typeof BERRA.refresh === 'function') {
      try { BERRA.refresh(); } catch (e2) {}
    }
    maybeMountAdvent();
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
      markHem(false);
      if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
      var keep = rad && rad.querySelector && rad.querySelector('#td-adv-mini, #td-pk-count, .td-adv-mini');
      if (rad && rad.parentNode && !keep) rad.parentNode.removeChild(rad);
      var sl0 = document.getElementById('jul-slingor');
      if (sl0 && sl0.parentNode) sl0.parentNode.removeChild(sl0);
      var mys0 = document.getElementById('jul-mys');
      if (mys0 && mys0.parentNode) mys0.parentNode.removeChild(mys0);
      var g0 = document.getElementById('jul-girlang');
      if (g0 && g0.parentNode) g0.parentNode.removeChild(g0);
      var sc0 = document.getElementById('jul-scen');
      if (sc0 && sc0.parentNode) sc0.parentNode.removeChild(sc0);
      maybeMountAdvent();
      if (window.POLKAGRIS && POLKAGRIS.mountCount) POLKAGRIS.mountCount();
      return null;
    }
    if (window.ensureJulTop) rad = window.ensureJulTop() || rad;
    if (!rad) {
      rad = document.createElement('div');
      rad.id = 'jul-ljus-rad';
    }
    rad.classList.add('td-jul-top');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'jul-ljusstake';
      btn.type = 'button';
      btn.hidden = true;
      btn.addEventListener('click', cyclePreview);
    }
    var mid = rad.querySelector && rad.querySelector('.td-jul-top-mid');
    if (mid) {
      if (btn.parentNode !== mid) mid.appendChild(btn);
    } else if (btn.parentNode !== rad) rad.appendChild(btn);
    var content = contentEl();
    var gir = document.getElementById('jul-girlang');
    if (!gir) {
      gir = document.createElement('div');
      gir.id = 'jul-girlang';
      gir.setAttribute('aria-hidden', 'true');
    }
    putInApp(gir, content);
    putInApp(rad, content);
    // Girlangen är avskiljaren mellan header och body, ljusstaken ligger ovanför rutnätet.
    putInApp(gir, rad);
    ensureSlingor();
    ensureMys();
    ensureScen();
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


  function starsHtml() {
    var h = '', i, x, y, s, dur, del, kind;
    for (i = 0; i < 52; i++) {
      x = ((i * 17.3 + (i % 4) * 5.1) % 100).toFixed(1);
      y = ((i * 13.7 + (i % 5) * 8.3) % 100).toFixed(1);
      s = (1.3 + (i % 5) * 0.7).toFixed(1) + 'px';
      dur = (2.6 + (i % 7) * 0.5).toFixed(1) + 's';
      del = (-(i * 0.41)).toFixed(1) + 's';
      kind = (i % 4 === 0) ? 'jul-glitter-kors' : 'jul-glitter-prick';
      h += '<span class="jul-glitter ' + kind + '" style="--x:' + x + ';--y:' + y +
        ';--s:' + s + ';--dur:' + dur + ';--del:' + del + '"></span>';
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
      wrap.innerHTML = '<div class="jul-vignette"></div><div class="jul-himmel">' + starsHtml() + '</div>';
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
    if (!allowed() || !onHome()) {
      var g0 = document.getElementById('jul-girlang');
      if (g0) {
        g0.hidden = true;
        g0.classList.remove('jul-on');
      }
      return;
    }
    var g = document.getElementById('jul-girlang');
    var rad = document.getElementById('jul-ljus-rad');
    var content = contentEl();
    if (!g) {
      g = document.createElement('div');
      g.id = 'jul-girlang';
      g.setAttribute('aria-hidden', 'true');
    }
    putInApp(g, rad || content);
    g.hidden = false;
    g.classList.add('jul-on');
    var w = 390;
    var src = headerEl() || g || appEl();
    if (src && src.getBoundingClientRect) {
      var r = src.getBoundingClientRect();
      if (r.width) w = Math.max(280, Math.round(r.width));
    } else if (window.innerWidth) {
      w = Math.max(280, Math.round(window.innerWidth));
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
      if (g0) { g0.hidden = true; g0.classList.remove('jul-on'); }
      var sc0 = document.getElementById('jul-scen');
      if (sc0) { sc0.hidden = true; sc0.classList.remove('jul-on'); }
      return;
    }
    wrap.hidden = false;
    wrap.classList.add('jul-on');
    layoutGirlang();
    paintScen();
  }


  function scenSvg() {
    return '<svg class="jul-scen-svg" viewBox="0 0 240 168" width="240" height="168" aria-hidden="true">' +
      '<defs><linearGradient id="jul-is" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#e8f4ff"/><stop offset="55%" stop-color="#c9e4f7"/><stop offset="100%" stop-color="#a9d2ea"/>' +
      '</linearGradient></defs>' +
      // Isbana med sarg
      '<ellipse class="jul-sarg" cx="120" cy="138" rx="102" ry="24" fill="#8a5a32" stroke="#5c3a1e" stroke-width="2"/>' +
      '<ellipse class="jul-is" cx="120" cy="136" rx="94" ry="20" fill="url(#jul-is)" stroke="#9ec5dc" stroke-width="1.2"/>' +
      '<path class="jul-skaren" d="M70 132 q18 -6 34 2 q16 8 36 -2 q14 -6 30 3" fill="none" stroke="#7ea8c0" stroke-width="1.1" opacity="0.7"/>' +
      '<path class="jul-skaren" d="M86 140 q22 5 40 -3 q20 -8 38 1" fill="none" stroke="#7ea8c0" stroke-width="0.9" opacity="0.55"/>' +
      // Gran
      '<rect class="jul-stam" x="114" y="118" width="12" height="18" rx="1.5" fill="#6b3f1a" stroke="#4a2a10" stroke-width="0.8"/>' +
      '<polygon class="jul-barr2" points="120,78 86,122 154,122" fill="#1a5c34" stroke="#0f3d22" stroke-width="0.8"/>' +
      '<polygon class="jul-barr" points="120,58 92,100 148,100" fill="#217a44" stroke="#14532d" stroke-width="0.8"/>' +
      '<polygon class="jul-barr" points="120,40 100,78 140,78" fill="#2a8f52" stroke="#166534" stroke-width="0.8"/>' +
      '<polygon class="jul-stjarna-topp" points="120,24 123.2,33.4 133,33.8 125.4,39.6 128.2,49 120,43.8 111.8,49 114.6,39.6 107,33.8 116.8,33.4" fill="#e6c35c" stroke="#9a7310" stroke-width="0.7"/>' +
      '<circle class="jul-kula-rod" cx="108" cy="86" r="3.2" fill="#b42222" stroke="#7a1212" stroke-width="0.6"/>' +
      '<circle class="jul-kula-guld" cx="132" cy="92" r="3" fill="#d4a017" stroke="#8a6a0c" stroke-width="0.6"/>' +
      '<circle class="jul-kula-gron" cx="118" cy="104" r="2.8" fill="#1f6b3a" stroke="#0f3d22" stroke-width="0.6"/>' +
      '<circle class="jul-kula-rod" cx="136" cy="70" r="2.6" fill="#b42222" stroke="#7a1212" stroke-width="0.6"/>' +
      '<circle class="jul-kula-guld" cx="106" cy="68" r="2.5" fill="#d4a017" stroke="#8a6a0c" stroke-width="0.6"/>' +
      '<g class="jul-gran-ljus">' +
      '<circle cx="120" cy="54" r="1.6" fill="#ffe08a"/><circle cx="112" cy="96" r="1.5" fill="#ffd36a"/>' +
      '<circle cx="128" cy="110" r="1.5" fill="#ffe08a"/><circle cx="100" cy="112" r="1.4" fill="#ffd36a"/>' +
      '</g>' +
      '<g transform="translate(168 118)"><g class="jul-akare">' +
      '<ellipse cx="0" cy="16" rx="7" ry="2.2" fill="#7aa0b8" opacity="0.45"/>' +
      '<rect x="-3.2" y="2" width="6.4" height="8" rx="2" fill="#c0392b"/>' +
      '<circle cx="0" cy="0" r="3.1" fill="#f6d2b3" stroke="#1a1a1a" stroke-width="0.5"/>' +
      '<path d="M-4 -1 L0 -9 L4 -1" fill="#c62828" stroke="#7a1212" stroke-width="0.5"/>' +
      '<circle cx="0" cy="-9.2" r="1.3" fill="#f5f0e6"/>' +
      '<path d="M-4 12 L6 12" stroke="#4a5568" stroke-width="1.2" stroke-linecap="round"/>' +
      '</g></g></svg>';
  }
  function ensureScen() {
    var scen = document.getElementById('jul-scen');
    if (!allowed()) {
      if (scen && scen.parentNode) scen.parentNode.removeChild(scen);
      return null;
    }
    if (!scen) {
      scen = document.createElement('div');
      scen.id = 'jul-scen';
      scen.setAttribute('aria-hidden', 'true');
      scen.hidden = true;
      scen.innerHTML = scenSvg() +
        '<button type="button" class="jul-scen-hit" aria-label="Julgran"> </button>';
      var hit = scen.querySelector && scen.querySelector('.jul-scen-hit');
      if (hit) {
        hit.addEventListener('click', function () {
          scen.classList.remove('jul-scen-pling');
          void scen.offsetWidth;
          scen.classList.add('jul-scen-pling');
          setTimeout(function () { if (scen) scen.classList.remove('jul-scen-pling'); }, 700);
        });
      }
    }
    return scen;
  }
  function hemRow() {
    if (window.ensureHemScen) return window.ensureHemScen();
    if (window.HB_STAGE && window.HB_STAGE.ensureHemScen) return window.HB_STAGE.ensureHemScen();
    return document.getElementById('td-hem-scen') || document.querySelector('.td-berra-slot');
  }
  function layoutScen(scen) {
    scen = scen || document.getElementById('jul-scen');
    if (!scen || !allowed() || !onHome()) return;
    var row = hemRow();
    var content = contentEl();
    if (row && row.appendChild) {
      if (scen.parentNode !== row) row.appendChild(scen);
      if (scen.style) scen.style.minHeight = '';
      var berra = row.querySelector('.td-berra');
      var bot = row.querySelector('#hb-stage');
      if (berra) row.insertBefore(berra, row.firstChild);
      if (scen) {
        if (bot) row.insertBefore(scen, bot);
        else row.appendChild(scen);
      }
      if (bot) row.appendChild(bot);
    } else if (content) {
      if (scen.parentNode !== content) content.appendChild(scen);
      if (scen.style) scen.style.minHeight = '';
    }
  }
  function maybeMountAdvent() {
    if (window.ADVENT && typeof window.ADVENT.mountMini === 'function') {
      window.ADVENT.mountMini();
      return;
    }
    var g = window.ADVENT_GATE;
    if (!g || !g.allowed || !g.allowed() || !window.LAZY || !LAZY.ensure) return;
    var t = g.today ? g.today() : null;
    if (!t || !(t.m === 12 || (t.m === 1 && t.d <= 6))) return;
    LAZY.ensure('advent').then(function () {
      if (window.ADVENT && ADVENT.mountMini) ADVENT.mountMini();
    }).catch(function () {});
  }
  function paintScen() {
    var scen = ensureScen();
    if (!scen) return;
    if (!allowed() || !onHome()) {
      scen.classList.remove('jul-on');
      scen.hidden = true;
      return;
    }
    scen.hidden = false;
    scen.classList.add('jul-on');
    if (scen.querySelector && !scen.querySelector('.jul-scen-svg')) {
      var hit = scen.querySelector && scen.querySelector('.jul-scen-hit');
      if (scen.insertAdjacentHTML) {
        scen.insertAdjacentHTML('afterbegin', scenSvg());
      } else if (!String(scen.innerHTML || '').includes('jul-scen-svg')) {
        scen.innerHTML = scenSvg() + (scen.innerHTML || '');
      }
      if (hit && !hit.parentNode) scen.appendChild(hit);
    }
    layoutScen(scen);
  }

  var obs = null;
  var slingorResize = false;
  function start() {
    if (burnTimer) { clearInterval(burnTimer); burnTimer = 0; }
    if (!allowed()) { paint(); return; }
    ensure();
    paint();
    maybeMountAdvent();
    burnTimer = setInterval(function () { if (allowed()) paint(); }, 60000);
    if (!slingorResize) {
      slingorResize = true;
      window.addEventListener('resize', function () { if (onHome()) { layoutLights(); layoutGirlang(); layoutScen(); } });
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
