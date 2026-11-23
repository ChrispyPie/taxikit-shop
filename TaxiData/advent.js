/* Adventskalender i december: 24 luckor med verifierade taxifakta.
 * Permanent modul som inte kan avinstalleras medan den är i säsong.
 * Bara luckor upp till dagens datum kan öppnas. Grind: 710022 tills vidare.
 * Testdatum: ?adventdatum=YYYY-MM-DD eller ?juldatum=YYYY-MM-DD. */
(function () {
  'use strict';
  var A = window.ADVENT = window.ADVENT || { id: 'advent', title: 'Adventskalender', icon: '🎄' };
  A.id = 'advent';
  A.title = 'Adventskalender';
  A.icon = '🎄';

  var st = { el: null, tab: 'luckor', opens: [], year: null, today: null, day: 0, month: 0, open: null, err: '', busy: false };

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
    l.href = 'advent.css?v=20261123adv1';
    document.head.appendChild(l);
  }

  function rpc(name, args) {
    if (typeof window.rpc === 'function') return window.rpc(name, args);
    return Promise.reject(new Error('no_rpc'));
  }

  function loadState() {
    var args = { p_token: token() };
    var asOf = asOfArg();
    if (asOf) args.p_as_of = asOf;
    return rpc('advent_state', args).then(function (r) {
      var t = today();
      st.year = (r && r.year) || t.y;
      st.today = (r && r.today) || t.iso;
      st.month = (r && r.month) || t.m;
      st.day = (r && r.day) || t.d;
      st.opens = (r && r.opens) || [];
      return r;
    }).catch(function () {
      var t = today();
      st.year = t.m === 1 ? t.y - 1 : t.y;
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

  function openDoor(d) {
    if (st.busy) return;
    if (!canOpen(d)) {
      st.err = d > st.day ? 'Den luckan öppnas den ' + d + ' december.' : 'Luckan kan inte öppnas ännu.';
      paint();
      return;
    }
    if (isOpen(d)) { st.open = d; paint(); return; }
    st.busy = true;
    var args = { p_token: token(), p_day: d };
    var asOf = asOfArg();
    if (asOf) args.p_as_of = asOf;
    rpc('advent_open', args).then(function () {
      if (st.opens.indexOf(d) < 0) st.opens.push(d);
      cacheOpens();
      st.open = d;
      st.busy = false;
      st.err = '';
      paint();
    }).catch(function (e) {
      st.busy = false;
      var code = (e && e.message) || '';
      if (code.indexOf('too_early') >= 0) st.err = 'Den luckan öppnas den ' + d + ' december.';
      else if (code.indexOf('demo_read_only') >= 0) st.err = 'Demokonto kan titta, men inte öppna luckor.';
      else {
        /* Lokal reserv om servern inte är uppe än (testram innan SQL körts). */
        if (st.opens.indexOf(d) < 0) st.opens.push(d);
        cacheOpens();
        st.open = d;
        st.err = '';
      }
      paint();
    });
  }

  function doorLabel(d) { return String(d); }

  function gridHtml() {
    var html = '<div class="td-adv-grid" role="list">';
    for (var d = 1; d <= 24; d++) {
      var opened = isOpen(d), ok = canOpen(d);
      var cls = 'td-adv-door' + (opened ? ' open' : ok ? ' ready' : ' locked');
      var label = opened ? 'Lucka ' + d + ', öppnad' : ok ? 'Öppna lucka ' + d : 'Lucka ' + d + ', låst till den ' + d + ' december';
      html += '<button type="button" class="' + cls + '" data-lucka="' + d + '" aria-label="' + esc(label) + '">' +
        '<span class="td-adv-num">' + doorLabel(d) + '</span>' +
        (opened ? '<span class="td-adv-check" aria-hidden="true">★</span>' : '') +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function factHtml(d) {
    var f = fakta()[d];
    if (!f) return '<p class="td-adv-muted">Ingen text för den luckan.</p>';
    var kalla = f.kalla ? '<p class="td-adv-src">Källa: ' + esc(f.kalla) +
      (f.url ? ' <a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">Läs mer</a>' : '') +
      '</p>' : '';
    return '<article class="td-adv-fact">' +
      '<p class="td-adv-kicker">Lucka ' + d + '</p>' +
      '<h2>' + esc(f.titel) + '</h2>' +
      '<p>' + esc(f.text) + '</p>' + kalla +
      '<button type="button" class="td-adv-close" data-adv-close="1">Stäng</button>' +
      '</article>';
  }

  function tabsHtml() {
    var win = gate().showWinner && gate().showWinner();
    return '<div class="td-adv-tabs" role="tablist">' +
      '<button type="button" role="tab" class="td-adv-tab' + (st.tab === 'luckor' ? ' on' : '') + '" data-tab="luckor" aria-selected="' + (st.tab === 'luckor') + '">Luckor</button>' +
      '<button type="button" role="tab" class="td-adv-tab' + (st.tab === 'jakt' ? ' on' : '') + '" data-tab="jakt" aria-selected="' + (st.tab === 'jakt') + '">Polkagrisjakt</button>' +
      (win ? '<button type="button" role="tab" class="td-adv-tab' + (st.tab === 'vinnare' ? ' on' : '') + '" data-tab="vinnare" aria-selected="' + (st.tab === 'vinnare') + '">Vinnare</button>' : '') +
      '</div>';
  }

  function jaktHtml() {
    var body = window.POLKAGRIS && POLKAGRIS.boardHtml ? POLKAGRIS.boardHtml() : '<p class="td-adv-muted">Topplistan laddas…</p>';
    return '<section class="td-adv-jakt">' +
      '<h2>Polkagrisjakten</h2>' +
      '<p>En polkagrisklubba i taget dyker upp någonstans i appen. Den som trycker först tar den. Nästa klubba kommer på en ny plats, 5–60 minuter senare. Tävlingen pågår i december. På nyårsafton presenteras vinnaren.</p>' +
      '<p class="td-adv-muted">På den här listan syns namn, för det är en tävling och inte taxidata.</p>' +
      body +
      '</section>';
  }

  var stopFw = null;
  function paint() {
    if (!st.el) return;
    css();
    var t = today();
    var html = '<div class="td-adv-page">';
    html += '<p class="td-adv-lead">24 luckor med taxifakta, en för varje dag i december. Öppna dagens lucka – och alla du missat hittills.</p>';
    html += tabsHtml();
    if (st.err) html += '<p class="td-adv-err" role="alert">' + esc(st.err) + '</p>';
    if (st.tab === 'jakt') {
      html += jaktHtml();
    } else if (st.tab === 'vinnare') {
      html += (window.POLKAGRIS && POLKAGRIS.winnerHtml) ? POLKAGRIS.winnerHtml() : '';
    } else {
      if (t.m !== 12 && !(t.m === 1 && t.d <= 6)) {
        html += '<p class="td-adv-muted">Kalendern öppnar 1 december.</p>';
      }
      html += gridHtml();
      if (st.open) html += factHtml(st.open);
    }
    html += '</div>';
    if (stopFw) { stopFw(); stopFw = null; }
    st.el.innerHTML = html;
    if (st.tab === 'vinnare' && window.POLKAGRIS && POLKAGRIS.fireworks) {
      var cv = st.el.querySelector('.td-pk-fw');
      if (cv) stopFw = POLKAGRIS.fireworks(cv);
    }
  }

  function onClick(e) {
    var t = e.target && e.target.closest && e.target.closest('[data-lucka],[data-tab],[data-adv-close]');
    if (!t) return;
    if (t.getAttribute('data-adv-close')) { st.open = null; paint(); return; }
    if (t.getAttribute('data-tab')) {
      st.tab = t.getAttribute('data-tab');
      st.open = null;
      st.err = '';
      if (st.tab !== 'luckor' && window.POLKAGRIS && POLKAGRIS.refresh) {
        POLKAGRIS.refresh().then(paint);
      }
      paint();
      return;
    }
    var d = +t.getAttribute('data-lucka');
    if (d) openDoor(d);
  }

  function render(el) {
    st.el = el;
    if (!allowed()) {
      el.innerHTML = '<p>Adventskalendern är inte öppen ännu.</p>';
      return;
    }
    css();
    el.onclick = onClick;
    el.innerHTML = '<p role="status">Laddar adventskalendern…</p>';
    var p = loadState();
    var q = (window.POLKAGRIS && POLKAGRIS.refresh) ? POLKAGRIS.refresh() : Promise.resolve();
    Promise.all([p, q]).then(function () { paint(); });
  }

  function refresh() {
    if (!st.el) return;
    loadState().then(paint);
  }

  A.render = render;
  A.refresh = refresh;
  A.isPinned = isPinned;
  A.allowed = allowed;
  A.canOpen = function (d) { return canOpen(d); };
  A.stop = function () { if (stopFw) { stopFw(); stopFw = null; } };
})();
