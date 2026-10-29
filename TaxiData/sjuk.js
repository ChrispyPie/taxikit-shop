/* Sjukanmälan (t611u) – fliken "Sjuk" under Anmälningar & ärenden (verkstad.js).
 * Bakom funktionsflaggan 'sjuk' (servern: private.feature_flags, get_my_features). Utan flaggan syns ingenting,
 * och servern nekar ändå alla anrop (sjuk_* kontrollerar inloggning, flagga och roll, demo nekas).
 * Föraren: Anmäl sjuk (startdatum + valfri kommentar), Friskanmäl, ladda upp läkarintyg.
 * Ägaren och S admin: alla sjukperioder, Godkänn / Begär läkarintyg / Avslå, sjuklön beviljad / utbetald.
 * Ingen diagnos eller orsak frågas efter. Intyg ligger i en privat bucket (edge-funktionen "sjuk", signerade länkar).
 */
(function () {
  // Nytt namn på Bil & verkstad. Bara för den som har flaggan 'sjuk' tills vidare.
  // Byt NAMN_FOR_ALLA till true så får alla det nya namnet (en rad).
  var NAMN = 'Anmälningar & ärenden', NAMN_FOR_ALLA = false;

  // Klick på en sjuk-notis öppnar /TaxiData/?sida=sjuk → Anmälningar & ärenden, fliken Sjuk.
  try {
    var q0 = new URLSearchParams(location.search);
    if (q0.get('sida') === 'sjuk') {
      localStorage.setItem('taxi_view', 'verkstad');
      localStorage.setItem('bil_tab', 'sjuk');
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) {}

  var S = window.SJUK = {};
  var WD = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
  var MON = ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var STATUS = { ny: ['Väntar på ägaren', 'ny'], godkand: ['Godkänd', 'klar'], intyg_begart: ['Läkarintyg begärt', 'pagar'], avslagen: ['Avslagen', 'nej'] };
  var LON = { ej: 'Sjuklön ej hanterad', beviljad: 'Sjuklön beviljad', utbetald: 'Sjuklön utbetald' };
  var ERR = {
    already_sick: 'Du har redan en pågående sjukanmälan. Friskanmäl den först.',
    already_recovered: 'Sjukperioden är redan avslutad.',
    bad_date: 'Datumet går inte. Välj ett annat datum.',
    comment_too_long: 'Kommentaren är för lång (högst 500 tecken).',
    rate_limited: 'För många anmälningar i dag. Försök igen senare.',
    forbidden: 'Du har inte behörighet till det här.',
    not_found: 'Sjukperioden finns inte längre.',
    too_big: 'Filen är för stor (högst 3 MB).',
    bad_file: 'Filen går inte att läsa. Ta ett foto eller välj en PDF.',
    too_many: 'Det finns redan 10 intyg på den här perioden.'
  };
  var st = { data: null, err: null, body: null, onChange: null, form: null, busy: false, flash: null, certs: {}, decide: null, filter: 'att' };

  function feats() { return window.TAXI_FEATURES || []; }
  function demo() { try { return !!(window.DEMO && DEMO.on && DEMO.on()); } catch (e) { return false; } }
  S.enabled = function () { return feats().indexOf('sjuk') >= 0 && !demo(); };
  S.title = function (old) { return (NAMN_FOR_ALLA || S.enabled()) ? NAMN : old; };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sn(s) { return window.shortName ? window.shortName(s) : (s == null ? '' : String(s)); }
  function pd(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(s, n) { var d = pd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function dsv(s) { if (!s) return ''; var d = pd(s); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function when(ts) { var d = new Date(ts); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function today() { return (st.data && st.data.today) || ymd(new Date()); }
  function dagar(n) { return n + ' dag' + (n === 1 ? '' : 'ar'); }

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
  // Edge-funktionen "sjuk": intyg (privat bucket) och pushnotiser
  function fn(body) {
    body.token = localStorage.getItem('taxi_session') || '';
    return fetch(TRIP_API_URL + '/functions/v1/sjuk', {
      method: 'POST', headers: { 'apikey': TRIP_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) { var er = new Error((b && b.error) || ('HTTP ' + r.status)); er.code = b && b.code; throw er; }
        return b;
      });
    });
  }
  function flush() { fn({ action: 'flush' }).catch(function () {}); }
  function errText(e) { return ERR[e && e.message] || 'Det gick inte att spara. Försök igen.'; }
  function fail(e) { if (e && e.code === '28000') { location.reload(); return true; } return false; }

  // Ägarlistan: alla andras perioder (de egna står redan överst).
  // Tillfälligt test: med flaggan 'sjuk_se_allt' skickar servern se_allt: true och då syns även de egna här.
  function others() { var d = st.data || {}; return d.se_allt ? (d.all || []) : (d.all || []).filter(function (r) { return r.driver_id !== d.me; }); }
  // Hur många som väntar på något (siffra på fliken): ägaren = nya anmälningar, föraren = begärt intyg
  S.pending = function () {
    var d = st.data; if (!d) return 0;
    if (d.boss) return others().filter(function (r) { return r.status === 'ny'; }).length;
    return (d.mine || []).filter(function (r) { return r.status === 'intyg_begart' && !r.certs; }).length;
  };

  // Regler (information). Kalenderdagar räknat från första sjukdagen.
  function regel(day) {
    if (day <= 1) return 'Dag 1: karensavdrag.';
    if (day <= 7) return 'Dag ' + day + ': sjuklön från arbetsgivaren (80 %). Från dag 8 behövs läkarintyg.';
    if (day <= 14) return 'Dag ' + day + ': sjuklön från arbetsgivaren (80 %). Läkarintyg behövs från dag 8.';
    return 'Dag ' + day + ': efter dag 14 betalar Försäkringskassan sjukpenning. Läkarintyg behövs.';
  }
  function reglerBox() {
    return '<details class="vk-card sj-rules"><summary>ℹ️ Så funkar sjukfrånvaro</summary><ul>' +
      '<li><b>Dag 1:</b> karensavdrag.</li>' +
      '<li><b>Dag 2–14:</b> sjuklön från arbetsgivaren, 80 % av lönen.</li>' +
      '<li><b>Från dag 8:</b> läkarintyg behövs. Ta ett foto av intyget och ladda upp det här.</li>' +
      '<li><b>Efter dag 14:</b> Försäkringskassan tar över. Arbetsgivaren anmäler till Försäkringskassan och du ansöker om sjukpenning där.</li>' +
      '</ul><p>Det här är bara information. Det som gäller exakt står i ditt anställningsavtal, kollektivavtalet och hos Försäkringskassan.</p>' +
      '<p>🔒 Bara du, ägaren och S admin ser din sjukanmälan. Skriv aldrig diagnos eller orsak – det behövs inte.</p></details>';
  }

  // ---------- data ----------
  function load() {
    return rpc('sjuk_get', {}).then(function (d) { st.data = d; st.err = null; })
      .catch(function (e) { if (fail(e)) return; st.err = e && e.message === 'forbidden' ? 'Du har inte tillgång till sjukanmälan.' : 'Kunde inte hämta sjukanmälningarna. Försök igen.'; })
      .then(function () { draw(); if (st.onChange) st.onChange(); });
  }
  S.render = function (body, onChange) {
    st.body = body; st.onChange = onChange || null; st.form = null; st.decide = null; st.certs = {};
    if (!st.data) body.innerHTML = '<div class="tl-msg">Laddar…</div>'; else draw();
    load();
  };
  function act(p, okMsg) {
    if (st.busy) return Promise.resolve();
    st.busy = true; draw();
    return p.then(function () { st.flash = okMsg || null; st.form = null; st.decide = null; flush(); return load(); })
      .catch(function (e) { if (fail(e)) return; alert(errText(e)); })
      .then(function () { st.busy = false; draw(); });
  }

  // ---------- rita ----------
  function badge(r) {
    var s = STATUS[r.status] || [r.status, 'ny'];
    return '<span class="bv-st sj-' + s[1] + '">' + esc(s[0]) + '</span>';
  }
  function card(r, boss) {
    var h = '<div class="vk-card sj-card' + (r.open ? ' sj-open' : '') + '" data-id="' + r.id + '">';
    h += '<div class="vk-ihead"><span class="vk-when">' + (boss ? esc(sn(r.name) || r.driver_id) + ' <small>· ' + esc(r.driver_id) + '</small><br>' : '') +
      '🤒 ' + esc(dsv(r.start)) + ' – ' + (r.open ? 'pågår' : esc(dsv(r.end))) + '</span>' + badge(r) + '</div>';
    h += '<div class="vk-imeta">' + dagar(r.days) + (r.open ? ' hittills' : '') + (r.certs ? ' · 📄 ' + r.certs + ' intyg' : '') +
      ' · <span class="sj-lon ' + r.sjuklon + '">' + esc(LON[r.sjuklon] || '') + '</span></div>';
    if (r.open) h += '<div class="vk-warn' + (r.days >= 8 && !r.certs ? ' bad' : '') + '">' + esc(regel(r.days)) + '</div>';
    if (r.comment) h += '<div class="bv-text sj-c">' + (boss ? '💬 ' : 'Din kommentar: ') + esc(r.comment) + '</div>';
    if (r.status_at && r.status !== 'ny') h += '<div class="vk-boss">' + esc((STATUS[r.status] || [''])[0]) + ' av ' + esc(sn(r.status_by) || 'ägaren') + ' · ' + esc(when(r.status_at)) +
      (r.status_comment ? '<br>"' + esc(r.status_comment) + '"' : '') + '</div>';
    if (r.status === 'intyg_begart' && !boss && !r.certs) h += '<div class="vk-warn bad">📄 Ägaren vill ha ett läkarintyg. Ta ett foto av det och ladda upp det här nedanför.</div>';
    // Intyg
    var c = st.certs[r.id];
    if (c === 'loading') h += '<div class="vk-imeta">Hämtar intyg…</div>';
    else if (c && c.length) {
      h += '<div class="bv-thumbs big">' + c.map(function (x) {
        var inner = x.mime === 'application/pdf' ? '<span class="sj-pdf">📄 PDF</span>' : '<img src="' + esc(x.url) + '" alt="Läkarintyg">';
        return '<div class="bv-thumb"><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + inner + '</a>' +
          ((x.mine || boss) ? '<button type="button" class="sj-cdel" data-c="' + x.id + '" data-r="' + r.id + '" aria-label="Ta bort intyget">×</button>' : '') + '</div>';
      }).join('') + '</div>';
    } else if (c && !c.length) h += '<div class="vk-imeta">Inga intyg.</div>';
    // Ägarens beslut
    if (boss && st.decide && st.decide.id === r.id) {
      var lbl = { godkand: 'Godkänn', intyg_begart: 'Begär läkarintyg', avslagen: 'Avslå' }[st.decide.status];
      h += '<div class="vk-field sj-dec"><label class="vk-lbl" for="sj-dc">Kommentar till föraren (valfri)</label>' +
        '<textarea id="sj-dc" maxlength="500" rows="2" placeholder="Till exempel: Krya på dig!">' + esc(st.decide.comment || '') + '</textarea></div>' +
        '<div class="pm-btns"><button type="button" id="sj-dcancel">Avbryt</button><button type="button" class="primary" id="sj-dok"' + (st.busy ? ' disabled' : '') + '>' + esc(lbl) + '</button></div>';
    }
    var a = [];
    if (!boss || r.driver_id === st.data.me) {
      if (r.open) a.push('<button type="button" class="kal-ok" data-a="frisk">💪 Friskanmäl</button>');
    } else if (r.open) a.push('<button type="button" data-a="frisk">💪 Friskanmäl</button>');
    a.push('<label class="sj-up">📷 Läkarintyg<input type="file" accept="image/*,application/pdf" data-up="' + r.id + '" hidden></label>');
    if (r.certs && !(c && c.length)) a.push('<button type="button" data-a="certs">📄 Visa intyg</button>');
    if (boss && !(st.decide && st.decide.id === r.id)) {
      if (r.status !== 'godkand') a.push('<button type="button" class="kal-ok" data-a="godkand">✓ Godkänn</button>');
      if (r.status !== 'intyg_begart') a.push('<button type="button" class="bv-pagar" data-a="intyg_begart">📄 Begär läkarintyg</button>');
      if (r.status !== 'avslagen') a.push('<button type="button" class="vk-del" data-a="avslagen">Avslå</button>');
    }
    if (boss || r.status === 'ny') a.push('<button type="button" class="vk-del" data-a="del">Ta bort</button>');
    h += '<div class="vk-iact bv-act sj-act" data-id="' + r.id + '">' + a.join('') + '</div>';
    if (boss) {
      h += '<div class="sj-lonrow"><span>Sjuklön:</span>' + ['ej', 'beviljad', 'utbetald'].map(function (v) {
        return '<button type="button" class="bv-opt' + (r.sjuklon === v ? ' on' : '') + '" data-lon="' + v + '" data-id="' + r.id + '">' + { ej: 'Ej', beviljad: 'Beviljad', utbetald: 'Utbetald' }[v] + '</button>';
      }).join('') + '</div>';
      if (r.sjuklon_at) h += '<div class="vk-imeta">' + esc(LON[r.sjuklon]) + ' ' + esc(when(r.sjuklon_at)) + '</div>';
    }
    return h + '</div>';
  }

  function reportForm() {
    var f = st.form, t = today();
    return '<div class="vk-card"><div class="vk-ftitle">🤒 Anmäl sjuk</div>' +
      '<div class="vk-field"><label class="vk-lbl" for="sj-start">Första sjukdagen</label>' +
      '<input type="date" id="sj-start" class="sj-date" value="' + esc(f.start || t) + '" min="' + addDays(t, -14) + '" max="' + addDays(t, 1) + '"></div>' +
      '<div class="vk-field"><label class="vk-lbl" for="sj-com">Kommentar till ägaren (valfri)</label>' +
      '<textarea id="sj-com" maxlength="500" rows="2" placeholder="Till exempel: Jag hör av mig i morgon.">' + esc(f.comment || '') + '</textarea>' +
      '<div class="vk-imeta">Skriv inte diagnos eller orsak – det behövs inte.</div></div>' +
      '<div class="pm-btns"><button type="button" id="sj-cancel">Avbryt</button><button type="button" class="primary" id="sj-send"' + (st.busy ? ' disabled' : '') + '>Skicka sjukanmälan</button></div></div>';
  }
  function friskForm(r) {
    var f = st.form, t = today();
    return '<div class="vk-card"><div class="vk-ftitle">💪 Friskanmäl</div>' +
      (r.driver_id !== st.data.me ? '<div class="vk-imeta">Friskanmäler ' + esc(sn(r.name) || r.driver_id) + '.</div>' : '') +
      '<div class="vk-field"><label class="vk-lbl" for="sj-back">Första dagen ' + (r.driver_id !== st.data.me ? 'föraren' : 'du') + ' kan jobba igen</label>' +
      '<input type="date" id="sj-back" class="sj-date" value="' + esc(f.back || t) + '" min="' + addDays(r.start, 1) + '" max="' + addDays(t, 1) + '"></div>' +
      '<div class="vk-live" id="sj-days"></div>' +
      '<div class="pm-btns"><button type="button" id="sj-cancel">Avbryt</button><button type="button" class="primary" id="sj-frisk"' + (st.busy ? ' disabled' : '') + '>Friskanmäl</button></div></div>';
  }
  function findR(id) {
    var d = st.data || {}, all = (d.mine || []).concat(d.all || []);
    return all.filter(function (r) { return r.id === id; })[0] || null;
  }

  function draw() {
    var body = st.body; if (!body || !body.isConnected) return;
    if (st.err) { body.innerHTML = '<div class="tl-msg err">' + esc(st.err) + '</div>'; return; }
    var d = st.data; if (!d) { body.innerHTML = '<div class="tl-msg">Laddar…</div>'; return; }
    var h = '';
    if (st.flash) h += '<div class="vk-flash">' + esc(st.flash) + '</div>';
    var mine = d.mine || [], open = mine.filter(function (r) { return r.open; })[0];
    h += '<div class="vk-ltitle">Min sjukanmälan</div>';
    if (st.form && st.form.kind === 'frisk') h += friskForm(findR(st.form.id));
    else if (st.form && st.form.kind === 'ny') h += reportForm();
    else if (!open) h += '<button type="button" id="sj-new" class="vk-new">🤒 Anmäl sjuk</button>';
    if (open) h += card(open, false);
    h += reglerBox();
    var old = mine.filter(function (r) { return !r.open; });
    if (old.length) h += '<details class="sj-hist"><summary class="vk-ltitle">Mina tidigare sjukperioder (' + old.length + ')</summary>' + old.map(function (r) { return card(r, false); }).join('') + '</details>';
    if (d.boss) {
      var all = others();
      var F = { att: ['Att hantera', function (r) { return r.open || r.status === 'ny' || r.status === 'intyg_begart' || (r.status === 'godkand' && r.sjuklon !== 'utbetald'); }],
                pagar: ['Pågår', function (r) { return r.open; }], alla: ['Alla', function () { return true; }] };
      var list = all.filter(F[st.filter][1]);
      h += '<div class="vk-ltitle sj-boss">Förarnas sjukperioder · ägare' + (d.se_allt ? ' <small>(test: även dina egna)</small>' : '') + '</div><div class="sj-filter">' + Object.keys(F).map(function (k) {
        return '<button type="button" class="bv-opt' + (st.filter === k ? ' on' : '') + '" data-f="' + k + '">' + F[k][0] + ' (' + all.filter(F[k][1]).length + ')</button>';
      }).join('') + '</div>';
      if (!list.length) h += '<div class="tl-msg">Inga sjukperioder här.</div>';
      h += list.map(function (r) { return card(r, true); }).join('');
    }
    body.innerHTML = '<div id="sj-root">' + h + '</div>';
    bind(body);
    if (st.flash) { var fl = st.flash; setTimeout(function () { if (st.flash === fl) { st.flash = null; var e = body.querySelector('.vk-flash'); if (e) e.remove(); } }, 4000); }
  }

  function bind(body) {
    var q = function (s) { return body.querySelector(s); };
    if (q('#sj-new')) q('#sj-new').onclick = function () { st.form = { kind: 'ny', start: today(), comment: '' }; draw(); };
    if (q('#sj-cancel')) q('#sj-cancel').onclick = function () { st.form = null; draw(); };
    if (q('#sj-com')) q('#sj-com').oninput = function () { st.form.comment = this.value; };
    if (q('#sj-start')) q('#sj-start').onchange = function () { st.form.start = this.value; };
    if (q('#sj-send')) q('#sj-send').onclick = function () {
      var s = (q('#sj-start') || {}).value || today();
      act(rpc('sjuk_report', { p_start: s, p_comment: (q('#sj-com') || {}).value || null }), '🤒 Sjukanmälan skickad till ägaren. Krya på dig!');
    };
    var back = q('#sj-back');
    if (back) {
      var upd = function () {
        st.form.back = back.value; var r = findR(st.form.id), el = q('#sj-days'); if (!r || !el) return;
        var n = Math.round((pd(back.value) - pd(r.start)) / 864e5);
        el.textContent = n >= 1 ? 'Sjuk ' + dsv(r.start) + ' – ' + dsv(addDays(back.value, -1)) + ': ' + dagar(n) : 'Välj en dag efter första sjukdagen.';
      };
      back.onchange = upd; back.oninput = upd; upd();
    }
    if (q('#sj-frisk')) q('#sj-frisk').onclick = function () {
      act(rpc('sjuk_recover', { p_id: st.form.id, p_back: (q('#sj-back') || {}).value || today() }), '💪 Friskanmäld. Välkommen tillbaka!');
    };
    if (q('#sj-dc')) q('#sj-dc').oninput = function () { st.decide.comment = this.value; };
    if (q('#sj-dcancel')) q('#sj-dcancel').onclick = function () { st.decide = null; draw(); };
    if (q('#sj-dok')) q('#sj-dok').onclick = function () {
      var dc = st.decide;
      act(rpc('sjuk_decide', { p_id: dc.id, p_status: dc.status, p_comment: (q('#sj-dc') || {}).value || null }),
        { godkand: '✓ Godkänd. Föraren har fått besked.', intyg_begart: '📄 Föraren har ombetts ladda upp läkarintyg.', avslagen: 'Avslagen. Föraren har fått besked.' }[dc.status]);
    };
    body.querySelectorAll('.sj-filter [data-f]').forEach(function (b) { b.onclick = function () { st.filter = b.dataset.f; draw(); }; });
    body.querySelectorAll('[data-lon]').forEach(function (b) {
      b.onclick = function () { act(rpc('sjuk_set_sjuklon', { p_id: +b.dataset.id, p_value: b.dataset.lon }), b.dataset.lon === 'ej' ? null : '💰 ' + LON[b.dataset.lon] + '.'); };
    });
    body.querySelectorAll('.sj-act').forEach(function (box) {
      var id = +box.dataset.id;
      box.querySelectorAll('[data-a]').forEach(function (b) {
        b.onclick = function () {
          var a = b.dataset.a;
          if (a === 'frisk') { st.form = { kind: 'frisk', id: id, back: today() }; draw(); window.scrollTo(0, 0); }
          else if (a === 'certs') showCerts(id);
          else if (a === 'del') {
            if (!confirm('Ta bort sjukperioden och alla intyg? Det går inte att ångra.')) return;
            act(fn({ action: 'delete', report_id: id }), 'Sjukperioden är borttagen.');
          } else { st.decide = { id: id, status: a, comment: '' }; draw(); var t = body.querySelector('#sj-dc'); if (t) t.focus(); }
        };
      });
    });
    body.querySelectorAll('input[data-up]').forEach(function (inp) {
      inp.onchange = function () { var f = inp.files && inp.files[0]; if (f) upload(+inp.dataset.up, f); inp.value = ''; };
    });
    body.querySelectorAll('.sj-cdel').forEach(function (b) {
      b.onclick = function (ev) {
        ev.preventDefault();
        if (!confirm('Ta bort intyget?')) return;
        var rid = +b.dataset.r;
        fn({ action: 'delete_cert', cert_id: +b.dataset.c }).then(function () { delete st.certs[rid]; return load(); })
          .then(function () { showCerts(rid); }).catch(function (e) { if (!fail(e)) alert(errText(e)); });
      };
    });
  }

  function showCerts(id) {
    st.certs[id] = 'loading'; draw();
    fn({ action: 'list', report_id: id }).then(function (b) { st.certs[id] = b.certs || []; })
      .catch(function (e) { delete st.certs[id]; if (!fail(e)) alert(errText(e)); })
      .then(draw);
  }

  // Foto: skala ner i telefonen (max 1600 px, jpeg). PDF skickas som den är (högst 3 MB).
  function shrink(file) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var tries = [[1600, 0.8], [1280, 0.7], [1024, 0.6]], out = null;
        for (var i = 0; i < tries.length; i++) {
          var s = Math.min(1, tries[i][0] / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', tries[i][1]);
          if (out.length < 2500000) break;
        }
        URL.revokeObjectURL(url); ok(out.split(',')[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('bad_file')); };
      img.src = url;
    });
  }
  function readB64(file) {
    return new Promise(function (ok, no) {
      if (file.size > 3 * 1024 * 1024) return no(new Error('too_big'));
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1]); };
      r.onerror = function () { no(new Error('bad_file')); };
      r.readAsDataURL(file);
    });
  }
  function upload(id, file) {
    var pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    st.flash = '⏳ Laddar upp intyget…'; draw();
    act((pdf ? readB64(file) : shrink(file)).then(function (b64) {
      return fn({ action: 'upload', report_id: id, mime: pdf ? 'application/pdf' : 'image/jpeg', file: b64 });
    }).then(function () { delete st.certs[id]; }), '📄 Intyget är uppladdat. Ägaren har fått en notis.');
  }

  (function css() {
    var x = document.createElement('style');
    x.textContent =
      '.sj-rules summary{font-weight:600;cursor:pointer}.sj-rules ul{margin:.5rem 0 .4rem 1.1rem;padding:0;font-size:.9rem}.sj-rules li{margin-bottom:.25rem}.sj-rules p{font-size:.82rem;color:var(--text-soft);margin:.35rem 0}' +
      '.sj-date{width:100%;padding:.55rem;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-size:1rem;box-sizing:border-box;min-height:2.6rem}' +
      '.bv-st.sj-ny{background:var(--surface-soft);color:var(--primary)}.bv-st.sj-klar{background:var(--c-c6f6d5);color:var(--ok)}.bv-st.sj-pagar{background:var(--c-fefcbf);color:var(--c-975a16)}.bv-st.sj-nej{background:var(--danger-bg);color:var(--danger-text)}' +
      '.sj-card.sj-open{border-left:5px solid var(--accent)}.sj-lon.utbetald,.sj-lon.beviljad{color:var(--ok);font-weight:600}' +
      '.sj-up{flex:1 1 30%;min-width:0;display:flex;align-items:center;justify-content:center;padding:.45rem .3rem;font-size:.85rem;border-radius:8px;border:2px dashed var(--primary);color:var(--primary);cursor:pointer;box-sizing:border-box}' +
      '.sj-lonrow{display:flex;gap:5px;align-items:center;margin-top:.5rem;font-size:.85rem;color:var(--text-soft)}.sj-lonrow .bv-opt{flex:1;padding:.4rem .2rem;font-size:.85rem}' +
      '.sj-filter{display:flex;gap:5px;margin-bottom:.6rem}.sj-filter .bv-opt{flex:1;padding:.45rem .2rem;font-size:.82rem}' +
      '.sj-pdf{display:flex;align-items:center;justify-content:center;width:100px;height:100px;border-radius:8px;background:var(--surface-soft);color:var(--primary);font-weight:600;text-decoration:none}' +
      '.sj-hist summary{cursor:pointer;margin:.6rem 0 .4rem}.sj-boss{margin-top:1.1rem;border-top:1px solid var(--border-soft);padding-top:.8rem}' +
      '.bv-tabs.six .bv-tab{font-size:.6rem;padding:.35rem 0;letter-spacing:-.01em}.bv-tabs.six .bv-tab span{font-size:1rem}.bv-tabs.six .bv-bell{flex-basis:38px}';
    document.head.appendChild(x);
  })();
})();
