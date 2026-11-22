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

  function flame(x, y) {
    return '<g class="jul-flame" transform="translate(' + x + ' ' + y + ')">' +
      '<path d="M0 8c2.2-2.4 3.2-4.2 2.2-6.4C1.6.4 0-1.2 0-1.2S-1.6.4-2.2 1.6C-3.2 3.8-2.2 5.6 0 8z" fill="#f6e05e"/>' +
      '<path d="M0 7c1.2-1.4 1.6-2.6 1-4.1C.6 1.8 0 .8 0 .8s-.6 1-1 2.1C-1.6 4.4-1.2 5.6 0 7z" fill="#ed8936"/>' +
      '</g>';
  }
  function candle(n, lit, x) {
    var body = lit ? '#f7fafc' : '#cbd5e0';
    var stroke = lit ? '#e2e8f0' : '#a0aec0';
    return '<g class="jul-c' + n + (lit ? ' on' : '') + '" transform="translate(' + x + ' 0)">' +
      '<rect x="-3" y="16" width="6" height="18" rx="1.2" fill="' + body + '" stroke="' + stroke + '" stroke-width=".6"/>' +
      '<rect x="-0.7" y="13.5" width="1.4" height="3" fill="' + (lit ? '#ed8936' : '#a0aec0') + '"/>' +
      (lit ? flame(0, 8) : '') +
      '</g>';
  }
  function svg(lit) {
    var xs = [14, 28, 42, 56], h = '', i;
    for (i = 0; i < 4; i++) h += candle(i + 1, i < lit, xs[i]);
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

  function paint() {
    var el = document.getElementById('jul-ljusstake');
    if (!el) return;
    if (!allowed() || !onHome()) {
      el.classList.remove('jul-on', 'jul-preview');
      el.hidden = true;
      return;
    }
    var lit = litCount();
    var preview = isPreviewing() || !!dateOverride();
    el.innerHTML = svg(lit) + '<span class="jul-hint">' + (preview ? 'Förhandsvisning' : '') + '</span>';
    el.classList.toggle('jul-preview', preview);
    el.classList.add('jul-on');
    el.hidden = false;
    el.setAttribute('aria-label', labelOf(lit, preview));
    el.title = preview
      ? ('Förhandsvisning: ' + (LABELS[lit] || '') + ' – tryck för att byta')
      : 'Adventsljusstake';
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
    if (document.getElementById('jul-ljusstake')) return;
    var btn = document.createElement('button');
    btn.id = 'jul-ljusstake';
    btn.type = 'button';
    btn.hidden = true;
    btn.addEventListener('click', cyclePreview);
    (document.body || document.documentElement).appendChild(btn);
  }

  var obs = null;
  function start() {
    if (!allowed()) { paint(); return; }
    ensure();
    paint();
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
