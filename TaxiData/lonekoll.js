/* Lönekoll: uppskattad lön utifrån det föraren har kört in (bara läsning, inget sparas på servern).
 *
 * Formeln är framräknad från lönebeskeden 2026 (Löneavi, Svenska Transportgruppen/iCab):
 *   inkört brutto − BOM = netto inkl moms
 *   ÷ 1,06 (6 % moms)   = netto exkl moms
 *   − Uberavgift (25 % av Uber brutto) − adm.avgift (≈1,3 %) − inpasseringsavgifter = lönegrund
 *   × 37 % = lön,  + 13 % semesterersättning = bruttolön (om den är inbakad i månadslönen),
 *   − preliminärskatt = nettolön
 *   − Kronofogden/förskott/övrigt − behållna kontanter + kortdricks = utbetalning
 * Preliminärskatten tas från Skatteverkets allmänna månadstabeller för 2026 (skattetabell-2026.js),
 * utifrån månadens bruttolön, vald tabell och kolumn. En fast procent går att välja i inställningarna.
 * Löneperiod: pass som STARTAR i kalendermånaden (lönebeskedet skriver t.ex. "2 sep – 1 okt"
 * men passlistan på beskedet är 1–30 sep). Lönen betalas runt den 25:e månaden efter.
 * Alla procentsatser och avdrag kan ändras under Inställningar och sparas bara i telefonen (localStorage).
 * Data: window.taxiPayData() i script.js (samma pass och resor som Körpassdata).
 * Semesterersättning: förvalt inbakad i månadslönen (sem_i_lon). Kan stängas av under Inställningar;
 * då ingår den inte i bruttolön, skatt eller utbetalning, men visas som intjänad semester.
 * Ångra: återgå till backup-grenen backup/pre-lonekoll-semester-val-20261114.
 */
