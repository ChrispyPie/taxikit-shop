/* Admin › Bil & verkstad (verkstadstimmar). Felanmälan, behov och underhåll hanteras i appen (verkstad.js);
 * här visas en sammanfattning med länk dit.
 * Verkstadstimmar: ägaren (och S admin) godkänner eller nekar förarnas verkstadstid,
 * kan fråga föraren (tråd fram och tillbaka tills beslut), ser månadens summa per förare
 * (kan laddas ner som CSV/kopieras) och ändrar timpriset.
 * Använder admin.html:s rpc(), esc() och errText(). Behörigheten kontrolleras på servern
 * (admin_workshop_list, admin_workshop_decide, workshop_ask, set_workshop_rate). Namn skickas bara till ägaren.
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
    comment_too_long: 'Texten är för lång.',
    need_text: 'Skriv frågan till föraren först.',
    bad_period: 'Ogiltig period.'
  };
  var A = window.VERKSTAD_ADMIN = { data: null, month: null, open: {}, busy: false, el: null };

  (function css() {
    var s = document.createElement('style');
    s.textContent =
      '.vka-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 12px}' +
      '.vka-bar button{width:44px;height:40px;font-size:calc(18px * var(--font-scale, 1))}.vka-bar b{font-size:calc(16px * var(--font-scale, 1))}' +
      '.vka-card{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px}' +
      '.vka-h{font-size:calc(12px * var(--font-scale, 1));font-weight:600;color:var(--c-718096);margin:16px 0 6px;text-transform:uppercase}' +
      '.vka-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}' +
      '.vka-who{font-weight:600}.vka-meta{font-size:calc(13px * var(--font-scale, 1));color:var(--c-4a5568);margin-top:4px}' +
      '.vka-com{font-size:calc(13px * var(--font-scale, 1));margin-top:6px;background:var(--c-f7fafc);border-radius:6px;padding:6px 8px}' +
      '.vka-chip{font-size:calc(11px * var(--font-scale, 1));padding:2px 8px;border-radius:10px;white-space:nowrap}' +
      '.vka-chip.pending{background:var(--c-fefcbf);color:var(--c-975a16)}.vka-chip.approved{background:var(--c-c6f6d5);color:var(--c-276749)}.vka-chip.rejected{background:var(--c-fed7d7);color:var(--c-c53030)}' +
      '.vka-card textarea{width:100%;margin-top:8px;padding:8px;border:1px solid var(--c-cbd5e0);border-radius:6px;font:inherit;font-size:calc(14px * var(--font-scale, 1));min-height:40px}' +
      '.vka-btns{display:flex;gap:8px;margin-top:8px}.vka-btns button{flex:1;padding:10px;font-size:calc(15px * var(--font-scale, 1))}' +
      '.vka-ok{background:#276749!important;border-color:var(--c-276749)!important;color:#fff!important}.vka-no{border-color:var(--c-c53030)!important;color:var(--c-c53030)!important}' +
      '.vka-tot{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--c-edf2f7);font-size:calc(14px * var(--font-scale, 1));gap:8px}.vka-tot:last-child{border-bottom:none}' +
      '.vka-tot .r{text-align:right}.vka-tot small{display:block;color:var(--c-718096);font-size:calc(12px * var(--font-scale, 1))}' +
      '.vka-rate{display:flex;justify-content:space-between;align-items:center;gap:8px}' +
      '.vka-note{font-size:calc(12px * var(--font-scale, 1));color:var(--c-718096);text-align:center;margin:8px 0 16px}' +
      '.vka-badge{display:inline-block;min-width:20px;height:20px;line-height:20px;border-radius:10px;background:#e53e3e;color:#fff;font-size:calc(12px * var(--font-scale, 1));font-weight:700;padding:0 6px;margin-left:4px}' +
      '.icon{position:relative}.icon .vka-badge{position:absolute;top:6px;right:6px;margin:0}' +
      '.vka-chip.q{background:var(--c-bee3f8,#bee3f8);color:var(--c-2c5282,#2c5282)}.vka-chip.ans{background:#fbd38d;color:#7b341e}' +
      '.vka-card.ans{box-shadow:inset 3px 0 0 #dd6b20}' +
      '.vka-thr{margin-top:8px;border-top:1px dashed var(--c-cbd5e0);padding-top:6px}' +
      '.vka-m{font-size:calc(13px * var(--font-scale, 1));padding:6px 8px;border-radius:8px;margin-top:6px;background:var(--c-f7fafc);overflow-wrap:anywhere}' +
      '.vka-m.drv{background:var(--c-fefcbf);margin-right:24px}.vka-m.own{margin-left:24px}.vka-m.sys{background:none;color:var(--c-718096);padding:2px 8px;text-align:center}' +
      '.vka-m .w{display:block;font-size:calc(11px * var(--font-scale, 1));color:var(--c-718096);margin-bottom:2px}' +
      '.vka-ask{width:100%;margin-top:8px;padding:10px;font-size:calc(15px * var(--font-scale, 1))}' +
      '.vka-big{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:10px 0 4px;font-size:calc(17px * var(--font-scale, 1))}' +
      '.vka-ej{font-size:calc(13px * var(--font-scale, 1));color:var(--c-975a16);background:var(--c-fefcbf);border-radius:6px;padding:6px 8px;margin-top:8px}' +
      '.vka-exp{display:flex;gap:8px;margin-top:10px}.vka-exp button{flex:1;padding:9px;font-size:calc(14px * var(--font-scale, 1))}';
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
  function who(x) { return x.namn ? esc(x.namn) + ' <span style="color:var(--c-718096);font-weight:400">(' + esc(x.driver_id) + ')</span>' : esc(x.driver_id); }
  function err(e) { return ERR[e && e.message] || errText(e); }
  function hrs(m) { return (Math.round((m || 0) / 60 * 100) / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function cap(t) { return t.replace(/^./, function (c) { return c.toUpperCase(); }); }
  // Väntar på ägaren = posten väntar och föraren har inte en obesvarad fråga
  function mine(x) { return x.status === 'pending' && x.waiting_on !== 'driver'; }
  function chip(x) {
    if (x.status !== 'pending') return '<span class="vka-chip ' + x.status + '">' + STATUS[x.status] + '</span>';
    if (x.waiting_on === 'driver') return '<span class="vka-chip q">Fråga · väntar på svar</span>';
    if (x.waiting_on === 'owner') return '<span class="vka-chip ans">Nytt svar</span>';
    return '<span class="vka-chip pending">Väntar</span>';
  }
  function thread(x) {
    var ms = x.msgs || [];
    if (!ms.length) return '';
    return '<div class="vka-thr">' + ms.map(function (m) {
      var t = esc(dl(new Date(m.at)) + ' ' + hm(new Date(m.at)));
      if (m.kind === 'reopen') return '<div class="vka-m sys">↩️ Beslutet öppnades igen · ' + t + '</div>';
      if (m.kind === 'approved' || m.kind === 'rejected') {
        return '<div class="vka-m sys">' + (m.kind === 'approved' ? '✅ Godkänd' : '❌ Nekad') + ' · ' + t + (m.body ? '<br>"' + esc(m.body) + '"' : '') + '</div>';
      }
      var own = m.role === 'owner';
      return '<div class="vka-m ' + (own ? 'own' : 'drv') + '"><span class="w">' + (own ? 'Du (ägaren)' : esc(m.who || 'Föraren')) + ' · ' + t + '</span>' + esc(m.body) + '</div>';
    }).join('') + '</div>';
  }

  A.load = function () {
    if (!A.month) { var n = new Date(); A.month = new Date(n.getFullYear(), n.getMonth(), 1); }
    var from = A.month, to = new Date(A.month.getFullYear(), A.month.getMonth() + 1, 0);
    A.data = null; if (typeof render === 'function') render();
    return rpc('admin_workshop_list', { p_from: ymd(from), p_to: ymd(to) })
      .then(function (d) {
        A.data = d; A.pending = (d.entries || []).filter(mine).length; render();
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
  A.ask = function (id) {
    if (A.busy) return;
    var t = document.getElementById('vka-c-' + id), c = t ? t.value.trim() : '';
    if (!c) { alert(ERR.need_text); if (t) t.focus(); return; }
    A.busy = true;
    rpc('workshop_ask', { p_id: id, p_body: c })
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
    var h = '<div class="vka-card' + (x.status === 'pending' && x.waiting_on === 'owner' ? ' ans' : '') + '"><div class="vka-top"><div><div class="vka-who">' + who(x) + '</div>' +
      '<div class="vka-meta">' + esc(span(x.start, x.end)) + '<br>' + esc(x.car) + ' · ' + dur(x.minutes) + ' · ' + kr(x.kr) + '</div></div>' +
      chip(x) + '</div>';
    if (x.comment) h += '<div class="vka-com">💬 ' + esc(x.comment) + '</div>';
    if (x.issue_id) {
      var iss = ((A.bil && A.bil.issues) || []).filter(function (i) { return i.id === x.issue_id; })[0];
      h += '<div class="vka-meta">🔗 Felanmälan' + (iss ? ': ' + esc(String(iss.body || '').slice(0, 80)) : '') + '</div>';
    }
    var ms = x.msgs || [];
    // äldre beslut (innan tråden fanns) visas som förut
    if (x.decision_comment && !ms.some(function (m) { return m.kind === x.status; })) h += '<div class="vka-meta">Din kommentar: ' + esc(x.decision_comment) + '</div>';
    h += thread(x);
    if (!decided || A.open[x.id]) {
      h += '<textarea id="vka-c-' + x.id + '" maxlength="500" placeholder="' + (x.waiting_on === 'driver' ? 'Skriv mer till föraren, eller motivering till beslutet (valfri)' : 'Fråga till föraren, eller motivering till beslutet (valfri)') + '">' + esc(decided ? (x.decision_comment || '') : '') + '</textarea>' +
        '<button class="vka-ask" onclick="VERKSTAD_ADMIN.ask(' + x.id + ')">❓ ' + (decided ? 'Öppna igen och fråga föraren' : 'Fråga föraren') + '</button>' +
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
    if (stop) rows.push('<b style="color:var(--c-c53030)">🛑 ' + stop + ' bil' + (stop === 1 ? '' : 'ar') + ' står</b>');
    rows.push('⚠️ ' + faults + (faults === 1 ? ' öppet fel' : ' öppna fel'));
    rows.push('🧴 ' + sup + (sup === 1 ? ' sak behövs' : ' saker behövs'));
    rows.push('🗓️ Underhåll: ' + (late ? late + ' försenat, ' : '') + soon + ' snart' + (sug ? ', ' + sug + ' förslag' : ''));
    return '<div class="vka-card"><div class="vka-who">Bilarna just nu</div><div class="vka-meta">' + rows.join('<br>') + '</div>' +
      '<button style="margin-top:10px;width:100%;padding:10px;border-radius:8px" onclick="VERKSTAD_ADMIN.openApp()">Hantera i appen › Bil & verkstad</button></div>';
  }
  A.openApp = function () { localStorage.setItem('taxi_view', 'verkstad'); localStorage.setItem('bil_tab', 'fel'); location.href = 'index.html'; };

  // Månadens summa: bara godkänd tid räknas. Väntande/frågade visas separat som "Ej klart".
  function monthTotals() {
    var d = A.data || {}, rows = (d.totals || []).slice().sort(function (a, b) { return b.approved_min - a.approved_min || b.pending_min - a.pending_min; });
    var r = { rows: rows, min: 0, kr: 0, pend: 0 };
    rows.forEach(function (t) { r.min += t.approved_min; r.kr += t.approved_kr; r.pend += t.pending_min; });
    return r;
  }
  function csvText(sep) {
    var t = monthTotals(), m = cap(MONL[A.month.getMonth()]) + ' ' + A.month.getFullYear();
    var q = function (v) { v = String(v == null ? '' : v); return sep === ';' && /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [['Månad', 'Förare', 'Förar-ID', 'Godkända timmar', 'Belopp (kr)', 'Ej klart (timmar)', 'Nekat (timmar)'].join(sep)];
    t.rows.forEach(function (r) {
      lines.push([m, r.namn || '', r.driver_id, hrs(r.approved_min), Math.round(r.approved_kr), hrs(r.pending_min), hrs(r.rejected_min)].map(q).join(sep));
    });
    lines.push([m, 'Totalt', '', hrs(t.min), Math.round(t.kr), hrs(t.pend), ''].map(q).join(sep));
    return lines.join('\r\n');
  }
  A.csv = function () {
    var b = new Blob(['\ufeff' + csvText(';')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'verkstadstimmar-' + ymd(A.month).slice(0, 7) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  A.copy = function () {
    var t = csvText('\t');
    var done = function () { alert('Kopierat. Klistra in i Excel eller ett mejl.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { prompt('Kopiera texten:', t); });
    else prompt('Kopiera texten:', t);
  };

  A.render = function (content) {
    var d = A.data;
    if (!d) { content.innerHTML = '<div class="section"><p style="padding:16px;">Laddar...</p></div>'; return; }
    if (d.error) { content.innerHTML = '<div class="section"><p style="padding:16px;">' + esc(d.error) + '</p></div>'; return; }
    var now = new Date(), isNow = A.month.getFullYear() === now.getFullYear() && A.month.getMonth() === now.getMonth();
    var pend = (d.entries || []).filter(mine);
    var asked = (d.entries || []).filter(function (x) { return x.status === 'pending' && x.waiting_on === 'driver'; });
    var done = (d.entries || []).filter(function (x) { return x.status !== 'pending'; });
    var h = bilSummary();
    h += '<div class="vka-h" style="margin-top:0">Verkstadstimmar</div>';
    h += '<div class="vka-card vka-rate"><span>Timpris: <b>' + kr(d.rate) + '/h</b></span><button onclick="VERKSTAD_ADMIN.setRate()">Ändra</button></div>';
    h += '<div class="vka-h">Väntar på dig (' + pend.length + ')</div>';
    h += pend.length ? pend.map(function (x) { return card(x, false); }).join('') : '<div class="vka-card" style="color:var(--c-718096)">Inget väntar på dig just nu.</div>';
    if (asked.length) h += '<div class="vka-h">Du har frågat – väntar på föraren (' + asked.length + ')</div>' + asked.map(function (x) { return card(x, false); }).join('');
    h += '<div class="vka-h">Att betala per månad</div>';
    h += '<div class="vka-bar"><button onclick="VERKSTAD_ADMIN.shift(-1)" aria-label="Föregående månad">‹</button><b>' +
      cap(MONL[A.month.getMonth()]) + ' ' + A.month.getFullYear() + '</b>' +
      '<button onclick="VERKSTAD_ADMIN.shift(1)" aria-label="Nästa månad"' + (isNow ? ' disabled style="opacity:.4"' : '') + '>›</button></div>';
    var tot = monthTotals();
    h += '<div class="vka-card" id="vka-month">';
    if (!tot.rows.length) h += '<div style="color:var(--c-718096)">Ingen verkstadstid den här månaden.</div>';
    tot.rows.forEach(function (t) {
      h += '<div class="vka-tot"><span>' + who(t) + (t.pending_min ? '<small>Ej klart: ' + dur(t.pending_min) + '</small>' : '') + (t.rejected_min ? '<small>Nekat: ' + dur(t.rejected_min) + '</small>' : '') + '</span>' +
        '<span class="r"><b>' + kr(t.approved_kr) + '</b><small>' + dur(t.approved_min) + ' godkänt</small></span></div>';
    });
    if (tot.rows.length) {
      h += '<div class="vka-big"><b>Totalt godkänt</b><span class="r"><b>' + kr(tot.kr) + '</b></span></div>' +
        '<div class="vka-meta" style="text-align:right;margin-top:0">' + dur(tot.min) + ' (' + hrs(tot.min) + ' h)</div>';
      if (tot.pend) h += '<div class="vka-ej">⏳ Ej klart: ' + dur(tot.pend) + ' väntar på beslut eller svar. Räknas inte in i summan ovan förrän du godkänner.</div>';
      h += '<div class="vka-exp"><button onclick="VERKSTAD_ADMIN.csv()">⬇️ Ladda ner (CSV)</button><button onclick="VERKSTAD_ADMIN.copy()">📋 Kopiera</button></div>';
    }
    h += '</div>';
    h += '<div class="vka-h">Beslutade i månaden (' + done.length + ')</div>';
    h += done.length ? done.map(function (x) { return card(x, true); }).join('') : '<div class="vka-card" style="color:var(--c-718096)">Inga beslut den här månaden.</div>';
    h += '<div class="vka-note">Godkänd tid betalas med timpriset som gällde när den godkändes. Tiden räknas till den månad då verkstadsbesöket började. Alla beslut och frågor sparas i Chaufförer › Logg.' +
      (d.named ? '' : ' Du ser förar-ID, inte namn.') + '</div>';
    content.innerHTML = h;
  };
})();
