/* Personlig planering. Ingen privat lista sparas på enheten: samma sessionskontrollerade
 * RPC:er som Ankomster och Kalender. Tidtabellerna är offentliga och delas med Ankomster. */
(function () {
  'use strict';
  var M = window.MINA_BEVAKNINGAR = { id: 'mina-bevakningar', title: 'Mina bevakningar', icon: '📌' };
  var host = null, timer = null, generation = 0, rows = [], busy = false;
  function token() { return localStorage.getItem('taxi_session') || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function parts(at) {
    var p = {};
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).forEach(function (x) { p[x.type] = x.value; });
    return { key: p.year + '-' + p.month + '-' + p.day, hm: p.hour + ':' + p.minute };
  }
  function addDay(k, n) { var d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dayLabel(k) {
    var today = parts(Date.now()).key;
    if (k === today) return 'I dag';
    if (k === addDay(today, 1)) return 'I morgon';
    return new Date(k + 'T12:00:00Z').toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', weekday: 'long', day: 'numeric', month: 'short' });
  }
  function rpc(name, args) {
    var session = token();
    if (!session) return Promise.reject(new Error('session'));
    args = Object.assign({}, args, { p_token: session });
    return fetch(TRIP_API_URL + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: { apikey: TRIP_API_KEY, Authorization: 'Bearer ' + TRIP_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args)
    }).then(function (r) { if (!r.ok) throw new Error('rpc'); return r.json(); }).then(function (d) {
      if (session !== token()) throw new Error('session');
      return d;
    });
  }
  function inWindow(w, at) {
    var p = parts(at), d = new Date(p.key + 'T12:00:00Z').getUTCDay() || 7;
    var m = +p.hm.slice(0, 2) * 60 + +p.hm.slice(3), ds = w.days || [], f = w.from_min, t = w.to_min;
    if (f === t) return ds.indexOf(d) >= 0;
    if (f < t) return m >= f && m < t && ds.indexOf(d) >= 0;
    return (m >= f && ds.indexOf(d) >= 0) || (m < t && ds.indexOf(d === 1 ? 7 : d - 1) >= 0);
  }
  function kindOf(w, it) {
    if (w && w.kind) return w.kind;
    var ch = it && String(it.key || '').charAt(0);
    return ch === 'f' ? 'flyg' : ch === 'b' ? 'bat' : 'tag';
  }
  function kindPrefix(kind) { return kind === 'flyg' ? 'f' : kind === 'bat' ? 'b' : 't'; }
  function kindLabel(kind) { return kind === 'flyg' ? 'Flyg ' : kind === 'bat' ? 'Båt ' : 'Tåg '; }
  function arrival(w, it, rules) {
    var s = w ? w.state || {} : {}, at = +(it && (it.act || it.est || it.sched)) || Date.parse(s.est || (w && w.sched));
    var kind = kindOf(w, it), key = it ? it.key : kindPrefix(kind) + w.ident + '|' + w.sched;
    var info = [], flag = 'ontime';
    if ((it && it.canceled) || s.canceled) { info.push('Inställt'); flag = 'canceled'; }
    if (it && it.removed) { info.push('Borttagen'); flag = 'removed'; }
    var sched = it ? +it.sched : Date.parse(w.sched), late = Math.round((at - sched) / 60000);
    if ((it && it.act) || s.landed || s.arrived || s.firstBag || s.lastBag) {
      if (flag === 'ontime' || flag === 'late') flag = 'arrived';
    } else if (late > 0 && flag === 'ontime') { info.push(late + ' min sen'); flag = 'late'; }
    if (it && it.info) info.push(it.info);
    else if (s.lastBag) info.push('Sista bagage ute');
    else if (s.firstBag) info.push('Bagaget rullar');
    else if (s.landed || (it && it.act && kind === 'flyg')) info.push('Landat');
    else if (s.arrived || (it && it.act)) info.push('Ankommit');
    if (!info.length) info.push('I tid');
    var row = { id: key, key: key, kind: kind, at: at, end: at, flag: flag,
      title: (it ? it.no : kindLabel(kind) + w.ident) + ' · ' + ((it && it.from) || (w && w.label) || 'Okänd startplats'),
      status: info.join(' · '), watch: w || null, rules: rules || [], item: it || null,
      sched: it ? +it.sched : (w ? Date.parse(w.sched) : at), route: (it && it.group) || '' };
    if (window.BEVAKNING && BEVAKNING.routeOf) row.route = BEVAKNING.routeOf(it || row) || row.route;
    return row;
  }
  function daysText(d) {
    d = (d || []).slice().sort();
    if (!d.length || d.length === 7) return 'alla dagar';
    if (d.join() === '1,2,3,4,5') return 'mån–fre';
    if (d.join() === '6,7') return 'lör–sön';
    var names = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
    return d.map(function (x) { return names[x - 1]; }).join(', ');
  }
  function atStockholm(key, min) {
    var hm = (window.BEVAKNING && BEVAKNING.hhmm) ? BEVAKNING.hhmm(min) : (function (m) {
      m = ((m % 1440) + 1440) % 1440;
      return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
    })(min);
    var utc = Date.parse(key + 'T00:00:00Z');
    for (var ms = utc - 3 * 3600000; ms <= utc + 26 * 3600000; ms += 60000) {
      var p = parts(ms);
      if (p.key === key && p.hm === hm) return ms;
    }
    return utc + min * 60000;
  }
  function nextOccurrence(w, now) {
    var today = parts(now).key, days = w.days || [1, 2, 3, 4, 5, 6, 7];
    for (var i = 0; i < 8; i++) {
      var key = i === 0 ? today : addDay(today, i);
      var dow = new Date(key + 'T12:00:00Z').getUTCDay() || 7;
      if (days.indexOf(dow) < 0) continue;
      var at = atStockholm(key, w.sched_min);
      if (i === 0 && at < now - 30 * 60000) continue;
      return at;
    }
    return now;
  }
  function markRoutes(out, routeWatches) {
    var Bv = window.BEVAKNING, routes = (routeWatches || []).filter(function (w) { return w && w.enabled !== false; });
    out.forEach(function (r) {
      if (r.kind !== 'tag' && r.kind !== 'flyg' && r.kind !== 'bat') return;
      var probe = { kind: r.kind, route: r.route, sched: r.sched || r.at, group: r.route, key: r.key, from: r.item && r.item.from };
      var w = null;
      if (Bv && Bv.findRoute) w = Bv.findRoute(Object.assign({}, r.item || {}, probe));
      else {
        w = routes.filter(function (q) { return q.kind === r.kind && q.route === r.route && Bv && Bv.inRouteWindow && Bv.inRouteWindow(q.sched_min, Bv.schedMinOf(probe.sched)); })[0] || null;
      }
      if (w) { r.routeWatch = w; r.permanent = true; }
    });
    var usedIds = {};
    out.forEach(function (r) { if (r.routeWatch) usedIds[r.routeWatch.id] = true; });
    routes.forEach(function (w) {
      if (usedIds[w.id]) return;
      var at = nextOccurrence(w, Date.now());
      var hm = (window.BEVAKNING && BEVAKNING.hhmm) ? BEVAKNING.hhmm(w.sched_min) : '';
      out.push({ id: 'rw-' + w.id, key: 'rw|' + w.id, kind: w.kind, at: at, end: at, flag: '',
        title: (w.label || w.route) + (hm ? ' · ' + hm : ''),
        status: daysText(w.days) + ' · fast bevakning',
        watch: null, rules: [], routeWatch: w, permanent: true, placeholder: true, route: w.route, sched: at });
    });
  }
  function normalize(watches, rules, trains, flights, events, now, flightRules, routeWatches) {
    flightRules = flightRules || [];
    routeWatches = routeWatches || [];
    var out = [], used = {};
    watches.forEach(function (w) {
      if (Date.parse(w.expires_at) <= now) return;
      var list = w.kind === 'flyg' ? flights : w.kind === 'bat' ? [] : trains;
      var it = list.find(function (x) { return x.key.charAt(0) === (w.kind === 'flyg' ? 'f' : 't') && x.key.split('|')[0].slice(1) === String(w.ident) && Math.abs(+x.sched - Date.parse(w.sched)) < 60000; });
      var r = arrival(w, it);
      // Regeln visas också, så Sluta bevaka kan förklara om tåget eller flyget har flera källor.
      if (it && w.kind === 'tag') r.rules = rules.filter(function (q) { return q.enabled && TAGNOTIS.matches(q, it) && inWindow(q, r.at); });
      if (it && w.kind === 'flyg' && window.FLYGNOTIS) r.rules = flightRules.filter(function (q) { return q.enabled && FLYGNOTIS.matches(q, it) && inWindow(q, r.at); });
      out.push(r); used[r.key] = true;
    });
    trains.forEach(function (it) {
      if (used[it.key]) return;
      var at = +(it.act || it.est || it.sched);
      var matches = rules.filter(function (w) { return w.enabled && TAGNOTIS.matches(w, it) && inWindow(w, at); });
      if (matches.length) out.push(arrival(null, it, matches));
    });
    flights.forEach(function (it) {
      if (used[it.key] || !window.FLYGNOTIS) return;
      var at = +(it.act || it.est || it.sched);
      var matches = flightRules.filter(function (w) { return w.enabled && FLYGNOTIS.matches(w, it) && inWindow(w, at); });
      if (matches.length) out.push(arrival(null, it, matches));
    });
    events.forEach(function (e) {
      if (!e.subs || !e.subs.length) return;
      out.push({ id: 'e' + e.id, kind: 'event', at: Date.parse(e.starts_at), end: Date.parse(e.ends_at || e.starts_at), title: e.title + ' · ' + (e.venue || 'Plats okänd'),
        rules: [], status: e.ends_at ? 'Slutar ' + parts(e.ends_at).hm + (e.ends_estimated ? ' (ca)' : '') : '', event: e });
    });
    markRoutes(out, routeWatches);
    return out.filter(function (r) { return Number.isFinite(r.at) && r.end >= now - 2 * 3600000; }).sort(function (a, b) { return a.at - b.at || String(a.id).localeCompare(String(b.id)); });
  }
  function calendarEvents(errors) {
    var today = parts(Date.now()).key;
    var args = { p_from: addDay(today, -1), p_to: addDay(today, 365), p_city: null };
    return rpc('get_events', args).then(function (d) {
      function collect(data) { return (data.events || []).map(function (e) { return Object.assign({}, e, { watch_city: data.city.slug }); }); }
      var cities = (d.cities || []).filter(function (c) { return c.slug !== d.city.slug; });
      return Promise.all(cities.map(function (c) {
        return rpc('get_events', Object.assign({}, args, { p_city: c.slug })).then(collect).catch(function () { errors.push('kalendern i ' + c.name); return []; });
      })).then(function (other) { return [].concat.apply(collect(d), other); });
    });
  }
  // Ingen delad cache av privata bevakningar. Även misslyckade delkällor syns tydligt.
  M.load = function (onlyTransport) {
    var errors = [], session = token();
    function safe(p, label, fallback) { return p.catch(function () { errors.push(label); return fallback; }); }
    return Promise.all([
      safe(rpc('watch_list', {}), 'bevakade ankomster', []),
      safe(rpc('train_watch_list', {}), 'bevakningar', []),
      safe(ARRIVAL_DATA.watchItems('tag'), 'tågtider', []),
      safe(ARRIVAL_DATA.watchItems('flyg'), 'flygtider', []),
      onlyTransport ? Promise.resolve([]) : safe(calendarEvents(errors), 'kalendern', []),
      onlyTransport ? Promise.resolve([]) : safe((window.DEMO&&DEMO.on()?Promise.resolve([]):rpc('mailbox_v2',{p_token:localStorage.getItem('taxi_session')||'',p_action:'timeline',p_data:{}})), 'bokade tider', []),
      safe(rpc('flight_watch_list', {}), 'flygbevakningar', []),
      safe(window.BEVAKNING && BEVAKNING.loadRoutes ? BEVAKNING.loadRoutes(true) : rpc('route_watch_list', {}), 'fasta bevakningar', [])
    ]).then(function (data) {
      if (session !== token()) throw new Error('session');
      var bookings = (data[5] || []).map(function (b) { return { id: 'booking-' + b.id, kind: 'booking', thread_id: b.thread_id, at: Date.parse(b.at), end: Date.parse(b.at), title: b.title, status: b.status === 'accepted' ? 'Bokad tid · Godkänd' : 'Bokad tid · Väntar på ' + (b.status === 'pending_admin' ? 'admin' : 'ditt svar'), pending: b.status !== 'accepted', rules: [] }; });
      return { rows: normalize(data[0], data[1], data[2], data[3], data[4], Date.now(), data[6], data[7]).concat(bookings).sort(function (a,b) { return a.at-b.at; }), errors: errors };
    });
  };
  M.open = function (r) {
    if (r.kind === 'booking') INKORG.openThread(r.thread_id);
    else if (r.kind === 'event') KALENDER.openEvent(r.event.id, r.event.starts_at, r.event.watch_city);
    else if (r.placeholder) { gearIndex = rows.indexOf(r); if (gearIndex >= 0 && host) draw(lastErrors); }
    else ANKOMSTER.openWatch(r.key);
  };
  function remove(r) {
    if (r.kind === 'booking') return Promise.resolve(); // Bokningar ändras bara med ett uttryckligt svar i ärendet.
    var session = token();
    // Ta bara bort den egna bevakningen, aldrig själva kalenderhändelsen/tidtabellsraden.
    var work = [];
    if (r.watch) work.push(rpc('watch_set', { p_kind: r.watch.kind, p_ident: r.watch.ident, p_sched: r.watch.sched, p_on: false, p_label: null, p_sub: null, p_state: {} }));
    if (r.kind === 'event') (r.event.subs || []).forEach(function (s) {
      work.push(rpc('set_event_subscription', { p_event_id: r.event.id, p_on: false, p_kind: s.kind, p_offset_min: s.offset, p_channel: s.channel || 'inapp' }));
    });
    (r.rules || []).forEach(function (w) {
      var fn = r.kind === 'flyg' ? 'flight_watch_save' : 'train_watch_save';
      work.push(rpc(fn, { p_id: w.id, p_data: Object.assign({}, w, { enabled: false }) }));
    });
    return Promise.all(work).then(function () {
      if (session !== token()) return;
      if (window.BEVAKNING) BEVAKNING._state.loadedAt = 0;
      if (window.TAGNOTIS) TAGNOTIS._state.list = null;
      if (window.FLYGNOTIS) FLYGNOTIS._state.list = null;
    });
  }
  var PX = 1.5, selectedDay = null, mode = 'timeline', autoPosition = true, actionIndex = null, gearIndex = null, lastErrors = [];
  function isTransport(r) { return r && (r.kind === 'tag' || r.kind === 'flyg' || r.kind === 'bat'); }
  function canHold(r) { return isTransport(r) && !!(r.route || r.routeWatch); }
  function canGear(r) { return canHold(r); }
  function canRemove(r) {
    if (!r || r.kind === 'booking' || r.placeholder) return false;
    if (r.kind === 'event') return true;
    if (r.routeWatch) return false;
    if (r.rules && r.rules.length) return true;
    return false;
  }
  function toast(msg) { if (window.BEVAKNING && BEVAKNING.toast) BEVAKNING.toast(msg, 4000); else alert(msg); }
  function togglePermanent(r) {
    var Bv = window.BEVAKNING;
    if (!canHold(r) || !Bv || !Bv.saveRoute) return Promise.resolve();
    if (r.routeWatch) {
      return Bv.deleteRoute(r.routeWatch.id).then(function () {
        toast('Bevakningen är tillfällig igen. Ta bort den med stjärnan på Ankomster om du inte vill ha den kvar.');
      });
    }
    var route = r.route || (Bv.routeOf && Bv.routeOf(r.item || r));
    var schedMin = Bv.schedMinOf(r.sched || r.at);
    if (!route || schedMin < 0) { toast('Det gick inte att göra den fast. Saknar tur eller klockslag.'); return Promise.resolve(); }
    var label = (r.item && r.item.from) || r.title || route;
    return Bv.saveRoute({ kind: r.kind, route: route, label: label, sched_min: schedMin, days: [1, 2, 3, 4, 5, 6, 7] }).then(function () {
      toast('Fast bevakning. Samma tur och tid, även om numret ändras. Ställ in dagar med kugghjulet.');
    });
  }

  function minute(at) { var hm = parts(at).hm; return +hm.slice(0, 2) * 60 + +hm.slice(3); }
  function icon(r) { return r.kind === 'booking' ? '◷' : r.kind === 'event' ? '📅' : r.kind === 'flyg' ? '✈️' : r.kind === 'bat' ? '⛴️' : '🚆'; }
  function statusChip(r) {
    if (r.flag) {
      var main = String(r.status || 'I tid').split(' · ')[0], rest = String(r.status || '').split(' · ').slice(1).join(' · ');
      return '<span class="mb-meta"><span class="mb-st mb-st-' + r.flag + '">' + esc(main) + '</span>' + (rest ? '<small>' + esc(rest) + '</small>' : '') + '</span>';
    }
    return r.status ? '<small>' + esc(r.status) + '</small>' : '';
  }
  // Väggklockan i Stockholm, 00–24. Händelser över midnatt klipps på båda dagarna.
  function daySegments(list, key) {
    return list.map(function (r, i) {
      var start = parts(r.at).key, end = parts(r.end).key, duration = r.kind === 'event' && r.end > r.at;
      if (start > key || (duration ? end < key : start !== key)) return null;
      var from = start < key ? 0 : minute(r.at), to = duration ? (end > key ? 1440 : minute(r.end)) : from + 32;
      if (to <= from) return null;
      // Små händelser behöver en läsbar/tappbar markör. Längre behåller sin riktiga längd.
      return { index: i, row: r, from: from, to: duration ? Math.max(from + 24, Math.min(1440, to)) : to, actualEnd: duration ? to : from, continues: start < key || end > key };
    }).filter(Boolean).sort(function (a, b) { return a.from - b.from || b.to - a.to; });
  }
  function timelineLayout(list, key) {
    var segments = daySegments(list, key), group = [], groupEnd = -1;
    function finish() {
      var ends = [], columns = 0;
      group.forEach(function (x) {
        var col = 0; while (col < ends.length && ends[col] > x.from) col++;
        ends[col] = x.to; x.column = col; columns = Math.max(columns, col + 1);
      });
      group.forEach(function (x) { x.columns = columns; }); group = [];
    }
    segments.forEach(function (x) {
      if (group.length && x.from >= groupEnd) { finish(); groupEnd = -1; }
      group.push(x); groupEnd = Math.max(groupEnd, x.to);
    }); finish(); return segments;
  }
  function hasDay(key) { return daySegments(rows, key).length > 0; }
  function dot(key) { return hasDay(key) ? '<i class="mb-daydot" aria-label="Har bevakningar"></i>' : ''; }
  function dayNav() {
    var today = parts(Date.now()).key, tomorrow = addDay(today, 1);
    return '<div class="mb-days"><button data-mb-step="-1" aria-label="Föregående dag">‹' + dot(addDay(selectedDay, -1)) + '</button><div><b>' + esc(dayLabel(selectedDay)) + dot(selectedDay) + '</b><small>' + esc(selectedDay) + '</small></div><button data-mb-step="1" aria-label="Nästa dag">›' + dot(addDay(selectedDay, 1)) + '</button></div><div class="mb-day-shortcuts"><button data-mb-day="' + today + '" aria-pressed="' + (today === selectedDay) + '">I dag' + dot(today) + '</button><button data-mb-day="' + tomorrow + '" aria-pressed="' + (tomorrow === selectedDay) + '">I morgon' + dot(tomorrow) + '</button></div>';
  }
  function gapText(mins) { return (mins >= 60 ? Math.floor(mins / 60) + ' h ' : '') + (mins % 60 ? mins % 60 + ' min ' : '') + 'ledigt'; }
  function timelineHtml() {
    var layout = timelineLayout(rows, selectedDay), h = dayNav();
    if (!layout.length) h += '<p class="mb-day-empty" role="status">Inga aktuella bevakningar den här dagen.</p>';
    h += '<div class="mb-timeline-scroll" tabindex="0" aria-label="Dagens tidslinje, skrolla för fler timmar"><div class="mb-timeline" style="height:' + (1440 * PX + 52) + 'px">';
    for (var m = 0; m <= 1440; m += 30) {
      h += '<div class="mb-hour' + (m % 60 ? ' half' : '') + '" style="top:' + m * PX + 'px">' + (m % 60 ? '' : '<span>' + String(m / 60).padStart(2, '0') + ':00</span>') + '</div>';
    }
    // Luckor räknas mellan de visuella blocken, överlappande block slås ihop.
    var until = null;
    layout.forEach(function (x) {
      if (until !== null && x.from - until >= 45) h += '<div class="mb-gap" style="top:' + ((until + x.from) / 2) * PX + 'px">' + gapText(Math.round(x.from - until)) + '</div>';
      until = Math.max(until || 0, x.to);
      var r = x.row, times = parts(r.at).hm + (r.kind === 'event' && r.end > r.at ? '–' + parts(r.end).hm : '');
      h += '<article class="mb-block mb-block-' + r.kind + (r.pending ? ' pending' : '') + '" data-mb-block="' + x.index + '" data-column="' + x.column + '" data-columns="' + x.columns + '" style="top:' + (x.from * PX) + 'px;height:' + ((x.to - x.from) * PX - 3) + 'px;left:calc(46px + (100% - 48px) * ' + x.column / x.columns + ');width:calc((100% - 48px) / ' + x.columns + ' - 4px)"><button class="mb-block-open" data-mb-open="' + x.index + '" aria-label="' + esc(times + ' ' + r.title + ' ' + r.status) + '"><small>' + icon(r) + ' ' + times + (x.continues ? ' ↔' : '') + '</small><b>' + esc(r.title) + '</b>' + (x.to - x.from >= 40 ? (r.flag ? '<span class="mb-st mb-st-' + r.flag + '">' + esc(String(r.status || 'I tid').split(' · ')[0]) + '</span>' : '<span>' + esc(r.status || '') + '</span>') : '') + '</button>' + (r.kind === 'booking' ? '' : '<button class="mb-block-menu" data-mb-menu="' + x.index + '" aria-label="Fler val för ' + esc(r.title) + '" aria-haspopup="dialog">⋯</button>') + '</article>';
    });
    if (selectedDay === parts(Date.now()).key) h += '<div class="mb-now" style="top:' + minute(Date.now()) * PX + 'px"><span>nu ' + parts(Date.now()).hm + '</span></div>';
    return h + '</div></div><p class="mb-timeline-note">Tåg, flyg och bokade tider är korta markörer, inte arbetspass. Grå bokningar väntar på svar. Kalenderblock visar tiden från start till slut. Ledigt räknas mellan de ritade blocken.</p>';
  }

  function draw(errors, message) {
    if (!host || !host.isConnected) return;
    var oldScroll = host.querySelector('.mb-timeline-scroll'), scrollTop = oldScroll ? oldScroll.scrollTop : null;
    lastErrors = errors || [];
    var h = '<div class="mb"><div class="mb-view-toggle" role="group" aria-label="Visning"><button data-mb-view="timeline" aria-pressed="' + (mode === 'timeline') + '">Tidslinje</button><button data-mb-view="list" aria-pressed="' + (mode === 'list') + '">Schema</button></div><div id="mb-ljud-box"></div><p class="mb-intro">Håll fingret på en tåg-, flyg- eller båtbevakning för att göra den fast (guldstjärna). Kugghjulet ställer in tid och dagar. Evenemang kan bara vara tillfälliga.</p><button type="button" class="mb-refresh" data-mb-refresh>↻ Uppdatera</button>';
    if (message) h += '<p role="status" class="mb-warning">' + esc(message) + '</p>';
    if (errors && errors.length) h += '<p role="status" class="mb-warning">Kunde inte hämta ' + esc(errors.join(', ')) + '. Listan kan vara ofullständig. Försök igen med Uppdatera.</p>';
    if (!rows.length) h += '<div class="mb-empty"><div>📌</div><h3>' + (errors && errors.length ? 'Inget att visa just nu' : 'Inga bevakningar än') + '</h3><p>Tryck ☆ på en ankomst under Ankomster för en tillfällig bevakning. I Kalender: öppna ett evenemang och välj en påminnelse.</p><button data-mb-source="ankomster">Öppna Ankomster</button><button data-mb-source="kalender">Öppna Kalender</button></div>';
    if (mode === 'timeline') h += timelineHtml();
    var day = '';
    (mode === 'list' ? rows : []).forEach(function (r, i) {
      var p = parts(r.at);
      if (p.key !== day) { h += '<h3 class="mb-day">' + esc(dayLabel(p.key)) + '</h3>'; day = p.key; }
      var star = r.permanent ? '<span class="mb-star gold" title="Fast bevakning">⭐</span>' : (r.watch ? '<span class="mb-star" title="Tillfällig bevakning">⭐</span>' : '');
      var extra = '';
      if (r.permanent && r.routeWatch) extra += '<small>Fast · ' + esc(daysText(r.routeWatch.days)) + ' ' + esc((window.BEVAKNING && BEVAKNING.hhmm) ? BEVAKNING.hhmm(r.routeWatch.sched_min) : '') + '</small>';
      else if (r.rules.length) extra += '<small>Äldre bevakning: ' + esc(r.rules.map(function (w) { return w.name; }).join(', ')) + '</small>';
      var tools = star + (canGear(r) ? '<button class="mb-gear-btn" data-mb-gear="' + i + '" aria-label="Tid och dagar">⚙</button>' : '');
      var removeBtn = canRemove(r) ? '<button class="mb-remove" data-mb-remove="' + i + '"' + (busy ? ' disabled' : '') + ' aria-label="Sluta bevaka ' + esc(r.title) + '">Sluta bevaka</button>' : '';
      h += '<article class="mb-row' + (r.kind === 'booking' ? ' mb-row-booking' : '') + (r.pending ? ' pending' : '') + (r.permanent ? ' mb-row-perm' : '') + '" data-mb-row="' + i + '"><button class="mb-open" data-mb-open="' + i + '"><span class="mb-time">' + p.hm + '<small>' + icon(r) + '</small></span><span class="mb-text"><b>' + esc(r.title) + '</b>' + statusChip(r) + extra + '</span>' + tools + (r.placeholder ? '' : '<span aria-hidden="true">›</span>') + '</button>' + removeBtn + '</article>';
    });
    if (actionIndex !== null && rows[actionIndex]) {
      var ar = rows[actionIndex];
      h += '<div class="mb-action-shade"><section class="mb-action-sheet" role="dialog" aria-modal="true" aria-label="Bevakning"><b>' + esc(ar.title) + '</b>';
      if (canHold(ar)) h += '<button data-mb-perm="' + actionIndex + '">' + (ar.permanent ? 'Gör till tillfällig' : 'Gör till fast bevakning') + '</button>';
      if (canGear(ar)) h += '<button data-mb-gear="' + actionIndex + '">Tid och dagar</button>';
      if (canRemove(ar)) h += '<button data-mb-remove="' + actionIndex + '">Sluta bevaka</button>';
      h += '<button data-mb-cancel>Avbryt</button></section></div>';
    }
    if (gearIndex !== null && rows[gearIndex] && canGear(rows[gearIndex])) {
      var gr = rows[gearIndex], gw = gr.routeWatch || {}, gdays = gw.days || [1, 2, 3, 4, 5, 6, 7];
      var gtime = (window.BEVAKNING && BEVAKNING.hhmm) ? BEVAKNING.hhmm(gw.sched_min != null ? gw.sched_min : (window.BEVAKNING.schedMinOf(gr.sched || gr.at))) : '00:00';
      var dnames = ['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'];
      h += '<div class="mb-action-shade" data-mb-gear-shade><section class="mb-action-sheet mb-gear" role="dialog" aria-modal="true" aria-label="Tid och dagar"><b>Tid och dagar</b><p class="mb-gear-lab">' + esc(gr.title) + '</p>';
      h += '<label class="mb-gear-time">Tid <input type="time" data-mb-gear-time value="' + gtime + '"></label><div class="mb-gear-days">';
      for (var d = 1; d <= 7; d++) h += '<button type="button" class="mb-dow' + (gdays.indexOf(d) >= 0 ? ' on' : '') + '" data-mb-dow="' + d + '" aria-pressed="' + (gdays.indexOf(d) >= 0) + '">' + dnames[d - 1] + '</button>';
      h += '</div><button data-mb-gear-save>Spara</button><button data-mb-cancel>Avbryt</button></section></div>';
    }
    host.innerHTML = h + '<p class="mb-foot">Tillfälliga ankomster tas bort på Ankomster eller försvinner efter ankomst. Fasta görs tillfälliga med ett långt tryck här. Avslutade visas i högst 2 timmar. Kalender: kommande året i dina städer.</p></div>';
    host.querySelectorAll('[data-mb-view]').forEach(function (b) { b.onclick = function () {
      mode = b.dataset.mbView; localStorage.setItem('taxi_mb_view', mode); autoPosition = true; actionIndex = null; draw(errors);
    }; });
    host.querySelectorAll('[data-mb-day], [data-mb-step]').forEach(function (b) { b.onclick = function () {
      selectedDay = b.dataset.mbDay || addDay(selectedDay, +b.dataset.mbStep); autoPosition = true; actionIndex = null; draw(errors);
    }; });
    host.querySelectorAll('[data-mb-menu]').forEach(function (b) { b.onclick = function () { actionIndex = +b.dataset.mbMenu; draw(errors); host.querySelector('[data-mb-cancel]').focus(); }; });
    var cancel = host.querySelector('[data-mb-cancel]'); if (cancel) cancel.onclick = function () { var i = actionIndex; actionIndex = null; gearIndex = null; draw(errors); var b = host.querySelector('[data-mb-menu="' + i + '"]'); if (b) b.focus({ preventScroll: true }); };
    var sheet = host.querySelector('.mb-action-sheet'); if (sheet) sheet.onkeydown = function (e) {
      if (e.key === 'Escape' && cancel) cancel.click();
    };
    var scroll = host.querySelector('.mb-timeline-scroll');
    if (scroll) {
      if (autoPosition || scrollTop === null) {
        var items = daySegments(rows, selectedDay), pos = selectedDay === parts(Date.now()).key ? minute(Date.now()) : (items.length ? items[0].from : 8 * 60);
        scroll.scrollTop = Math.max(0, (pos - 60) * PX); autoPosition = false;
      } else scroll.scrollTop = scrollTop;
    }
    host.querySelector('[data-mb-refresh]').onclick = refresh;
    host.querySelectorAll('[data-mb-source]').forEach(function (b) { b.onclick = function () { window.openItem(b.dataset.mbSource); }; });
    host.querySelectorAll('[data-mb-open]').forEach(function (b) { b.onclick = function () { M.open(rows[+b.dataset.mbOpen]); }; });
    host.querySelectorAll('[data-mb-remove]').forEach(function (b) { b.onclick = function () {
      if (busy) return;
      var r = rows[+b.dataset.mbRemove], g = generation;
      if (!canRemove(r)) return;
      var verb = r.kind === 'flyg' ? 'Flyget' : r.kind === 'bat' ? 'Båten' : 'Tåget', obj = r.kind === 'flyg' ? 'flyget' : r.kind === 'bat' ? 'båten' : 'tåget';
      var text = r.rules.length ? verb + ' ingår i en äldre bevakning. Stänga av hela bevakningen (' + r.rules.map(function (w) { return w.name; }).join(', ') + ')?' : 'Sluta bevaka ' + r.title + '?';
      if (!window.confirm(text)) return;
      busy = true; actionIndex = null; gearIndex = null; draw(errors);
      remove(r).then(function () { if (g === generation) refresh(); }).catch(function () { busy = false; if (g === generation) draw(errors, 'Kunde inte ta bort allt. Uppdatera och försök igen.'); }).finally(function () { busy = false; });
    }; });
    host.querySelectorAll('[data-mb-gear]').forEach(function (b) { b.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      gearIndex = +b.dataset.mbGear; actionIndex = null; draw(errors);
    }; });
    host.querySelectorAll('[data-mb-perm]').forEach(function (b) { b.onclick = function () {
      if (busy) return;
      var r = rows[+b.dataset.mbPerm], g = generation;
      busy = true; actionIndex = null; draw(errors);
      togglePermanent(r).then(function () { if (g === generation) refresh(); }).catch(function () {
        busy = false; if (g === generation) draw(errors, 'Det gick inte att ändra bevakningen.');
      }).finally(function () { busy = false; });
    }; });
    var gearSave = host.querySelector('[data-mb-gear-save]');
    if (gearSave) gearSave.onclick = function () {
      if (busy || gearIndex === null || !rows[gearIndex]) return;
      var r = rows[gearIndex], g = generation, Bv = window.BEVAKNING;
      var timeEl = host.querySelector('[data-mb-gear-time]');
      var m = timeEl && /^(\d{1,2}):(\d{2})/.exec(timeEl.value);
      var schedMin = m ? Math.min(1439, +m[1] * 60 + +m[2]) : (Bv && Bv.schedMinOf(r.sched || r.at));
      var days = [];
      host.querySelectorAll('.mb-dow.on').forEach(function (x) { days.push(+x.getAttribute('data-mb-dow')); });
      if (!days.length) { toast('Välj minst en dag.'); return; }
      if (!Bv || schedMin < 0) { toast('Det gick inte att spara tiden.'); return; }
      var route = r.route || (r.routeWatch && r.routeWatch.route) || (Bv.routeOf && Bv.routeOf(r.item || r));
      if (!route) { toast('Saknar tur.'); return; }
      var label = (r.routeWatch && r.routeWatch.label) || (r.item && r.item.from) || r.title;
      busy = true;
      Bv.saveRoute({ kind: r.kind, route: route, label: label, sched_min: schedMin, days: days }, r.routeWatch ? r.routeWatch.id : null)
        .then(function () { gearIndex = null; if (g === generation) refresh(); toast('Sparat.'); })
        .catch(function (e) {
          busy = false; gearIndex = null;
          var msg = (e && e.code === '23505') ? 'Det finns redan en fast bevakning för den turen och tiden.' : 'Det gick inte att spara.';
          if (g === generation) draw(errors, msg);
        }).finally(function () { busy = false; });
    };
    host.querySelectorAll('[data-mb-dow]').forEach(function (b) { b.onclick = function () {
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false');
    }; });
    var ljud = host.querySelector('#mb-ljud-box');
    if (ljud && window.BEV_LJUD && BEV_LJUD.renderCompact) BEV_LJUD.renderCompact(ljud, ['tag', 'flyg', 'bat']);
    bindHold(host, errors);
  }
  function bindHold(el, errors) {
    if (el._mbhold) return; el._mbhold = true;
    var timer = null, sx = 0, sy = 0, fired = false, idx = -1;
    function clear() { clearTimeout(timer); timer = null; }
    el.addEventListener('pointerdown', function (e) {
      var row = e.target.closest('[data-mb-row]');
      if (!row || e.target.closest('.mb-gear-btn, .mb-remove, .mb-action-shade') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      idx = +row.getAttribute('data-mb-row');
      var r = rows[idx];
      if (!canHold(r)) return;
      fired = false; sx = e.clientX; sy = e.clientY;
      row.classList.add('mb-press');
      clear();
      timer = setTimeout(function () {
        fired = true; row.classList.remove('mb-press');
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (x) {}
        if (busy) return;
        var g = generation;
        busy = true; actionIndex = null;
        togglePermanent(r).then(function () { if (g === generation) refresh(); }).catch(function () {
          busy = false; if (g === generation) draw(errors, 'Det gick inte att ändra bevakningen.');
        }).finally(function () { busy = false; });
      }, 500);
    });
    function cancel() { clear(); var p = el.querySelector('.mb-press'); if (p) p.classList.remove('mb-press'); }
    el.addEventListener('pointermove', function (e) { if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) cancel(); });
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', function (e) { if (e.target.closest('[data-mb-row]')) e.preventDefault(); });
    el.addEventListener('click', function (e) {
      if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); }
    }, true);
  }
  function refresh() {
    var g = ++generation, session = token();
    M.load(false).then(function (d) {
      if (g !== generation || session !== token()) return;
      var actionId = actionIndex !== null && rows[actionIndex] ? rows[actionIndex].id : null;
      rows = d.rows;
      if (actionId) { actionIndex = rows.findIndex(function (r) { return r.id === actionId; }); if (actionIndex < 0) actionIndex = null; }
      draw(d.errors);
    }).catch(function () { if (g === generation) { rows = []; draw(['bevakningar']); } });
  }
  M.stop = function () { generation++; clearInterval(timer); timer = null; host = null; rows = []; busy = false; actionIndex = null; gearIndex = null; };
  M.render = function (el) {
    M.stop(); selectedDay = (window.VIEW_STATE&&VIEW_STATE.get('mina-bevakningar',{}).day)||parts(Date.now()).key; mode = localStorage.getItem('taxi_mb_view') === 'list' ? 'list' : 'timeline'; autoPosition = true; actionIndex = null; host = el; el.innerHTML = '<div class="mb"><p role="status">Laddar dina bevakningar…</p></div>'; refresh();
    timer = setInterval(function () { if (!host || !host.isConnected) M.stop(); else if (!document.hidden && !busy && actionIndex === null) refresh(); }, 60000);
  };
  // Ren logik för tester med syntetiska data.
  M.normalize = normalize; M.inWindow = inWindow; M.timelineLayout = timelineLayout; M.daySegments = daySegments;

 if(window.VIEW_STATE)VIEW_STATE.bind('mina-bevakningar',function(){return {day:selectedDay};});

})();
