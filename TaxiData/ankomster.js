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
      { id: 'tag', label: 'Tåg', icon: '🚆', place: 'Göteborg C', load: loadTrains, groups: trainGroups,
        summaryFilter: function (it) { return !!it.group; } },
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
      info: trainLine(t),
      tid: t.id || '', schedRaw: t.sched || '',
      note: '',
      group: trainGroup(t)
    };
  }
  // Nedersta raden: "Anlänt spår 5" / "Inkommande spår 5" / "Senast sedd: Alingsås 15:12" / "Ej avgått".
  // Inkommande = inte ankommet och beräknad ankomst inom 10 min (och tåget har setts någonstans,
  // eller inom 5 min), eller senast sett vid Olskroken/Marieholm/Gubbero precis utanför Göteborg C.
  var NEAR_G = { G: 1, Or: 1, Gbm: 1, Gro: 1 };
  function trainLine(t) {
    var tr = t.track && String(t.track).toLowerCase() !== 'x' ? ' spår ' + t.track : '';
    if (t.act) return 'Anlänt' + tr;
    if (t.canceled) return tr ? 'Spår ' + t.track : '';
    var arr = d(t.est) || d(t.sched), mins = arr ? (arr - Date.now()) / 60000 : 1e9;
    var seen = t.lastSeen && t.lastSeenTs ? d(t.lastSeenTs) : null;
    if (NEAR_G[t.lastSeenSig] || (mins <= 10 && (seen || mins <= 5))) return 'Inkommande' + tr;
    if (seen) return 'Senast sedd: ' + t.lastSeen + ' ' + hm(seen);
    if ((t.posChecked && mins > 30) || mins > 300) return 'Ej avgått';
    return tr ? 'Spår ' + t.track : '';
  }
  // Grupp efter avgångsstation (FromLocation från Trafikverket). Både namn och signatur
  // kontrolleras, eftersom reservfilen tag.json ibland bara har signaturen (t.ex. "Dk.kh").
  // Verifierat mot riktig data 2026-10-25: Stockholm C = Cst, Köpenhamn H = Dk.kh, Oslo S = No.osl.
  var TRAIN_GROUPS = [
    { id: 'sthlm', label: 'Stockholm', short: 'Sthlm', sig: /^(Cst|Sci|Arnc)$/, name: /^(Stockholm|Arlanda)/i },
    { id: 'kbh', label: 'Köpenhamn', short: 'Kbh', sig: /^(Dk\.|Kh$)/, name: /^(Köpenhamn|København|Kastrup)/i },
    { id: 'oslo', label: 'Oslo', sig: /^(No\.|Öslo$|Xoslo$)/, name: /^Oslo/i }
  ];
  function trainGroup(t) {
    var sig = String(t.otherSig || ''), name = String(t.other || (t.from && t.from[0]) || '');
    for (var i = 0; i < TRAIN_GROUPS.length; i++) {
      var g = TRAIN_GROUPS[i];
      if (g.sig.test(sig) || g.sig.test(name) || g.name.test(name)) return g.id;
    }
    return '';
  }
  function loadTrains() {
    return getJson(TRAIN_URLS, false).then(function (j) {
      return { updated: j.updated, items: (j.trains || []).filter(function (t) { return t.dir === 'ANK'; }).map(trainItem) };
    });
  }
  // Filterknappar överst på tågfliken: Alla | Stockholm | Köpenhamn | Oslo. Senaste val sparas.
  function trainGroups() {
    return [{ id: '', label: 'Alla' }].concat(TRAIN_GROUPS);
  }
  function activeGroup(s) {
    var v = localStorage.getItem('ank_tagfilter') || '';
    return s.groups().some(function (g) { return g.id === v; }) ? v : '';
  }

  // ---------- flyg ----------
  function flightItem(f) {
    var st = String(f.status || '').toUpperCase();
    var bag = [], arr = d(f.act) || d(f.est) || d(f.sched), fb = d(f.firstBag);
    if (fb && arr && fb < arr - 30 * 60000) fb = null;  // gammal tid från tidigare flyg
    if (f.baggage) bag.push('Band ' + f.baggage);
    if (fb) bag.push('Första väskan ' + hm(fb));
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

  // ---------- stationslista (kort tryck på en tågrad) ----------
  // Hämtas på begäran från /api/trains?route=<tågnr>&sched=<ankomst G> (en Trafikverket-fråga per tåg,
  // cachad på servern). Idé och logik från gamla flödesappen (skiftlogg/js/app-3.js, rutt-listan).
  var ROUTE_URL = 'https://taxikit-shop.vercel.app/api/trains';
  state.open = {}; state.routes = {};
  function findItem(key) {
    var list = state.data.tag || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }
  function toggleRoute(key) {
    if (state.open[key]) { delete state.open[key]; paint(); return; }
    state.open[key] = true; paint(); fetchRoute(key, false);
  }
  function fetchRoute(key, quiet) {
    var it = findItem(key); if (!it) return;
    var r = state.routes[key] || (state.routes[key] = {});
    if (r.loading || (quiet && r.at && Date.now() - r.at < 45000)) return;
    r.loading = true;
    fetch(ROUTE_URL + '?route=' + encodeURIComponent(it.tid) + '&sched=' + encodeURIComponent(it.schedRaw), { cache: 'no-store' })
      .then(function (x) { if (!x.ok) throw new Error(x.status); return x.json(); })
      .then(function (j) { r.data = j; r.err = false; r.at = Date.now(); })
      .catch(function () { r.err = true; })
      .then(function () { r.loading = false; if (state.open[key]) paint(); });
  }
  function delayTxt(sched, real) {
    if (!sched || !real) return '';
    var m = Math.round((real - sched) / 60000);
    return m >= 1 ? '<span class="ank-st-dl' + (m >= 15 ? ' bad' : '') + '">+' + m + '</span>' : (m <= -2 ? '<span class="ank-st-dl early">' + m + '</span>' : '');
  }
  function routeHtml(it) {
    var r = state.routes[it.key] || {};
    if (!r.data) return '<div class="ank-route"><div class="ank-st-hint">' + (r.err ? 'Kunde inte hämta stationslistan.' : 'Hämtar stationslista…') + '</div></div>';
    var stops = r.data.stops || [], seen = r.data.lastSeen;
    if (!stops.length) return '<div class="ank-route"><div class="ank-st-hint">Ingen stationslista hos Trafikverket.</div></div>';
    var lastPassed = -1;
    stops.forEach(function (s, i) { if (s.arrAct || s.depAct) lastPassed = i; });
    var g = stops[stops.length - 1], arrived = !!(g && g.arrAct);
    var seenIdx = -1;
    if (seen) stops.forEach(function (s, i) { if (s.sig === seen.sig) seenIdx = i; });
    var atStation = seenIdx >= 0 && seenIdx === lastPassed && stops[seenIdx].arrAct && !stops[seenIdx].depAct && seenIdx < stops.length - 1;
    var html = '<div class="ank-route">';
    stops.forEach(function (s, i) {
      var sch = d(s.arrSched) || d(s.depSched), real = d(s.arrAct) || d(s.depAct), est = d(s.arrEst) || d(s.depEst);
      if (i === 0) { sch = d(s.depSched) || sch; real = d(s.depAct) || real; est = d(s.depEst) || est; }
      var passed = i <= lastPassed, now = atStation && i === seenIdx;
      var cls = 'ank-st' + (passed ? ' passed' : '') + (now ? ' now' : '') + (s.canceled ? ' canceled' : '') + (i === stops.length - 1 ? ' last' : '');
      var right = real ? hm(real) : (est ? hm(est) : '');
      html += '<div class="' + cls + '"><div class="ank-st-dot">' + (passed && !now ? '✓' : '') + '</div>' +
        '<div class="ank-st-name">' + esc(s.name || s.sig) + (now ? ' <b class="ank-st-here">här nu</b>' : '') + '</div>' +
        '<div class="ank-st-time"><span class="ank-st-plan' + (right && right !== hm(sch) ? ' old' : '') + '">' + hm(sch) + '</span>' +
        (right && right !== hm(sch) ? ' <span class="ank-st-real' + (real ? '' : ' est') + '">' + right + '</span>' : '') +
        delayTxt(sch, real || est) + '</div></div>';
      if (!arrived && !atStation && i === lastPassed && i < stops.length - 1) {
        html += '<div class="ank-st here"><div class="ank-st-dot">●</div><div class="ank-st-name"><b class="ank-st-here">Här nu</b>' +
          (seen && seen.sig !== s.sig ? ' · ' + esc(seen.name || seen.sig) + ' ' + hm(d(seen.ts)) : '') + '</div><div class="ank-st-time"></div></div>';
      }
    });
    return html + '</div>';
  }

  function rowHtml(it) {
    var shown = when(it), changed = it.sched && shown && Math.abs(shown - it.sched) >= 60000;
    var cls = 'ank-row' + (it.canceled ? ' canceled' : '') + (it.act ? ' arrived' : '');
    return '<div class="' + cls + (it.tid ? ' ank-tap' : '') + '"' + (it.tid ? ' data-ank-route="' + esc(it.key) + '"' : '') + '>' +
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

  // Svepbara knapprader (.tabs, filterknappar): håll den valda knappen synlig.
  function scrollRowTo(row, btn) {
    if (!row || !btn || row.scrollWidth <= row.clientWidth + 1) return;
    var l = btn.offsetLeft - row.offsetLeft, w = btn.offsetWidth;
    if (l < row.scrollLeft + 8 || l + w > row.scrollLeft + row.clientWidth - 8) row.scrollLeft = l - (row.clientWidth - w) / 2;
  }
  function keepActiveInView(root) {
    (root || document).querySelectorAll('.tabs, .ank-chips.tf').forEach(function (row) {
      scrollRowTo(row, row.querySelector('.active, .on'));
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.tabs > *, .ank-chips.tf > *');
    if (b) setTimeout(function () { var r = b.parentNode; if (r && r.isConnected) scrollRowTo(r, b); }, 0);
  });
  window.addEventListener('load', function () { keepActiveInView(document); });

  function paint() {
    var el = state.el; if (!el || !el.isConnected) return stop();
    var s = src(), data = state.data[s.id], now = Date.now();
    var html = '<div class="tabs ank-tabs">' + A.sources.map(function (x) {
      return '<button class="tab' + (x.id === s.id ? ' active' : '') + '" data-ank-tab="' + x.id + '">' + x.icon + ' ' + esc(x.label) + '</button>';
    }).join('') + '</div>';
    var upd = state.updated[s.id] ? d(state.updated[s.id]) : null;
    var stale = upd && now - upd > 15 * 60000;
    html += '<div class="ank-head"><span><b>' + esc(s.place) + '</b>' + (upd ? ' · uppdaterad ' + hm(upd) : '') + '</span>' +
            '<button class="ank-refresh" data-ank-refresh aria-label="Uppdatera">' + (state.loading[s.id] ? '…' : '↻') + '</button></div>';
    if (stale) html += '<div class="ank-warn">Datan är äldre än 15 minuter.</div>';
    if (state.err[s.id]) html += '<div class="ank-warn">Kunde inte hämta nya tider' + (data ? ', visar senaste.' : '. Försöker igen strax.') + '</div>';

    if (!data) {
      html += '<div class="ank-empty">' + (state.err[s.id] ? '' : 'Hämtar…') + '</div>';
    } else {
      var from = now - (state.showPast ? A.pastMoreMin : A.pastMin) * 60000, to = now + A.aheadHours * 3600000;
      var list = data.filter(function (it) {
        var w = when(it); if (!w) return false;
        var ref = it.act ? it.act : (it.canceled ? it.sched : w);
        return ref >= from && w <= to;
      }).sort(function (a, b) { return when(a) - when(b); });
      if (s.groups) {
        var act = activeGroup(s);
        html += '<div class="ank-chips tf">' + s.groups().map(function (g) {
          var n = g.id ? list.filter(function (it) { return it.group === g.id; }).length : list.length;
          return '<button class="ank-chip' + (g.id === act ? ' on' : '') + '" data-ank-filter="' + g.id + '" title="' + esc(g.label) + '">' + esc(g.short || g.label) +
            ' <span class="ank-chip-n">' + n + '</span></button>';
        }).join('') + '</div>';
        if (act) list = list.filter(function (it) { return it.group === act; });
      }
      html += '<button class="ank-more" data-ank-past>' + (state.showPast ? 'Dölj tidigare' : 'Visa tidigare ankomster') + '</button>';
      if (!list.length) html += '<div class="ank-empty">Inga ankomster just nu.</div>';
      var lastDay = dayKey(new Date());
      list.forEach(function (it) {
        var k = dayKey(when(it));
        if (k !== lastDay) { html += '<div class="ank-day">' + dayLabel(when(it)) + '</div>'; lastDay = k; }
        html += rowHtml(it) + (it.tid && state.open[it.key] ? routeHtml(it) : '');
      });
    }
    el.innerHTML = html;
    keepActiveInView(el);
  }

  function load(id, quiet) {
    var s = null; A.sources.forEach(function (x) { if (x.id === id) s = x; });
    if (!s || state.loading[id]) return;
    state.loading[id] = true; if (!quiet) paint();
    s.load().then(function (r) {
      state.data[id] = r.items; state.updated[id] = r.updated; state.err[id] = false;
      try { document.dispatchEvent(new CustomEvent('ankomster:data', { detail: { id: id } })); } catch (e) {}
      if (id === 'tag') Object.keys(state.open).forEach(function (k) { fetchRoute(k, true); });
    }).catch(function () { state.err[id] = true; })
      .then(function () { state.loading[id] = false; if (state.tab === id) paint(); });
  }

  function onClick(e) {
    var rr = !e.target.closest('button, a, input') && e.target.closest('[data-ank-route]');
    if (rr) { toggleRoute(rr.getAttribute('data-ank-route')); return; }
    var t = e.target.closest('[data-ank-tab]');
    if (t) { state.tab = t.getAttribute('data-ank-tab'); localStorage.setItem('ank_tab', state.tab); state.showPast = false; paint(); load(state.tab, true); return; }
    if (e.target.closest('[data-ank-refresh]')) { load(state.tab); return; }
    if (e.target.closest('[data-ank-past]')) { state.showPast = !state.showPast; paint(); return; }
    var g = e.target.closest('[data-ank-filter]');
    if (g) { localStorage.setItem('ank_tagfilter', g.getAttribute('data-ank-filter')); paint(); }
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

  // För hjälpboten: nästa ankomst (inte inställd, inte redan ankommen) och lite fakta. Bara verklig data.
  A.current = function () { return state.el ? state.tab : null; };
  A.summary = function (id) {
    var s = null; A.sources.forEach(function (x) { if (x.id === id) s = x; });
    if (!s) return Promise.resolve(null);
    var p = state.data[id] ? Promise.resolve(state.data[id])
      : s.load().then(function (r) { state.data[id] = r.items; state.updated[id] = r.updated; return r.items; });
    return p.then(function (items) {
      var now = Date.now(), filt = s.summaryFilter || null;
      var up = items.filter(function (it) {
        var w = when(it); return w && !it.act && w >= now - 60000 && w <= now + 6 * 3600000 && (!filt || filt(it));
      }).sort(function (a, b) { return when(a) - when(b); });
      var live = up.filter(function (it) { return !it.canceled && !it.special; });
      var delayed = live.filter(function (it) { return it.est && it.sched && it.est - it.sched >= 5 * 60000; });
      return { source: s, next: live[0] || null, after: live[1] || null, canceled: up.length - live.length,
               delayed: delayed.length, worst: delayed.sort(function (a, b) { return (b.est - b.sched) - (a.est - a.sched); })[0] || null,
               inHour: live.filter(function (it) { return when(it) <= now + 3600000; }).length };
    }).catch(function () { return null; });
  };
  A.when = when;
  A.hm = hm;
})();
