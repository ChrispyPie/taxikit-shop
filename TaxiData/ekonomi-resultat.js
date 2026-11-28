/* Admin › Ekonomi › Resultat (UTKAST, ej live): tjänar åkeriet pengar? Plus eller minus per månad eller år.
 * Räknas i telefonen av data som redan finns: ekonomi_loneunderlag, ekonomi_period och ekonomi_kostnader
 * (manuella poster + bilkostnader som BARA läses från Bilar + ev. bränsleutdrag). Se docs/ekonomi/PLAN-resultat.md.
 * Formler som Lönekoll/bilkalkylen. Bolagsskatt 20,6 % på positivt resultat före skatt (kan ändras).
 * Ångra: ta bort scripttaggen i admin.html och raden EKRES i ekonomi.js.
 * SQL: supabase/migrations/undo/20261128b_ekonomi_resultat_undo.sql och 20261128c_ekonomi_utdrag_undo.sql
 */
(function () {
  'use strict';
  var MON = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  var MONS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var KAT = { bransle: 'Bränsle och el', dack: 'Däck', lokal: 'Lokal', forsakring: 'Försäkring', administration: 'Administration', skador: 'Skador och böter', avgift: 'Avgifter', bil: 'Bil', ovrigt: 'Övrigt' };
  var TYP = { engang: 'Engång', manad: 'Per månad', ar: 'Per år' };
  var TG_DEF = 13000, SKATT_DEF = 20.6, FIL_MAX = 8388608;
  var R = window.EKRES = { lu: {}, kost: null, err: null, busy: {}, form: false, editId: null, pending: null };

  function kr(n) { n = Math.round(n || 0); return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('sv-SE') + ' kr'; }
  function skr(n) { n = Math.round(n || 0); return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('sv-SE') + ' kr'; }
  function cap(t) { return t.replace(/^./, function (c) { return c.toUpperCase(); }); }
  function num(v) { v = parseFloat(v); return isFinite(v) ? v : 0; }
  function cfg() {
    var d = { agavg: 31.42, pension: 4.4, loneskatt: 1.067, ovr_forsakr: 0.26, bas: 'lon' };
    return typeof lkCfg === 'function' ? Object.assign(d, lkCfg()) : d;
  }
  function skattPct() {
    try { var v = localStorage.getItem('ek_skatt'); if (v === null || v === '') return SKATT_DEF; return num(String(v).replace(',', '.')); }
    catch (e) { return SKATT_DEF; }
  }
  function monKey(year, m) { return year + '-' + ('0' + (m + 1)).slice(-2) + '-01'; }
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
      '.rs-form .w{grid-column:1/3}.rs-del{background:none;border:0;color:#c53030;cursor:pointer;font-size:calc(13px * var(--font-scale, 1));padding:0 4px}' +
      '.rs-edit{background:none;border:0;color:var(--primary);cursor:pointer;font-size:calc(13px * var(--font-scale, 1));padding:0 4px}' +
      '.rs-flag{color:#c05621}.rs-file{margin-top:8px}.rs-file input[type=file]{width:100%;font-size:calc(13px * var(--font-scale, 1))}' +
      '.rs-prop{background:var(--c-edf2f7);border-radius:8px;padding:10px;margin-top:8px}';
    document.head.appendChild(s);
  }

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

  function carKind(b) {
    if (b.finansiering === 'leasing' || b.finansiering === 'avbetalning' || b.finansiering === 'agd') return b.finansiering;
    var t = String(b.bildtyp || '').toLowerCase(), m = String(b.modell || '').toLowerCase();
    if (t === 'mirai' || m.indexOf('mirai') !== -1) return 'leasing';
    if (t === 'storbil' || t === 'trafic' || m.indexOf('storbil') !== -1) return 'avbetalning';
    return 'agd';
  }
  function activeCar(b, first, last) {
    if (b.i_trafik && new Date(b.i_trafik) > last) return false;
    if (b.ur_trafik && new Date(b.ur_trafik) < first) return false;
    return true;
  }

  function month(year, m, E) {
    var key = monKey(year, m), c = cfg(), lu = R.lu[year], K = R.kost || { manuella: [], bilar: [], utdrag: [] };
    var o = { inkort: 0, uber: 0, ex: 0, brutto: 0, momsUt: 0, uberFee: 0, adm: 0, inpass: 0, lon: 0, sem: 0, forare: [], sjuk: 0, verkstad: 0, bilar: [], manuella: [], bransle: [], momsIn: 0, tg: 0, nBilar: 0, tgFlag: false };
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
      if (!activeCar(b, first, last)) return;
      o.nBilar++;
      var kind = carKind(b), namn = (b.modell ? b.modell + ' · ' : 'Bil ') + b.bilnummer, item;
      if (kind === 'leasing') {
        var kr0 = num(b.belopp_manad != null ? b.belopp_manad : b.leasing_manad);
        item = { namn: namn, kr: kr0, typ: 'leasing', sub: 'Leasing, 3 år, allt utom däck', flag: kr0 ? 'kolla beloppet med Berra' : 'belopp saknas · ange under Bilar' };
      } else if (kind === 'avbetalning') {
        var kr1 = num(b.belopp_manad != null ? b.belopp_manad : b.avbetalning_manad);
        item = { namn: namn, kr: kr1, typ: 'avbetalning', sub: 'Avbetalning (antagande)', flag: 'kolla med Berra (belopp och vad som ingår)' };
      } else {
        var avskr = num(b.inkopspris) && num(b.livslangd_ar) ? num(b.inkopspris) / num(b.livslangd_ar) : 0;
        var sum = (avskr + num(b.rantor_ar) + num(b.skatt_ar) + num(b.service_ar) + num(b.forsakring_ar) + num(b.tvatt_ar)) / 12;
        item = { namn: namn, kr: sum, typ: 'agd', sub: 'avskrivning, räntor, skatt, service, försäkring, tvätt' };
      }
      o.bilar.push(item);
      if (b.taxiavg_manad != null || b.taxiavg_ar != null) o.tg += b.taxiavg_manad != null ? num(b.taxiavg_manad) : num(b.taxiavg_ar) / 12;
      else { o.tg += TG_DEF; o.tgFlag = true; }
    });
    (K.manuella || []).forEach(function (x) {
      var f = new Date(x.fran), t = x.till ? new Date(x.till) : null, kr0 = 0;
      if (x.typ === 'engang') { if (f.getFullYear() === year && f.getMonth() === m) kr0 = num(x.belopp); }
      else if (f <= last && (!t || t >= first)) kr0 = x.typ === 'ar' ? num(x.belopp) / 12 : num(x.belopp);
      if (kr0) {
        var rec = { id: x.id, namn: x.namn, kategori: x.kategori, typ: x.typ, fran: x.fran, till: x.till, bil: x.bil, moms_pct: x.moms_pct, belopp: x.belopp, kr: kr0 };
        if (x.kategori === 'bransle') o.bransle.push(rec); else o.manuella.push(rec);
        o.momsIn += kr0 * num(x.moms_pct) / 100;
      }
    });
    o.avgifter = o.uberFee + o.adm + o.inpass + o.tg;
    o.bil = o.bilar.reduce(function (s, x) { return s + x.kr; }, 0);
    o.bra = o.bransle.reduce(function (s, x) { return s + x.kr; }, 0);
    o.man = o.manuella.reduce(function (s, x) { return s + x.kr; }, 0);
    o.kostnader = o.avgifter + o.lonekost + o.sjuk + o.verkstad + o.bil + o.bra + o.man;
    o.resultat = o.ex - o.kostnader;
    return o;
  }
  R.month = month;

  function sum(list) {
    var t = { forare: {}, bilar: {}, manuella: {}, bransle: {} };
    ['inkort', 'uber', 'ex', 'brutto', 'momsUt', 'uberFee', 'adm', 'inpass', 'lon', 'sem', 'sjuk', 'verkstad', 'agavg', 'pension', 'loneskatt', 'ovrF', 'lonekost', 'bil', 'bra', 'man', 'momsIn', 'avgifter', 'tg', 'nBilar', 'kostnader', 'resultat']
      .forEach(function (k) { t[k] = list.reduce(function (s, o) { return s + (o[k] || 0); }, 0); });
    t.tgFlag = list.some(function (o) { return o.tgFlag; });
    list.forEach(function (o) {
      o.forare.forEach(function (f) { var x = t.forare[f.id] = t.forare[f.id] || { namn: f.namn, ex: 0, lon: 0, sem: 0 }; x.ex += f.ex; x.lon += f.lon; x.sem += f.sem; });
      o.bilar.forEach(function (b) { var x = t.bilar[b.namn] = t.bilar[b.namn] || { namn: b.namn, kr: 0, typ: b.typ, sub: b.sub, flag: b.flag }; x.kr += b.kr; });
      o.manuella.forEach(function (b) { var x = t.manuella[b.id] = t.manuella[b.id] || Object.assign({}, b, { kr: 0 }); x.kr += b.kr; });
      o.bransle.forEach(function (b) { var x = t.bransle[b.id] = t.bransle[b.id] || Object.assign({}, b, { kr: 0 }); x.kr += b.kr; });
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

  function row(lbl, sub, v, cls) { return '<div class="ek-row"><span>' + lbl + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="r ' + (cls || '') + '">' + v + '</span></div>'; }
  function grp(k, title, total, inner, E) {
    var open = E.open['r' + k] ? ' open' : '';
    return '<div class="ek-card"><details data-k="r' + k + '"' + open + ' ontoggle="EKONOMI.tg(this)"><summary><b>' + title + '</b><span class="r">' + total + '</span></summary><div class="ek-body">' + inner + '</div></details></div>';
  }
  function chart(c, E) {
    var max = 1; c.months.forEach(function (o) { max = Math.max(max, Math.abs(o.resultat)); });
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
    var c = R.calc(E), s = c.sel, plus = s.efter >= 0, per = E.mode === 'ar' ? String(E.year) : MON[E.month] + ' ' + E.year;
    var h = '<div class="rs-hero"><small>Resultat efter bolagsskatt · ' + esc(per) + '</small><span class="rs-big ' + (plus ? 'rs-plus' : 'rs-minus') + '">' + skr(s.efter) + '</span>' +
      '<small>Före skatt ' + skr(s.resultat) + (s.skattPct ? ' · Bolagsskatt ' + String(s.skattPct).replace('.', ',') + ' % ' + (s.skatt ? kr(-s.skatt) : '(förlust, 0 kr)') : '') +
      '<br>Intäkter ' + kr(s.ex) + ' · Kostnader ' + kr(s.kostnader) + '</small></div>';
    h += '<div class="ek-card"><div class="ek-h">Resultat före skatt per månad ' + E.year + '</div>' + chart(c, E) + '</div>';
    h += grp('int', '💰 Intäkter', kr(s.ex), row('Inkört inkl. moms', 'kort, kontant, faktura m.m.', kr(s.inkort)) + (s.uber ? row('Uber brutto', '', kr(s.uber)) : '') +
      row('Exkl. moms', 'inkört + Uber tillbaka till brutto ÷ 1,06', kr(s.ex)), E);
    h += grp('avg', '🧾 Avgifter', kr(-s.avgifter), row('Uberavgift 25 %', '', kr(-s.uberFee)) + row('Adm.avgift 1,3 %', '', kr(-s.adm)) + row('Inpassering', '2 500 kr per förare och månad', kr(-s.inpass)) +
      row('Taxi Göteborg-avgift', (s.tgFlag ? '<span class="rs-flag">ca </span>' : '') + '13 000 kr per aktiv bil och månad' + (s.nBilar ? ' · ' + (E.mode === 'ar' ? 'över året' : s.nBilar + ' bilar') : '') +
        (s.tgFlag ? ' · <span class="rs-flag">kolla med Berra</span>' : ''), kr(-s.tg)) +
      '<button class="ek-link" onclick="EKONOMI.toBilar()">Redigera i Bilar</button>', E);
    var fl = Object.keys(s.forare).map(function (k) { return s.forare[k]; }).sort(function (a, b) { return b.lon - a.lon; });
    h += grp('lon', '👥 Förarlöner och lönebikostnader', kr(-s.lonekost),
      row('Lön', 'provision × lönegrund', kr(-s.lon)) + row('Semesterersättning 13 %', '', kr(-s.sem)) + row('Arbetsgivaravgift', cfg().agavg + ' % på lön, semester och sjuklön', kr(-s.agavg)) +
      row('Pension, löneskatt, övr. försäkringar', cfg().pension + ' + ' + cfg().loneskatt + ' + ' + cfg().ovr_forsakr + ' %', kr(-(s.pension + s.loneskatt + s.ovrF))) +
      '<div class="ek-h" style="margin-top:8px">Per förare (lön + semester)</div>' + fl.map(function (f) { return row(esc(window.shortName ? shortName(f.namn) : f.namn), '', kr(-(f.lon + f.sem))); }).join(''), E);
    h += grp('sv', '🩺 Sjuklön och verkstad', kr(-(s.sjuk + s.verkstad)), row('Sjuklön', 'beviljad, utan arbetsgivaravgift', kr(-s.sjuk)) + row('Verkstadstimmar', 'godkänd tid × timpris', kr(-s.verkstad)), E);
    var bl = Object.keys(s.bilar).map(function (k) { return s.bilar[k]; }).sort(function (a, b) { return a.namn < b.namn ? -1 : 1; });
    h += grp('bil', '🚕 Bilkostnader', kr(-s.bil), (bl.length ? bl.map(function (b) {
      return row(esc(b.namn), (b.sub || '') + (b.flag ? ' · <span class="rs-flag">' + b.flag + '</span>' : ''), kr(-b.kr));
    }).join('') : '<div class="ek-row"><span>Inga bilkostnader ifyllda under Bilar.</span></div>') +
      '<div class="ek-note" style="text-align:left">Däck ingår inte i Mirai-leasingen, lägg in under Övriga kostnader. Bilkostnader redigeras bara under Bilar.</div>' +
      '<button class="ek-link" onclick="EKONOMI.toBilar()">Redigera i Bilar</button>', E);
    h += grp('bra', '⛽ Bränsle och el', kr(-s.bra), braHtml(s, E), E);
    var ml = Object.keys(s.manuella).map(function (k) { return s.manuella[k]; });
    h += grp('man', '🧰 Övriga kostnader', kr(-s.man), (ml.map(costRow).join('') || '<div class="ek-row"><span>Inga poster i perioden.</span></div>') + form(), E);
    h += grp('moms', '🏛️ Moms och skatt', kr(s.moms), row('Utgående moms', '6 % taxi', kr(s.momsUt)) + row('Ingående moms', 'på manuella poster och bränsle', kr(-s.momsIn)) +
      row('Moms att redovisa', 'räknas inte som intäkt eller kostnad', kr(s.moms)) +
      row('Bolagsskatt', s.skattPct ? s.skattPct.toLocaleString('sv-SE') + ' % av vinsten före skatt (aktiebolag). 0 kr vid förlust.' : 'av', s.skatt ? kr(-s.skatt) : '0 kr') +
      row('Resultat efter skatt', '', '<b class="' + (plus ? 'rs-plus' : 'rs-minus') + '">' + skr(s.efter) + '</b>') +
      '<button class="ek-link" onclick="EKRES.setSkatt()">Ändra bolagsskatt i % (förvalt 20,6)</button>', E);
    return h;
  };

  function costRow(x) {
    return '<div class="ek-row"><span>' + esc(x.namn) + '<small>' + esc(KAT[x.kategori] || x.kategori) + '</small></span><span class="r">' + kr(-x.kr) +
      ' <button class="rs-edit" onclick="EKRES.edit(' + x.id + ')">Ändra</button>' +
      ' <button class="rs-del" onclick="EKRES.del(' + x.id + ')">Ta bort</button></span></div>';
  }
  function utdragFor(E) {
    var mon = monKey(E.year, E.month);
    return ((R.kost && R.kost.utdrag) || []).filter(function (u) { return String(u.mon).slice(0, 7) === mon.slice(0, 7); });
  }
  function braHtml(s, E) {
    var br = Object.keys(s.bransle).map(function (k) { return s.bransle[k]; });
    var h = br.map(costRow).join('') || '<div class="ek-row"><span>Ingen bränslekostnad sparad för perioden.</span></div>';
    if (E.mode === 'ar') return h + '<div class="ek-note" style="text-align:left">Ladda upp månadsutdrag i månadsvyn.</div>';
    utdragFor(E).forEach(function (u) {
      h += '<div class="ek-row"><span>' + esc(u.filnamn) + '<small>' + (u.status === 'bekraftad' ? 'Bekräftad' : 'Väntar på bekräftelse') +
        (u.parsad && u.parsad.rader ? ' · ' + u.parsad.rader + ' rader' : '') + '</small></span><span class="r">' +
        (u.parsad_summa != null ? kr(u.parsad_summa) : '') +
        ' <button class="rs-del" onclick="EKRES.delUtdrag(' + u.id + ')">Ta bort</button></span></div>';
    });
    if (R.pending && R.pending.mon === monKey(E.year, E.month)) {
      h += '<div class="rs-prop"><b>Föreslagen summa: ' + kr(R.pending.forslag) + '</b>' +
        '<small style="display:block;color:var(--c-718096)">' + esc(R.pending.filnamn) + (R.pending.parsad && R.pending.parsad.rader ? ' · ' + R.pending.parsad.rader + ' rader tolkade' : '') +
        (R.pending.typ === 'csv' ? '' : ' · PDF/bild: fyll i beloppet själv') + '</small>' +
        '<div class="rs-form"><input id="rs-bra-sum" type="number" inputmode="decimal" value="' + (R.pending.forslag || '') + '" placeholder="Belopp exkl. moms">' +
        '<select id="rs-bra-moms"><option value="25">Moms 25 %</option><option value="12">Moms 12 %</option><option value="0">Ingen moms</option></select>' +
        '<button class="ek-link w" onclick="EKRES.confirmUtdrag()">Bekräfta och spara som Bränsle och el</button></div></div>';
    }
    h += '<div class="rs-file"><label class="ek-link" style="display:block;cursor:pointer">📄 Ladda upp månadsutdrag (CSV, PDF eller bild)' +
      '<input type="file" accept=".csv,.txt,text/csv,text/plain,application/pdf,image/*" style="display:none" onchange="EKRES.upload(this)"></label>' +
      '<div class="ek-note" style="text-align:left;margin:6px 0 0">CSV tolkas och en summa föreslås. PDF och bild sparas, du fyller i beloppet. Filen ses bara av ägare och superadmin och kan tas bort. Kort och format är inte klara än – kolla med Berra.</div></div>';
    return h;
  }

  function form() {
    var ed = null;
    if (R.editId && R.kost) (R.kost.manuella || []).concat().forEach(function (x) { if (x.id === R.editId) ed = x; });
    var h = '<button class="ek-link" onclick="EKRES.toggleForm()">' + (R.form ? 'Stäng' : '＋ Lägg till kostnad') + '</button>';
    if (!R.form) return h;
    var y = (ed && ed.fran) || new Date().toISOString().slice(0, 10);
    var opt = function (obj, cur, fallback) { return Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (k === (cur || fallback) ? ' selected' : '') + '>' + obj[k] + '</option>'; }).join(''); };
    var moms = ed && String(ed.moms_pct != null ? +ed.moms_pct : 25);
    return h + '<div class="rs-form"><select id="rs-kat">' + opt(KAT, ed && ed.kategori, 'ovrigt') + '</select>' +
      '<select id="rs-typ">' + opt(TYP, ed && ed.typ, 'manad') + '</select>' +
      '<input id="rs-namn" class="w" placeholder="Namn, t.ex. Bokföring" maxlength="80" value="' + esc(ed ? ed.namn : '') + '">' +
      '<input id="rs-belopp" type="number" inputmode="decimal" placeholder="Belopp exkl. moms" value="' + (ed && ed.belopp != null ? ed.belopp : '') + '">' +
      '<select id="rs-moms"><option value="25"' + (moms === '25' || !ed ? ' selected' : '') + '>Moms 25 %</option><option value="12"' + (moms === '12' ? ' selected' : '') + '>Moms 12 %</option><option value="6"' + (moms === '6' ? ' selected' : '') + '>Moms 6 %</option><option value="0"' + (moms === '0' ? ' selected' : '') + '>Ingen moms</option></select>' +
      '<input id="rs-fran" type="date" value="' + y + '"><input id="rs-till" type="date" value="' + (ed && ed.till ? String(ed.till).slice(0, 10) : '') + '">' +
      '<input id="rs-bil" class="w" placeholder="Bilnummer (valfritt)" value="' + esc(ed && ed.bil ? ed.bil : '') + '">' +
      '<button class="ek-link w" onclick="EKRES.save()">' + (ed ? 'Spara ändring' : 'Spara kostnad') + '</button></div>';
  }

  R.toggleForm = function () { R.form = !R.form; if (!R.form) R.editId = null; EKONOMI.draw(); };
  R.edit = function (id) { R.editId = id; R.form = true; if (window.EKONOMI) { EKONOMI.open.rman = 1; EKONOMI.open.rbra = 1; EKONOMI.draw(); } };
  R.retry = function () { R.err = null; R.load(EKONOMI.year); EKONOMI.draw(); };
  R.setSkatt = function () {
    var v = prompt('Bolagsskatt i procent av vinsten före skatt (aktiebolag 20,6). 0 = av:', skattPct());
    if (v == null) return;
    try { localStorage.setItem('ek_skatt', String(num(String(v).replace(',', '.')))); } catch (e) {}
    EKONOMI.draw();
  };
  R.save = function () {
    var g = function (id) { return (document.getElementById(id) || {}).value || ''; };
    var p = { kategori: g('rs-kat'), typ: g('rs-typ'), namn: g('rs-namn'), belopp: String(g('rs-belopp')).replace(',', '.'), moms_pct: g('rs-moms'), fran: g('rs-fran'), till: g('rs-till'), bil: g('rs-bil') };
    if (!p.namn.trim() || !(parseFloat(p.belopp) >= 0) || !p.fran) { alert('Fyll i namn, belopp och datum.'); return; }
    rpc('ekonomi_kostnad_spara', { p_id: R.editId || null, p: p }).then(function () { R.kost = null; R.form = false; R.editId = null; return R.load(EKONOMI.year); })
      .catch(function (e) { alert(e && e.message === 'invalid_cost' ? 'Kontrollera fälten (belopp, datum, till efter från).' : errText(e)); });
  };
  R.del = function (id) {
    if (!confirm('Ta bort kostnaden?')) return;
    rpc('ekonomi_kostnad_ta_bort', { p_id: id }).then(function () { R.kost = null; return R.load(EKONOMI.year); }).catch(function (e) { alert(errText(e)); });
  };

  // ----- CSV-tolkning (generisk; exakt format när Berra skickat exempel) -----
  function numSv(s) {
    s = String(s == null ? '' : s).trim().replace(/\s/g, '').replace(/kr$/i, '').replace(/sek$/i, '');
    if (!s || s === '-') return null;
    if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function splitCsv(line, sep) {
    var out = [], cur = '', q = false, i, c;
    for (i = 0; i < line.length; i++) {
      c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  R.parseCsv = function (text) {
    text = String(text || '').replace(/^\ufeff/, '');
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return { ok: false, fel: 'Filen är tom.' };
    var seps = [';', ',', '\t'], sep = seps[0], best = 0;
    seps.forEach(function (s) { var n = lines[0].split(s).length; if (n > best) { best = n; sep = s; } });
    if (best < 2) return { ok: false, fel: 'Kunde inte hitta kolumner i filen.' };
    var rows = lines.map(function (l) { return splitCsv(l, sep); });
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var score = function (h) { if (/^(belopp|amount|summa|total|debit|debet|kredit|credit)$/.test(h)) return 3; if (/belopp|amount|summa|total|debit|debet|kredit|credit|\bkr\b|\bsek\b/.test(h)) return 2; return 0; };
    var cols = []; head.forEach(function (h, i) { var sc = score(h); if (sc) cols.push({ i: i, h: h, sc: sc }); });
    function colSum(i, sign) {
      var s = 0, n = 0, hopp = 0, v, r;
      for (r = 1; r < rows.length; r++) { v = numSv(rows[r][i]); if (v == null) hopp++; else { s += sign * v; n++; } }
      return { sum: Math.round(s * 100) / 100, rader: n, hoppade: hopp };
    }
    var deb = cols.filter(function (c) { return /debit|debet/.test(c.h) && !/kredit|credit/.test(c.h); })[0];
    var kre = cols.filter(function (c) { return /kredit|credit/.test(c.h); })[0];
    var use, t, metod;
    if (deb && kre) {
      var a = colSum(deb.i, 1), b = colSum(kre.i, 1);
      t = { sum: Math.round((a.sum - b.sum) * 100) / 100, rader: a.rader, hoppade: a.hoppade, kolumn: deb.h + ' − ' + kre.h, metod: 'debit-kredit' };
    } else if (cols.length) {
      cols.sort(function (a, b) { return b.sc - a.sc; });
      use = cols[0]; t = colSum(use.i, 1); t.kolumn = use.h; t.metod = 'kolumn';
    } else {
      var last = rows[0].length - 1, filled = colSum(last, 1);
      if (filled.rader < Math.max(1, (rows.length - 1) * 0.5)) return { ok: false, fel: 'Hittade ingen beloppskolumn. Fyll i summan för hand.' };
      t = filled; t.kolumn = 'sista kolumnen'; t.metod = 'sista';
    }
    if (!t.rader) return { ok: false, fel: 'Inga belopp kunde läsas. Fyll i summan för hand.' };
    t.ok = true; t.sep = sep; return t;
  };

  function mimeOf(file) {
    var t = (file.type || '').toLowerCase(), n = (file.name || '').toLowerCase();
    if (t === 'text/csv' || n.endsWith('.csv')) return 'text/csv';
    if (t === 'text/plain' || n.endsWith('.txt')) return 'text/plain';
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'application/pdf';
    if (t === 'image/jpeg' || n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (t === 'image/png' || n.endsWith('.png')) return 'image/png';
    if (t === 'image/webp' || n.endsWith('.webp')) return 'image/webp';
    if (t === 'image/heic' || n.endsWith('.heic')) return 'image/heic';
    return null;
  }
  function b64(buf) {
    var u = new Uint8Array(buf), s = '', i;
    for (i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }
  R.upload = function (inp) {
    var file = inp && inp.files && inp.files[0]; if (!file) return;
    inp.value = '';
    if (file.size > FIL_MAX) { alert('Filen är för stor (max 8 MB).'); return; }
    var mime = mimeOf(file); if (!mime) { alert('Välj en CSV, en PDF eller en bild.'); return; }
    var mon = monKey(EKONOMI.year, EKONOMI.month);
    var reader = new FileReader();
    reader.onerror = function () { alert('Kunde inte läsa filen.'); };
    reader.onload = function () {
      var forslag = null, parsad = null, typ = (mime === 'text/csv' || mime === 'text/plain') ? 'csv' : 'fil';
      if (typ === 'csv') {
        var text = '';
        try { text = new TextDecoder('utf-8').decode(reader.result); } catch (e) { text = ''; }
        var p = R.parseCsv(text);
        if (p.ok) { forslag = p.sum; parsad = { rader: p.rader, kolumn: p.kolumn, metod: p.metod, hoppade: p.hoppade }; }
        else parsad = { fel: p.fel };
      }
      rpc('ekonomi_utdrag_ladda', { p_mon: mon, p_filnamn: file.name, p_mime: mime, p_base64: b64(reader.result), p_forslag: forslag, p_parsad: parsad })
        .then(function (d) {
          R.pending = { id: d.id, mon: mon, filnamn: file.name, forslag: forslag, parsad: parsad, typ: typ };
          R.kost = null; EKONOMI.open.rbra = 1; return R.load(EKONOMI.year);
        })
        .catch(function (e) { alert(e && e.message === 'invalid_cost' ? 'Filen kunde inte sparas. Kontrollera typ och storlek (max 8 MB).' : errText(e)); });
    };
    reader.readAsArrayBuffer(file);
  };
  R.confirmUtdrag = function () {
    if (!R.pending) return;
    var belopp = num(String((document.getElementById('rs-bra-sum') || {}).value || '').replace(',', '.'));
    var moms = num((document.getElementById('rs-bra-moms') || {}).value || 25);
    if (!(belopp >= 0)) { alert('Fyll i beloppet.'); return; }
    rpc('ekonomi_utdrag_bekrafta', { p_id: R.pending.id, p_belopp: belopp, p_moms_pct: moms })
      .then(function () { R.pending = null; R.kost = null; return R.load(EKONOMI.year); })
      .catch(function (e) { alert(errText(e)); });
  };
  R.delUtdrag = function (id) {
    if (!confirm('Ta bort utdraget? Filen släpps och kan inte ångras.')) return;
    rpc('ekonomi_utdrag_ta_bort', { p_id: id }).then(function () {
      if (R.pending && R.pending.id === id) R.pending = null;
      R.kost = null; return R.load(EKONOMI.year);
    }).catch(function (e) { alert(errText(e)); });
  };
})();
