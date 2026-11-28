/* Topplistor + Rekordtavlan (2026-11-06, Bil öppen 2026-11-14).
 *
 * Växel Topplista | Rekord. Samma mått i båda. Period = aktuell period i Topplista,
 * respektive varje förares bästa sådan period sedan jan 2025 i Rekord.
 * Sortera störst/minst. Förare: andras namn bara för ägare. Bil: alla i åkeriet
 * ser alla bilar med nummer, modell, plats och värde. Den egna bilen markeras.
 * Arkiv läses automatiskt för äldre år / rekord.
 */
(function () {
  'use strict';

  var T = window.TOPPLISTOR = { id: 'topplistor', title: 'Topplistor', icon: '🏆' };

  // Mått (utan "mest"). Andel tomkörning borttagen: STIG saknar tomkm-fält.
  var LISTS = [
    { k: 'inkort', t: 'Inkört', f: 'kr', group: 'sum' },
    { k: 'dricks', t: 'Dricks', f: 'kr', group: 'sum' },
    { k: 'krmil', t: 'Kr/mil', f: 'kr', group: 'sum' },
    { k: 'krtimme', t: 'Kr/timme', f: 'kr', group: 'sum' },
    { k: 'km', t: 'Km', f: 'km', group: 'sum' },
    { k: 'antal', t: 'Antal resor', f: 'st', group: 'sum' },
    { k: 'snitt', t: 'Kr/körning', f: 'kr', group: 'sum' },
    { k: 'inkort_pass', t: 'Kr/pass', f: 'kr', group: 'sum' },
    { k: 'dricks_pct', t: 'Dricks %', f: 'pct', group: 'sum' },
    { k: 'flyg', t: 'Flygresor', f: 'st', group: 'sum' },
    { k: 'langst', t: 'Km/körning', f: 'km1', group: 'trip' },
    { k: 'belopp', t: 'Belopp/körning', f: 'kr', group: 'trip' },
    { k: 'passresor', t: 'Körningar/pass', f: 'st', group: 'trip' }
  ];
  T.lists = LISTS;
  var BY_K = {};
  LISTS.forEach(function (L) { BY_K[L.k] = L; });

  var VIEW_KEY = 'tl_view', TAB_KEY = 'tl_tab', MODE_KEY = 'tl_mode';
  var METRIC_KEY = 'tl_metric';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  var WD = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  var GRAIN_SV = { dag: 'dag', vecka: 'vecka', manad: 'månad', ar: 'år' };

  var st = {
    view: localStorage.getItem(VIEW_KEY) === 'rekord' ? 'rekord' : 'topplista',
    tab: localStorage.getItem(TAB_KEY) || 'dag',
    lastTab: 'dag',
    date: new Date(),
    range: null,
    mode: localStorage.getItem(MODE_KEY) === 'bil' ? 'bil' : 'forare',
    metric: localStorage.getItem(METRIC_KEY) || 'inkort',
    data: null, err: null, loading: false, arkiv: false, seq: 0, el: null, menu: false
  };
  if (['dag', 'vecka', 'manad', 'ar'].indexOf(st.tab) < 0) st.tab = 'dag';
  if (!BY_K[st.metric]) st.metric = 'inkort';
  st.lastTab = st.tab;
  var cache = {};
  T.clearCache = function () { cache = {}; window.TOPPLISTOR_LAST = null; };
  T.mode = function () { return st.mode; };
  T.view = function () { return st.view; };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sn(s) { return window.shortName ? window.shortName(s) : (s == null ? '' : String(s)); }
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
    if (st.tab === 'ar') return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear(), 11, 31)];
    return [d, d];
  }
  function isCurrent() { var r = range(); return r[1] >= sod(new Date()); }
  function label() {
    var r = range(), f = r[0], t = r[1];
    if (st.tab === 'period') return f.getTime() === t.getTime() ? WD[f.getDay()] + ' ' + ddmm(f) + '-' + yy(f)
      : ddmm(f) + (f.getFullYear() !== t.getFullYear() ? '-' + yy(f) : '') + ' – ' + ddmm(t) + '-' + yy(t);
    if (st.tab === 'vecka') return 'V' + week(f) + ' -' + yy(f);
    if (st.tab === 'manad') return MON[f.getMonth()] + ' -' + yy(f);
    if (st.tab === 'ar') return 'År ' + f.getFullYear();
    return WD[f.getDay()] + ' ' + ddmm(f) + '-' + yy(f);
  }
  T.periodText = function () {
    if (st.view === 'rekord') return 'bästa ' + (GRAIN_SV[st.tab] || 'perioden') + ' sedan 2025';
    if (st.tab === 'dag') return sod(st.date).getTime() === sod(new Date()).getTime() ? 'idag' : 'den dagen';
    if (st.tab === 'vecka') return isCurrent() ? 'den här veckan' : 'den veckan';
    if (st.tab === 'manad') return isCurrent() ? 'den här månaden' : 'den månaden';
    if (st.tab === 'ar') return isCurrent() ? 'i år' : 'det året';
    return 'perioden';
  };
  function fmt(v, f) {
    if (v == null) return '–';
    if (f === 'pct') return (Math.round(v * 10) / 10).toLocaleString('sv-SE') + ' %';
    if (f === 'km') return Math.round(v).toLocaleString('sv-SE') + ' km';
    if (f === 'km1') return (Math.round(v * 10) / 10).toLocaleString('sv-SE') + ' km';
    if (f === 'st') return Math.round(v).toLocaleString('sv-SE') + ' st';
    return Math.round(v).toLocaleString('sv-SE') + ' kr';
  }
  T.fmt = fmt;
  // Snittmått: antal resor inom parentes, t.ex. "312 kr (25 st)"
  function cnt(r) { return r && r.c != null ? ' <span class="tl-cnt">(' + Math.round(r.c).toLocaleString('sv-SE') + ' st)</span>' : ''; }

  function rpc(name, args) {
    args.p_token = localStorage.getItem('taxi_session') || '';
    return fetch(TRIP_API_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': TRIP_API_KEY, 'Authorization': 'Bearer ' + TRIP_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function cacheKey() {
    if (st.view === 'rekord') return ['rekord', st.tab, st.metric, st.mode].join('|');
    var r = range();
    return ['topp', iso(r[0]), iso(r[1]), st.metric, st.mode].join('|');
  }

  function load() {
    var my = ++st.seq, key = cacheKey(), bil = st.mode === 'bil';
    window.TOPPLISTOR_LAST = null;
    st.err = null;
    st.arkiv = st.view === 'topplista' && range()[0].getFullYear() < new Date().getFullYear();
    st.menu = false;

    var got;
    if (cache[key]) {
      got = Promise.resolve(cache[key]);
    } else {
      st.loading = true; st.data = null; draw();
      if (st.view === 'rekord') {
        got = rpc('get_rekord_metric', {
          p_grain: st.tab === 'period' ? 'manad' : st.tab,
          p_metric: st.metric, p_sort: 'desc', p_entity: bil ? 'bil' : 'forare'
        });
      } else {
        var r = range();
        got = rpc('get_topplista_metric', {
          p_from: iso(r[0]), p_to: iso(r[1]),
          p_metric: st.metric, p_sort: 'desc', p_entity: bil ? 'bil' : 'forare'
        });
      }
    }
    got.then(function (d) {
      if (d) cache[key] = d;
      if (my !== st.seq) return;
      st.loading = false; st.data = d || null; draw();
      if (bil) return;
      var info = { tab: st.tab, view: st.view, current: isCurrent(), period: T.periodText(), data: st.data, metric: st.metric };
      window.TOPPLISTOR_LAST = info;
      document.dispatchEvent(new CustomEvent('topplistor:data', { detail: info }));
    }).catch(function (e) {
      if (my !== st.seq) return;
      st.loading = false; st.data = null;
      st.err = (e && String(e.message) === '404')
        ? 'Servern har inte den nya topplistefunktionen ännu. SQL 20261106e måste appliceras först.'
        : 'Kunde inte hämta listan. Försök igen.';
      draw();
    });
  }

  // Ikoner och enhetsknapp som i Mina bevakningar (menyrad, 2026-11-27menyrad1)
  var UNITS = ['dag', 'vecka', 'manad', 'ar'], UNIT_N = { dag: 'Dag', vecka: 'Vecka', manad: 'Månad', ar: 'År' };
  function svg22(inner) { return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + inner + '</svg>'; }
  var BOX = '<rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>';
  function cells(cols, rows, step, size) {
    var h = '', r, c;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) h += '<rect x="' + (5 + c * step) + '" y="' + (5.2 + r * step) + '" width="' + size + '" height="' + size + '" rx="0.7" fill="currentColor"/>';
    return h;
  }
  var ICON = {
    dag: svg22(BOX + '<path d="M7 8.5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="7" y="10.5" width="10" height="3.8" rx="1" fill="currentColor"/><path d="M7 16.5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    vecka: svg22(BOX + '<path d="M8.2 5.2v13.6M11.4 5.2v13.6M14.6 5.2v13.6M17.8 5.2v13.6" fill="none" stroke="currentColor" stroke-width="1.5"/>'),
    manad: svg22(cells(3, 3, 5, 3.6)),
    ar: svg22(BOX + cells(4, 3, 3.4, 2.2).replace(/x="(\d+(?:\.\d+)?)"/g, function (m, x) { return 'x="' + (+x + 0.9) + '"'; })),
    today: svg22('<path d="M6 6l6 6-6 6M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')
  };
  function unitTab() { return st.tab === 'period' ? (st.lastTab || 'manad') : st.tab; }

  var statusEl = null;
  T.render = function (content) {
    st.el = content;
    content.innerHTML =
      '<div class="tl-controls">' +
        '<div class="mb-toolbar tl-toolbar">' +
          '<button type="button" class="mb-unit" id="tl-unit"></button>' +
          '<div class="date-nav mb-date-nav" id="tl-datenav">' +
            '<button type="button" id="tl-prev" aria-label="Föregående">‹</button>' +
            '<button type="button" id="tl-date" class="tl-date" aria-haspopup="dialog" aria-label="Välj period"></button>' +
            '<button type="button" id="tl-next" aria-label="Nästa">›</button></div>' +
          '<button type="button" class="mb-today" id="tl-today" aria-label="Idag">' + ICON.today + '</button></div>' +
        '<div class="tl-chips" role="toolbar" aria-label="Visa">' +
          '<button type="button" class="mb-fchip tl-view" data-view="topplista">🏆 Topplista</button>' +
          '<button type="button" class="mb-fchip tl-view" data-view="rekord">🏅 Rekord</button>' +
          '<span class="mb-fchip-sep" aria-hidden="true"></span>' +
          '<button type="button" class="mb-fchip tl-mode" data-mode="forare">👤 Förare</button>' +
          '<button type="button" class="mb-fchip tl-mode" data-mode="bil">🚕 Bil</button></div>' +
        '<div class="tl-row2">' +
          '<div class="tl-selwrap" id="tl-selwrap">' +
            '<button type="button" class="tl-sel" id="tl-sel" aria-haspopup="listbox" aria-expanded="false"></button>' +
            '<span class="tl-chev" aria-hidden="true">▾</span>' +
            '<div class="tl-menu" id="tl-menu" role="listbox" hidden></div></div></div>' +
        '<div id="tl-status-slot"></div></div>' +
      '<div id="tl-body"></div>';

    if (!statusEl) { statusEl = document.createElement('div'); statusEl.id = 'tl-server-status'; statusEl.className = 'server-status'; statusEl.style.display = 'none'; }
    document.getElementById('tl-status-slot').appendChild(statusEl);
    if (window.initServerStatus) window.initServerStatus('tl-server-status');

    content.querySelectorAll('.tl-view').forEach(function (b) {
      b.onclick = function () {
        if (st.view === b.dataset.view) return;
        st.view = b.dataset.view; localStorage.setItem(VIEW_KEY, st.view);
        if (st.view === 'rekord' && st.tab === 'period') { st.tab = st.lastTab || 'manad'; st.range = null; }
        load();
      };
    });
    content.querySelectorAll('.tl-tab').forEach(function (b) {
      b.onclick = function () { st.tab = b.dataset.tab; st.lastTab = st.tab; st.range = null; localStorage.setItem(TAB_KEY, st.tab); load(); };
    });
    content.querySelectorAll('.tl-mode').forEach(function (b) {
      b.onclick = function () { if (st.mode === b.dataset.mode) return; st.mode = b.dataset.mode; localStorage.setItem(MODE_KEY, st.mode); load(); };
    });
    document.getElementById('tl-unit').onclick = function () {
      var cur = unitTab(), nx = UNITS[(UNITS.indexOf(cur) + 1) % UNITS.length];
      st.tab = nx; st.lastTab = nx; st.range = null; localStorage.setItem(TAB_KEY, st.tab); load();
    };
    document.getElementById('tl-prev').onclick = function () { move(-1); };
    document.getElementById('tl-next').onclick = function () { if (!isCurrent()) move(1); };
    document.getElementById('tl-today').onclick = function () { st.date = new Date(); if (st.tab === 'period') { st.tab = st.lastTab; st.range = null; } load(); };
    var datePick = document.getElementById('tl-date'); if (datePick) datePick.onclick = openCal;
    document.getElementById('tl-sel').onclick = function (e) {
      e.stopPropagation();
      st.menu = !st.menu; drawMenu();
    };
    document.addEventListener('click', function (e) {
      if (!st.menu) return;
      var wrap = document.getElementById('tl-selwrap');
      if (wrap && !wrap.contains(e.target)) { st.menu = false; drawMenu(); }
    });
    load();
  };

  function move(dir) {
    if (st.view === 'rekord') return;
    if (st.tab === 'period' && st.range) {
      var n = days(st.range.from, st.range.to), f = new Date(st.range.from), t = new Date(st.range.to);
      f.setDate(f.getDate() + dir * n); t.setDate(t.getDate() + dir * n);
      st.range = { from: f, to: t }; st.date = new Date(t);
    } else if (st.tab === 'vecka') st.date.setDate(st.date.getDate() + 7 * dir);
    else if (st.tab === 'manad') st.date = new Date(st.date.getFullYear(), st.date.getMonth() + dir, 1);
    else if (st.tab === 'ar') st.date = new Date(st.date.getFullYear() + dir, 0, 1);
    else st.date.setDate(st.date.getDate() + dir);
    load();
  }

  function metricSub(L) {
    if (st.view === 'rekord') {
      if (L.group === 'trip') return 'sedan 2025';
      return 'bästa ' + (GRAIN_SV[st.tab === 'period' ? 'manad' : st.tab] || 'period') + ' sedan 2025';
    }
    return L.group === 'trip' ? 'i vald period' : 'vald period';
  }

  function drawMenu() {
    var btn = document.getElementById('tl-sel');
    var menu = document.getElementById('tl-menu');
    if (!btn || !menu) return;
    var cur = BY_K[st.metric] || LISTS[0];
    btn.textContent = cur.t;
    btn.setAttribute('aria-expanded', st.menu ? 'true' : 'false');
    if (!st.menu) { menu.hidden = true; menu.classList.remove('open'); return; }
    var h = '<div class="tl-sep">Summeringar</div>';
    LISTS.filter(function (L) { return L.group === 'sum'; }).forEach(function (L) {
      h += '<button type="button" class="tl-opt' + (L.k === st.metric ? ' on' : '') + '" data-k="' + L.k + '" role="option" aria-selected="' + (L.k === st.metric) + '">' +
        esc(L.t) + '<small>' + esc(metricSub(L)) + '</small></button>';
    });
    h += '<div class="tl-sep">Enskilda</div>';
    LISTS.filter(function (L) { return L.group === 'trip'; }).forEach(function (L) {
      h += '<button type="button" class="tl-opt' + (L.k === st.metric ? ' on' : '') + '" data-k="' + L.k + '" role="option" aria-selected="' + (L.k === st.metric) + '">' +
        esc(L.t) + '<small>' + esc(metricSub(L)) + '</small></button>';
    });
    menu.innerHTML = h;
    menu.hidden = false; menu.classList.add('open');
    menu.querySelectorAll('.tl-opt').forEach(function (b) {
      b.onclick = function () {
        st.metric = b.dataset.k; localStorage.setItem(METRIC_KEY, st.metric);
        st.menu = false; load();
      };
    });
  }

  function draw() {
    if (!st.el || !document.getElementById('tl-body')) return;
    var rek = st.view === 'rekord';
    T.title = rek ? 'Rekordtavlan' : 'Topplistor';
    var pageTitle = document.getElementById('page-title') || document.getElementById('title');
    if (pageTitle && /topplist|rekord/i.test(pageTitle.textContent || '')) pageTitle.textContent = T.title;
    st.el.querySelectorAll('.tl-view').forEach(function (b) { var on = b.dataset.view === st.view; b.classList.toggle('active', on); b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    st.el.querySelectorAll('.tl-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === st.tab); });
    st.el.querySelectorAll('.tl-mode').forEach(function (b) { var on = b.dataset.mode === st.mode; b.classList.toggle('active', on); b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    ['tl-datenav', 'tl-today'].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = rek ? 'none' : ''; });
    var ub = document.getElementById('tl-unit');
    if (ub) {
      var cu = unitTab(), nu = UNITS[(UNITS.indexOf(cu) + 1) % UNITS.length];
      ub.innerHTML = ICON[cu] || ICON.manad; ub.dataset.unit = cu;
      ub.setAttribute('aria-label', 'Vy: ' + UNIT_N[cu] + '. Tryck för ' + UNIT_N[nu]);
    }
    var de = document.getElementById('tl-date');
    if (de) { de.textContent = label(); de.classList.toggle('period', st.tab === 'period'); }
    var td = document.getElementById('tl-today');
    if (td) td.classList.toggle('active', st.tab === 'dag' && sod(st.date).getTime() === sod(new Date()).getTime());
    var nx = document.getElementById('tl-next');
    if (nx) { nx.disabled = isCurrent(); nx.style.opacity = isCurrent() ? '0.3' : '1'; }

    drawMenu();

    var body = document.getElementById('tl-body'), d = st.data, h = '';
    var L = BY_K[st.metric] || LISTS[0];
    var title = rek ? '🏅 Rekordtavlan' : '🏆 Topplistor';

    if (st.err) h = '<div class="tl-msg err">' + esc(st.err) + '</div>';
    else if (st.loading && st.arkiv) h = '<div class="tl-msg arkiv-loading" role="status" aria-live="polite"><span class="arkiv-spin" aria-hidden="true"></span>Hämtar ' + esc(label()) + ' från arkivet…</div>';
    else if (st.loading && !d) h = '<div class="tl-msg">Laddar…</div>';
    else if (!d || !d.rows) h = '<div class="tl-msg">Ingen data ' + esc(T.periodText()) + ' än.</div>';
    else {
      var ownOnly = d.scope === 'own';
      var whoN = st.mode === 'bil' ? ((d.n || 0) + ' bilar') : ((d.n || 0) + ' förare');
      h += '<div class="tl-hint">' + esc(title) + ' · ' + esc(L.t) +
        (rek ? ' · bästa ' + esc(GRAIN_SV[st.tab] || 'period') + ' sedan 2025' : ' · ' + esc(label())) + '</div>';
      if (ownOnly) {
        h += '<div class="tl-info">🔒 Visar bara din bil' + (d.own ? ' (' + esc(d.own) + ')' : '') +
          ': din placering bland ' + (d.n || 0) + ' bilar. Andra bilar visas inte.</div>';
      } else if (st.mode === 'bil') {
        h += '<div class="tl-info">' + esc(whoN) + ' · ' + esc(T.periodText()) + '. ' +
          (d.arkiv ? '📦 Äldre data från arkivet. ' : '') +
          (window.DEMO && DEMO.on() ? 'Demokonto: bilar visas anonymt.' : 'Din bil är markerad.') + '</div>';
      } else {
        h += '<div class="tl-info">' + esc(whoN) + ' · ' + esc(T.periodText()) + '. ' +
          (d.arkiv ? '📦 Äldre data från arkivet. ' : '') +
          (d.named ? 'Du ser namn eftersom du är ägare.' :
            (window.DEMO && DEMO.on() ? 'Demokonto: andra visas anonymt.' : 'Bara din egen rad visas som "Du".')) + '</div>';
      }
      if (d.note) h += '<div class="tl-note">' + esc(d.note) + '</div>';

      var rows = d.rows || [];
      h += '<div class="tl-card"><div class="tl-head"><span class="tl-title">' + esc(L.t) + '</span>' +
        '<span class="tl-me">' + (d.me ? 'Du: plats ' + d.me.pos + ' av ' + d.n : (d.n || 0) + (st.mode === 'bil' ? ' bilar' : ' förare')) + '</span></div>';

      if (ownOnly && !rows.length) h += '<div class="tl-row"><span class="tl-who">Din bil finns inte med i den här listan.</span></div>';
      rows.forEach(function (r) {
        var who;
        var isOwn = st.mode === 'bil' ? !!(r.id && d.own && r.id === d.own) : !!r.du;
        if (st.mode === 'bil') {
          who = esc(r.id || '') + (r.modell ? ' <span class="tl-id">' + esc(r.modell) + '</span>' : '') +
            (r.du && d.own && r.id !== d.own ? ' <span class="tl-id">· du har kört</span>' : '');
        } else {
          who = r.du ? 'Du' : (d.named && r.id
            ? (r.namn && r.namn !== r.id ? esc(sn(r.namn)) + ' <span class="tl-id">' + esc(r.id) + '</span>' : esc(r.id))
            : (window.DEMO && DEMO.on() ? 'Förare ' + r.pos : ''));
        }
        h += '<div class="tl-row' + (isOwn ? ' du' : '') + '"><span class="tl-pos">' +
          (r.pos <= 3 ? ['🥇', '🥈', '🥉'][r.pos - 1] : r.pos + '.') + '</span>' +
          '<span class="tl-who">' + who + '</span><span class="tl-val">' + fmt(r.v, L.f) + cnt(r) + '</span></div>';
      });
      h += '</div>';
      h += '<div class="tl-foot">Kr/mil kräver minst 1 mil, kr/timme minst 30 min. Inkört räknas som i Körpassdata. På jämförande mått (kr/mil, kr/timme, kr/körning, kr/pass, dricks %) räknas inte 0 km-resor på minst 500 kr. ' +
        (rek && d.min_trips ? 'Rekord kräver minst ' + d.min_trips + ' resor i perioden (gäller inte Topplista). ' : '') +
        'Störst först — läs nerifrån för minst. Km/körning: minst 0,5 km.</div>';
    }
    body.innerHTML = h;
  }

  // ---------- egen period ----------
  var cal = { m: null, from: null, to: null };
  function openCal() {
    if (st.view === 'rekord') return;
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

 if(window.VIEW_STATE){var nav=VIEW_STATE.get('topplistor',{});if(nav.date&&!isNaN(new Date(nav.date)))st.date=new Date(nav.date);if(nav.from&&nav.to&&!isNaN(new Date(nav.from))&&!isNaN(new Date(nav.to))){st.range={from:new Date(nav.from),to:new Date(nav.to)};st.tab='period';}VIEW_STATE.bind('topplistor',function(){return {date:st.date.toISOString(),from:st.range?st.range.from.toISOString():null,to:st.range?st.range.to.toISOString():null};});}

})();
