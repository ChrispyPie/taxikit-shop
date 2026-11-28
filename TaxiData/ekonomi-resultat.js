/* Admin › Ekonomi › Resultat (UTKAST, ej live): tjänar åkeriet pengar? Plus eller minus per månad eller år.
 * Räknas i telefonen av data som redan finns: ekonomi_loneunderlag (fas 2, hela året per månad och förare), ekonomi_period (fas 1: sjuklön, verkstad)
 * och ekonomi_kostnader (manuella poster + bilarnas årskostnader från Bilar). Se docs/ekonomi/PLAN-resultat.md.
 * Formler som Lönekoll/bilkalkylen: ex moms = (inkört + 0,25 × Uber) ÷ 1,06, Uberavgift 25 %, adm 1,3 %, inpassering 2 500 kr, lön = provision × lönegrund,
 * semester 13 %, arbetsgivaravgift på lön + semester (+ sjuklön), pension/löneskatt/övriga försäkringar enligt inställningen (bas 'lon' eller 'lon_sem').
 * Ångra: ta bort scripttaggen i admin.html och raden EKRES i ekonomi.js. SQL: supabase/migrations/undo/20261128b_ekonomi_resultat_undo.sql
 */
(function () {
  'use strict';
  var MON = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  var MONS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var KAT = { bil: 'Bil', bransle: 'Bränsle och el', lokal: 'Lokal', forsakring: 'Försäkring', administration: 'Administration', skador: 'Skador och böter', avgift: 'Avgifter', ovrigt: 'Övrigt' };
  var TYP = { engang: 'Engång', manad: 'Per månad', ar: 'Per år' };
  var R = window.EKRES = { lu: {}, kost: null, err: null, busy: {}, form: false };

  function kr(n) { n = Math.round(n || 0); return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('sv-SE') + ' kr'; }
  function skr(n) { n = Math.round(n || 0); return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('sv-SE') + ' kr'; }
  function cap(t) { return t.replace(/^./, function (c) { return c.toUpperCase(); }); }
  function num(v) { v = parseFloat(v); return isFinite(v) ? v : 0; }
  function cfg() {
    var d = { agavg: 31.42, pension: 4.4, loneskatt: 1.067, ovr_forsakr: 0.26, bas: 'lon' };
    return typeof lkCfg === 'function' ? Object.assign(d, lkCfg()) : d;
  }
  function skattPct() { try { return num(localStorage.getItem('ek_skatt')); } catch (e) { return 0; } }
  function css() {
    if (document.getElementById('ekres-css')) return;
    var s = document.createElement('style'); s.id = 'ekres-css';
    s.textContent = '.rs-hero{border-radius:12px;padding:14px 12px;margin-bottom:10px;text-align:center;background:var(--surface)}' +
      '.rs-big{display:block;font-size:calc(34px * var(--font-scale, 1));font-weight:800;margin:2px 0}.rs-plus{color:#2f855a}.rs-minus{color:#c53030}' +
      '.rs-hero small{display:block;color:var(--c-718096);font-size:calc(12px * var(--font-scale, 1))}' +
      '.rs-chart{position:relative;display:flex;gap:4px;height:130px;align-items:stretch}.rs-c{flex:1;min-width:0;display:flex;flex-direction:column;cursor:pointer;opacity:.55}.rs-c.on{opacity:1}' +
      '.rs-up,.rs-dn{flex:1;display:flex;flex-direction:column;min-height:0}.rs-up{justify-content:flex-end}.rs-dn{justify-content:flex-start}' +
      '.rs-c i{display:block;min-height:0}.rs-c .p{background:#38a169;border-radius:3px 3px 0 0}.rs-c .m{background:#e53e3e;border-radius:0 0 3px 3px}' +
      '.rs-c span{text-align:center;font-size:calc(10px * var(--font-scale, 1));color:var(--c-718096)}.rs-z{position:absolute;left:0;right:0;top:50%;border-top:1px solid var(--c-edf2f7)}' +
      '.rs-form{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.rs-form input,.rs-form select{width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid var(--c-edf2f7);background:var(--surface);color:inherit;font-size:calc(14px * var(--font-scale, 1))}' +
      '.rs-form .w{grid-column:1/3}.rs-del{background:none;border:0;color:#c53030;cursor:pointer;font-size:calc(13px * var(--font-scale, 1))}';
    document.head.appendChild(s);
  }

  // ---------- data ----------
  R.load = function (year) {
    if (R.lu[year] && R.kost) return Promise.resolve();
    if (R.busy[year]) return R.busy[year];
    R.err = null;
    var p = Promise.all([
      R.lu[year] ? R.lu[year] : rpc('ekonomi_loneunderlag', { p_from: year + '-01-01', p_to: year + '-12-31' }),
      R.kost ? R.kost : rpc('ekonomi_kostnader', {})
    ]).then(function (a) { R.lu[year] = a[0]; R.kost = a[1]; })
      .catch(function (e) { R.err = (e && e.code === 'PGRST202') ? 'Resultat finns inte på servern ännu.' : errText(e); })
      .then(function () { delete R.busy[year]; if (window.EKONOMI) EKONOMI.draw(); });
    R.busy[year] = p; return p;
  };

  // En månad (0–11) för ett år. Returnerar alla poster.
  function month(year, m, E) {
    var key = year + '-' + ('0' + (m + 1)).slice(-2) + '-01', c = cfg(), lu = R.lu[year], K = R.kost || { manuella: [], bilar: [] };
    var o = { inkort: 0, uber: 0, ex: 0, brutto: 0, momsUt: 0, uberFee: 0, adm: 0, inpass: 0, lon: 0, sem: 0, forare: [], sjuk: 0, verkstad: 0, bilar: [], manuella: [], momsIn: 0 };
    ((lu && lu.forare) || []).forEach(function (f) {
      (f.manader || []).forEach(function (mm) {
        if (mm.mon !== key) return;
        var l = mm.l, ik = num(l.inkort), ub = num(l.uber), ex = (ik + 0.25 * ub) / 1.06;
        o.inkort += ik; o.uber += ub; o.ex += ex; o.brutto += ik + 0.25 * ub; o.uberFee += 0.25 * ub; o.adm += 0.013 * ex; o.inpass += 2500 * num(l.inpass_man);
        o.lon += num(l.lon); o.sem += num(l.sem);
        o.forare.push({ id: f.driver_id, namn: f.namn, ex: ex, lon: num(l.lon), sem: num(l.sem) });
      });
    });
    o.momsUt = o.brutto - o.ex;
    var d = (E && E.data) || {};
    (d.sjuk || []).forEach(function (x) { if (String(x.mon).slice(0, 7) === key.slice(0, 7)) o.sjuk += num(x.kr); });
    (d.verkstad || []).forEach(function (x) { if (String(x.mon).slice(0, 7) === key.slice(0, 7)) o.verkstad += num(x.approved_kr); });
    var base = o.lon + o.sem + o.sjuk, b2 = c.bas === 'lon_sem' ? o.lon + o.sem : o.lon;
    o.agavg = base * c.agavg / 100; o.pension = b2 * c.pension / 100; o.loneskatt = b2 * c.loneskatt / 100; o.ovrF = b2 * c.ovr_forsakr / 100;
    o.lonekost = o.lon + o.sem + o.agavg + o.pension + o.loneskatt + o.ovrF;
    var first = new Date(year, m, 1), last = new Date(year, m + 1, 0);
    (K.bilar || []).forEach(function (b) {
      if (b.i_trafik && new Date(b.i_trafik) > last) return; if (b.ur_trafik && new Date(b.ur_trafik) < first) return;
      var avskr = num(b.inkopspris) && num(b.livslangd_ar) ? num(b.inkopspris) / num(b.livslangd_ar) : 0;
      var sum = (avskr + num(b.rantor_ar) + num(b.skatt_ar) + num(b.service_ar) + num(b.taxiavg_ar) + num(b.forsakring_ar) + num(b.tvatt_ar)) / 12;
      if (sum) o.bilar.push({ namn: 'Bil ' + b.bilnummer, kr: sum });
    });
    (K.manuella || []).forEach(function (x) {
      var f = new Date(x.fran), t = x.till ? new Date(x.till) : null, kr0 = 0;
      if (x.typ === 'engang') { if (f.getFullYear() === year && f.getMonth() === m) kr0 = num(x.belopp); }
      else if (f <= last && (!t || t >= first)) kr0 = x.typ === 'ar' ? num(x.belopp) / 12 : num(x.belopp);
      if (kr0) { o.manuella.push({ id: x.id, namn: x.namn, kategori: x.kategori, kr: kr0 }); o.momsIn += kr0 * num(x.moms_pct) / 100; }
    });
    o.avgifter = o.uberFee + o.adm + o.inpass;
    o.bil = o.bilar.reduce(function (s, x) { return s + x.kr; }, 0);
    o.man = o.manuella.reduce(function (s, x) { return s + x.kr; }, 0);
    o.kostnader = o.avgifter + o.lonekost + o.sjuk + o.verkstad + o.bil + o.man;
    o.resultat = o.ex - o.kostnader;
    return o;
  }
  R.month = month;
  function sum(list) {   // slår ihop månader (för årsvyn)
    var t = { forare: {}, bilar: {}, manuella: {} };
    ['inkort', 'uber', 'ex', 'brutto', 'momsUt', 'uberFee', 'adm', 'inpass', 'lon', 'sem', 'sjuk', 'verkstad', 'agavg', 'pension', 'loneskatt', 'ovrF', 'lonekost', 'bil', 'man', 'momsIn', 'avgifter', 'kostnader', 'resultat']
      .forEach(function (k) { t[k] = list.reduce(function (s, o) { return s + o[k]; }, 0); });
    list.forEach(function (o) {
      o.forare.forEach(function (f) { var x = t.forare[f.id] = t.forare[f.id] || { namn: f.namn, ex: 0, lon: 0, sem: 0 }; x.ex += f.ex; x.lon += f.lon; x.sem += f.sem; });
      o.bilar.forEach(function (b) { var x = t.bilar[b.namn] = t.bilar[b.namn] || { namn: b.namn, kr: 0 }; x.kr += b.kr; });
      o.manuella.forEach(function (b) { var x = t.manuella[b.id] = t.manuella[b.id] || { id: b.id, namn: b.namn, kategori: b.kategori, kr: 0 }; x.kr += b.kr; });
    });
    return t;
  }
  R.calc = function (E) {
    var months = []; for (var m = 0; m < 12; m++) months.push(month(E.year, m, E));
    var sel = E.mode === 'ar' ? sum(months.filter(function (o, i) { return !(E.year === new Date().getFullYear() && i > new Date().getMonth()); })) : sum([months[E.month]]);
    var sk = skattPct(); sel.skatt = sk > 0 && sel.resultat > 0 ? sel.resultat * sk / 100 : 0; sel.efter = sel.resultat - sel.skatt; sel.skattPct = sk;
    sel.moms = sel.momsUt - sel.momsIn;
    return { months: months, sel: sel };
  };

  // ---------- vy ----------
  function row(lbl, sub, v, cls) { return '<div class="ek-row"><span>' + lbl + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="r ' + (cls || '') + '">' + v + '</span></div>'; }
  function grp(k, title, total, inner, E) {
    var open = E.open['r' + k] ? ' open' : '';
    return '<div class="ek-card"><details data-k="r' + k + '"' + open + ' ontoggle="EKONOMI.tg(this)"><summary><b>' + title + '</b><span class="r">' + total + '</span></summary><div class="ek-body">' + inner + '</div></details></div>';
  }
  function chart(c, E) {
    var max = 1; c.months.forEach(function (o) { max = Math.max(max, Math.abs(o.resultat)); });
    var now = new Date();
    return '<div class="rs-chart"><div class="rs-z"></div>' + c.months.map(function (o, i) {
      var h = Math.round(Math.abs(o.resultat) / max * 100), empty = !o.ex && !o.kostnader;
      return '<div class="rs-c' + (E.mode === 'manad' && E.month === i ? ' on' : '') + '" onclick="EKRES.pick(' + i + ')" title="' + cap(MON[i]) + ' ' + skr(o.resultat) + '">' +
        '<div class="rs-up">' + (o.resultat > 0 && !empty ? '<i class="p" style="height:' + h + '%"></i>' : '') + '</div>' +
        '<div class="rs-dn">' + (o.resultat < 0 ? '<i class="m" style="height:' + h + '%"></i>' : '') + '</div><span>' + MONS[i] + '</span></div>';
    }).join('') + '</div>';
  }
  R.pick = function (i) { EKONOMI.mode = 'manad'; EKONOMI.month = i; EKONOMI.draw(); };

  R.html = function (E) {
    css();
    if (R.err) return '<div class="ek-card">' + esc(R.err) + '<button class="ek-link" onclick="EKRES.retry()">Försök igen</button></div>';
    if (!R.lu[E.year] || !R.kost) { R.load(E.year); return '<div class="ek-card">Räknar resultat…</div>'; }
    var c = R.calc(E), s = c.sel, plus = s.resultat >= 0, per = E.mode === 'ar' ? String(E.year) : MON[E.month] + ' ' + E.year;
    var h = '<div class="rs-hero"><small>Resultat före skatt · ' + esc(per) + '</small><span class="rs-big ' + (plus ? 'rs-plus' : 'rs-minus') + '">' + skr(s.resultat) + '</span>' +
      '<small>Intäkter ' + kr(s.ex) + ' · Kostnader ' + kr(s.kostnader) + (s.skatt ? ' · efter skatt ' + kr(s.efter) : '') + '</small></div>';
    h += '<div class="ek-card"><div class="ek-h">Resultat per månad ' + E.year + '</div>' + chart(c, E) + '</div>';
    h += grp('int', '💰 Intäkter', kr(s.ex), row('Inkört inkl. moms', 'kort, kontant, faktura m.m.', kr(s.inkort)) + (s.uber ? row('Uber brutto', '', kr(s.uber)) : '') +
      row('Exkl. moms', 'inkört + Uber tillbaka till brutto ÷ 1,06', kr(s.ex)), E);
    h += grp('avg', '🧾 Avgifter', kr(-s.avgifter), row('Uberavgift 25 %', '', kr(-s.uberFee)) + row('Adm.avgift 1,3 %', '', kr(-s.adm)) + row('Inpassering', '2 500 kr per förare och månad', kr(-s.inpass)), E);
    var fl = Object.keys(s.forare).map(function (k) { return s.forare[k]; }).sort(function (a, b) { return b.lon - a.lon; });
    h += grp('lon', '👥 Förarlöner och lönebikostnader', kr(-s.lonekost),
      row('Lön', 'provision × lönegrund', kr(-s.lon)) + row('Semesterersättning 13 %', '', kr(-s.sem)) + row('Arbetsgivaravgift', cfg().agavg + ' % på lön, semester och sjuklön', kr(-s.agavg)) +
      row('Pension, löneskatt, övr. försäkringar', cfg().pension + ' + ' + cfg().loneskatt + ' + ' + cfg().ovr_forsakr + ' %', kr(-(s.pension + s.loneskatt + s.ovrF))) +
      '<div class="ek-h" style="margin-top:8px">Per förare (lön + semester)</div>' + fl.map(function (f) { return row(esc(window.shortName ? shortName(f.namn) : f.namn), '', kr(-(f.lon + f.sem))); }).join(''), E);
    h += grp('sv', '🩺 Sjuklön och verkstad', kr(-(s.sjuk + s.verkstad)), row('Sjuklön', 'beviljad, utan arbetsgivaravgift', kr(-s.sjuk)) + row('Verkstadstimmar', 'godkänd tid × timpris', kr(-s.verkstad)), E);
    var bl = Object.keys(s.bilar).map(function (k) { return s.bilar[k]; }).sort(function (a, b) { return a.namn < b.namn ? -1 : 1; });
    h += grp('bil', '🚕 Bilkostnader', kr(-s.bil), (bl.length ? bl.map(function (b) { return row(esc(b.namn), 'avskrivning, räntor, skatt, service, försäkring, tvätt, taxiavgift', kr(-b.kr)); }).join('') :
      '<div class="ek-row"><span>Inga bilkostnader ifyllda. Fyll i under Bilar.</span></div>'), E);
    var ml = Object.keys(s.manuella).map(function (k) { return s.manuella[k]; });
    h += grp('man', '🧰 Övriga kostnader', kr(-s.man), (ml.map(function (x) { return '<div class="ek-row"><span>' + esc(x.namn) + '<small>' + esc(KAT[x.kategori] || x.kategori) + '</small></span><span class="r">' + kr(-x.kr) +
        ' <button class="rs-del" onclick="EKRES.del(' + x.id + ')">Ta bort</button></span></div>'; }).join('') || '<div class="ek-row"><span>Inga poster i perioden.</span></div>') + form(), E);
    h += grp('moms', '🏛️ Moms och skatt (info)', kr(s.moms), row('Utgående moms', '6 % taxi', kr(s.momsUt)) + row('Ingående moms', 'på manuella poster', kr(-s.momsIn)) + row('Moms att redovisa', 'räknas inte som intäkt eller kostnad', kr(s.moms)) +
      row('Skatt (uppskattad)', s.skattPct ? s.skattPct + ' % av vinsten' : 'av', s.skatt ? kr(-s.skatt) : '–') +
      '<button class="ek-link" onclick="EKRES.setSkatt()">Ange skatt i % (t.ex. 20,6 för aktiebolag)</button>', E);
    return h;
  };
  function form() {
    var h = '<button class="ek-link" onclick="EKRES.toggleForm()">' + (R.form ? 'Stäng' : '＋ Lägg till kostnad') + '</button>';
    if (!R.form) return h;
    var y = new Date().toISOString().slice(0, 10);
    return h + '<div class="rs-form"><select id="rs-kat">' + Object.keys(KAT).map(function (k) { return '<option value="' + k + '">' + KAT[k] + '</option>'; }).join('') + '</select>' +
      '<select id="rs-typ">' + Object.keys(TYP).map(function (k) { return '<option value="' + k + '"' + (k === 'manad' ? ' selected' : '') + '>' + TYP[k] + '</option>'; }).join('') + '</select>' +
      '<input id="rs-namn" class="w" placeholder="Namn, t.ex. Bokföring" maxlength="80"><input id="rs-belopp" type="number" inputmode="decimal" placeholder="Belopp exkl. moms">' +
      '<select id="rs-moms"><option value="25">Moms 25 %</option><option value="12">Moms 12 %</option><option value="6">Moms 6 %</option><option value="0">Ingen moms</option></select>' +
      '<input id="rs-fran" type="date" value="' + y + '"><input id="rs-till" type="date" placeholder="Till (valfritt)"><input id="rs-bil" class="w" placeholder="Bilnummer (valfritt)">' +
      '<button class="ek-link w" onclick="EKRES.save()">Spara kostnad</button></div>';
  }
  R.toggleForm = function () { R.form = !R.form; EKONOMI.draw(); };
  R.retry = function () { R.err = null; R.load(EKONOMI.year); EKONOMI.draw(); };
  R.setSkatt = function () {
    var v = prompt('Skatt i procent av vinsten (0 = av):', skattPct() || '');
    if (v == null) return; try { localStorage.setItem('ek_skatt', String(num(String(v).replace(',', '.')))); } catch (e) {} EKONOMI.draw();
  };
  R.save = function () {
    var g = function (id) { return (document.getElementById(id) || {}).value || ''; };
    var p = { kategori: g('rs-kat'), typ: g('rs-typ'), namn: g('rs-namn'), belopp: String(g('rs-belopp')).replace(',', '.'), moms_pct: g('rs-moms'), fran: g('rs-fran'), till: g('rs-till'), bil: g('rs-bil') };
    if (!p.namn.trim() || !(parseFloat(p.belopp) >= 0) || !p.fran) { alert('Fyll i namn, belopp och datum.'); return; }
    rpc('ekonomi_kostnad_spara', { p_id: null, p: p }).then(function () { R.kost = null; R.form = false; return R.load(EKONOMI.year); })
      .catch(function (e) { alert(e && e.message === 'invalid_cost' ? 'Kontrollera fälten (belopp, datum, till efter från).' : errText(e)); });
  };
  R.del = function (id) {
    if (!confirm('Ta bort kostnaden?')) return;
    rpc('ekonomi_kostnad_ta_bort', { p_id: id }).then(function () { R.kost = null; return R.load(EKONOMI.year); }).catch(function (e) { alert(errText(e)); });
  };
})();
