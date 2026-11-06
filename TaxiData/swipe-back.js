/* Bakåt-swipe: dra åt höger från vänstra halvan av skärmen = samma som telefonens bakåtknapp.
 * Använder history.back() så att index.html:s popstate (stänger notiser, profilmeny,
 * går ur Forum/Inkorg/Profil m.m.) körs som vanligt. Saknas historik anropas goHome().
 * Startzon = vänstra 50 % (telefonfodral täcker ofta kanten). Kräver tydlig horisontell
 * dragning så vanlig scroll inte triggar bakåt. Högerkanten (notis.js) lämnas orörd.
 * Ångra: se docs/swipe-back/UNDO.md och docs/scroll-fix/UNDO.md. */
(function () {
  var START_FRAC = 0.5;  // gesten får börja i vänstra halvan (fodral täcker kanten)
  var HINT_ID = 'swipe-back-hint';
  function minDx() { return Math.max(100, Math.round(window.innerWidth * 0.28)); }

  var CSS =
    '#' + HINT_ID + '{position:fixed;left:0;top:50%;transform:translate(-120%,-50%);' +
      'width:44px;height:44px;border-radius:50%;background:var(--surface,#1a202c);color:var(--text,#edf2f7);' +
      'border:1px solid var(--border,#4a5568);box-shadow:2px 0 10px rgba(0,0,0,.25);' +
      'display:flex;align-items:center;justify-content:center;font-size:1.6rem;line-height:1;' +
      'z-index:950;pointer-events:none;opacity:0;transition:none;' +
      'padding-bottom:2px;-webkit-user-select:none;user-select:none}' +
    '#' + HINT_ID + '.show{opacity:1}' +
    '@media print{#' + HINT_ID + '{display:none!important}}';

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

  function hintEl() {
    var el = document.getElementById(HINT_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = HINT_ID;
    el.setAttribute('aria-hidden', 'true');
    el.textContent = '\u2039';
    document.body.appendChild(el);
    return el;
  }

  function showHint(dx) {
    var el = hintEl();
    var x = Math.min(56, Math.max(0, dx * 0.45));
    el.classList.add('show');
    el.style.transform = 'translate(' + (x - 56) + 'px,-50%)';
    el.style.opacity = String(Math.min(1, dx / 50));
  }

  function hideHint() {
    var el = document.getElementById(HINT_ID);
    if (!el) return;
    el.classList.remove('show');
    el.style.opacity = '0';
    el.style.transform = 'translate(-120%,-50%)';
  }

  function goBack() {
    if (history.length > 1) {
      try { history.back(); return; } catch (e) {}
    }
    if (typeof window.goHome === 'function') {
      try { window.goHome(); } catch (e) {}
    }
  }

  var tg = null;

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tg = null; return; }
    if (onLogin() || notisOpen()) { tg = null; return; }
    var t = e.touches[0];
    if (t.clientX > window.innerWidth * START_FRAC) { tg = null; return; }
    if (scrollsX(e.target) || blockedTarget(e.target)) { tg = null; return; }
    tg = { x: t.clientX, y: t.clientY, active: false, dx: 0, dy: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!tg) return;
    if (e.touches.length !== 1) { hideHint(); tg = null; return; }
    var t = e.touches[0];
    var dx = t.clientX - tg.x;
    var dy = t.clientY - tg.y;
    if (!tg.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { tg = null; return; } // lodrät scroll
      if (dx > 12) {
        tg.active = true;
        showHint(dx);
      } else return;
    }
    if (dx < 0) dx = 0;
    tg.dx = dx;
    tg.dy = dy;
    showHint(dx);
    // Lätt: vi preventDefaultar inte – låt sidan skrolla om gesten avbryts.
  }, { passive: true });

  document.addEventListener('touchend', function () {
    if (!tg) return;
    var g = tg; tg = null;
    hideHint();
    if (!g.active) return;
    var need = minDx();
    // Tydligt horisontellt: |dy| < dx/2, och långt nog så fodral/korta drag inte triggar.
    if (g.dx >= need && Math.abs(g.dy || 0) < g.dx * 0.5) goBack();
  }, { passive: true });

  document.addEventListener('touchcancel', function () {
    hideHint();
    tg = null;
  }, { passive: true });
})();
