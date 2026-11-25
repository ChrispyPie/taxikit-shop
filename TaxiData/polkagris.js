/* Polkagrisjakt i december: egna klubbor per pass, upp till tre delade samtidigt
 * och sällsynta gyllene (3 poäng). Först som trycker tar en delad/guld.
 * Öppnas automatiskt för alla från 2026-12-01 00:00 Europe/Stockholm.
 * Före det syns den bara för 710022 och 693340 (testdatum: ?adventdatum= eller ?juldatum=). */
(function () {
  'use strict';

  var LIVE_FROM = '2026-12-01'; // 00:00 Europe/Stockholm, ingen manuell omkoppling
  var ALLOW = { '710022': 1, '693340': 1 };

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
    try { return String(localStorage.getItem('taxi_driver') || '').trim(); } catch (e) { return ''; }
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

  var st = { cane: null, canes: [], standings: [], board: [], mine: 0, myRank: 1, collectors: 0, totalRanked: 1, findable: 0, winner: null, hunt: false, showWin: false, season: null, me: '', flash: '', busy: false, timer: 0 };
  var elCanes = {};
  var seenCaneIds = {};
  var toastReady = false;

  function css() {
    if (document.getElementById('td-polkagris-css-link')) return;
    var l = document.createElement('link');
    l.id = 'td-polkagris-css-link';
    l.rel = 'stylesheet';
    l.href = 'polkagris.css?v=20261124zpk2';
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

  function hideCane(id) {
    if (id) {
      var el = elCanes[id] || document.getElementById('td-pk-cane-' + id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      delete elCanes[id];
      return;
    }
    Object.keys(elCanes).forEach(function (k) { hideCane(k); });
    var leftovers = document.querySelectorAll('.td-pk-cane');
    for (var i = 0; i < leftovers.length; i++) {
      if (leftovers[i].parentNode) leftovers[i].parentNode.removeChild(leftovers[i]);
    }
    elCanes = {};
  }

  function pulseCount() {
    var el = document.getElementById('td-pk-count');
    if (!el) return;
    el.classList.remove('td-pk-hdr-pulse');
    void el.offsetWidth;
    el.classList.add('td-pk-hdr-pulse');
    clearTimeout(pulseCount._t);
    pulseCount._t = setTimeout(function () {
      if (el) el.classList.remove('td-pk-hdr-pulse');
    }, 1600);
  }

  function caneOnThisPage(cane) {
    if (!cane || !cane.place_key) return false;
    var spec = PLACES[cane.place_key];
    if (!spec) return false;
    if (spec.view != null && spec.view !== currentView()) return false;
    return !!document.querySelector(spec.sel);
  }

  function hiddenCanes(list) {
    return (list || []).filter(function (c) { return c && !caneOnThisPage(c); });
  }

  function syncHuntHint() {
    var el = document.getElementById('td-pk-count');
    if (!el) return;
    var hidden = hiddenCanes(st.canes || []).length > 0;
    el.classList.toggle('td-pk-hdr-hunt', hidden);
    var n = st.mine || 0;
    var label = 'Polkagrisar: ' + n + ' poäng. Öppna ställningen.';
    if (hidden) label = 'En polkagris väntar någonstans i appen. ' + label;
    el.setAttribute('aria-label', label);
  }

  function noteNewCanes(list) {
    list = list || [];
    var added = [];
    list.forEach(function (c) {
      if (!c || c.id == null) return;
      if (seenCaneIds[c.id]) return;
      seenCaneIds[c.id] = true;
      if (!caneOnThisPage(c)) added.push(c);
    });
    toastReady = true;
    if (added.length) {
      var hasG = added.some(function (c) { return c.kind === 'golden'; });
      if (hasG) toast('En gyllene polkagris har dykt upp någonstans i appen.');
      else if (added.length > 1) toast('Nya polkagrisar har dykt upp någonstans i appen.');
      else toast('En polkagris har dykt upp någonstans i appen.');
      pulseCount();
    }
    syncHuntHint();
  }

  /* Samma polkagris som jakten: rödvit krokklubba, inte en lolly. */
  function caneIconHtml() {
    return '<svg class="td-pk-cane-svg" viewBox="0 0 32 40" width="22" height="28" aria-hidden="true">' +
      '<path d="M16 5c-6.2 0-11 4.4-11 10.2 0 3.2 2.2 5.6 5.2 5.6 2.6 0 5-2 5-4.6 0-1.5 1.1-2.6 2.6-2.6s2.7 1.1 2.7 2.7V34" fill="none" stroke="#c41e2a" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M16 5c-6.2 0-11 4.4-11 10.2 0 3.2 2.2 5.6 5.2 5.6 2.6 0 5-2 5-4.6 0-1.5 1.1-2.6 2.6-2.6s2.7 1.1 2.7 2.7V34" fill="none" stroke="#f7f3ea" stroke-width="7" stroke-linecap="round" stroke-dasharray="3.2 5.2" stroke-dashoffset="1"/>' +
      '<path d="M16 5c-6.2 0-11 4.4-11 10.2 0 3.2 2.2 5.6 5.2 5.6 2.6 0 5-2 5-4.6 0-1.5 1.1-2.6 2.6-2.6s2.7 1.1 2.7 2.7V34" fill="none" stroke="#8a1520" stroke-width="1.2" stroke-linecap="round" opacity=".35"/>' +
      '</svg>';
  }
  function huntVisible() {
    return allowed() && (inDecember(today()) || showWinner(today()));
  }
  function openBoard() {
    window._adventTab = 'jakt';
    if (window.ADVENT && typeof ADVENT.openTab === 'function') ADVENT.openTab('jakt');
    else if (typeof window.openItem === 'function') window.openItem('advent');
  }
  function isHome() {
    var app = document.getElementById('app');
    return !!(app && app.classList && app.classList.contains('is-home') && app.style.display !== 'none');
  }
  function ensureJulTop() {
    var app = document.getElementById('app');
    var content = document.getElementById('content');
    var rad = document.getElementById('jul-ljus-rad');
    if (!rad) {
      rad = document.createElement('div');
      rad.id = 'jul-ljus-rad';
    }
    rad.classList.add('td-jul-top');
    var left = rad.querySelector('.td-jul-top-left');
    var mid = rad.querySelector('.td-jul-top-mid');
    var right = rad.querySelector('.td-jul-top-right');
    if (!left || !mid || !right) {
      left = left || document.createElement('div');
      mid = mid || document.createElement('div');
      right = right || document.createElement('div');
      left.className = 'td-jul-top-left';
      mid.className = 'td-jul-top-mid';
      right.className = 'td-jul-top-right';
      var keep = [];
      for (var i = 0; i < rad.childNodes.length; i++) keep.push(rad.childNodes[i]);
      rad.appendChild(left);
      rad.appendChild(mid);
      rad.appendChild(right);
      keep.forEach(function (n) {
        if (n === left || n === mid || n === right) return;
        if (n.id === 'jul-ljusstake') mid.appendChild(n);
        else if (n.id === 'td-pk-count' || (n.classList && n.classList.contains('td-pk-hdr'))) right.appendChild(n);
        else if (n.id === 'td-adv-mini' || n.id === 'td-adv-hem' || (n.classList && n.classList.contains('td-adv-mini'))) left.appendChild(n);
        else if (n.id === 'jul-girlang') return;
        else mid.appendChild(n);
      });
    }
    if (app && content && content.parentNode === app) {
      var gir = document.getElementById('jul-girlang');
      if (gir && gir.parentNode === app) {
        if (rad.parentNode !== app || rad.previousSibling !== gir) {
          if (gir.nextSibling) app.insertBefore(rad, gir.nextSibling);
          else app.insertBefore(rad, content);
        }
      } else if (rad.parentNode !== app || (rad.nextSibling !== content && content.previousSibling !== rad)) {
        app.insertBefore(rad, content);
      }
    } else if (app && rad.parentNode !== app) {
      app.appendChild(rad);
    }
    return rad;
  }
  function syncJulTopOn() {
    var rad = document.getElementById('jul-ljus-rad');
    if (!rad) return;
    var hasMini = !!rad.querySelector('#td-adv-mini, .td-adv-mini');
    var hasCount = !!document.getElementById('td-pk-count');
    var candle = document.getElementById('jul-ljusstake');
    var hasCandle = !!(candle && !candle.hidden && candle.classList && candle.classList.contains('jul-on'));
    var on = !!(hasMini || hasCount || hasCandle);
    rad.classList.toggle('td-jul-top-on', on);
    if (!isHome()) rad.classList.remove('td-jul-top-on');
  }
  function mountCount() {
    if (!document.querySelectorAll) return;
    var leftovers = document.querySelectorAll('header .td-pk-hdr, .hdr-right .td-pk-hdr');
    for (var i = 0; i < leftovers.length; i++) {
      if (leftovers[i].id === 'td-pk-count') continue;
      if (leftovers[i].parentNode) leftovers[i].parentNode.removeChild(leftovers[i]);
    }
    var show = huntVisible() && isHome();
    var el = document.getElementById('td-pk-count');
    if (!show) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      syncJulTopOn();
      return;
    }
    var rad = ensureJulTop();
    var right = rad && rad.querySelector('.td-jul-top-right');
    if (!right) return;
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.id = 'td-pk-count';
      el.className = 'td-pk-hdr';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openBoard();
      });
    }
    if (el.parentNode !== right) right.appendChild(el);
    var n = st.mine || 0;
    el.innerHTML = caneIconHtml() + '<span class="td-pk-hdr-n">' + n + '</span>';
    el.setAttribute('aria-label', 'Polkagrisar: ' + n + ' poäng. Öppna ställningen.');
    syncHuntHint();
    syncJulTopOn();
  }

  function mountCane() {
    if (!allowed()) { hideCane(); return; }
    var list = st.canes && st.canes.length ? st.canes : (st.cane ? [st.cane] : []);
    var wanted = {};
    for (var i = 0; i < list.length; i++) {
      var cane = list[i];
      if (!cane || cane.id == null || !cane.place_key) continue;
      var spec = PLACES[cane.place_key];
      if (!spec) continue;
      if (spec.view != null && spec.view !== currentView()) continue;
      var host = document.querySelector(spec.sel);
      if (!host) continue;
      wanted[cane.id] = true;
      if (elCanes[cane.id] && document.body.contains(elCanes[cane.id])) continue;
      hideCane(cane.id);
      var el = document.createElement('button');
      el.type = 'button';
      el.id = 'td-pk-cane-' + cane.id;
      el.className = 'td-pk-cane td-pk-cane--' + (spec.pos || 'corner') +
        (cane.kind === 'golden' ? ' td-pk-cane--golden' : '');
      el.setAttribute('aria-label', cane.kind === 'golden'
        ? 'En gyllene polkagris! Tryck för att ta den.'
        : (cane.kind === 'personal' ? 'Din polkagris! Tryck för att ta den.' : 'En polkagris! Tryck för att ta den.'));
      el.innerHTML = '<span class="td-pk-cane-ico" aria-hidden="true">' + caneIconHtml() + '</span>';
      el.addEventListener('click', (function (cid) {
        return function (e) {
          e.preventDefault();
          e.stopPropagation();
          claim(cid);
        };
      })(cane.id));
      if (spec.pos === 'after') {
        host.style.position = host.style.position || 'relative';
        host.appendChild(el);
      } else if (spec.pos === 'hb') {
        document.body.appendChild(el);
      } else {
        var box = host;
        if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
        box.appendChild(el);
      }
      elCanes[cane.id] = el;
    }
    Object.keys(elCanes).forEach(function (k) {
      if (!wanted[k]) hideCane(k);
    });
    syncHuntHint();
  }

  function applyClaimScores(r) {
    if (!r) return;
    if (r.mine != null) st.mine = r.mine;
    if (r.my_rank != null) st.myRank = r.my_rank;
    if (r.collectors != null) st.collectors = r.collectors;
    if (r.total_ranked != null) st.totalRanked = r.total_ranked;
    if (r.board) st.board = r.board;
    if (r.standings) st.standings = r.standings;
    if (r.findable != null) st.findable = r.findable;
  }

  function dropCane(id) {
    st.canes = (st.canes || []).filter(function (c) { return c && c.id !== id; });
    if (st.cane && st.cane.id === id) st.cane = st.canes[0] || null;
    hideCane(id);
  }

  function claim(id, retried) {
    if (st.busy) return;
    id = id != null ? id : (st.cane && st.cane.id);
    if (id == null) return;
    st.busy = true;
    var args = { p_token: token(), p_cane_id: id };
    var asOf = asOfArg();
    if (asOf) args.p_as_of = asOf;
    rpc('polkagris_claim', args).then(function (r) {
      st.busy = false;
      applyClaimScores(r);
      if (r && r.ok) {
        dropCane(id);
        mountCount();
        var pts = r.points || 1;
        if (r.kind === 'golden') {
          toast('Du tog en gyllene polkagris! +' + pts + ' poäng. Du har ' + st.mine + ' poäng.');
        } else if (r.kind === 'personal') {
          toast('Du tog din polkagris! Du har ' + st.mine + ' poäng.');
        } else {
          toast('Du tog polkagrisen! Du har ' + st.mine + ' poäng.');
        }
      } else if (r && (r.already || r.reason === 'already')) {
        dropCane(id);
        mountCount();
        toast('En annan förare hann före.');
      } else if (r && r.reason === 'cap_shared') {
        toast('Du har redan tagit tre delade polkagrisar det här passet.');
      } else if (r && r.reason === 'cap_golden') {
        toast('Du har redan tagit en gyllene polkagris idag.');
      } else if (r && r.reason === 'expired') {
        dropCane(id);
        mountCount();
        toast('Polkagrisen hann försvinna.');
      } else if (r && r.reason === 'not_yours') {
        dropCane(id);
        toast('Den polkagrisen är inte din.');
      } else if (r && r.reason === 'stale' && !retried) {
        refresh().then(function () { claim(id, true); });
        return;
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
      st.canes = r.canes || (r.cane ? [r.cane] : []);
      st.cane = st.canes[0] || null;
      st.standings = r.standings || [];
      st.board = r.board || [];
      noteNewCanes(st.canes);
      st.mine = r.mine || 0;
      st.myRank = r.my_rank != null ? r.my_rank : 1;
      st.collectors = r.collectors != null ? r.collectors : 0;
      st.totalRanked = r.total_ranked != null ? r.total_ranked : Math.max(st.myRank, 1);
      st.findable = r.findable != null ? r.findable : 0;
      st.winner = r.winner || null;
      st.me = r.me || driverId();
      mountCane();
      mountCount();
      syncFindable();
      maybeShowWinnerModal();
      return r;
    }).catch(function () { return null; });
  }

  function tick() {
    refresh();
    mountCane();
    mountCount();
    syncFindable();
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

  function leadText() {
    var t = today();
    var year = t.m === 1 ? t.y - 1 : t.y;
    var line = 'Hitta polkagrisar i appen. Tävlingen pågår 1–31 december ' + year + '.';
    if (t.m === 12 && t.d < 31) {
      var n = 31 - t.d;
      line += ' ' + n + (n === 1 ? ' dag kvar.' : ' dagar kvar.');
    } else if (t.m === 12 && t.d >= 31) {
      line += ' Sista dagen.';
    } else if (showWinner(t)) {
      line += ' Tävlingen är slut.';
    }
    return line;
  }

  function findableText() {
    if (!st.hunt) return '';
    var n = st.findable == null ? 0 : st.findable;
    var word = n === 1 ? 'polkagris' : 'polkagrisar';
    return 'Just nu: ' + n + ' ' + word + ' att hitta 🍬';
  }

  function syncFindable() {
    var el = document.querySelector('.td-pk-now');
    var text = findableText();
    if (!text) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if (el) {
      el.textContent = text;
      return;
    }
    var jakt = document.querySelector('.td-adv-jakt h2');
    if (!jakt || !jakt.parentNode) return;
    el = document.createElement('p');
    el.className = 'td-pk-now';
    el.textContent = text;
    jakt.insertAdjacentElement('afterend', el);
  }

  function boardHtml() {
    var rows = st.standings || [];
    if (!rows.length) {
      rows = [{ rank: st.myRank || 1, points: st.mine || 0, mine: true, namn: 'Du' }];
    }
    var html = '<ol class="td-pk-board">';
    rows.forEach(function (r) {
      var rank = r.rank || 0;
      var pts = r.points || 0;
      if (r.mine) {
        html += '<li class="td-pk-row mine">' +
          '<span class="td-pk-rank">' + esc(String(rank)) + '.</span>' +
          '<span class="td-pk-name">' + esc(r.namn || 'Du') + '</span>' +
          '<span class="td-pk-count">' + esc(String(pts)) + ' p</span>' +
          '</li>';
      } else {
        html += '<li class="td-pk-row">' +
          '<span class="td-pk-anon">#' + esc(String(rank)) + ' · ' + esc(String(pts)) + ' p</span>' +
          '</li>';
      }
    });
    html += '</ol>';
    return html;
  }

  function rulesHtml() {
    return '<div class="td-pk-rules-sheet" id="td-pk-rules" role="dialog" aria-modal="true" aria-labelledby="td-pk-rules-title">' +
      '<div class="td-pk-rules-card">' +
      '<h2 id="td-pk-rules-title">Spelregler</h2>' +
      '<p>Du får två egna polkagrisar per arbetspass (natt 17–06 och dag 06–17). De syns bara för dig.</p>' +
      '<p>Upp till tre delade polkagrisar kan vara ute samtidigt. En ny kan dyka upp även om de gamla inte är tagna. Den som trycker först tar den. De försvinner efter 45 minuter om ingen tar dem, och dyker upp oftare på natten än på dagen. Du kan ta högst tre delade per pass.</p>' +
      '<p>Ibland dyker en gyllene polkagris upp. Den är värd tre poäng, och du kan ta högst en guld per dygn. Extra guld finns bland annat på Lucia, julafton och nyårsafton.</p>' +
      '<p>Flest poäng vinner (vid lika poäng vinner den som nådde dit först). På nyårsafton presenteras vinnaren för alla med förnamn och första bokstaven i efternamnet, till exempel Christian P.</p>' +
      '<p>Topplistan visar förare som kört minst ett pass de senaste 30 dagarna, även de med noll poäng. Du ser bara ditt eget namn. Övriga visas som plats och poäng, utan namn och utan förarnummer.</p>' +
      '<button type="button" class="td-pk-rules-close" data-pk-rules-close>Stäng</button>' +
      '</div></div>';
  }

  function closeRules() {
    var m = document.getElementById('td-pk-rules');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }

  function openRules() {
    closeRules();
    var wrap = document.createElement('div');
    wrap.innerHTML = rulesHtml();
    var el = wrap.firstChild;
    el.addEventListener('click', function (e) {
      if (e.target === el || (e.target.closest && e.target.closest('[data-pk-rules-close]'))) {
        e.preventDefault();
        closeRules();
      }
    });
    document.body.appendChild(el);
  }

  function winSeenKey() {
    var d = driverId() || 'x';
    var q = asOfArg();
    if (q) return 'td_pk_win_seen:' + d + ':test:' + q;
    return 'td_pk_win_seen:' + d + ':' + (st.season || seasonYear());
  }
  function hasSeenWin() {
    try {
      var store = asOfArg() ? sessionStorage : localStorage;
      return store.getItem(winSeenKey()) === '1';
    } catch (e) { return false; }
  }
  function markSeenWin() {
    try {
      var store = asOfArg() ? sessionStorage : localStorage;
      store.setItem(winSeenKey(), '1');
    } catch (e) {}
  }

  var stopWinFw = null;
  function closeWinnerModal() {
    markSeenWin();
    if (stopWinFw) { stopWinFw(); stopWinFw = null; }
    var m = document.getElementById('td-pk-win-modal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  function maybeShowWinnerModal() {
    if (!allowed() || !st.showWin || !st.winner) return;
    if (hasSeenWin()) return;
    if (document.getElementById('td-pk-win-modal')) return;
    css();
    markSeenWin();
    var m = document.createElement('div');
    m.id = 'td-pk-win-modal';
    m.className = 'td-pk-win-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', 'Vinnare av polkagrisjakten');
    m.innerHTML = '<div class="td-pk-win-dialog">' +
      winnerHtml() +
      '<button type="button" class="td-pk-win-close">Stäng</button>' +
      '</div>';
    m.addEventListener('click', function (e) {
      if (e.target === m || (e.target.closest && e.target.closest('.td-pk-win-close'))) {
        closeWinnerModal();
      }
    });
    document.body.appendChild(m);
    var cv = m.querySelector('.td-pk-fw');
    if (cv) stopWinFw = fireworks(cv);
  }

  function fireworks(canvas) {
    if (!canvas) return function () {};
    if (reducedMotion()) {
      try {
        var sctx = canvas.getContext('2d');
        var sw = canvas.width = (canvas.clientWidth || 320);
        var sh = canvas.height = (canvas.clientHeight || 260);
        [0.25, 0.5, 0.78].forEach(function (fx, k) {
          var cx = sw * fx, cy = sh * (0.25 + k * 0.08);
          for (var i = 0; i < 16; i++) {
            var a = (Math.PI * 2 * i) / 16;
            sctx.fillStyle = 'hsl(' + ((k * 90 + i * 22) % 360) + ' 90% 65%)';
            sctx.beginPath();
            sctx.arc(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 2.2, 0, Math.PI * 2);
            sctx.fill();
          }
        });
      } catch (e) {}
      return function () {};
    }
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
    if (!w) return '<p class="td-adv-muted">På nyårsafton visas vinnaren här, med fyrverkeri.</p>';
    var n = w.antal || 0;
    var note = '';
    if (w.test_preview) note = '<p class="td-pk-tie">Förhandsvisning (inga testklubbor tagna än).</p>';
    else if (w.tied_count && w.tied_count > 1) note = '<p class="td-pk-tie">Delat antal (' + esc(String(n)) + ') – den som nådde dit först vann.</p>';
    var yr = st.season ? String(st.season) : String((today().y) || 2026);
    return '<div class="td-pk-winner">' +
      '<canvas class="td-pk-fw" aria-hidden="true"></canvas>' +
      '<div class="td-pk-winner-card">' +
      '<p class="td-pk-winner-kicker">Gott nytt år! Vinnare ' + esc(yr) + '</p>' +
      '<h2 class="td-pk-winner-name">' + esc(w.namn || 'Förare') + '</h2>' +
      '<p class="td-pk-winner-sub">' + esc(String(n)) + ' poäng' + '</p>' +
      note +
      '</div></div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.ensureJulTop = ensureJulTop;
  window.POLKAGRIS = {
    start: start,
    stop: stop,
    refresh: refresh,
    tick: tick,
    mountCane: mountCane,
    mountCount: mountCount,
    openBoard: openBoard,
    ensureJulTop: ensureJulTop,
    caneIconHtml: caneIconHtml,
    boardHtml: boardHtml,
    leadText: leadText,
    findableText: findableText,
    syncFindable: syncFindable,
    rulesHtml: rulesHtml,
    openRules: openRules,
    closeRules: closeRules,
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
