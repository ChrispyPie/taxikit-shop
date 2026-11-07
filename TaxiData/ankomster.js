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

  var D=window.ARRIVAL_DATA,loadTrains=D.loadTrains,loadFlights=D.loadFlights,trainGroups=D.trainGroups;
  var A = window.ANKOMSTER = {
    id: 'ankomster',
    title: 'Ankomster',
    icon: '🛬',
    refreshMs: 60 * 1000,        // ny data varje minut
    pastMin: 15,                 // visa ankomna så här länge efter ankomst
    pastMoreMin: 180,            // "Visa tidigare" visar så här långt bakåt
    aheadHours: 16,
    sources: [
      { id: 'tag', label: 'Tåg', icon: '🚆', place: 'Göteborg C', load: function(){return loadTrains(state.station);}, groups: trainGroups,
        summaryFilter: function (it) { return !!it.group; } },
      { id: 'flyg', label: 'Flyg', icon: '✈️', place: 'Landvetter', load: loadFlights }
      // { id: 'bat', label: 'Båt', icon: '⛴️', place: '…', load: loadBoats }
    ]
  };

  var initialNav=window.VIEW_STATE?VIEW_STATE.get('ankomster',{}):{};
  var selected=/^[A-Za-zÅÄÖåäö.]{1,8}$/.test(initialNav.station||'')?initialNav.station:'G';
  var stationList=TRAIN_STATIONS.slice();
  function stationLabel(){var found=stationList.find(function(s){return s.id===state.station;});return found?found.label:state.station;}
  var state = { station:selected,requests:{tag:0,flyg:0}, tab: null, data: {}, err: {}, updated: {}, at: {}, showPast: false, timer: null, tick: null, el: null, loading: {} };

  // ---------- hjälp ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var d=D.date,hm=D.hm;
  function dayKey(x) { return x.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }); }
  function dayLabel(x) {
    var k = dayKey(x), now = new Date();
    if (k === dayKey(now)) return 'Idag';
    if (k === dayKey(new Date(now.getTime() + 864e5))) return 'Imorgon';
    if (k === dayKey(new Date(now.getTime() - 864e5))) return 'Igår';
    return x.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' });
  }
  function activeGroup(s) {
    var v = localStorage.getItem('ank_tagfilter') || '';
    return s.groups().some(function (g) { return g.id === v; }) ? v : '';
  }

  // ---------- flyg ----------
  // ---------- status ----------
  function when(it) { return it.act || it.est || it.sched; }
  function badge(it) {
    if (it.removed || it.canceled || (it.key[0] === 'f' && it.special)) return '';  // ordet står i röd statusrad (tåg och flyg)
    if (it.special) return '<span class="ank-badge bad">' + esc(it.special) + '</span>';
    var delay = (it.sched && (it.act || it.est)) ? Math.round(((it.act || it.est) - it.sched) / 60000) : 0;
    var dtxt = delay >= 1 ? '+' + delay + ' min' : (delay <= -3 ? delay + ' min' : '');
    if (it.act && it.key[0] === 'f') return dtxt ? '<span class="ank-delay ' + (delay >= 15 ? 'bad' : delay >= 1 ? 'warn' : 'early') + '">' + dtxt + '</span>' : '';  // Landat står i statusraden
    if (it.act) return '<span class="ank-badge done">Ankom ' + hm(it.act) + '</span>' +
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
    var lists = [state.data.tag || [], state.data.flyg || []];
    for (var L = 0; L < lists.length; L++) {
      for (var i = 0; i < lists[L].length; i++) if (lists[L][i].key === key) return lists[L][i];
    }
    return null;
  }
  function toggleRoute(key) {
    if (state.open[key]) { delete state.open[key]; paint(); return; }
    state.open[key] = true; paint();
    var it = findItem(key);
    if (it && it.tid) fetchRoute(key, false);
  }
  function fetchRoute(key, quiet) {
    var it = findItem(key); if (!it || !it.tid) return;
    var r = state.routes[key] || (state.routes[key] = {});
    if (r.loading || (quiet && r.at && Date.now() - r.at < 45000)) return;
    r.loading = true;
    var station=state.station;
    fetch(ROUTE_URL + '?station='+encodeURIComponent(station)+'&route=' + encodeURIComponent(it.tid) + '&sched=' + encodeURIComponent(it.schedRaw), { cache: 'no-store' })
      .then(function (x) { if (!x.ok) throw new Error(x.status); return x.json(); })
      .then(function (j) { r.data = j; r.err = false; r.at = Date.now(); })
      .catch(function () { r.err = true; })
      .then(function () { r.loading = false; if (station===state.station&&state.open[key]) paint(); });
  }
  function delayTxt(sched, real) {
    if (!sched || !real) return '';
    var m = Math.round((real - sched) / 60000);
    return m >= 1 ? '<span class="ank-st-dl' + (m >= 15 ? ' bad' : '') + '">+' + m + '</span>' : (m <= -2 ? '<span class="ank-st-dl early">' + m + '</span>' : '');
  }
  // Orsakspanel: visas överst när man trycker på inställt/borttaget/omdirigerat.
  function reasonText(it, extra) {
    var r = String((extra && extra.reason) || it.reason || '').trim();
    var i = String((extra && extra.info) || it.reasonInfo || '').trim();
    var parts = [];
    if (r) parts.push(r);
    if (i && i !== r) parts.push(i);
    return parts.join('. ');
  }
  function reasonHtml(it, extra) {
    if (!(it.canceled || it.removed || it.special)) return '';
    var txt = reasonText(it, extra);
    var body = txt
      ? 'Orsak: ' + esc(txt) + (txt.slice(-1) === '.' ? '' : '.')
      : (it.key[0] === 'f'
          ? 'Ingen orsak angiven av Swedavia.'
          : 'Ingen orsak angiven av Trafikverket.');
    return '<div class="ank-reason">' + body + '</div>';
  }
  function flightReasonHtml(it) {
    return '<div class="ank-route">' + reasonHtml(it) + '</div>';
  }
  function routeHtml(it) {
    var r = state.routes[it.key] || {};
    var head = reasonHtml(it, r.data || {});
    if (!r.data) return '<div class="ank-route">' + head + '<div class="ank-st-hint">' + (r.err ? 'Kunde inte hämta stationslistan.' : 'Hämtar stationslista…') + '</div></div>';
    var stops = r.data.stops || [], seen = r.data.lastSeen;
    if (!stops.length) return '<div class="ank-route">' + head + '<div class="ank-st-hint">Ingen stationslista hos Trafikverket.</div></div>';
    var lastPassed = -1;
    stops.forEach(function (s, i) { if (s.arrAct || s.depAct) lastPassed = i; });
    var g = stops[stops.length - 1], arrived = !!(g && g.arrAct);
    var seenIdx = -1;
    if (seen) stops.forEach(function (s, i) { if (s.sig === seen.sig) seenIdx = i; });
    var atStation = seenIdx >= 0 && seenIdx === lastPassed && stops[seenIdx].arrAct && !stops[seenIdx].depAct && seenIdx < stops.length - 1;
    var html = '<div class="ank-route">' + head;
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
    var bev = window.BEVAKNING, watched = !!(bev && (!it.station||it.station==='G') && bev.isWatched(it.key));  // bevakning.js
    var cls = 'ank-row' + (it.canceled || it.removed ? ' canceled' : '') + (it.act ? ' arrived' : '') + (watched ? ' watched' : '');
    var star = bev && (watched || it.key[0] === 'f')
      ? '<button class="ank-star' + (watched ? ' on' : '') + '" data-bev-star aria-label="' + (watched ? 'Sluta bevaka' : 'Bevaka') + '">' + (watched ? '⭐' : '☆') + '</button>' : '';
    var tap = !!(it.tid || it.canceled || it.removed || it.special);
    return '<div class="' + cls + (tap ? ' ank-tap' : '') + '"' + (tap ? ' data-ank-route="' + esc(it.key) + '"' : '') + ' data-ank-key="' + esc(it.key) + '">' +
      '<div class="ank-time"><div class="ank-new' + (changed && !it.act ? ' changed' : '') + '">' + hm(it.canceled || it.removed ? it.sched : shown) + '</div>' +
        (changed && !it.canceled && !it.removed ? '<div class="ank-old">' + hm(it.sched) + '</div>' : '') + '</div>' +
      '<div class="ank-main"><div class="ank-from">' + esc(it.from) + '</div>' +
        '<div class="ank-meta"><b>' + esc(it.no) + '</b>' + (it.sub ? ' · ' + esc(it.sub) : '') + '</div>' +
        (it.info ? '<div class="ank-meta' + ((it.canceled || it.removed || (it.key[0] === 'f' && it.special)) ? ' bad' : '') + '">' + esc(it.info) + '</div>' : '') +
        (it.note ? '<div class="ank-note">' + esc(it.note) + '</div>' : '') + '</div>' +
      '<div class="ank-status">' + badge(it) + star + '</div></div>';
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


  // Scroll-ankare: behåll samma rad på samma skärmposition när listan växer uppåt
  // (Visa tidigare). Safari saknar CSS overflow-anchor, så vi gör det manuellt.
  function headerBottom() {
    var h = document.querySelector('header');
    return h ? h.getBoundingClientRect().bottom : 0;
  }
  function captureAnchor(root) {
    if (!root) return null;
    var cut = headerBottom() + 2;
    var rows = root.querySelectorAll('[data-ank-key]');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      if (r.bottom > cut + 4) {
        return { key: rows[i].getAttribute('data-ank-key'), top: r.top };
      }
    }
    return null;
  }
  function restoreAnchor(root, a) {
    if (!a || !a.key || !root) return;
    var neo = null, rows = root.querySelectorAll('[data-ank-key]');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-ank-key') === a.key) { neo = rows[i]; break; }
    }
    if (!neo) return;
    var dy = neo.getBoundingClientRect().top - a.top;
    if (Math.abs(dy) >= 1) window.scrollBy(0, dy);
  }

  function paint(opts) {
    var el = state.el; if (!el || !el.isConnected) return stop();
    opts = opts || {};
    var anchor = opts.anchor ? captureAnchor(el) : null;
    var s = src(), data = state.data[s.id], now = Date.now();
    var html = '<div class="tabs ank-tabs">' + A.sources.map(function (x) {
      return '<button class="tab' + (x.id === s.id ? ' active' : '') + '" data-ank-tab="' + x.id + '">' + x.icon + ' ' + esc(x.label) + '</button>';
    }).join('') + '</div>';
    if(s.id==='tag')html+='<div class="ank-chips ank-station-quick" role="group" aria-label="Vanliga stationer">'+TRAIN_STATIONS.slice(0,4).concat(TRAIN_STATIONS.filter(function(x){return x.id==='P'||x.id==='A';})).map(function(st){return '<button class="ank-chip'+(st.id===state.station?' on':'')+'" data-ank-station="'+esc(st.id)+'" aria-pressed="'+(st.id===state.station)+'">'+esc(st.label)+'</button>';}).join('')+'</div>'+(state.station!=='G'?'<p class="ank-station-note">Tågbevakningar och tågnotiser gäller fortfarande Göteborg C.</p>':'');
    var upd = state.updated[s.id] ? d(state.updated[s.id]) : null;
    var stale = upd && now - upd > 15 * 60000;
    html += '<div class="ank-head"><span><b>' + (s.id==='tag'?'<button type="button" class="ank-station-title" data-ank-picker aria-haspopup="dialog">'+esc(stationLabel())+' ▾</button>':esc(s.place)) + '</b>' + (upd ? ' · uppdaterad ' + hm(upd) : '') + '</span>' +
            '<button class="ank-refresh" data-ank-refresh aria-label="Uppdatera">' + (state.loading[s.id] ? '…' : '↻') + '</button></div>';
    if (stale) html += '<div class="ank-warn">Datan är äldre än 15 minuter.</div>';
    if(typeof state.err[s.id]==='string')html+='<div class="ank-warn">'+esc(state.err[s.id])+'</div>';
    else if (state.err[s.id]) html += '<div class="ank-warn">Kunde inte hämta nya tider' + (data ? ', visar senaste.' : '. Försöker igen strax.') + '</div>';

    if (!data) {
      html += '<div class="ank-empty">' + (state.err[s.id] ? '' : 'Hämtar…') + '</div>';
    } else {
      var from = now - (state.showPast ? A.pastMoreMin : A.pastMin) * 60000, to = now + A.aheadHours * 3600000;
      var list = data.filter(function (it) {
        var w = when(it); if (!w) return false;
        var ref = it.act ? it.act : (it.canceled ? it.sched : w);
        return it.key === state.watchHighlight || (ref >= from && w <= to);
      }).sort(function (a, b) { return when(a) - when(b); });
      if (s.groups && (s.id!=='tag'||state.station==='G')) {
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
        html += rowHtml(it) + (state.open[it.key] ? (it.tid ? routeHtml(it) : flightReasonHtml(it)) : '');
      });
    }
    el.innerHTML = html;
    if (anchor) {
      restoreAnchor(el, anchor);
      // iOS Safari layoutar ibland en frame senare
      requestAnimationFrame(function () { restoreAnchor(el, anchor); });
    }
    keepActiveInView(el);
    if (window.BEVAKNING) BEVAKNING.decorate(el);  // bevakning: notisknapp + långtryck
    if (window.TAGNOTIS) TAGNOTIS.decorate(el);    // Mina tågnotiser (tagnotis.js), bara på Tåg-fliken
    if (state.watchHighlight) {
      var target = Array.from(el.querySelectorAll('[data-ank-key]')).find(function (r) { return r.getAttribute('data-ank-key') === state.watchHighlight; });
      if (target) {
        target.setAttribute('tabindex', '-1'); target.style.outline = '2px solid #fbbf24';
        if (state.watchFocus) requestAnimationFrame(function () {
          if (!target.isConnected) return;
          target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true });
          state.watchFocus = false;
        });
      } else if (data && !state.loading[s.id]) {
        var note = document.createElement('div'); note.className = 'ank-warn';
        note.textContent = 'Ankomsten finns inte längre i tidtabellen.'; el.appendChild(note);
      }
    }
  }

  function load(id, quiet) {
    var s=null;A.sources.forEach(function(x){if(x.id===id)s=x;});if(!s||state.loading[id])return;
    var request=++state.requests[id],station=state.station;state.loading[id]=true;if(!quiet)paint();
    s.load().then(function(r){
      if(request!==state.requests[id]||(id==='tag'&&station!==state.station))return;
      state.data[id]=r.items;state.updated[id]=r.updated;state.at[id]=Date.now();state.err[id]=r.warning?'Visar senast sparade tider.':false;
      try{document.dispatchEvent(new CustomEvent('ankomster:data',{detail:{id:id}}));}catch(e){}
      if(id==='tag')Object.keys(state.open).forEach(function(k){fetchRoute(k,true);});
    }).catch(function(e){if(request===state.requests[id])state.err[id]=e.message==='Stationsval kräver uppdaterad tågtjänst'?e.message:true;})
    .then(function(){if(request!==state.requests[id])return;state.loading[id]=false;if(state.tab===id)paint();});
  }
  function selectStation(id){
    if(!stationList.some(function(s){return s.id===id;}))return;
    state.station=id;state.requests.tag++;state.loading.tag=false;state.data.tag=null;state.updated.tag=null;state.err.tag=false;state.open={};state.routes={};state.watchHighlight=null;state.showPast=false;localStorage.setItem('ank_tagfilter','');
    if(window.VIEW_STATE)VIEW_STATE.save('ankomster',{past:false,station:state.station});
    paint();load('tag',true);
  }
  function openStationPicker(){
    var dialog=document.createElement('dialog');dialog.className='ank-station-sheet';dialog.setAttribute('aria-label','Välj station');dialog.innerHTML='<h3>Välj station</h3><label for="ank-station-search">Sök station</label><input id="ank-station-search" type="search" placeholder="Namn eller signatur" autocomplete="off"><div class="ank-station-results" role="status">Hämtar stationslistan…</div><button type="button" data-station-close>Stäng</button>';document.body.appendChild(dialog);dialog.showModal();
    var search=dialog.querySelector('input'),box=dialog.querySelector('.ank-station-results');
    function norm(s){return String(s).toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
    function draw(){var q=norm(search.value),rows=stationList.filter(function(s){return norm(s.label+' '+s.id).indexOf(q)>=0;});box.innerHTML=rows.length?rows.map(function(s){return '<button type="button" data-station-pick="'+esc(s.id)+'" aria-pressed="'+(s.id===state.station)+'">'+esc(s.label)+' <small>'+esc(s.id)+'</small></button>';}).join(''):'<p>Inga stationer hittades.</p>';}
    search.oninput=draw;dialog.onclick=function(e){var b=e.target.closest('[data-station-pick]');if(b){selectStation(b.getAttribute('data-station-pick'));dialog.close();}if(e.target.closest('[data-station-close]'))dialog.close();};dialog.addEventListener('close',function(){dialog.remove();});
    D.stationCatalog().then(function(rows){stationList=rows;if(dialog.isConnected)draw();if(state.el)paint();}).catch(function(){if(dialog.isConnected){box.innerHTML='<p>Stationslistan kunde inte hämtas. Försök igen senare.</p>';}});search.focus();
  }

  function onClick(e) {
    if(e.target.closest('[data-ank-picker]')){openStationPicker();return;}
    var station=e.target.closest('[data-ank-station]');if(station){selectStation(station.getAttribute('data-ank-station'));return;}
    var rr = !e.target.closest('button, a, input') && e.target.closest('[data-ank-route]');
    if (rr) { toggleRoute(rr.getAttribute('data-ank-route')); return; }
    var t = e.target.closest('[data-ank-tab]');
    if (t) { state.watchHighlight = null; state.watchFocus = false; state.tab = t.getAttribute('data-ank-tab'); localStorage.setItem('ank_tab', state.tab); state.showPast = false; paint(); load(state.tab, true); return; }
    if (e.target.closest('[data-ank-refresh]')) { load(state.tab); return; }
    if (e.target.closest('[data-ank-past]')) { state.showPast = !state.showPast; paint({ anchor: true }); return; }
    var g = e.target.closest('[data-ank-filter]');
    if (g) { localStorage.setItem('ank_tagfilter', g.getAttribute('data-ank-filter')); paint(); }
  }
  function onVisible() { if (!document.hidden && state.el) load(state.tab, true); }

  function stop() {
    clearInterval(state.timer); clearInterval(state.tick); state.timer = state.tick = null;
    document.removeEventListener('visibilitychange', onVisible);
    var picker=document.querySelector('dialog.ank-station-sheet');if(picker)picker.close();
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
    if(A._watchTarget&&A._watchTarget.charAt(0)==='t'&&state.station!=='G'){state.station='G';state.requests.tag++;state.loading.tag=false;state.data.tag=null;}
    state.watchHighlight = A._watchTarget || null; state.watchFocus = !!A._watchTarget;
    A._watchTarget = null;
    if (state.watchHighlight) state.showPast = true;
    paint();
    D.stationCatalog().then(function(rows){stationList=rows;if(state.el)paint();}).catch(function(){});
    load(state.tab, true);
    state.timer = setInterval(function () { if (!document.hidden) load(state.tab, true); }, A.refreshMs);
    state.tick = setInterval(paint, 20000);  // flytta fram listan när tiden går
    document.addEventListener('visibilitychange', onVisible);
  };
  A.stop = stop;

  // Mina bevakningar delar samma normalisering och offentliga tidtabell som Ankomster.
  A.watchItems = function (kind) {
    var source = A.sources.filter(function (s) { return s.id === kind; })[0];
    return source.load().then(function (r) {
      state.data[kind] = r.items; state.updated[kind] = r.updated; state.at[kind] = Date.now();
      return r.items;
    });
  };
  A.openWatch = function (key) {
    localStorage.setItem('ank_tab', key.charAt(0) === 'f' ? 'flyg' : 'tag');
    localStorage.setItem('ank_tagfilter', '');
    A._watchTarget = key;
    window.openItem(A.id);
  };


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
        var w = when(it); return w && !it.act && !it.removed && w >= now - 60000 && w <= now + 6 * 3600000 && (!filt || filt(it));
      }).sort(function (a, b) { return when(a) - when(b); });
      var live = up.filter(function (it) { return !it.canceled && !it.special && !it.removed; });
      var delayed = live.filter(function (it) { return it.est && it.sched && it.est - it.sched >= 5 * 60000; });
      return { source: s, next: live[0] || null, after: live[1] || null, canceled: up.length - live.length,
               delayed: delayed.length, worst: delayed.sort(function (a, b) { return (b.est - b.sched) - (a.est - a.sched); })[0] || null,
               inHour: live.filter(function (it) { return when(it) <= now + 3600000; }).length };
    }).catch(function () { return null; });
  };
  A.when = when;
  A.hm = hm;
  // För Prognos (t833u): flyg till Landvetter, för förseningsvarningen i zon 293.
  // Återanvänder Ankomsters data om den är färsk (högst maxAgeMs), annars en egen hämtning.
  var flightP = null;
  A.flightItems = function (maxAgeMs) {
    maxAgeMs = maxAgeMs || 120000;
    if (state.data.flyg && Date.now() - (state.at.flyg || 0) < maxAgeMs) return Promise.resolve(state.data.flyg);
    if (flightP) return flightP;
    flightP = loadFlights().then(function (r) {
      state.data.flyg = r.items; state.updated.flyg = r.updated; state.at.flyg = Date.now();
      return r.items;
    }).catch(function () { return state.data.flyg || []; }).then(function (x) { flightP = null; return x; });
    return flightP;
  };
  // För bevakning.js: hämta en rad via nyckel och rita om.
  A.item = function (key) {
    for (var id in state.data) {
      var l = state.data[id] || [];
      for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i];
    }
    return null;
  };
  A.repaint = function () { if (state.el && state.el.isConnected) paint(); };

 if(window.VIEW_STATE){state.showPast=!!VIEW_STATE.get('ankomster',{}).past;VIEW_STATE.bind('ankomster',function(){return {past:state.showPast,station:state.station};});}

})();
