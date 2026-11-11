/* Hjälpbotens högtidsregister – datum, kläder och korta scener.
 *
 * Varje högtid: id, månad/dag (eller from/to) i Europe/Stockholm, återkommer varje år,
 * ev. outfits per figur, ev. mode ('tag' = luciatåg med alla tre, 'scen' = stämning),
 * ev. effects, lines per figur.
 * Animationer av: inga scener, inga högtidskläder.
 * Överraskning: nämns inte i Om, hjälp eller nyheter.
 * TESTVY: setTestDate('YYYY-MM-DD') eller sessionStorage hb_test_date.
 */
(function () {
  'use strict';

  var TZ = 'Europe/Stockholm';
  var CAP_MS = 10 * 60 * 1000;
  var KEY_DATE = 'hb_test_date';
  var KEY_LAST = 'hb_ht_last';
  var forced = null;
  var playing = false;
  var layer = null;
  var raf = 0;
  var playTimer = 0;

  var DAYS = [
    {
      id: 'lucia',
      month: 12,
      day: 13,
      mode: 'tag',
      order: ['diva', 'chauffor', 'robot'],
      outfits: { diva: 'lucia', robot: 'pepparkaka', chauffor: 'stjarngosse' },
      lines: {
        robot: 'Bip! Luciatåg detekterat. God Lucia. Mina kretsar doftar pepparkaka.',
        chauffor: 'God Lucia! Jag är stjärngosse i natt. Skämtet är ljust, precis som mössan.',
        diva: 'God Lucia, stjärna. Jag leder tåget – häng med om du vill. 😉'
      }
    },
    {
      id: 'halloween',
      month: 10,
      day: 31,
      mode: 'scen',
      effects: ['ghosts', 'pumpkins'],
      outfits: { robot: 'halloween-robot', chauffor: 'halloween-chauffor', diva: 'halloween-diva' },
      lines: {
        robot: 'Bip… rörelsesensorerna ser spöken. Sannolikt ofarliga. Troligen.',
        chauffor: 'Ingen fara, det är bara jag i jackan. Pumpan där borta är vänligare än den ser ut.',
        diva: 'Buu… nästan. Jag skrämmer ingen i kväll, jag charmar dem. 😉'
      }
    }
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function partsOf(date) {
    var f = new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    var o = {};
    f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return {
      year: +o.year,
      month: +o.month,
      day: +o.day,
      hour: +o.hour,
      minute: +o.minute,
      key: o.year + '-' + o.month + '-' + o.day
    };
  }

  function storedDate() {
    try {
      var s = sessionStorage.getItem(KEY_DATE);
      var m = s && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (m) return { year: +m[1], month: +m[2], day: +m[3], hour: 12, minute: 0, key: m[1] + '-' + m[2] + '-' + m[3] };
    } catch (e) {}
    return null;
  }

  function todayParts() {
    if (forced) return forced;
    var stored = storedDate();
    if (stored) return stored;
    return partsOf(new Date());
  }

  function setTestDate(ymd, hhmm) {
    forced = null;
    if (!ymd) {
      try { sessionStorage.removeItem(KEY_DATE); } catch (e) {}
      return null;
    }
    if (ymd instanceof Date) {
      forced = partsOf(ymd);
      return forced;
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
    if (!m) return null;
    var p = { year: +m[1], month: +m[2], day: +m[3], hour: 12, minute: 0, key: m[1] + '-' + m[2] + '-' + m[3] };
    if (hhmm && /^(\d{2}):(\d{2})$/.exec(hhmm)) {
      p.hour = +hhmm.slice(0, 2);
      p.minute = +hhmm.slice(3, 5);
    }
    forced = p;
    try { sessionStorage.setItem(KEY_DATE, m[1] + '-' + m[2] + '-' + m[3]); } catch (e2) {}
    return p;
  }

  function inDay(day, p) {
    if (day.from && day.to) {
      var a = day.from.month * 100 + day.from.day;
      var b = day.to.month * 100 + day.to.day;
      var n = p.month * 100 + p.day;
      if (a <= b) return n >= a && n <= b;
      return n >= a || n <= b;
    }
    return p.month === day.month && p.day === day.day;
  }

  function active(p) {
    p = p || todayParts();
    var i, d;
    for (i = 0; i < DAYS.length; i++) {
      d = DAYS[i];
      if (inDay(d, p)) return d;
    }
    return null;
  }

  function pageVisible() {
    try { return document.visibilityState === 'visible'; } catch (e) { return true; }
  }

  function animOn() {
    try { return !!(window.ANIMATIONER && window.ANIMATIONER.isOn && window.ANIMATIONER.isOn()); } catch (e) { return false; }
  }

  function reduceMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  function loadLast() {
    try { return JSON.parse(sessionStorage.getItem(KEY_LAST) || 'null'); } catch (e) { return null; }
  }
  function saveLast(o) {
    try { sessionStorage.setItem(KEY_LAST, JSON.stringify(o)); } catch (e) {}
  }

  function canStart(day, opts) {
    opts = opts || {};
    if (!day) return false;
    if (!opts.force) {
      if (!animOn()) return false;
      if (!pageVisible()) return false;
    }
    if (playing && !opts.force) return false;
    if (opts.skipCap) return true;
    var last = loadLast();
    var p = todayParts();
    if (last && last.id === day.id && last.key === p.key && last.at && (Date.now() - last.at) < CAP_MS) return false;
    return true;
  }

  function markStart(day) {
    saveLast({ id: day.id, key: todayParts().key, at: Date.now() });
  }

  function gearSvg(outfit) {
    if (!outfit) return '';
    var K = '#1a1a1a', Y = '#f5c518';
    if (outfit === 'lucia') {
      return '<g class="hb-gear hb-gear-lucia" aria-hidden="true">' +
        '<path d="M19 47 Q19 38 27 36 H37 Q45 38 45 47 L42 58 H22 Z" fill="#f7f1e1" stroke="' + K + '" stroke-width="1.2"/>' +
        '<path d="M22 44 L42 52" stroke="#b42318" stroke-width="2.2"/>' +
        '<path d="M20 16.5 Q32 11 44 16.5 Q32 20.5 20 16.5 Z" fill="#1f6b3a" stroke="#164c29" stroke-width="1"/>' +
        '<rect x="23.2" y="8.2" width="2.2" height="8.2" rx="0.6" fill="#f4f0e0" stroke="' + K + '" stroke-width="0.6"/>' +
        '<rect x="27.9" y="6.6" width="2.2" height="9.2" rx="0.6" fill="#f4f0e0" stroke="' + K + '" stroke-width="0.6"/>' +
        '<rect x="32.9" y="6.6" width="2.2" height="9.2" rx="0.6" fill="#f4f0e0" stroke="' + K + '" stroke-width="0.6"/>' +
        '<rect x="37.6" y="8.2" width="2.2" height="8.2" rx="0.6" fill="#f4f0e0" stroke="' + K + '" stroke-width="0.6"/>' +
        '<ellipse cx="24.3" cy="7.2" rx="1.3" ry="2.1" fill="#f5c518" stroke="#d4a40a" stroke-width="0.5"/>' +
        '<ellipse cx="29" cy="5.5" rx="1.3" ry="2.2" fill="#f5c518" stroke="#d4a40a" stroke-width="0.5"/>' +
        '<ellipse cx="34" cy="5.5" rx="1.3" ry="2.2" fill="#f5c518" stroke="#d4a40a" stroke-width="0.5"/>' +
        '<ellipse cx="38.7" cy="7.2" rx="1.3" ry="2.1" fill="#f5c518" stroke="#d4a40a" stroke-width="0.5"/>' +
        '</g>';
    }
    if (outfit === 'pepparkaka') {
      return '<g class="hb-gear hb-gear-pepparkaka" aria-hidden="true">' +
        '<path d="M18 14 Q18 6 32 5 Q46 6 46 14 L48 36 Q48 58 32 60 Q16 58 16 36 Z" fill="#a65b2b" stroke="#6e3a18" stroke-width="1.3"/>' +
        '<path d="M21 16 Q32 12 43 16" fill="none" stroke="#f4efe6" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path d="M20 38 Q32 34 44 38" fill="none" stroke="#f4efe6" stroke-width="1.4" stroke-linecap="round"/>' +
        '<circle cx="32" cy="40" r="1.5" fill="#f4efe6"/><circle cx="32" cy="46" r="1.5" fill="#f4efe6"/><circle cx="32" cy="52" r="1.5" fill="#f4efe6"/>' +
        '<path d="M26 30 Q32 35 38 30" fill="none" stroke="#f4efe6" stroke-width="1.3" stroke-linecap="round"/>' +
        '<circle cx="26.5" cy="24.5" r="1.7" fill="#3a1d0d"/><circle cx="37.5" cy="24.5" r="1.7" fill="#3a1d0d"/>' +
        '<circle cx="27.1" cy="24" r="0.5" fill="#f4efe6"/><circle cx="38.1" cy="24" r="0.5" fill="#f4efe6"/>' +
        '</g>';
    }
    if (outfit === 'stjarngosse') {
      return '<g class="hb-gear hb-gear-stjarngosse" aria-hidden="true">' +
        '<path d="M19 46 Q19 37 27 35 H37 Q45 37 45 46 L42 59 H22 Z" fill="#f7f1e1" stroke="' + K + '" stroke-width="1.2"/>' +
        '<path d="M32 -6 L44 16 H20 Z" fill="#f7f1e1" stroke="' + K + '" stroke-width="1.2"/>' +
        '<path d="M32 -6 L38 5 L32 3 L26 5 Z" fill="' + Y + '" stroke="' + K + '" stroke-width="0.7"/>' +
        '<path d="M32 -11 L33.6 -7.2 L37.8 -7 L34.6 -4.6 L35.6 -0.6 L32 -2.8 L28.4 -0.6 L29.4 -4.6 L26.2 -7 L30.4 -7.2 Z" fill="' + Y + '" stroke="' + K + '" stroke-width="0.7"/>' +
        '</g>';
    }
    if (outfit === 'halloween-diva') {
      return '<g class="hb-gear hb-gear-hw-diva" aria-hidden="true">' +
        '<path d="M32 1 L52 22 H12 Z" fill="#1a1420" stroke="' + K + '" stroke-width="1.2"/>' +
        '<rect x="14" y="21" width="36" height="3.2" fill="#1a1420" stroke="' + K + '" stroke-width="0.8"/>' +
        '<path d="M32 6 L35 16 H29 Z" fill="#7c3aed" stroke="' + K + '" stroke-width="0.6"/>' +
        '<circle cx="32" cy="12" r="1.2" fill="' + Y + '"/>' +
        '</g>';
    }
    if (outfit === 'halloween-robot') {
      return '<g class="hb-gear hb-gear-hw-robot" aria-hidden="true">' +
        '<path d="M20 8 Q32 2 44 8 L46 24 Q32 30 18 24 Z" fill="#e07a16" stroke="#8a4510" stroke-width="1.2"/>' +
        '<rect x="30.2" y="1" width="3.6" height="6" rx="1" fill="#2f6b2f" stroke="' + K + '" stroke-width="0.6"/>' +
        '<path d="M26 16 L28.5 19 L24.5 19 Z" fill="#1a1a1a"/><path d="M38 16 L40.5 19 L36.5 19 Z" fill="#1a1a1a"/>' +
        '<path d="M28 22 Q32 25 36 22" fill="none" stroke="#1a1a1a" stroke-width="1.2"/>' +
        '</g>';
    }
    if (outfit === 'halloween-chauffor') {
      return '<g class="hb-gear hb-gear-hw-chauffor" aria-hidden="true">' +
        '<path d="M16 40 Q32 48 48 40 L50 60 H14 Z" fill="#1a1420" stroke="' + K + '" stroke-width="1.1" opacity="0.92"/>' +
        '<circle cx="50" cy="14" r="5.4" fill="#e07a16" stroke="#8a4510" stroke-width="1"/>' +
        '<rect x="48.6" y="7.2" width="2.8" height="3.2" fill="#2f6b2f"/>' +
        '<path d="M48 13.2 L49.2 14.6 L47.4 14.6 Z" fill="#1a1a1a"/><path d="M52 13.2 L53.2 14.6 L51.4 14.6 Z" fill="#1a1a1a"/>' +
        '<path d="M48.6 16 Q50 17.2 51.4 16" fill="none" stroke="#1a1a1a" stroke-width="0.8"/>' +
        '</g>';
    }
    return '';
  }

  function outfitFor(day, char) {
    if (!day || !day.outfits) return '';
    return day.outfits[char] || '';
  }

  function css() {
    if (document.getElementById('hb-ht-css')) return;
    var s = document.createElement('style');
    s.id = 'hb-ht-css';
    s.textContent =
      '#hb-hogtid-layer{position:fixed;inset:0;z-index:47;pointer-events:none!important;overflow:hidden}' +
      '#hb-hogtid-layer *{pointer-events:none!important}' +
      '.hb-ht-walker{position:absolute;left:0;top:0;width:48px;height:48px;will-change:transform;overflow:visible}' +
      '.hb-ht-walker svg{width:48px;height:48px;display:block;overflow:visible}' +
      '.hb-ht-walker.hb-walk svg{animation:hb-stride .36s ease-in-out infinite alternate}' +
      '.hb-ht-ghost{position:absolute;width:28px;height:36px;opacity:.86}' +
      '.hb-ht-ghost svg{width:100%;height:100%;display:block;overflow:visible}' +
      '.hb-ht-pump{position:absolute;width:26px;height:24px}' +
      '.hb-ht-pump svg{width:100%;height:100%;display:block}' +
      '.hb-ht-g1{animation:hb-ht-float 7.5s ease-in-out infinite}' +
      '.hb-ht-g2{animation:hb-ht-float 9s ease-in-out infinite reverse}' +
      '.hb-ht-g3{animation:hb-ht-float 6.4s ease-in-out infinite}' +
      '@keyframes hb-ht-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}' +
      '@media (prefers-reduced-motion:reduce){.hb-ht-walker svg,.hb-ht-g1,.hb-ht-g2,.hb-ht-g3{animation:none!important}}';
    document.head.appendChild(s);
  }

  function ensureLayer() {
    css();
    layer = document.getElementById('hb-hogtid-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'hb-hogtid-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    return layer;
  }

  function clearLayer() {
    if (raf) { try { cancelAnimationFrame(raf); } catch (e) {} raf = 0; }
    clearTimeout(playTimer);
    playing = false;
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = null;
    try {
      var w = document.querySelector('.hb-walker');
      if (w) w.style.visibility = '';
      var st = document.querySelector('.hb-station');
      if (st) st.style.visibility = '';
    } catch (e2) {}
  }

  function stopPlay() { clearLayer(); }

  function charSvg(id) {
    try {
      var C = window.HJALPBOT && HJALPBOT.chars && HJALPBOT.chars[id];
      return C && C.svg ? C.svg() : '';
    } catch (e) { return ''; }
  }

  function dress(svgHtml, outfit) {
    var gear = gearSvg(outfit);
    if (!gear) return svgHtml;
    if (svgHtml.indexOf('</svg>') >= 0) return svgHtml.replace('</svg>', gear + '</svg>');
    return svgHtml + gear;
  }

  function ghostSvg() {
    return '<svg viewBox="0 0 28 36" aria-hidden="true"><g fill="#f4f1ea" stroke="#1a1a1a" stroke-width="1.1" stroke-linejoin="round">' +
      '<path d="M4 16 Q4 4 14 4 Q24 4 24 16 L24 30 Q21 26 18 30 Q14 25 10 30 Q7 26 4 30 Z"/>' +
      '<circle cx="10.5" cy="15" r="1.6" fill="#1a1a1a" stroke="none"/><circle cx="17.5" cy="15" r="1.6" fill="#1a1a1a" stroke="none"/>' +
      '<circle cx="11" cy="14.4" r="0.45" fill="#fff" stroke="none"/><circle cx="18" cy="14.4" r="0.45" fill="#fff" stroke="none"/>' +
      '<ellipse cx="14" cy="21" rx="2.1" ry="1.3" fill="#1a1a1a" stroke="none"/>' +
      '</g></svg>';
  }
  function pumpkinSvg() {
    return '<svg viewBox="0 0 26 24" aria-hidden="true">' +
      '<rect x="11.2" y="1" width="3.2" height="5" rx="1" fill="#2f6b2f" stroke="#1a1a1a" stroke-width="0.7"/>' +
      '<ellipse cx="13" cy="14.5" rx="10.2" ry="8.2" fill="#e07a16" stroke="#8a4510" stroke-width="1.1"/>' +
      '<path d="M13 6.6 Q16 14.5 13 22.4 M13 6.6 Q10 14.5 13 22.4" fill="none" stroke="#c45e10" stroke-width="0.8"/>' +
      '<path d="M9 12.2 L11.2 14.4 L7.6 14.4 Z M17 12.2 L19.2 14.4 L15.6 14.4 Z" fill="#1a1a1a"/>' +
      '<path d="M10.2 17.4 Q13 19.4 15.8 17.4" fill="none" stroke="#1a1a1a" stroke-width="1"/>' +
      '</svg>';
  }

  function hideMain(on) {
    try {
      var w = document.querySelector('.hb-walker');
      var st = document.querySelector('.hb-station');
      if (w) w.style.visibility = on ? 'hidden' : '';
      if (st) st.style.visibility = on ? 'hidden' : '';
    } catch (e) {}
  }

  function aisleY() {
    var h = window.innerHeight || 600;
    var y = Math.round(h * 0.62);
    return Math.max(90, Math.min(h - 96, y));
  }

  function placeTag(walkers, progress, y) {
    var w = window.innerWidth || 412;
    var start = -72, end = w + 20, gap = 64, i, x;
    for (i = 0; i < walkers.length; i++) {
      x = start + (end - start) * progress - i * gap;
      walkers[i].style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    }
  }

  function buildTag(day) {
    var L = ensureLayer();
    L.innerHTML = '';
    var order = day.order || ['diva', 'chauffor', 'robot'];
    var walkers = [], i, id, node, html;
    for (i = 0; i < order.length; i++) {
      id = order[i];
      html = dress(charSvg(id), outfitFor(day, id));
      if (!html) continue;
      node = document.createElement('div');
      node.className = 'hb-ht-walker hb-walk';
      node.setAttribute('data-char', id);
      node.innerHTML = html;
      L.appendChild(node);
      walkers.push(node);
    }
    return walkers;
  }

  function playTag(day, opts) {
    opts = opts || {};
    var walkers = buildTag(day);
    if (!walkers.length) { clearLayer(); return false; }
    var y = aisleY();
    var freeze = opts.progress;
    if (freeze != null) {
      placeTag(walkers, freeze, y);
      walkers.forEach(function (n) { n.classList.add('hb-walk'); });
      hideMain(true);
      playing = true;
      return true;
    }
    hideMain(true);
    playing = true;
    if (!opts.skipCap) markStart(day);
    if (reduceMotion() || opts.static) {
      placeTag(walkers, 0.42, y);
      walkers.forEach(function (n) { n.classList.remove('hb-walk'); });
      playTimer = setTimeout(function () { stopPlay(); }, 2800);
      return true;
    }
    var t0 = 0, dur = 11000;
    function step(ts) {
      if (!playing) return;
      if (!pageVisible() || !animOn()) { stopPlay(); return; }
      if (!t0) t0 = ts;
      var p = (ts - t0) / dur;
      if (p >= 1) { stopPlay(); return; }
      placeTag(walkers, p, y);
      raf = requestAnimationFrame(step);
    }
    placeTag(walkers, 0, y);
    raf = requestAnimationFrame(step);
    return true;
  }

  function buildScen(day) {
    var L = ensureLayer();
    L.innerHTML = '';
    var fx = day.effects || [];
    var w = window.innerWidth || 412, h = window.innerHeight || 700, g, p;
    if (fx.indexOf('ghosts') >= 0) {
      g = document.createElement('div'); g.className = 'hb-ht-ghost hb-ht-g1'; g.style.left = '10%'; g.style.top = '70%'; g.innerHTML = ghostSvg(); L.appendChild(g);
      g = document.createElement('div'); g.className = 'hb-ht-ghost hb-ht-g2'; g.style.left = '78%'; g.style.top = '58%'; g.innerHTML = ghostSvg(); L.appendChild(g);
      g = document.createElement('div'); g.className = 'hb-ht-ghost hb-ht-g3'; g.style.left = '46%'; g.style.top = '80%'; g.innerHTML = ghostSvg(); L.appendChild(g);
    }
    if (fx.indexOf('pumpkins') >= 0) {
      p = document.createElement('div'); p.className = 'hb-ht-pump'; p.style.left = '6px'; p.style.bottom = '10px'; p.innerHTML = pumpkinSvg(); L.appendChild(p);
      p = document.createElement('div'); p.className = 'hb-ht-pump'; p.style.right = '10px'; p.style.left = 'auto'; p.style.bottom = '12px'; p.innerHTML = pumpkinSvg(); L.appendChild(p);
      if (w >= 700) {
        p = document.createElement('div'); p.className = 'hb-ht-pump'; p.style.left = Math.round(w * 0.45) + 'px'; p.style.bottom = '8px'; p.innerHTML = pumpkinSvg(); L.appendChild(p);
      }
    }
    return L;
  }

  function playScen(day, opts) {
    opts = opts || {};
    buildScen(day);
    playing = true;
    if (!opts.skipCap && opts.progress == null) markStart(day);
    return true;
  }

  function play(day, opts) {
    opts = opts || {};
    day = day || active();
    if (!day) return false;
    if (!opts.force && !canStart(day, opts)) return false;
    stopPlay();
    if (day.mode === 'tag') return playTag(day, opts);
    return playScen(day, opts);
  }

  function maybePlay() {
    if (!animOn() || !pageVisible()) {
      if (playing) stopPlay();
      return false;
    }
    var day = active();
    if (!day) {
      if (playing) stopPlay();
      return false;
    }
    if (playing) return false;
    return play(day);
  }

  function onVisibility() {
    if (!pageVisible()) {
      if (playing) stopPlay();
      return;
    }
    maybePlay();
  }

  function lineFor(day, char) {
    day = day || active();
    if (!day || !day.lines) return null;
    return day.lines[char] || null;
  }

  window.HJALPBOT_HOGTID = {
    all: function () { return DAYS.slice(); },
    active: function (p) { return active(p); },
    today: todayParts,
    setTestDate: setTestDate,
    clearTestDate: function () { return setTestDate(null); },
    pageVisible: pageVisible,
    canStart: canStart,
    play: play,
    maybePlay: maybePlay,
    stop: stopPlay,
    playing: function () { return playing; },
    onVisibility: onVisibility,
    gearSvg: gearSvg,
    outfitFor: function (char, day) { return outfitFor(day || active(), char); },
    lineFor: lineFor,
    capMs: CAP_MS,
    tz: TZ
  };
})();
