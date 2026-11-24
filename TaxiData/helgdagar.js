/* Helgdagar, aftnar, skollov (Göteborg) och lönedag – delad modul.
 * Röda dagar och aftnar räknas fram för valfritt år (påsk via Gauss/Meeus).
 * Skollov: Göteborgs Stads läsårstider (kommunala grundskolor), helgerna runt lovet räknas med.
 *   Källa: goteborg.se Läsårstider 2026/2027. Lägg till nästa läsår i LOV när det beslutats.
 * Lön: den 25:e, eller fredagen innan om den 25:e är lördag/söndag.
 * Datum som 'YYYY-MM-DD' (svensk kalender). Ingen nätverkstrafik.
 */
(function () {
  'use strict';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function pd(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function add(s, n) { var d = pd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function dow(s) { return pd(s).getUTCDay(); }
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return y + '-' + pad(mo) + '-' + pad(da);
  }
  function firstDow(from, w) { var s = from; while (dow(s) !== w) s = add(s, 1); return s; }
  var cache = {};
  // typ: 'helg' = röd dag, 'afton' = afton, 'dag' = särskild dag (inte röd)
  function year(y) {
    if (cache[y]) return cache[y];
    var e = easter(y), o = {};
    var put = function (d, n, t) { o[d] = { namn: n, typ: t }; };
    put(y + '-01-01', 'Nyårsdagen', 'helg');
    put(y + '-01-05', 'Trettondagsafton', 'afton');
    put(y + '-01-06', 'Trettondedag jul', 'helg');
    put(add(e, -3), 'Skärtorsdag', 'afton');
    put(add(e, -2), 'Långfredag', 'helg');
    put(add(e, -1), 'Påskafton', 'afton');
    put(e, 'Påskdagen', 'helg');
    put(add(e, 1), 'Annandag påsk', 'helg');
    put(y + '-04-30', 'Valborg', 'afton');
    put(y + '-05-01', 'Första maj', 'helg');
    put(add(e, 39), 'Kristi himmelsfärd', 'helg');
    put(add(e, 48), 'Pingstafton', 'afton');
    put(add(e, 49), 'Pingstdagen', 'helg');
    put(y + '-06-06', 'Nationaldagen', 'helg');
    var ms = firstDow(y + '-06-20', 6);
    put(add(ms, -1), 'Midsommarafton', 'afton');
    put(ms, 'Midsommardagen', 'helg');
    var ah = firstDow(y + '-10-31', 6);
    put(add(ah, -1), 'Allhelgonaafton', 'afton');
    put(ah, 'Alla helgons dag', 'helg');
    put(y + '-12-13', 'Lucia', 'dag');
    put(firstDow(y + '-11-27', 0), 'Första advent', 'dag');
    put(firstDow(y + '-11-08', 0), 'Fars dag', 'dag');      // andra söndagen i november
    put(firstDow(y + '-05-25', 0), 'Mors dag', 'dag');      // sista söndagen i maj
    put(y + '-12-24', 'Julafton', 'afton');
    put(y + '-12-25', 'Juldagen', 'helg');
    put(y + '-12-26', 'Annandag jul', 'helg');
    put(y + '-12-31', 'Nyårsafton', 'afton');
    cache[y] = o;
    return o;
  }
  function dag(s) { return year(+s.slice(0, 4))[s] || null; }
  // Göteborg, kommunala grundskolor. Från/till inkl. helgerna runt lovet.
  var LOV = [
    ['2026-10-24', '2026-11-01', 'Höstlov'],
    ['2026-12-19', '2027-01-10', 'Jullov'],
    ['2027-02-13', '2027-02-21', 'Sportlov'],
    ['2027-03-26', '2027-04-05', 'Påsklov'],
    ['2027-05-06', '2027-05-09', 'Lovdag'],
    ['2027-06-11', '2027-08-15', 'Sommarlov']   // slutdatum preliminärt tills läsår 2027/28 beslutats
  ];
  function lov(s) {
    for (var i = 0; i < LOV.length; i++) if (s >= LOV[i][0] && s <= LOV[i][1]) return LOV[i][2];
    return null;
  }
  function lon(s) {
    var p25 = s.slice(0, 8) + '25', w = dow(p25);
    var pay = p25;
    // Lördag, söndag eller röd dag → närmaste vardag innan
    for (var i = 0; i < 7; i++) {
      var dd = dag(pay), ww = dow(pay);
      if (ww !== 0 && ww !== 6 && !(dd && (dd.typ === 'helg' || dd.typ === 'afton'))) break;
      pay = add(pay, -1);
    }
    return s === pay;
  }
  // Kommande markerade dagar från 'from' och n dagar framåt (max antal = lim)
  function kommande(from, n, lim) {
    var out = [], seenLov = {};
    for (var i = 0; i <= n && out.length < (lim || 6); i++) {
      var s = add(from, i), d = dag(s), l = lov(s);
      if (l && !seenLov[l + s.slice(0, 4)] && (i === 0 ? true : !lov(add(s, -1)))) {
        seenLov[l + s.slice(0, 4)] = 1;
        var end = s; while (lov(add(end, 1)) === l) end = add(end, 1);
        out.push({ datum: s, till: end, namn: l, typ: 'lov' });
      }
      if (d) out.push({ datum: s, namn: d.namn, typ: d.typ });
      if (lon(s)) out.push({ datum: s, namn: 'Lön', typ: 'lon' });
    }
    return out.slice(0, lim || 6);
  }
  window.HELGDAGAR = { dag: dag, lov: lov, lon: lon, kommande: kommande, easter: easter, add: add, dow: dow };
})();
