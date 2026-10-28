/* Admin › Bil & verkstad.
 * Behövs till bilen och felanmälningar: ägaren (och S admin) ser alla öppna anmälningar per bil och
 * markerar dem som Pågår / Åtgärdad (med valfritt meddelande till föraren) eller tar bort dem.
 * Ägaren kan också skriva till föraren utan att ändra status (car_issue_message); föraren kan svara i appen.
 * "Nytt svar" visas tills ägaren har sett ärendet (car_issue_seen).
 * (get_bil, set_car_issue_status, edge-funktionen bil-foto). Underhåll och uppgifter hanteras i appen (verkstad.js).
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
  var ISTATUS = { ny: 'Ny', pagar: 'Pågår', klar: 'Åtgärdad' };
  var SUPPLY = { kvitto: ['🧾', 'Kvittorullar'], spolar: ['💧', 'Spolarvätska'], rengoring: ['🧽', 'Rengöring'], annat: ['✏️', 'Annat'] };
  ERR.forbidden = 'Du har inte behörighet att göra det.';
  ERR.not_editable = 'Det går inte att ändra längre.';
  ERR.msg_too_long = 'Meddelandet får vara högst 1000 tecken.';
  ERR.too_many = 'Du har skickat väldigt många meddelanden idag. Försök igen i morgon.';
  ERR.demo_read_only = 'Det här är ett demokonto. Du kan titta runt men inte ändra något.';
  var A = window.VERKSTAD_ADMIN = { data: null, month: null, open: {}, busy: false, el: null, newIss: 0, showDone: {}, photos: {} };

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
      '.vka-exp{display:flex;gap:8px;margin-top:10px}.vka-exp button{flex:1;padding:9px;font-size:calc(14px * var(--font-scale, 1))}' +
      '.vka-chip.ny{background:var(--c-fefcbf);color:var(--c-975a16)}.vka-chip.pagar{background:var(--c-bee3f8,#bee3f8);color:var(--c-3182ce,#2c5282)}.vka-chip.klar{background:var(--c-c6f6d5);color:var(--c-276749)}' +
      '.vka-card.new{box-shadow:inset 3px 0 0 #d69e2e}.vka-card.stop{box-shadow:inset 3px 0 0 #e53e3e}.vka-card.done{opacity:.75}' +
      '.vka-car{display:flex;justify-content:space-between;align-items:baseline;font-weight:600;font-size:calc(14px * var(--font-scale, 1));margin:10px 2px 6px}' +
      '.vka-car small{font-weight:400;color:var(--c-718096)}' +
      '.vka-what{font-weight:600}.vka-txt{margin-top:6px;font-size:calc(14px * var(--font-scale, 1));overflow-wrap:anywhere;white-space:pre-wrap}' +
      '.vka-btns .vka-del{flex:0 0 auto;border-color:var(--c-c53030)!important;color:var(--c-c53030)!important}' +
      '.vka-more{width:100%;padding:9px;margin:0 0 10px;font-size:calc(14px * var(--font-scale, 1))}' +
      '.vka-ph{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.vka-ph img{width:84px;height:84px;object-fit:cover;border-radius:6px}';
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
        return A.loadBil();
      })
      .catch(function (e) { A.data = { error: err(e) }; render(); });
  };
  A.count = function () {
    var a = rpc('workshop_pending_count', {}).then(function (n) { A.pending = +n || 0; }).catch(function () {});
    // bil_open_count finns från migrationen 20261026n. Saknas den blir siffran bara verkstadstiderna som förut.
    // + msg = ärenden där föraren har skrivit något som ägaren inte har läst (migrationen 20261028a)
    var b = rpc('bil_open_count', {}).then(function (r) { A.newIss = ((r && +r.supply) || 0) + ((r && +r.fault) || 0) + ((r && +r.msg) || 0); }).catch(function () {});
    return Promise.all([a, b]).then(function () { return A.total(); });
  };
  A.total = function () { return (A.pending || 0) + (A.newIss || 0); };
  A.badge = function () { var n = A.total(); return n > 0 ? '<span class="vka-badge" aria-label="' + n + ' väntar">' + n + '</span>' : ''; };
  function countNew() { A.newIss = ((A.bil && A.bil.issues) || []).filter(function (i) { return i.status === 'ny' || i.unread > 0; }).length; }
  A.loadBil = function () {
    return rpc('get_bil', {}).then(function (b) { A.bil = b; seenQ = {}; countNew(); render(); }).catch(function () { A.bil = { error: true }; render(); });
  };
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

  // ---------- Behövs till bilen / felanmälningar ----------
  function photoApi(body) {
    if (window.DEMO && DEMO.owner && DEMO.owner()) { var e = new Error('demo_read_only'); return Promise.reject(e); }
    body.token = localStorage.getItem('taxi_session') || '';
    return fetch(SUPABASE_URL + '/functions/v1/bil-foto', {
      method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error((b && b.error) || ('HTTP ' + r.status)); return b; });
    });
  }
  function issById(id) { return ((A.bil && A.bil.issues) || []).filter(function (i) { return i.id === id; })[0]; }
  A.iset = function (id, status) {
    if (A.busy) return;
    var t = document.getElementById('vka-ic-' + id), c = t ? t.value.trim() : '';
    A.busy = true;
    rpc('set_car_issue_status', { p_id: id, p_status: status, p_comment: c || null })
      .then(function () { A.busy = false; return A.loadBil(); })
      .catch(function (e) { A.busy = false; alert(err(e)); A.loadBil(); });
  };
  A.idel = function (id) {
    if (A.busy) return;
    var i = issById(id); if (!i) return;
    if (!confirm('Ta bort anmälan helt?' + (i.body ? '\n\n"' + String(i.body).slice(0, 80) + '"' : '') + '\n\nFöraren får ingen notis. Vill du meddela föraren, välj Åtgärdad i stället.')) return;
    A.busy = true;
    photoApi({ action: 'delete_issue', issue_id: id })
      .then(function () { A.busy = false; return A.loadBil(); })
      .catch(function (e) { A.busy = false; alert(err(e)); A.loadBil(); });
  };
  A.iphotos = function (id) {
    A.photos[id] = 'loading'; render();
    photoApi({ action: 'list', issue_id: id }).then(function (r) { A.photos[id] = r.photos || []; render(); })
      .catch(function (e) { A.photos[id] = null; alert(err(e)); render(); });
  };
  A.toggleDone = function (k) { A.showDone[k] = !A.showDone[k]; render(); };
  // Meddelande till föraren utan att ändra status
  A.imsg = function (id) {
    if (A.busy) return;
    var t = document.getElementById('vka-ic-' + id), c = t ? t.value.trim() : '';
    if (!c) { alert('Skriv meddelandet till föraren först.'); if (t) t.focus(); return; }
    A.busy = true;
    rpc('car_issue_message', { p_id: id, p_body: c })
      .then(function () { A.busy = false; return A.loadBil(); })
      .catch(function (e) { A.busy = false; alert(err(e)); A.loadBil(); });
  };
  // Ärenden som syns på skärmen räknas som lästa. "Nytt svar" ligger kvar tills nästa laddning.
  var seenQ = {}, seenT = null;
  function queueSeen(i) {
    if (!(i.unread > 0) || seenQ[i.id]) return;
    seenQ[i.id] = true;
    clearTimeout(seenT); seenT = setTimeout(flushSeen, 300);
  }
  function flushSeen() {
    var ids = Object.keys(seenQ).filter(function (k) { return seenQ[k] === true; }).map(Number);
    if (!ids.length) return;
    ids.forEach(function (id) { seenQ[id] = 'sent'; });
    rpc('car_issue_seen', { p_ids: ids }).then(function () {
      ids.forEach(function (id) { var i = issById(id); if (i) { i.unread = 0; i._new = true; } });
      countNew();
    }).catch(function () { ids.forEach(function (id) { delete seenQ[id]; }); });
  }
  function when(ts) { var d = new Date(ts); return dl(d) + ' ' + hm(d); }
  function ichip(i) { return '<span class="vka-chip ' + i.status + '">' + ISTATUS[i.status] + '</span>'; }
  // Avsändare i ärendetråden: namn (eller förar-id) och under det användarkategorin
  var WHO_ROLE = { superadmin: 'S admin', agare: 'Ägare', admin: 'Admin', standard: 'Förare', semester: 'Förare', avslutad: 'Förare' };
  function whoRole(x) { return WHO_ROLE[x.cat] ? '<small style="display:block;font-size:.78em;font-weight:400;opacity:.75">' + WHO_ROLE[x.cat] + '</small>' : ''; }
  // Tråd: statusändringar (som förut) + meddelanden mellan ägaren och föraren, i tidsordning
  function ihist(i) {
    var rows = (i.history || []).map(function (u) { return { at: u.at, u: u }; })
      .concat((i.msgs || []).map(function (m) { return { at: m.at, m: m }; }));
    if (!rows.length) return '';
    rows.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    return '<div class="vka-thr">' + rows.map(function (r) {
      var u = r.u, m = r.m;
      if (u) return '<div class="vka-m sys">' + (u.status === 'ny' && u !== (i.history || [])[0] ? '↩️ Öppnad igen' : esc(ISTATUS[u.status] || u.status)) + ' · ' + esc(when(u.at)) + (u.who ? '<br><b>' + esc(u.who) + '</b>' + whoRole(u) : '') + (u.comment ? (u.who ? '' : '<br>') + '"' + esc(u.comment) + '"' : '') + '</div>';
      var own = m.mine, who = m.cat ? esc(m.who) : own ? 'Du' : m.role === 'owner' ? esc(m.who || 'Ägaren') + ' (ägare)' : esc(m.who || 'Föraren');
      return '<div class="vka-m ' + (own ? 'own' : 'drv') + '"><span class="w"><b>' + who + '</b> · ' + esc(when(m.at)) + whoRole(m) + '</span>' + esc(m.body) + '</div>';
    }).join('') + '</div>';
  }
  function issueCard(i) {
    var sup = SUPPLY[i.supply], open = i.status !== 'klar';
    var what = i.kind === 'supply' ? (sup ? sup[0] + ' ' + sup[1] : '🧴 Behövs') : (i.blocking ? '🛑 Bilen står' : '⚠️ Fel');
    var by = i.mine ? 'dig' : i.reporter_name ? esc(i.reporter_name) + ' <span style="color:var(--c-718096)">(' + esc(i.reporter) + ')</span>' : esc(i.reporter || 'föraren');
    var isNew = i.unread > 0 || i._new;
    queueSeen(i);
    var h = '<div class="vka-card' + (i.status === 'ny' ? ' new' : '') + (isNew ? ' ans' : '') + (open && i.blocking ? ' stop' : '') + (open ? '' : ' done') + '">' +
      '<div class="vka-top"><div class="vka-what">' + what + '</div><div>' + (isNew ? '<span class="vka-chip ans">💬 Nytt svar</span> ' : '') + ichip(i) + '</div></div>';
    if (i.body) h += '<div class="vka-txt">' + esc(i.body) + '</div>';
    h += '<div class="vka-meta">' + esc(when(i.created_at)) + ' · av ' + by + (i.photos ? ' · 📷 ' + i.photos : '') + '</div>';
    h += ihist(i);
    var ph = A.photos[i.id];
    if (ph === 'loading') h += '<div class="vka-meta">Hämtar foton…</div>';
    else if (ph && ph.length) h += '<div class="vka-ph">' + ph.map(function (p) { return p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.url) + '" alt="Foto"></a>' : ''; }).join('') + '</div>';
    else if (i.photos) h += '<button class="vka-ask" onclick="VERKSTAD_ADMIN.iphotos(' + i.id + ')">📷 Visa foto</button>';
    if (open) {
      h += '<textarea id="vka-ic-' + i.id + '" maxlength="500" placeholder="Skriv till föraren (status ändras inte)"></textarea>' +
        (i.mine ? '' : '<button class="vka-ask" onclick="VERKSTAD_ADMIN.imsg(' + i.id + ')">💬 Skicka meddelande</button>') +
        '<div class="vka-btns">' +
        (i.status === 'ny' ? '<button onclick="VERKSTAD_ADMIN.iset(' + i.id + ',\'pagar\')">Pågår</button>' : '') +
        '<button class="vka-ok" onclick="VERKSTAD_ADMIN.iset(' + i.id + ',\'klar\')">✓ Åtgärdad</button>' +
        '<button class="vka-del" onclick="VERKSTAD_ADMIN.idel(' + i.id + ')" aria-label="Ta bort">Ta bort</button></div>';
    } else {
      if (!i.mine) h += '<textarea id="vka-ic-' + i.id + '" maxlength="500" placeholder="Skriv till föraren (ärendet är åtgärdat, status ändras inte)."></textarea>' +
        '<button class="vka-ask" onclick="VERKSTAD_ADMIN.imsg(' + i.id + ')">💬 Skicka meddelande</button>';
      h += '<div class="vka-btns"><button onclick="VERKSTAD_ADMIN.iset(' + i.id + ',\'ny\')">Öppna igen</button>' +
        '<button class="vka-del" onclick="VERKSTAD_ADMIN.idel(' + i.id + ')">Ta bort</button></div>';
    }
    return h + '</div>';
  }
  function carKey(i) { return i.car || ''; }
  function issueSection(kind) {
    var all = ((A.bil && A.bil.issues) || []).filter(function (i) { return i.kind === kind; });
    var open = all.filter(function (i) { return i.status !== 'klar'; }), done = all.filter(function (i) { return i.status === 'klar'; });
    var nNew = open.filter(function (i) { return i.status === 'ny'; }).length;
    var h = '<div class="vka-h"' + (kind === 'supply' ? ' style="margin-top:0"' : '') + '>' + (kind === 'supply' ? '🧴 Behövs till bilen' : '⚠️ Fel på bilarna') +
      ' (' + open.length + (nNew ? ', ' + nNew + ' nya' : '') + ')</div>';
    if (!open.length) h += '<div class="vka-card" style="color:var(--c-718096)">' + (kind === 'supply' ? 'Inget som behövs just nu.' : 'Inga öppna fel. 👍') + '</div>';
    // grupperat per bil: bilar i nummerordning, "Alla bilar" sist
    var groups = {}, keys = [];
    open.forEach(function (i) { var k = carKey(i); if (!groups[k]) { groups[k] = []; keys.push(k); } groups[k].push(i); });
    keys.sort(function (a, b) { return !a ? 1 : !b ? -1 : a.localeCompare(b, 'sv', { numeric: true }); });
    keys.forEach(function (k) {
      h += '<div class="vka-car"><span>' + (k ? '🚕 Bil ' + esc(k) : '🚕 Alla bilar') + '</span><small>' + groups[k].length + ' öppn' + (groups[k].length === 1 ? 'en' : 'a') + '</small></div>';
      h += groups[k].map(issueCard).join('');
    });
    if (done.length) {
      var dn = done.filter(function (i) { return i.unread > 0; }).length;
      h += '<button class="vka-more" onclick="VERKSTAD_ADMIN.toggleDone(\'' + kind + '\')">' + (A.showDone[kind] ? 'Dölj åtgärdade' : 'Visa åtgärdade (' + done.length + ')' + (dn ? ' · 💬 ' + dn + ' nytt svar' : '')) + '</button>';
      if (A.showDone[kind]) h += done.map(issueCard).join('');
    }
    return h;
  }
  function bilSummary() {
    var b = A.bil;
    if (!b) return '<div class="vka-card" style="color:var(--c-718096)">Hämtar bilarna…</div>';
    if (b.error) return '<div class="vka-card" style="color:var(--c-718096)">Kunde inte hämta bilarna. Försök igen.</div>';
    var m = b.maint || [];
    var late = m.filter(function (x) { return x.status === 'plan' && x.level === 2; }).length;
    var soon = m.filter(function (x) { return x.status === 'plan' && x.level === 1; }).length;
    var sug = m.filter(function (x) { return x.status === 'forslag'; }).length;
    var h = issueSection('supply') + issueSection('fault');
    h += '<div class="vka-card"><div class="vka-who">🗓️ Underhåll och uppgifter</div><div class="vka-meta">Underhåll: ' + (late ? late + ' försenat, ' : '') + soon + ' snart' + (sug ? ', ' + sug + ' förslag' : '') + '</div>' +
      '<button style="margin-top:10px;width:100%;padding:10px;border-radius:8px" onclick="VERKSTAD_ADMIN.openApp(\'underhall\')">Hantera i appen › Bil & verkstad</button></div>';
    return h;
  }
  A.openApp = function (tab) { localStorage.setItem('taxi_view', 'verkstad'); localStorage.setItem('bil_tab', tab || 'fel'); location.href = 'index.html'; };

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
    h += '<div class="vka-h">⏱️ Verkstadstimmar</div>';
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
