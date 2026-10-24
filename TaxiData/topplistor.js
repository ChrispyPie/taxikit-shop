/* Topplistor: anonymiserade topplistor för alla förare.
 *
 * Anonymiteten avgörs på servern (public.get_leaderboard): vanliga förare och S admin får bara
 * placering och värde, och den egna raden markerad "Du". Bara ägaren får namn och förar-id.
 * Appen visar det servern skickar – inga andra förares id finns i svaret.
 * Alla förare med pass i perioden räknas, även de utan konto i appen och avslutade förare.
 * Period: Dag / Vecka / Månad och egen period i kalendern, som i Körpassdata.
 */
(function () {
  'use strict';

  var T = window.TOPPLISTOR = { id: 'topplistor', title: 'Topplistor', icon: '🏆' };

  // Ordning och namn på listorna. Nycklarna kommer från servern.
  var LISTS = [
    { k: 'inkort', t: 'Mest inkört', f: 'kr' },
    { k: 'dricks', t: 'Mest dricks', f: 'kr' },
    { k: 'krmil', t: 'Bäst kr/mil', f: 'kr' },
    { k: 'krtimme', t: 'Bäst kr/timme', f: 'kr' },
    { k: 'timmar', t: 'Flest jobbade timmar', f: 'tid' },
    { k: 'antal', t: 'Flest körningar', f: 'st' },
    { k: 'snitt', t: 'Högst snitt per körning', f: 'kr' },
    { k: 'perskift', t: 'Högst snitt per pass', f: 'kr' },
    // Godkända verkstadstimmar (Verkstadstimmar), räknas per startdag
    { k: 'verkstad', t: 'Flest verkstadstimmar', f: 'tid' }
  ];
  T.lists = LISTS;

  var TAB_KEY = 'tl_tab';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  var WD = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  var st = { tab: localStorage.getItem(TAB_KEY) || 'dag', lastTab: 'dag', date: new Date(), range: null, data: null, err: null, loading: false, seq: 0, el: null, open: {} };
  if (['dag', 'vecka', 'manad'].indexOf(st.tab) < 0) st.tab = 'dag';
  st.lastTab = st.tab;

  // ---------- hjälp ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function p2(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function ddmm(d) { return p2(d.getDate()) + '/' + p2(d.getMonth() + 1); }
  function yy(d) { return String(d.getFullYear()).slice(-2); }
  function week(d) {
    var x = sod(d); x.setDate(x.getDate() + 3 - (x.getDay() + 6) % 7);
    var w1 = new Date(x.getFullYear(), 0, 4);
    return 1 + Math.round(((x - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7);
  }
  function days(a, b) { return Math.round((sod(b) - sod(a)) / 864e5) + 1; }
  function range() {
    if (st.tab === 'period' && st.range) return [sod(st.range.from), sod(st.range.to)];
    var d = sod(st.date);
    if (st.tab === 'vecka') { var s = new Date(d); s.setDate(d.getDate() - (d.getDay() + 6) % 7); var e = new Date(s); e.setDate(s.getDate() + 6); return [s, e]; }
    if (st.tab === 'manad') return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)];
    return [d, d];
  }
  function isCurrent() { var r = range(); return r[1] >= sod(new Date()); }
  function label() {
    var r = range(), f = r[0], t = r[1];
    if (st.tab === 'period') return f.getTime() === t.getTime() ? WD[f.getDay()] + ' ' + ddmm(f) + '-' + yy(f)
      : ddmm(f) + (f.getFullYear() !== t.getFullYear() ? '-' + yy(f) : '') + ' – ' + ddmm(t) + '-' + yy(t);
    if (st.tab === 'vecka') return 'V' + week(f) + ' -' + yy(f);
    if (st.tab === 'manad') return MON[f.getMonth()] + ' -' + yy(f);
    return WD[f.getDay()] + ' ' + ddmm(f) + '-' + yy(f);
  }
  T.periodText = function () {
    if (st.tab === 'dag') return sod(st.date).getTime() === sod(new Date()).getTime() ? 'idag' : 'den dagen';
    if (st.tab === 'vecka') return isCurrent() ? 'den här veckan' : 'den veckan';
    if (st.tab === 'manad') return isCurrent() ? 'den här månaden' : 'den månaden';
    return 'perioden';
  };
  function fmt(v, f) {
    if (v == null) return '–';
    if (f === 'tid') { var m = Math.round(v); return Math.floor(m / 60) + ':' + p2(m % 60) + ' h'; }
    if (f === 'st') return Math.round(v).toLocaleString('sv-SE') + ' st';
    return Math.round(v).toLocaleString('sv-SE') + ' kr';
  }
  T.fmt = fmt;

  function rpc(name, args) {
    args.p_token = localStorage.getItem('taxi_session') || '';
    return fetch(TRIP_API_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': TRIP_API_KEY, 'Authorization': 'Bearer ' + TRIP_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  // ---------- data ----------
  function load() {
    var r = range(), my = ++st.seq;
    window.TOPPLISTOR_LAST = null;
    st.loading = true; st.err = null; draw();
    rpc('get_leaderboard', { p_from: iso(r[0]), p_to: iso(r[1]) }).then(function (d) {
      if (my !== st.seq) return;
      st.loading = false; st.data = d || null; draw();
      var info = { tab: st.tab, current: isCurrent(), period: T.periodText(), data: st.data };
      window.TOPPLISTOR_LAST = info;
      document.dispatchEvent(new CustomEvent('topplistor:data', { detail: info }));
    }).catch(function () {
      if (my !== st.seq) return;
      st.loading = false; st.data = null; st.err = 'Kunde inte hämta topplistorna. Försök igen.'; draw();
    });
  }

  // ---------- vy ----------
  var statusEl = null;
  T.render = function (content) {
    st.el = content;
    content.innerHTML =
      '<div class="tl-controls"><div class="tabs">' +
        '<button type="button" class="tl-tab" data-tab="dag">Dag</button>' +
        '<button type="button" class="tl-tab" data-tab="vecka">Vecka</button>' +
        '<button type="button" class="tl-tab" data-tab="manad">Månad</button></div>' +
      '<div class="date-nav"><button type="button" id="tl-prev" aria-label="Föregående">‹</button><div id="tl-date" class="tl-date"></div>' +
        '<button type="button" id="tl-next" aria-label="Nästa">›</button><button type="button" id="tl-today" aria-label="Idag">»</button>' +
        '<button type="button" id="tl-period" class="tl-period" title="Välj egen period" aria-label="Välj egen period">📅</button></div>' +
      '<div id="tl-status-slot"></div></div>' +
      '<div id="tl-body"></div>';
    // Serverstatus-lampan: samma element återanvänds så att bara en timer körs
    if (!statusEl) { statusEl = document.createElement('div'); statusEl.id = 'tl-server-status'; statusEl.className = 'server-status'; statusEl.style.display = 'none'; }
    document.getElementById('tl-status-slot').appendChild(statusEl);
    if (window.initServerStatus) window.initServerStatus('tl-server-status');

    content.querySelectorAll('.tl-tab').forEach(function (b) {
      b.onclick = function () { st.tab = b.dataset.tab; st.lastTab = st.tab; st.range = null; localStorage.setItem(TAB_KEY, st.tab); load(); };
    });
    document.getElementById('tl-prev').onclick = function () { move(-1); };
    document.getElementById('tl-next').onclick = function () { if (!isCurrent()) move(1); };
    document.getElementById('tl-today').onclick = function () { st.date = new Date(); if (st.tab === 'period') { st.tab = st.lastTab; st.range = null; } load(); };
    document.getElementById('tl-period').onclick = openCal;
    load();
  };
  function move(dir) {
    if (st.tab === 'period' && st.range) {
      var n = days(st.range.from, st.range.to), f = new Date(st.range.from), t = new Date(st.range.to);
      f.setDate(f.getDate() + dir * n); t.setDate(t.getDate() + dir * n);
      st.range = { from: f, to: t }; st.date = new Date(t);
    } else if (st.tab === 'vecka') st.date.setDate(st.date.getDate() + 7 * dir);
    else if (st.tab === 'manad') st.date = new Date(st.date.getFullYear(), st.date.getMonth() + dir, 1);
    else st.date.setDate(st.date.getDate() + dir);
    load();
  }

  function draw() {
    if (!st.el || !document.getElementById('tl-body')) return;
    st.el.querySelectorAll('.tl-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === st.tab); });
    var de = document.getElementById('tl-date'); de.textContent = label(); de.classList.toggle('period', st.tab === 'period');
    document.getElementById('tl-period').classList.toggle('active', st.tab === 'period');
    document.getElementById('tl-today').classList.toggle('active', st.tab === 'dag' && sod(st.date).getTime() === sod(new Date()).getTime());
    var nx = document.getElementById('tl-next'); nx.disabled = isCurrent(); nx.style.opacity = isCurrent() ? '0.3' : '1';

    var body = document.getElementById('tl-body'), d = st.data, h = '';
    if (st.err) h = '<div class="tl-msg err">' + esc(st.err) + '</div>';
    else if (st.loading && !d) h = '<div class="tl-msg">Laddar…</div>';
    else if (!d || (!d.drivers && !d.workshop_drivers)) h = '<div class="tl-msg">Ingen har kört ' + esc(T.periodText()) + ' än.</div>';
    else {
      h += '<div class="tl-info">' + (d.drivers ? d.drivers + ' förare med pass ' + esc(T.periodText()) + '. ' : 'Inga pass ' + esc(T.periodText()) + ' än. ') +
        (d.named ? 'Du ser namn eftersom du är ägare.' : 'Bara din egen rad visas som "Du".') + '</div>';
      LISTS.forEach(function (L) {
        var x = d.lists && d.lists[L.k];
        if (!x || !x.rows || !x.rows.length) return;
        var open = !!st.open[L.k], rows = x.rows, show = open ? rows : rows.slice(0, 5);
        h += '<div class="tl-card"><div class="tl-head"><span class="tl-title">' + esc(L.t) + '</span>' +
          '<span class="tl-me">' + (x.me ? 'Du: plats ' + x.me.pos + ' av ' + x.n : x.n + ' förare') + '</span></div>';
        show.forEach(function (r) {
          var who = r.du ? 'Du' : (d.named && r.id ? (r.namn && r.namn !== r.id ? esc(r.namn) + ' <span class="tl-id">' + esc(r.id) + '</span>' : esc(r.id)) : '');
          h += '<div class="tl-row' + (r.du ? ' du' : '') + '"><span class="tl-pos">' + (r.pos <= 3 ? ['🥇', '🥈', '🥉'][r.pos - 1] : r.pos + '.') + '</span>' +
            '<span class="tl-who">' + who + '</span><span class="tl-val">' + fmt(r.v, L.f) + '</span></div>';
        });
        if (x.me && !open && x.me.pos > 5 && rows.length > 5) {
          h += '<div class="tl-row du"><span class="tl-pos">' + x.me.pos + '.</span><span class="tl-who">Du</span><span class="tl-val">' + fmt(x.me.v, L.f) + '</span></div>';
        }
        if (rows.length > 5) h += '<button type="button" class="tl-more" data-k="' + L.k + '">' + (open ? 'Visa färre' : 'Visa alla ' + rows.length) + '</button>';
        h += '</div>';
      });
      h += '<div class="tl-foot">Alla förare med pass i perioden räknas, även de utan konto i appen. Kr/mil kräver minst 1 mil, kr/timme minst 30 min. Inkört räknas som i Körpassdata. Verkstadstimmar räknas när ägaren har godkänt dem.</div>';
    }
    body.innerHTML = h;
    body.querySelectorAll('.tl-more').forEach(function (b) { b.onclick = function () { st.open[b.dataset.k] = !st.open[b.dataset.k]; draw(); }; });
  }

  // ---------- egen period: kalender (samma utseende som Körpassdata) ----------
  var cal = { m: null, from: null, to: null };
  function openCal() {
    var m = document.getElementById('tl-modal');
    if (!m) {
      m = document.createElement('div'); m.id = 'tl-modal'; m.className = 'pm-overlay';
      m.innerHTML = '<div class="pm-box" role="dialog" aria-label="Välj period">' +
        '<div class="pm-head"><button type="button" id="tl-pm-prev" aria-label="Föregående månad">‹</button><span id="tl-pm-title"></span><button type="button" id="tl-pm-next" aria-label="Nästa månad">›</button></div>' +
        '<div class="pm-hint">Tryck på första och sista dagen</div><div class="pm-cal" id="tl-pm-cal"></div><div class="pm-sel" id="tl-pm-sel"></div>' +
        '<div class="pm-btns"><button type="button" id="tl-pm-cancel">Avbryt</button><button type="button" id="tl-pm-ok" class="primary">Visa</button></div></div>';
      document.body.appendChild(m);
      m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('open'); });
      document.getElementById('tl-pm-prev').onclick = function () { cal.m.setMonth(cal.m.getMonth() - 1); drawCal(); };
      document.getElementById('tl-pm-next').onclick = function () { cal.m.setMonth(cal.m.getMonth() + 1); drawCal(); };
      document.getElementById('tl-pm-cancel').onclick = function () { m.classList.remove('open'); };
      document.getElementById('tl-pm-ok').onclick = function () {
        if (!cal.from) return;
        if (st.tab !== 'period') st.lastTab = st.tab;
        st.range = { from: new Date(cal.from), to: new Date(cal.to || cal.from) };
        st.tab = 'period'; st.date = new Date(st.range.to);
        m.classList.remove('open'); load();
      };
    }
    var r = range(); cal.from = r[0]; cal.to = r[1]; cal.m = new Date(r[1].getFullYear(), r[1].getMonth(), 1);
    drawCal(); m.classList.add('open');
  }
  function drawCal() {
    document.getElementById('tl-pm-title').textContent = MON[cal.m.getMonth()] + ' ' + cal.m.getFullYear();
    var first = new Date(cal.m.getFullYear(), cal.m.getMonth(), 1), last = new Date(cal.m.getFullYear(), cal.m.getMonth() + 1, 0), today = sod(new Date());
    var h = ['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'].map(function (x) { return '<div class="pm-wd">' + x + '</div>'; }).join('');
    for (var i = 0; i < (first.getDay() + 6) % 7; i++) h += '<div></div>';
    for (var dd = 1; dd <= last.getDate(); dd++) {
      var dt = new Date(cal.m.getFullYear(), cal.m.getMonth(), dd), t = dt.getTime(), c = 'pm-day';
      if (cal.from && t === cal.from.getTime()) c += ' sel';
      if (cal.to && t === cal.to.getTime()) c += ' sel';
      if (cal.from && cal.to && t > cal.from.getTime() && t < cal.to.getTime()) c += ' in';
      if (t === today.getTime()) c += ' today';
      if (dt > today) c += ' future';
      h += '<button type="button" class="' + c + '" data-d="' + dd + '">' + dd + '</button>';
    }
    var el = document.getElementById('tl-pm-cal'); el.innerHTML = h;
    el.querySelectorAll('.pm-day').forEach(function (b) {
      b.onclick = function () {
        var x = new Date(cal.m.getFullYear(), cal.m.getMonth(), +b.dataset.d);
        if (!cal.from || cal.to) { cal.from = x; cal.to = null; } else if (x < cal.from) { cal.to = cal.from; cal.from = x; } else cal.to = x;
        drawCal();
      };
    });
    document.getElementById('tl-pm-sel').textContent = cal.from ? ddmm(cal.from) + '-' + yy(cal.from) + ' – ' + (cal.to ? ddmm(cal.to) + '-' + yy(cal.to) : 'välj sista dagen') : '';
    document.getElementById('tl-pm-ok').disabled = !cal.from;
  }
})();
