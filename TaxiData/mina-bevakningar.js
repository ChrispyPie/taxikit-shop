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
    var s = w ? w.state || {} : {}, at = +(it && (it.act || it.est || it.sched)) || Date.parse(s.est || w.sched);
    var kind = w ? w.kind : 'tag', key = it ? it.key : (kind === 'flyg' ? 'f' : 't') + w.ident + '|' + w.sched;
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
  function normalize(watches, rules, trains, flights, events, now) {
    var out = [], used = {};
    watches.forEach(function (w) {
      if (Date.parse(w.expires_at) <= now) return;
      var list = w.kind === 'flyg' ? flights : trains;
      var it = list.find(function (x) { return x.key.charAt(0) === (w.kind === 'flyg' ? 'f' : 't') && x.key.split('|')[0].slice(1) === String(w.ident) && Math.abs(+x.sched - Date.parse(w.sched)) < 60000; });
      var r = arrival(w, it);
      // Regeln visas också, så Sluta bevaka kan förklara om tåget har flera källor.
      if (it && w.kind === 'tag') r.rules = rules.filter(function (q) { return q.enabled && TAGNOTIS.matches(q, it) && inWindow(q, r.at); });
      out.push(r); used[r.key] = true;
    });
    trains.forEach(function (it) {
      if (used[it.key]) return;
      var at = +(it.act || it.est || it.sched);
      var matches = rules.filter(function (w) { return w.enabled && TAGNOTIS.matches(w, it) && inWindow(w, at); });
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
      safe(rpc('train_watch_list', {}), 'tågnotiser', []),
      safe(ANKOMSTER.watchItems('tag'), 'tågtider', []),
      safe(ANKOMSTER.watchItems('flyg'), 'flygtider', []),
      onlyTransport ? Promise.resolve([]) : safe(calendarEvents(errors), 'kalendern', [])
    ]).then(function (data) {
      if (session !== token()) throw new Error('session');
      return { rows: normalize(data[0], data[1], data[2], data[3], data[4], Date.now()), errors: errors };
    });
  };
  M.open = function (r) {
    if (r.kind === 'event') KALENDER.openEvent(r.event.id, r.event.starts_at, r.event.watch_city);
    else ANKOMSTER.openWatch(r.key);
  };
  function remove(r) {
    var session = token();
    // Ta bara bort den egna bevakningen, aldrig själva kalenderhändelsen/tidtabellsraden.
    var work = [];
    if (r.watch) work.push(rpc('watch_set', { p_kind: r.watch.kind, p_ident: r.watch.ident, p_sched: r.watch.sched, p_on: false, p_label: null, p_sub: null, p_state: {} }));
    if (r.kind === 'event') (r.event.subs || []).forEach(function (s) {
      work.push(rpc('set_event_subscription', { p_event_id: r.event.id, p_on: false, p_kind: s.kind, p_offset_min: s.offset, p_channel: s.channel || 'inapp' }));
    });
    (r.rules || []).forEach(function (w) { work.push(rpc('train_watch_save', { p_id: w.id, p_data: Object.assign({}, w, { enabled: false }) })); });
    return Promise.all(work).then(function () {
      if (session !== token()) return;
      if (window.BEVAKNING) BEVAKNING._state.loadedAt = 0;
      if (window.TAGNOTIS) TAGNOTIS._state.list = null;
    });
  }
  function draw(errors, message) {
    if (!host || !host.isConnected) return;
    var h = '<div class="mb"><p class="mb-intro">Ditt flöde från Ankomster och Kalender, i tidsordning.</p><button type="button" class="mb-refresh" data-mb-refresh>↻ Uppdatera</button>';
    if (message) h += '<p role="status" class="mb-warning">' + esc(message) + '</p>';
    if (errors && errors.length) h += '<p role="status" class="mb-warning">Kunde inte hämta ' + esc(errors.join(', ')) + '. Listan kan vara ofullständig. Försök igen med Uppdatera.</p>';
    if (!rows.length) h += '<div class="mb-empty"><div>📌</div><h3>' + (errors && errors.length ? 'Inget att visa just nu' : 'Inga bevakningar än') + '</h3><p>Bevaka ett flyg med ☆ eller håll fingret på ett tåg under Ankomster. I Kalender: öppna ett evenemang och välj en påminnelse.</p><button data-mb-source="ankomster">Öppna Ankomster</button><button data-mb-source="kalender">Öppna Kalender</button></div>';
    var day = '';
    rows.forEach(function (r, i) {
      var p = parts(r.at);
      if (p.key !== day) { h += '<h3 class="mb-day">' + esc(dayLabel(p.key)) + '</h3>'; day = p.key; }
      h += '<article class="mb-row"><button class="mb-open" data-mb-open="' + i + '"><span class="mb-time">' + p.hm + '<small>' + (r.kind === 'event' ? '📅' : r.kind === 'flyg' ? '✈️' : '🚆') + '</small></span><span class="mb-text"><b>' + esc(r.title) + '</b><small>' + esc(r.status || 'Bevakas') + '</small>' + (r.rules.length ? '<small>Tågnotis: ' + esc(r.rules.map(function (w) { return w.name; }).join(', ')) + '</small>' : '') + '</span><span aria-hidden="true">›</span></button><button class="mb-remove" data-mb-remove="' + i + '"' + (busy ? ' disabled' : '') + ' aria-label="Sluta bevaka ' + esc(r.title) + '">Sluta bevaka</button></article>';
    });
    host.innerHTML = h + '<p class="mb-foot">Avslutade visas i högst 2 timmar. Ankomster kan tas bort tidigare av notistjänsten. Kalender: kommande året i dina städer. Tågnotiser visar tågen som finns i tidtabellen.</p></div>';
    host.querySelector('[data-mb-refresh]').onclick = refresh;
    host.querySelectorAll('[data-mb-source]').forEach(function (b) { b.onclick = function () { window.openItem(b.dataset.mbSource); }; });
    host.querySelectorAll('[data-mb-open]').forEach(function (b) { b.onclick = function () { M.open(rows[+b.dataset.mbOpen]); }; });
    host.querySelectorAll('[data-mb-remove]').forEach(function (b) { b.onclick = function () {
      if (busy) return;
      var r = rows[+b.dataset.mbRemove], g = generation;
      var text = r.rules.length ? 'Tåget ingår i en tågnotis. Stänga av hela tågnotisen (' + r.rules.map(function (w) { return w.name; }).join(', ') + ') och sluta bevaka tåget?' : 'Sluta bevaka ' + r.title + '?';
      if (!window.confirm(text)) return;
      busy = true; draw(errors);
      remove(r).then(function () { if (g === generation) refresh(); }).catch(function () { busy = false; if (g === generation) draw(errors, 'Kunde inte ta bort allt. Uppdatera och försök igen.'); }).finally(function () { busy = false; });
    }; });
  }
  function refresh() {
    var g = ++generation, session = token();
    M.load(false).then(function (d) {
      if (g !== generation || session !== token()) return;
      rows = d.rows; draw(d.errors);
    }).catch(function () { if (g === generation) { rows = []; draw(['bevakningar']); } });
  }
  M.stop = function () { generation++; clearInterval(timer); timer = null; host = null; rows = []; busy = false; };
  M.render = function (el) {
    M.stop(); host = el; el.innerHTML = '<div class="mb"><p role="status">Laddar dina bevakningar…</p></div>'; refresh();
    timer = setInterval(function () { if (!host || !host.isConnected) M.stop(); else if (!document.hidden && !busy) refresh(); }, 60000);
  };
  // Ren logik för tester med syntetiska data.
  M.normalize = normalize; M.inWindow = inWindow;
})();
