/* Prognos-notiser globalt i hela appen (som Ankomster: tåg/flyg).
 * - Laddas på alla sidor (index.html). Gäller bara när man är inloggad (taxi_session finns).
 * - I appen: kollar nya förbokningar varje minut för de zon+kategori man bevakar (Prognos → Notiser),
 *   oavsett vilken sida man är på, och ringer med samma ljud/vibration/toast som Ankomster (BEVAKNING.ring).
 * - Låst telefon / stängd app: servern (prognos-sync) skickar webbnotis via samma push-prenumeration
 *   som Ankomster. Ingen push till utloggade: utloggning avregistrerar push (BEVAKNING.logout) och servern
 *   skickar bara till förare med giltig session.
 * - Samma bokning ger bara en signal även om både push och appens egen koll ser den (avdubblering per tagg).
 * Ångra: ta bort <script src="prognos-notis.js"> i index.html (se docs/prognos/UNDO.md).
 */
(function () {
  'use strict';
  var N = window.PROGNOS_NOTIS = {};
  var POLL_MS = 60000, WATCH_TTL = 5 * 60000, DEDUP_MS = 10 * 60000;
  var st = { watches: null, watchesAt: 0, seen: null, busy: false, timer: null, recent: {} };

  function apiUrl() { return (typeof TRIP_API_URL !== 'undefined' && TRIP_API_URL) || window.TRIP_API_URL || 'https://lpfdryvukqmjlgenuzpb.supabase.co'; }
  function apiKey() { return (typeof TRIP_API_KEY !== 'undefined' && TRIP_API_KEY) || window.TRIP_API_KEY || ''; }
  function token() { return localStorage.getItem('taxi_session') || ''; }
  function loggedIn() { return !!token() && localStorage.getItem('taxi_logged_in') === '1'; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }

  var CAT_SV = { app: 'Kombi', elbil: 'Miljöbil', storbil: 'Storbil', ovrigt: 'Övriga', barnstol: 'Barnstol', babyskydd: 'Babyskydd' };
  var ZONE_SV = { '293': 'Landvetter flygplats', '161': 'Essity', '163': 'Astra', '406': 'Volvo', '432': 'Volvo Cars Torslanda', '15': 'Hotell Draken', '290': 'Magasinet' };

  function rpc(name, args) {
    args = args || {}; args.p_token = token();
    var key = apiKey();
    return fetch(apiUrl() + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.text().then(function (t) {
        var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var er = new Error((b && b.message) || ('HTTP ' + r.status)); er.code = b && b.code; throw er; }
        return b;
      });
    });
  }

  function tagOf(zone, cat) { return 'prognos-' + zone + '-' + cat; }
  function watched(b) {
    return (st.watches || []).some(function (w) {
      return String(w.zone_id) === String(b.zone_id) && (w.category === b.category || w.category === '*');
    });
  }
  // Avdubblering: samma zon+kategori+tid ringer en gång (push och appens egen koll kan se samma bokning).
  function fresh(key) {
    var now = Date.now();
    Object.keys(st.recent).forEach(function (k) { if (now - st.recent[k] > DEDUP_MS) delete st.recent[k]; });
    if (st.recent[key]) return false;
    st.recent[key] = now; return true;
  }
  function ring(title, body) {
    var text = title + (body ? ' – ' + body : '');
    if (window.BEVAKNING && BEVAKNING.ring) BEVAKNING.ring(text);
    else if (window.showToast) window.showToast(text);
    if (window.PROGNOS && PROGNOS.refresh) { try { PROGNOS.refresh(); } catch (e) {} }
  }

  function tick() {
    if (!loggedIn()) { st.watches = null; st.seen = null; return Promise.resolve(); }
    if (st.busy || document.visibilityState === 'hidden') return Promise.resolve();
    st.busy = true;
    var needW = !st.watches || Date.now() - st.watchesAt > WATCH_TTL;
    return (needW ? rpc('prognos_watch_list').then(function (w) { st.watches = w || []; st.watchesAt = Date.now(); }) : Promise.resolve())
      .then(function () {
        if (!st.watches.length) { st.seen = null; return; }
        return rpc('prognos_list_bookings').then(function (list) {
          list = list || [];
          var first = !st.seen; if (first) st.seen = {};
          var now = Date.now(), hits = [];
          list.forEach(function (b) {
            if (st.seen[b.id]) return;
            st.seen[b.id] = 1;
            if (first || b.status === 'canceled' || Date.parse(b.estimated_at) < now) return;
            if (watched(b)) hits.push(b);
          });
          hits.forEach(function (b) {
            var t = new Date(b.estimated_at);
            var key = tagOf(b.zone_id, b.category) + '@' + p2(t.getHours()) + p2(t.getMinutes());
            if (!fresh(key)) return;
            // Spara i notisflödet (samma nyckel som en push om samma bokning, så den bara syns en gång)
            if (window.NOTIS && NOTIS.add) NOTIS.add({ key: 'prognos|' + key + '|' + t.getFullYear() + p2(t.getMonth() + 1) + p2(t.getDate()), kind: 'prognos',
              tag: tagOf(b.zone_id, b.category), title: 'Ny förbokning', body: (ZONE_SV[b.zone_id] || b.zone_name || b.zone_id) + ' · ' + (CAT_SV[b.category] || b.category) +
              ' · ca ' + p2(t.getHours()) + ':' + p2(t.getMinutes()) });
            ring('Ny förbokning', (ZONE_SV[b.zone_id] || b.zone_name || b.zone_id) + ' · ' + (CAT_SV[b.category] || b.category) +
              ' · ca ' + p2(t.getHours()) + ':' + p2(t.getMinutes()));
          });
        });
      })
      .catch(function (e) { if (e && e.code === '28000') { st.watches = null; st.seen = null; } })
      .then(function () { st.busy = false; });
  }

  // Push som kom medan appen är öppen (sw.js → 'bev-push'). Anropas från bevakning.js för prognos-taggar.
  N.onPush = function (msg) {
    if (!loggedIn()) return;
    msg = msg || {};
    var m = /ca (\d\d):(\d\d)/.exec(msg.body || '');
    var key = String(msg.tag || 'prognos') + (m ? '@' + m[1] + m[2] : '@' + Date.now());
    if (!fresh(key)) return;
    ring(msg.title || 'Ny förbokning', msg.body || '');
  };
  // Prognos-sidan anropar detta när bevakningar ändras
  N.watchesChanged = function (list) { st.watches = list || []; st.watchesAt = Date.now(); };
  N.logout = function () { st.watches = null; st.seen = null; st.recent = {}; };
  N.tick = tick;
  N._state = st;

  // Notisklick på en prognos-notis: öppna Prognos
  try {
    if (new URLSearchParams(location.search).get('sida') === 'prognos') {
      localStorage.setItem('taxi_view', 'prognos');
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) {}
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'bev-open' && String(e.data.tag || '').indexOf('prognos') === 0 &&
        typeof window.openItem === 'function' && window.PROGNOS && loggedIn()) window.openItem(PROGNOS.id);
  });

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') tick(); });
  st.timer = setInterval(tick, POLL_MS);
  setTimeout(tick, 1500);
})();
