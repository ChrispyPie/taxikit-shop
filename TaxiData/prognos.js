/* Prognos: tidsschema över uppskattade förbokningar från Taxi Göteborgs prognosverktyg.
 * Koden sparas aldrig i appen – bara på servern. Vid 401 visas en prompt.
 * Kategorikoder (endast kommentar): A=Kombi, H=Miljöbil, Storbil, Övriga, F=Barnstol, 3=Babyskydd.
 * Bilbarnstol/babyskydd är tillägg till bilkategori – egna spalter sist i schemat.
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

  // Alla kategorier i schemat; barnstol/babyskydd sist (paras alltid med bil men eget spalt –
  // vi vet inte vilken bil de hör till när flera kommer samtidigt).
  var SCHEDULE_CATS = [
    // Koder (endast referens): A=Kombi, H=Miljöbil, F=Barnstol, 3=Babyskydd
    { k: 'app', head: 'Kombi', label: 'Kombi', child: false },
    { k: 'elbil', head: 'Miljöbil', label: 'Miljöbil', child: false },
    { k: 'storbil', head: 'Storbil', label: 'Storbil', child: false },
    { k: 'ovrigt', head: 'Övriga', label: 'Övriga', child: false },
    { k: 'barnstol', head: 'Barnstol', label: 'Barnstol', child: true },
    { k: 'babyskydd', head: 'Babyskydd', label: 'Babyskydd', child: true }
  ];
  var ALL_CATS = SCHEDULE_CATS;
  var CAT_LABEL = {};
  ALL_CATS.forEach(function (c) { CAT_LABEL[c.k] = c.label; });
  var ALL_CAT_KEYS = ALL_CATS.map(function (c) { return c.k; });
  var CAT_META = {};
  ALL_CATS.forEach(function (c) { CAT_META[c.k] = c; });

  var LS_CATS = 'prognos_cats';
  var LS_ZONES = 'prognos_zones';
  var LS_TAB = 'prognos_zone_tab';

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
  // script.js deklarerar TRIP_API_URL/TRIP_API_KEY med `const` → de hamnar INTE på window.
  // Läs dem som globala bindningar först (window.* används bara av testharnessen).
  function apiUrl() {
    return (typeof TRIP_API_URL !== 'undefined' && TRIP_API_URL) || window.TRIP_API_URL || 'https://lpfdryvukqmjlgenuzpb.supabase.co';
  }
  function apiKey() {
    return (typeof TRIP_API_KEY !== 'undefined' && TRIP_API_KEY) || window.TRIP_API_KEY || '';
  }
  function rpc(name, args) {
    args = args || {};
    args.p_token = token();
    var key = apiKey();
    return fetch(apiUrl() + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
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
      st.loadedOnce = true;
      if (st.status.code_needed) st.panel = 'kod';
      // Om vald flik filtrerats bort → byt till första synliga
      var vis = visibleZones();
      if (!vis.some(function (z) { return z.id === st.zoneTab; })) {
        saveTab(vis.length ? vis[0].id : '293');
      }
      // Ljud/notis för nya bokningar sköts globalt av prognos-notis.js (alla sidor)
      if (window.PROGNOS_NOTIS && PROGNOS_NOTIS.watchesChanged) PROGNOS_NOTIS.watchesChanged(st.watches);
    }).catch(function (e) {
      st.err = /invalid_session|28000/.test(String(e && e.message)) ? 'Du är utloggad. Logga in igen för att se prognosen.' : 'Kunde inte hämta prognos just nu.';
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
      if (window.PROGNOS_NOTIS && PROGNOS_NOTIS.watchesChanged) PROGNOS_NOTIS.watchesChanged(st.watches);
      paint();
    }).catch(function () { toast('Kunde inte spara bevakning.'); });
  }

  function ensurePushHint() {
    var B = window.BEVAKNING;
    var ps = B && B.pushState ? B.pushState() : 'unknown';
    if (ps === 'unknown' && B && B.checkPush && !st.pushChecking) {
      st.pushChecking = true;
      B.checkPush().then(function () { st.pushChecking = false; if (st.panel === 'notis') paint(); });
    }
    var info = '<p class="pg-muted">Du får en notis med ljud var du än är i appen, och som push när telefonen är låst eller appen stängd ' +
      '(samma som tåg och flyg i Ankomster). Inga notiser när du är utloggad.</p>';
    if (ps === 'on') return info + '<div class="pg-push-row"><span>🔔 Notiser med ljud är på</span>' +
      '<button type="button" class="pg-btn pg-btn-sm" data-pg-push="test">Testa</button></div>';
    if (ps === 'denied') return info + '<p class="pg-hint">🔕 Notiser är blockerade. Tillåt dem i webbläsarens inställningar för taxikit.shop.</p>';
    if ((ps === 'off' || ps === 'unknown') && 'PushManager' in window) return info +
      '<button type="button" class="pg-btn" data-pg-push="on">🔔 Aktivera ljudsignal/notiser</button>' +
      '<p class="pg-muted">Utan aktivering får du bara signal medan appen är öppen.</p>';
    return info + legacyPushHint();
  }
  function legacyPushHint() {
    if (!('PushManager' in window)) return '<p class="pg-hint">Den här webbläsaren kan inte ta emot push – du får signal medan appen är öppen.</p>';
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
    var html = '<div class="pg-card"><h3>Kategorier att visa</h3>' +
      '<p class="pg-muted">Barnstol och babyskydd paras alltid med en bilbokning, men visas i egna spalter (vi vet inte vilken bil de hör till).</p><div class="pg-chips">';
    ALL_CATS.forEach(function (c) {
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
      '<p class="pg-muted">Välj zon + kategori. Barnstol/babyskydd kan bevakas som egna kategorier.</p>';
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

  /** Antal öppna förbokningar per zon i schemafönstret (nu → +2 h) för valda kategorier. */
  function zoneCounts() {
    var cats = loadCats();
    var now = floor5(new Date()), end = addMin(now, 120), out = {};
    (st.bookings || []).forEach(function (b) {
      if (cats.indexOf(b.category) < 0) return;
      var d = floor5(new Date(b.estimated_at));
      if (d < now || d >= end) return;
      out[b.zone_id] = (out[b.zone_id] || 0) + 1;
    });
    return out;
  }

  function renderZoneTabs() {
    var vis = visibleZones();
    var cnt = zoneCounts();
    var html = '<div class="pg-ztabs" role="tablist">';
    vis.forEach(function (z) {
      var on = st.zoneTab === z.id;
      var n = cnt[z.id] || 0;
      html += '<button type="button" class="pg-ztab' + (on ? ' on' : '') + (n ? '' : ' pg-ztab-zero') + '" data-ztab="' + z.id +
        '" title="' + esc(z.name) + ' (' + z.id + ') · ' + n + ' förbokningar närmaste 2 h">' + esc(z.short) +
        ' <span class="pg-ztab-n">' + n + '</span></button>';
    });
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
    var cats = loadCats().filter(function (k) { return ALL_CAT_KEYS.indexOf(k) >= 0; });
    // Behåll schemaordning även om filter tar bort några
    cats = ALL_CAT_KEYS.filter(function (k) { return cats.indexOf(k) >= 0; });
    if (!cats.length) cats = ALL_CAT_KEYS.slice();
    var now = floor5(new Date());
    var end = addMin(now, 120);
    var rows = [];
    for (var t0 = new Date(now); t0 < end; t0 = addMin(t0, 5)) rows.push(new Date(t0));

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

    var html = '<div class="pg-scroll pg-scroll-fit"><table class="pg-table pg-table-fit pg-table-diag"><thead><tr>' +
      '<th class="pg-th-time">Tid</th>';
    cats.forEach(function (k) {
      var meta = CAT_META[k] || { head: k, child: false };
      var cls = 'pg-th-cat' + (meta.child ? ' pg-th-child' : '');
      html += '<th class="' + cls + '"><span class="pg-th-rot">' + esc(meta.head) + '</span></th>';
    });
    // Tom reservkolumn så sista diagonala rubriken inte klipps i högerkant
    html += '<th class="pg-th-spacer" aria-hidden="true"></th>';
    html += '</tr></thead><tbody>';
    rows.forEach(function (d) {
      html += '<tr><td class="pg-td-time">' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + '</td>';
      cats.forEach(function (k) {
        var meta = CAT_META[k] || {};
        var sum = cellSummary(bySlot[d.getTime() + '|' + k]);
        var tdCls = 'pg-td-cell' + (meta.child ? ' pg-td-child' : '');
        html += '<td class="' + tdCls + '">' + countCell(sum) + '</td>';
      });
      html += '<td class="pg-td-spacer" aria-hidden="true"></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderTimeline() {
    var zid = st.zoneTab;
    if (!ZONE_BY_ID[zid]) zid = '293';
    if (!st.err && st.loadedOnce && !(zoneCounts()[zid])) {
      return '<div class="pg-card pg-empty-card">Inga förbokningar i ' + esc(ZONE_BY_ID[zid].name) +
        ' de närmaste 2 timmarna.</div>';
    }
    return renderCarTimeline(zid);
  }

  var WD = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
  // Relativ dag räknas på kalenderdatum (lokal tid): samma datum = "i dag"
  // (även 00:00–04:00, då morgonen ligger framför en samma natt), nästa datum = "i morgon".
  function morgonDiff(m) {
    var d = m && m.dateIso ? new Date(m.dateIso + 'T12:00:00') : null;
    if (!d || isNaN(d.getTime())) return null;
    var today = new Date(); today.setHours(12, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }
  function morgonDay(m) {
    var d = m && m.dateIso ? new Date(m.dateIso + 'T12:00:00') : null;
    if (!d || isNaN(d.getTime())) return esc((m && m.dateDisplay) || '');
    var diff = morgonDiff(m);
    var rel = diff === 0 ? 'i dag, ' : diff === 1 ? 'i morgon, ' : '';
    return rel + WD[d.getDay()] + ' ' + esc(m.dateDisplay || (d.getDate() + '/' + (d.getMonth() + 1)));
  }
  // Pågående morgon: samma datum och klockan 04:00–08:59 → aktuell timme, annars -1
  function morgonActiveHour(m) {
    if (morgonDiff(m) !== 0) return -1;
    var h = new Date().getHours();
    return h >= 4 && h < 9 ? h : -1;
  }
  function hhmm(iso, sec) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '–';
    return p2(d.getHours()) + ':' + p2(d.getMinutes()) + (sec ? ':' + p2(d.getSeconds()) : '');
  }
  function morgonPeak(m, fromHour) {
    var bs = (m && m.buckets) || [], pi = -1;
    bs.forEach(function (b, i) { if ((fromHour == null || fromHour < 0 || b.hourTo > fromHour) && (b.total || 0) > 0 && (pi < 0 || b.total > bs[pi].total)) pi = i; });
    return pi;
  }

  // Liten rad i Schema som leder till Morgon-fliken (folk tittar ofta på den)
  function renderMorgonTeaser() {
    var m = st.morgon;
    if (!m || !m.buckets) return '';
    var ah = morgonActiveHour(m), cur = null;
    if (ah >= 0) m.buckets.forEach(function (b) { if (b.hourFrom === ah) cur = b; });
    return '<button type="button" class="pg-morgon-teaser" data-panel="morgon">☀️ Morgonprognos ' +
      morgonDay(m) + ': <strong>' + (m.total || 0) + '</strong> bokningar till Landvetter' +
      (cur ? ' · pågår ' + p2(cur.hourFrom) + '–' + p2(cur.hourTo) + ': <strong>' + (cur.total || 0) + '</strong> kvar' : '') +
      ' <span aria-hidden="true">›</span></button>';
  }

  // Morgon-fliken. Samma innehåll som prognossajtens "Morgonprognos":
  // bokningar till Landvetter (lämnazon 292) 04:00–09:00, antal per timme.
  function renderMorgon() {
    var m = st.morgon;
    if (!m || !m.buckets) {
      return '<div class="pg-card pg-empty-card">' + (st.loadedOnce ? 'Ingen morgonprognos ännu.' : 'Laddar morgonprognos…') + '</div>';
    }
    var max = 1;
    m.buckets.forEach(function (b) { if ((b.total || 0) > max) max = b.total; });
    var ah = morgonActiveHour(m);
    var pi = morgonPeak(m, ah); // under pågående morgon: topp bland timmar som inte är klara
    var peak = pi >= 0 ? p2(m.buckets[pi].hourFrom) + '–' + p2(m.buckets[pi].hourTo) : '';
    var html = '<div class="pg-card pg-morgon">' +
      '<div class="pg-mo-head"><div><h3>Morgonprognos</h3>' +
      '<div class="pg-mo-date">' + morgonDay(m) + '</div>' +
      '<div class="pg-muted">Bokningar till Landvetter, 04:00–09:00</div></div>' +
      '<span class="pg-mo-chip">Lämnazon ' + esc(m.zone || '292') + '</span></div>' +
      '<div class="pg-mo-total"><span class="pg-mo-tlab">Bokningar totalt</span><span class="pg-mo-tnum">' + (m.total || 0) + '</span>' +
      '<span class="pg-muted">' + (ah >= 0 ? 'Morgonen pågår – kvarvarande bokningar' + (m.total > 0 ? ' · flest ' + peak : '') : (m.total > 0 ? 'Flest bokningar ' + peak : 'Ingen data ännu för morgonen')) + '</span></div>' +
      '<div class="pg-mo-rows">';
    m.buckets.forEach(function (b, i) {
      var pct = Math.round(100 * (b.total || 0) / max);
      var pk = i === pi ? ' pk' : '';
      var state = '', tag = '';
      if (ah >= 0 && b.hourTo <= ah) { state = ' klar'; tag = '<span class="pg-mo-tag">klar</span>'; }
      else if (ah >= 0 && b.hourFrom === ah) { state = ' nu'; tag = '<span class="pg-mo-tag">pågår · ' + (b.total || 0) + ' kvar</span>'; }
      html += '<div class="pg-mo-row' + pk + state + '"><span class="pg-mo-lab">' + p2(b.hourFrom) + ':00–' + p2(b.hourTo) + ':00' + tag + '</span>' +
        '<div class="pg-bar-track"><div class="pg-bar-fill' + pk + '" style="width:' + pct + '%"></div></div>' +
        '<span class="pg-mo-n">' + (b.total || 0) + '</span></div>';
    });
    html += '</div>' +
      '<p class="pg-muted pg-mo-note">Antal bokningar per timme, inte exakta tider. Källan delar inte upp på bilkategori (t.ex. storbil). ' +
      'Under pågående morgon räknas bara bokningar som är kvar; efter 09:00 visas nästa morgon.</p>' +
      '<p class="pg-muted pg-mo-upd">Uppdaterad ' + esc(hhmm(m.generated_at, true)) + ' · uppdateras automatiskt varje minut</p>' +
      '</div>';
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

  // Ritar bara när Prognos är den öppna sidan – annars skulle en sen
  // uppdatering skriva över startsidan/en annan sida (samma #content-ruta).
  function onPage() {
    return !!st.el && st.el.isConnected && localStorage.getItem('taxi_view') === P.id;
  }

  function paint() {
    if (!onPage()) return;
    var tabs = '<div class="pg-tabs">' +
      '<button type="button" class="pg-tab' + (st.panel === 'schema' ? ' on' : '') + '" data-panel="schema">Schema</button>' +
      '<button type="button" class="pg-tab' + (st.panel === 'morgon' ? ' on' : '') + '" data-panel="morgon">Morgon</button>' +
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
    } else if (st.panel === 'morgon') {
      body += renderMorgon();
    } else {
      body += statusLine();
      body += '<div class="pg-legend"><span class="pg-n pg-c-saker">2</span> säker ' +
        '<span class="pg-n pg-c-trolig">2</span> trolig ' +
        '<span class="pg-n pg-c-osaker">2?</span> osäker/blandat</div>';
      body += renderZoneTabs();
      body += renderTimeline();
      body += renderMorgonTeaser();
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
    root.querySelectorAll('[data-pg-push]').forEach(function (btn) {
      btn.onclick = function () {
        var B = window.BEVAKNING; if (!B) return;
        var p = btn.getAttribute('data-pg-push') === 'test' ? B.testPush() : B.enablePush();
        Promise.resolve(p).then(function () { paint(); });
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
      if (!onPage()) { clearInterval(st.poll); st.poll = null; return; }
      if (document.visibilityState === 'hidden') return;
      refresh();
    }, 60000);
  };

  // Anropas av prognos-notis.js när en ny bokning ringer (uppdatera schemat om sidan är öppen)
  P.refresh = function () { if (onPage()) return refresh(); };

  P.stop = function () {
    if (st.poll) { clearInterval(st.poll); st.poll = null; }
  };
})();
