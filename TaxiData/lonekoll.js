/* Lönekoll: uppskattad lön utifrån det föraren har kört in (bara läsning, inget sparas på servern).
 *
 * Formeln är framräknad från lönebeskeden 2026 (Löneavi, Svenska Transportgruppen/iCab):
 *   inkört brutto − BOM = netto inkl moms
 *   ÷ 1,06 (6 % moms)   = netto exkl moms
 *   − Uberavgift (25 % av Uber brutto) − adm.avgift (≈1,3 %) − inpasseringsavgifter = lönegrund
 *   × 37 % = lön,  + 13 % semesterersättning = bruttolön,  − preliminärskatt = nettolön
 *   − Kronofogden/förskott/övrigt − behållna kontanter + kortdricks = utbetalning
 * Löneperiod: pass som STARTAR i kalendermånaden (lönebeskedet skriver t.ex. "2 sep – 1 okt"
 * men passlistan på beskedet är 1–30 sep). Lönen betalas runt den 25:e månaden efter.
 * Alla procentsatser och avdrag kan ändras under Inställningar och sparas bara i telefonen (localStorage).
 * Data: window.taxiPayData() i script.js (samma pass och resor som Körpassdata).
 * Ångra: se UNDO-lonekoll-2026-10-26.md.
 */
(function () {
  'use strict';

  var L = window.LONEKOLL = { id: 'lonekoll', title: 'Lönekoll', icon: '💰' };

  var SET_KEY = 'lk_settings';
  var DEF = { provision: 37, semester: 13, moms: 6, uber: 25, adm: 1.3, inpass: 2500, skatt: 21, kfm: 0, forskott: 0, ovrigt: 0 };
  var FIELDS = [
    { k: 'provision', t: 'Provision (procent av lönegrund)', u: '%' },
    { k: 'semester', t: 'Semesterersättning', u: '%' },
    { k: 'skatt', t: 'Skatt (uppskattning, se din skattetabell)', u: '%' },
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
    Object.keys(DEF).forEach(function (k) { var v = parseFloat(s[k]); o[k] = isFinite(v) && v >= 0 ? v : DEF[k]; });
    return o;
  }
  function saveSettings(o) { try { localStorage.setItem(SET_KEY, JSON.stringify(o)); } catch (e) {} }
  L.defaults = DEF;

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
    r.bruttolon = r.lon + r.sem;
    r.skatt = r.bruttolon * s.skatt / 100;
    r.nettolon = r.bruttolon - r.skatt;
    r.avdrag = s.kfm + s.forskott + s.ovrigt;
    r.kontant = x.kontant; r.dricks = x.dricks;
    r.utbetalt = r.nettolon - r.avdrag - r.kontant + r.dricks;
    return r;
  }
  L.compute = compute;

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
    '.lk-set .gm-row input{width:96px}.lk-set .gm-row span.u{width:22px;color:var(--muted);font-size:.85rem}';
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
    if (window.taxiPayData && window.taxiPayData(new Date(), new Date())) { draw(); return; }
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

    // Prognos för hela månaden i samma takt (bara när månaden pågår)
    var proj = null;
    if (p.cur && p.gone > 0) {
      var f = p.dim / p.gone, xs = {};
      Object.keys(x).forEach(function (k) { xs[k] = x[k] * f; });
      proj = compute(xs, s, 1);
    }

    var h = '';
    if (!d.own) h += '<div class="tl-info">Du tittar på förare ' + esc(d.driver) + ' (vald i Körpassdata).</div>';
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
    h += step('+ Semesterersättning ' + pct(s.semester), 'Betalas ut varje månad', '+' + kr(r.sem), 'plus');
    h += step('= Bruttolön', 'Lön före skatt', kr(r.bruttolon), 'sum');
    h += step('− Skatt ' + pct(s.skatt), 'Uppskattning. Den riktiga skatten tas från skattetabellen', '−' + kr(r.skatt), 'minus');
    h += step('= Nettolön', '', kr(r.nettolon), 'sum');
    if (s.kfm) h += step('− Kronofogden', 'Utmätning (införsel)', '−' + kr(s.kfm), 'minus');
    if (s.forskott) h += step('− Förskott', '', '−' + kr(s.forskott), 'minus');
    if (s.ovrigt) h += step('− Övriga avdrag', '', '−' + kr(s.ovrigt), 'minus');
    if (!r.avdrag) h += step('− Kronofogden, förskott m.m.', 'Inga avdrag inlagda (ändra under Inställningar)', '0 kr');
    h += step('− Kontanter du behållit', 'Kontantkörningar, pengarna har du redan fått', '−' + kr(r.kontant), 'minus');
    h += step('+ Dricks på kort', 'Från kortkörningar (kan bli lite högre på lönebeskedet)', '+' + kr(r.dricks), 'plus');
    h += step('= Beräknad utbetalning', 'Det som kommer in på kontot', kr(r.utbetalt), 'sum');
    h += '</div>';

    h += '<div class="tl-card lk-set"><div class="tl-head"><span class="tl-title">Inställningar</span></div>';
    if (st.showSet) {
      FIELDS.forEach(function (F) {
        h += '<div class="gm-row"><label for="lk-' + F.k + '">' + esc(F.t) + '</label><span style="display:flex;align-items:center;gap:4px">' +
          '<input id="lk-' + F.k + '" type="number" inputmode="decimal" step="any" min="0" value="' + esc(s[F.k]) + '"><span class="u">' + F.u + '</span></span></div>';
      });
      h += '<button type="button" class="lk-btn primary" id="lk-save">Spara</button><button type="button" class="lk-btn" id="lk-reset">Återställ standardvärden</button>';
    } else {
      h += '<div class="lk-note">Provision ' + pct(s.provision) + ', semesterersättning ' + pct(s.semester) + ', skatt ' + pct(s.skatt) +
        ', Kronofogden ' + kr(s.kfm) + '. Värdena sparas bara i din telefon.</div><button type="button" class="lk-btn" id="lk-edit">Ändra värden</button>';
    }
    h += '</div>';
    h += '<div class="tl-foot">Det här är en uppskattning, inte ett lönebesked. Den riktiga lönen kan skilja sig, till exempel på grund av skattetabell, ' +
      'justerade kvitton och avgifter. Jämför gärna med ditt lönebesked.</div>';
    body.innerHTML = h;

    var e = document.getElementById('lk-edit'); if (e) e.onclick = function () { st.showSet = true; draw(); };
    var sv = document.getElementById('lk-save'); if (sv) sv.onclick = function () {
      var o = {};
      FIELDS.forEach(function (F) { var v = parseFloat(String(document.getElementById('lk-' + F.k).value).replace(',', '.')); o[F.k] = isFinite(v) && v >= 0 ? v : DEF[F.k]; });
      saveSettings(o); st.showSet = false; draw();
    };
    var rs = document.getElementById('lk-reset'); if (rs) rs.onclick = function () { saveSettings(DEF); st.showSet = false; draw(); };
  }
})();
