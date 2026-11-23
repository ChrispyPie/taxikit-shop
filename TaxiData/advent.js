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

  var st = { el: null, tab: 'luckor', opens: [], year: null, today: null, day: 0, month: 0, open: null, err: '', busy: false, calOpen: false, factOpen: false, factClosedAt: 0, locking: false };
  var els = { overlay: null, board: null, factWrap: null, fact: null, mini: null };
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
    l.href = 'advent.css?v=20261123adv9';
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
        '<img src="' + esc(f.bild) + '" alt="' + esc(f.bildalt || '') + '" decoding="async">' +
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

  function boardDecor() { return ''; }

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
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Adventskalender');
    ov.innerHTML = '<div class="td-adv-board" id="td-adv-board">' +
      boardDecor() +
      '<div class="td-adv-board-face">' +
        '<h2 class="td-adv-board-title">Adventskalender</h2>' +
        doorsHtml() +
      '</div>' +
      '</div>' +
      '<div class="td-adv-factwrap" id="td-adv-factwrap" hidden>' +
        '<div class="td-adv-factbox" id="td-adv-factbox" role="dialog" aria-modal="true"></div>' +
      '</div>';
    ov.addEventListener('click', onOverlayClick);
    document.body.appendChild(ov);
    els.overlay = ov;
    els.board = ov.querySelector('#td-adv-board');
    els.factWrap = ov.querySelector('#td-adv-factwrap');
    els.fact = ov.querySelector('#td-adv-factbox');
    if (els.factWrap) {
      els.factWrap.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!st.factOpen) return;
        var closeBtn = e.target && e.target.closest && e.target.closest('[data-adv-close]');
        if (closeBtn) { e.preventDefault(); closeFact(); return; }
        if (e.target && e.target.closest && e.target.closest('.td-adv-factbox')) return;
        e.preventDefault();
        closeFact();
      });
    }
    if (els.fact) {
      els.fact.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
      els.fact.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !st.calOpen) return;
      if (st.factOpen) closeFact();
      else closeCalendar();
    });
    return ov;
  }

  function onOverlayClick(e) {
    if (!st.calOpen) return;
    if (st.factOpen) {
      var closeBtn = e.target && e.target.closest && e.target.closest('[data-adv-close]');
      if (closeBtn) { e.preventDefault(); e.stopPropagation(); closeFact(); return; }
      if (e.target && e.target.closest && e.target.closest('.td-adv-factbox')) return;
      e.preventDefault();
      e.stopPropagation();
      closeFact();
      return;
    }
    var t = e.target && e.target.closest && e.target.closest('[data-lucka]');
    if (t) {
      e.preventDefault();
      var d = +t.getAttribute('data-lucka');
      if (d) openDoor(d, t);
      return;
    }
    if (e.target && e.target.closest && e.target.closest('.td-adv-board')) return;
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
    box.innerHTML = factHtml(d);
    box.hidden = false;
    box.scrollTop = 0;
    var from = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
    var to = box.getBoundingClientRect();
    flipFromTo(box, from, to, false);
    lockScroll(true);
  }
  function closeFact() {
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

  function tabsHtml() {
    var win = gate().showWinner && gate().showWinner();
    return '<div class="td-adv-tabs" role="tablist">' +
      '<button type="button" role="tab" class="td-adv-tab' + (st.tab === 'jakt' ? ' on' : '') + '" data-tab="jakt" aria-selected="' + (st.tab === 'jakt') + '">Polkagrisjakt</button>' +
      (win ? '<button type="button" role="tab" class="td-adv-tab' + (st.tab === 'vinnare' ? ' on' : '') + '" data-tab="vinnare" aria-selected="' + (st.tab === 'vinnare') + '">Vinnare</button>' : '') +
      '</div>';
  }
  function jaktHtml() {
    var body = window.POLKAGRIS && POLKAGRIS.boardHtml ? POLKAGRIS.boardHtml() : '<p class="td-adv-muted">Topplistan laddas…</p>';
    return '<section class="td-adv-jakt">' +
      '<h2>Polkagrisjakten</h2>' +
      '<p>En polkagris i taget dyker upp någonstans i appen. Den som trycker först tar den. Nästa kommer på en ny plats, 5–60 minuter senare. Här ser du bara din egen placering och ditt eget antal – inga andras namn.</p>' +
      '<p class="td-adv-muted">Flest polkagrisar vinner (vid lika antal vinner den som nådde dit först). På nyårsafton presenteras vinnaren för alla med förnamn och första bokstaven i efternamnet, till exempel Christian P.</p>' +
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
  }

  function onPageClick(e) {
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
  A.stop = function () { if (stopFw) { stopFw(); stopFw = null; } };
})();
