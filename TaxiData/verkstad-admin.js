/* Admin › Bil & verkstad (verkstadstimmar). Felanmälan, behov och underhåll hanteras i appen (verkstad.js);
 * här visas en sammanfattning med länk dit.
 * Verkstadstimmar: ägaren (och S admin) godkänner eller nekar förarnas verkstadstid,
 * ser summor per förare för en period och ändrar timpriset.
 * Använder admin.html:s rpc(), esc() och errText(). Behörigheten kontrolleras på servern
 * (admin_workshop_list, admin_workshop_decide, set_workshop_rate). Namn skickas bara till ägaren.
 */
(function () {
  'use strict';
  var MONL = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  var WD = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
  var STATUS = { pending: 'Väntar', approved: 'Godkänd', rejected: 'Nekad' };
  var ERR = {
    overlap: 'Föraren har redan godkänd eller väntande tid som krockar med den här.',
    not_found: 'Posten finns inte längre.',
    bad_rate: 'Timpriset ska vara ett tal mellan 0 och 10 000 kr.',
    comment_too_long: 'Kommentaren får vara högst 500 tecken.',
    bad_period: 'Ogiltig period.'
  };
  var A = window.VERKSTAD_ADMIN = { data: null, month: null, open: {}, busy: false, el: null };

  (function css() {
    var s = document.createElement('style');
    s.textContent =
      '.vka-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 12px}' +
      '.vka-bar button{width:44px;height:40px;font-size:18px}.vka-bar b{font-size:16px}' +
      '.vka-card{background:#fff;border-radius:12px;padding:12px;margin-bottom:10px}' +
      '.vka-h{font-size:12px;font-weight:600;color:#718096;margin:16px 0 6px;text-transform:uppercase}' +
      '.vka-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}' +
      '.vka-who{font-weight:600}.vka-meta{font-size:13px;color:#4a5568;margin-top:4px}' +
      '.vka-com{font-size:13px;margin-top:6px;background:#f7fafc;border-radius:6px;padding:6px 8px}' +
      '.vka-chip{font-size:11px;padding:2px 8px;border-radius:10px;white-space:nowrap}' +
      '.vka-chip.pending{background:#fefcbf;color:#975a16}.vka-chip.approved{background:#c6f6d5;color:#276749}.vka-chip.rejected{background:#fed7d7;color:#c53030}' +
      '.vka-card textarea{width:100%;margin-top:8px;padding:8px;border:1px solid #cbd5e0;border-radius:6px;font:inherit;font-size:14px;min-height:40px}' +
      '.vka-btns{display:flex;gap:8px;margin-top:8px}.vka-btns button{flex:1;padding:10px;font-size:15px}' +
      '.vka-ok{background:#276749!important;border-color:#276749!important;color:#fff!important}.vka-no{border-color:#c53030!important;color:#c53030!important}' +
      '.vka-tot{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf2f7;font-size:14px;gap:8px}.vka-tot:last-child{border-bottom:none}' +
      '.vka-tot .r{text-align:right}.vka-tot small{display:block;color:#718096;font-size:12px}' +
      '.vka-rate{display:flex;justify-content:space-between;align-items:center;gap:8px}' +
      '.vka-note{font-size:12px;color:#718096;text-align:center;margin:8px 0 16px}' +
      '.vka-badge{display:inline-block;min-width:20px;height:20px;line-height:20px;border-radius:10px;background:#e53e3e;color:#fff;font-size:12px;font-weight:700;padding:0 6px;margin-left:4px}' +
      '.icon{position:relative}.icon .vka-badge{position:absolute;top:6px;right:6px;margin:0}';
    document.head.appendChild(s);
  })();

  function p2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function dur(m) { m = Math.round(m || 0); var h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min'; }
  function kr(n) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }
  function dl(d) { return WD[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); }
  function hm(d) { return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function span(s, e) {
    var a = new Date(s), b = new Date(e), same = a.toDateString() === b.toDateString();
    return dl(a) + ' ' + hm(a) + '–' + (same ? '' : dl(b) + ' ') + hm(b);
  }
  function who(x) { return x.namn ? esc(x.namn) + ' <span style="color:#718096;font-weight:400">(' + esc(x.driver_id) + ')</span>' : esc(x.driver_id); }
  function err(e) { return ERR[e && e.message] || errText(e); }

  A.load = function () {
    if (!A.month) { var n = new Date(); A.month = new Date(n.getFullYear(), n.getMonth(), 1); }
    var from = A.month, to = new Date(A.month.getFullYear(), A.month.getMonth() + 1, 0);
    A.data = null; if (typeof render === 'function') render();
    return rpc('admin_workshop_list', { p_from: ymd(from), p_to: ymd(to) })
      .then(function (d) {
        A.data = d; A.pending = d.pending_count || 0; render();
        // Sammanfattning av bilarna (samma data som appen visar)
        return rpc('get_bil', {}).then(function (b) { A.bil = b; render(); }).catch(function () {});
      })
      .catch(function (e) { A.data = { error: err(e) }; render(); });
  };
  A.count = function () {
    return rpc('workshop_pending_count', {}).then(function (n) { A.pending = +n || 0; return A.pending; }).catch(function () { return 0; });
  };
  A.badge = function () { return A.pending > 0 ? '<span class="vka-badge" aria-label="' + A.pending + ' väntar">' + A.pending + '</span>' : ''; };
  A.shift = function (k) { A.month = new Date(A.month.getFullYear(), A.month.getMonth() + k, 1); A.load(); };

  A.decide = function (id, status) {
    if (A.busy) return;
    var t = document.getElementById('vka-c-' + id), c = t ? t.value : '';
    A.busy = true;
    rpc('admin_workshop_decide', { p_id: id, p_status: status, p_comment: c || null })
      .then(function () { A.busy = false; delete A.open[id]; return A.load(); })
      .catch(function (e) { A.busy = false; alert(err(e)); A.load(); });
  };
  A.reopen = function (id) { A.open[id] = !A.open[id]; render(); };
  A.setRate = function () {
    var cur = A.data && A.data.rate, v = prompt('Nytt timpris för verkstadstid (kr/h):', cur);
    if (v == null) return;
    var n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    if (!(n >= 0 && n <= 10000)) { alert(ERR.bad_rate); return; }
    rpc('set_workshop_rate', { p_rate: n }).then(A.load).catch(function (e) { alert(err(e)); });
  };

  function card(x, decided) {
    var h = '<div class="vka-card"><div class="vka-top"><div><div class="vka-who">' + who(x) + '</div>' +
      '<div class="vka-meta">' + esc(span(x.start, x.end)) + '<br>' + esc(x.car) + ' · ' + dur(x.minutes) + ' · ' + kr(x.kr) + '</div></div>' +
      '<span class="vka-chip ' + x.status + '">' + STATUS[x.status] + '</span></div>';
    if (x.comment) h += '<div class="vka-com">💬 ' + esc(x.comment) + '</div>';
    if (x.issue_id) {
      var iss = ((A.bil && A.bil.issues) || []).filter(function (i) { return i.id === x.issue_id; })[0];
      h += '<div class="vka-meta">🔗 Felanmälan' + (iss ? ': ' + esc(String(iss.body || '').slice(0, 80)) : '') + '</div>';
    }
    if (x.decision_comment) h += '<div class="vka-meta">Din kommentar: ' + esc(x.decision_comment) + '</div>';
    if (!decided || A.open[x.id]) {
      h += '<textarea id="vka-c-' + x.id + '" maxlength="500" placeholder="Kommentar till föraren (valfri)">' + esc(decided ? (x.decision_comment || '') : '') + '</textarea>' +
        '<div class="vka-btns">' +
        (x.status !== 'rejected' || !decided ? '<button class="vka-no" onclick="VERKSTAD_ADMIN.decide(' + x.id + ',\'rejected\')">Neka</button>' : '') +
        (x.status !== 'approved' || !decided ? '<button class="vka-ok" onclick="VERKSTAD_ADMIN.decide(' + x.id + ',\'approved\')">Godkänn</button>' : '') +
        (decided ? '<button onclick="VERKSTAD_ADMIN.reopen(' + x.id + ')">Avbryt</button>' : '') + '</div>';
    } else {
      h += '<div class="vka-btns"><button onclick="VERKSTAD_ADMIN.reopen(' + x.id + ')">Ändra beslut</button></div>';
    }
    return h + '</div>';
  }

  function bilSummary() {
    var b = A.bil; if (!b) return '';
    var cars = b.cars || [], iss = b.issues || [], m = b.maint || [];
    var stop = cars.filter(function (c) { return c.blocking; }).length;
    var faults = iss.filter(function (i) { return i.kind === 'fault' && i.status !== 'klar'; }).length;
    var sup = iss.filter(function (i) { return i.kind === 'supply' && i.status !== 'klar'; }).length;
    var late = m.filter(function (x) { return x.status === 'plan' && x.level === 2; }).length;
    var soon = m.filter(function (x) { return x.status === 'plan' && x.level === 1; }).length;
    var sug = m.filter(function (x) { return x.status === 'forslag'; }).length;
    var rows = [];
    if (stop) rows.push('<b style="color:#c53030">🛑 ' + stop + ' bil' + (stop === 1 ? '' : 'ar') + ' står</b>');
    rows.push('⚠️ ' + faults + (faults === 1 ? ' öppet fel' : ' öppna fel'));
    rows.push('🧴 ' + sup + (sup === 1 ? ' sak behövs' : ' saker behövs'));
    rows.push('🗓️ Underhåll: ' + (late ? late + ' försenat, ' : '') + soon + ' snart' + (sug ? ', ' + sug + ' förslag' : ''));
    return '<div class="vka-card"><div class="vka-who">Bilarna just nu</div><div class="vka-meta">' + rows.join('<br>') + '</div>' +
      '<button style="margin-top:10px;width:100%;padding:10px;border-radius:8px" onclick="VERKSTAD_ADMIN.openApp()">Hantera i appen › Bil & verkstad</button></div>';
  }
  A.openApp = function () { localStorage.setItem('taxi_view', 'verkstad'); localStorage.setItem('bil_tab', 'fel'); location.href = 'index.html'; };

  A.render = function (content) {
    var d = A.data;
    if (!d) { content.innerHTML = '<div class="section"><p style="padding:16px;">Laddar...</p></div>'; return; }
    if (d.error) { content.innerHTML = '<div class="section"><p style="padding:16px;">' + esc(d.error) + '</p></div>'; return; }
    var now = new Date(), isNow = A.month.getFullYear() === now.getFullYear() && A.month.getMonth() === now.getMonth();
    var pend = (d.entries || []).filter(function (x) { return x.status === 'pending'; });
    var done = (d.entries || []).filter(function (x) { return x.status !== 'pending'; });
    var h = bilSummary();
    h += '<div class="vka-h" style="margin-top:0">Verkstadstimmar</div>';
    h += '<div class="vka-card vka-rate"><span>Timpris: <b>' + kr(d.rate) + '/h</b></span><button onclick="VERKSTAD_ADMIN.setRate()">Ändra</button></div>';
    h += '<div class="vka-h">Väntar på beslut (' + pend.length + ')</div>';
    h += pend.length ? pend.map(function (x) { return card(x, false); }).join('') : '<div class="vka-card" style="color:#718096">Inget väntar just nu.</div>';
    h += '<div class="vka-bar"><button onclick="VERKSTAD_ADMIN.shift(-1)" aria-label="Föregående månad">‹</button><b>' +
      MONL[A.month.getMonth()].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + A.month.getFullYear() + '</b>' +
      '<button onclick="VERKSTAD_ADMIN.shift(1)" aria-label="Nästa månad"' + (isNow ? ' disabled style="opacity:.4"' : '') + '>›</button></div>';
    var tot = (d.totals || []).slice().sort(function (a, b) { return b.approved_min - a.approved_min || b.pending_min - a.pending_min; });
    h += '<div class="vka-h" style="margin-top:0">Summa per förare</div><div class="vka-card">';
    if (!tot.length) h += '<div style="color:#718096">Ingen verkstadstid den här månaden.</div>';
    var sumMin = 0, sumKr = 0;
    tot.forEach(function (t) {
      sumMin += t.approved_min; sumKr += t.approved_kr;
      h += '<div class="vka-tot"><span>' + who(t) + (t.pending_min ? '<small>Väntar: ' + dur(t.pending_min) + '</small>' : '') + (t.rejected_min ? '<small>Nekat: ' + dur(t.rejected_min) + '</small>' : '') + '</span>' +
        '<span class="r"><b>' + kr(t.approved_kr) + '</b><small>' + dur(t.approved_min) + ' godkänt</small></span></div>';
    });
    if (tot.length > 1) h += '<div class="vka-tot"><b>Totalt</b><span class="r"><b>' + kr(sumKr) + '</b><small>' + dur(sumMin) + '</small></span></div>';
    h += '</div>';
    h += '<div class="vka-h">Beslutade i månaden (' + done.length + ')</div>';
    h += done.length ? done.map(function (x) { return card(x, true); }).join('') : '<div class="vka-card" style="color:#718096">Inga beslut den här månaden.</div>';
    h += '<div class="vka-note">Godkänd tid betalas med timpriset som gällde när den godkändes. Alla beslut sparas i Chaufförer › Logg.' +
      (d.named ? '' : ' Du ser förar-ID, inte namn.') + '</div>';
    content.innerHTML = h;
  };
})();
