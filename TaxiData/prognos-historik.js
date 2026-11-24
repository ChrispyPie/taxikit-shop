/* Prognos › Historik (t1809u/t1811u). Laddas först när fliken öppnas (prognos.js).
 * Data: RPC prognos_historik (bara summerade antal per zon/datum/timme, inga förare eller boknings-id).
 * Dygn räknas 06–06: timmarna 00–05 hör till föregående datum (natten hör till kvällen).
 * Morgon = morgonprognosen (lämning Landvetter 292), version strax före 04:00, timmar 04–08.
 * Zon 293: flygtopplista (RPC prognos_historik_flyg, hämtas först när den visas), uppskattad koppling.
 * Kategorier (t1835u): RPC:erna *_kat ger rader per kategori (c) och tillval (a). Förarens val i Prognos › Filter
 *   (ctx.cats) räknas här: en bokning räknas om kategorin eller ett tillval (barnstol/babyskydd) är valt.
 *   Filtreringen sker i telefonen, så byte av kategori kräver ingen ny hämtning. Morgonprognosen saknar kategorier.
 * Markeringar via HELGDAGAR (helgdagar.js): 🎉 helgdag/afton, 🎒 skollov, 💰 lön.
 */
(function () {
  'use strict';
  var H = window.HELGDAGAR;
  var ZONES = [
    { id: '293', s: '293', n: 'Landvetter flygplats' },
    { id: '161', s: '161', n: 'Essity' },
    { id: '163', s: '163', n: 'Astra' },
    { id: '406', s: '406', n: 'Volvo' },
    { id: '432', s: '432', n: 'Volvo Cars Torslanda' },
    { id: '15', s: '15', n: 'Hotell Draken' },
    { id: 'morgon', s: '☀️ Morgon', n: 'Morgonprognos · lämning Landvetter (292)' }
  ];
  var WD = ['Sö', 'Må', 'Ti', 'On', 'To', 'Fr', 'Lö'];
  var WDL = ['söndagar', 'måndagar', 'tisdagar', 'onsdagar', 'torsdagar', 'fredagar', 'lördagar'];
  var WDS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
  var MON = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var HOURS = []; for (var hh = 6; hh < 30; hh++) HOURS.push(hh % 24);
  var MORGON_H = [4, 5, 6, 7, 8];
  var TTL = 10 * 60 * 1000;
  var LS = 'prognos_hist_v1';

  var st = { z: null, wd: null, sel: null, mode: 'antal', hm: null, cache: {}, loading: {}, err: {}, fl: null, flLoading: false, flErr: null, flScope: 'period', flOpen: null };
  try { var sv = JSON.parse(localStorage.getItem(LS) || '{}'); if (sv.z) st.z = sv.z; if (sv.mode) st.mode = sv.mode; } catch (e) {}
  function save() { try { localStorage.setItem(LS, JSON.stringify({ z: st.z, mode: st.mode })); } catch (e) {} }

  function nowParts() {
    var f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    var o = {}; f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    return { d: o.year + '-' + o.month + '-' + o.day, h: +o.hour };
  }
  function pd(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function nice(s) { var d = pd(s); return WDS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; }
  function short(s) { var d = pd(s); return d.getUTCDate() + '/' + (d.getUTCMonth() + 1); }
  function sum(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  var CHILD = { barnstol: 1, babyskydd: 1 };
  function catMatch(cats) {
    if (!cats) return null;
    var sel = {}; cats.forEach(function (k) { sel[k] = 1; });
    return function (r) {
      if (r.c == null) return true;
      if (sel[r.c]) return true;
      var a = r.a ? String(r.a).split('+') : [];
      for (var i = 0; i < a.length; i++) if (CHILD[a[i]] && sel[a[i]]) return true;
      return false;
    };
  }
  function zoneOf(id) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i].id === id) return ZONES[i]; return ZONES[0]; }

  function fetchZone(ctx, z) {
    var c = st.cache[z];
    if (st.loading[z] || (c && Date.now() - c.at < TTL)) return;
    st.loading[z] = true;
    ctx.rpc(z === 'morgon' ? 'prognos_historik' : 'prognos_historik_kat', { p_zone: z }).then(function (r) {
      st.cache[z] = { at: Date.now(), rows: (r && r.rows) || [] };
      st.err[z] = null;
    }).catch(function () {
      st.err[z] = 'Historiken kunde inte hämtas just nu. Försök igen om en stund.';
    }).then(function () { st.loading[z] = false; ctx.repaint(); });
  }

  // Flygtopplistan (bara zon 293) hämtas först när den ska visas
  function fetchFlights(ctx) {
    if (st.flLoading || (st.fl && Date.now() - st.fl.at < TTL)) return;
    st.flLoading = true;
    ctx.rpc('prognos_historik_flyg_kat', {}).then(function (r) {
      st.fl = { at: Date.now(), rows: (r && r.rows) || [], cov: (r && r.cov) || [] };
      st.flErr = null;
    }).catch(function () { st.flErr = 'Flygdata kunde inte hämtas just nu.'; })
      .then(function () { st.flLoading = false; ctx.repaint(); });
  }
  function flightCard(ctx, dates, selDay) {
    var esc = ctx.esc;
    fetchFlights(ctx);
    var head = '<div class="pg-card ph-card ph-fl"><div class="ph-row"><h3>✈️ Flyg bakom bokningarna</h3><span class="ph-tag ph-tag-dag">uppskattat</span></div>';
    if (!st.fl) return head + '<p class="pg-muted ph-sub">' + (st.flErr ? esc(st.flErr) : 'Laddar flyg…') + '</p></div>';
    var scope = st.flScope === 'dag' ? [selDay] : dates, set = {};
    scope.forEach(function (d) { set[d] = 1; });
    var agg = {}, tot = 0, ok = ctx.match || function () { return true; };
    st.fl.rows.forEach(function (r) {
      var d = String(r.d).slice(0, 10);
      if (!set[d] || !ok(r)) return;
      var k = r.f, a = agg[k] || (agg[k] = { f: r.f, o: r.o, n: 0, days: [], dk: {} });
      a.n += +r.n || 0; tot += +r.n || 0; if (r.o) a.o = r.o;
      var dk = d + ' ' + r.s;   // samma flyg samma dygn: slå ihop kategorierna
      if (a.dk[dk]) a.dk[dk].n += +r.n || 0;
      else a.days.push(a.dk[dk] = { d: d, l: r.l, s: r.s, n: +r.n || 0 });
    });
    var cb = 0, cm = 0;
    st.fl.cov.forEach(function (c) { if (set[String(c.d).slice(0, 10)] && ok(c)) { cb += +c.b || 0; cm += +c.m || 0; } });
    var list = Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
    var nd = scope.length;
    var out = head + '<div class="ph-row ph-flscope"><span class="pg-muted ph-sub">' + (st.flScope === 'dag' ? nice(selDay) : nd + ' dygn i urvalet') + '</span>' +
      '<span class="ph-seg"><button type="button" data-ph-fs="period"' + (st.flScope === 'dag' ? '' : ' class="on"') + '>Period</button><button type="button" data-ph-fs="dag"' + (st.flScope === 'dag' ? ' class="on"' : '') + '>Vald dag</button></span></div>';
    if (!list.length) {
      out += '<p class="pg-muted ph-sub">Inga flyg att koppla här ännu. Flygdata finns från 24 okt.</p>';
    } else {
      var mx = list[0].n || 1;
      out += '<ol class="ph-fllist">' + list.map(function (a, i) {
        var open = st.flOpen === a.f;
        var times = {}; a.days.forEach(function (x) { times[x.l] = (times[x.l] || 0) + 1; });
        var tl = Object.keys(times).sort(function (x, y) { return times[y] - times[x]; })[0] || '';
        var per = nd > 1 ? ' <span class="ph-note">≈' + (Math.round(a.n / a.days.length * 10) / 10).toString().replace('.', ',') + '/gång</span>' : '';
        var row = '<li class="ph-flrow' + (open ? ' open' : '') + '" data-ph-fl="' + esc(a.f) + '"><span class="ph-flno">' + (i + 1) + '. <b>' + esc(a.f) + '</b></span>' +
          '<span class="ph-flfrom">' + esc(a.o || '–') + ' · ' + tl + '</span>' +
          '<span class="ph-flbar"><i style="width:' + Math.max(4, Math.round(a.n / mx * 100)) + '%"></i></span>' +
          '<span class="ph-fln">≈' + (Math.round(a.n * 10) / 10).toString().replace('.', ',') + per + '</span></li>';
        if (open) {
          row += '<li class="ph-fldet">Från <b>' + esc(a.o || 'okänt') + '</b>. ' + a.days.sort(function (x, y) { return x.d < y.d ? -1 : 1; }).map(function (x) {
            return nice(x.d) + ': landade ' + x.l + (x.s && x.s !== x.l ? ' (plan ' + x.s + ')' : '') + ', ≈' + (Math.round(x.n * 10) / 10).toString().replace('.', ',');
          }).join(' · ') + '</li>';
        }
        return row;
      }).join('') + '</ol>';
    }
    out += '<p class="ph-note ph-flnote">Uppskattat: en förbokning kopplas till flyg som landade 10–50 min före bokningens tid. Landar flera flyg då delas bokningen lika mellan dem, därför ≈ och decimaler. ' +
      (cb ? 'Här kunde ' + Math.round(cm) + ' av ' + cb + ' bokningar kopplas till något flyg.' : '') + ' Flygdata finns från 24 okt.</p></div>';
    return out;
  }

  // Bygger { dag: [24 timmar] } + första datum + pågående dygn
  function build(z, rows, match) {
    var now = nowParts(), out = {}, keys;
    if (z === 'morgon') {
      rows.forEach(function (r) {
        var d = String(r.d).slice(0, 10);
        if (d > now.d || (d === now.d && now.h < 4)) return;   // morgonen har inte börjat
        var a = new Array(24).fill(0);
        (r.b || []).forEach(function (b) { if (b && b.hourFrom != null) a[+b.hourFrom] = +b.total || 0; });
        out[d] = a;
      });
      keys = Object.keys(out).sort();
      return { d: out, first: keys[0], partial: null };
    }
    var raw = {};
    rows.forEach(function (r) {
      var d = String(r.d).slice(0, 10), a = raw[d] = raw[d] || new Array(24).fill(0);   // alla dygn finns kvar, även med filter
      if (match && !match(r)) return;
      a[+r.h] += +r.n || 0;
    });
    keys = Object.keys(raw).sort();
    if (!keys.length) return { d: {}, first: null, partial: null };
    var cur = now.h < 6 ? H.add(now.d, -1) : now.d;   // pågående dygn (06–06)
    for (var s = keys[0]; s <= cur; s = H.add(s, 1)) {
      var a = new Array(24).fill(0), r0 = raw[s], r1 = raw[H.add(s, 1)], h;
      if (r0) for (h = 6; h < 24; h++) a[h] = r0[h];
      if (r1) for (h = 0; h < 6; h++) a[h] = r1[h];
      out[s] = a;
    }
    return { d: out, first: keys[0], partial: cur };
  }

  function html(ctx) {
    var esc = ctx.esc;
    if (!st.z) { st.z = zoneOf(ctx.zone).id === ctx.zone ? ctx.zone : '293'; }
    var Z = zoneOf(st.z), isM = st.z === 'morgon';
    var allC = ctx.allCats || [], selC = ctx.cats || [], isAll = !allC.length || selC.length >= allC.length;
    ctx.match = isAll || isM ? null : catMatch(selC);
    fetchZone(ctx, st.z);
    var out = '<div class="ph">';
    out += '<div class="pg-ztabs ph-zones">' + ZONES.map(function (z) {
      return '<button type="button" class="pg-ztab' + (z.id === st.z ? ' on' : '') + '" data-ph-z="' + z.id + '">' + z.s + '</button>';
    }).join('') + '</div>';
    out += '<div class="ph-zname">' + (isM ? '' : 'Zon ' + Z.id + ' · ') + '<b>' + esc(Z.n) + '</b></div>';
    var visar = isM ? 'Alla kategorier <span class="ph-note">(morgonprognosen har ingen kategoriuppdelning)</span>'
      : isAll ? 'Alla kategorier'
      : esc(allC.filter(function (c) { return selC.indexOf(c.k) >= 0; }).map(function (c) { return c.label; }).join(', '));
    out += '<button type="button" class="ph-catsel' + (isAll || isM ? '' : ' ph-catsel-on') + '" data-panel="filter" aria-label="Visar kategorier, ändra i Filter">' +
      '<span>Visar: <b>' + visar + '</b></span><span class="ph-catsel-go">Ändra ›</span></button>';
    var c = st.cache[st.z];
    if (!c) {
      out += st.err[st.z] ? '<div class="pg-warn">' + esc(st.err[st.z]) + '</div>' : '<div class="pg-card pg-muted">Laddar historik…</div>';
      return out + note() + '</div>';
    }
    var R = build(st.z, c.rows, ctx.match);
    var all = Object.keys(R.d).sort();
    var done = all.filter(function (s) { return s !== R.partial; });
    if (!done.length) return out + '<div class="pg-card pg-muted">Ingen historik ännu för den här zonen.</div>' + note() + '</div>';
    if (st.wd == null) { var np = nowParts(); st.wd = H.dow(np.h < 6 ? H.add(np.d, -1) : np.d); }
    var tot = sum(done.map(function (s) { return sum(R.d[s]); }));
    var avg = tot / done.length;
    var best = done.slice().sort(function (a, b) { return sum(R.d[b]) - sum(R.d[a]); })[0];
    var list = all.filter(function (s) { return st.wd < 0 || H.dow(s) === st.wd; });
    var listDone = list.filter(function (s) { return s !== R.partial; });
    var wdAvg = listDone.length ? sum(listDone.map(function (s) { return sum(R.d[s]); })) / listDone.length : 0;
    if (!st.sel || list.indexOf(st.sel) < 0) st.sel = listDone.length ? listDone[listDone.length - 1] : list[list.length - 1];

    out += '<div class="ph-kpis"><div class="ph-kpi"><b>' + tot.toLocaleString('sv-SE') + '</b><span>bokningar sedan ' + short(R.first) + '</span></div>' +
      '<div class="ph-kpi"><b>' + Math.round(avg) + '</b><span>snitt per ' + (isM ? 'morgon' : 'dygn') + '</span></div>' +
      '<div class="ph-kpi"><b>' + sum(R.d[best]) + '</b><span>toppen ' + nice(best) + '</span></div></div>';
    out += '<div class="ph-wds">' + [1, 2, 3, 4, 5, 6, 0].map(function (w) {
      return '<button type="button" class="ph-wd' + (st.wd === w ? ' on' : '') + '" data-ph-wd="' + w + '">' + WD[w] + '</button>';
    }).join('') + '<button type="button" class="ph-wd' + (st.wd < 0 ? ' on' : '') + '" data-ph-wd="-1">Alla</button></div>';

    out += '<div class="ph-grid">';
    // ---- Staplar ----
    var W = 384, Hh = 196, pl = 28, pr = 6, pt = 24, pb = 34, n = list.length || 1;
    var max = Math.max.apply(null, list.map(function (s) { return sum(R.d[s]); }).concat([wdAvg, 1]));
    max = Math.max(5, Math.ceil(max * 1.15 / 5) * 5);
    var cw = (W - pl - pr) / n, bw = Math.min(cw * 0.68, 46);
    var y = function (v) { return pt + (Hh - pt - pb) * (1 - v / max); };
    var svg = '<svg class="ph-svg" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Bokningar per dag">';
    [0, 0.5, 1].forEach(function (f) {
      var v = Math.round(max * f);
      svg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="ph-grid-l"/><text x="' + (pl - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end" class="ph-t9 ph-mut">' + v + '</text>';
    });
    list.forEach(function (s, i) {
      if (H.lov(s)) svg += '<rect x="' + (pl + cw * i) + '" y="' + pt + '" width="' + cw + '" height="' + (Hh - pt - pb) + '" class="ph-lov"/>';
    });
    list.forEach(function (s, i) {
      var x = pl + cw * i + cw / 2, v = sum(R.d[s]), d = H.dag(s), red = d && (d.typ === 'helg' || d.typ === 'afton');
      var on = s === st.sel, part = s === R.partial, L = H.lov(s);
      var lab = n <= 12 || on || (st.wd < 0 ? H.dow(s) === 1 : i % 2 === 0);
      svg += '<rect data-ph-sel="' + s + '" x="' + (x - bw / 2) + '" y="' + y(v) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(v)) + '" rx="3" class="ph-bar' + (red ? ' ph-red' : '') + (on ? ' on' : '') + (part ? ' ph-part' : '') + '"/>';
      svg += '<rect data-ph-sel="' + s + '" x="' + (pl + cw * i) + '" y="' + pt + '" width="' + cw + '" height="' + (Hh - pt) + '" fill="transparent"/>';
      if (n <= 12 || on) svg += '<text x="' + x + '" y="' + (y(v) - 4) + '" text-anchor="middle" class="' + (on ? 'ph-t10 ph-b' : 'ph-t9') + '">' + v + '</text>';
      if (red) svg += '<text x="' + x + '" y="' + (y(v) - (n <= 12 || on ? 16 : 5)) + '" text-anchor="middle" class="ph-t11">🎉</text>';
      if (H.lon(s)) svg += '<text x="' + x + '" y="' + (y(v) - (n <= 12 || on ? 16 : 5) - (red ? 12 : 0)) + '" text-anchor="middle" class="ph-t10">💰</text>';
      if (L && (i === 0 || H.lov(list[i - 1]) !== L)) svg += '<text x="' + (pl + cw * i + 2) + '" y="' + (pt - 9) + '" class="ph-t10 ph-lovt">🎒 ' + L + '</text>';
      if (lab) svg += '<text x="' + x + '" y="' + (Hh - pb + 13) + '" text-anchor="middle" class="ph-t9' + (on ? ' ph-b' : ' ph-mut') + '">' + (part ? 'nu' : short(s)) + '</text>';
      if (st.wd < 0 && lab) svg += '<text x="' + x + '" y="' + (Hh - pb + 24) + '" text-anchor="middle" class="ph-t8 ph-mut">' + WD[H.dow(s)] + '</text>';
    });
    if (wdAvg) svg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(wdAvg) + '" y2="' + y(wdAvg) + '" class="ph-avg"/><text x="' + (W - pr) + '" y="' + (y(wdAvg) - 4) + '" text-anchor="end" class="ph-t9 ph-avgt">snitt ' + Math.round(wdAvg) + '</text>';
    svg += '</svg>';
    var ttl = st.wd < 0 ? 'Alla ' + (isM ? 'morgnar' : 'dygn') : WDL[st.wd].charAt(0).toUpperCase() + WDL[st.wd].slice(1);
    out += '<div class="pg-card ph-card"><div class="ph-row"><h3>' + ttl + ' · bokningar</h3><span class="ph-note">' + listDone.length + ' st</span></div>' +
      '<p class="pg-muted ph-sub">' + (isM ? 'Bokade körningar 04–09 till Landvetter enligt morgonprognosen strax före 04.' : 'Förbokningar som syntes i prognosen. Dygnet räknas 06–06, så natten hör till kvällens datum.') + '</p>' + svg +
      '<div class="ph-legend"><span><i class="ph-k-bar"></i>vanlig dag</span><span><i class="ph-k-red"></i>🎉 helgdag/afton</span><span><i class="ph-k-lov"></i>🎒 skollov</span><span>💰 lön</span><span><i class="ph-k-avg"></i>snitt</span>' + (R.partial && list.indexOf(R.partial) >= 0 ? '<span><i class="ph-k-part"></i>pågår</span>' : '') + '</div></div>';

    // ---- Timprofil ----
    var dayA = R.d[st.sel] || new Array(24).fill(0), dT = sum(dayA), avgA = new Array(24).fill(0);
    listDone.forEach(function (s) { R.d[s].forEach(function (v, h) { avgA[h] += v / listDone.length; }); });
    var aT = sum(avgA), hrs = isM ? MORGON_H : HOURS, pct = st.mode === 'andel';
    var val = function (a, t, h) { return pct ? (t ? a[h] / t * 100 : 0) : a[h]; };
    var mx = Math.max.apply(null, hrs.map(function (h) { return Math.max(val(dayA, dT, h), val(avgA, aT, h)); }).concat([1])) * 1.18;
    var W2 = 384, H2 = 156, pl2 = 6, pb2 = 22, pt2 = 10, cw2 = (W2 - pl2 - 4) / hrs.length;
    var y2 = function (v) { return pt2 + (H2 - pt2 - pb2) * (1 - v / mx); };
    var s2 = '<svg class="ph-svg" viewBox="0 0 ' + W2 + ' ' + H2 + '" role="img" aria-label="Bokningar per timme">';
    if (!isM) {
      var nx0 = pl2 + cw2 * 12;
      s2 += '<rect x="' + nx0 + '" y="' + pt2 + '" width="' + (cw2 * 12) + '" height="' + (H2 - pt2 - pb2) + '" class="ph-night"/><text x="' + (nx0 + 4) + '" y="' + (pt2 + 11) + '" class="ph-t9 ph-mut">🌙 nattpass 18–06</text>';
    }
    hrs.forEach(function (h, i) {
      var x = pl2 + cw2 * i, v = val(dayA, dT, h);
      s2 += '<rect x="' + (x + cw2 * 0.14) + '" y="' + y2(v) + '" width="' + (cw2 * 0.72) + '" height="' + Math.max(0, y2(0) - y2(v)) + '" rx="2" class="ph-hbar"/>';
      if (isM || i % 3 === 0) s2 += '<text x="' + (x + cw2 / 2) + '" y="' + (H2 - pb2 + 13) + '" text-anchor="middle" class="ph-t9 ph-mut">' + p2(h) + '</text>';
      if (isM) s2 += '<text x="' + (x + cw2 / 2) + '" y="' + (y2(v) - 4) + '" text-anchor="middle" class="ph-t10">' + (pct ? Math.round(v) + '%' : v) + '</text>';
    });
    if (listDone.length) {
      s2 += '<polyline points="' + hrs.map(function (h, i) { return (pl2 + cw2 * i + cw2 / 2).toFixed(1) + ',' + y2(val(avgA, aT, h)).toFixed(1); }).join(' ') + '" class="ph-avgline"/>';
    }
    s2 += '<line x1="' + pl2 + '" x2="' + W2 + '" y1="' + y2(0) + '" y2="' + y2(0) + '" class="ph-axis"/></svg>';
    var diff = aT ? Math.round((dT / aT - 1) * 100) : 0;
    var peak = hrs.slice().sort(function (a, b) { return dayA[b] - dayA[a]; })[0];
    var dd = H.dag(st.sel), L2 = H.lov(st.sel);
    var tags = (dd ? ' <span class="ph-tag ' + (dd.typ === 'dag' ? 'ph-tag-dag' : 'ph-tag-red') + '">' + (dd.typ === 'dag' ? '' : '🎉 ') + esc(dd.namn) + '</span>' : '') +
      (L2 ? ' <span class="ph-tag ph-tag-lov">🎒 ' + L2 + '</span>' : '') + (H.lon(st.sel) ? ' <span class="ph-tag ph-tag-dag">💰 Lön</span>' : '');
    out += '<div class="pg-card ph-card"><div class="ph-row"><h3>' + nice(st.sel) + (isM ? ' (morgon)' : '') + ' · ' + dT + (st.sel === R.partial ? ' <span class="ph-note">pågår</span>' : '') + '</h3>' +
      '<span class="ph-seg"><button type="button" data-ph-m="antal"' + (pct ? '' : ' class="on"') + '>Antal</button><button type="button" data-ph-m="andel"' + (pct ? ' class="on"' : '') + '>Andel</button></span></div>' +
      (tags ? '<div class="ph-tags">' + tags + '</div>' : '') +
      '<p class="pg-muted ph-sub">' + (st.sel !== R.partial && aT ? '<span class="ph-tag ' + (diff >= 0 ? 'ph-up' : 'ph-dn') + '">' + (diff >= 0 ? '+' : '') + diff + ' % mot snitt</span> ' : '') +
      (dT ? 'Mest ' + p2(peak) + '–' + p2((peak + 1) % 24) + '. ' : '') + 'Tryck på en stapel ovan för en annan dag.</p>' + s2 +
      '<div class="ph-legend"><span><i class="ph-k-bar"></i>' + nice(st.sel) + '</span><span><i class="ph-k-avg"></i>snitt ' + (st.wd < 0 ? 'alla dagar' : WDL[st.wd]) + '</span></div></div>';

    // ---- Värmekarta ----
    if (!isM) {
      var cnt = {}, acc = {}, hm = 0, order = [1, 2, 3, 4, 5, 6, 0];
      order.forEach(function (w) { cnt[w] = 0; acc[w] = new Array(24).fill(0); });
      done.forEach(function (s) { var w = H.dow(s); cnt[w]++; R.d[s].forEach(function (v, h) { acc[w][h] += v; }); });
      order.forEach(function (w) { acc[w] = acc[w].map(function (v) { return cnt[w] ? v / cnt[w] : 0; }); hm = Math.max.apply(null, [hm].concat(acc[w])); });
      var cs = 14.6, lx = 22, s3 = '<svg class="ph-svg" viewBox="0 0 ' + (lx + cs * 24 + 2) + ' ' + (cs * 7 + 34) + '" role="img" aria-label="Veckodag och timme">';
      order.forEach(function (w, r) {
        s3 += '<text x="0" y="' + (r * cs + cs * 0.72 + 1) + '" class="ph-t9' + (w === st.wd ? ' ph-b' : ' ph-mut') + '">' + WD[w] + '</text>';
        HOURS.forEach(function (h, i) {
          var v = hm ? acc[w][h] / hm : 0, a = v <= 0 ? 0.06 : 0.14 + 0.86 * Math.pow(v, 0.8);
          var sel = st.hm && st.hm.w === w && st.hm.h === h;
          s3 += '<rect data-ph-hm="' + w + ',' + h + '" x="' + (lx + i * cs) + '" y="' + (r * cs + 1) + '" width="' + (cs - 1.6) + '" height="' + (cs - 1.6) + '" rx="2.5" class="ph-hm' + (sel ? ' on' : '') + '" style="fill-opacity:' + a.toFixed(2) + '"/>';
        });
      });
      HOURS.forEach(function (h, i) { if (i % 3 === 0) s3 += '<text x="' + (lx + i * cs + cs / 2) + '" y="' + (7 * cs + 12) + '" text-anchor="middle" class="ph-t9 ph-mut">' + p2(h) + '</text>'; });
      s3 += '<rect x="' + (lx + 12 * cs - 1) + '" y="0" width="' + (12 * cs + 0.5) + '" height="' + (7 * cs + 1.5) + '" rx="3" class="ph-nightbox"/>';
      s3 += '<text x="' + (lx + 12 * cs) + '" y="' + (7 * cs + 27) + '" class="ph-t9 ph-acc">🌙 nattpass 18–06</text>';
      s3 += '<text x="' + lx + '" y="' + (7 * cs + 27) + '" class="ph-t9 ph-mut">lite</text><rect x="' + (lx + 20) + '" y="' + (7 * cs + 19) + '" width="60" height="9" rx="2" fill="url(#ph-g)"/><text x="' + (lx + 84) + '" y="' + (7 * cs + 27) + '" class="ph-t9 ph-mut">mycket</text>';
      s3 += '<defs><linearGradient id="ph-g"><stop offset="0" class="ph-g0"/><stop offset="1" class="ph-g1"/></linearGradient></defs></svg>';
      var rd = st.hm && acc[st.hm.w] ? '<b>' + WDL[st.hm.w].replace(/ar$/, '') + 'ar ' + p2(st.hm.h) + '–' + p2((st.hm.h + 1) % 24) + ':</b> snitt ' + (Math.round(acc[st.hm.w][st.hm.h] * 10) / 10).toString().replace('.', ',') + ' bokningar (' + cnt[st.hm.w] + ' dygn)' : 'Tryck på en ruta för snittet.';
      out += '<div class="pg-card ph-card"><h3>När är det mest? · veckodag × timme</h3><p class="pg-muted ph-sub">Snitt per timme. Mörkare ruta = fler bokningar.</p>' + s3 + '<div class="ph-readout">' + rd + '</div></div>';
    }
    if (st.z === '293') out += flightCard(ctx, listDone, st.sel);
    out += '</div>';
    // ---- Snart ----
    var np2 = nowParts(), k = H.kommande(np2.d, 45, 6);
    if (k.length) {
      out += '<div class="ph-soon">📅 <b>Snart:</b> ' + k.map(function (e) {
        var ic = e.typ === 'lov' ? '🎒 ' : e.typ === 'lon' ? '💰 ' : (e.typ === 'helg' || e.typ === 'afton') ? '🎉 ' : '';
        return ic + esc(e.namn) + ' ' + short(e.datum) + (e.till ? '–' + short(e.till) : '');
      }).join(' · ') + '</div>';
    }
    return out + note() + '</div>';
  }
  function note() {
    return '<p class="ph-note ph-foot">Historiken börjar 3 nov (morgonprognosen 27 okt) och växer för varje dag. Bara summerade antal visas, inga förare eller enskilda bokningar.</p>';
  }

  // Avmarkera (t1832u): tryck på vald ruta/flyg igen, eller var som helst utanför, så nollställs valet.
  // Stapeln: tryck på vald dag igen = tillbaka till förvalet (senaste hela dygnet); dagkortet behöver alltid en dag.
  var cur = null, docBound = false;
  function clearOutside(t) {
    var ch = false;
    if (st.hm && !(t && t.closest && t.closest('[data-ph-hm]'))) { st.hm = null; ch = true; }
    if (st.flOpen && !(t && t.closest && t.closest('[data-ph-fl],.ph-fldet'))) { st.flOpen = null; ch = true; }
    return ch;
  }
  function bind(root, ctx) {
    var box = root.querySelector('.ph');
    if (!box) return;
    cur = { box: box, ctx: ctx };
    if (!docBound) {
      docBound = true;
      document.addEventListener('click', function (e) {
        if (!cur || !cur.box.isConnected || cur.box.contains(e.target)) return;
        if (clearOutside(e.target)) cur.ctx.repaint();
      });
    }
    box.addEventListener('click', function (e) {
      var t = e.target.closest('[data-ph-z],[data-ph-wd],[data-ph-sel],[data-ph-m],[data-ph-hm],[data-ph-fs],[data-ph-fl]');
      var ch = clearOutside(e.target);
      if (!t) { if (ch) ctx.repaint(); return; }
      if (t.hasAttribute('data-ph-z')) { st.z = t.getAttribute('data-ph-z'); st.sel = null; st.hm = null; save(); }
      else if (t.hasAttribute('data-ph-wd')) { st.wd = +t.getAttribute('data-ph-wd'); st.sel = null; }
      else if (t.hasAttribute('data-ph-sel')) { var d = t.getAttribute('data-ph-sel'); st.sel = st.sel === d ? null : d; }
      else if (t.hasAttribute('data-ph-m')) { st.mode = t.getAttribute('data-ph-m'); save(); }
      else if (t.hasAttribute('data-ph-fs')) { st.flScope = t.getAttribute('data-ph-fs'); st.flOpen = null; }
      else if (t.hasAttribute('data-ph-fl')) { var f = t.getAttribute('data-ph-fl'); st.flOpen = st.flOpen === f ? null : f; }
      else if (t.hasAttribute('data-ph-hm')) { var p = t.getAttribute('data-ph-hm').split(','), w = +p[0], h = +p[1]; st.hm = st.hm && st.hm.w === w && st.hm.h === h ? null : { w: w, h: h }; }
      ctx.repaint();
    });
    var zt = box.querySelector('.ph-zones .on');
    if (zt && zt.scrollIntoView) { var row = zt.parentNode; row.scrollLeft = Math.max(0, zt.offsetLeft - row.offsetLeft - 40); }
  }

  window.PROGNOS_HISTORIK = { html: html, bind: bind };
})();