(function () {
  'use strict';

  var L = window.LONEKOLL = { id: 'lonekoll', title: 'Lönekoll', icon: '💰' };

  var SET_KEY = 'lk_settings';
  var DEF = { provision: 37, semester: 13, sem_i_lon: true, moms: 6, uber: 25, adm: 1.3, inpass: 2500, skatt: 21, skatt_mode: 'tabell', tabell: 33, kolumn: 1, kfm: 0, forskott: 0, ovrigt: 0 };
  var FIELDS = [
    { k: 'provision', t: 'Provision (procent av lönegrund)', u: '%' },
    { k: 'semester', t: 'Semesterersättning', u: '%' },
    { k: 'uber', t: 'Uberavgift (av Uber brutto)', u: '%' },
    { k: 'adm', t: 'Administrationsavgift', u: '%' },
    { k: 'moms', t: 'Moms på taxiresor', u: '%' },
    { k: 'inpass', t: 'Inpasseringsavgifter per månad', u: 'kr' },
    { k: 'kfm', t: 'Kronofogden (utmätning) per månad', u: 'kr' },
    { k: 'forskott', t: 'Förskott att betala tillbaka', u: 'kr' },
    { k: 'ovrigt', t: 'Övriga avdrag', u: 'kr' }
  ];
  var MON = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  var st = { el: null, month: null, loading: false, err: null, showSet: false };

  // ---------- hjälp ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kr(n) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }
  function amt(s) { return parseFloat(String(s || '0').replace(/\s/g, '').replace(',', '.')) || 0; }
  function pct(n) { return String(n).replace('.', ',') + ' %'; }

  function loadSettings() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(SET_KEY) || '{}') || {}; } catch (e) { s = {}; }
    var o = {};
    Object.keys(DEF).forEach(function (k) {
      if (k === 'sem_i_lon') { o[k] = !(s[k] === false || s[k] === 'nej' || s[k] === 0 || s[k] === '0'); return; }
      if (k === 'skatt_mode') { o[k] = s[k] === 'procent' ? 'procent' : 'tabell'; return; }
      if (k === 'tabell') {
        var t = parseInt(s[k], 10);
        o[k] = t >= 29 && t <= 42 ? t : DEF.tabell;
        return;
      }
      if (k === 'kolumn') {
        var c = parseInt(s[k], 10);
        o[k] = c >= 1 && c <= 6 ? c : DEF.kolumn;
        return;
      }
      var v = parseFloat(s[k]);
      o[k] = isFinite(v) && v >= 0 ? v : DEF[k];
    });
    return o;
  }
  function saveSettings(o) { try { localStorage.setItem(SET_KEY, JSON.stringify(o)); } catch (e) {} }
  L.defaults = DEF;
  L.loadSettings = loadSettings;

  function taxFn() {
    var T = (typeof SKATTETABELL !== 'undefined' && SKATTETABELL) || (window && window.SKATTETABELL);
    return T && typeof T.tax === 'function' ? T.tax : null;
  }
  function taxAmount(bruttolon, s) {
    if (s && s.skatt_mode === 'procent') return (bruttolon || 0) * (s.skatt || 0) / 100;
    var fn = taxFn();
    if (!fn) return (bruttolon || 0) * ((s && s.skatt) || DEF.skatt) / 100;
    return fn(bruttolon, s && s.tabell, s && s.kolumn);
  }
  L.taxAmount = taxAmount;

  // Utbetalningsdag: den 25:e månaden efter, eller fredagen innan om den 25:e är lördag/söndag
  function payday(y, m) {
    var d = new Date(y, m + 1, 25);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
  }
  L.payday = payday;

  // Summerar resor: brutto (alla), BOM, Uber brutto, kontant, kortdricks
  function sums(trips) {
    var o = { brutto: 0, bom: 0, uber: 0, kontant: 0, dricks: 0, antal: 0 };
    (trips || []).forEach(function (t) {
      var b = amt(t.belopp), k = String(t.kredittyp || '');
      o.brutto += b;
      if (k === '999') { o.bom += b; return; }
      o.antal++;
      if (k === '164') o.uber += b;
      if (k === '1') o.kontant += b;
      else o.dricks += amt(t.dricks);
    });
    return o;
  }
  L.sums = sums;

  // Själva formeln. inpassShare = hur stor del av månadens inpasseringsavgift som räknas (0–1).
  function compute(x, s, inpassShare) {
    var r = {};
    r.brutto = x.brutto; r.bom = x.bom;
    r.nettoInkl = x.brutto - x.bom;
    r.exMoms = r.nettoInkl / (1 + s.moms / 100);
    r.momsKr = r.nettoInkl - r.exMoms;
    r.uberFee = x.uber * s.uber / 100;
    r.adm = r.exMoms * s.adm / 100;
    r.inpass = s.inpass * (inpassShare == null ? 1 : inpassShare);
    r.lonegrund = Math.max(0, r.exMoms - r.uberFee - r.adm - r.inpass);
    r.lon = r.lonegrund * s.provision / 100;
    r.sem = r.lon * s.semester / 100;
    r.sem_i_lon = s.sem_i_lon !== false;
    r.bruttolon = r.sem_i_lon ? r.lon + r.sem : r.lon;
    r.skatt = taxAmount(r.bruttolon, s);
    r.nettolon = r.bruttolon - r.skatt;
    r.avdrag = s.kfm + s.forskott + s.ovrigt;
    r.kontant = x.kontant; r.dricks = x.dricks;
    r.utbetalt = r.nettolon - r.avdrag - r.kontant + r.dricks;
    return r;
  }
  L.compute = compute;

  // Pass-start: "YYYYMMDD HH:MM" (samma format som i kördata).
  function parseStart(str) {
    var parts = String(str || '').split(' ');
    if (parts.length < 2) return null;
    var d = parts[0].replace(/\D/g, '');
    if (d.length < 8) return null;
    var tm = parts[1].replace(/\s/g, '');
    var dt = new Date(d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + 'T' + tm);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function monthTitle(y, m) {
    return MON[m].charAt(0).toUpperCase() + MON[m].slice(1) + ' ' + y;
  }

  // Intjänad semester per månad till och med through (inkl.), utifrån den kördata som finns.
  // thisShare används bara för just den månaden (pågående månad). payFn är taxiPayData eller en test-dubbel.
  function semesterAcc(s, throughY, throughM, thisShare, payFn) {
    var fn = payFn || (typeof window !== 'undefined' && window.taxiPayData);
    if (!fn) return null;
    var end = new Date(throughY, throughM + 1, 0, 23, 59, 59, 999);
    var wide = fn(new Date(1990, 0, 1), end);
    var first = null;
    ((wide && wide.shifts) || []).forEach(function (sh) {
      var d = parseStart(sh.start);
      if (d && (!first || d < first)) first = d;
    });
    if (!first) {
      return { thisMonth: 0, total: 0, from: null, to: { y: throughY, m: throughM } };
    }
    var y = first.getFullYear(), m = first.getMonth(), total = 0, thisMonth = 0;
    while (y < throughY || (y === throughY && m <= throughM)) {
      var d = fn(new Date(y, m, 1, 0, 0, 0), new Date(y, m + 1, 0, 23, 59, 59, 999));
      var share = (y === throughY && m === throughM && thisShare != null) ? thisShare : 1;
      var r = compute(sums(d && d.trips), s, share);
      total += r.sem || 0;
      if (y === throughY && m === throughM) thisMonth = r.sem || 0;
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return {
      thisMonth: thisMonth,
      total: total,
      from: { y: first.getFullYear(), m: first.getMonth() },
      to: { y: throughY, m: throughM }
    };
  }
  function semesterPeriodText(acc) {
    if (!acc || !acc.from) return '';
    var a = acc.from, b = acc.to;
    if (a.y === b.y && a.m === b.m) return monthTitle(a.y, a.m);
    if (a.y === b.y) return MON[a.m] + '–' + MON[b.m] + ' ' + b.y;
    return MON[a.m] + ' ' + a.y + ' – ' + MON[b.m] + ' ' + b.y;
  }
  L.parseStart = parseStart;
  L.semesterAcc = semesterAcc;
  L.semesterPeriodText = semesterPeriodText;

  function period() {
    var now = new Date();
    if (!st.month) st.month = new Date(now.getFullYear(), now.getMonth(), 1);
    var y = st.month.getFullYear(), m = st.month.getMonth();
    var from = new Date(y, m, 1, 0, 0, 0), to = new Date(y, m + 1, 0, 23, 59, 59, 999);
    var dim = to.getDate(), cur = now >= from && now <= to;
    var gone = cur ? now.getDate() : (now > to ? dim : 0);
    return { y: y, m: m, from: from, to: to, dim: dim, cur: cur, gone: gone, future: now < from };
  }

  // ---------- vy ----------
  var CSS = '.lk-big{font-size:1.9rem;font-weight:800;color:var(--primary);text-align:center;margin:.2rem 0}' +
    '.lk-sub{font-size:.85rem;color:var(--muted);text-align:center}' +
    '.lk-pair{display:flex;gap:.6rem}.lk-pair>div{flex:1;background:var(--surface-soft,#edf2f7);border-radius:10px;padding:.5rem;text-align:center}' +
    '.lk-pair b{display:block;font-size:1.15rem;color:var(--primary)}.lk-pair span{font-size:.78rem;color:var(--muted)}' +
    '.lk-step{display:flex;justify-content:space-between;gap:8px;padding:6px 4px;border-top:1px solid var(--border-soft,#e2e8f0);font-size:.92rem}' +
    '.lk-step .lk-t{flex:1}.lk-step .lk-h{display:block;font-size:.75rem;color:var(--muted)}.lk-step .lk-v{white-space:nowrap;text-align:right}' +
    '.lk-step.sum{font-weight:700;color:var(--primary);background:var(--surface-soft,#edf2f7);border-radius:8px;border-top-color:transparent}' +
    '.lk-step.minus .lk-v{color:var(--danger,#e53e3e)}.lk-step.plus .lk-v{color:var(--c-2f855a)}' +
    '.lk-note{font-size:.8rem;color:var(--muted);margin:.4rem 2px}' +
    '.lk-btn{display:block;width:100%;padding:.65rem;border-radius:8px;border:2px solid var(--primary);background:var(--surface);color:var(--primary);font-size:1rem;margin-top:.5rem}' +
    '.lk-btn.primary{background:var(--primary);color:var(--on-primary,#fff)}' +
    '.lk-mode{display:block;margin:.35rem 0;font-size:.95rem}' +
    '.lk-set .gm-row input{width:96px}.lk-set .gm-row span.u{width:22px;color:var(--muted);font-size:.85rem}.lk-warn{font-size:.82rem;line-height:1.4;color:var(--text-soft,var(--muted));background:var(--surface-soft,#edf2f7);border-left:3px solid var(--accent,#3182ce);border-radius:10px;padding:.55rem .75rem;margin:0 0 .75rem}';
  function ensureCss() {
    if (document.getElementById('lk-css')) return;
    var s = document.createElement('style'); s.id = 'lk-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  L.render = function (content) {
    ensureCss();
    st.el = content;
    content.innerHTML =
      '<div class="tl-controls"><div class="date-nav"><button type="button" id="lk-prev" aria-label="Föregående månad">‹</button>' +
      '<div id="lk-date" class="tl-date"></div><button type="button" id="lk-next" aria-label="Nästa månad">›</button>' +
      '<button type="button" id="lk-today" aria-label="Den här månaden">»</button></div></div><div id="lk-body"></div>';
    document.getElementById('lk-prev').onclick = function () { st.month = new Date(st.month.getFullYear(), st.month.getMonth() - 1, 1); draw(); };
    document.getElementById('lk-next').onclick = function () { if (!period().cur) { st.month = new Date(st.month.getFullYear(), st.month.getMonth() + 1, 1); draw(); } };
    document.getElementById('lk-today').onclick = function () { st.month = null; draw(); };
    if (window.taxiPayData && window.taxiPayData(new Date(), new Date())) {
      draw();
      // Visas direkt med datan som redan finns; är den äldre än en minut hämtas ny tyst i bakgrunden (t540u)
      if (window.taxiRefreshData) window.taxiRefreshData().then(function (ok) { if (ok && st.el === content && document.body.contains(content) && document.getElementById('lk-body')) draw(); });
      return;
    }
    st.loading = true; st.err = null; draw();
    var p = window.taxiEnsureData ? window.taxiEnsureData() : Promise.resolve();
    Promise.resolve(p).then(function () {
      st.loading = false;
      if (!window.taxiPayData || !window.taxiPayData(new Date(), new Date())) st.err = 'Kunde inte hämta dina körningar. Försök igen.';
      draw();
    }).catch(function () { st.loading = false; st.err = 'Kunde inte hämta dina körningar. Försök igen.'; draw(); });
  };

  function step(label, help, val, cls) {
    return '<div class="lk-step ' + (cls || '') + '"><span class="lk-t">' + esc(label) + (help ? '<span class="lk-h">' + esc(help) + '</span>' : '') +
      '</span><span class="lk-v">' + val + '</span></div>';
  }

  function taxLabel(s, r) {
    if (s.skatt_mode === 'procent') {
      return { t: '− Skatt ' + pct(s.skatt), h: 'Fast procent som du själv har valt' };
    }
    var eff = r.bruttolon ? (r.skatt / r.bruttolon * 100) : 0;
    var effTxt = (Math.round(eff * 10) / 10).toFixed(1).replace('.', ',');
    return {
      t: '− Skatt enligt tabell ' + s.tabell + ', kolumn ' + s.kolumn,
      h: 'Preliminärskatt 2026 från Skatteverket, utifrån din bruttolön den här månaden (' + effTxt + ' %)'
    };
  }

  function draw() {
    var body = document.getElementById('lk-body');
    if (!body) return;
    var p = period(), s = loadSettings();
    document.getElementById('lk-date').textContent = MON[p.m].charAt(0).toUpperCase() + MON[p.m].slice(1) + ' ' + p.y;
    var nx = document.getElementById('lk-next'); nx.disabled = p.cur; nx.style.opacity = p.cur ? '0.3' : '1';
    if (st.err) { body.innerHTML = '<div class="tl-msg err">' + esc(st.err) + '</div><button type="button" class="lk-btn" id="lk-retry">Försök igen</button>'; document.getElementById('lk-retry').onclick = function () { L.render(st.el); }; return; }
    if (st.loading) { body.innerHTML = '<div class="tl-msg">Laddar…</div>'; return; }

    var d = window.taxiPayData ? window.taxiPayData(p.from, p.to) : null;
    if (!d) { body.innerHTML = '<div class="tl-msg">Ingen data än.</div>'; return; }
    var x = sums(d.trips);
    var share = p.dim ? Math.min(1, p.gone / p.dim) : 1;
    var r = compute(x, s, share);
    var pd = payday(p.y, p.m);
    var pdTxt = pd.getDate() + ' ' + MON[pd.getMonth()];
    var taxL = taxLabel(s, r);

    // Prognos för hela månaden i samma takt (bara när månaden pågår)
    var proj = null;
    if (p.cur && p.gone > 0) {
      var f = p.dim / p.gone, xs = {};
      Object.keys(x).forEach(function (k) { xs[k] = x[k] * f; });
      proj = compute(xs, s, 1);
    }

    var h = '';
    if (!d.own) h += '<div class="tl-info">Du tittar på förare ' + esc(d.driver) + ' (vald i Körpassdata).</div>';
    h += '<div class="lk-warn" role="note">Obs: Rättade kvitton från Taxi Göteborg kommer in den 16:e varje månad. Fram till dess kan lönen här visa lite fel.</div>';
    h += '<div class="tl-card"><div class="lk-sub">Inkört hittills (pass som startar i ' + esc(MON[p.m]) + ')</div>' +
      '<div class="lk-big">' + kr(r.nettoInkl) + '</div>' +
      '<div class="lk-sub">' + d.shifts.length + ' pass · ' + x.antal + ' körningar · BOM ' + kr(x.bom) + ' borträknat</div>' +
      '<div class="lk-pair" style="margin-top:.6rem"><div><span>Beräknad utbetalning hittills</span><b>' + kr(r.utbetalt) + '</b></div>' +
      (proj ? '<div><span>Om du kör i samma takt hela månaden</span><b>' + kr(proj.utbetalt) + '</b></div>' : '') + '</div>' +
      '<div class="lk-sub" style="margin-top:.5rem">Lönen för ' + esc(MON[p.m]) + ' betalas ut runt <b>' + pdTxt + '</b></div></div>';

    h += '<div class="tl-card"><div class="tl-head"><span class="tl-title">Så räknas lönen, steg för steg</span></div>';
    h += step('Inkört brutto', 'Allt du kört in, även BOM', kr(r.brutto));
    h += step('− BOM', 'Bommade körningar ger ingen lön', '−' + kr(r.bom), 'minus');
    h += step('= Inkört inklusive moms', '', kr(r.nettoInkl), 'sum');
    h += step('− Moms ' + pct(s.moms), 'Inkört delas med ' + String(1 + s.moms / 100).replace('.', ','), '−' + kr(r.momsKr), 'minus');
    h += step('− Uberavgift', pct(s.uber) + ' av Uberkörningar (' + kr(x.uber) + ')', '−' + kr(r.uberFee), 'minus');
    h += step('− Administrationsavgift', pct(s.adm) + ' av inkört utan moms', '−' + kr(r.adm), 'minus');
    h += step('− Inpasseringsavgifter', share < 1 ? 'Del av ' + kr(s.inpass) + ' för den del av månaden som gått' : kr(s.inpass) + ' per månad (ändra under Inställningar)', '−' + kr(r.inpass), 'minus');
    h += step('= Lönegrund', 'Det som provisionen räknas på', kr(r.lonegrund), 'sum');
    h += step('× Provision ' + pct(s.provision), '', kr(r.lon));
    if (r.sem_i_lon) {
      h += step('+ Semesterersättning ' + pct(s.semester), 'Betalas ut i månadslönen', '+' + kr(r.sem), 'plus');
      h += step('= Bruttolön', 'Lön före skatt', kr(r.bruttolon), 'sum');
    } else {
      h += step('= Bruttolön', 'Lön före skatt, utan semesterersättning', kr(r.bruttolon), 'sum');
    }
    h += step(taxL.t, taxL.h, '−' + kr(r.skatt), 'minus');
    h += step('= Nettolön', '', kr(r.nettolon), 'sum');
    if (s.kfm) h += step('− Kronofogden', 'Utmätning (införsel)', '−' + kr(s.kfm), 'minus');
    if (s.forskott) h += step('− Förskott', '', '−' + kr(s.forskott), 'minus');
    if (s.ovrigt) h += step('− Övriga avdrag', '', '−' + kr(s.ovrigt), 'minus');
    if (!r.avdrag) h += step('− Kronofogden, förskott m.m.', 'Inga avdrag inlagda (ändra under Inställningar)', '0 kr');
    h += step('− Kontanter du behållit', 'Kontantkörningar, pengarna har du redan fått', '−' + kr(r.kontant), 'minus');
    h += step('+ Dricks på kort', 'Från kortkörningar (kan bli lite högre på lönebeskedet)', '+' + kr(r.dricks), 'plus');
    h += step('= Beräknad utbetalning', 'Det som kommer in på kontot', kr(r.utbetalt), 'sum');
    if (!r.sem_i_lon) {
      var acc = semesterAcc(s, p.y, p.m, share);
      h += step('Intjänad semester den här månaden', pct(s.semester) + ' av lönen, före skatt. Betalas inte ut i månadslönen.', kr(acc && acc.thisMonth != null ? acc.thisMonth : r.sem));
      if (acc && acc.from && !(acc.from.y === acc.to.y && acc.from.m === acc.to.m)) {
        h += step('Intjänat totalt ' + semesterPeriodText(acc), 'Summa före skatt, utifrån den kördata som finns i appen', kr(acc.total));
      } else if (acc && acc.from) {
        h += '<div class="lk-note">Ingen tidigare månad finns i kördatan, så totalsumman är samma som den här månaden.</div>';
      }
    }
    h += '</div>';

    h += '<div class="tl-card lk-set"><div class="tl-head"><span class="tl-title">Inställningar</span></div>';
    if (st.showSet) {
      h += '<div class="lk-note">Så räknas skatten</div>';
      h += '<label class="lk-mode"><input type="radio" name="lk-skatt-mode" id="lk-mode-tabell" value="tabell"' + (s.skatt_mode !== 'procent' ? ' checked' : '') + '> Enligt skattetabellen (anpassar sig efter lönen)</label>';
      h += '<label class="lk-mode"><input type="radio" name="lk-skatt-mode" id="lk-mode-procent" value="procent"' + (s.skatt_mode === 'procent' ? ' checked' : '') + '> Fast procent</label>';
      h += '<div id="lk-tabell-box">';
      h += '<div class="gm-row"><label for="lk-tabell">Skattetabell</label><span style="display:flex;align-items:center;gap:4px">' +
        '<input id="lk-tabell" type="number" inputmode="numeric" step="1" min="29" max="42" value="' + esc(s.tabell) + '"></span></div>';
      h += '<div class="gm-row"><label for="lk-kolumn">Kolumn</label><span style="display:flex;align-items:center;gap:4px">' +
        '<input id="lk-kolumn" type="number" inputmode="numeric" step="1" min="1" max="6" value="' + esc(s.kolumn) + '"></span></div>';
      h += '<div class="lk-note">Tabellnumret står på lönebeskedet. I Göteborg är det oftast 33, eller 34 om du betalar kyrkoavgift. Kolumn 1 är vanlig lön om du inte har fyllt 66 år.</div>';
      h += '</div>';
      h += '<div id="lk-procent-box"><div class="gm-row"><label for="lk-skatt">Skatt (fast uppskattning)</label><span style="display:flex;align-items:center;gap:4px">' +
        '<input id="lk-skatt" type="number" inputmode="decimal" step="any" min="0" value="' + esc(s.skatt) + '"><span class="u">%</span></span></div></div>';
      h += '<div class="lk-note">Semesterersättning i månadslönen</div>';
      h += '<label class="lk-mode"><input type="radio" name="lk-sem-i-lon" id="lk-sem-ja" value="ja"' + (s.sem_i_lon !== false ? ' checked' : '') + '> Ja, den är inbakad</label>';
      h += '<label class="lk-mode"><input type="radio" name="lk-sem-i-lon" id="lk-sem-nej" value="nej"' + (s.sem_i_lon === false ? ' checked' : '') + '> Nej, den betalas ut separat</label>';
      FIELDS.forEach(function (F) {
        h += '<div class="gm-row"><label for="lk-' + F.k + '">' + esc(F.t) + '</label><span style="display:flex;align-items:center;gap:4px">' +
          '<input id="lk-' + F.k + '" type="number" inputmode="decimal" step="any" min="0" value="' + esc(s[F.k]) + '"><span class="u">' + F.u + '</span></span></div>';
      });
      h += '<button type="button" class="lk-btn primary" id="lk-save">Spara</button><button type="button" class="lk-btn" id="lk-reset">Återställ standardvärden</button>';
    } else {
      var skattTxt = s.skatt_mode === 'procent' ? ('skatt ' + pct(s.skatt)) : ('skatt enligt tabell ' + s.tabell + ' kolumn ' + s.kolumn);
      var semTxt = 'semesterersättning ' + pct(s.semester) + (s.sem_i_lon !== false ? ' i månadslönen' : ' inte i månadslönen');
      h += '<div class="lk-note">Provision ' + pct(s.provision) + ', ' + semTxt + ', ' + skattTxt +
        ', Kronofogden ' + kr(s.kfm) + '. Värdena sparas bara i din telefon.</div><button type="button" class="lk-btn" id="lk-edit">Ändra värden</button>';
    }
    h += '</div>';
    h += '<div class="tl-foot">Det här är en uppskattning, inte ett lönebesked. Skatten tas från Skatteverkets tabell för 2026 utifrån månadens bruttolön. Den riktiga lönen kan ändå skilja sig, till exempel vid annan tabell eller kolumn, jämkning, justerade kvitton eller andra avgifter. Jämför gärna med ditt lönebesked.</div>';
    body.innerHTML = h;

    function syncMode() {
      var isT = !document.getElementById('lk-mode-procent') || !document.getElementById('lk-mode-procent').checked;
      var a = document.getElementById('lk-tabell-box');
      var b = document.getElementById('lk-procent-box');
      if (a) a.style.display = isT ? '' : 'none';
      if (b) b.style.display = isT ? 'none' : '';
    }
    var mt = document.getElementById('lk-mode-tabell'); if (mt) mt.onchange = syncMode;
    var mp = document.getElementById('lk-mode-procent'); if (mp) mp.onchange = syncMode;
    syncMode();

    var e = document.getElementById('lk-edit'); if (e) e.onclick = function () { st.showSet = true; draw(); };
    var sv = document.getElementById('lk-save'); if (sv) sv.onclick = function () {
      var o = loadSettings();
      FIELDS.forEach(function (F) { var v = parseFloat(String(document.getElementById('lk-' + F.k).value).replace(',', '.')); o[F.k] = isFinite(v) && v >= 0 ? v : DEF[F.k]; });
      o.skatt_mode = (document.getElementById('lk-mode-procent') && document.getElementById('lk-mode-procent').checked) ? 'procent' : 'tabell';
      o.sem_i_lon = !(document.getElementById('lk-sem-nej') && document.getElementById('lk-sem-nej').checked);
      var t = parseInt(document.getElementById('lk-tabell') && document.getElementById('lk-tabell').value, 10);
      var c = parseInt(document.getElementById('lk-kolumn') && document.getElementById('lk-kolumn').value, 10);
      var pctv = parseFloat(String((document.getElementById('lk-skatt') || {}).value || '').replace(',', '.'));
      o.tabell = t >= 29 && t <= 42 ? t : DEF.tabell;
      o.kolumn = c >= 1 && c <= 6 ? c : DEF.kolumn;
      o.skatt = isFinite(pctv) && pctv >= 0 ? pctv : DEF.skatt;
      saveSettings(o); st.showSet = false; draw();
    };
    var rs = document.getElementById('lk-reset'); if (rs) rs.onclick = function () { saveSettings(DEF); st.showSet = false; draw(); };
  }

 if(window.VIEW_STATE){var nav=VIEW_STATE.get('lonekoll',{});if(nav.month&&!isNaN(new Date(nav.month)))st.month=new Date(nav.month);VIEW_STATE.bind('lonekoll',function(){return {month:st.month?st.month.toISOString():null};});}

})();
