/* Verkstadstimmar: föraren registrerar tid på verkstaden (start och stopp, bil, kommentar).
 *
 * Allt kontrolleras på servern (get_my_workshop, save_my_workshop, delete_my_workshop):
 * föraren ser och ändrar bara sina egna poster, och bara medan de väntar på beslut.
 * Ägaren godkänner eller nekar i Admin › Verkstadstimmar. Timpriset är en inställning på servern.
 */
(function () {
  'use strict';

  var V = window.VERKSTAD = { id: 'verkstad', title: 'Verkstadstimmar', icon: '🔧' };
  var WARN_MIN = 10 * 60;      // fråga "stämmer det?" över 10 timmar
  var MAX_MIN = 24 * 60;       // servern tillåter högst 24 timmar
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  var MONL = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  var WD = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  var STATUS = { pending: 'Väntar', approved: 'Godkänd', rejected: 'Nekad' };
  var ERR = {
    bad_time: 'Stopptiden måste vara efter starttiden.',
    too_long: 'Högst 24 timmar per registrering. Dela upp längre tider.',
    future: 'Du kan inte registrera tid som inte har hänt än.',
    too_old: 'Det datumet är för långt bak i tiden.',
    bad_car: 'Välj en bil i listan.',
    overlap: 'Tiden krockar med en annan registrering du har gjort.',
    not_editable: 'Posten är redan beslutad och kan inte ändras.',
    not_found: 'Posten finns inte längre.',
    comment_too_long: 'Kommentaren får vara högst 500 tecken.',
    forbidden: 'Du har inte behörighet att göra det.'
  };
  var st = { el: null, data: null, err: null, form: null, busy: false };

  // ---------- hjälp ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return String(n).padStart(2, '0'); }
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function ddmm(d) { return p2(d.getDate()) + '/' + p2(d.getMonth() + 1); }
  function dayLabel(d) { return WD[d.getDay()] + ' ' + ddmm(d) + '-' + String(d.getFullYear()).slice(-2); }
  function hm(d) { return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function dur(m) { m = Math.round(m); var h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min'; }
  function kr(n) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }
  V.dur = dur; V.kr = kr;
  function span(s, e) {
    var a = new Date(s), b = new Date(e);
    return dayLabel(a) + ' ' + hm(a) + '–' + (sod(a).getTime() === sod(b).getTime() ? '' : dayLabel(b) + ' ') + hm(b);
  }

  function rpc(name, args) {
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
  function errText(e) { return ERR[e && e.message] || 'Det gick inte att spara. Försök igen.'; }

  // ---------- data ----------
  function load() {
    st.err = null;
    return rpc('get_my_workshop', {}).then(function (d) {
      st.data = d; draw();
      window.VERKSTAD_LAST = d;
      document.dispatchEvent(new CustomEvent('verkstad:data', { detail: d }));
    }).catch(function (e) {
      if (e.code === '28000') { location.reload(); return; }
      st.err = 'Kunde inte hämta verkstadstimmarna. Försök igen.'; draw();
    });
  }

  V.render = function (content) {
    st.el = content; st.form = null; window.VERKSTAD_LAST = null;
    content.innerHTML = '<div id="vk-body"><div class="tl-msg">Laddar…</div></div>';
    load();
  };

  // ---------- formulär ----------
  function newForm(entry) {
    var s, e;
    if (entry) { s = new Date(entry.start); e = new Date(entry.end); }
    else {
      e = new Date(); e.setSeconds(0, 0); e.setMinutes(e.getMinutes() - e.getMinutes() % 5);
      s = new Date(e); s.setHours(s.getHours() - 1);
    }
    var cars = (st.data && st.data.cars) || [];
    return { id: entry ? entry.id : null, s: s, e: e, car: entry ? entry.car_id : (cars.length === 1 ? cars[0].id : null),
      comment: entry ? (entry.comment || '') : '', msg: '' };
  }
  function minutes(f) { return Math.round((f.e - f.s) / 60000); }
  // Klientkontroll (servern kontrollerar samma sak igen)
  function problem(f) {
    var m = minutes(f);
    if (m <= 0) return 'bad_time';
    if (m > MAX_MIN) return 'too_long';
    if (f.e.getTime() > Date.now() + 15 * 60000) return 'future';
    var own = ((st.data && st.data.entries) || []).filter(function (x) {
      return x.id !== f.id && x.status !== 'rejected' && new Date(x.start) < f.e && new Date(x.end) > f.s;
    });
    if (own.length) return 'overlap';
    return null;
  }

  function opts(n, sel, step) {
    var h = '';
    for (var i = 0; i < n; i += (step || 1)) h += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + p2(i) + '</option>';
    return h;
  }
  function timeRow(key, label, d) {
    return '<div class="vk-field"><span class="vk-lbl">' + label + '</span><div class="vk-dt">' +
      '<button type="button" class="vk-date" data-k="' + key + '">📅 ' + esc(dayLabel(d)) + '</button>' +
      '<select class="vk-h" data-k="' + key + '" aria-label="' + label + ' timme">' + opts(24, d.getHours()) + '</select><span class="vk-colon">:</span>' +
      '<select class="vk-m" data-k="' + key + '" aria-label="' + label + ' minut">' + opts(60, d.getMinutes()) + '</select></div></div>';
  }
  function formHtml(f) {
    var cars = (st.data && st.data.cars) || [], rate = st.data ? st.data.rate : 100;
    var h = '<div class="vk-card vk-form"><div class="vk-ftitle">' + (f.id ? 'Ändra verkstadstid' : 'Ny verkstadstid') + '</div>';
    h += timeRow('s', 'Start', f.s) + timeRow('e', 'Stopp', f.e);
    h += '<div class="vk-field"><span class="vk-lbl">Bil</span><select id="vk-car"><option value="">Välj bil…</option>' +
      cars.map(function (c) { return '<option value="' + c.id + '"' + (c.id === f.car ? ' selected' : '') + '>' + esc(c.bilnummer) + (c.modell ? ' – ' + esc(c.modell) : '') + '</option>'; }).join('') +
      '</select></div>';
    if (!cars.length) h += '<div class="vk-warn">Det finns inga bilar upplagda än. Be ägaren lägga till bilen under Admin › Bilar.</div>';
    h += '<div class="vk-field"><span class="vk-lbl">Kommentar (valfri)</span><textarea id="vk-comment" maxlength="500" rows="2" placeholder="T.ex. däckbyte, service">' + esc(f.comment) + '</textarea></div>';
    var p = problem(f), m = minutes(f);
    h += '<div id="vk-live" class="vk-live' + (p ? ' bad' : '') + '">' + (p ? esc(ERR[p]) : dur(m) + ' × ' + kr(rate) + '/h = <b>' + kr(m / 60 * rate) + '</b>') + '</div>';
    if (!p && m > WARN_MIN) h += '<div class="vk-warn">Över 10 timmar – kontrollera att tiden stämmer.</div>';
    if (f.msg) h += '<div class="vk-warn bad">' + esc(f.msg) + '</div>';
    h += '<div class="pm-btns"><button type="button" id="vk-cancel">Avbryt</button><button type="button" id="vk-save" class="primary"' + (st.busy ? ' disabled' : '') + '>' + (f.id ? 'Spara ändring' : 'Skicka till ägaren') + '</button></div></div>';
    return h;
  }
  function bindForm() {
    var f = st.form, b = document.getElementById('vk-body');
    b.querySelectorAll('.vk-h, .vk-m').forEach(function (sel) {
      sel.onchange = function () {
        var d = f[sel.dataset.k];
        if (sel.classList.contains('vk-h')) d.setHours(+sel.value); else d.setMinutes(+sel.value);
        draw();
      };
    });
    b.querySelectorAll('.vk-date').forEach(function (btn) { btn.onclick = function () { openCal(btn.dataset.k); }; });
    document.getElementById('vk-car').onchange = function (ev) { f.car = ev.target.value ? +ev.target.value : null; };
    document.getElementById('vk-comment').oninput = function (ev) { f.comment = ev.target.value; };
    document.getElementById('vk-cancel').onclick = function () { st.form = null; draw(); };
    document.getElementById('vk-save').onclick = save;
  }
  function save() {
    var f = st.form, p = problem(f), m = minutes(f);
    if (!f.car) { f.msg = ERR.bad_car; draw(); return; }
    if (p) { f.msg = ERR[p]; draw(); return; }
    if (m > WARN_MIN && !confirm('Du registrerar ' + dur(m) + ' på verkstaden. Stämmer det?')) return;
    st.busy = true; f.msg = ''; draw();
    rpc('save_my_workshop', { p_id: f.id, p_start: f.s.toISOString(), p_end: f.e.toISOString(), p_car_id: f.car, p_comment: f.comment || null })
      .then(function () { st.busy = false; st.form = null; flash(f.id ? 'Ändringen är sparad.' : 'Skickat! Ägaren godkänner eller nekar.'); return load(); })
      .catch(function (e) { st.busy = false; if (e.code === '28000') { location.reload(); return; } f.msg = errText(e); draw(); });
  }
  function remove(id) {
    if (!confirm('Ta bort den här verkstadstiden?')) return;
    rpc('delete_my_workshop', { p_id: id }).then(function () { flash('Borttagen.'); return load(); })
      .catch(function (e) { alert(errText(e)); load(); });
  }
  var flashMsg = '';
  function flash(t) { flashMsg = t; setTimeout(function () { flashMsg = ''; var x = document.getElementById('vk-flash'); if (x) x.remove(); }, 4000); }

  // ---------- vy ----------
  function draw() {
    var body = st.el && document.getElementById('vk-body'); if (!body) return;
    if (st.err) { body.innerHTML = '<div class="tl-msg err">' + esc(st.err) + '</div>'; return; }
    var d = st.data; if (!d) return;
    var s = d.summary || {}, now = new Date(), h = '';
    if (flashMsg) h += '<div id="vk-flash" class="vk-flash">' + esc(flashMsg) + '</div>';
    h += '<div class="vk-card vk-sum">' +
      '<div class="vk-sumrow"><span>Väntar på beslut</span><b>' + (s.pending_n ? dur(s.pending_min) + ' (' + s.pending_n + ' st)' : 'Inget') + '</b></div>' +
      '<div class="vk-sumrow"><span>Godkänt i ' + MONL[now.getMonth()] + '</span><b>' + dur(s.approved_month_min || 0) + ' = ' + kr(s.approved_month_kr) + '</b></div>' +
      '<div class="vk-rate">Timpris: ' + kr(d.rate) + '/h</div></div>';
    if (st.form) h += formHtml(st.form);
    else h += '<button type="button" id="vk-new" class="vk-new">＋ Registrera verkstadstid</button>';
    var list = d.entries || [];
    h += '<div class="vk-ltitle">Mina registreringar</div>';
    if (!list.length) h += '<div class="tl-msg">Inga verkstadstimmar registrerade än.</div>';
    list.forEach(function (x) {
      var editing = st.form && st.form.id === x.id;
      h += '<div class="vk-card vk-item' + (editing ? ' editing' : '') + '"><div class="vk-ihead"><span class="vk-when">' + esc(span(x.start, x.end)) + '</span>' +
        '<span class="vk-chip ' + x.status + '">' + STATUS[x.status] + '</span></div>' +
        '<div class="vk-imeta">' + esc(x.car) + ' · ' + dur(x.minutes) + ' · ' + kr(x.kr) + (x.status === 'pending' ? ' (preliminärt)' : '') + '</div>' +
        (x.comment ? '<div class="vk-icom">💬 ' + esc(x.comment) + '</div>' : '') +
        (x.decision_comment ? '<div class="vk-boss">Ägaren: ' + esc(x.decision_comment) + '</div>' : '') +
        (x.status === 'pending' && !st.form ? '<div class="vk-iact"><button type="button" class="vk-edit" data-id="' + x.id + '">Ändra</button><button type="button" class="vk-del" data-id="' + x.id + '">Ta bort</button></div>' : '') +
        '</div>';
    });
    h += '<div class="tl-foot">Du kan ändra eller ta bort en registrering så länge den väntar. Ersättningen räknas med timpriset när ägaren godkänner.</div>';
    body.innerHTML = h;
    var nb = document.getElementById('vk-new'); if (nb) nb.onclick = function () { st.form = newForm(null); draw(); };
    body.querySelectorAll('.vk-edit').forEach(function (b) {
      b.onclick = function () { var x = list.filter(function (y) { return y.id === +b.dataset.id; })[0]; if (x) { st.form = newForm(x); draw(); window.scrollTo(0, 0); } };
    });
    body.querySelectorAll('.vk-del').forEach(function (b) { b.onclick = function () { remove(+b.dataset.id); }; });
    if (st.form) bindForm();
  }

  // ---------- datumväljare (samma utseende som Körpassdata) ----------
  var cal = { m: null, key: null, pick: null };
  function openCal(key) {
    var m = document.getElementById('vk-modal');
    if (!m) {
      m = document.createElement('div'); m.id = 'vk-modal'; m.className = 'pm-overlay';
      m.innerHTML = '<div class="pm-box" role="dialog" aria-label="Välj datum">' +
        '<div class="pm-head"><button type="button" id="vk-pm-prev" aria-label="Föregående månad">‹</button><span id="vk-pm-title"></span><button type="button" id="vk-pm-next" aria-label="Nästa månad">›</button></div>' +
        '<div class="pm-hint" id="vk-pm-hint"></div><div class="pm-cal" id="vk-pm-cal"></div><div class="pm-sel" id="vk-pm-sel"></div>' +
        '<div class="pm-btns"><button type="button" id="vk-pm-cancel">Avbryt</button><button type="button" id="vk-pm-ok" class="primary">Välj</button></div></div>';
      document.body.appendChild(m);
      m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('open'); });
      document.getElementById('vk-pm-prev').onclick = function () { cal.m.setMonth(cal.m.getMonth() - 1); drawCal(); };
      document.getElementById('vk-pm-next').onclick = function () { cal.m.setMonth(cal.m.getMonth() + 1); drawCal(); };
      document.getElementById('vk-pm-cancel').onclick = function () { m.classList.remove('open'); };
      document.getElementById('vk-pm-ok').onclick = function () {
        var f = st.form; if (!f || !cal.pick) return;
        var d = f[cal.key], wasSame = sod(f.s).getTime() === sod(f.e).getTime();
        d.setFullYear(cal.pick.getFullYear(), cal.pick.getMonth(), cal.pick.getDate());
        // Flyttas startdagen och stopp låg samma dag, följer stoppdagen med
        if (cal.key === 's' && wasSame) f.e.setFullYear(cal.pick.getFullYear(), cal.pick.getMonth(), cal.pick.getDate());
        m.classList.remove('open'); draw();
      };
    }
    cal.key = key; cal.pick = sod(st.form[key]); cal.m = new Date(cal.pick.getFullYear(), cal.pick.getMonth(), 1);
    document.getElementById('vk-pm-hint').textContent = key === 's' ? 'Vilken dag började du?' : 'Vilken dag slutade du?';
    drawCal(); m.classList.add('open');
  }
  function drawCal() {
    document.getElementById('vk-pm-title').textContent = MON[cal.m.getMonth()] + ' ' + cal.m.getFullYear();
    var first = new Date(cal.m.getFullYear(), cal.m.getMonth(), 1), last = new Date(cal.m.getFullYear(), cal.m.getMonth() + 1, 0), today = sod(new Date());
    var h = ['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'].map(function (x) { return '<div class="pm-wd">' + x + '</div>'; }).join('');
    for (var i = 0; i < (first.getDay() + 6) % 7; i++) h += '<div></div>';
    for (var dd = 1; dd <= last.getDate(); dd++) {
      var dt = new Date(cal.m.getFullYear(), cal.m.getMonth(), dd), t = dt.getTime(), c = 'pm-day';
      if (cal.pick && t === cal.pick.getTime()) c += ' sel';
      if (t === today.getTime()) c += ' today';
      if (dt > today) c += ' future';
      h += '<button type="button" class="' + c + '" data-d="' + dd + '"' + (dt > today ? ' disabled' : '') + '>' + dd + '</button>';
    }
    var el = document.getElementById('vk-pm-cal'); el.innerHTML = h;
    el.querySelectorAll('.pm-day').forEach(function (b) {
      b.onclick = function () { cal.pick = new Date(cal.m.getFullYear(), cal.m.getMonth(), +b.dataset.d); drawCal(); };
    });
    document.getElementById('vk-pm-sel').textContent = cal.pick ? dayLabel(cal.pick) : '';
  }
})();
