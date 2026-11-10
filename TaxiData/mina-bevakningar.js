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
  function arrival(w, it, rules) {
    var s = w ? w.state || {} : {}, at = +(it && (it.act || it.est || it.sched)) || Date.parse(s.est || (w && w.sched));
    var kind = w ? w.kind : (it && String(it.key || '').charAt(0) === 'f' ? 'flyg' : 'tag'), key = it ? it.key : (kind === 'flyg' ? 'f' : 't') + w.ident + '|' + w.sched;
    var info = [];
    if ((it && it.canceled) || s.canceled) info.push('Inställt');
    if (it && it.removed) info.push('Borttagen');
    var sched = it ? +it.sched : Date.parse(w.sched), late = Math.round((at - sched) / 60000);
    if (late > 0 && !(it && it.act)) info.push(late + ' min sen');
    if (it && it.info) info.push(it.info);
    else if (s.lastBag) info.push('Sista bagage ute');
    else if (s.firstBag) info.push('Bagaget rullar');
    else if (s.landed) info.push('Landat');
    else if (s.arrived) info.push('Ankommit');
    return { id: key, key: key, kind: kind, at: at, end: at,
      title: (it ? it.no : (kind === 'flyg' ? 'Flyg ' : 'Tåg ') + w.ident) + ' · ' + ((it && it.from) || (w && w.label) || 'Okänd startplats'),
      status: info.join(' · '), watch: w || null, rules: rules || [] };
  }
  function normalize(watches, rules, trains, flights, events, now, flightRules) {
    flightRules = flightRules || [];
    var out = [], used = {};
    watches.forEach(function (w) {
      if (Date.parse(w.expires_at) <= now) return;
      var list = w.kind === 'flyg' ? flights : trains;
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
      safe(rpc('flight_watch_list', {}), 'flygbevakningar', [])
    ]).then(function (data) {
      if (session !== token()) throw new Error('session');
      var bookings = (data[5] || []).map(function (b) { return { id: 'booking-' + b.id, kind: 'booking', thread_id: b.thread_id, at: Date.parse(b.at), end: Date.parse(b.at), title: b.title, status: b.status === 'accepted' ? 'Bokad tid · Godkänd' : 'Bokad tid · Väntar på ' + (b.status === 'pending_admin' ? 'admin' : 'ditt svar'), pending: b.status !== 'accepted', rules: [] }; });
      return { rows: normalize(data[0], data[1], data[2], data[3], data[4], Date.now(), data[6]).concat(bookings).sort(function (a,b) { return a.at-b.at; }), errors: errors };
    });
  };
  M.open = function (r) {
    if (r.kind === 'booking') INKORG.openThread(r.thread_id);
    else if (r.kind === 'event') KALENDER.openEvent(r.event.id, r.event.starts_at, r.event.watch_city);
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
  var PX = 1.5, selectedDay = null, mode = 'timeline', autoPosition = true, actionIndex = null;
  function minute(at) { var hm = parts(at).hm; return +hm.slice(0, 2) * 60 + +hm.slice(3); }
  function icon(r) { return r.kind === 'booking' ? '◷' : r.kind === 'event' ? '📅' : r.kind === 'flyg' ? '✈️' : '🚆'; }
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
      h += '<article class="mb-block mb-block-' + r.kind + (r.pending ? ' pending' : '') + '" data-mb-block="' + x.index + '" data-column="' + x.column + '" data-columns="' + x.columns + '" style="top:' + (x.from * PX) + 'px;height:' + ((x.to - x.from) * PX - 3) + 'px;left:calc(46px + (100% - 48px) * ' + x.column / x.columns + ');width:calc((100% - 48px) / ' + x.columns + ' - 4px)"><button class="mb-block-open" data-mb-open="' + x.index + '" aria-label="' + esc(times + ' ' + r.title + ' ' + r.status) + '"><small>' + icon(r) + ' ' + times + (x.continues ? ' ↔' : '') + '</small><b>' + esc(r.title) + '</b>' + (x.to - x.from >= 55 ? '<span>' + esc(r.status || 'Bevakas') + '</span>' : '') + '</button>' + (r.kind === 'booking' ? '' : '<button class="mb-block-menu" data-mb-menu="' + x.index + '" aria-label="Fler val för ' + esc(r.title) + '" aria-haspopup="dialog">⋯</button>') + '</article>';
    });
    if (selectedDay === parts(Date.now()).key) h += '<div class="mb-now" style="top:' + minute(Date.now()) * PX + 'px"><span>nu ' + parts(Date.now()).hm + '</span></div>';
    return h + '</div></div><p class="mb-timeline-note">Tåg, flyg och bokade tider är korta markörer, inte arbetspass. Grå bokningar väntar på svar. Kalenderblock visar tiden från start till slut. Ledigt räknas mellan de ritade blocken.</p>';
  }

  function draw(errors, message) {
    if (!host || !host.isConnected) return;
    var oldScroll = host.querySelector('.mb-timeline-scroll'), scrollTop = oldScroll ? oldScroll.scrollTop : null;
    var h = '<div class="mb"><div class="mb-view-toggle" role="group" aria-label="Visning"><button data-mb-view="timeline" aria-pressed="' + (mode === 'timeline') + '">Tidslinje</button><button data-mb-view="list" aria-pressed="' + (mode === 'list') + '">Lista</button></div><p class="mb-intro">Dina ankomster, kalenderhändelser och bokade tider, i tidsordning.</p><button type="button" class="mb-refresh" data-mb-refresh>↻ Uppdatera</button>';
    if (message) h += '<p role="status" class="mb-warning">' + esc(message) + '</p>';
    if (errors && errors.length) h += '<p role="status" class="mb-warning">Kunde inte hämta ' + esc(errors.join(', ')) + '. Listan kan vara ofullständig. Försök igen med Uppdatera.</p>';
    if (!rows.length) h += '<div class="mb-empty"><div>📌</div><h3>' + (errors && errors.length ? 'Inget att visa just nu' : 'Inga bevakningar än') + '</h3><p>Bevaka ett flyg med ☆ eller håll fingret på ett tåg under Ankomster. Du kan också lägga till en bevakning under Ankomster › Tåg eller Ankomster › Flyg. I Kalender: öppna ett evenemang och välj en påminnelse.</p><button data-mb-source="ankomster">Öppna Ankomster</button><button data-mb-source="kalender">Öppna Kalender</button></div>';
    if (mode === 'timeline') h += timelineHtml();
    var day = '';
    (mode === 'list' ? rows : []).forEach(function (r, i) {
      var p = parts(r.at);
      if (p.key !== day) { h += '<h3 class="mb-day">' + esc(dayLabel(p.key)) + '</h3>'; day = p.key; }
      h += '<article class="mb-row' + (r.kind === 'booking' ? ' mb-row-booking' : '') + (r.pending ? ' pending' : '') + '"><button class="mb-open" data-mb-open="' + i + '"><span class="mb-time">' + p.hm + '<small>' + icon(r) + '</small></span><span class="mb-text"><b>' + esc(r.title) + '</b><small>' + esc(r.status || 'Bevakas') + '</small>' + (r.rules.length ? '<small>Bevakning (' + (r.kind === 'flyg' ? 'flyg' : 'tåg') + '): ' + esc(r.rules.map(function (w) { return w.name; }).join(', ')) + '</small>' : '') + '</span><span aria-hidden="true">›</span></button>' + (r.kind === 'booking' ? '' : '<button class="mb-remove" data-mb-remove="' + i + '"' + (busy ? ' disabled' : '') + ' aria-label="Sluta bevaka ' + esc(r.title) + '">Sluta bevaka</button>') + '</article>';
    });
    if (actionIndex !== null && rows[actionIndex]) h += '<div class="mb-action-shade"><section class="mb-action-sheet" role="dialog" aria-modal="true" aria-label="Bevakning"><b>' + esc(rows[actionIndex].title) + '</b><button data-mb-remove="' + actionIndex + '">Sluta bevaka</button><button data-mb-cancel>Avbryt</button></section></div>';
    host.innerHTML = h + '<p class="mb-foot">Avslutade visas i högst 2 timmar. Ankomster kan tas bort tidigare av notistjänsten. Kalender: kommande året i dina städer. Bevakningar visar tåg och flyg som finns i tidtabellen.</p></div>';
    host.querySelectorAll('[data-mb-view]').forEach(function (b) { b.onclick = function () {
      mode = b.dataset.mbView; localStorage.setItem('taxi_mb_view', mode); autoPosition = true; actionIndex = null; draw(errors);
    }; });
    host.querySelectorAll('[data-mb-day], [data-mb-step]').forEach(function (b) { b.onclick = function () {
      selectedDay = b.dataset.mbDay || addDay(selectedDay, +b.dataset.mbStep); autoPosition = true; actionIndex = null; draw(errors);
    }; });
    host.querySelectorAll('[data-mb-menu]').forEach(function (b) { b.onclick = function () { actionIndex = +b.dataset.mbMenu; draw(errors); host.querySelector('[data-mb-cancel]').focus(); }; });
    var cancel = host.querySelector('[data-mb-cancel]'); if (cancel) cancel.onclick = function () { var i = actionIndex; actionIndex = null; draw(errors); var b = host.querySelector('[data-mb-menu="' + i + '"]'); if (b) b.focus({ preventScroll: true }); };
    var sheet = host.querySelector('.mb-action-sheet'); if (sheet) sheet.onkeydown = function (e) {
      if (e.key === 'Escape') cancel.click();
      if (e.key === 'Tab') { var buttons = sheet.querySelectorAll('button'); e.preventDefault(); (document.activeElement === buttons[0] ? buttons[1] : buttons[0]).focus(); }
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
      var verb = r.kind === 'flyg' ? 'Flyget' : 'Tåget', obj = r.kind === 'flyg' ? 'flyget' : 'tåget';
      var text = r.rules.length ? verb + ' ingår i en bevakning. Stänga av hela bevakningen (' + r.rules.map(function (w) { return w.name; }).join(', ') + ') och sluta bevaka ' + obj + '?' : 'Sluta bevaka ' + r.title + '?';
      if (!window.confirm(text)) return;
      busy = true; actionIndex = null; draw(errors);
      remove(r).then(function () { if (g === generation) refresh(); }).catch(function () { busy = false; if (g === generation) draw(errors, 'Kunde inte ta bort allt. Uppdatera och försök igen.'); }).finally(function () { busy = false; });
    }; });
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
  M.stop = function () { generation++; clearInterval(timer); timer = null; host = null; rows = []; busy = false; };
  M.render = function (el) {
    M.stop(); selectedDay = (window.VIEW_STATE&&VIEW_STATE.get('mina-bevakningar',{}).day)||parts(Date.now()).key; mode = localStorage.getItem('taxi_mb_view') === 'list' ? 'list' : 'timeline'; autoPosition = true; actionIndex = null; host = el; el.innerHTML = '<div class="mb"><p role="status">Laddar dina bevakningar…</p></div>'; refresh();
    timer = setInterval(function () { if (!host || !host.isConnected) M.stop(); else if (!document.hidden && !busy && actionIndex === null) refresh(); }, 60000);
  };
  // Ren logik för tester med syntetiska data.
  M.normalize = normalize; M.inWindow = inWindow; M.timelineLayout = timelineLayout; M.daySegments = daySegments;

 if(window.VIEW_STATE)VIEW_STATE.bind('mina-bevakningar',function(){return {day:selectedDay};});

})();
