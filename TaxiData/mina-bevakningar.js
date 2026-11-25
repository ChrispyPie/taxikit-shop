/* Personlig planering. Ingen privat lista sparas på enheten: samma sessionskontrollerade
 * RPC:er som Ankomster och Kalender. Tidtabellerna är offentliga och delas med Ankomster. */
(function () {
  'use strict';
  var M = window.MINA_BEVAKNINGAR = { id: 'mina-bevakningar', title: 'Bevakningar', icon: '📌' };
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
    if (it && it.removed && it.replacedBy) flag = it.info && it.info.indexOf('Landat') >= 0 ? 'arrived' : 'ontime';  // info: "Ersatt av BLX284 · ..."
    else if (it && it.removed) { info.push('Borttagen'); flag = 'removed'; }
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
  function normalize(watches, rules, trains, flights, events, now, flightRules, routeWatches, boats) {
    flightRules = flightRules || [];
    routeWatches = routeWatches || [];
    boats = boats || [];
    var out = [], used = {};
    watches.forEach(function (w) {
      if (Date.parse(w.expires_at) <= now) return;
      var list = w.kind === 'flyg' ? flights : w.kind === 'bat' ? boats : trains;
      var it = list.find(function (x) { return x.key.charAt(0) === kindPrefix(w.kind) && x.key.split('|')[0].slice(1) === String(w.ident) && Math.abs(+x.sched - Date.parse(w.sched)) < 60000; });
      if (it && it.hidden && !it.replacedBy) return;  // gammal tidtabellsrest som aldrig skulle flyga
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
      if (used[it.key] || !window.FLYGNOTIS || it.hidden) return;
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
      safe(ARRIVAL_DATA.watchItems('bat'), 'båttider', []),
      onlyTransport ? Promise.resolve([]) : safe(calendarEvents(errors), 'kalendern', []),
      onlyTransport ? Promise.resolve([]) : safe((window.DEMO&&DEMO.on()?Promise.resolve([]):rpc('mailbox_v2',{p_token:localStorage.getItem('taxi_session')||'',p_action:'timeline',p_data:{}})), 'bokade tider', []),
      safe(rpc('flight_watch_list', {}), 'flygbevakningar', []),
      safe(window.BEVAKNING && BEVAKNING.loadRoutes ? BEVAKNING.loadRoutes(true) : rpc('route_watch_list', {}), 'fasta bevakningar', [])
    ]).then(function (data) {
      if (session !== token()) throw new Error('session');
      var bookings = (data[6] || []).map(function (b) { return { id: 'booking-' + b.id, kind: 'booking', thread_id: b.thread_id, at: Date.parse(b.at), end: Date.parse(b.at), title: b.title, status: b.status === 'accepted' ? 'Bokad tid · Godkänd' : 'Bokad tid · Väntar på ' + (b.status === 'pending_admin' ? 'admin' : 'ditt svar'), pending: b.status !== 'accepted', rules: [] }; });
      return { rows: normalize(data[0], data[1], data[2], data[3], data[5], Date.now(), data[7], data[8], data[4]).concat(bookings).sort(function (a,b) { return a.at-b.at; }), errors: errors };
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
    // Pausa äldre regler bara när raden inte är en tillfällig stjärnbevakning.
    if (!r.watch) (r.rules || []).forEach(function (w) {
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
  var PX = 1.5, selectedDay = null, mode = 'dag', returnTo = null, autoPosition = true, actionIndex = null, gearIndex = null, infoIndex = null, lastErrors = [];
  function isTransport(r) { return r && (r.kind === 'tag' || r.kind === 'flyg' || r.kind === 'bat'); }
  function canHold(r) { return isTransport(r) && !!(r.route || r.routeWatch); }
  function canGear(r) { return canHold(r); }
  function canRemove(r) {
    if (!r || r.kind === 'booking' || r.placeholder) return false;
    if (r.kind === 'event') return true;
    // Fast ruttbevakning tas inte bort här – gör den tillfällig först.
    if (r.routeWatch) return false;
    if (r.watch) return true;
    if (r.rules && r.rules.length) return true;
    return false;
  }
  // Villkor per avgång (bara tåg): nyckel för avgången och, för fasta, för den fasta bevakningen.
  function canVillkor(r) { return !!(r && r.kind === 'tag' && window.TAG_VILLKOR && TAG_VILLKOR.openSheet && (villkorTarget(r).key || villkorTarget(r).routeKey)); }
  function villkorTarget(r) {
    var V = window.TAG_VILLKOR, t = { title: r.title, key: null, routeKey: null, onlyRoute: !!r.placeholder };
    if (!V) return t;
    var m = /^t([^|]*)\|(.*)$/.exec(String(r.key || ''));
    if (m && !r.placeholder) t.key = V.depKey(m[1], m[2]);
    if (r.routeWatch && r.routeWatch.id != null) t.routeKey = V.routeKey(r.routeWatch.id);
    return t;
  }
  function hasVillkor(r) {
    if (!canVillkor(r)) return false;
    var t = villkorTarget(r);
    return TAG_VILLKOR.hasOverride(t.key) || TAG_VILLKOR.hasOverride(t.routeKey);
  }
  function openVillkor(r) { if (canVillkor(r)) TAG_VILLKOR.openSheet(villkorTarget(r)); }
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
  // En vy (t1840u): Dag (tidslinjen med nu-linjen) → Vecka → Månad. Stegar med vald enhet.
  var UNITS = ['dag', 'vecka', 'manad'], UNIT_N = { dag: 'Dag', vecka: 'Vecka', manad: 'Månad' }, MON = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var MONL = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'], WDS = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
  function dowOf(k) { return new Date(k + 'T12:00:00Z').getUTCDay() || 7; }
  function weekStart(k) { return addDay(k, 1 - dowOf(k)); }
  function isoWeek(k) { var d = new Date(addDay(k, 4 - dowOf(k)) + 'T12:00:00Z'), y = Date.UTC(d.getUTCFullYear(), 0, 1); return Math.ceil(((d - y) / 864e5 + 1) / 7); }
  function dm(k) { return +k.slice(8, 10) + ' ' + MON[+k.slice(5, 7) - 1]; }
  function addMonth(k, n) { var y = +k.slice(0, 4), m = +k.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; var dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(Math.min(+k.slice(8, 10), dim)).padStart(2, '0'); }
  function stepKey(k, n) { return mode === 'vecka' ? addDay(k, 7 * n) : mode === 'manad' ? addMonth(k, n) : addDay(k, n); }
  function unitLabel(k) {
    if (mode === 'vecka') { var a = weekStart(k), b = addDay(a, 6); return { big: 'Vecka ' + isoWeek(k), small: dm(a) + ' – ' + dm(b) }; }
    if (mode === 'manad') { return { big: MONL[+k.slice(5, 7) - 1].replace(/^./, function (c) { return c.toUpperCase(); }), small: k.slice(0, 4) }; }
    return { big: dayLabel(k), small: k };
  }
  function hasUnit(k) {
    if (mode === 'dag') return hasDay(k);
    var a = mode === 'vecka' ? weekStart(k) : k.slice(0, 8) + '01', n = mode === 'vecka' ? 7 : new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).getUTCDate();
    for (var i = 0; i < n; i++) if (hasDay(addDay(a, i))) return true;
    return false;
  }
  function udot(k) { return hasUnit(k) ? '<i class="mb-daydot" aria-label="Har bevakningar"></i>' : ''; }
  function unitIcon(u) {
    var box = '<rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>';
    function svg(inner) { return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + inner + '</svg>'; }
    if (u === 'dag') return svg(box + '<path d="M7 8.5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="7" y="10.5" width="10" height="3.8" rx="1" fill="currentColor"/><path d="M7 16.5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>');
    if (u === 'vecka') return svg(box + '<path d="M8.2 5.2v13.6M11.4 5.2v13.6M14.6 5.2v13.6M17.8 5.2v13.6" fill="none" stroke="currentColor" stroke-width="1.5"/>');
    var cells = '', r, c;
    for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) cells += '<rect x="' + (5 + c * 5) + '" y="' + (5 + r * 5) + '" width="3.6" height="3.6" rx="0.7" fill="currentColor"/>';
    return svg(cells);
  }
  function navDateLabel(k) {
    if (mode === 'vecka') {
      var a = weekStart(k), b = addDay(a, 6);
      return a.slice(0, 7) === b.slice(0, 7) ? (+a.slice(8, 10) + '–' + dm(b)) : (dm(a) + '–' + dm(b));
    }
    if (mode === 'manad') return MON[+k.slice(5, 7) - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + k.slice(0, 4);
    var today = parts(Date.now()).key;
    if (k === today) return 'I dag';
    if (k === addDay(today, 1)) return 'I morgon';
    if (k === addDay(today, -1)) return 'I går';
    return WDS[dowOf(k) - 1] + ' ' + dm(k);
  }
  function onToday() {
    var today = parts(Date.now()).key;
    if (mode === 'vecka') return weekStart(selectedDay) === weekStart(today);
    if (mode === 'manad') return selectedDay.slice(0, 7) === today.slice(0, 7);
    return selectedDay === today;
  }
  function backIcon() {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5.5l-7 6.5 7 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function todayIcon() {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l6 6-6 6M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function gearIcon() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.62l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.04-.7-1.63-.94l-.36-2.54A.5.5 0 0 0 13.91 2h-3.82a.5.5 0 0 0-.49.35l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.49.49 0 0 0-.59.22L2.71 8.86a.49.49 0 0 0 .12.62l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.62l1.92 3.32c.13.22.4.31.59.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.2.25.35.49.35h3.82a.5.5 0 0 0 .49-.35l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.09.46 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.62l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z"/></svg>';
  }
  // Verktygsrad: vyikon eller tillbaka, datumvisare, dubbelpil (idag), kugghjul för ljud och notiser.
  function toolNav() {
    var u = UNIT_N[mode], next = UNIT_N[UNITS[(UNITS.indexOf(mode) + 1) % 3]], todayOn = onToday();
    var todayLbl = mode === 'vecka' ? 'Den här veckan' : mode === 'manad' ? 'Den här månaden' : 'Idag';
    var left = returnTo
      ? '<button type="button" class="mb-unit" data-mb-backunit aria-label="Tillbaka till ' + (returnTo.mode === 'vecka' ? 'vecka' : 'månad') + '">' + backIcon() + '</button>'
      : '<button type="button" class="mb-unit" data-mb-unit data-mb-mode="' + mode + '" aria-label="Vy: ' + u + '. Tryck för ' + next + '">' + unitIcon(mode) + '</button>';
    return '<div class="mb-toolbar">' + left +
      '<div class="date-nav mb-date-nav">' +
        '<button type="button" data-mb-step="-1" aria-label="Föregående ' + u.toLowerCase() + '">‹</button>' +
        '<button type="button" class="tl-date" data-mb-pick aria-haspopup="dialog" aria-label="Välj datum">' + esc(navDateLabel(selectedDay)) + '</button>' +
        '<button type="button" data-mb-step="1" aria-label="Nästa ' + u.toLowerCase() + '">›</button>' +
      '</div>' +
      '<button type="button" class="mb-today' + (todayOn ? ' active' : '') + '" data-mb-today aria-label="' + todayLbl + '" aria-pressed="' + todayOn + '">' + todayIcon() + '</button>' +
      '<button type="button" class="mb-lj-btn" data-mb-lj-open aria-label="Ljud och notiser" aria-haspopup="dialog">' + gearIcon() + '</button>' +
    '</div>';
  }
  function closePick() {
    var m = document.getElementById('mb-cal-modal');
    if (!m || !m.classList.contains('open')) return false;
    m.classList.remove('open');
    return true;
  }
  function drawPick() {
    var m = document.getElementById('mb-cal-modal'); if (!m || !pick) return;
    var first = pick.m, y = +first.slice(0, 4), mo = +first.slice(5, 7) - 1, today = parts(Date.now()).key;
    var title = MON[mo].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + y;
    var h = '<div class="pm-head"><button type="button" data-mb-pm-prev aria-label="Föregående månad">‹</button><span id="mb-pm-title">' + esc(title) + '</span><button type="button" data-mb-pm-next aria-label="Nästa månad">›</button></div>';
    h += '<div class="pm-cal" id="mb-pm-cal">' + ['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'].map(function (d) { return '<div class="pm-wd">' + d + '</div>'; }).join('');
    var i, dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    for (i = 0; i < dowOf(first) - 1; i++) h += '<div></div>';
    for (i = 1; i <= dim; i++) {
      var k = first.slice(0, 8) + String(i).padStart(2, '0'), c = 'pm-day';
      if (k === pick.sel) c += ' sel';
      if (k === today) c += ' today';
      h += '<button type="button" class="' + c + '" data-mb-pm-day="' + k + '">' + i + '</button>';
    }
    m.querySelector('.pm-box').innerHTML = h;
    m.querySelector('[data-mb-pm-prev]').onclick = function (e) { e.stopPropagation(); pick.m = addMonth(first, -1).slice(0, 8) + '01'; drawPick(); };
    m.querySelector('[data-mb-pm-next]').onclick = function (e) { e.stopPropagation(); pick.m = addMonth(first, 1).slice(0, 8) + '01'; drawPick(); };
    m.querySelectorAll('[data-mb-pm-day]').forEach(function (b) { b.onclick = function (e) {
      e.stopPropagation(); selectedDay = b.getAttribute('data-mb-pm-day'); autoPosition = true; actionIndex = null; infoIndex = null;
      closePick(); draw(lastErrors);
    }; });
  }
  var pick = null;
  function openPick() {
    var m = document.getElementById('mb-cal-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'mb-cal-modal';
      m.className = 'pm-overlay';
      m.innerHTML = '<div class="pm-box" role="dialog" aria-modal="true" aria-label="Välj dag"></div>';
      document.body.appendChild(m);
      m.addEventListener('click', function (ev) { if (ev.target === m) closePick(); });
    }
    pick = { m: selectedDay.slice(0, 8) + '01', sel: selectedDay };
    drawPick();
    m.classList.add('open');
  }
  function dayItems(k) { return daySegments(rows, k); }
  // Vecka som i Google Kalender/Outlook: 7 dagkolumner med timrutnät, kompakta block, dagens rubrik markerad.
  var PXW = 0.75;
  function weekHtml() {
    var a = weekStart(selectedDay), today = parts(Date.now()).key, H = 1440 * PXW;
    var h = toolNav() + '<div class="mb-wk"><div class="mb-wk-head"><span></span>';
    for (var i = 0; i < 7; i++) {
      var k = addDay(a, i);
      h += '<button type="button" class="mb-wk-dh' + (k === today ? ' today' : '') + '" data-mb-goday="' + k + '" aria-label="Öppna ' + esc(WDS[i] + ' ' + dm(k)) + ' i dagvyn"><small>' + WDS[i] + '</small><b>' + (+k.slice(8, 10)) + '</b></button>';
    }
    h += '</div><div class="mb-wk-scroll" tabindex="0" aria-label="Veckans timmar, skrolla för fler"><div class="mb-wk-grid" style="height:' + H + 'px">';
    h += '<div class="mb-wk-gutter" aria-hidden="true">';
    for (var m = 0; m < 1440; m += 60) h += '<div class="mb-wk-hl" style="top:' + m * PXW + 'px">' + (m ? String(m / 60).padStart(2, '0') : '') + '</div>';
    h += '</div>';
    for (m = 0; m < 1440; m += 60) h += '<div class="mb-wk-hr" style="top:' + m * PXW + 'px"></div>';
    for (i = 0; i < 7; i++) {
      k = addDay(a, i);
      h += '<div class="mb-wk-col' + (k === today ? ' today' : '') + '" data-mb-goday="' + k + '" role="button" tabindex="0" aria-label="Öppna ' + esc(WDS[i] + ' ' + dm(k)) + ' i dagvyn" style="left:calc(30px + (100% - 30px) * ' + i + ' / 7);width:calc((100% - 30px) / 7)">';
      timelineLayout(rows, k).forEach(function (x) {
        var r = x.row, ht = Math.max(8, (x.to - x.from) * PXW - 2);
        h += '<div class="mb-wk-b mb-wk-' + r.kind + (r.pending ? ' pending' : '') + (r.flag === 'canceled' || r.flag === 'removed' ? ' bad' : '') + '" style="top:' + (x.from * PXW) + 'px;height:' + ht + 'px;left:' + (100 * x.column / x.columns) + '%;width:calc(' + (100 / x.columns) + '% - 2px)" aria-hidden="true"></div>';
      });
      if (k === today) h += '<div class="mb-wk-now" style="top:' + minute(Date.now()) * PXW + 'px"></div>';
      h += '</div>';
    }
    return h + '</div></div></div><p class="mb-timeline-note">Tryck på en dag för dagvyn.</p>';
  }
  // Månad: klassiskt rutnät, korta etiketter (färg per sort), "+N till", dagens datum inringat.
  function monthHtml() {
    var first = selectedDay.slice(0, 8) + '01', start = weekStart(first), today = parts(Date.now()).key, mon = first.slice(0, 7);
    var todayDow = dowOf(today);
    var h = toolNav() + '<div class="mb-month" role="grid" aria-label="Månad"><div class="mb-mrow mb-mhead"><span class="mb-mwk-h" aria-hidden="true"></span>' + WDS.map(function (d, i) { return '<span' + (i + 1 === todayDow ? ' class="today"' : '') + '>' + d + '</span>'; }).join('') + '</div>';
    for (var w = 0; w < 6; w++) {
      var ws = addDay(start, w * 7); if (w && ws.slice(0, 7) > mon) break;
      h += '<div class="mb-mrow"><span class="mb-mwk" aria-label="Vecka ' + isoWeek(ws) + '">' + isoWeek(ws) + '</span>';
      for (var i = 0; i < 7; i++) {
        var k = addDay(ws, i), list = dayItems(k), show = list.length > 3 ? 2 : list.length;
        h += '<button type="button" class="mb-mday' + (k.slice(0, 7) !== mon ? ' out' : '') + (k === today ? ' today' : '') + '" data-mb-goday="' + k + '" aria-label="' + esc(dm(k)) + ', ' + (list.length ? list.length + ' bevakningar' : 'inget') + '"><b>' + (+k.slice(8, 10)) + '</b>' +
          list.slice(0, show).map(function (x) { var r = x.row; return '<span class="mb-ml mb-ml-' + r.kind + '">' + esc(String(r.title).split(' · ')[0]) + '</span>'; }).join('') +
          (list.length > show ? '<span class="mb-mmore">+' + (list.length - show) + ' till</span>' : '') + '</button>';
      }
      h += '</div>';
    }
    return h + '</div><p class="mb-timeline-note">Tryck på en dag för att se den i dagvyn.</p>';
  }
  function goDay(k) { returnTo = { mode: mode, day: selectedDay }; mode = 'dag'; selectedDay = k; autoPosition = true; actionIndex = null; infoIndex = null; draw(lastErrors); try { window.scrollTo(0, 0); } catch (e) {} }
  function goBackUnit() { if (!returnTo) return false; mode = returnTo.mode; selectedDay = returnTo.day; returnTo = null; infoIndex = null; draw(lastErrors); return true; }
  function gapText(mins) { return (mins >= 60 ? Math.floor(mins / 60) + ' h ' : '') + (mins % 60 ? mins % 60 + ' min ' : '') + 'ledigt'; }
  function timelineHtml() {
    var layout = timelineLayout(rows, selectedDay), h = toolNav();
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

  // Infobox (t1838u): tryck på en bevakning visar allt vi vet om den här, i stället för att lämna sidan.
  // Samma uppställning (etikett + värde) som flygrutan i Prognos. Länken längst ner öppnar källsidan.
  function hmOf(v) { var t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(t) ? parts(t).hm : ''; }
  function kv(lab, val, cls) { return val ? '<div class="mb-info-kv"><dt>' + esc(lab) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(val) + '</dd></div>' : ''; }
  function stationName(id) {
    if (!id) return '';
    try { var c = JSON.parse(localStorage.getItem('taxi_train_stations_v1') || 'null'); var s = c && (c.stations || []).find(function (x) { return x.id === id; }); if (s && s.label) return s.label; } catch (e) {}
    return id === 'G' ? 'Göteborg C' : id;
  }
  function lateMin(it) { var e = +(it.act || it.est), s = +it.sched; return e && s ? Math.round((e - s) / 60000) : 0; }
  function watchText(r) {
    if (r.permanent && r.routeWatch) return 'Fast · ' + daysText(r.routeWatch.days) + ((window.BEVAKNING && BEVAKNING.hhmm) ? ' ' + BEVAKNING.hhmm(r.routeWatch.sched_min) : '');
    if (r.watch) return 'Tillfällig (stjärna på Ankomster)';
    if (r.rules && r.rules.length) return 'Äldre bevakning: ' + r.rules.map(function (w) { return w.name; }).join(', ');
    return '';
  }
  function infoHtml(r, i) {
    var it = r.item, h = '', link = '', head = icon(r) + ' ' + r.title;
    if (r.kind === 'tag' || r.kind === 'bat' || r.kind === 'flyg') {
      if (it) {
        var late = lateMin(it), arrived = !!it.act;
        if (r.kind === 'flyg') {
          h += kv('Flygnummer', it.no) + kv('Bolag', it.sub) + kv('Från', it.from) + kv('Till', 'Landvetter');
        } else if (r.kind === 'tag') {
          h += kv('Tåg', String(it.no || '').replace(/^Tåg\s*/, '')) + kv('Tågtyp', it.sub) + kv('Från', it.from) + kv(it.dir === 'AVG' ? 'Avgår från' : 'Till', stationName(it.station));
        } else {
          h += kv('Fartyg', it.no) + kv('Från', it.from) + kv('Terminal', it.terminal ? it.terminal + (it.area ? ', ' + it.area : '') : '');
        }
        h += kv('Planerad', hmOf(it.sched));
        if (it.est && !arrived && hmOf(it.est) !== hmOf(it.sched)) h += kv('Beräknad', hmOf(it.est));
        if (arrived) h += kv(r.kind === 'flyg' ? 'Landat' : 'Ankommit', hmOf(it.act));
        if (it.canceled) h += kv('Inställt', 'Ja, ' + (r.kind === 'flyg' ? 'flyget' : r.kind === 'bat' ? 'turen' : 'tåget') + ' är inställt', 'mb-info-bad');
        else if (it.removed) h += kv('Borttagen', 'Borttagen ur tidtabellen', 'mb-info-bad');
        else h += kv('Försening', late > 0 ? late + ' min sen' : late < 0 ? -late + ' min tidig' : 'I tid', late > 0 ? 'mb-info-warn' : '');
        if (r.kind === 'tag') h += kv('Spår', it.track && String(it.track).toLowerCase() !== 'x' ? String(it.track) : '');
        h += kv('Status', it.info);
        if (r.kind === 'flyg') {
          if (it.firstBag) h += kv('Första väskan', hmOf(it.firstBag)); else if (it.firstBagEst) h += kv('Väskor beräknas', hmOf(it.firstBagEst));
          if (it.lastBag) h += kv('Sista väskan', hmOf(it.lastBag));
          if (it.replacedBy) h += kv('Ersatt av', it.replacedBy);
        }
        if (r.kind === 'tag' && it.lastSeen && !arrived) h += kv('Senast sedd', it.lastSeen);
        var why = String(it.reasonInfo || it.reason || '').trim();
        if (why && why !== String(it.info || '').trim()) h += kv('Anmärkning', why);
      } else if (r.placeholder) {
        h += kv('Tur', r.route) + kv('Nästa gång', parts(r.at).key === parts(Date.now()).key ? 'i dag ' + hmOf(r.at) : dayLabel(parts(r.at).key) + ' ' + hmOf(r.at));
        h += '<p class="mb-info-note">Avgången syns här med riktiga tider när den finns i dagens tidtabell.</p>';
      } else {
        h += kv('Planerad', hmOf(r.sched || r.at)) + kv('Status', r.status);
        h += '<p class="mb-info-note">Inga aktuella tider just nu. Ankomster visar det senaste.</p>';
      }
      h += kv('Bevakning', watchText(r));
      if (!r.placeholder) link = '<button type="button" class="mb-info-link" data-mb-src="' + i + '">Visa i Ankomster ›</button>';
      if (canGear(r)) link += '<button type="button" class="mb-info-link" data-mb-gear="' + i + '">Tid och dagar ›</button>';
    } else if (r.kind === 'event') {
      var e = r.event || {};
      h += kv('Evenemang', e.title) + kv('Plats', e.venue) + kv('Stad', e.city_name || e.watch_city);
      h += kv('Startar', parts(r.at).key === parts(Date.now()).key ? hmOf(r.at) : dayLabel(parts(r.at).key) + ' ' + hmOf(r.at));
      if (e.ends_at) h += kv('Slutar', hmOf(e.ends_at) + (e.ends_estimated ? ' (ungefär)' : ''));
      if (e.category_name || e.category) h += kv('Typ', e.category_name || e.category);
      var subs = (e.subs || []).map(function (q) { var o = +q.offset || 0; return (q.kind === 'end' ? 'vid slut' : 'vid start') + (o ? ' ' + (o > 0 ? '+' : '−') + Math.abs(o) + ' min' : ''); });
      h += kv('Påminnelse', subs.join(', '));
      link = '<button type="button" class="mb-info-link" data-mb-src="' + i + '">Visa i Kalender ›</button>';
    } else if (r.kind === 'booking') {
      h += kv('Bokning', r.title) + kv('Tid', dayLabel(parts(r.at).key) + ' ' + hmOf(r.at)) + kv('Status', r.status, r.pending ? 'mb-info-warn' : '');
      link = '<button type="button" class="mb-info-link" data-mb-src="' + i + '">Öppna ärendet ›</button>';
    }
    if (r.kind !== 'booking' && (canHold(r) || canVillkor(r) || canRemove(r))) link += '<button type="button" class="mb-info-link" data-mb-info-more="' + i + '">⋯ Fler val</button>';
    return '<div class="mb-action-shade mb-info-shade" data-mb-info-shade><section class="mb-action-sheet mb-info" role="dialog" aria-modal="true" aria-labelledby="mb-info-h">' +
      '<div class="mb-info-head"><h3 id="mb-info-h">' + esc(head) + '</h3><button type="button" class="mb-info-x" data-mb-info-close aria-label="Stäng">✕</button></div>' +
      '<dl class="mb-info-dl">' + h + '</dl>' + (link ? '<div class="mb-info-links">' + link + '</div>' : '') + '</section></div>';
  }
  function closeInfo() {
    if (infoIndex === null) return false;
    var i = infoIndex; infoIndex = null; draw(lastErrors);
    var b = host && host.querySelector('[data-mb-open="' + i + '"]'); if (b) b.focus({ preventScroll: true });
    return true;
  }
  // Ljud och notiser (t1839u): EN hopfälld ruta för alla sorters bevakningar. Per sort: notis på den här
  // enheten (NOTIS_ENHET), ljud i appen (BEV_LJUD; för tåg även standardens Ljud på i TAG_VILLKOR) och Testa.
  // Samma lagring som förut (taxi_notis_enhet, taxi_bev_ljud, taxi_bev_villkor), så inga inställningar försvinner.
  var ljOpen = false;
  var LJ_KINDS = [
    { k: 'tag', ic: '🚆', n: 'Tåg', snd: true },
    { k: 'flyg', ic: '✈️', n: 'Flyg', snd: true },
    { k: 'bat', ic: '⛴️', n: 'Båt', snd: true },
    { k: 'prognos', ic: '🔮', n: 'Prognos', snd: false }
  ];
  function ljState() {
    var ne = window.NOTIS_ENHET && NOTIS_ENHET.read ? NOTIS_ENHET.read() : { tag: true, flyg: true, bat: true, prognos: true };
    var lj = window.BEV_LJUD && BEV_LJUD.read ? BEV_LJUD.read() : { on: true, tag: true, flyg: true, bat: true };
    var out = {};
    LJ_KINDS.forEach(function (x) {
      var snd = x.snd && lj.on && lj[x.k];
      if (x.k === 'tag' && window.TAG_VILLKOR && TAG_VILLKOR.get) { try { snd = snd && TAG_VILLKOR.get().tag.default.sound !== false; } catch (e) {} }
      out[x.k] = { notis: ne[x.k] !== false, ljud: !!snd };
    });
    return out;
  }
  function ljList(arr) { return arr.length === 0 ? 'inget' : arr.length === LJ_KINDS.length ? 'allt' : arr.join(', ').toLowerCase(); }
  function ljSummary(s) {
    var n = [], l = [];
    LJ_KINDS.forEach(function (x) { if (s[x.k].notis) n.push(x.n); if (x.snd && s[x.k].ljud) l.push(x.n); });
    return 'Notis: ' + ljList(n) + ' · Ljud: ' + (l.length === 3 ? 'tåg, flyg, båt' : l.length ? l.join(', ').toLowerCase() : 'av');
  }
  function renderLjud(box) {
    if (!box) return;
    var focus = false; try { focus = sessionStorage.getItem('tv_focus') === '1'; } catch (e) {}
    if (focus) ljOpen = true;   // länken "Specificera villkor" på Ankomster öppnar rutan
    var s = ljState();
    var h = '<div class="mb-lj-body"><p class="mb-lj-dim">' + esc(ljSummary(s)) + '. Gäller den här enheten. Notis = push till telefonen. Ljud = när appen är öppen.</p><div class="mb-lj-rows" role="group" aria-label="Per sort">';
    LJ_KINDS.forEach(function (x) {
      var v = s[x.k];
      h += '<div class="mb-lj-row"><span class="mb-lj-n">' + x.ic + ' ' + x.n + '</span>' +
        '<button type="button" class="mb-lj-pill" data-mb-lj-notis="' + x.k + '" aria-pressed="' + v.notis + '" aria-label="Notis för ' + x.n.toLowerCase() + '">Notis</button>' +
        (x.snd ? '<button type="button" class="mb-lj-pill" data-mb-lj-ljud="' + x.k + '" aria-pressed="' + v.ljud + '" aria-label="Ljud för ' + x.n.toLowerCase() + '">Ljud</button>' +
          '<button type="button" class="mb-lj-try" data-mb-lj-try="' + x.k + '" aria-label="Testa ljud för ' + x.n.toLowerCase() + '">▶ Testa</button>'
          : '<span class="mb-lj-na">utan ljud</span>') + '</div>';
    });
    h += '</div><div class="mb-lj-sub" id="mb-lj-tag"></div>' +
      '<p class="mb-lj-dim">✈️ Flyg: förvarning och försening ställs per flygbevakning under Ankomster › Flyg. 📅 Evenemang: påminnelsen du valt på evenemanget i Kalender. ◷ Bokade tider: notis när ärendet ändras.</p>' +
      '<div id="mb-notis-copy"></div></div>';
    box.innerHTML = h;
    var tbox = box.querySelector('#mb-lj-tag');
    if (tbox && window.TAG_VILLKOR && TAG_VILLKOR.renderPanel) TAG_VILLKOR.renderPanel(tbox, { title: 'Villkor för tåg', embedded: true });
    var cp = box.querySelector('#mb-notis-copy');
    if (cp && window.NOTIS_ENHET && NOTIS_ENHET.renderCopyButton) NOTIS_ENHET.renderCopyButton(cp);
    box.querySelectorAll('[data-mb-lj-notis]').forEach(function (b) { b.onclick = function () {
      var k = b.getAttribute('data-mb-lj-notis'), on = b.getAttribute('aria-pressed') !== 'true', patch = {}; patch[k] = on;
      if (window.NOTIS_ENHET && NOTIS_ENHET.set) NOTIS_ENHET.set(patch);
      renderLjud(box);
    }; });
    box.querySelectorAll('[data-mb-lj-ljud]').forEach(function (b) { b.onclick = function () {
      var k = b.getAttribute('data-mb-lj-ljud'), on = b.getAttribute('aria-pressed') !== 'true';
      if (window.BEV_LJUD && BEV_LJUD.write) {
        var cur = BEV_LJUD.read(); if (!cur.on) { cur.tag = cur.flyg = cur.bat = false; }
        cur[k] = on; cur.on = !!(cur.tag || cur.flyg || cur.bat); BEV_LJUD.write(cur);
        if (on && BEV_LJUD.unlock) BEV_LJUD.unlock();
      }
      // Tågljudet är samma som standardens Ljud på i tågvillkoren (sparas även hos servern), som förut.
      if (k === 'tag' && window.TAG_VILLKOR && TAG_VILLKOR.setDefault) TAG_VILLKOR.setDefault({ sound: on });
      if (window.NOTIS_ENHET && NOTIS_ENHET.saveSnapshot) NOTIS_ENHET.saveSnapshot();
      try { document.dispatchEvent(new CustomEvent('bev-ljud-change')); } catch (e) {}
      renderLjud(box);
    }; });
    box.querySelectorAll('[data-mb-lj-try]').forEach(function (b) { b.onclick = function () {
      if (window.BEV_LJUD) { if (BEV_LJUD.unlock) BEV_LJUD.unlock(); BEV_LJUD.play(b.getAttribute('data-mb-lj-try'), true); }
    }; });
  }

  function closeLjud() {
    if (!ljOpen) return false;
    ljOpen = false;
    try { sessionStorage.removeItem('tv_focus'); } catch (e) {}
    if (host && host.isConnected) draw(lastErrors);
    return true;
  }
  M.back = function () { return !!(host && host.isConnected && (closePick() || closeLjud() || closeInfo() || goBackUnit())); };

  function draw(errors, message) {
    if (!host || !host.isConnected) return;
    closePick();
    var oldScroll = host.querySelector('.mb-timeline-scroll'), scrollTop = oldScroll ? oldScroll.scrollTop : null, oldWk = host.querySelector('.mb-wk-scroll'), wkTop = oldWk ? oldWk.scrollTop : null;
    lastErrors = errors || [];
    try { if (sessionStorage.getItem('tv_focus') === '1') ljOpen = true; } catch (e) {}
    var h = '<div class="mb"><p class="mb-intro">Tryck på en bevakning i dagvyn för mer info. Håll fingret för att göra en tåg-, flyg- eller båtbevakning fast (guldstjärna).</p>';
    if (message) h += '<p role="status" class="mb-warning">' + esc(message) + '</p>';
    if (errors && errors.length) h += '<p role="status" class="mb-warning">Kunde inte hämta ' + esc(errors.join(', ')) + '. Listan kan vara ofullständig. Den uppdateras automatiskt.</p>';
    if (!rows.length) h += '<div class="mb-empty"><div>📌</div><h3>' + (errors && errors.length ? 'Inget att visa just nu' : 'Inga bevakningar än') + '</h3><p>Tryck ☆ på en ankomst under Ankomster för en tillfällig bevakning. I Kalender: öppna ett evenemang och välj en påminnelse.</p><button data-mb-source="ankomster">Öppna Ankomster</button><button data-mb-source="kalender">Öppna Kalender</button></div>';
    if (mode === 'dag') h += timelineHtml(); else if (mode === 'vecka') h += weekHtml(); else h += monthHtml();
    var day = '';
    (mode === 'list' ? rows : []).forEach(function (r, i) {
      var p = parts(r.at);
      if (p.key !== day) { h += '<h3 class="mb-day">' + esc(dayLabel(p.key)) + '</h3>'; day = p.key; }
      var star = r.permanent ? '<span class="mb-star gold" title="Fast bevakning">★</span>' : (r.watch ? '<span class="mb-star" title="Tillfällig bevakning">★</span>' : '');
      var extra = '';
      if (r.permanent && r.routeWatch) extra += '<small>Fast · ' + esc(daysText(r.routeWatch.days)) + ' ' + esc((window.BEVAKNING && BEVAKNING.hhmm) ? BEVAKNING.hhmm(r.routeWatch.sched_min) : '') + '</small>';
      else if (r.rules.length) extra += '<small>Äldre bevakning: ' + esc(r.rules.map(function (w) { return w.name; }).join(', ')) + '</small>';
      if (hasVillkor(r)) extra += '<small class="mb-own-villkor">🔔 Egna villkor för ljud och notis</small>';
      var tools = star + (canVillkor(r) ? '<button class="mb-villkor-btn" data-mb-villkor="' + i + '" aria-label="Ljud och notiser för ' + esc(r.title) + '">🔔</button>' : '') + (canGear(r) ? '<button class="mb-gear-btn" data-mb-gear="' + i + '" aria-label="Tid och dagar">⚙</button>' : '');
      var removeBtn = canRemove(r) ? '<button class="mb-remove" data-mb-remove="' + i + '"' + (busy ? ' disabled' : '') + ' aria-label="Sluta bevaka ' + esc(r.title) + '">Sluta bevaka</button>' : '';
      h += '<article class="mb-row' + (r.kind === 'booking' ? ' mb-row-booking' : '') + (r.pending ? ' pending' : '') + (r.permanent ? ' mb-row-perm' : '') + '" data-mb-row="' + i + '"><button class="mb-open" data-mb-open="' + i + '"><span class="mb-time">' + p.hm + '<small>' + icon(r) + '</small></span><span class="mb-text"><b>' + esc(r.title) + '</b>' + statusChip(r) + extra + '</span>' + tools + (r.placeholder ? '' : '<span aria-hidden="true">›</span>') + '</button>' + removeBtn + '</article>';
    });
    if (actionIndex !== null && rows[actionIndex]) {
      var ar = rows[actionIndex];
      h += '<div class="mb-action-shade"><section class="mb-action-sheet" role="dialog" aria-modal="true" aria-label="Bevakning"><b>' + esc(ar.title) + '</b>';
      if (canHold(ar)) h += '<button data-mb-perm="' + actionIndex + '">' + (ar.permanent ? 'Gör till tillfällig' : 'Gör till fast bevakning') + '</button>';
      if (canVillkor(ar)) h += '<button data-mb-villkor="' + actionIndex + '">Ljud och notiser för den här avgången</button>';
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
    if (infoIndex !== null && rows[infoIndex] && actionIndex === null && gearIndex === null) h += infoHtml(rows[infoIndex], infoIndex);
    if (ljOpen && actionIndex === null && gearIndex === null && infoIndex === null) {
      h += '<div class="mb-action-shade mb-lj-shade" data-mb-lj-shade><section class="mb-action-sheet mb-lj-sheet" role="dialog" aria-modal="true" aria-labelledby="mb-lj-h"><div class="mb-lj-bar"><h3 id="mb-lj-h">Ljud och notiser</h3><button type="button" data-mb-lj-close aria-label="Stäng">✕</button></div><div id="mb-ljud-box"></div></section></div>';
    }
    host.innerHTML = h + '<p class="mb-foot">Tillfälliga ankomster tas bort på Ankomster eller försvinner efter ankomst. Fasta görs tillfälliga med ett långt tryck här. Avslutade visas i högst 2 timmar. Kalender: kommande året i dina städer.</p></div>';
    var unitBtn = host.querySelector('[data-mb-unit]');
    if (unitBtn) unitBtn.onclick = function () {
      mode = UNITS[(UNITS.indexOf(mode) + 1) % 3]; returnTo = null; try { localStorage.setItem('taxi_mb_view', mode); } catch (e) {}
      autoPosition = true; actionIndex = null; infoIndex = null; draw(errors);
      var nb = host.querySelector('[data-mb-unit]'); if (nb) nb.focus({ preventScroll: true });
    };
    host.querySelectorAll('[data-mb-goday]').forEach(function (b) { b.onclick = function () { goDay(b.dataset.mbGoday); }; });
    var backUnit = host.querySelector('[data-mb-backunit]'); if (backUnit) backUnit.onclick = goBackUnit;
    host.querySelectorAll('[data-mb-day], [data-mb-step]').forEach(function (b) { b.onclick = function () {
      selectedDay = b.dataset.mbDay || stepKey(selectedDay, +b.dataset.mbStep); autoPosition = true; actionIndex = null; draw(errors);
    }; });
    var pickBtn = host.querySelector('[data-mb-pick]'); if (pickBtn) pickBtn.onclick = openPick;
    var todayBtn = host.querySelector('[data-mb-today]'); if (todayBtn) todayBtn.onclick = function () {
      selectedDay = parts(Date.now()).key; autoPosition = true; actionIndex = null; infoIndex = null; draw(errors);
    };
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
    var wk = host.querySelector('.mb-wk-scroll');
    if (wk) wk.scrollTop = wkTop !== null && !autoPosition ? wkTop : Math.max(0, (minute(Date.now()) - 120) * PXW);
    if (mode !== 'dag') autoPosition = false;
    host.querySelectorAll('[data-mb-source]').forEach(function (b) { b.onclick = function () { window.openItem(b.dataset.mbSource); }; });
    host.querySelectorAll('[data-mb-open]').forEach(function (b) { b.onclick = function () { infoIndex = +b.dataset.mbOpen; actionIndex = null; gearIndex = null; draw(errors); var x = host.querySelector('[data-mb-info-close]'); if (x) x.focus({ preventScroll: true }); }; });
    var infoShade = host.querySelector('[data-mb-info-shade]');
    if (infoShade) {
      infoShade.onclick = function (e) { if (e.target === infoShade) closeInfo(); };   // tryck utanför rutan
      infoShade.querySelector('[data-mb-info-close]').onclick = closeInfo;
      infoShade.querySelectorAll('[data-mb-info-more]').forEach(function (b) { b.onclick = function () { actionIndex = +b.dataset.mbInfoMore; infoIndex = null; draw(errors); var c = host.querySelector('[data-mb-cancel]'); if (c) c.focus(); }; });
      infoShade.querySelectorAll('[data-mb-src]').forEach(function (b) { b.onclick = function () { var r = rows[+b.dataset.mbSrc]; infoIndex = null; draw(errors); M.open(r); }; });
    }
    host.querySelectorAll('[data-mb-remove]').forEach(function (b) { b.onclick = function () {
      if (busy) return;
      var r = rows[+b.dataset.mbRemove], g = generation;
      if (!canRemove(r)) return;
      var verb = r.kind === 'flyg' ? 'Flyget' : r.kind === 'bat' ? 'Båten' : 'Tåget';
      // Tillfällig stjärna tas bort ensam. En äldre regel stängs bara när det inte finns en tillfällig bevakning.
      var text = r.watch ? 'Sluta bevaka ' + r.title + '?'
        : (r.rules.length ? verb + ' ingår i en äldre bevakning. Stänga av hela bevakningen (' + r.rules.map(function (w) { return w.name; }).join(', ') + ')?' : 'Sluta bevaka ' + r.title + '?');
      if (!window.confirm(text)) return;
      busy = true; actionIndex = null; gearIndex = null; draw(errors);
      remove(r).then(function () { if (g === generation) refresh(); }).catch(function () { busy = false; if (g === generation) draw(errors, 'Kunde inte ta bort allt. Uppdatera och försök igen.'); }).finally(function () { busy = false; });
    }; });
    host.querySelectorAll('[data-mb-gear]').forEach(function (b) { b.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      gearIndex = +b.dataset.mbGear; actionIndex = null; infoIndex = null; draw(errors);
    }; });
    host.querySelectorAll('[data-mb-villkor]').forEach(function (b) { b.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      var r = rows[+b.dataset.mbVillkor];
      if (actionIndex !== null) { actionIndex = null; draw(errors); }
      openVillkor(r);
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
    var ljBtn = host.querySelector('[data-mb-lj-open]');
    if (ljBtn) ljBtn.onclick = function () { ljOpen = true; infoIndex = null; actionIndex = null; closePick(); draw(errors); };
    var ljShade = host.querySelector('[data-mb-lj-shade]');
    if (ljShade) {
      ljShade.onclick = function (e) { if (e.target === ljShade) closeLjud(); };
      ljShade.querySelector('[data-mb-lj-close]').onclick = closeLjud;
    }
    if (ljOpen) renderLjud(host.querySelector('#mb-ljud-box'));
    bindHold(host, errors);
  }
  function bindHold(el, errors) {
    if (el._mbhold) return; el._mbhold = true;
    var timer = null, sx = 0, sy = 0, fired = false, idx = -1;
    function clear() { clearTimeout(timer); timer = null; }
    el.addEventListener('pointerdown', function (e) {
      var row = e.target.closest('[data-mb-row]');
      if (!row || e.target.closest('.mb-gear-btn, .mb-villkor-btn, .mb-remove, .mb-action-shade') || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
      var infoId = infoIndex !== null && rows[infoIndex] ? rows[infoIndex].id : null;
      rows = d.rows;
      if (infoId) { infoIndex = rows.findIndex(function (r) { return r.id === infoId; }); if (infoIndex < 0) infoIndex = null; }
      if (actionId) { actionIndex = rows.findIndex(function (r) { return r.id === actionId; }); if (actionIndex < 0) actionIndex = null; }
      draw(d.errors);
    }).catch(function () { if (g === generation) { rows = []; draw(['bevakningar']); } });
  }
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('keydown', function (e) { if (e.key !== 'Escape' || !host || !host.isConnected) return; if (closePick()) return; if (closeLjud()) return; if (infoIndex !== null) closeInfo(); });
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('tag-villkor-change', function () { if (host && host.isConnected && actionIndex === null && gearIndex === null && infoIndex === null) draw(lastErrors); });
  M.stop = function () { generation++; clearInterval(timer); timer = null; host = null; rows = []; busy = false; actionIndex = null; gearIndex = null; infoIndex = null; ljOpen = false; closePick(); };
  M.render = function (el) {
    M.stop(); selectedDay = (window.VIEW_STATE&&VIEW_STATE.get('mina-bevakningar',{}).day)||parts(Date.now()).key; mode = (function (v) { return UNITS.indexOf(v) >= 0 ? v : 'dag'; })(localStorage.getItem('taxi_mb_view')); returnTo = null; autoPosition = true; actionIndex = null; host = el; el.innerHTML = '<div class="mb"><p role="status">Laddar dina bevakningar…</p></div>'; refresh();
    timer = setInterval(function () { if (!host || !host.isConnected) M.stop(); else if (!document.hidden && !busy && actionIndex === null) refresh(); }, 60000);
  };
  // Ren logik för tester med syntetiska data.
  M.villkorTarget = villkorTarget;
  M.normalize = normalize; M.inWindow = inWindow; M.timelineLayout = timelineLayout; M.daySegments = daySegments;

 if(window.VIEW_STATE)VIEW_STATE.bind('mina-bevakningar',function(){return {day:selectedDay};});

})();
