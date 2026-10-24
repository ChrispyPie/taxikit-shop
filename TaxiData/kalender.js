/* Kalender: evenemang (konserter, sport, mässor, teater …) för förare.
 *
 * Månad / vecka / dag + "Idag & ikväll" överst med tydlig sluttid.
 * Filter per typ (sparas per förare i localStorage).
 * Förare kan föreslå evenemang och kommentera. Förslag syns som "Förslag"
 * för det egna företaget tills admin/ägare godkänner.
 * Prenumerera = påminnelse (i appen, ev. e-post) före start eller slut.
 *
 * Stadsoberoende: servern skickar stad + tidszon. All visning av tid och
 * alla dagsgränser räknas i stadens tidszon, inte i telefonens.
 * Servern kontrollerar allt (get_events, suggest_event, add_event_comment …).
 */
(function () {
  'use strict';

  var K = window.KALENDER = { id: 'kalender', title: 'Kalender', icon: '📅' };
  var TYPES = [
    { id: 'konsert', label: 'Konsert', icon: '🎵' },
    { id: 'sport', label: 'Sport', icon: '🏟️' },
    { id: 'massa', label: 'Mässa', icon: '🏢' },
    { id: 'teater', label: 'Teater', icon: '🎭' },
    { id: 'ovrigt', label: 'Övrigt', icon: '✨' }
  ];
  var TYPE = {}; TYPES.forEach(function (t) { TYPE[t.id] = t; });
  var DEFAULT_FILTER = ['konsert', 'sport', 'massa', 'teater'];   // Övrigt (museer m.m.) av från början
  var REMINDERS = [
    { kind: 'before_start', offset: 0, label: 'När det börjar' },
    { kind: 'before_end', offset: 60, label: '1 h före slut' },
    { kind: 'before_end', offset: 30, label: '30 min före slut' },
    { kind: 'before_end', offset: 15, label: '15 min före slut' },
    { kind: 'before_end', offset: 0, label: 'Vid slut' }
  ];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  var MONL = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  var WD = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  var ERR = {
    invalid_title: 'Skriv ett namn på evenemanget (2–120 tecken).',
    invalid_category: 'Välj typ.',
    invalid_start: 'Starttiden är ogiltig.',
    invalid_end: 'Sluttiden måste vara efter starttiden (högst 3 dygn).',
    invalid_venue: 'Välj plats eller skriv var det är.',
    invalid_comment: 'Kommentaren får vara högst 500 tecken.',
    too_many_pending: 'Du har redan 10 förslag som väntar. Vänta tills de är granskade.',
    too_many_subscriptions: 'Du har redan 100 påminnelser.',
    too_late: 'Den tiden har redan passerat.',
    rate_limited: 'Du har skrivit många kommentarer. Vänta en stund.',
    not_found: 'Evenemanget finns inte längre.',
    forbidden: 'Du har inte behörighet att göra det.',
    unknown_city: 'Okänd stad.',
    invalid_range: 'Ogiltigt datumintervall.'
  };
  var st = {
    el: null, view: localStorage.getItem('taxi_kal_view') || 'dag', cur: null, data: null, today: null,
    err: null, busy: false, filter: null, open: null, comments: null, form: null, city: null, flash: ''
  };

  // ---------- hjälp ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return String(n).padStart(2, '0'); }
  function tz() { return (st.data && st.data.city && st.data.city.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone; }
  // Delar av en tidpunkt i stadens tidszon
  var fmtCache = {};
  function parts(iso) {
    var z = tz(), f = fmtCache[z] || (fmtCache[z] = new Intl.DateTimeFormat('sv-SE', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
    var o = {}; f.formatToParts(new Date(iso)).forEach(function (p) { o[p.type] = p.value; });
    return { key: o.year + '-' + o.month + '-' + o.day, hm: o.hour + ':' + o.minute };
  }
  // Dagnycklar "YYYY-MM-DD" räknas som UTC-datum => oberoende av telefonens tidszon
  function kd(key) { var a = key.split('-'); return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])); }
  function dk(d) { return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
  function addDays(key, n) { var d = kd(key); d.setUTCDate(d.getUTCDate() + n); return dk(d); }
  function addMonths(key, n) { var d = kd(key); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return dk(d); }
  function wd(key) { return kd(key).getUTCDay(); }
  function monday(key) { return addDays(key, -((wd(key) + 6) % 7)); }
  function todayKey() { return parts(new Date().toISOString()).key; }
  function dayLabel(key) { var d = kd(key); return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONL[d.getUTCMonth()]; }
  function isoWeek(key) {
    var d = kd(key); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d - y) / 864e5 + 1) / 7);
  }
  // Lokal tid (stadens) -> ISO med rätt offset, t.ex. 2026-10-24T19:30 i Europe/Stockholm
  function zonedIso(key, hh, mm) {
    var guess = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), hh, mm);
    for (var i = 0; i < 2; i++) {
      var p = parts(new Date(guess).toISOString()), a = p.key.split('-'), h = p.hm.split(':');
      var shown = Date.UTC(+a[0], +a[1] - 1, +a[2], +h[0], +h[1]);
      guess += Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), hh, mm) - shown;
    }
    return new Date(guess).toISOString();
  }

  function rpc(name, args) {
    if (window.KALENDER_MOCK) return window.KALENDER_MOCK(name, args);
    args.p_token = localStorage.getItem('taxi_session') || '';
    return fetch(TRIP_API_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': TRIP_API_KEY, 'Authorization': 'Bearer ' + TRIP_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.text().then(function (t) {
        var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var er = new Error((b && b.message) || ('HTTP ' + r.status)); er.code = b && b.code; throw er; }
        return b;
      });
    });
  }
  function errText(e) { return ERR[e && e.message] || 'Det gick inte. Försök igen.'; }
  function fail(e) { if (e && e.code === '28000') { location.reload(); return true; } return false; }

  // ---------- filter ----------
  function filterKey() { return 'taxi_kal_filter_' + ((st.data && st.data.me) || 'x'); }
  function loadFilter() {
    try { var f = JSON.parse(localStorage.getItem(filterKey())); if (Array.isArray(f)) return f; } catch (e) {}
    return DEFAULT_FILTER.slice();
  }
  function shown(e) { return st.filter.indexOf(e.category) >= 0 || (e.is_suggestion && (e.mine || st.data.can_approve)); }

  // ---------- data ----------
  function range() {
    var c = st.cur;
    if (st.view === 'manad') { var f = monday(c.slice(0, 8) + '01'); return [f, addDays(f, 41)]; }
    if (st.view === 'vecka') { var m = monday(c); return [m, addDays(m, 6)]; }
    return [c, c];
  }
  function load() {
    st.err = null;
    var r = range(), t = st.today || todayKey();
    var from = r[0] < t ? r[0] : t, to = r[1] > t ? r[1] : t;
    if ((kd(to) - kd(from)) / 864e5 > 62) { from = r[0]; to = r[1]; }
    var want = from + '|' + to + '|' + (st.city || '');
    st.want = want;
    return rpc('get_events', { p_from: from, p_to: to, p_city: st.city }).then(function (d) {
      if (st.want !== want) return;
      var first = !st.data;
      st.data = d; st.city = d.city.slug;
      if (first) { st.filter = loadFilter(); st.today = todayKey(); if (!st.cur) st.cur = st.today; }
      st.loaded = { from: from, to: to };
      if (st.open) st.open = byId(st.open.id) || st.open;
      draw();
      if (first && (range()[0] < from || range()[1] > to)) load();   // första gången: om dagens datum var gissning
    }).catch(function (e) {
      if (fail(e)) return;
      st.err = 'Kunde inte hämta kalendern. Försök igen.'; draw();
    });
  }
  function byId(id) { return ((st.data && st.data.events) || []).filter(function (e) { return e.id === id; })[0]; }
  function eventsOn(key) {
    return ((st.data && st.data.events) || []).filter(function (e) {
      if (!shown(e)) return false;
      var s = parts(e.starts_at).key, en = e.ends_at ? parts(e.ends_at).key : s;
      return s <= key && en >= key;
    });
  }

  K.render = function (content) {
    st.el = content; st.open = null; st.form = null; st.comments = null;
    st.today = null; st.cur = null; st.data = null;
    content.innerHTML = '<div id="kal-body"><div class="tl-msg">Laddar…</div></div>';
    st.cur = todayKey();
    load();
  };

  // ---------- rader ----------
  function endText(e) {
    if (e.time_unknown) return 'tid ej angiven';
    if (!e.ends_at) return '';
    var p = parts(e.ends_at), s = parts(e.starts_at);
    var day = p.key !== s.key ? dayLabel(p.key).toLowerCase() + ' ' : '';
    return 'slutar ' + (e.ends_estimated ? 'ca ' : '') + day + p.hm;
  }
  function badges(e) {
    var h = '';
    if (e.is_suggestion) h += '<span class="vk-chip ' + (e.status === 'rejected' ? 'rejected' : 'pending') + '">' + (e.status === 'rejected' ? 'Nekat' : 'Förslag') + '</span>';
    if (e.comment_count) h += '<span class="kal-cc">💬 ' + e.comment_count + '</span>';
    if (e.subs && e.subs.length) h += '<span class="kal-cc">🔔</span>';
    return h;
  }
  function row(e, opt) {
    var s = parts(e.starts_at), now = Date.now();
    var ended = e.ends_at && new Date(e.ends_at).getTime() < now;
    var t = TYPE[e.category] || TYPE.ovrigt;
    return '<button type="button" class="ank-row kal-row kal-' + e.category + (ended ? ' arrived' : '') + (e.is_suggestion ? ' kal-sugg' : '') + '" data-id="' + e.id + '">' +
      '<div class="ank-time"><div class="ank-new">' + (e.time_unknown ? '–' : s.hm) + '</div><div class="kal-ico">' + t.icon + '</div></div>' +
      '<div class="ank-main"><div class="ank-from">' + esc(e.title) + '</div>' +
      '<div class="ank-meta">' + esc(e.venue || 'Plats okänd') + (opt && opt.showDay ? ' · ' + esc(dayLabel(s.key)) : '') + '</div>' +
      (endText(e) ? '<div class="kal-end' + (e.ends_estimated ? ' est' : '') + '">' + esc(endText(e)) + '</div>' : '') +
      '</div><div class="ank-status">' + badges(e) + '</div></button>';
  }
  function ms(iso) { return new Date(iso).getTime(); }
  function sortByStart(a, b) { return (ms(a.starts_at) - ms(b.starts_at)) || (a.id - b.id); }

  // ---------- vyer ----------
  function tonightHtml() {
    var t = st.today, now = Date.now();
    var list = eventsOn(t).filter(function (e) {
      return parts(e.starts_at).key === t && !e.time_unknown && (!e.ends_at || new Date(e.ends_at).getTime() > now - 15 * 60000);
    }).sort(function (a, b) { return ms(a.ends_at || a.starts_at) - ms(b.ends_at || b.starts_at); });
    var h = '<div class="vk-card kal-tonight"><div class="kal-tt">' + (+parts(new Date().toISOString()).hm.slice(0, 2) >= 16 ? 'Ikväll' : 'Idag') +
      ' <span>· sorterat på sluttid</span></div>';
    if (!list.length) h += '<div class="kal-none">Inga evenemang kvar idag med valda typer.</div>';
    list.slice(0, 4).forEach(function (e) {
      var t2 = TYPE[e.category] || TYPE.ovrigt;
      h += '<button type="button" class="kal-trow" data-id="' + e.id + '"><span class="kal-tend' + (e.ends_estimated ? ' est' : '') + '">' +
        (e.ends_at ? (e.ends_estimated ? 'ca ' : '') + parts(e.ends_at).hm : '?') + '</span><span class="kal-tname">' + t2.icon + ' ' + esc(e.title) +
        '<small>' + esc(e.venue || '') + '</small></span></button>';
    });
    if (list.length > 4) h += '<button type="button" class="ank-more" id="kal-today-all">Visa alla ' + list.length + ' idag</button>';
    return h + '</div>';
  }
  function navLabel() {
    var c = st.cur;
    if (st.view === 'manad') { var d = kd(c); return MONL[d.getUTCMonth()].replace(/^./, function (x) { return x.toUpperCase(); }) + ' ' + d.getUTCFullYear(); }
    if (st.view === 'vecka') { var m = monday(c), s = addDays(m, 6); return 'v.' + isoWeek(m) + ' · ' + kd(m).getUTCDate() + '/' + (kd(m).getUTCMonth() + 1) + '–' + kd(s).getUTCDate() + '/' + (kd(s).getUTCMonth() + 1); }
    return c === st.today ? 'Idag' : dayLabel(c);
  }
  function monthHtml() {
    var c = st.cur, first = monday(c.slice(0, 8) + '01'), mon = c.slice(0, 7);
    var h = '<div class="kal-month">' + ['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'].map(function (x) { return '<div class="pm-wd">' + x + '</div>'; }).join('');
    for (var i = 0; i < 42; i++) {
      var k = addDays(first, i), evs = eventsOn(k), cls = 'kal-mday';
      if (k.slice(0, 7) !== mon) cls += ' out';
      if (k === st.today) cls += ' today';
      var counts = {}; evs.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });
      var dots = TYPES.filter(function (t) { return counts[t.id]; }).map(function (t) { return '<i class="kal-dot kal-' + t.id + '"></i>'; }).join('');
      h += '<button type="button" class="' + cls + '" data-k="' + k + '"><span class="kal-dn">' + kd(k).getUTCDate() + '</span>' +
        (evs.length ? '<span class="kal-n">' + evs.length + '</span><span class="kal-dots">' + dots + '</span>' : '') + '</button>';
      if (i === 34 && addDays(first, 35).slice(0, 7) !== mon) break;
    }
    return h + '</div><div class="tl-foot">Tryck på en dag för att se evenemangen.</div>';
  }
  function dayListHtml(k, withHead) {
    var evs = eventsOn(k).sort(sortByStart), h = '';
    if (withHead) h += '<div class="ank-day">' + esc(dayLabel(k)) + (k === st.today ? ' · idag' : '') + '</div>';
    if (!evs.length) return h + (withHead ? '<div class="kal-none sm">Inget.</div>' : '<div class="tl-msg">Inga evenemang den här dagen med valda typer.</div>');
    evs.forEach(function (e) { h += row(e); });
    return h;
  }
  function weekHtml() { var m = monday(st.cur), h = ''; for (var i = 0; i < 7; i++) h += dayListHtml(addDays(m, i), true); return h; }

  function chipsHtml() {
    return '<div class="ank-chips kal-chips">' + TYPES.map(function (t) {
      return '<button type="button" class="ank-chip kal-chip' + (st.filter.indexOf(t.id) >= 0 ? ' on' : '') + '" data-t="' + t.id + '"><i class="kal-dot kal-' + t.id + '"></i>' + t.label + '</button>';
    }).join('') + '</div>';
  }

  function draw() {
    var body = st.el && document.getElementById('kal-body'); if (!body) return;
    if (st.err) { body.innerHTML = '<div class="tl-msg err">' + esc(st.err) + '</div>'; return; }
    var d = st.data; if (!d) return;
    if (st.open) return drawDetail(body);
    if (st.form) return drawForm(body);
    var h = '';
    if (st.flash) h += '<div class="vk-flash">' + esc(st.flash) + '</div>';
    h += '<div class="kal-top"><span class="kal-city">📍 ' + (d.cities && d.cities.length > 1
      ? '<select id="kal-city">' + d.cities.map(function (c) { return '<option value="' + esc(c.slug) + '"' + (c.slug === d.city.slug ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>'
      : esc(d.city.name)) + '</span>' +
      '<button type="button" class="kal-bell" id="kal-bell" aria-label="Påminnelser">🔔' + (d.unread_notices ? '<b>' + d.unread_notices + '</b>' : '') + '</button></div>';
    h += tonightHtml();
    h += '<div class="tabs kal-tabs">' + [['dag', 'Dag'], ['vecka', 'Vecka'], ['manad', 'Månad']].map(function (v) {
      return '<button type="button" class="tab' + (st.view === v[0] ? ' active' : '') + '" data-v="' + v[0] + '">' + v[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="date-nav kal-nav"><button type="button" id="kal-prev" aria-label="Föregående">‹</button><span class="tl-date kal-date">' + esc(navLabel()) +
      '</span><button type="button" id="kal-next" aria-label="Nästa">›</button><button type="button" id="kal-pick" class="tl-period" aria-label="Välj datum">📅</button></div>';
    if (st.cur !== st.today) h += '<div class="kal-back"><button type="button" id="kal-today">Till idag</button></div>';
    h += chipsHtml();
    var r = range(), have = st.loaded && st.loaded.from <= r[0] && st.loaded.to >= r[1];
    if (!have) h += '<div class="tl-msg">Laddar…</div>';
    else if (st.view === 'manad') h += monthHtml();
    else if (st.view === 'vecka') h += weekHtml();
    else h += dayListHtml(st.cur, false);
    h += '<button type="button" id="kal-new" class="vk-new kal-new">＋ Föreslå evenemang</button>';
    h += '<div class="tl-foot">Sluttid med "ca" är uppskattad. Källor: goteborg.com, Got Event, Svenska Mässan och förarnas förslag.</div>';
    body.innerHTML = h;
    bindMain(body);
  }
  function go(key) { st.cur = key; draw(); var r = range(); if (!(st.loaded && st.loaded.from <= r[0] && st.loaded.to >= r[1])) load(); }
  function bindMain(body) {
    body.querySelectorAll('.kal-tabs .tab').forEach(function (b) {
      b.onclick = function () { st.view = b.dataset.v; localStorage.setItem('taxi_kal_view', st.view); go(st.cur); };
    });
    document.getElementById('kal-prev').onclick = function () { go(st.view === 'manad' ? addMonths(st.cur, -1) : addDays(st.cur, st.view === 'vecka' ? -7 : -1)); };
    document.getElementById('kal-next').onclick = function () { go(st.view === 'manad' ? addMonths(st.cur, 1) : addDays(st.cur, st.view === 'vecka' ? 7 : 1)); };
    document.getElementById('kal-pick').onclick = function () { openCal(st.cur, function (k) { go(k); }, 'Gå till datum'); };
    var tb = document.getElementById('kal-today'); if (tb) tb.onclick = function () { go(st.today); };
    var ta = document.getElementById('kal-today-all'); if (ta) ta.onclick = function () { st.view = 'dag'; localStorage.setItem('taxi_kal_view', 'dag'); go(st.today); };
    var cs = document.getElementById('kal-city'); if (cs) cs.onchange = function () { st.city = cs.value; st.data = null; st.loaded = null; load(); };
    document.getElementById('kal-bell').onclick = showNotices;
    document.getElementById('kal-new').onclick = function () { st.form = newForm(null); draw(); window.scrollTo(0, 0); };
    body.querySelectorAll('.kal-chip').forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.t, i = st.filter.indexOf(t);
        if (i >= 0) st.filter.splice(i, 1); else st.filter.push(t);
        localStorage.setItem(filterKey(), JSON.stringify(st.filter)); draw();
      };
    });
    body.querySelectorAll('.kal-mday').forEach(function (b) {
      b.onclick = function () { st.view = 'dag'; localStorage.setItem('taxi_kal_view', 'dag'); go(b.dataset.k); };
    });
    body.querySelectorAll('[data-id]').forEach(function (b) { b.onclick = function () { openEvent(+b.dataset.id); }; });
  }

  // ---------- detalj ----------
  function openEvent(id) {
    var e = byId(id); if (!e) return;
    st.open = e; st.comments = null; draw(); window.scrollTo(0, 0);
    rpc('get_event_comments', { p_event_id: id }).then(function (c) { if (st.open && st.open.id === id) { st.comments = c || []; draw(); } })
      .catch(function (er) { if (!fail(er)) { st.comments = []; draw(); } });
  }
  function hasSub(e, r) { return (e.subs || []).some(function (s) { return s.kind === r.kind && s.offset === r.offset; }); }
  function drawDetail(body) {
    var e = st.open, d = st.data, s = parts(e.starts_at), t = TYPE[e.category] || TYPE.ovrigt;
    var h = '<button type="button" class="kal-backlink" id="kal-close">‹ Tillbaka</button>';
    if (st.flash) h += '<div class="vk-flash">' + esc(st.flash) + '</div>';
    h += '<div class="vk-card kal-detail kal-' + e.category + '"><div class="vk-ihead"><span class="kal-dtitle">' + t.icon + ' ' + esc(e.title) + '</span>' + badges(e) + '</div>' +
      '<div class="vk-imeta">' + esc(dayLabel(s.key)) + (e.time_unknown ? ' · tid ej angiven' : ' · start ' + s.hm) + '</div>' +
      (endText(e) && !e.time_unknown ? '<div class="kal-bigend' + (e.ends_estimated ? ' est' : '') + '">' + esc(endText(e)) + (e.ends_estimated ? '<small>uppskattat</small>' : '') + '</div>' : '') +
      '<div class="vk-imeta">📍 ' + esc(e.venue || 'Plats okänd') + (e.address ? ', ' + esc(e.address) : '') +
      (e.lat && e.lon ? ' · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + e.lat + ',' + e.lon + '">Karta</a>' : '') + '</div>' +
      (e.pickup_note ? '<div class="vk-icom">🚕 ' + esc(e.pickup_note) + '</div>' : '') +
      (e.comment ? '<div class="vk-icom">💬 Förslag: ' + esc(e.comment) + '</div>' : '') +
      (e.decision_comment ? '<div class="vk-boss">Admin: ' + esc(e.decision_comment) + '</div>' : '') +
      (e.url ? '<div class="vk-imeta"><a target="_blank" rel="noopener" href="' + esc(e.url) + '">Mer info (' + esc(srcName(e.source)) + ')</a></div>' : '');
    if (e.is_suggestion && d.can_approve && e.status === 'pending') {
      h += '<div class="vk-iact"><button type="button" id="kal-approve" class="kal-ok">Godkänn</button><button type="button" id="kal-reject" class="vk-del">Neka</button></div>';
    }
    if (e.can_edit) h += '<div class="vk-iact"><button type="button" id="kal-edit">Ändra</button><button type="button" id="kal-del" class="vk-del">Ta bort</button></div>';
    h += '</div>';

    // påminnelser
    var future = new Date(e.ends_at || e.starts_at).getTime() > Date.now();
    h += '<div class="vk-card"><div class="vk-ftitle">🔔 Påminn mig</div>';
    if (!future) h += '<div class="kal-none sm">Evenemanget är slut.</div>';
    else {
      h += '<div class="kal-rem">' + REMINDERS.map(function (r, i) {
        var dis = e.time_unknown && r.kind === 'before_end';
        return '<button type="button" class="ank-chip kal-remc' + (hasSub(e, r) ? ' on' : '') + '" data-r="' + i + '"' + (dis ? ' disabled' : '') + '>' + r.label + '</button>';
      }).join('') + '</div>' +
        '<div class="vk-field kal-chan"><span class="vk-lbl">Hur?</span><select id="kal-chan"><option value="inapp">I appen</option><option value="email">I appen + e-post</option></select></div>' +
        (e.ends_estimated ? '<div class="tl-foot" style="text-align:left">Sluttiden är uppskattad – påminnelsen kan komma lite fel.</div>' : '');
    }
    h += '</div>';

    // kommentarer
    h += '<div class="vk-card"><div class="vk-ftitle">💬 Kommentarer från förare</div>';
    if (st.comments === null) h += '<div class="kal-none sm">Laddar…</div>';
    else if (!st.comments.length) h += '<div class="kal-none sm">Inga kommentarer än. Tipsa gärna, t.ex. "kö vid Korsvägen efteråt".</div>';
    else st.comments.forEach(function (c) {
      h += '<div class="kal-com"><div class="kal-cwho">' + esc(c.author) + ' · ' + esc(relTime(c.created_at)) +
        (c.can_delete ? ' <button type="button" class="kal-cdel" data-c="' + c.id + '" aria-label="Ta bort">✕</button>' : '') + '</div><div>' + esc(c.body) + '</div></div>';
    });
    h += '<div class="vk-field kal-cnew"><textarea id="kal-ctext" maxlength="500" rows="2" placeholder="Skriv en kommentar (syns bara för ditt företag)"></textarea></div>' +
      '<div class="pm-btns"><button type="button" id="kal-csend" class="primary"' + (st.busy ? ' disabled' : '') + '>Skicka kommentar</button></div></div>';
    body.innerHTML = h;

    document.getElementById('kal-close').onclick = function () { st.open = null; st.flash = ''; draw(); };
    body.querySelectorAll('.kal-remc').forEach(function (b) { b.onclick = function () { toggleSub(e, REMINDERS[+b.dataset.r]); }; });
    var ch = document.getElementById('kal-chan');
    if (ch) { var cur = (e.subs || [])[0]; ch.value = (cur && cur.channel) || localStorage.getItem('taxi_kal_chan') || 'inapp'; ch.onchange = function () { localStorage.setItem('taxi_kal_chan', ch.value); }; }
    document.getElementById('kal-csend').onclick = sendComment;
    body.querySelectorAll('.kal-cdel').forEach(function (b) { b.onclick = function () { delComment(+b.dataset.c); }; });
    var ap = document.getElementById('kal-approve'); if (ap) ap.onclick = function () { decide(e, true); };
    var rj = document.getElementById('kal-reject'); if (rj) rj.onclick = function () { decide(e, false); };
    var ed = document.getElementById('kal-edit'); if (ed) ed.onclick = function () { st.form = newForm(e); st.open = null; draw(); };
    var dl = document.getElementById('kal-del'); if (dl) dl.onclick = function () { delSuggestion(e); };
  }
  function srcName(s) { return { goteborg_com: 'goteborg.com', gotevent: 'Got Event', svenskamassan: 'Svenska Mässan', ticketmaster: 'Ticketmaster' }[s] || 'källa'; }
  function relTime(iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'nyss'; if (m < 60) return m + ' min sedan'; if (m < 1440) return Math.round(m / 60) + ' h sedan';
    var p = parts(iso); return dayLabel(p.key) + ' ' + p.hm;
  }
  function flash(t) { st.flash = t; setTimeout(function () { if (st.flash === t) { st.flash = ''; draw(); } }, 3500); }
  function toggleSub(e, r) {
    var on = !hasSub(e, r), ch = (document.getElementById('kal-chan') || {}).value || 'inapp';
    rpc('set_event_subscription', { p_event_id: e.id, p_on: on, p_kind: r.kind, p_offset_min: r.offset, p_channel: ch })
      .then(function (subs) { e.subs = subs || []; flash(on ? 'Påminnelse sparad: ' + r.label.toLowerCase() + '.' : 'Påminnelsen är borttagen.'); draw(); })
      .catch(function (er) { if (!fail(er)) alert(errText(er)); });
  }
  function sendComment() {
    var ta = document.getElementById('kal-ctext'), txt = (ta.value || '').trim(), e = st.open;
    if (!txt) return;
    st.busy = true;
    rpc('add_event_comment', { p_event_id: e.id, p_body: txt }).then(function () {
      st.busy = false; e.comment_count = (e.comment_count || 0) + 1; openEvent(e.id);
    }).catch(function (er) { st.busy = false; if (!fail(er)) alert(errText(er)); });
  }
  function delComment(id) {
    if (!confirm('Ta bort kommentaren?')) return;
    rpc('delete_event_comment', { p_comment_id: id }).then(function () {
      st.open.comment_count = Math.max(0, (st.open.comment_count || 1) - 1); openEvent(st.open.id);
    }).catch(function (er) { if (!fail(er)) alert(errText(er)); });
  }
  function decide(e, ok) {
    var c = ok ? '' : (prompt('Varför nekas förslaget? (valfritt)') || '');
    rpc('decide_event_suggestion', { p_id: e.id, p_approve: ok, p_comment: c || null }).then(function () {
      flash(ok ? 'Godkänt – syns nu som vanligt evenemang.' : 'Förslaget är nekat.'); st.open = null; load();
    }).catch(function (er) { if (!fail(er)) alert(errText(er)); });
  }
  function delSuggestion(e) {
    if (!confirm('Ta bort förslaget?')) return;
    rpc('delete_event_suggestion', { p_id: e.id }).then(function () { st.open = null; flash('Borttaget.'); load(); })
      .catch(function (er) { if (!fail(er)) alert(errText(er)); });
  }
  function showNotices() {
    rpc('get_my_event_notices', { p_mark_read: true }).then(function (list) {
      st.data.unread_notices = 0;
      var m = modal('kal-nmodal');
      m.querySelector('.pm-box').innerHTML = '<div class="pm-head" style="justify-content:center">🔔 Påminnelser</div>' +
        ((list || []).length ? list.map(function (n) {
          var p = parts(n.created_at);
          return '<div class="kal-com' + (n.read ? '' : ' unread') + '"><div class="kal-cwho">' + esc(dayLabel(p.key)) + ' ' + p.hm + '</div><div>' + esc(n.body) + '</div></div>';
        }).join('') : '<div class="kal-none">Inga påminnelser än. Öppna ett evenemang och tryck på en tid under "Påminn mig".</div>') +
        '<div class="pm-btns" style="margin-top:.7rem"><button type="button" class="primary" id="kal-nclose">Stäng</button></div>';
      m.classList.add('open');
      document.getElementById('kal-nclose').onclick = function () { m.classList.remove('open'); draw(); };
    }).catch(function (er) { if (!fail(er)) alert(errText(er)); });
  }

  // ---------- föreslå ----------
  function newForm(e) {
    if (e) {
      var s = parts(e.starts_at), en = e.ends_at ? parts(e.ends_at) : null;
      return { id: e.id, title: e.title, cat: e.category, venue: e.venue_id || '', venueText: e.venue_id ? '' : (e.venue || ''),
        day: s.key, sh: +s.hm.slice(0, 2), sm: +s.hm.slice(3), hasEnd: !!en, eh: en ? +en.hm.slice(0, 2) : 22, em: en ? +en.hm.slice(3) : 0,
        comment: e.comment || '', msg: '' };
    }
    return { id: null, title: '', cat: 'konsert', venue: '', venueText: '', day: st.cur || st.today, sh: 19, sm: 0, hasEnd: true, eh: 22, em: 0, comment: '', msg: '' };
  }
  function opts(n, sel, step) { var h = ''; for (var i = 0; i < n; i += (step || 1)) h += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + p2(i) + '</option>'; return h; }
  function drawForm(body) {
    var f = st.form, d = st.data, admin = d.can_approve;
    var h = '<button type="button" class="kal-backlink" id="kal-fclose">‹ Tillbaka</button><div class="vk-card vk-form"><div class="vk-ftitle">' +
      (f.id ? 'Ändra evenemang' : 'Föreslå evenemang') + '</div>' +
      '<div class="vk-field"><span class="vk-lbl">Vad händer?</span><input id="kal-ft" class="kal-input" maxlength="120" placeholder="T.ex. Julkonsert, Frölunda–Luleå" value="' + esc(f.title) + '"></div>' +
      '<div class="vk-field"><span class="vk-lbl">Typ</span><div class="ank-chips kal-chips">' + TYPES.map(function (t) {
        return '<button type="button" class="ank-chip kal-fcat' + (f.cat === t.id ? ' on' : '') + '" data-t="' + t.id + '">' + t.icon + ' ' + t.label + '</button>';
      }).join('') + '</div></div>' +
      '<div class="vk-field"><span class="vk-lbl">Plats</span><select id="kal-fv"><option value="">Annan plats…</option>' +
      (d.venues || []).map(function (v) { return '<option value="' + v.id + '"' + (+f.venue === v.id ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('') + '</select>' +
      (f.venue ? '' : '<input id="kal-fvt" class="kal-input" style="margin-top:.4rem" maxlength="120" placeholder="Skriv platsen" value="' + esc(f.venueText) + '">') + '</div>' +
      '<div class="vk-field"><span class="vk-lbl">Start</span><div class="vk-dt"><button type="button" class="vk-date" id="kal-fday">📅 ' + esc(dayLabel(f.day)) + '</button>' +
      '<select id="kal-fsh" aria-label="Start timme">' + opts(24, f.sh) + '</select><span class="vk-colon">:</span><select id="kal-fsm" aria-label="Start minut">' + opts(60, f.sm, 5) + '</select></div></div>' +
      '<div class="vk-field"><span class="vk-lbl">Slut <label class="kal-unk"><input type="checkbox" id="kal-fnoend"' + (f.hasEnd ? '' : ' checked') + '> vet ej</label></span>' +
      (f.hasEnd ? '<div class="vk-dt"><span class="kal-same">samma kväll / natt</span><select id="kal-feh" aria-label="Slut timme">' + opts(24, f.eh) + '</select><span class="vk-colon">:</span><select id="kal-fem" aria-label="Slut minut">' + opts(60, f.em, 5) + '</select></div>' : '') + '</div>' +
      '<div class="vk-field"><span class="vk-lbl">Kommentar (valfri)</span><textarea id="kal-fc" maxlength="500" rows="2" placeholder="T.ex. stor publik, insläpp 18:00">' + esc(f.comment) + '</textarea></div>' +
      (f.msg ? '<div class="vk-warn bad">' + esc(f.msg) + '</div>' : '') +
      '<div class="tl-foot" style="text-align:left">' + (admin ? 'Du är admin – evenemanget syns direkt för alla i företaget.' : 'Förslaget syns som "Förslag" för förarna i ditt företag tills admin/ägare godkänner.') + '</div>' +
      '<div class="pm-btns"><button type="button" id="kal-fcancel">Avbryt</button><button type="button" id="kal-fsave" class="primary"' + (st.busy ? ' disabled' : '') + '>' +
      (f.id ? 'Spara' : admin ? 'Lägg till' : 'Skicka förslag') + '</button></div></div>';
    body.innerHTML = h;
    function sync() {
      f.title = document.getElementById('kal-ft').value; f.comment = document.getElementById('kal-fc').value;
      var vt = document.getElementById('kal-fvt'); if (vt) f.venueText = vt.value;
    }
    document.getElementById('kal-fclose').onclick = document.getElementById('kal-fcancel').onclick = function () { st.form = null; draw(); };
    body.querySelectorAll('.kal-fcat').forEach(function (b) { b.onclick = function () { sync(); f.cat = b.dataset.t; draw(); }; });
    document.getElementById('kal-fv').onchange = function (ev) { sync(); f.venue = ev.target.value; draw(); };
    document.getElementById('kal-fday').onclick = function () { sync(); openCal(f.day, function (k) { f.day = k; draw(); }, 'Vilken dag?', true); };
    document.getElementById('kal-fsh').onchange = function (ev) { f.sh = +ev.target.value; };
    document.getElementById('kal-fsm').onchange = function (ev) { f.sm = +ev.target.value; };
    var eh = document.getElementById('kal-feh'); if (eh) eh.onchange = function (ev) { f.eh = +ev.target.value; };
    var em = document.getElementById('kal-fem'); if (em) em.onchange = function (ev) { f.em = +ev.target.value; };
    document.getElementById('kal-fnoend').onchange = function (ev) { sync(); f.hasEnd = !ev.target.checked; draw(); };
    document.getElementById('kal-fsave').onclick = function () { sync(); saveForm(); };
  }
  function saveForm() {
    var f = st.form;
    if (f.title.trim().length < 2) { f.msg = ERR.invalid_title; draw(); return; }
    if (!f.venue && f.venueText.trim().length < 2) { f.msg = ERR.invalid_venue; draw(); return; }
    var s = zonedIso(f.day, f.sh, f.sm), e = null;
    if (f.hasEnd) {
      // slut före start = efter midnatt
      var endDay = (f.eh * 60 + f.em) <= (f.sh * 60 + f.sm) ? addDays(f.day, 1) : f.day;
      e = zonedIso(endDay, f.eh, f.em);
    }
    st.busy = true; f.msg = ''; draw();
    rpc('suggest_event', { p_id: f.id, p_title: f.title.trim(), p_starts_at: s, p_ends_at: e, p_category: f.cat,
      p_venue_id: f.venue ? +f.venue : null, p_venue_name: f.venue ? null : f.venueText.trim(), p_comment: f.comment.trim() || null, p_city: st.city })
      .then(function () {
        st.busy = false; var wasEdit = !!f.id; st.form = null; st.cur = f.day; st.view = 'dag';
        if (st.filter.indexOf(f.cat) < 0) { st.filter.push(f.cat); localStorage.setItem(filterKey(), JSON.stringify(st.filter)); }
        flash(wasEdit ? 'Sparat.' : (st.data.can_approve ? 'Tillagt!' : 'Tack! Förslaget syns nu som "Förslag" tills admin godkänner.'));
        return load();
      }).catch(function (er) { st.busy = false; if (fail(er)) return; f.msg = errText(er); draw(); });
  }

  // ---------- datumväljare (samma utseende som Körpassdata/Verkstad) ----------
  function modal(id) {
    var m = document.getElementById(id);
    if (!m) { m = document.createElement('div'); m.id = id; m.className = 'pm-overlay'; m.innerHTML = '<div class="pm-box" role="dialog"></div>'; document.body.appendChild(m); m.onclick = function (ev) { if (ev.target === m) m.classList.remove('open'); }; }
    return m;
  }
  var cal = {};
  function openCal(key, done, hint, futureOnly) {
    var m = modal('kal-modal');
    cal = { m: key.slice(0, 8) + '01', pick: key, done: done, futureOnly: futureOnly };
    m.querySelector('.pm-box').innerHTML = '<div class="pm-head"><button type="button" id="kal-pm-prev" aria-label="Föregående månad">‹</button><span id="kal-pm-title"></span><button type="button" id="kal-pm-next" aria-label="Nästa månad">›</button></div>' +
      '<div class="pm-hint">' + esc(hint || '') + '</div><div class="pm-cal" id="kal-pm-cal"></div><div class="pm-sel" id="kal-pm-sel"></div>' +
      '<div class="pm-btns"><button type="button" id="kal-pm-cancel">Avbryt</button><button type="button" id="kal-pm-ok" class="primary">Välj</button></div>';
    document.getElementById('kal-pm-prev').onclick = function () { cal.m = addMonths(cal.m, -1); drawCal(); };
    document.getElementById('kal-pm-next').onclick = function () { cal.m = addMonths(cal.m, 1); drawCal(); };
    document.getElementById('kal-pm-cancel').onclick = function () { m.classList.remove('open'); };
    document.getElementById('kal-pm-ok').onclick = function () { m.classList.remove('open'); cal.done(cal.pick); };
    drawCal(); m.classList.add('open');
  }
  function drawCal() {
    var d = kd(cal.m), y = d.getUTCFullYear(), mo = d.getUTCMonth();
    document.getElementById('kal-pm-title').textContent = MON[mo] + ' ' + y;
    var h = ['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'].map(function (x) { return '<div class="pm-wd">' + x + '</div>'; }).join('');
    for (var i = 0; i < (wd(cal.m) + 6) % 7; i++) h += '<div></div>';
    var days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    for (var dd = 1; dd <= days; dd++) {
      var k = y + '-' + p2(mo + 1) + '-' + p2(dd), c = 'pm-day', dis = cal.futureOnly && k < addDays(st.today, -1);
      if (k === cal.pick) c += ' sel'; if (k === st.today) c += ' today'; if (dis) c += ' future';
      h += '<button type="button" class="' + c + '" data-k="' + k + '"' + (dis ? ' disabled' : '') + '>' + dd + '</button>';
    }
    var el = document.getElementById('kal-pm-cal'); el.innerHTML = h;
    el.querySelectorAll('.pm-day').forEach(function (b) { b.onclick = function () { cal.pick = b.dataset.k; drawCal(); }; });
    document.getElementById('kal-pm-sel').textContent = dayLabel(cal.pick);
  }
})();
