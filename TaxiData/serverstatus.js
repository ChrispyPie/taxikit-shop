// Serverstatus-lampa: visar om servern som resedatan hämtas från svarade vid senaste försöket.
// Bygger på scraperns egna körningar (loggas i Supabase), inga anrop görs mot servern från webbläsaren.
(function () {
  var API = 'https://lpfdryvukqmjlgenuzpb.supabase.co';
  var KEY = 'sb_publishable_7LwIOZ5ygRvJqJKFxl4cNQ_LvrzrHrP';
  var STALE_MS = 135 * 60 * 1000; // ingen kontroll på 2 h 15 min = gul

  function sthlmParts(d) {
    var p = {};
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p;
  }
  // Tid i svensk tid: "14:05", "igår 23:10" eller "22/10 08:15"
  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts), p = sthlmParts(d), n = sthlmParts(new Date()), y = sthlmParts(new Date(Date.now() - 864e5));
    var hm = p.hour + ':' + p.minute;
    if (p.year === n.year && p.month === n.month && p.day === n.day) return hm;
    if (p.year === y.year && p.month === y.month && p.day === y.day) return 'igår ' + hm;
    return p.day + '/' + p.month + ' ' + hm;
  }
  window.fmtSthlmTime = fmtTime;

  function paint(el, color, text, title) {
    el.innerHTML = '';
    el.className = 'server-status server-status-' + color;
    var dot = document.createElement('span'); dot.className = 'server-status-lamp';
    var t = document.createElement('span'); t.textContent = text;
    el.appendChild(dot); el.appendChild(t);
    el.title = title || '';
  }

  async function refresh(el) {
    var token = localStorage.getItem('taxi_session') || '';
    if (!token) { el.style.display = 'none'; return; }
    el.style.display = '';
    try {
      var res = await fetch(API + '/rest/v1/rpc/get_server_status', {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var s = await res.json();
      var now = s.now ? new Date(s.now).getTime() : Date.now();
      var lastAt = s.last_attempt_at ? new Date(s.last_attempt_at).getTime() : 0;
      if (s.last_result === 'down') {
        paint(el, 'red', 'Servern är nere sedan ' + fmtTime(s.down_since || s.last_attempt_at) + ' – datan kan vara gammal',
          'Senaste försök ' + fmtTime(s.last_attempt_at) + (s.last_ok_at ? ', senast OK ' + fmtTime(s.last_ok_at) : ''));
      } else if (s.last_result === 'up' && now - lastAt <= STALE_MS) {
        paint(el, 'green', 'Servern är uppe', 'Senaste kontroll ' + fmtTime(s.last_attempt_at) + (s.data_updated_at ? ', data hämtad ' + fmtTime(s.data_updated_at) : ''));
      } else if (s.last_result === 'up') {
        paint(el, 'yellow', 'Ingen kontroll sedan ' + fmtTime(s.last_attempt_at) + ' – datan kan vara gammal', 'Servern svarade vid senaste kontrollen');
      } else {
        paint(el, 'yellow', 'Serverstatus okänd', '');
      }
    } catch (e) {
      paint(el, 'yellow', 'Serverstatus okänd', '');
    }
  }

  window.initServerStatus = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!document.getElementById('server-status-css')) {
      var st = document.createElement('style'); st.id = 'server-status-css';
      st.textContent = '.server-status{display:flex;align-items:center;justify-content:center;gap:8px;font-size:0.82rem;padding:6px 10px;margin:8px auto 0;width:calc(100% - 24px);box-sizing:border-box;border-radius:999px;max-width:520px;background:#f7fafc;color:#2d3748}' +
        '.server-status-lamp{width:10px;height:10px;border-radius:50%;flex:0 0 10px;background:#a0aec0}' +
        '.server-status-green .server-status-lamp{background:#22c55e;box-shadow:0 0 6px #22c55e}' +
        '.server-status-red{background:#fef2f2;color:#991b1b}.server-status-red .server-status-lamp{background:#ef4444;box-shadow:0 0 6px #ef4444}' +
        '.server-status-yellow{background:#fffbeb;color:#92400e}.server-status-yellow .server-status-lamp{background:#f59e0b;box-shadow:0 0 6px #f59e0b}';
      document.head.appendChild(st);
    }
    refresh(el);
    if (!el._timer) el._timer = setInterval(function () { if (!document.hidden) refresh(el); }, 5 * 60 * 1000);
    if (!el._vis) { el._vis = true; document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(el); }); }
  };
})();
