/* Prognos: tidsschema över uppskattade förbokningar från Taxi Göteborgs prognosverktyg.
 * Koden sparas aldrig i appen – bara på servern. Vid 401 visas en prompt.
 * Kategorikoder: A=Kombi, F=Barnstol, Övriga, Storbil 8+, H=Elbil, 3=Babyskydd.
 * Bilbarnstol/babyskydd är tillägg till bilkategori – egna fliken sist.
 */
(function () {
  'use strict';

  var P = window.PROGNOS = { id: 'prognos', title: 'Prognos', icon: '🔮' };

  // Officiella UI-namn från prognos.taxigoteborg.nu (163 = Astra; JSON stavas ibland Aztra)
  var ZONE_ORDER = [
    { id: '293', name: 'Landvetter flygplats', short: 'Landvetter' },
    { id: '161', name: 'Essity', short: 'Essity' },
    { id: '163', name: 'Astra', short: 'Astra' },
    { id: '406', name: 'Volvo', short: 'Volvo' },
    { id: '432', name: 'Volvo Cars Torslanda', short: 'Torslanda' },
    { id: '15', name: 'Hotell Draken', short: 'Draken' },
    { id: '290', name: 'Magasinet', short: 'Magasinet' }
  ];
  var ZONE_BY_ID = {};
  ZONE_ORDER.forEach(function (z) { ZONE_BY_ID[z.id] = z; });

  // Bilkategorier i schemat (barnstol/babyskydd hör ihop med bil – egen flik)
  var CAR_CATS = [
    { k: 'app', head: 'A Kombi', label: 'Kombi (A)' },
    { k: 'ovrigt', head: 'Övriga', label: 'Övriga' },
    { k: 'storbil', head: 'Storbil', label: 'Storbil (8+)' },
    { k: 'elbil', head: 'H Elbil', label: 'Elbil (H)' }
  ];
  var CHILD_CATS = [
    { k: 'barnstol', head: 'F', label: 'Barnstol (F)' },
    { k: 'babyskydd', head: '3', label: 'Babyskydd (3)' }
  ];
  var ALL_CATS = CAR_CATS.concat(CHILD_CATS);
  var CAT_LABEL = {};
  ALL_CATS.forEach(function (c) { CAT_LABEL[c.k] = c.label; });
  var ALL_CAT_KEYS = ALL_CATS.map(function (c) { return c.k; });
  var CAR_KEYS = CAR_CATS.map(function (c) { return c.k; });
  var CHILD_KEYS = CHILD_CATS.map(function (c) { return c.k; });

  var LS_CATS = 'prognos_cats';
  var LS_ZONES = 'prognos_zones';
  var LS_TAB = 'prognos_zone_tab';
  var TAB_BARN = 'barn';

  var st = {
    el: null,
    status: null,
    bookings: [],
    morgon: null,
    zones: [],
    watches: [],
    loading: false,
    err: null,
    panel: 'schema',
    zoneTab: loadTab(),
    codeInput: '',
    codeBusy: false,
    codeMsg: '',
    poll: null,
    seenIds: {},
    inAppAlert: true
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function token() { return localStorage.getItem('taxi_session') || ''; }
  function p2(n) { return String(n).padStart(2, '0'); }
  function rpc(name, args) {
    args = args || {};
    args.p_token = token();
    return fetch((window.TRIP_API_URL || 'https://lpfdryvukqmjlgenuzpb.supabase.co') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: window.TRIP_API_KEY,
        Authorization: 'Bearer ' + window.TRIP_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.status); });
      return r.json();
    });
  }

  function loadCats() {
    try {
      var raw = localStorage.getItem(LS_CATS);
      if (!raw) return ALL_CAT_KEYS.slice();
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return ALL_CAT_KEYS.slice();
      return arr.filter(function (k) { return ALL_CAT_KEYS.indexOf(k) >= 0; });
    } catch (e) { return ALL_CAT_KEYS.slice(); }
  }
  function saveCats(arr) { localStorage.setItem(LS_CATS, JSON.stringify(arr)); }

  function loadZones() {
    try {
      var raw = localStorage.getItem(LS_ZONES);
      if (!raw) return null;
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(String) : null;
    } catch (e) { return null; }
  }
  function saveZones(arr) {
    if (!arr || !arr.length) localStorage.removeItem(LS_ZONES);
    else localStorage.setItem(LS_ZONES, JSON.stringify(arr));
  }

  function loadTab() {
    try {
      var t = localStorage.getItem(LS_TAB);
      if (t === TAB_BARN) return TAB_BARN;
      if (t && ZONE_BY_ID[t]) return t;
    } catch (e) {}
    return '293';
  }
  function saveTab(t) {
    st.zoneTab = t;
    try { localStorage.setItem(LS_TAB, t); } catch (e) {}
  }

  function zoneName(id) {
    var z = ZONE_BY_ID[String(id)];
    if (z) return z.name;
    var found = (st.zones || []).find(function (x) { return String(x.id) === String(id); });
    return (found && found.name) || String(id);
  }
  function zoneShort(id) {
    var z = ZONE_BY_ID[String(id)];
    return (z && z.short) || zoneName(id).split(' ')[0];
  }

  function visibleZones() {
    var filt = loadZones();
    return ZONE_ORDER.filter(function (z) {
      return !filt || filt.indexOf(z.id) >= 0;
    });
  }

  function floor5(d) {
    var x = new Date(d);
    x.setSeconds(0, 0);
    x.setMinutes(Math.floor(x.getMinutes() / 5) * 5);
    return x;
  }
  function addMin(d, m) { return new Date(d.getTime() + m * 60000); }

  function toast(msg, ms) {
    if (window.showToast) window.showToast(msg, ms);
    else try { console.log(msg); } catch (e) {}
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  var CONF_RANK = { saker: 0, trolig: 1, osaker: 2 };

  /** Sammanfatta bokningar i en cell: antal + svagaste konfidens. Blandat → n? */
  function cellSummary(list) {
    if (!list || !list.length) return null;
    var n = list.length;
    var worst = 'saker';
    var parts = { saker: 0, trolig: 0, osaker: 0 };
    list.forEach(function (b) {
      var c = b.confidence || 'trolig';
      if (!parts[c]) parts[c] = 0;
      parts[c]++;
      if ((CONF_RANK[c] || 1) > (CONF_RANK[worst] || 0)) worst = c;
    });
    var kinds = Object.keys(parts).filter(function (k) { return parts[k] > 0; });
    var mixed = kinds.length > 1;
    var tipBits = [];
    if (parts.saker) tipBits.push(parts.saker + ' säker');
    if (parts.trolig) tipBits.push(parts.trolig + ' trolig');
    if (parts.osaker) tipBits.push(parts.osaker + ' osäker');
    return {
      n: n,
      conf: worst,
      mixed: mixed,
      text: String(n) + (mixed ? '?' : ''),
      tip: tipBits.join(', ')
    };
  }

  function checkNewBookings(list) {
    if (!st.inAppAlert) return;
    var fresh = [];
    (list || []).forEach(function (b) {
      if (!st.seenIds[b.id]) {
        if (Object.keys(st.seenIds).length) fresh.push(b);
        st.seenIds[b.id] = 1;
      }
    });
    if (!Object.keys(st.seenIds).length && list && list.length) {
      list.forEach(function (b) { st.seenIds[b.id] = 1; });
      return;
    }
    if (!fresh.length) return;
    var cats = loadCats();
    var zones = loadZones();
    fresh = fresh.filter(function (b) {
      if (cats.indexOf(b.category) < 0) return false;
      if (zones && zones.indexOf(String(b.zone_id)) < 0) return false;
      return true;
    });
    if (!fresh.length) return;
    var b = fresh[0];
    var t = new Date(b.estimated_at);
    var msg = zoneName(b.zone_id) + ' · ' + (CAT_LABEL[b.category] || b.category) +
      ' · ca ' + p2(t.getHours()) + ':' + p2(t.getMinutes());
    beep();
    try { if (navigator.vibrate) navigator.vibrate([200, 80, 200]); } catch (e) {}
    toast('Ny förbokning – ' + msg, 8000);
  }

  function refresh() {
    if (!token() || st.loading) return Promise.resolve();
    st.loading = true;
    return Promise.all([
      rpc('prognos_status', {}),
      rpc('prognos_list_bookings', {}),
      rpc('prognos_morgon', {}),
      rpc('prognos_zones', {}),
      rpc('prognos_watch_list', {})
    ]).then(function (xs) {
      st.status = xs[0] || {};
      st.bookings = xs[1] || [];
      st.morgon = xs[2];
      st.zones = xs[3] || [];
      st.watches = xs[4] || [];
      st.err = null;
      if (st.status.code_needed) st.panel = 'kod';
      // Om vald flik filtrerats bort → byt till första synliga
      var vis = visibleZones();
      if (st.zoneTab !== TAB_BARN && !vis.some(function (z) { return z.id === st.zoneTab; })) {
        saveTab(vis.length ? vis[0].id : '293');
      }
      checkNewBookings(st.bookings);
    }).catch(function () {
      st.err = 'Kunde inte hämta prognos just nu.';
    }).then(function () {
      st.loading = false;
      paint();
    });
  }

  function submitCode() {
    var code = String(st.codeInput || '').trim();
    if (code.length < 4) { st.codeMsg = 'Ange koden från intranätet.'; paint(); return; }
    st.codeBusy = true; st.codeMsg = ''; paint();
    rpc('prognos_submit_code', { p_code: code }).then(function () {
      st.codeInput = '';
      st.codeMsg = 'Koden sparad. Scannern försöker igen inom en minut.';
      st.panel = 'schema';
      return refresh();
    }).catch(function () {
      st.codeMsg = 'Kunde inte spara koden. Försök igen.';
    }).then(function () {
      st.codeBusy = false; paint();
    });
  }

  function toggleWatch(zone, cat) {
    var on = !st.watches.some(function (w) { return w.zone_id === zone && w.category === cat; });
    rpc('prognos_watch_set', { p_zone: zone, p_category: cat, p_on: on }).then(function (list) {
      st.watches = list || [];
      paint();
    }).catch(function () { toast('Kunde inte spara bevakning.'); });
  }

  function ensurePushHint() {
    if (!('PushManager' in window)) return '';
    var isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;
    if (isIos && !standalone) {
      return '<p class="pg-hint">På iPhone: lägg till TaxiData på hemskärmen för att få push-notiser.</p>';
    }
    return '<p class="pg-hint">Push använder samma notiser som Ankomster. Aktivera dem under Ankomster om du inte redan gjort det.</p>';
  }

  function renderCode() {
    return '<div class="pg-card">' +
      '<h3>Ny prognoskod</h3>' +
      '<p class="pg-muted">Åtkomsten till prognossidan fungerar inte. Skriv in koden från intranätet. Den sparas på servern och visas aldrig i appen.</p>' +
      '<input class="pg-input" type="password" inputmode="numeric" autocomplete="off" ' +
      'placeholder="Kod" value="' + esc(st.codeInput) + '" id="pg-code" />' +
      (st.codeMsg ? '<p class="pg-msg">' + esc(st.codeMsg) + '</p>' : '') +
      '<button class="pg-btn" id="pg-save-code"' + (st.codeBusy ? ' disabled' : '') + '>Spara kod</button>' +
      '</div>';
  }

  function renderFilter() {
    var cats = loadCats();
    var zones = loadZones();
    var html = '<div class="pg-card"><h3>Bilkategorier</h3><div class="pg-chips">';
    CAR_CATS.forEach(function (c) {
      var on = cats.indexOf(c.k) >= 0;
      html += '<button type="button" class="pg-chip' + (on ? ' on' : '') + '" data-cat="' + c.k + '">' +
        esc(c.label) + '</button>';
    });
    html += '</div></div>';
    html += '<div class="pg-card"><h3>Barnstol / babyskydd</h3>' +
      '<p class="pg-muted">Visas på egen flik i schemat. Valfritt i filter och notiser.</p><div class="pg-chips">';
    CHILD_CATS.forEach(function (c) {
      var on = cats.indexOf(c.k) >= 0;
      html += '<button type="button" class="pg-chip' + (on ? ' on' : '') + '" data-cat="' + c.k + '">' +
        esc(c.label) + '</button>';
    });
    html += '</div></div>';
    html += '<div class="pg-card"><h3>Zoner att visa</h3><div class="pg-chips">';
    html += '<button type="button" class="pg-chip' + (!zones ? ' on' : '') + '" data-zone="*">Alla</button>';
    ZONE_ORDER.forEach(function (z) {
      var on = zones && zones.indexOf(z.id) >= 0;
      html += '<button type="button" class="pg-chip' + (on ? ' on' : '') + '" data-zone="' + z.id + '">' +
        esc(z.name) + '</button>';
    });
    html += '</div><p class="pg-muted">Magasinet (290) finns med även om prognossajten inte har flik för den. Astra (163) enligt sajtens namn (JSON stavas ibland Aztra).</p></div>';
    return html;
  }

  function renderNotis() {
    var html = '<div class="pg-card"><h3>Notis vid ny bokning</h3>' +
      ensurePushHint() +
      '<p class="pg-muted">Välj zon + kategori. Barnstol/babyskydd kan bevakas separat.</p>';
    visibleZones().forEach(function (z) {
      html += '<div class="pg-watch-zone"><div class="pg-watch-title">' + esc(z.name) +
        ' <span class="pg-muted">(' + esc(z.id) + ')</span></div><div class="pg-chips">';
      ALL_CATS.forEach(function (c) {
        var on = st.watches.some(function (w) { return w.zone_id === z.id && w.category === c.k; });
        html += '<button type="button" class="pg-chip' + (on ? ' on' : '') + '" data-wz="' + z.id +
          '" data-wc="' + c.k + '">' + esc(c.label) + '</button>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function renderZoneTabs() {
    var vis = visibleZones();
    var html = '<div class="pg-ztabs" role="tablist">';
    vis.forEach(function (z) {
      var on = st.zoneTab === z.id;
      html += '<button type="button" class="pg-ztab' + (on ? ' on' : '') + '" data-ztab="' + z.id +
        '" title="' + esc(z.name) + ' (' + z.id + ')">' + esc(z.short) + '</button>';
    });
    html += '<button type="button" class="pg-ztab pg-ztab-barn' + (st.zoneTab === TAB_BARN ? ' on' : '') +
      '" data-ztab="' + TAB_BARN + '" title="Barnstol och babyskydd (hör till bilkategori)">Barnstol</button>';
    html += '</div>';
    return html;
  }

  function countCell(sum) {
    if (!sum) return '';
    var tip = sum.tip + (sum.mixed ? ' · blandat → svagaste markering' : '');
    return '<span class="pg-n pg-c-' + sum.conf + '" title="' + esc(tip) + '">' +
      esc(sum.text) + '</span>';
  }

  function renderCarTimeline(zoneId) {
    var cats = loadCats().filter(function (k) { return CAR_KEYS.indexOf(k) >= 0; });
    if (!cats.length) cats = CAR_KEYS.slice();
    var now = floor5(new Date());
    var end = addMin(now, 120);
    var rows = [];
    for (var t = new Date(now); t < end; t = addMin(t, 5)) rows.push(new Date(t));

    var bySlot = {};
    (st.bookings || []).forEach(function (b) {
      if (String(b.zone_id) !== String(zoneId)) return;
      if (cats.indexOf(b.category) < 0) return;
      var d = floor5(new Date(b.estimated_at));
      if (d < now || d >= end) return;
      var key = d.getTime() + '|' + b.category;
      if (!bySlot[key]) bySlot[key] = [];
      bySlot[key].push(b);
    });

    var html = '<div class="pg-scroll pg-scroll-fit"><table class="pg-table pg-table-fit"><thead><tr>' +
      '<th class="pg-th-time">Tid</th>';
    cats.forEach(function (k) {
      var meta = CAR_CATS.find(function (c) { return c.k === k; });
      html += '<th>' + esc(meta ? meta.head : k) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (d) {
      html += '<tr><td class="pg-td-time">' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + '</td>';
      cats.forEach(function (k) {
        var sum = cellSummary(bySlot[d.getTime() + '|' + k]);
        html += '<td class="pg-td-cell">' + countCell(sum) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  /** Barnstol-flik: kolumner per zon (kortnamn), cell = antal F+3 */
  function renderBarnTimeline() {
    var cats = loadCats().filter(function (k) { return CHILD_KEYS.indexOf(k) >= 0; });
    if (!cats.length) cats = CHILD_KEYS.slice();
    var zones = visibleZones();
    var now = floor5(new Date());
    var end = addMin(now, 120);
    var rows = [];
    for (var t = new Date(now); t < end; t = addMin(t, 5)) rows.push(new Date(t));

    var bySlot = {};
    (st.bookings || []).forEach(function (b) {
      if (cats.indexOf(b.category) < 0) return;
      if (zones.length && !zones.some(function (z) { return z.id === String(b.zone_id); })) return;
      var d = floor5(new Date(b.estimated_at));
      if (d < now || d >= end) return;
      var key = d.getTime() + '|' + String(b.zone_id);
      if (!bySlot[key]) bySlot[key] = [];
      bySlot[key].push(b);
    });

    var html = '<p class="pg-muted pg-barn-note">Barnstol (F) och babyskydd (3) hör alltid till en bilbokning. Siffran = antal tillägg per zon.</p>';
    html += '<div class="pg-scroll pg-scroll-fit"><table class="pg-table pg-table-fit pg-table-barn"><thead><tr>' +
      '<th class="pg-th-time">Tid</th>';
    zones.forEach(function (z) {
      html += '<th title="' + esc(z.name) + '">' + esc(z.short.length > 4 ? z.short.slice(0, 4) : z.short) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (d) {
      html += '<tr><td class="pg-td-time">' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + '</td>';
      zones.forEach(function (z) {
        var list = bySlot[d.getTime() + '|' + z.id] || [];
        var sum = cellSummary(list);
        var tipExtra = '';
        if (list.length) {
          var fc = 0, bc = 0;
          list.forEach(function (b) {
            if (b.category === 'barnstol') fc++;
            else if (b.category === 'babyskydd') bc++;
          });
          tipExtra = z.name + ': ' +
            (fc ? fc + ' barnstol' : '') +
            (fc && bc ? ', ' : '') +
            (bc ? bc + ' babyskydd' : '');
        }
        var cell = '';
        if (sum) {
          var tip = tipExtra + (sum.tip ? ' · ' + sum.tip : '');
          cell = '<span class="pg-n pg-c-' + sum.conf + '" title="' + esc(tip) + '">' +
            esc(sum.text) + '</span>';
        }
        html += '<td class="pg-td-cell">' + cell + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderTimeline() {
    if (st.zoneTab === TAB_BARN) return renderBarnTimeline();
    var zid = st.zoneTab;
    if (!ZONE_BY_ID[zid]) zid = '293';
    return renderCarTimeline(zid);
  }

  function renderMorgon() {
    var m = st.morgon;
    if (!m || !m.buckets) return '';
    var max = 1;
    m.buckets.forEach(function (b) { if ((b.total || 0) > max) max = b.total; });
    var html = '<div class="pg-card pg-morgon"><h3>Morgonprognos · zon 292</h3>' +
      '<p class="pg-muted">' + esc(m.dateDisplay || '') + ' · totalt ' + (m.total || 0) +
      ' (inga kategorier i källan)</p><div class="pg-bars">';
    m.buckets.forEach(function (b) {
      var pct = Math.round(100 * (b.total || 0) / max);
      html += '<div class="pg-bar-row"><span class="pg-bar-lab">' + p2(b.hourFrom) +
        '&ndash;' + p2(b.hourTo) + '</span><div class="pg-bar-track"><div class="pg-bar-fill" style="width:' +
        pct + '%"></div></div><span class="pg-bar-n">' + (b.total || 0) + '</span></div>';
    });
    html += '</div></div>';
    return html;
  }

  function statusLine() {
    var s = st.status || {};
    var last = s.last_ok_at ? new Date(s.last_ok_at) : null;
    var lastTxt = last && !isNaN(last.getTime())
      ? p2(last.getHours()) + ':' + p2(last.getMinutes()) + ':' + p2(last.getSeconds())
      : '–';
    var stTxt = s.code_needed ? 'Kod behövs' : (s.status === 'ok' ? 'Uppdaterad' : (s.status || '–'));
    return '<div class="pg-status">Senaste uppdatering: <strong>' + esc(lastTxt) +
      '</strong> · ' + esc(stTxt) +
      '<br><span class="pg-muted">Tiderna är uppskattningar. Heldraget = säker, streckat = trolig, svagt = osäker. Blandat antal markeras med ?.</span></div>';
  }

  function paint() {
    if (!st.el) return;
    var tabs = '<div class="pg-tabs">' +
      '<button type="button" class="pg-tab' + (st.panel === 'schema' ? ' on' : '') + '" data-panel="schema">Schema</button>' +
      '<button type="button" class="pg-tab' + (st.panel === 'filter' ? ' on' : '') + '" data-panel="filter">Filter</button>' +
      '<button type="button" class="pg-tab' + (st.panel === 'notis' ? ' on' : '') + '" data-panel="notis">Notiser</button>' +
      (st.status && st.status.code_needed
        ? '<button type="button" class="pg-tab' + (st.panel === 'kod' ? ' on' : '') + '" data-panel="kod">Kod</button>'
        : '') +
      '</div>';

    var body = '';
    if (st.err) body += '<div class="pg-warn">' + esc(st.err) + '</div>';
    if (st.panel === 'kod' || (st.status && st.status.code_needed && st.panel === 'schema' && !(st.bookings || []).length)) {
      body += renderCode();
    } else if (st.panel === 'filter') {
      body += renderFilter();
    } else if (st.panel === 'notis') {
      body += renderNotis();
    } else {
      body += statusLine();
      body += '<div class="pg-legend"><span class="pg-n pg-c-saker">2</span> säker ' +
        '<span class="pg-n pg-c-trolig">2</span> trolig ' +
        '<span class="pg-n pg-c-osaker">2?</span> osäker/blandat</div>';
      body += renderZoneTabs();
      body += renderTimeline();
      body += renderMorgon();
    }

    st.el.innerHTML = '<div class="pg">' + tabs + body + '</div>';
    bind(st.el);
  }

  function bind(root) {
    root.querySelectorAll('[data-panel]').forEach(function (btn) {
      btn.onclick = function () { st.panel = btn.getAttribute('data-panel'); paint(); };
    });
    root.querySelectorAll('[data-ztab]').forEach(function (btn) {
      btn.onclick = function () {
        saveTab(btn.getAttribute('data-ztab'));
        paint();
      };
    });
    var codeEl = root.querySelector('#pg-code');
    if (codeEl) {
      codeEl.oninput = function () { st.codeInput = codeEl.value; };
      codeEl.onkeydown = function (e) { if (e.key === 'Enter') submitCode(); };
    }
    var save = root.querySelector('#pg-save-code');
    if (save) save.onclick = submitCode;

    root.querySelectorAll('[data-cat]').forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute('data-cat');
        var cats = loadCats();
        var i = cats.indexOf(k);
        if (i >= 0) { if (cats.length > 1) cats.splice(i, 1); }
        else cats.push(k);
        saveCats(cats);
        paint();
      };
    });
    root.querySelectorAll('[data-zone]').forEach(function (btn) {
      btn.onclick = function () {
        var z = btn.getAttribute('data-zone');
        if (z === '*') { saveZones(null); paint(); return; }
        var cur = loadZones() || [];
        var i = cur.indexOf(z);
        if (i >= 0) cur.splice(i, 1);
        else cur.push(z);
        if (ZONE_ORDER.length && cur.length >= ZONE_ORDER.length) saveZones(null);
        else saveZones(cur);
        paint();
      };
    });
    root.querySelectorAll('[data-wz]').forEach(function (btn) {
      btn.onclick = function () {
        toggleWatch(btn.getAttribute('data-wz'), btn.getAttribute('data-wc'));
      };
    });
  }

  P.render = function (el) {
    st.el = el;
    st.panel = 'schema';
    st.zoneTab = loadTab();
    paint();
    refresh();
    if (st.poll) clearInterval(st.poll);
    st.poll = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      refresh();
    }, 60000);
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'bev-push' && e.data.msg && String(e.data.msg.tag || '').indexOf('prognos') === 0) {
        toast((e.data.msg.title || 'Prognos') + (e.data.msg.body ? ' – ' + e.data.msg.body : ''), 8000);
        refresh();
      }
    });
  }

  P.stop = function () {
    if (st.poll) { clearInterval(st.poll); st.poll = null; }
  };
})();
