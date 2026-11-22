/* Hjälpbotens station och strålkastare i startskärmens hörn.
 * Inget kort: när strålkastaren är släckt visas bara en stilla, nedtonad bild
 * (robot i laddstation, chaufför i bil, eller diva vid sminkbord) utan att
 * hämta tunga hjalpbot*.js / berra.js. Ingen På/Av-knapp: tryck på lampan
 * eller figuren för att tända och släcka (liten överraskning).
 * Ett tryck tänder ljuset, laddar hjälpboten och visar den på samma plats
 * (ingen dubblett, samma höjd som när ljuset är släckt). */
(function () {
  'use strict';
  if (window.HB_STAGE) return;

  var CHAR_DEFAULT = 'robot';
  var VALID_CHARS = { robot: 1, chauffor: 1, diva: 1, off: 1 };
  var WID = 112, SCENE_H = 64, LAMP_H = 30, TOT_H = SCENE_H + LAMP_H;
  var MARGIN = 8;
  var placed = null;
  var host = null;
  var bound = false;

  function driverId() { try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; } }
  function charKey() { return 'hb_char_' + (driverId() || 'default'); }
  function lightKey() { return 'taxi_hb_light:' + (driverId() || 'default'); }

  function charId() {
    var c = null;
    try { c = localStorage.getItem(charKey()); } catch (e) {}
    if (c === 'cool') c = 'robot';
    return VALID_CHARS[c] ? c : CHAR_DEFAULT;
  }
  function isLit() {
    try { return localStorage.getItem(lightKey()) === '1'; } catch (e) { return false; }
  }
  function setLitLocal(on) {
    try { localStorage.setItem(lightKey(), on ? '1' : '0'); } catch (e) {}
  }
  function isHome() {
    var app = document.getElementById('app');
    return !!(app && app.classList && app.classList.contains('is-home') && app.style.display !== 'none');
  }

  function css() {
    var s = document.getElementById('hb-stage-css');
    if (!s) {
      s = document.createElement('style');
      s.id = 'hb-stage-css';
    }
    s.textContent =
      '.hb-stage{position:fixed;left:0;top:0;width:' + WID + 'px;height:' + TOT_H + 'px;z-index:44;pointer-events:none;overflow:visible;background:none;border:0;padding:0;margin:0;color:#e2e8f0}' +
      '.hb-stage.hb-hidden{display:none}' +
      '.hb-stage-beam{position:absolute;left:0;top:0;width:' + WID + 'px;height:' + TOT_H + 'px;pointer-events:none;z-index:1;display:block;overflow:visible}' +
      '.hb-stage-light{position:relative;height:' + LAMP_H + 'px;width:100%;display:flex;align-items:flex-end;justify-content:center;z-index:2;' +
        'pointer-events:auto;cursor:pointer;border:0;background:none;padding:0;margin:0;color:inherit}' +
      '.hb-stage-lamp{display:block;flex:0 0 auto;width:28px;height:22px;pointer-events:none}' +
      '.hb-stage-scene{pointer-events:auto;cursor:pointer;position:relative;height:' + SCENE_H + 'px;z-index:2}' +
      '.hb-stage-svg{width:100%;height:' + SCENE_H + 'px;display:block;overflow:visible}';
    if (!s.parentNode) (document.head || document.documentElement).appendChild(s);
  }

  function lampSvg(lit) {
    return '<svg class="hb-stage-lamp" viewBox="0 0 40 32" aria-hidden="true">' +
      '<path d="M20 1 v7" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M14 8 h12 v4 h-12 z" fill="#334155" stroke="#0f172a" stroke-width="1.2"/>' +
      '<g transform="rotate(10 20 16)">' +
        '<rect x="12" y="10" width="16" height="11" rx="3" fill="#1e293b" stroke="#0f172a" stroke-width="1.3"/>' +
        '<path d="M12 21 l-3 6 h22 l-3 -6 z" fill="#0f172a" stroke="#334155" stroke-width="1"/>' +
        '<ellipse cx="20" cy="21" rx="6" ry="2" fill="' + (lit ? '#fef08a' : '#334155') + '"/>' +
      '</g></svg>';
  }

  function sceneSvg(id, lit) {
    var dimOp = lit ? '1' : '0.42';
    var floor = lit ? '' : '<ellipse cx="60" cy="60" rx="48" ry="5" fill="#0b1019" opacity="0.65"/>';
    var art = '';
    if (id === 'chauffor') {
      var signFill = lit ? '#f5c518' : '#2d3748';
      var signTxt = lit ? '#1a202c' : '#4a5568';
      var hlFill = lit ? '#fef08a' : '#334155';
      var fig = lit ? '' :
        '<g opacity="' + dimOp + '">' +
          '<rect x="44" y="6" width="28" height="8" rx="2" fill="' + signFill + '" stroke="#0f172a" stroke-width="1.2"/>' +
          '<text x="58" y="12" text-anchor="middle" font-size="6" font-weight="800" font-family="Arial,sans-serif" fill="' + signTxt + '">TAXI</text>' +
          '<path d="M18 36 l10 -16 h44 l14 16 h16 q6 0 6 7 v10 h-96 v-12 q0 -5 8 -5 z" fill="#1e293b" stroke="#0f172a" stroke-width="1.6"/>' +
          '<path d="M32 22 h20 v12 h-24 z M56 22 h18 l10 12 h-28 z" fill="#0f172a" opacity="0.85"/>' +
          '<circle cx="64" cy="28" r="4.5" fill="#475569"/>' +
          '<path d="M59 25 q5 -4 10 0 z" fill="' + signFill + '"/>' +
          '<rect x="28" y="40" width="68" height="4" fill="#334155" opacity="0.85"/>' +
          '<circle cx="108" cy="40" r="3" fill="' + hlFill + '"/>' +
          '<circle cx="36" cy="52" r="8" fill="#0f172a" stroke="#475569" stroke-width="1.6"/><circle cx="36" cy="52" r="3" fill="#64748b"/>' +
          '<circle cx="86" cy="52" r="8" fill="#0f172a" stroke="#475569" stroke-width="1.6"/><circle cx="86" cy="52" r="3" fill="#64748b"/>' +
        '</g>';
      var dock = !lit ? '' :
        '<g opacity="1">' +
          '<path d="M18 36 l10 -16 h44 l14 16 h16 q6 0 6 7 v10 h-96 v-12 q0 -5 8 -5 z" fill="#334155" stroke="#0f172a" stroke-width="1.6"/>' +
          '<path d="M32 22 h20 v12 h-24 z M56 22 h18 l10 12 h-28 z" fill="#0f172a" opacity="0.85"/>' +
          '<rect x="44" y="6" width="28" height="8" rx="2" fill="' + signFill + '" stroke="#0f172a" stroke-width="1.2"/>' +
          '<text x="58" y="12" text-anchor="middle" font-size="6" font-weight="800" font-family="Arial,sans-serif" fill="' + signTxt + '">TAXI</text>' +
          '<rect x="28" y="40" width="68" height="4" fill="#f5c518" opacity="0.85"/>' +
          '<circle cx="108" cy="40" r="3" fill="' + hlFill + '"/>' +
          '<circle cx="36" cy="52" r="8" fill="#0f172a" stroke="#475569" stroke-width="1.6"/><circle cx="36" cy="52" r="3" fill="#64748b"/>' +
          '<circle cx="86" cy="52" r="8" fill="#0f172a" stroke="#475569" stroke-width="1.6"/><circle cx="86" cy="52" r="3" fill="#64748b"/>' +
        '</g>';
      art = fig || dock;
    } else if (id === 'diva') {
      var bulb = lit ? '#fef08a' : '#334155';
      var dress = '#3b4252';
      var desk =
        '<rect x="14" y="8" width="40" height="32" rx="6" fill="#1e293b" stroke="#475569" stroke-width="1.6"/>' +
        '<rect x="20" y="13" width="28" height="22" rx="4" fill="' + (lit ? '#7dd3fc' : '#0f172a') + '" opacity="0.7"/>' +
        '<circle cx="20" cy="10" r="2" fill="' + bulb + '"/><circle cx="34" cy="8" r="2" fill="' + bulb + '"/><circle cx="48" cy="10" r="2" fill="' + bulb + '"/>' +
        '<circle cx="16" cy="24" r="2" fill="' + bulb + '"/><circle cx="52" cy="24" r="2" fill="' + bulb + '"/>' +
        '<rect x="8" y="40" width="54" height="6" rx="2" fill="#475569"/>' +
        '<path d="M14 46 v12 M56 46 v12" stroke="#334155" stroke-width="2.4"/>';
      var fig = lit ? '' :
        '<g opacity="' + dimOp + '">' + desk +
          '<circle cx="80" cy="24" r="7" fill="#475569"/>' +
          '<path d="M73 24 q0 -8 7 -8 q7 0 7 8 q-2 -4 -7 -3 q-5 1 -7 3 z" fill="#7c2d12"/>' +
          '<path d="M72 36 q0 -6 8 -6 q8 0 8 6 l-2 10 h-12 z" fill="' + dress + '"/>' +
          '<rect x="73" y="48" width="16" height="4" rx="2" fill="#e11d48"/>' +
          '<path d="M80 52 v8 M74 60 h12" stroke="#475569" stroke-width="2"/>' +
        '</g>';
      art = fig || ('<g>' + desk + '</g>');
    } else {
      var batt = lit ? '#4ade80' : '#334155';
      var visor = '#334155';
      var dock =
        '<rect x="8" y="16" width="28" height="44" rx="5" fill="#1e293b" stroke="#475569" stroke-width="1.6"/>' +
        '<rect x="14" y="22" width="16" height="6" rx="1.5" fill="' + batt + '"/>' +
        '<rect x="14" y="31" width="16" height="6" rx="1.5" fill="' + batt + '" opacity="0.7"/>' +
        '<path d="M36 48 q8 0 12 -8" fill="none" stroke="#64748b" stroke-width="2.4" stroke-linecap="round"/>';
      var fig = lit ? '' :
        '<g opacity="' + dimOp + '">' + dock +
          '<rect x="52" y="14" width="26" height="18" rx="7" fill="#334155" stroke="#0f172a" stroke-width="1.3"/>' +
          '<rect x="56" y="18" width="18" height="10" rx="4" fill="#0f172a"/>' +
          '<circle cx="61" cy="23" r="1.6" fill="' + visor + '"/><circle cx="69" cy="23" r="1.6" fill="' + visor + '"/>' +
          '<rect x="58" y="10" width="14" height="4" rx="1.5" fill="' + visor + '"/>' +
          '<rect x="54" y="33" width="22" height="18" rx="6" fill="#334155" stroke="#0f172a" stroke-width="1.3"/>' +
          '<rect x="58" y="37" width="14" height="7" rx="2" fill="' + visor + '"/>' +
          '<circle cx="60" cy="54" r="4.5" fill="#0f172a"/><circle cx="70" cy="54" r="4.5" fill="#0f172a"/>' +
        '</g>';
      art = fig || ('<g>' + dock + '</g>');
    }
    return '<svg class="hb-stage-svg" viewBox="0 0 120 64" aria-hidden="true">' + floor + art + '</svg>';
  }

  function wakeBot() {
    if (window.HJALPBOT) {
      if (window.HJALPBOT.tick) window.HJALPBOT.tick();
      return Promise.resolve();
    }
    if (window.LAZY && LAZY.ensure) {
      return LAZY.ensure('hjalpbot').then(function () {
        if (window.HJALPBOT && window.HJALPBOT.tick) window.HJALPBOT.tick();
      }).catch(function () {});
    }
    return Promise.resolve();
  }

  function overlaps(a, b) { return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t; }

  function obstacles() {
    var obs = [];
    function add(node, extra) {
      if (!node || (node.style && node.style.display === 'none')) return;
      if (node.classList && node.classList.contains('hb-hidden')) return;
      var r = node.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      var p = extra == null ? 6 : extra;
      obs.push({ l: r.left - p, t: r.top - p, r: r.right + p, b: r.bottom + p });
    }
    var vis = document.querySelector('#app.is-home .td-sida.td-vis') ||
      document.querySelector('#app.is-home #content') ||
      document.querySelector('#app.is-home');
    if (vis && vis.querySelectorAll) {
      vis.querySelectorAll('.icon, .td-folder, .td-slot-empty, .td-slot-plus').forEach(function (n) { add(n, 4); });
    }
    document.querySelectorAll('.home-devices-h, .home-dev, .home-dev-ask, #td-dots, #profile-menu').forEach(function (n) { add(n, 8); });
    var h = document.querySelector('#app header') || document.querySelector('header');
    if (h) {
      var r = h.getBoundingClientRect();
      obs.push({ l: 0, t: -20, r: window.innerWidth, b: Math.ceil(r.bottom) + 4 });
    }
    return obs;
  }

  function fits(x, y, obs) {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (x < 4 || y < 4 || x + WID > vw - 4 || y + TOT_H > vh - 2) return false;
    var box = { l: x, t: y, r: x + WID, b: y + TOT_H }, i;
    for (i = 0; i < obs.length; i++) if (overlaps(box, obs[i])) return false;
    return true;
  }

  function findPlace() {
    if (!isHome() || charId() === 'off') return null;
    var vw = window.innerWidth, vh = window.innerHeight;
    var obs = obstacles();
    var floor = vh - 6, wr, dots = document.getElementById('td-dots');
    var y = Math.round(floor - TOT_H);
    var right = Math.max(MARGIN, vw - WID - 12);
    var xs = [right, MARGIN];
    if (dots && dots.style.display !== 'none') {
      wr = dots.getBoundingClientRect();
      if (wr.width > 4 && wr.height > 4) {
        xs.push(Math.max(MARGIN, Math.round(wr.right + 8)));
        xs.push(Math.min(vw - WID - MARGIN, Math.round(wr.left - 8 - WID)));
      }
    }
    function tryY(yy) {
      var seen = {}, i, xi, k;
      for (i = 0; i < xs.length; i++) {
        xi = xs[i];
        k = xi + ',' + yy;
        if (seen[k]) continue;
        seen[k] = 1;
        if (fits(xi, yy, obs)) return { x: xi, y: yy };
      }
      return null;
    }
    var hit = tryY(y);
    if (hit) return hit;
    if (dots && dots.getBoundingClientRect().height > 4) {
      hit = tryY(Math.round(dots.getBoundingClientRect().top - 8 - TOT_H));
      if (hit) return hit;
    }
    var lift;
    for (lift = 8; lift <= 200; lift += 8) {
      hit = tryY(Math.round(floor - TOT_H - lift));
      if (hit) return hit;
    }
    return { x: right, y: Math.max(MARGIN, Math.min(y, vh - TOT_H - 2)) };
  }

  function room() {
    if (!placed) return null;
    return { x: placed.x, y: placed.y + LAMP_H, w: WID, h: SCENE_H, at: 'hornet' };
  }

  // Ståplats i scenen, fötterna på golvet. Samma y oavsett tänd/släckt.
  // x mittas under lampan (robot) eller vid figurens plats i den släckta bilden.
  function standLocal(id) {
    var sx = WID / 120, SIZE = 40;
    var y = LAMP_H + SCENE_H - SIZE - 2;
    var x;
    if (id === 'diva') x = 80 * sx - SIZE / 2;
    else if (id === 'chauffor') x = 36 * sx - SIZE / 2;
    else x = 60 * sx - SIZE / 2;
    if (x < 0) x = 0;
    if (x + SIZE > WID) x = WID - SIZE;
    return { x: x, y: y };
  }
  function standPoint(id) {
    if (!placed) return null;
    var s = standLocal(id);
    return { x: placed.x + s.x, y: placed.y + s.y };
  }
  // Konen utgår från lampans huvud och ljusfläcken ligger under figuren.
  function beamOverlay(id) {
    var s = standLocal(id || charId());
    var cx = s.x + 20, cy = s.y + 34;
    var hx = WID / 2, hy = 22;
    var halfTop = 5, halfBot = 22;
    return '<svg class="hb-stage-beam" viewBox="0 0 ' + WID + ' ' + TOT_H + '" aria-hidden="true">' +
      '<defs><linearGradient id="hbBeam" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#fef08a" stop-opacity="0.9"/>' +
        '<stop offset="75%" stop-color="#fef08a" stop-opacity="0.18"/>' +
        '<stop offset="100%" stop-color="#fef08a" stop-opacity="0.03"/>' +
      '</linearGradient></defs>' +
      '<polygon points="' + (hx - halfTop) + ',' + hy + ' ' + (hx + halfTop) + ',' + hy + ' ' +
        (cx + halfBot) + ',' + cy + ' ' + (cx - halfBot) + ',' + cy + '" fill="url(#hbBeam)" opacity="0.62"/>' +
      '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + halfBot + '" ry="6" fill="#fef08a" opacity="0.3"/>' +
      '</svg>';
  }

  function ensureHost() {
    if (host && host.parentNode) return host;
    host = document.createElement('div');
    host.id = 'hb-stage';
    host.className = 'hb-stage hb-hidden';
    document.body.appendChild(host);
    return host;
  }

  function hide() {
    placed = null;
    if (host) host.classList.add('hb-hidden');
  }

  function place(force) {
    if (!host) return null;
    var vw = window.innerWidth, vh = window.innerHeight;
    var next = null;
    var sameView = placed && placed.vw === vw && placed.vh === vh;
    if (!force && sameView && fits(placed.x, placed.y, obstacles())) {
      next = { x: placed.x, y: placed.y, vw: vw, vh: vh };
    } else {
      next = findPlace();
      if (next) { next.vw = vw; next.vh = vh; }
    }
    placed = next;
    if (!next) { host.classList.add('hb-hidden'); return null; }
    host.classList.remove('hb-hidden');
    host.style.transform = 'translate3d(' + Math.round(next.x) + 'px,' + Math.round(next.y) + 'px,0)';
    return next;
  }

  function toggle() {
    var next = !isLit();
    setLitLocal(next);
    paint();
    if (next) wakeBot();
    else if (window.HJALPBOT && window.HJALPBOT.tick) window.HJALPBOT.tick();
  }
  function onFigTap(e) {
    if (e) e.stopPropagation();
    if (isLit() && window.HJALPBOT && window.HJALPBOT.bubbleOn && window.HJALPBOT.bubbleOn()) {
      if (window.HJALPBOT.poke) window.HJALPBOT.poke();
      return;
    }
    toggle();
  }
  function wire() {
    if (!host) return;
    var lamp = document.getElementById('hb-stage-lamp-btn');
    var scn = document.getElementById('hb-stage-scene');
    if (lamp) lamp.onclick = function (e) { e.stopPropagation(); toggle(); };
    if (scn) {
      scn.onclick = onFigTap;
      scn.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFigTap(e); }
      };
    }
  }

  function paint() {
    if (!host) return;
    var c = charId();
    if (c === 'off' || !isHome()) { hide(); return; }
    css();
    var lit = isLit();
    host.className = 'hb-stage' + (lit ? ' lit' : '');
    host.innerHTML =
      (lit ? beamOverlay(c) : '') +
      '<button type="button" class="hb-stage-light" id="hb-stage-lamp-btn" aria-label="Strålkastare" aria-pressed="' + (lit ? 'true' : 'false') + '">' +
        lampSvg(lit) +
      '</button>' +
      '<div class="hb-stage-scene" id="hb-stage-scene" role="button" tabindex="0" aria-label="Hjälpbot">' +
        sceneSvg(c, lit) +
      '</div>';
    wire();
    place();
    if (lit && !window.HJALPBOT) {
      setTimeout(function () { if (isLit()) wakeBot(); }, 400);
    }
  }

  function bind() {
    if (bound || typeof window === 'undefined' || !window.addEventListener) return;
    bound = true;
    window.addEventListener('resize', function () { place(true); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { place(true); }, 60); });
  }

  function render() {
    if (typeof document === 'undefined' || !document.body) return;
    if (charId() === 'off' || !isHome()) {
      if (host) hide();
      return;
    }
    css();
    ensureHost();
    bind();
    paint();
  }

  function sync() {
    if (!isHome() || charId() === 'off') { hide(); return; }
    if (!host) render();
    else { if (!host.innerHTML) paint(); else place(); }
  }

  window.HB_STAGE = {
    render: render,
    sync: sync,
    hide: hide,
    place: place,
    room: room,
    standPoint: standPoint,
    isLit: isLit,
    toggle: toggle,
    onFigTap: onFigTap,
    setLit: function (on) {
      setLitLocal(!!on);
      if (host && isHome()) paint();
      if (on) return wakeBot();
      if (window.HJALPBOT && window.HJALPBOT.tick) window.HJALPBOT.tick();
      return Promise.resolve();
    },
    charId: charId
  };
})();
