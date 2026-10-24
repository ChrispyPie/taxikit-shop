/* Ankomster: tåg till Göteborg C och flyg till Landvetter.
 *
 * Namn, ikon och källor finns samlade i ANKOMSTER nedan. Byt namn på sidan genom att
 * ändra title (och vid behov icon). En ny källa (t.ex. Båt) läggs till som ett nytt
 * objekt i sources med en load()-funktion som returnerar en lista i samma form som
 * trainItem()/flightItem() nedan.
 *
 * Inga API-nycklar här: tåg läses från Vercel-funktionen /api/trains (nyckeln finns bara
 * på servern), flyg från den delade cachen skiftlogg/feed/got.json som GitHub-jobbet skriver.
 */
(function () {
  'use strict';

  var TRAIN_URLS = ['https://taxikit-shop.vercel.app/api/trains', '../skiftlogg/feed/tag.json'];
  var FLIGHT_URLS = ['../skiftlogg/feed/got.json',
    'https://raw.githubusercontent.com/ChrispyPie/taxikit-shop/main/skiftlogg/feed/got.json'];

  var A = window.ANKOMSTER = {
    id: 'ankomster',
    title: 'Ankomster',
    icon: '🛬',
    refreshMs: 60 * 1000,        // ny data varje minut
    pastMin: 15,                 // visa ankomna så här länge efter ankomst
    pastMoreMin: 180,            // "Visa tidigare" visar så här långt bakåt
    aheadHours: 16,
    sources: [
      { id: 'tag', label: 'Tåg', icon: '🚆', place: 'Göteborg C', load: loadTrains, filter: trainFilter },
      { id: 'flyg', label: 'Flyg', icon: '✈️', place: 'Landvetter', load: loadFlights }
      // { id: 'bat', label: 'Båt', icon: '⛴️', place: '…', load: loadBoats }
    ]
  };

  var state = { tab: null, data: {}, err: {}, updated: {}, showPast: false, timer: null, tick: null, el: null, loading: {} };

  // ---------- hjälp ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function d(v) { if (!v) return null; var x = new Date(v); return isNaN(x) ? null : x; }
  function hm(x) {
    return x ? x.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }) : '';
  }
  function dayKey(x) { return x.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }); }
  function dayLabel(x) {
    var k = dayKey(x), now = new Date();
    if (k === dayKey(now)) return 'Idag';
    if (k === dayKey(new Date(now.getTime() + 864e5))) return 'Imorgon';
    if (k === dayKey(new Date(now.getTime() - 864e5))) return 'Igår';
    return x.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' });
  }
  function getJson(urls, bust) {
    var i = 0;
    function next(lastErr) {
      if (i >= urls.length) return Promise.reject(lastErr || new Error('ingen källa'));
      var u = urls[i++];
      if (bust) u += (u.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 30000);
      return fetch(u, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).catch(next);
    }
    return next();
  }

  // ---------- tåg ----------
  function trainItem(t) {
    var product = String(t.product || '');
    return {
      key: 't' + t.id + '|' + t.sched,
      no: 'Tåg ' + (t.id || ''),
      sub: product,
      from: t.other || (t.from && t.from[0]) || '',
      sched: d(t.sched), est: d(t.est), act: d(t.act),
      canceled: !!t.canceled,
      info: t.track ? 'Spår ' + t.track : '',
      note: (!t.act && t.lastSeen && t.lastSeenTs && t.lastSeen !== t.lastSeenSig) ? 'Senast ' + t.lastSeen + ' ' + hm(d(t.lastSeenTs)) : '',
      local: /västtåg|pendel/i.test(product)
    };
  }
  function loadTrains() {
    return getJson(TRAIN_URLS, false).then(function (j) {
      return { updated: j.updated, items: (j.trains || []).filter(function (t) { return t.dir === 'ANK'; }).map(trainItem) };
    });
  }
  function trainFilter() {
    var on = localStorage.getItem('ank_fjarr') !== '0';
    return {
      html: '<div class="ank-chips"><button class="ank-chip' + (on ? ' on' : '') + '" data-fjarr="1">Fjärrtåg</button>' +
            '<button class="ank-chip' + (on ? '' : ' on') + '" data-fjarr="0">Alla tåg</button></div>',
      test: function (it) { return !on || !it.local; }
    };
  }

  // ---------- flyg ----------
  function flightItem(f) {
    var st = String(f.status || '').toUpperCase();
    var bag = [];
    if (f.baggage) bag.push('Band ' + f.baggage);
    if (f.firstBag) bag.push('Första väskan ' + hm(d(f.firstBag)));
    else if (f.firstBagEst && !f.lastBag) bag.push('Väskor ca ' + hm(d(f.firstBagEst)));
    var special = { RER: 'Omdirigerad', DIV: 'Omdirigerad', FLS: 'Stoppad' }[st];
    return {
      key: 'f' + f.id + '|' + f.sched,
      no: f.id || '',
      sub: f.airline || '',
      from: f.other || f.iata || '',
      sched: d(f.sched), est: d(f.est), act: d(f.act) || (st === 'LAN' ? d(f.est) || d(f.sched) : null),
      canceled: st === 'CAN',
      removed: st === 'DEL',
      special: special || '',
      info: [f.terminal ? 'Terminal ' + String(f.terminal).replace(/^T/i, '') : ''].concat(bag).filter(Boolean).join(' · '),
      note: (!special && st && st !== 'SCH' && st !== 'LAN' && st !== 'CAN' && f.statusSv) ? f.statusSv : ''
    };
  }
  function loadFlights() {
    return getJson(FLIGHT_URLS, true).then(function (j) {
      return { updated: j.arrivalsUpdated || j.updated,
               items: (j.arrivals || []).map(flightItem).filter(function (x) { return !x.removed; }) };
    });
  }

  // ---------- status ----------
  function when(it) { return it.act || it.est || it.sched; }
  function badge(it) {
    if (it.canceled) return '<span class="ank-badge bad">Inställd</span>';
    if (it.special) return '<span class="ank-badge bad">' + esc(it.special) + '</span>';
    var delay = (it.sched && (it.act || it.est)) ? Math.round(((it.act || it.est) - it.sched) / 60000) : 0;
    var dtxt = delay >= 1 ? '+' + delay + ' min' : (delay <= -3 ? delay + ' min' : '');
    if (it.act) return '<span class="ank-badge done">' + (it.key[0] === 'f' ? 'Landat' : 'Ankom') + ' ' + hm(it.act) + '</span>' +
      (dtxt ? '<span class="ank-delay ' + (delay >= 15 ? 'bad' : delay >= 1 ? 'warn' : 'early') + '">' + dtxt + '</span>' : '');
    if (delay >= 15) return '<span class="ank-badge bad">' + dtxt + '</span>';
    if (delay >= 1) return '<span class="ank-badge warn">' + dtxt + '</span>';
    if (delay <= -3) return '<span class="ank-badge early">Tidig</span>';
    return '<span class="ank-badge ok">I tid</span>';
  }

  function rowHtml(it) {
    var shown = when(it), changed = it.sched && shown && Math.abs(shown - it.sched) >= 60000;
    var cls = 'ank-row' + (it.canceled ? ' canceled' : '') + (it.act ? ' arrived' : '');
    return '<div class="' + cls + '">' +
      '<div class="ank-time"><div class="ank-new' + (changed && !it.act ? ' changed' : '') + '">' + hm(it.canceled ? it.sched : shown) + '</div>' +
        (changed && !it.canceled ? '<div class="ank-old">' + hm(it.sched) + '</div>' : '') + '</div>' +
      '<div class="ank-main"><div class="ank-from">' + esc(it.from) + '</div>' +
        '<div class="ank-meta"><b>' + esc(it.no) + '</b>' + (it.sub ? ' · ' + esc(it.sub) : '') + '</div>' +
        (it.info ? '<div class="ank-meta">' + esc(it.info) + '</div>' : '') +
        (it.note ? '<div class="ank-note">' + esc(it.note) + '</div>' : '') + '</div>' +
      '<div class="ank-status">' + badge(it) + '</div></div>';
  }

  function src() {
    for (var i = 0; i < A.sources.length; i++) if (A.sources[i].id === state.tab) return A.sources[i];
    return A.sources[0];
  }

  function paint() {
    var el = state.el; if (!el || !el.isConnected) return stop();
    var s = src(), data = state.data[s.id], now = Date.now();
    var filt = s.filter ? s.filter() : null;
    var html = '<div class="tabs ank-tabs">' + A.sources.map(function (x) {
      return '<button class="tab' + (x.id === s.id ? ' active' : '') + '" data-ank-tab="' + x.id + '">' + x.icon + ' ' + esc(x.label) + '</button>';
    }).join('') + '</div>';
    var upd = state.updated[s.id] ? d(state.updated[s.id]) : null;
    var stale = upd && now - upd > 15 * 60000;
    html += '<div class="ank-head"><span><b>' + esc(s.place) + '</b>' + (upd ? ' · uppdaterad ' + hm(upd) : '') + '</span>' +
            '<button class="ank-refresh" data-ank-refresh aria-label="Uppdatera">' + (state.loading[s.id] ? '…' : '↻') + '</button></div>';
    if (stale) html += '<div class="ank-warn">Datan är äldre än 15 minuter.</div>';
    if (state.err[s.id]) html += '<div class="ank-warn">Kunde inte hämta nya tider' + (data ? ', visar senaste.' : '. Försöker igen strax.') + '</div>';
    if (filt) html += filt.html;

    if (!data) {
      html += '<div class="ank-empty">' + (state.err[s.id] ? '' : 'Hämtar…') + '</div>';
    } else {
      var from = now - (state.showPast ? A.pastMoreMin : A.pastMin) * 60000, to = now + A.aheadHours * 3600000;
      var list = data.filter(function (it) {
        var w = when(it); if (!w) return false;
        var ref = it.act ? it.act : (it.canceled ? it.sched : w);
        return ref >= from && w <= to && (!filt || filt.test(it));
      }).sort(function (a, b) { return when(a) - when(b); });
      html += '<button class="ank-more" data-ank-past>' + (state.showPast ? 'Dölj tidigare' : 'Visa tidigare ankomster') + '</button>';
      if (!list.length) html += '<div class="ank-empty">Inga ankomster just nu.</div>';
      var lastDay = dayKey(new Date());
      list.forEach(function (it) {
        var k = dayKey(when(it));
        if (k !== lastDay) { html += '<div class="ank-day">' + dayLabel(when(it)) + '</div>'; lastDay = k; }
        html += rowHtml(it);
      });
    }
    el.innerHTML = html;
  }

  function load(id, quiet) {
    var s = null; A.sources.forEach(function (x) { if (x.id === id) s = x; });
    if (!s || state.loading[id]) return;
    state.loading[id] = true; if (!quiet) paint();
    s.load().then(function (r) {
      state.data[id] = r.items; state.updated[id] = r.updated; state.err[id] = false;
    }).catch(function () { state.err[id] = true; })
      .then(function () { state.loading[id] = false; if (state.tab === id) paint(); });
  }

  function onClick(e) {
    var t = e.target.closest('[data-ank-tab]');
    if (t) { state.tab = t.getAttribute('data-ank-tab'); localStorage.setItem('ank_tab', state.tab); state.showPast = false; paint(); load(state.tab, true); return; }
    if (e.target.closest('[data-ank-refresh]')) { load(state.tab); return; }
    if (e.target.closest('[data-ank-past]')) { state.showPast = !state.showPast; paint(); return; }
    var f = e.target.closest('[data-fjarr]');
    if (f) { localStorage.setItem('ank_fjarr', f.getAttribute('data-fjarr')); paint(); }
  }
  function onVisible() { if (!document.hidden && state.el) load(state.tab, true); }

  function stop() {
    clearInterval(state.timer); clearInterval(state.tick); state.timer = state.tick = null;
    document.removeEventListener('visibilitychange', onVisible);
    state.el = null;
  }

  // Visar sidan i elementet el. Anropas från index.html (renderMenu).
  A.render = function (el) {
    stop();
    state.el = document.createElement('div');
    state.el.className = 'ank';
    state.el.addEventListener('click', onClick);
    el.innerHTML = ''; el.appendChild(state.el);
    var saved = localStorage.getItem('ank_tab');
    state.tab = A.sources.some(function (x) { return x.id === saved; }) ? saved : A.sources[0].id;
    paint();
    load(state.tab, true);
    state.timer = setInterval(function () { if (!document.hidden) load(state.tab, true); }, A.refreshMs);
    state.tick = setInterval(paint, 20000);  // flytta fram listan när tiden går
    document.addEventListener('visibilitychange', onVisible);
  };
  A.stop = stop;
})();
