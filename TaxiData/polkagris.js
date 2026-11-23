/* Polkagrisjakt i december: en klubba i taget någonstans i appen.
 * Först som trycker tar den. Nästa dyker upp 5–60 min senare på en annan plats.
 * Öppnas automatiskt för alla från 2026-12-01 00:00 Europe/Stockholm.
 * Före det syns den bara för 710022 (testdatum: ?adventdatum= eller ?juldatum=). */
(function () {
  'use strict';

  var LIVE_FROM = '2026-12-01'; // 00:00 Europe/Stockholm, ingen manuell omkoppling
  var ALLOW = { '710022': 1 };

  var PLACES = {
    hem: { view: '', sel: '#app.is-home .grid', pos: 'after' },
    kordata: { view: 'kordata', sel: '#dashboard-view', pos: 'corner' },
    lonekoll: { view: 'lonekoll', sel: '#content', pos: 'corner' },
    ankomster: { view: 'ankomster', sel: '#content', pos: 'corner' },
    prognos: { view: 'prognos', sel: '#content', pos: 'corner' },
    kalender: { view: 'kalender', sel: '#content', pos: 'corner' },
    topplistor: { view: 'topplistor', sel: '#content', pos: 'corner' },
    forum: { view: 'forum', sel: '#content', pos: 'corner' },
    installningar: { view: 'installningar', sel: '#content', pos: 'corner' },
    om: { view: 'om', sel: '#content', pos: 'corner' },
    vader: { view: 'vader', sel: '#content', pos: 'corner' },
    nyheter: { view: 'nyheter', sel: '#content', pos: 'corner' },
    advent: { view: 'advent', sel: '#content', pos: 'corner' },
    inkorg: { view: 'inkorg', sel: '#content', pos: 'corner' },
    hb: { view: null, sel: '#hb-stage, .hb-stage, #app', pos: 'hb' }
  };

  function driverId() {
    try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; }
  }
  function token() {
    try { return localStorage.getItem('taxi_session') || ''; } catch (e) { return ''; }
  }
  function stockholmParts() {
    var fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    var parts = {};
    fmt.formatToParts(new Date()).forEach(function (x) { parts[x.type] = x.value; });
    return parts;
  }
  function realToday() {
    var parts = stockholmParts();
    return { y: +parts.year, m: +parts.month, d: +parts.day, iso: parts.year + '-' + parts.month + '-' + parts.day };
  }
  function isLive() { return realToday().iso >= LIVE_FROM; }
  function inSeasonReal(t) {
    t = t || realToday();
    return t.m === 12 || (t.m === 1 && t.d <= 6);
  }
  function allowed() {
    if (ALLOW[driverId()]) return true;
    return isLive() && inSeasonReal();
  }
  function queryDate() {
    try {
      var q = new URLSearchParams(location.search);
      return q.get('adventdatum') || q.get('juldatum') || '';
    } catch (e) { return ''; }
  }
  function today() {
    var q = queryDate();
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
      var p = q.split('-');
      return { y: +p[0], m: +p[1], d: +p[2], iso: q };
    }
    return realToday();
  }
  function inDecember(t) { t = t || today(); return t.m === 12; }
  function showWinner(t) { t = t || today(); return (t.m === 12 && t.d >= 31) || (t.m === 1 && t.d <= 6); }
  function seasonYear(t) { t = t || today(); return t.m === 1 ? t.y - 1 : t.y; }
  function asOfArg() {
    var q = queryDate();
    return /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null;
  }
  function currentView() {
    if (typeof window.NAV_VIEW === 'function') return window.NAV_VIEW() || '';
    try {
      if (document.getElementById('dashboard-view') &&
          !document.getElementById('dashboard-view').classList.contains('hidden')) return 'kordata';
    } catch (e) {}
    return '';
  }
  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  window.ADVENT_GATE = {
    LIVE_FROM: LIVE_FROM,
    ALLOW: ALLOW,
    allowed: allowed,
    isLive: isLive,
    realToday: realToday,
    today: today,
    queryDate: queryDate,
    inDecember: inDecember,
    showWinner: showWinner,
    seasonYear: seasonYear,
    asOfArg: asOfArg,
    places: Object.keys(PLACES)
  };

  var st = { cane: null, board: [], mine: 0, winner: null, hunt: false, showWin: false, season: null, me: '', flash: '', busy: false, timer: 0 };
  var elCane = null;

  function css() {
    if (document.getElementById('td-polkagris-css-link')) return;
    var l = document.createElement('link');
    l.id = 'td-polkagris-css-link';
    l.rel = 'stylesheet';
    l.href = 'polkagris.css?v=20261123adv3';
    document.head.appendChild(l);
  }

  function rpc(name, args) {
    if (typeof window.rpc === 'function') return window.rpc(name, args);
    return Promise.reject(new Error('no_rpc'));
  }
  function toast(msg) {
    st.flash = msg || '';
    var t = document.getElementById('td-pk-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'td-pk-toast';
      t.className = 'td-pk-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = st.flash;
    t.classList.toggle('on', !!st.flash);
    clearTimeout(toast._t);
    if (st.flash) toast._t = setTimeout(function () { toast(''); }, 4200);
  }

  function hideCane() {
    if (elCane && elCane.parentNode) elCane.parentNode.removeChild(elCane);
    elCane = null;
  }

  function huntVisible() {
    return allowed() && (inDecember(today()) || showWinner(today()));
  }
  function openBoard() {
    window._adventTab = 'jakt';
    if (window.ADVENT && typeof ADVENT.openTab === 'function') ADVENT.openTab('jakt');
    else if (typeof window.openItem === 'function') window.openItem('advent');
  }
  function mountCount() {
    if (!document.querySelectorAll) return;
    var rights = document.querySelectorAll('.hdr-right');
    var show = huntVisible();
    for (var i = 0; i < rights.length; i++) {
      var right = rights[i];
      var el = right.querySelector('.td-pk-hdr');
      if (!show) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
        continue;
      }
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'td-pk-hdr';
        el.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openBoard();
        });
        right.insertBefore(el, right.firstChild);
      }
      var n = st.mine || 0;
      el.textContent = 'Polkagrisar: ' + n;
      el.setAttribute('aria-label', 'Polkagrisar: ' + n + '. Öppna ställningen.');
    }
  }

  function mountCane() {
    hideCane();
    if (!allowed() || !st.cane || !st.cane.place_key) return;
    var spec = PLACES[st.cane.place_key];
    if (!spec) return;
    if (spec.view != null && spec.view !== currentView()) return;
    var host = document.querySelector(spec.sel);
    if (!host) return;
    elCane = document.createElement('button');
    elCane.type = 'button';
    elCane.id = 'td-pk-cane';
    elCane.className = 'td-pk-cane td-pk-cane--' + (spec.pos || 'corner');
    elCane.setAttribute('aria-label', 'En polkagris! Tryck för att ta den.');
    elCane.innerHTML = '<span class="td-pk-cane-ico" aria-hidden="true">🍭</span>';
    elCane.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      claim();
    });
    if (spec.pos === 'after') {
      host.style.position = host.style.position || 'relative';
      host.appendChild(elCane);
    } else if (spec.pos === 'hb') {
      document.body.appendChild(elCane);
    } else {
      var box = host;
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      box.appendChild(elCane);
    }
  }

  function claim() {
    if (st.busy || !st.cane) return;
    st.busy = true;
    var id = st.cane.id;
    var args = { p_token: token(), p_cane_id: id };
    var asOf = asOfArg();
    if (asOf) args.p_as_of = asOf;
    rpc('polkagris_claim', args).then(function (r) {
      st.busy = false;
      if (r && r.ok) {
        st.mine = r.mine || (st.mine + 1);
        st.board = r.board || st.board;
        st.cane = null;
        hideCane();
        mountCount();
        toast('Du tog polkagrisen! Du har ' + st.mine + (st.mine === 1 ? ' klubba.' : ' klubbor.'));
      } else if (r && r.already) {
        st.cane = null;
        hideCane();
        mountCount();
        toast((r.namn ? r.namn : 'En annan förare') + ' hann före.');
      } else {
        toast('Det gick inte att ta klubban just nu.');
      }
      if (window.ADVENT && ADVENT.refresh) ADVENT.refresh();
    }).catch(function () {
      st.busy = false;
      toast('Det gick inte att ta klubban just nu.');
    });
  }

  function refresh() {
    if (!allowed() || !token()) { hideCane(); mountCount(); return Promise.resolve(null); }
    var t = today();
    if (!inDecember(t) && !showWinner(t)) { hideCane(); mountCount(); return Promise.resolve(null); }
    var args = { p_token: token() };
    var asOf = asOfArg();
    if (asOf) args.p_as_of = asOf;
    return rpc('polkagris_state', args).then(function (r) {
      if (!r) return r;
      st.season = r.season;
      st.hunt = !!r.hunt;
      st.showWin = !!r.show_winner;
      st.cane = r.cane || null;
      st.board = r.board || [];
      st.mine = r.mine || 0;
      st.winner = r.winner || null;
      st.me = r.me || driverId();
      mountCane();
      mountCount();
      return r;
    }).catch(function () { return null; });
  }

  function tick() {
    refresh();
    mountCane();
    mountCount();
  }

  function start() {
    css();
    if (st.timer) clearInterval(st.timer);
    if (!allowed()) return;
    tick();
    st.timer = setInterval(tick, 25000);
    if (!start._bound) {
      start._bound = true;
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') tick();
      });
      window.addEventListener('hashchange', function () { setTimeout(mountCane, 80); });
    }
  }

  function stop() {
    if (st.timer) { clearInterval(st.timer); st.timer = 0; }
    hideCane();
    mountCount();
  }

  function boardHtml() {
    var rows = Array.isArray(st.board) ? st.board.slice() : [];
    if (!rows.length) {
      return '<p class="td-adv-muted">Ingen har tagit någon polkagris ännu. Håll ögonen öppna i appen – en klubba i taget dyker upp på en slumpad plats.</p>';
    }
    var html = '<ol class="td-pk-board">';
    rows.forEach(function (r, i) {
      var mine = r.driver_id === st.me;
      html += '<li class="td-pk-row' + (mine ? ' mine' : '') + '">' +
        '<span class="td-pk-rank">' + (i + 1) + '</span>' +
        '<span class="td-pk-name">' + esc(r.namn || 'Förare') + '</span>' +
        '<span class="td-pk-count">' + esc(String(r.antal || 0)) + '</span></li>';
    });
    html += '</ol>';
    if (st.mine) html += '<p class="td-adv-muted">Du har ' + st.mine + (st.mine === 1 ? ' klubba' : ' klubbor') + '.</p>';
    return html;
  }

  function fireworks(canvas) {
    if (!canvas || reducedMotion()) return function () {};
    var ctx = canvas.getContext('2d');
    var w, h, bits = [], running = true, raf;
    function size() {
      w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
      h = canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    }
    function burst(x, y) {
      var n = 28 + Math.floor(Math.random() * 18);
      var hue = Math.floor(Math.random() * 360);
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        var sp = 1.2 + Math.random() * 3.4;
        bits.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue: hue + Math.random() * 30 });
      }
    }
    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      if (bits.length < 80 && Math.random() < 0.08) burst(Math.random() * w, Math.random() * h * 0.6 + 8);
      for (var i = bits.length - 1; i >= 0; i--) {
        var b = bits[i];
        b.x += b.vx; b.y += b.vy; b.vy += 0.04; b.life -= 0.012;
        if (b.life <= 0) { bits.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.fillStyle = 'hsl(' + (b.hue % 360) + ' 90% 60%)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    size();
    window.addEventListener('resize', size);
    burst(w * 0.5, h * 0.35);
    raf = requestAnimationFrame(frame);
    return function () {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }

  function winnerHtml() {
    var w = st.winner;
    if (!w) return '<p class="td-adv-muted">När tävlingen är slut visas vinnaren här, med fyrverkeri.</p>';
    return '<div class="td-pk-winner">' +
      '<canvas class="td-pk-fw" aria-hidden="true"></canvas>' +
      '<div class="td-pk-winner-card">' +
      '<p class="td-pk-winner-kicker">Vinnare av polkagrisjakten ' + esc(String(st.season || '')) + '</p>' +
      '<h2 class="td-pk-winner-name">' + esc(w.namn || 'Förare') + '</h2>' +
      '<p class="td-adv-muted">' + esc(String(w.antal || 0)) + ' polkagrisar.</p>' +
      '</div></div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.POLKAGRIS = {
    start: start,
    stop: stop,
    refresh: refresh,
    tick: tick,
    mountCane: mountCane,
    mountCount: mountCount,
    openBoard: openBoard,
    boardHtml: boardHtml,
    winnerHtml: winnerHtml,
    fireworks: fireworks,
    state: function () { return st; },
    places: PLACES
  };

  function boot() {
    css();
    if (allowed()) start();
    if (!boot._watch) {
      boot._watch = setInterval(function () {
        if (allowed() && !st.timer) start();
        else if (!allowed() && st.timer) stop();
      }, 4000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
