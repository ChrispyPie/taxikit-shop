/* Bakåt- och framåt-swipe (2026-11-12swipe1).
 *   Dra åt höger, start i vänstra halvan av skärmen  = bakåt till föregående sida (samma som telefonens
 *     bakåtknapp). Går via history.back() så att index.html:s popstate (NAV.handlePop i nav-historik.js)
 *     stänger notiser/under-vyer och visar rätt sida. På startskärmen utan något bakåt händer inget.
 *   Dra åt vänster, start var som helst utom de yttersta 24 px till höger = framåt igen, bara om det
 *     finns en sida framåt (efter att du backat). Annars händer inget.
 *   Dra åt vänster från högra kanten (24 px, notis.js) = notispanelen, som förut. Den zonen lämnas orörd.
 * Kräver tydlig horisontell dragning (minst 28 % av bredden, minst 100 px, och lodrätt < halva sidled)
 * så vanlig scroll inte triggar. Sidor utan nav-historik.js (admin.html m.fl.) får bara bakåt.
 * Ångra: se docs/swipe-historik/UNDO.md, docs/swipe-back/UNDO.md och docs/scroll-fix/UNDO.md. */
(function () {
  var START_FRAC = 0.5;  // bakåt får börja i vänstra halvan (fodral täcker kanten)
  var NOTIS_EDGE = 24;   // = EDGE i notis.js: där börjar notispanelens drag, framåt startar aldrig där
  var HINT_ID = 'swipe-back-hint', FWD_ID = 'swipe-fwd-hint';
  function minDx() { return Math.max(100, Math.round(window.innerWidth * 0.28)); }

  var CSS =
    '#' + HINT_ID + ',#' + FWD_ID + '{position:fixed;top:50%;' +
      'width:44px;height:44px;border-radius:50%;background:var(--surface,#1a202c);color:var(--text,#edf2f7);' +
      'border:1px solid var(--border,#4a5568);box-shadow:2px 0 10px rgba(0,0,0,.25);' +
      'display:flex;align-items:center;justify-content:center;font-size:1.6rem;line-height:1;' +
      'z-index:950;pointer-events:none;opacity:0;transition:none;' +
      'padding-bottom:2px;-webkit-user-select:none;user-select:none}' +
    '#' + HINT_ID + '{left:0;transform:translate(-120%,-50%)}' +
    '#' + FWD_ID + '{right:0;transform:translate(120%,-50%);box-shadow:-2px 0 10px rgba(0,0,0,.25)}' +
    '#' + HINT_ID + '.show,#' + FWD_ID + '.show{opacity:1}' +
    '@media print{#' + HINT_ID + ',#' + FWD_ID + '{display:none!important}}';

  (function injectCss() {
    if (document.getElementById('swipe-back-css')) return;
    var s = document.createElement('style');
    s.id = 'swipe-back-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  })();

  function scrollsX(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 2) {
        var o = getComputedStyle(el).overflowX;
        if (o === 'auto' || o === 'scroll') return true;
      }
    }
    return false;
  }

  function blockedTarget(el) {
    if (!el || !el.closest) return false;
    var tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
    if (el.closest('.leaflet-container, .mapboxgl-map, .gm-style, [data-map], [data-swipe-ignore]')) return true;
    return false;
  }

  function onLogin() {
    var ls = document.getElementById('login-screen');
    if (ls && ls.style.display !== 'none' && getComputedStyle(ls).display !== 'none') return true;
    return !localStorage.getItem('taxi_session');
  }

  function notisOpen() {
    return !!(window.NOTIS && typeof NOTIS.isOpen === 'function' && NOTIS.isOpen());
  }
  function canForward() {
    return !!(window.NAV && typeof NAV.canForward === 'function' && NAV.canForward());
  }

  function hintEl(id, ch) {
    var el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('aria-hidden', 'true');
    el.textContent = ch;
    document.body.appendChild(el);
    return el;
  }

  function showHint(dx) {
    var el = hintEl(HINT_ID, '\u2039');
    var x = Math.min(56, Math.max(0, dx * 0.45));
    el.classList.add('show');
    el.style.transform = 'translate(' + (x - 56) + 'px,-50%)';
    el.style.opacity = String(Math.min(1, dx / 50));
  }
  function showFwdHint(dist) {
    var el = hintEl(FWD_ID, '\u203a');
    var x = Math.min(56, Math.max(0, dist * 0.45));
    el.classList.add('show');
    el.style.transform = 'translate(' + (56 - x) + 'px,-50%)';
    el.style.opacity = String(Math.min(1, dist / 50));
  }

  function hideHint() {
    var el = document.getElementById(HINT_ID);
    if (el) { el.classList.remove('show'); el.style.opacity = '0'; el.style.transform = 'translate(-120%,-50%)'; }
    var f = document.getElementById(FWD_ID);
    if (f) { f.classList.remove('show'); f.style.opacity = '0'; f.style.transform = 'translate(120%,-50%)'; }
  }

  function goBack() {
    if (window.NAV && typeof NAV.back === 'function') {
      if (NAV.back()) return;
      // Inget steg bakåt: från en annan sida till startskärmen, på startskärmen händer inget.
      if (NAV.here() && typeof window.goHome === 'function') { try { window.goHome({ replace: true }); } catch (e) {} }
      return;
    }
    if (history.length > 1) {
      try { history.back(); return; } catch (e) {}
    }
    if (typeof window.goHome === 'function') {
      try { window.goHome(); } catch (e) {}
    }
  }
  function goForward() {
    if (window.NAV && typeof NAV.forward === 'function') NAV.forward();
  }

  var tg = null;

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tg = null; return; }
    if (onLogin() || notisOpen()) { tg = null; return; }
    var t = e.touches[0], w = window.innerWidth;
    if (t.clientX >= w - NOTIS_EDGE) { tg = null; return; }   // notispanelens kant: notis.js tar den
    if (scrollsX(e.target) || blockedTarget(e.target)) { tg = null; return; }
    var back = t.clientX <= w * START_FRAC, fwd = canForward();
    if (!back && !fwd) { tg = null; return; }
    tg = { x: t.clientX, y: t.clientY, back: back, fwd: fwd, dir: 0, dx: 0, dy: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!tg) return;
    if (e.touches.length !== 1) { hideHint(); tg = null; return; }
    var t = e.touches[0];
    var dx = t.clientX - tg.x;
    var dy = t.clientY - tg.y;
    if (!tg.dir) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { tg = null; return; } // lodrät scroll
      if (dx > 12 && tg.back) tg.dir = 1;
      else if (dx < -12 && tg.fwd) tg.dir = -1;
      else if (Math.abs(dx) > 12) { tg = null; return; }   // fel håll för den här starten
      else return;
    }
    var dist = tg.dir > 0 ? Math.max(0, dx) : Math.max(0, -dx);
    tg.dx = dist;
    tg.dy = dy;
    if (tg.dir > 0) showHint(dist); else showFwdHint(dist);
    // Lätt: vi preventDefaultar inte – låt sidan skrolla om gesten avbryts.
  }, { passive: true });

  document.addEventListener('touchend', function () {
    if (!tg) return;
    var g = tg; tg = null;
    hideHint();
    if (!g.dir) return;
    var need = minDx();
    // Tydligt horisontellt: |dy| < dx/2, och långt nog så fodral/korta drag inte triggar.
    if (g.dx >= need && Math.abs(g.dy || 0) < g.dx * 0.5) {
      if (g.dir > 0) goBack(); else goForward();
    }
  }, { passive: true });

  document.addEventListener('touchcancel', function () {
    hideHint();
    tg = null;
  }, { passive: true });
})();
