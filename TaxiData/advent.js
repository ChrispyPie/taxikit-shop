/* Adventskalender i december: 24 luckor med verifierade taxifakta.
 * Permanent modul som inte kan avinstalleras medan den är i säsong.
 * Bara luckor upp till dagens datum kan öppnas.
 * Öppnas automatiskt för alla från 2026-12-01 00:00 Europe/Stockholm; före det bara 710022.
 * Testdatum: ?adventdatum=YYYY-MM-DD eller ?juldatum=YYYY-MM-DD.
 * Mini-kalender till vänster om ljusstaken på startskärmen; tryck för att förstora. */
(function () {
  'use strict';
  var A = window.ADVENT = window.ADVENT || { id: 'advent', title: 'Adventskalender', icon: '🎄' };
  A.id = 'advent';
  A.title = 'Adventskalender';
  A.icon = '🎄';

  var st = { el: null, tab: 'luckor', opens: [], year: null, today: null, day: 0, month: 0, open: null, err: '', busy: false, calOpen: false, factOpen: false, factClosedAt: 0, locking: false, hideDoors: false, zoomOpen: false, swipedAt: 0 };
  var els = { overlay: null, board: null, factWrap: null, fact: null, mini: null, zoom: null, zoomPic: null, zoomAttrib: null };
  var stopFw = null;
  var DOOR_ORDER = [17, 3, 24, 8, 1, 12, 19, 6, 22, 4, 15, 9, 23, 2, 14, 11, 20, 7, 18, 5, 21, 10, 16, 13];
  /* Irregular positions in % of the painting (no overlap, min ~40px on a 390px board). */
  var DOOR_POS = [
    { x: 2.6, y: 8.4, w: 13.8, h: 10.8 }, { x: 19.0, y: 11.0, w: 13.0, h: 11.2 },
    { x: 35.0, y: 8.0, w: 15.0, h: 9.8 }, { x: 53.2, y: 9.6, w: 13.2, h: 11.0 },
    { x: 69.2, y: 8.2, w: 13.0, h: 10.4 }, { x: 84.6, y: 10.6, w: 12.6, h: 11.0 },
    { x: 3.4, y: 24.6, w: 12.2, h: 13.0 }, { x: 19.2, y: 26.8, w: 15.4, h: 10.0 },
    { x: 37.0, y: 20.8, w: 13.2, h: 11.2 }, { x: 54.0, y: 24.8, w: 14.2, h: 9.8 },
    { x: 70.0, y: 23.8, w: 12.0, h: 12.2 }, { x: 85.4, y: 25.8, w: 12.0, h: 11.4 },
    { x: 2.8, y: 41.0, w: 14.0, h: 10.4 }, { x: 20.5, y: 40.0, w: 12.4, h: 12.0 },
    { x: 37.2, y: 36.0, w: 13.6, h: 11.0 }, { x: 54.8, y: 37.4, w: 13.8, h: 9.8 },
    { x: 71.0, y: 40.0, w: 12.0, h: 11.2 }, { x: 85.4, y: 42.0, w: 12.0, h: 11.0 },
    { x: 3.6, y: 56.2, w: 18.0, h: 12.0 }, { x: 32.0, y: 54.6, w: 18.4, h: 12.2 },
    { x: 64.0, y: 55.4, w: 17.0, h: 11.8 }, { x: 6.0, y: 73.0, w: 18.4, h: 12.0 },
    { x: 35.0, y: 71.0, w: 18.8, h: 12.4 }, { x: 73.0, y: 72.2, w: 16.6, h: 12.0 }
  ];

  function gate() { return window.ADVENT_GATE || {}; }
  function allowed() { return !!(gate().allowed && gate().allowed()); }
  function today() { return gate().today ? gate().today() : { y: 2026, m: 12, d: 1, iso: '2026-12-01' }; }
  function inSeason(t) {
    t = t || today();
    return t.m === 12 || (t.m === 1 && t.d <= 6);
  }
  function isPinned() { return allowed() && inSeason(); }
  function asOfArg() { return gate().asOfArg ? gate().asOfArg() : null; }
  function token() { try { return localStorage.getItem('taxi_session') || ''; } catch (e) { return ''; } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fakta() {
    var list = window.ADVENT_FAKTA || [];
    var by = {};
    list.forEach(function (f) { if (f && f.dag >= 1 && f.dag <= 24) by[f.dag] = f; });
    return by;
  }
  function css() {
    if (document.getElementById('td-advent-css')) return;
    var l = document.createElement('link');
    l.id = 'td-advent-css';
    l.rel = 'stylesheet';
    l.href = 'advent.css?v=20261123adv11';
    document.head.appendChild(l);
  }
  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function isHome() {
    var app = document.getElementById('app');
    return !!(app && app.classList && app.classList.contains('is-home'));
  }

  function rpc(name, args) {
    if (typeof window.rpc === 'function') return window.rpc(name, args);
    return Promise.reject(new Error('no_rpc'));
  }

  /* Testdatum (?adventdatum=) och allt före 1 dec 2026 sparas i år 0,
   * så öppnade luckor i förhand inte räknas i den riktiga decemberkalendern. */
  function storageYear(t) {
    if (asOfArg()) return 0;
    if (gate().isLive && !gate().isLive()) return 0;
    t = t || today();
    return t.m === 1 ? t.y - 1 : t.y;
  }
  function loadState() {
    var args = { p_token: token() };
    var asOf = asOfArg();
    if (asOf) args.p_as_of = asOf;
    return rpc('advent_state', args).then(function (r) {
      var t = today();
      st.year = (r && r.year != null) ? r.year : storageYear(t);
      st.today = (r && r.today) || t.iso;
      st.month = (r && r.month) || t.m;
      st.day = (r && r.day) || t.d;
      st.opens = (r && r.opens) || [];
      return r;
    }).catch(function () {
      var t = today();
      st.year = storageYear(t);
      st.today = t.iso;
      st.month = t.m;
      st.day = t.d;
      try {
        var raw = localStorage.getItem('taxi_advent_opens:' + token().slice(0, 8) + ':' + st.year);
        st.opens = raw ? JSON.parse(raw) : [];
      } catch (e) { st.opens = []; }
    });
  }
  function cacheOpens() {
    try {
      localStorage.setItem('taxi_advent_opens:' + token().slice(0, 8) + ':' + st.year, JSON.stringify(st.opens || []));
    } catch (e) {}
  }
  function isOpen(d) { return (st.opens || []).indexOf(d) >= 0; }
  function canOpen(d) {
    if (st.month !== 12) return false;
    return d >= 1 && d <= 24 && d <= st.day;
  }

  function lockScroll(on) {
    var root = document.documentElement;
    var body = document.body;
    if (on) {
      st.locking = true;
      if (root) root.classList.add('td-adv-lock');
      if (body) body.classList.add('td-adv-lock');
    } else {
      st.locking = false;
      if (root) root.classList.remove('td-adv-lock');
      if (body) body.classList.remove('td-adv-lock');
    }
  }

  function openDoor(d, fromEl) {
    if (st.busy) return;
    if (!canOpen(d)) {
      st.err = d > st.day ? 'Den luckan öppnas den ' + d + ' december.' : 'Luckan kan inte öppnas ännu.';
      paintBoardErr();
      return;
    }
    if (isOpen(d)) { showFact(d, fromEl); return; }
    st.busy = true;
    var args = { p_token: token(), p_day: d };
    var asOf = asOfArg();
    if (asOf) args.p_as_of = asOf;
    rpc('advent_open', args).then(function () {
      if (st.opens.indexOf(d) < 0) st.opens.push(d);
      cacheOpens();
      st.busy = false;
      st.err = '';
      paintDoors();
      showFact(d, fromEl);
    }).catch(function (e) {
      st.busy = false;
      var code = (e && e.message) || '';
      if (code.indexOf('too_early') >= 0) {
        st.err = 'Den luckan öppnas den ' + d + ' december.';
        paintBoardErr();
      } else if (code.indexOf('demo_read_only') >= 0) {
        st.err = 'Demokonto kan titta, men inte öppna luckor.';
        paintBoardErr();
      } else {
        if (st.opens.indexOf(d) < 0) st.opens.push(d);
        cacheOpens();
        st.err = '';
        paintDoors();
        showFact(d, fromEl);
      }
    });
  }

  function factHtml(d) {
    var f = fakta()[d];
    if (!f) return '<p class="td-adv-muted">Ingen text för den luckan.</p>';
    var img = '';
    if (f.bild) {
      img = '<figure class="td-adv-bild">' +
        '<button type="button" class="td-adv-zoombtn" data-adv-zoom="1" aria-label="Visa bilden större">' +
        '<img src="' + esc(f.bild) + '" alt="' + esc(f.bildalt || '') + '" decoding="async">' +
        '</button>' +
        (f.attrib ? '<figcaption class="td-adv-attrib">' + esc(f.attrib) + '</figcaption>' : '') +
        '</figure>';
    }
    var kalla = f.kalla ? '<p class="td-adv-src">Källa: ' + esc(f.kalla) +
      (f.url ? ' <a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">Läs mer</a>' : '') +
      '</p>' : '';
    return '<article class="td-adv-fact">' +
      img +
      '<p class="td-adv-kicker">Lucka ' + d + '</p>' +
      '<h2>' + esc(f.titel) + '</h2>' +
      '<p>' + esc(f.text) + '</p>' + kalla +
      '<button type="button" class="td-adv-close" data-adv-close="1">Stäng</button>' +
      '</article>';
  }

  function doorsHtml() {
    var html = '<div class="td-adv-doors" role="list">';
    for (var i = 0; i < 24; i++) {
      var d = DOOR_ORDER[i];
      var pos = DOOR_POS[i];
      var opened = isOpen(d), ok = canOpen(d);
      var cls = 'td-adv-door' + (opened ? ' open' : ok ? ' ready' : ' locked');
      var label = opened ? 'Lucka ' + d + ', öppnad' : ok ? 'Öppna lucka ' + d : 'Lucka ' + d + ', låst till den ' + d + ' december';
      html += '<button type="button" class="' + cls + '" data-lucka="' + d + '" aria-label="' + esc(label) + '"' +
        ' style="left:' + pos.x + '%;top:' + pos.y + '%;width:' + pos.w + '%;height:' + pos.h + '%">' +
        '<span class="td-adv-num">' + d + '</span>' +
        (opened ? '<span class="td-adv-check" aria-hidden="true">★</span>' : '') +
        '</button>';
    }
    html += '</div>';
    return html;
  }


  /* Glow positions in % of bakgrund-jul.webp (640×853). Only used on the open board. */
  var LIGHTS = [
    { k:'w', x:4.5, y:14.8, w:6.2, h:5.2 }, { k:'w', x:7.3, y:16.0, w:6.0, h:5.0 },
    { k:'w', x:4.5, y:19.5, w:6.8, h:6.0 }, { k:'w', x:7.3, y:20.5, w:6.6, h:6.0 },
    { k:'w', x:4.3, y:34.2, w:6.4, h:5.6 }, { k:'w', x:7.2, y:35.2, w:6.4, h:5.6 },
    { k:'w', x:4.4, y:38.8, w:7.2, h:6.8 }, { k:'w', x:7.2, y:39.4, w:7.0, h:6.6 },
    { k:'w', x:4.0, y:54.0, w:5.6, h:4.4 }, { k:'w', x:6.8, y:54.6, w:5.6, h:4.4 },
    { k:'w', x:4.2, y:58.5, w:6.6, h:5.2 }, { k:'w', x:6.8, y:59.0, w:6.6, h:5.2 },
    { k:'w', x:18.5, y:21.0, w:4.8, h:4.0 }, { k:'w', x:18.5, y:24.6, w:5.6, h:5.2 },
    { k:'w', x:20.4, y:25.4, w:5.6, h:5.2 }, { k:'w', x:18.4, y:41.6, w:5.6, h:5.6 },
    { k:'w', x:20.4, y:42.2, w:5.6, h:5.6 }, { k:'w', x:19.0, y:55.8, w:6.4, h:4.4 },
    { k:'w', x:27.2, y:43.8, w:6.0, h:5.2 }, { k:'w', x:32.4, y:44.8, w:5.6, h:5.2 },
    { k:'w', x:27.5, y:56.2, w:6.4, h:4.4 }, { k:'w', x:38.8, y:52.4, w:5.4, h:4.6 },
    { k:'l', x:57.4, y:42.7, w:22, h:20 }, { k:'l', x:57.4, y:42.7, w:8.5, h:8.5 },
    { k:'l', x:39.5, y:52.8, w:8, h:8 }, { k:'l', x:39.5, y:52.8, w:4.2, h:4.2 },
    { k:'l', x:47.2, y:56.6, w:4.2, h:4.2 }, { k:'l', x:51.6, y:57.0, w:3.8, h:3.8 },
    { k:'l', x:61.0, y:57.4, w:5.2, h:5.2 }, { k:'l', x:67.2, y:57.8, w:3.6, h:3.6 },
    { k:'l', x:73.4, y:58.2, w:3.4, h:3.4 },
    { k:'x', x:35.0, y:60.5, w:10, h:5 }, { k:'x', x:35.0, y:60.5, w:5.5, h:2.8 },
    { k:'t', x:86.8, y:49.4, w:4.2, h:4.2 },
    { k:'t', x:84.0, y:54.0, w:2.6, h:2.6 }, { k:'t', x:89.2, y:53.4, w:2.4, h:2.4 },
    { k:'t', x:91.8, y:56.2, w:2.5, h:2.5 }, { k:'t', x:81.2, y:58.0, w:2.4, h:2.4 },
    { k:'t', x:86.2, y:57.2, w:2.8, h:2.8 }, { k:'t', x:90.0, y:59.4, w:2.4, h:2.4 },
    { k:'t', x:83.0, y:62.4, w:2.5, h:2.5 }, { k:'t', x:88.0, y:63.2, w:2.6, h:2.6 },
    { k:'t', x:92.6, y:64.0, w:2.3, h:2.3 }, { k:'t', x:80.4, y:66.0, w:2.4, h:2.4 },
    { k:'t', x:85.5, y:66.8, w:2.6, h:2.6 }, { k:'t', x:90.8, y:68.2, w:2.3, h:2.3 },
    { k:'t', x:87.0, y:71.2, w:2.5, h:2.5 }, { k:'t', x:83.2, y:73.4, w:2.3, h:2.3 },
    { k:'t', x:90.2, y:74.0, w:2.2, h:2.2 }, { k:'t', x:86.2, y:77.0, w:2.4, h:2.4 },
    { k:'r', x:62.0, y:80.2, w:10, h:12 }, { k:'r', x:88.2, y:81.4, w:7, h:8 }
  ];
  var fxPauseBound = false;
  function syncFxPause() {
    var off = !!document.hidden || document.visibilityState === 'hidden';
    var root = document.documentElement;
    if (root && root.classList && root.classList.toggle) root.classList.toggle('td-fx-pause', off);
  }
  function bindFxPause() {
    if (fxPauseBound) return;
    fxPauseBound = true;
    syncFxPause();
    document.addEventListener('visibilitychange', syncFxPause);
  }
  function lightsHtml() {
    var html = '<div class="td-adv-fx" aria-hidden="true">';
    var i, L, cls, delay, dur;
    for (i = 0; i < LIGHTS.length; i++) {
      L = LIGHTS[i];
      cls = L.k === 'l' ? 'td-adv-glow-l' : L.k === 't' ? 'td-adv-glow-t' : L.k === 'x' ? 'td-adv-glow-x' : L.k === 'r' ? 'td-adv-glow-r' : 'td-adv-glow-w';
      delay = ((i * 37) % 28) / 10;
      dur = L.k === 't' ? (1.5 + (i % 5) * 0.28) : L.k === 'l' ? (3.1 + (i % 4) * 0.45) : L.k === 'x' ? 2.4 : (2.3 + (i % 6) * 0.38);
      html += '<span class="td-adv-glow ' + cls + '" style="left:' + L.x + '%;top:' + L.y + '%;width:' + L.w + '%;height:' + L.h + '%;animation-delay:-' + delay + 's;animation-duration:' + dur + 's"></span>';
    }
    html += '<span class="td-adv-snow"></span><span class="td-adv-snow td-adv-snow-b"></span></div>';
    return html;
  }
  function boardDecor() { return lightsHtml(); }


  function miniHtml() {
    var html = '<span class="td-adv-mini-face" aria-hidden="true">';
    for (var i = 0; i < 24; i++) {
      var pos = DOOR_POS[i];
      html += '<span class="td-adv-mini-door" style="left:' + pos.x + '%;top:' + pos.y + '%;width:' + pos.w + '%;height:' + pos.h + '%"></span>';
    }
    html += '</span>';
    return html;
  }

  function mountMini() {
    if (!allowed() || !inSeason()) {
      if (els.mini && els.mini.parentNode) els.mini.parentNode.removeChild(els.mini);
      els.mini = null;
      if (window.POLKAGRIS && POLKAGRIS.mountCount) POLKAGRIS.mountCount();
      return;
    }
    if (!isHome() && !st.calOpen) {
      /* Mini hör hemma på startskärmen. */
    }
    css();
    var rad = window.ensureJulTop ? window.ensureJulTop() : document.getElementById('jul-ljus-rad');
    if (!rad && window.POLKAGRIS && POLKAGRIS.ensureJulTop) rad = POLKAGRIS.ensureJulTop();
    if (!rad) return;
    var left = rad.querySelector('.td-jul-top-left') || rad;
    var mini = document.getElementById('td-adv-mini') || els.mini;
    if (!mini) {
      mini = document.createElement('button');
      mini.type = 'button';
      mini.id = 'td-adv-mini';
      mini.className = 'td-adv-mini';
      mini.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openCalendar();
      });
    }
    mini.setAttribute('aria-label', 'Adventskalender');
    if (!mini.querySelector('.td-adv-mini-face')) mini.innerHTML = miniHtml();
    if (mini.parentNode !== left) left.insertBefore(mini, left.firstChild);
    els.mini = mini;
    if (window.POLKAGRIS && POLKAGRIS.mountCount) POLKAGRIS.mountCount();
    else if (window.POLKAGRIS && typeof window.POLKAGRIS.ensureJulTop === 'function') {
      /* sync class */
    }
    rad.classList.add('td-jul-top-on');
  }

  function paintDoors() {
    if (!els.board) return;
    var grid = els.board.querySelector('.td-adv-doors');
    if (!grid) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = doorsHtml();
    grid.parentNode.replaceChild(wrap.firstChild, grid);
  }
  function paintBoardErr() {
    if (!els.board) return;
    var err = els.board.querySelector('.td-adv-board-err');
    if (!err) {
      err = document.createElement('p');
      err.className = 'td-adv-board-err';
      err.setAttribute('role', 'alert');
      els.board.appendChild(err);
    }
    err.textContent = st.err || '';
    err.hidden = !st.err;
  }

  function flipFromTo(el, fromRect, toRect, back, done) {
    if (!el) { if (done) done(); return; }
    if (el._advCleanup) { el._advCleanup(); el._advCleanup = null; }
    if (reducedMotion() || !fromRect || !toRect || fromRect.width < 4 || toRect.width < 4) {
      el.style.transform = '';
      el.style.transition = '';
      if (done) done();
      return;
    }
    var dx = (fromRect.left + fromRect.width / 2) - (toRect.left + toRect.width / 2);
    var dy = (fromRect.top + fromRect.height / 2) - (toRect.top + toRect.height / 2);
    var sx = fromRect.width / toRect.width;
    var sy = fromRect.height / toRect.height;
    var start = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
    el.style.transition = 'none';
    el.style.transformOrigin = 'center center';
    el.style.transform = back ? 'none' : start;
    void el.offsetWidth;
    el.style.transition = 'transform .45s cubic-bezier(.2,.7,.2,1)';
    el.style.transform = back ? start : 'none';
    var finished = false;
    var timer = 0;
    function cleanup() {
      if (timer) { clearTimeout(timer); timer = 0; }
      el.removeEventListener('transitionend', onEnd);
      if (el._advCleanup === cleanup) el._advCleanup = null;
    }
    function fin() {
      if (finished) return;
      finished = true;
      cleanup();
      el.style.transition = '';
      if (!back) el.style.transform = '';
      if (done) done();
    }
    function onEnd(e) {
      if (e && e.target !== el) return;
      fin();
    }
    el._advCleanup = cleanup;
    el.addEventListener('transitionend', onEnd);
    timer = setTimeout(fin, 520);
  }

  function ensureOverlay() {
    if (els.overlay) return els.overlay;
    var ov = document.createElement('div');
    ov.id = 'td-adv-overlay';
    ov.className = 'td-adv-overlay';
    ov.setAttribute('data-swipe-ignore', '1');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Adventskalender');
    ov.innerHTML = '<div class="td-adv-stage">' +
      '<div class="td-adv-board" id="td-adv-board">' +
      boardDecor() +
      '<div class="td-adv-board-face">' +
        '<h2 class="td-adv-board-title">Adventskalender</h2>' +
        doorsHtml() +
      '</div>' +
      '</div>' +
      '<button type="button" class="td-adv-vislink" data-adv-vis="1" aria-pressed="false">Dölj luckor</button>' +
      '</div>' +
      '<div class="td-adv-factwrap" id="td-adv-factwrap" hidden>' +
        '<div class="td-adv-factbox" id="td-adv-factbox" role="dialog" aria-modal="true"></div>' +
      '</div>' +
      '<div class="td-adv-zoom" id="td-adv-zoom" hidden data-swipe-ignore="1">' +
        '<img class="td-adv-zoom-pic" alt="">' +
        '<p class="td-adv-zoom-attrib" hidden></p>' +
      '</div>';
    ov.addEventListener('click', onOverlayClick);
    document.body.appendChild(ov);
    els.overlay = ov;
    els.board = ov.querySelector('#td-adv-board');
    els.factWrap = ov.querySelector('#td-adv-factwrap');
    els.fact = ov.querySelector('#td-adv-factbox');
    els.zoom = ov.querySelector('#td-adv-zoom');
    els.zoomPic = ov.querySelector('.td-adv-zoom-pic');
    els.zoomAttrib = ov.querySelector('.td-adv-zoom-attrib');
    if (els.factWrap) {
      els.factWrap.addEventListener('click', onFactWrapClick);
      bindSwipe(els.factWrap);
    }
    if (els.zoom) {
      els.zoom.addEventListener('click', onZoomClick);
      bindSwipe(els.zoom);
    }
    if (els.fact) {
      els.fact.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !st.calOpen) return;
      e.preventDefault();
      onBack();
    });
    return ov;
  }

  function visLabel() { return st.hideDoors ? 'Visa luckor' : 'Dölj luckor'; }
  function syncDoorVis() {
    if (els.board) els.board.classList.toggle('td-adv-hid', !!st.hideDoors);
    var btn = els.overlay && els.overlay.querySelector('[data-adv-vis]');
    if (btn) {
      btn.textContent = visLabel();
      btn.setAttribute('aria-pressed', st.hideDoors ? 'true' : 'false');
    }
  }
  function toggleDoorVis() {
    st.hideDoors = !st.hideDoors;
    syncDoorVis();
  }

  function onOverlayClick(e) {
    if (!st.calOpen) return;
    if (st.zoomOpen) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (st.factOpen) {
      if (handleFactEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      closeFact();
      return;
    }
    var visBtn = e.target && e.target.closest && e.target.closest('[data-adv-vis]');
    if (visBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleDoorVis();
      return;
    }
    if (st.hideDoors) {
      if (e.target && e.target.closest && e.target.closest('.td-adv-board')) return;
    } else {
      var t = e.target && e.target.closest && e.target.closest('[data-lucka]');
      if (t) {
        e.preventDefault();
        var d = +t.getAttribute('data-lucka');
        if (d) openDoor(d, t);
        return;
      }
      if (e.target && e.target.closest && e.target.closest('.td-adv-board')) return;
    }
    if (e.target && e.target.closest && e.target.closest('.td-adv-stage')) return;
    if (Date.now() - (st.factClosedAt || 0) < 350) return;
    closeCalendar();
  }

  function openCalendar() {
    if (!allowed()) return;
    css();
    var p = st.year == null ? loadState() : Promise.resolve();
    p.then(function () {
      var mini = document.getElementById('td-adv-mini');
      var from = mini && mini.getBoundingClientRect ? mini.getBoundingClientRect() : null;
      var ov = ensureOverlay();
      paintDoors();
      paintBoardErr();
      syncDoorVis();
      ov.hidden = false;
      ov.classList.add('on');
      if (mini) mini.setAttribute('aria-expanded', 'true');
      st.calOpen = true;
      st.factOpen = false;
      if (els.factWrap) els.factWrap.hidden = true;
      if (els.fact) els.fact.hidden = true;
      lockScroll(true);
      var board = els.board;
      if (board && from) {
        var to = board.getBoundingClientRect();
        flipFromTo(board, from, to, false);
      }
    });
  }

  function closeCalendar() {
    if (st.factOpen) { closeFact(); return; }
    if (!st.calOpen) return;
    var mini = document.getElementById('td-adv-mini');
    var to = mini && mini.getBoundingClientRect ? mini.getBoundingClientRect() : null;
    var board = els.board;
    var from = board && board.getBoundingClientRect ? board.getBoundingClientRect() : null;
    function hide() {
      st.calOpen = false;
      if (els.overlay) {
        els.overlay.classList.remove('on');
        els.overlay.hidden = true;
      }
      if (board) { board.style.transform = ''; board.style.transition = ''; }
      if (mini) mini.setAttribute('aria-expanded', 'false');
      lockScroll(false);
    }
    if (board && from && to) flipFromTo(board, from, to, true, hide);
    else hide();
  }

  function showFact(d, fromEl) {
    st.open = d;
    st.factOpen = true;
    var box = els.fact;
    if (!box) return;
    if (els.factWrap) els.factWrap.hidden = false;
    fillFact(d);
    box.hidden = false;
    var from = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
    var to = box.getBoundingClientRect();
    flipFromTo(box, from, to, false);
    lockScroll(true);
  }
  function fillFact(d) {
    var box = els.fact;
    if (!box) return;
    box.innerHTML = factHtml(d);
    box.scrollTop = 0;
  }
  function closeFact() {
    if (st.zoomOpen) closeZoom(true);
    if (!st.factOpen) return;
    st.factOpen = false;
    st.factClosedAt = Date.now();
    st.open = null;
    if (els.factWrap) els.factWrap.hidden = true;
    if (els.fact) {
      els.fact.hidden = true;
      els.fact.innerHTML = '';
      els.fact.style.transform = '';
      els.fact.style.transition = '';
    }
  }

  function openedDays() {
    var list = [];
    for (var d = 1; d <= 24; d++) {
      if (isOpen(d) && canOpen(d)) list.push(d);
    }
    return list;
  }
  function browseFact(dir) {
    var list = openedDays();
    var i = list.indexOf(st.open);
    if (i < 0) return false;
    var j = i + dir;
    if (j < 0 || j >= list.length) return false;
    var d = list[j];
    st.swipedAt = Date.now();
    if (st.zoomOpen) slideZoom(d, dir);
    else slideFact(d, dir);
    return true;
  }
  function slideFact(d, dir) {
    var box = els.fact;
    if (!box) { st.open = d; fillFact(d); return; }
    if (reducedMotion()) { st.open = d; fillFact(d); return; }
    var outgoing = box.querySelector('.td-adv-fact');
    box.insertAdjacentHTML('beforeend', factHtml(d));
    var incoming = box.lastElementChild;
    if (!outgoing || !incoming || outgoing === incoming) { st.open = d; fillFact(d); return; }
    box.classList.add('td-adv-sliding');
    incoming.style.position = 'absolute';
    incoming.style.inset = '0';
    incoming.style.overflow = 'auto';
    incoming.style.boxSizing = 'border-box';
    incoming.style.padding = getComputedStyle(box).padding;
    incoming.style.transition = 'none';
    incoming.style.transform = 'translateX(' + (dir * 100) + '%)';
    outgoing.style.transition = 'none';
    outgoing.style.transform = 'translateX(0)';
    void incoming.offsetWidth;
    outgoing.style.transition = 'transform .28s ease';
    incoming.style.transition = 'transform .28s ease';
    outgoing.style.transform = 'translateX(' + (-dir * 100) + '%)';
    incoming.style.transform = 'translateX(0)';
    st.open = d;
    setTimeout(function () {
      if (outgoing && outgoing.parentNode) outgoing.parentNode.removeChild(outgoing);
      incoming.style.position = '';
      incoming.style.inset = '';
      incoming.style.overflow = '';
      incoming.style.padding = '';
      incoming.style.transform = '';
      incoming.style.transition = '';
      box.classList.remove('td-adv-sliding');
      box.scrollTop = 0;
    }, 300);
  }
  function factThumb() {
    return els.fact && els.fact.querySelector('.td-adv-zoombtn img');
  }
  function setZoomContent(d) {
    var f = fakta()[d] || {};
    var pic = els.zoomPic;
    if (pic) {
      if (f.bild) {
        pic.src = f.bild;
        pic.alt = f.bildalt || '';
        pic.hidden = false;
      } else {
        pic.removeAttribute('src');
        pic.alt = '';
        pic.hidden = true;
      }
    }
    var cap = els.zoomAttrib;
    if (cap) {
      if (f.attrib) { cap.textContent = f.attrib; cap.hidden = false; }
      else { cap.textContent = ''; cap.hidden = true; }
    }
    return !!f.bild;
  }
  function openZoom(fromImg) {
    if (!els.zoom) return;
    var img = fromImg && fromImg.tagName === 'IMG' ? fromImg : (fromImg && fromImg.querySelector && fromImg.querySelector('img'));
    img = img || factThumb();
    if (!img) return;
    setZoomContent(st.open);
    if (els.zoomPic) {
      els.zoomPic.style.transform = '';
      els.zoomPic.style.transition = '';
      els.zoomPic.hidden = false;
    }
    els.zoom.hidden = false;
    els.zoom.style.background = '#000';
    st.zoomOpen = true;
    if (reducedMotion() || !img || !els.zoomPic) return;
    var from = img.getBoundingClientRect();
    var to = els.zoomPic.getBoundingClientRect();
    if (!from.width || !to.width) return;
    var sx = from.width / to.width, sy = from.height / to.height;
    var dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    var dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    els.zoomPic.style.transition = 'none';
    els.zoomPic.style.transformOrigin = 'center center';
    els.zoomPic.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
    els.zoom.style.background = 'rgba(0,0,0,0)';
    els.zoom.style.transition = 'none';
    void els.zoomPic.offsetWidth;
    els.zoomPic.style.transition = 'transform .32s cubic-bezier(.2,.7,.2,1)';
    els.zoomPic.style.transform = 'none';
    els.zoom.style.transition = 'background .32s ease';
    els.zoom.style.background = '#000';
  }
  function closeZoom(instant) {
    if (!st.zoomOpen) return;
    var z = els.zoom, pic = els.zoomPic, thumb = factThumb();
    function hide() {
      st.zoomOpen = false;
      if (z) {
        z.hidden = true;
        z.style.background = '#000';
        z.style.transition = '';
      }
      if (pic) {
        pic.style.transform = '';
        pic.style.transition = '';
      }
    }
    if (instant || reducedMotion() || !pic || !thumb) { hide(); return; }
    var from = pic.getBoundingClientRect();
    var to = thumb.getBoundingClientRect();
    if (!from.width || !to.width) { hide(); return; }
    var sx = to.width / from.width, sy = to.height / from.height;
    var dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    var dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    pic.style.transition = 'transform .28s cubic-bezier(.2,.7,.2,1)';
    pic.style.transformOrigin = 'center center';
    pic.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
    z.style.transition = 'background .28s ease';
    z.style.background = 'rgba(0,0,0,0)';
    setTimeout(hide, 300);
  }
  function slideZoom(d, dir) {
    st.open = d;
    fillFact(d);
    if (!setZoomContent(d)) { closeZoom(true); return; }
    var pic = els.zoomPic;
    if (!pic || reducedMotion()) {
      if (pic) { pic.style.transform = ''; pic.style.transition = ''; }
      return;
    }
    pic.style.transition = 'none';
    pic.style.transform = 'translateX(' + (dir * 40) + '%)';
    void pic.offsetWidth;
    pic.style.transition = 'transform .28s ease';
    pic.style.transform = 'none';
  }

  function swipeClick() { return Date.now() - (st.swipedAt || 0) < 450; }
  function handleFactEvent(e) {
    if (swipeClick()) { st.swipedAt = 0; e.preventDefault(); e.stopPropagation(); return true; }
    var zoomBtn = e.target && e.target.closest && e.target.closest('[data-adv-zoom]');
    if (zoomBtn) {
      e.preventDefault();
      e.stopPropagation();
      openZoom(zoomBtn.querySelector('img') || zoomBtn);
      return true;
    }
    var closeBtn = e.target && e.target.closest && e.target.closest('[data-adv-close]');
    if (closeBtn) { e.preventDefault(); e.stopPropagation(); closeFact(); return true; }
    if (e.target && e.target.closest && e.target.closest('.td-adv-factbox')) return true;
    return false;
  }
  function onFactWrapClick(e) {
    e.stopPropagation();
    if (!st.factOpen || st.zoomOpen) return;
    if (handleFactEvent(e)) return;
    e.preventDefault();
    closeFact();
  }
  function onZoomClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (swipeClick()) { st.swipedAt = 0; return; }
    closeZoom();
  }
  function bindSwipe(el) {
    var g = null;
    el.addEventListener('touchstart', function (e) {
      if (!st.factOpen || e.touches.length !== 1) { g = null; return; }
      var t = e.touches[0];
      g = { x: t.clientX, y: t.clientY, dx: 0, dy: 0, axis: '' };
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (!g) return;
      if (e.touches.length !== 1) { g = null; return; }
      var t = e.touches[0];
      g.dx = t.clientX - g.x;
      g.dy = t.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1) g.axis = 'x';
        else if (Math.abs(g.dy) > 12) g.axis = 'y';
      }
      if (g.axis === 'x') {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
    function end() {
      if (!g) return;
      var s = g; g = null;
      if (s.axis !== 'x') return;
      var need = Math.max(56, Math.round(window.innerWidth * 0.16));
      if (Math.abs(s.dx) < need || Math.abs(s.dy) > Math.abs(s.dx) * 0.6) return;
      browseFact(s.dx < 0 ? 1 : -1);
    }
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', function () { g = null; }, { passive: true });
  }
  function onBack() {
    if (st.zoomOpen) { closeZoom(); return true; }
    if (st.factOpen) { closeFact(); return true; }
    if (st.calOpen) { closeCalendar(); return true; }
    return false;
  }

  function tabsHtml() {
    var win = gate().showWinner && gate().showWinner();
    return '<div class="td-adv-tabs" role="tablist">' +
      '<button type="button" role="tab" class="td-adv-tab' + (st.tab === 'jakt' ? ' on' : '') + '" data-tab="jakt" aria-selected="' + (st.tab === 'jakt') + '">Polkagrisjakt</button>' +
      (win ? '<button type="button" role="tab" class="td-adv-tab' + (st.tab === 'vinnare' ? ' on' : '') + '" data-tab="vinnare" aria-selected="' + (st.tab === 'vinnare') + '">Vinnare</button>' : '') +
      '</div>';
  }
  function jaktHtml() {
    var body = window.POLKAGRIS && POLKAGRIS.boardHtml ? POLKAGRIS.boardHtml() : '<p class="td-adv-muted">Topplistan laddas…</p>';
    var lead = window.POLKAGRIS && POLKAGRIS.leadText ? POLKAGRIS.leadText() :
      'Hitta polkagrisar i appen. Tävlingen pågår 1–31 december.';
    var nowLine = window.POLKAGRIS && POLKAGRIS.findableText ? POLKAGRIS.findableText() : '';
    return '<section class="td-adv-jakt">' +
      '<h2>Polkagrisjakten</h2>' +
      (nowLine ? '<p class="td-pk-now">' + esc(nowLine) + '</p>' : '') +
      '<p class="td-pk-lead">' + esc(lead) + '</p>' +
      '<p class="td-pk-rules-wrap"><button type="button" class="td-pk-rules-link" data-pk-rules>Spelregler</button></p>' +
      body +
      '</section>';
  }

  function paintBoardPage() {
    if (!st.el) return;
    css();
    var html = '<div class="td-adv-page">';
    html += tabsHtml();
    if (st.err) html += '<p class="td-adv-err" role="alert">' + esc(st.err) + '</p>';
    if (st.tab === 'vinnare') {
      html += (window.POLKAGRIS && POLKAGRIS.winnerHtml) ? POLKAGRIS.winnerHtml() : '';
    } else {
      html += jaktHtml();
    }
    html += '</div>';
    if (stopFw) { stopFw(); stopFw = null; }
    st.el.innerHTML = html;
    if (st.tab === 'vinnare' && window.POLKAGRIS && POLKAGRIS.fireworks) {
      var cv = st.el.querySelector('.td-pk-fw');
      if (cv) stopFw = POLKAGRIS.fireworks(cv);
    }
    if (st.tab === 'jakt') {
      var mine = st.el.querySelector('.td-pk-row.mine');
      if (mine && mine.scrollIntoView) {
        try { mine.scrollIntoView({ block: 'nearest' }); } catch (err) {}
      }
    }
  }

  function onPageClick(e) {
    var rules = e.target && e.target.closest && e.target.closest('[data-pk-rules]');
    if (rules) {
      e.preventDefault();
      if (window.POLKAGRIS && typeof POLKAGRIS.openRules === 'function') POLKAGRIS.openRules();
      return;
    }
    var t = e.target && e.target.closest && e.target.closest('[data-tab]');
    if (!t) return;
    st.tab = t.getAttribute('data-tab') || 'jakt';
    st.err = '';
    if (window.POLKAGRIS && POLKAGRIS.refresh) POLKAGRIS.refresh().then(paintBoardPage);
    else paintBoardPage();
  }

  function openTab(tab) {
    st.tab = tab || 'jakt';
    if (typeof window.openItem === 'function') window.openItem('advent');
    else if (st.el) paintBoardPage();
  }

  function render(el) {
    if (window._adventTab) { st.tab = window._adventTab; window._adventTab = null; }
    st.el = el;
    if (!allowed()) {
      el.innerHTML = '<p>Adventskalendern är inte öppen ännu.</p>';
      return;
    }
    css();
    el.onclick = onPageClick;
    if (st.tab === 'jakt' || st.tab === 'vinnare') {
      el.innerHTML = '<p role="status">Laddar…</p>';
      var p = loadState();
      var q = (window.POLKAGRIS && POLKAGRIS.refresh) ? POLKAGRIS.refresh() : Promise.resolve();
      Promise.all([p, q]).then(function () { paintBoardPage(); });
      return;
    }
    el.innerHTML = '';
    loadState().then(function () { openCalendar(); });
    if (typeof window.goHome === 'function') {
      setTimeout(function () { try { window.goHome(); } catch (e) {} }, 0);
    }
  }

  function refresh() {
    loadState().then(function () {
      if (st.calOpen) paintDoors();
      if (st.el && (st.tab === 'jakt' || st.tab === 'vinnare')) paintBoardPage();
    });
  }

  A.render = render;
  A.openTab = openTab;
  A.refresh = refresh;
  A.isPinned = isPinned;
  A.allowed = allowed;
  A.canOpen = function (d) { return canOpen(d); };
  A.mountMini = mountMini;
  A.openCalendar = openCalendar;
  A.closeCalendar = closeCalendar;
  A.back = onBack;
  A.stop = function () { if (stopFw) { stopFw(); stopFw = null; } };
})();
