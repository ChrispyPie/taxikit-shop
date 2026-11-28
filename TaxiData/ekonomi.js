/* Admin › Ekonomi (åkeriets ekonomi). Byggd ovanpå den gamla Löner-sidan (id 'loner' och #loner är kvar).
 * Fas 1: verkstadstimmar + sjuklön, totalt och per förare, per månad eller år, med diagram och CSV.
 *   - Data kommer från servern (ekonomi_period): bara ägare och S admin, bara det egna åkeriets förare.
 *   - Hela året hämtas en gång; månadsvyn och diagrammen räknas i telefonen.
 *   - Sjuklön räknas bara när ägaren har markerat sjuklönen som Beviljad/Utbetald (Admin › Ärenden). Perioder som går
 *     över månadsskifte delas dag för dag, karensavdraget dras i första månaden.
 *   - Timpriset för verkstadstid ändras här (set_workshop_rate). Procent för sjuklön och provision: Admin › Bilar.
 * Fler delar (intäkter, utgifter, resultat) läggs till som nya sektioner i sections().
 * Använder admin.html:s rpc(), esc() och errText(). Ångra: se docs/ekonomi/UNDO.md.
 */
(function () {
  'use strict';
  var MON = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  var MONS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var ERR = {
    forbidden: 'Du har inte behörighet att se ekonomin.',
    bad_rate: 'Timpriset ska vara ett tal mellan 0 och 10 000 kr.',
    bad_period: 'Ogiltig period.',
    demo_read_only: 'Det här är ett demokonto. Du kan titta runt men inte ändra något.'
  };
  var E = window.EKONOMI = { data: null, cache: {}, year: null, month: null, mode: 'manad', err: null, loading: false, open: {}, el: null, lu: {}, luErr: null, luBusy: null };

  function sn(s) { return window.shortName ? window.shortName(s) : (s == null ? '' : String(s)); }
  function p2(n) { return String(n).padStart(2, '0'); }
  function kr(n) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }
  function dur(m) { m = Math.round(m || 0); var h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min'; }
  function hrs(m) { return (Math.round((m || 0) / 60 * 100) / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function cap(t) { return t.replace(/^./, function (c) { return c.toUpperCase(); }); }
  function dagar(n) { return n + ' dag' + (n === 1 ? '' : 'ar'); }
  function dsv(s) { if (!s) return ''; var d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return d.getDate() + ' ' + MONS[d.getMonth()]; }
  function err(e) { return ERR[e && e.message] || (e && e.code === 'PGRST202' ? 'Det här finns inte på servern ännu.' : errText(e)); }
  function mIdx(mon) { return parseInt(String(mon).slice(5, 7), 10) - 1; }
  function nameOf(x) { return x.namn ? sn(x.namn) : x.driver_id; }

  (function css() {
    var s = document.createElement('style');
    s.textContent =
      '.ek-seg{display:flex;gap:6px;margin:0 0 10px}.ek-seg button{flex:1;padding:8px;border-radius:8px;border:2px solid var(--primary);background:var(--surface);color:var(--primary);font-size:calc(14px * var(--font-scale, 1))}' +
      '.ek-seg button.on{background:var(--primary);color:var(--on-primary,#fff)}' +
      '.ek-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 12px}.ek-bar button{width:44px;height:40px;font-size:calc(18px * var(--font-scale, 1))}.ek-bar b{font-size:calc(16px * var(--font-scale, 1))}' +
      '.ek-hero{background:var(--surface);border-radius:12px;padding:14px 12px;margin-bottom:10px;text-align:center}' +
      '.ek-hero small{display:block;color:var(--c-718096);font-size:calc(12px * var(--font-scale, 1))}' +
      '.ek-big{display:block;font-size:calc(30px * var(--font-scale, 1));font-weight:800;color:var(--primary);margin:2px 0}' +
      '.ek-split{font-size:calc(13px * var(--font-scale, 1));color:var(--c-4a5568)}.ek-split i,.ek-lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}' +
      '.ek-v{background:#3182ce}.ek-s{background:#dd6b20}' +
      '.ek-card{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px}' +
      '.ek-h{font-size:calc(12px * var(--font-scale, 1));font-weight:600;color:var(--c-718096);margin:0 0 8px;text-transform:uppercase}' +
      '.ek-chart{display:flex;align-items:flex-end;gap:4px;height:110px}.ek-col{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;cursor:pointer;opacity:.55}' +
      '.ek-col.on{opacity:1}.ek-col .bw{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end}' +
      '.ek-col .st{display:flex;flex-direction:column;justify-content:flex-end;border-radius:4px 4px 0 0;overflow:hidden;min-height:2px;background:var(--c-edf2f7)}' +
      '.ek-col .st i{display:block}.ek-col span{text-align:center;font-size:calc(10px * var(--font-scale, 1));color:var(--c-718096);margin-top:3px}.ek-col.on span{color:var(--primary);font-weight:700}' +
      '.ek-lg{font-size:calc(12px * var(--font-scale, 1));color:var(--c-4a5568);margin-top:8px;text-align:center}.ek-lg span{margin:0 6px;white-space:nowrap}' +
      '.ek-card>details>summary,.ek-sub>summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;gap:8px}' +
      '.ek-card>details>summary::-webkit-details-marker,.ek-sub>summary::-webkit-details-marker{display:none}' +
      '.ek-card>details>summary b{font-size:calc(15px * var(--font-scale, 1))}.ek-card>details>summary .r{text-align:right;font-size:calc(15px * var(--font-scale, 1));font-weight:700;color:var(--primary);white-space:nowrap}' +
      '.ek-card>details>summary .r small{display:block;font-weight:400;color:var(--c-718096);font-size:calc(12px * var(--font-scale, 1))}' +
      '.ek-card>details>summary:after{content:"▾";color:var(--c-718096);margin-left:6px}.ek-card>details[open]>summary:after{content:"▴"}' +
      '.ek-body{margin-top:8px;border-top:1px solid var(--c-edf2f7);padding-top:4px}' +
      '.ek-row{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--c-edf2f7);font-size:calc(14px * var(--font-scale, 1))}.ek-row:last-child{border-bottom:none}' +
      '.ek-row .r{text-align:right;white-space:nowrap}.ek-row small,.ek-sub small{display:block;color:var(--c-718096);font-size:calc(12px * var(--font-scale, 1))}' +
      '.ek-sub{border-bottom:1px solid var(--c-edf2f7);padding:8px 0;font-size:calc(14px * var(--font-scale, 1))}.ek-sub:last-child{border-bottom:none}' +
      '.ek-sub>summary:after{content:"▸";color:var(--c-718096)}.ek-sub[open]>summary:after{content:"▾"}.ek-sub .r{text-align:right;font-weight:600;white-space:nowrap}' +
      '.ek-sub .in{margin:6px 0 2px 10px;padding-left:8px;border-left:3px solid var(--c-edf2f7)}' +
      '.ek-hb{margin:5px 0 0}.ek-hb div{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--c-edf2f7)}.ek-hb i{display:block;height:100%}' +
      '.ek-btns{display:flex;gap:8px;margin:2px 0 10px}.ek-btns button{flex:1;padding:9px;font-size:calc(14px * var(--font-scale, 1))}' +
      '.ek-note{font-size:calc(12px * var(--font-scale, 1));color:var(--c-718096);margin:8px 2px 16px;text-align:center}' +
      '.ek-rate{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0 2px;font-size:calc(14px * var(--font-scale, 1))}' +
      '.ek-chip{font-size:calc(11px * var(--font-scale, 1));padding:2px 8px;border-radius:10px;white-space:nowrap;background:var(--c-fefcbf);color:var(--c-975a16)}.ek-chip.ok{background:var(--c-c6f6d5);color:var(--c-276749)}.ek-chip.no{background:var(--c-fed7d7);color:var(--c-c53030)}' +
      '.ek-link{display:block;width:100%;margin-top:8px;padding:9px;font-size:calc(14px * var(--font-scale, 1))}';
    document.head.appendChild(s);
  })();

  // ---------- data ----------
  function curYear() { return new Date().getFullYear(); }
  function init() {
    if (E.year == null) { var n = new Date(); E.year = n.getFullYear(); E.month = n.getMonth(); }
  }
  E.load = function (force) {
    init();
    if (force) delete E.cache[E.year];
    var y = E.year;
    if (E.cache[y]) { E.data = E.cache[y]; E.err = null; redraw(); return Promise.resolve(); }
    E.data = null; E.err = null; E.loading = true; redraw();
    return rpc('ekonomi_period', { p_from: y + '-01-01', p_to: y + '-12-31' })
      .then(function (d) { E.cache[y] = d; if (E.year === y) E.data = d; })
      .catch(function (e) { if (E.year === y) E.err = err(e); })
      .then(function () { E.loading = false; redraw(); });
  };
  // Ritar bara när Ekonomi är den sida som visas (ett sent svar får inte skriva över en annan sida)
  function onPage() { return typeof path === 'undefined' || !path || !path[0] || path[0].id === 'loner'; }
  function redraw() { if (!onPage()) return; if (typeof render === 'function' && (!E.el || !document.body.contains(E.el))) { render(); return; } E.draw(); }
  E.draw = function () { if (onPage() && E.el && document.body.contains(E.el)) E.render(E.el); };

  // ---------- uträkningar ----------
  function inPeriod(mon) { return E.mode === 'ar' || mIdx(mon) === E.month; }
  function periodRange() {
    var y = E.year, a, b;
    if (E.mode === 'ar') { a = y + '-01-01'; b = y + '-12-31'; }
    else { a = y + '-' + p2(E.month + 1) + '-01'; b = y + '-' + p2(E.month + 1) + '-' + p2(new Date(y, E.month + 1, 0).getDate()); }
    return [a, b];
  }
  function compute() {
    var d = E.data, o = { drivers: {}, vMin: 0, vKr: 0, vPend: 0, vRej: 0, sKr: 0, sDays: 0, perMonth: [], ej: [], sjukPer: {} };
    var i; for (i = 0; i < 12; i++) o.perMonth.push({ v: 0, s: 0 });
    function drv(x) { return o.drivers[x.driver_id] || (o.drivers[x.driver_id] = { id: x.driver_id, namn: x.namn, vMin: 0, vKr: 0, vPend: 0, vRej: 0, sKr: 0, sDays: 0, months: [], per: {} }); }
    (d.verkstad || []).forEach(function (x) {
      var m = mIdx(x.mon); o.perMonth[m].v += x.approved_kr;
      if (!inPeriod(x.mon)) return;
      var r = drv(x); r.vMin += x.approved_min; r.vKr += x.approved_kr; r.vPend += x.pending_min; r.vRej += x.rejected_min;
      o.vMin += x.approved_min; o.vKr += x.approved_kr; o.vPend += x.pending_min; o.vRej += x.rejected_min;
    });
    (d.sjuk || []).forEach(function (x) {
      var m = mIdx(x.mon); o.perMonth[m].s += x.kr;
      if (!inPeriod(x.mon)) return;
      var r = drv(x); r.sKr += x.kr; r.sDays += x.dagar; o.sKr += x.kr; o.sDays += x.dagar;
      var p = r.per[x.period_id] || (r.per[x.period_id] = { id: x.period_id, kr: 0, dagar: 0, karens: 0 });
      p.kr += x.kr; p.dagar += x.dagar; p.karens += x.karens;
    });
    // månadsrader per förare (för årsvyn)
    var pm = {};
    (d.verkstad || []).forEach(function (x) { var k = x.driver_id + '|' + mIdx(x.mon); (pm[k] = pm[k] || { id: x.driver_id, m: mIdx(x.mon), v: 0, s: 0 }).v += x.approved_kr; });
    (d.sjuk || []).forEach(function (x) { var k = x.driver_id + '|' + mIdx(x.mon); (pm[k] = pm[k] || { id: x.driver_id, m: mIdx(x.mon), v: 0, s: 0 }).s += x.kr; });
    Object.keys(pm).forEach(function (k) { var r = o.drivers[pm[k].id]; if (r) r.months.push(pm[k]); });
    var rg = periodRange(), today = new Date().toISOString().slice(0, 10);
    var meta = {}; (d.perioder || []).forEach(function (p) { meta[p.id] = p; });
    o.meta = meta;
    (d.perioder || []).forEach(function (p) {
      var end = p.end || today;
      if (p.start <= rg[1] && end >= rg[0] && !p.counted) o.ej.push(p);
    });
    o.list = Object.keys(o.drivers).map(function (k) { var r = o.drivers[k]; r.tot = r.vKr + r.sKr; return r; })
      .sort(function (a, b) { return b.tot - a.tot || String(a.namn).localeCompare(String(b.namn), 'sv'); });
    o.total = o.vKr + o.sKr;
    return o;
  }

  // ---------- rita ----------
  function title() { return E.mode === 'ar' ? String(E.year) : cap(MON[E.month]) + ' ' + E.year; }
  function openAttr(k) { return E.open[k] ? ' open' : ''; }
  function det(k, inner) { return '<details data-k="' + k + '"' + openAttr(k) + ' ontoggle="EKONOMI.tg(this)">' + inner + '</details>'; }
  E.tg = function (el) { var k = el.getAttribute('data-k'); E.open[k] = el.open; if (k === 'lu' && el.open) { E.luFail = null; luLoad(); } };
  function bar(v, s, max) {
    if (!max) return '<div class="ek-hb"><div></div></div>';
    return '<div class="ek-hb"><div><i class="ek-v" style="width:' + (v / max * 100).toFixed(1) + '%"></i><i class="ek-s" style="width:' + (s / max * 100).toFixed(1) + '%"></i></div></div>';
  }
  function monthChart(o) {
    var max = 0, i; o.perMonth.forEach(function (m) { max = Math.max(max, m.v + m.s); });
    var h = '<div class="ek-chart" role="img" aria-label="Verkstadstimmar och sjuklön per månad ' + E.year + '">';
    for (i = 0; i < 12; i++) {
      var m = o.perMonth[i], t = m.v + m.s, ph = max ? t / max * 100 : 0;
      h += '<div class="ek-col' + (E.mode === 'manad' ? (i === E.month ? ' on' : '') : ' on') + '" onclick="EKONOMI.pick(' + i + ')" title="' + cap(MON[i]) + ': ' + kr(t) + '">' +
        '<div class="bw"><div class="st" style="height:' + ph.toFixed(1) + '%">' +
        (t ? '<i class="ek-s" style="height:' + (m.s / t * 100).toFixed(1) + '%"></i><i class="ek-v" style="height:' + (m.v / t * 100).toFixed(1) + '%"></i>' : '') +
        '</div></div><span>' + MONS[i] + '</span></div>';
    }
    h += '</div><div class="ek-lg"><span><i class="ek-v"></i>Verkstadstimmar</span><span><i class="ek-s"></i>Sjuklön</span></div>';
    if (E.mode === 'manad') { var sel = o.perMonth[E.month]; h += '<div class="ek-lg">' + cap(MON[E.month]) + ': ' + kr(sel.v + sel.s) + '</div>'; }
    return h;
  }
  E.pick = function (i) { E.mode = 'manad'; E.month = i; E.draw(); };

  function verkstadSection(o, d) {
    var h = '<summary><b>⏱️ Verkstadstimmar</b><span class="r">' + kr(o.vKr) + '<small>' + (o.vMin ? dur(o.vMin) : 'ingen godkänd tid') + '</small></span></summary><div class="ek-body">';
    var rows = o.list.filter(function (r) { return r.vMin || r.vPend || r.vRej; }).sort(function (a, b) { return b.vKr - a.vKr; });
    if (!rows.length) h += '<div class="ek-row"><span>Ingen verkstadstid i perioden.</span></div>';
    rows.forEach(function (r) {
      h += '<div class="ek-row"><span>' + esc(nameOf(r)) + ' <small>' + esc(r.id) + (r.vPend ? ' · ej klart ' + dur(r.vPend) : '') + (r.vRej ? ' · nekat ' + dur(r.vRej) : '') + '</small></span>' +
        '<span class="r"><b>' + kr(r.vKr) + '</b><small>' + dur(r.vMin) + ' godkänt</small></span></div>';
    });
    if (o.vPend) h += '<div class="ek-note" style="text-align:left">⏳ ' + dur(o.vPend) + ' väntar på beslut och räknas inte med än. Beslut tas under Admin › Ärenden.</div>';
    h += '<div class="ek-rate"><span>Timpris: <b>' + kr(d.rate) + '/h</b> <small style="color:var(--c-718096)">(gäller nya godkännanden)</small></span><button onclick="EKONOMI.setRate()">Ändra</button></div></div>';
    return h;
  }
  function sjukSection(o, d) {
    var c = d.cfg || {};
    var h = '<summary><b>🤒 Sjuklön</b><span class="r">' + kr(o.sKr) + '<small>' + (o.sDays ? dagar(o.sDays) : 'ingen beviljad') + '</small></span></summary><div class="ek-body">';
    var rows = o.list.filter(function (r) { return r.sKr || r.sDays; }).sort(function (a, b) { return b.sKr - a.sKr; });
    if (!rows.length) h += '<div class="ek-row"><span>Ingen beviljad sjuklön i perioden.</span></div>';
    rows.forEach(function (r) {
      var inner = '<summary><span>' + esc(nameOf(r)) + '<small>' + esc(r.id) + ' · ' + dagar(r.sDays) + '</small></span><span class="r">' + kr(r.sKr) + '</span></summary><div class="in">';
      Object.keys(r.per).forEach(function (pid) {
        var p = r.per[pid], mt = o.meta[pid] || {};
        inner += '<div class="ek-row"><span>' + dsv(mt.start) + ' – ' + (mt.open ? 'pågår' : dsv(mt.end)) + '<small>' + dagar(p.dagar) + ' i perioden' + (p.karens ? ' · karens −' + kr(p.karens) : '') +
          (mt.dagar > (mt.agare_dagar || 0) ? ' · från dag ' + ((c.sjuklon_dagar || 14) + 1) + ' Försäkringskassan' : '') + (mt.sparat ? ' · belopp sparat' : ' · räknas löpande') + '</small></span><span class="r">' + kr(p.kr) + '</span></div>';
      });
      h += '<details class="ek-sub" data-k="s' + r.id + '"' + openAttr('s' + r.id) + ' ontoggle="EKONOMI.tg(this)">' + inner + '</div></details>';
    });
    if (o.ej.length) {
      h += '<div class="ek-h" style="margin-top:12px">Räknas inte (ej beviljad)</div>';
      o.ej.forEach(function (p) {
        var lbl = p.status === 'avslagen' ? ['Avslagen', 'no'] : p.status === 'godkand' ? ['Sjuklön ej beviljad', ''] : ['Väntar på beslut', ''];
        h += '<div class="ek-row"><span>' + esc(nameOf(p)) + ' <small>' + dsv(p.start) + ' – ' + (p.open ? 'pågår' : dsv(p.end)) + ' · ' + dagar(p.dagar) + '</small></span><span class="r"><span class="ek-chip ' + lbl[1] + '">' + lbl[0] + '</span></span></div>';
      });
    }
    h += '<div class="ek-note" style="text-align:left">Räknas först när sjuklönen är markerad Beviljad eller Utbetald i Admin › Ärenden. ' +
      'Åkeriet betalar dag 1–' + (c.sjuklon_dagar || 14) + ': ' + (c.sjuklon_pct != null ? c.sjuklon_pct : 80) + ' % av snittlönen de ' + (c.snitt_man || 6) + ' senaste månaderna (provision ' + (c.provision != null ? c.provision : 37) + ' % av lönegrunden), minus karensavdrag ' + (c.karens_pct != null ? c.karens_pct : 20) + ' % av en veckas sjuklön. ' +
      'Perioder som går över månadsskifte delas dag för dag. Beloppet sparas när en period är avslutad och beviljad.</div>' +
      '<button class="ek-link" onclick="EKONOMI.toBilar()">Ändra procent under Bilar › Lönekostnad och sjuklön</button></div>';
    return h;
  }
  function totalSection(o) {
    var max = 0; o.list.forEach(function (r) { max = Math.max(max, r.tot); });
    var h = '<summary><b>👥 Totalt per chaufför</b><span class="r">' + kr(o.total) + '<small>' + o.list.length + ' förare' + '</small></span></summary><div class="ek-body">';
    if (!o.list.length) h += '<div class="ek-row"><span>Inget att visa i perioden.</span></div>';
    o.list.forEach(function (r) {
      var inner = '<summary><span>' + esc(nameOf(r)) + '<small>' + esc(r.id) + '</small>' + bar(r.vKr, r.sKr, max) + '</span><span class="r">' + kr(r.tot) + '</span></summary><div class="in">' +
        '<div class="ek-row"><span><i class="ek-v" style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px"></i>Verkstadstimmar<small>' + dur(r.vMin) + '</small></span><span class="r">' + kr(r.vKr) + '</span></div>' +
        '<div class="ek-row"><span><i class="ek-s" style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px"></i>Sjuklön<small>' + dagar(r.sDays) + '</small></span><span class="r">' + kr(r.sKr) + '</span></div>';
      if (E.mode === 'ar') {
        r.months.sort(function (a, b) { return a.m - b.m; }).filter(function (m) { return m.v || m.s; }).forEach(function (m) {
          inner += '<div class="ek-row"><span>' + cap(MON[m.m]) + '</span><span class="r">' + kr(m.v + m.s) + '</span></div>';
        });
      }
      h += '<details class="ek-sub" data-k="t' + r.id + '"' + openAttr('t' + r.id) + ' ontoggle="EKONOMI.tg(this)">' + inner + '</div></details>';
    });
    return h + '</div>';
  }


  // ---------- Fas 2: löneunderlag per förare (laddas först när sektionen öppnas) ----------
  function luRange() {
    if (E.mode === 'ar') return [E.year + '-01-01', E.year + '-12-31'];
    var last = new Date(E.year, E.month + 1, 0).getDate();
    return [E.year + '-' + p2(E.month + 1) + '-01', E.year + '-' + p2(E.month + 1) + '-' + p2(last)];
  }
  function luKey() { return luRange().join('_'); }
  function luLoad() {
    var k = luKey(), r = luRange();
    if (E.lu[k]) return Promise.resolve(E.lu[k]);
    if (E.luBusy === k && E.luP) return E.luP;
    if (E.luFail === k) return Promise.resolve(null);
    E.luBusy = k; E.luErr = null;
    E.luP = rpc('ekonomi_loneunderlag', { p_from: r[0], p_to: r[1] })
      .then(function (d) { E.lu[k] = d; return d; })
      .catch(function (e) { E.luErr = err(e); E.luFail = k; return null; })
      .then(function (d) { E.luBusy = null; E.luP = null; E.draw(); return d; });
    return E.luP;
  }
  function luSection(o) {
    var d = E.lu[luKey()], tot = 0, h;
    if (d) d.forare.forEach(function (f) { tot += +f.l.lon + +f.l.sem; });
    h = '<summary><b>🧾 Löneunderlag</b><span class="r">' + (d ? kr(tot) : '') + '<small>' + (d ? d.forare.length + ' förare' : 'öppna för att räkna') + '</small></span></summary><div class="ek-body">';
    if (E.luErr) h += '<div class="ek-row"><span>' + esc(E.luErr) + '</span></div>';
    else if (!d) h += '<div class="ek-row"><span>Räknar…</span></div>';
    else {
      if (!d.forare.length) h += '<div class="ek-row"><span>Inga körda pass i perioden.</span></div>';
      var by = {}; o.list.forEach(function (r) { by[r.id] = r; });
      d.forare.forEach(function (f) {
        var l = f.l, x = by[f.driver_id] || { vKr: 0, sKr: 0, vMin: 0, sDays: 0 };
        h += '<details class="ek-sub" data-k="l' + f.driver_id + '"' + openAttr('l' + f.driver_id) + ' ontoggle="EKONOMI.tg(this)"><summary><span>' + esc(nameOf(f)) +
          '<small>' + l.kordagar + ' körda dagar · ' + l.pass + ' pass' + (!+l.inkort && +l.pass ? ' · inga resor registrerade i Taxi Göteborgs data' : '') + '</small></span><span class="r">' + kr(+l.lon + +l.sem) + '</span></summary><div class="in">' +
          '<div class="ek-row"><span>Inkört<small>brutto</small></span><span class="r">' + kr(l.inkort) + '</span></div>' +
          (+l.uber ? '<div class="ek-row"><span>Uber brutto</span><span class="r">' + kr(l.uber) + '</span></div>' : '') +
          '<div class="ek-row"><span>Lönegrund<small>netto ex moms − Uberavgift − adm. − inpassering</small></span><span class="r">' + kr(l.lonegrund) + '</span></div>' +
          '<div class="ek-row"><span>Lön<small>' + (+l.provision).toLocaleString('sv-SE') + ' % av lönegrund</small></span><span class="r">' + kr(l.lon) + '</span></div>' +
          '<div class="ek-row"><span>Semesterersättning<small>13 %</small></span><span class="r">' + kr(l.sem) + '</span></div>' +
          (x.sKr ? '<div class="ek-row"><span>Sjuklön<small>' + dagar(x.sDays) + '</small></span><span class="r">' + kr(x.sKr) + '</span></div>' : '') +
          (x.vKr ? '<div class="ek-row"><span>Verkstadstimmar<small>' + dur(x.vMin) + '</small></span><span class="r">' + kr(x.vKr) + '</span></div>' : '') +
          (E.mode === 'ar' ? (f.manader || []).map(function (m) {
            return '<div class="ek-row"><span>' + cap(MON[mIdx(m.mon)]) + '<small>lönegrund ' + kr(m.l.lonegrund) + '</small></span><span class="r">' + kr(+m.l.lon + +m.l.sem) + '</span></div>';
          }).join('') : '') +
          '</div></details>';
      });
      h += '<div class="ek-note" style="text-align:left">Utkast: samma uträkning som förarnas Lönekoll (lön = provision × lönegrund). Skatt och arbetsgivaravgift ingår inte.</div>';
    }
    return h + '</div>';
  }

  E.render = function (content) {
    E.el = content; init();
    var h = '<p class="ar-note" style="text-align:center;margin-bottom:10px">Bara ägaren och superadmin ser ekonomin.</p>';
    if (E.err) { content.innerHTML = h + '<div class="ek-card">' + esc(E.err) + '<button class="ek-link" onclick="EKONOMI.load(true)">Försök igen</button></div>'; return; }
    if (!E.data) { content.innerHTML = h + '<div class="ek-card">Laddar…</div>'; return; }
    var o = compute(), d = E.data, now = new Date();
    var atMax = E.mode === 'ar' ? E.year >= now.getFullYear() : (E.year > now.getFullYear() || (E.year === now.getFullYear() && E.month >= now.getMonth()));
    h += '<div class="ek-seg"><button class="' + (E.mode === 'manad' ? 'on' : '') + '" onclick="EKONOMI.setMode(\'manad\')">Månad</button><button class="' + (E.mode === 'ar' ? 'on' : '') + '" onclick="EKONOMI.setMode(\'ar\')">År</button></div>';
    h += '<div class="ek-bar"><button onclick="EKONOMI.shift(-1)" aria-label="Föregående">‹</button><b>' + esc(title()) + '</b>' +
      '<button onclick="EKONOMI.shift(1)" aria-label="Nästa"' + (atMax ? ' disabled style="opacity:.4"' : '') + '>›</button></div>';
    if (window.EKRES) h += EKRES.html(E);
    h += '<div class="ek-hero"><small>Att betala · ' + esc(title().toLowerCase()) + '</small><span class="ek-big">' + kr(o.total) + '</span>' +
      '<span class="ek-split"><i class="ek-v"></i>Verkstad ' + kr(o.vKr) + ' &nbsp; <i class="ek-s"></i>Sjuklön ' + kr(o.sKr) + '</span></div>';
    h += '<div class="ek-card"><div class="ek-h">Per månad ' + E.year + '</div>' + monthChart(o) + '</div>';
    h += '<div class="ek-card">' + det('verkstad', verkstadSection(o, d)) + '</div>';
    h += '<div class="ek-card">' + det('sjuk', sjukSection(o, d)) + '</div>';
    h += '<div class="ek-card">' + det('total', totalSection(o)) + '</div>';
    h += '<div class="ek-card">' + det('lu', luSection(o)) + '</div>';
    if (E.open.lu) luLoad();
    h += '<div class="ek-btns"><button onclick="EKONOMI.csv()">⬇️ Ladda ner (CSV)</button><button onclick="EKONOMI.copy()">📋 Kopiera</button></div>';
    h += '<div class="ek-note">Verkstadstid betalas med timpriset som gällde när den godkändes och räknas till den månad då besöket började. ' +
      'Fler delar (intäkter, utgifter och resultat) kommer här senare.</div>';
    content.innerHTML = h;
  };

  // ---------- val ----------
  E.setMode = function (m) { E.mode = m; E.draw(); };
  E.shift = function (k) {
    var py = E.year;
    if (E.mode === 'ar') E.year += k;
    else { E.month += k; if (E.month < 0) { E.month = 11; E.year--; } else if (E.month > 11) { E.month = 0; E.year++; } }
    if (E.year !== py) E.load(); else E.draw();
  };
  E.setRate = function () {
    var cur = E.data && E.data.rate, v = prompt('Nytt timpris för verkstadstid (kr/h):', cur);
    if (v == null) return;
    var n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    if (!(n >= 0 && n <= 10000)) { alert(ERR.bad_rate); return; }
    rpc('set_workshop_rate', { p_rate: n }).then(function () { return E.load(true); }).catch(function (e) { alert(err(e)); });
  };
  E.toBilar = function () { if (typeof openMenu === 'function') openMenu('bilar'); };

  // ---------- export ----------
  function csvText(sep) {
    var o = compute(), ym = E.mode === 'ar' ? 'År ' + E.year : cap(MON[E.month]) + ' ' + E.year;
    var q = function (v) { v = String(v == null ? '' : v); return sep === ';' && /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [['Period', 'Förare', 'Förar-ID', 'Verkstadstimmar (h)', 'Verkstad (kr)', 'Sjukdagar', 'Sjuklön (kr)', 'Totalt (kr)'].join(sep)];
    var tot = { m: 0, v: 0, d: 0, s: 0 };
    if (E.mode === 'ar') {
      var rows = {};
      (E.data.verkstad || []).forEach(function (x) { var k = x.mon + '|' + x.driver_id; var r = rows[k] = rows[k] || { mon: x.mon, id: x.driver_id, namn: x.namn, m: 0, v: 0, d: 0, s: 0 }; r.m += x.approved_min; r.v += x.approved_kr; });
      (E.data.sjuk || []).forEach(function (x) { var k = x.mon + '|' + x.driver_id; var r = rows[k] = rows[k] || { mon: x.mon, id: x.driver_id, namn: x.namn, m: 0, v: 0, d: 0, s: 0 }; r.d += x.dagar; r.s += x.kr; });
      Object.keys(rows).sort().forEach(function (k) {
        var r = rows[k]; if (!(r.m || r.v || r.d || r.s)) return;
        lines.push([cap(MON[mIdx(r.mon)]) + ' ' + E.year, r.namn || '', r.id, hrs(r.m), Math.round(r.v), r.d, Math.round(r.s), Math.round(r.v + r.s)].map(q).join(sep));
        tot.m += r.m; tot.v += r.v; tot.d += r.d; tot.s += r.s;
      });
    } else {
      o.list.forEach(function (r) {
        if (!(r.vMin || r.vKr || r.sDays || r.sKr)) return;
        lines.push([ym, r.namn || '', r.id, hrs(r.vMin), Math.round(r.vKr), r.sDays, Math.round(r.sKr), Math.round(r.tot)].map(q).join(sep));
        tot.m += r.vMin; tot.v += r.vKr; tot.d += r.sDays; tot.s += r.sKr;
      });
    }
    lines.push([ym, 'Totalt', '', hrs(tot.m), Math.round(tot.v), tot.d, Math.round(tot.s), Math.round(tot.v + tot.s)].map(q).join(sep));
    var d = E.lu[luKey()];
    if (d && d.forare && d.forare.length) {
      lines.push('');
      lines.push(['Löneunderlag', 'Förare', 'Förar-ID', 'Inkört (kr)', 'Uber (kr)', 'Lönegrund (kr)', 'Provision (%)', 'Lön (kr)', 'Semesterersättning (kr)', 'Lön + semester (kr)'].join(sep));
      var lt = { ik: 0, ub: 0, lg: 0, lo: 0, se: 0 };
      var row = function (lab, f, l) { return [lab, f.namn || '', f.driver_id, Math.round(l.inkort), Math.round(l.uber), Math.round(l.lonegrund), +l.provision, Math.round(l.lon), Math.round(l.sem), Math.round(+l.lon + +l.sem)].map(q).join(sep); };
      d.forare.forEach(function (f) {
        if (E.mode === 'ar') (f.manader || []).forEach(function (m) { lines.push(row(cap(MON[mIdx(m.mon)]) + ' ' + E.year, f, m.l)); });
        lines.push(row(ym + (E.mode === 'ar' ? ' (summa)' : ''), f, f.l));
        lt.ik += +f.l.inkort; lt.ub += +f.l.uber; lt.lg += +f.l.lonegrund; lt.lo += +f.l.lon; lt.se += +f.l.sem;
      });
      lines.push([ym, 'Totalt', '', Math.round(lt.ik), Math.round(lt.ub), Math.round(lt.lg), '', Math.round(lt.lo), Math.round(lt.se), Math.round(lt.lo + lt.se)].map(q).join(sep));
    }
    return lines.join('\r\n');
  }
  E.csv = function () {
    if (!E.data) return;
    if (!E.lu[luKey()] && E.luFail !== luKey()) { return luLoad().then(function () { return E.csv(); }); }
    var b = new Blob(['\ufeff' + csvText(';')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'ekonomi-' + (E.mode === 'ar' ? E.year : E.year + '-' + p2(E.month + 1)) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  E.copy = function () {
    if (!E.data) return;
    if (!E.lu[luKey()] && E.luFail !== luKey()) { return luLoad().then(function () { return E.copy(); }); }
    var t = csvText('\t'), done = function () { alert('Kopierat. Klistra in i Excel eller ett mejl.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { prompt('Kopiera texten:', t); });
    else prompt('Kopiera texten:', t);
  };
})();
