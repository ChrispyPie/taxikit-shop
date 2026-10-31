/* Admin › Zonguide (test, bara för admin).
 * Visar var åkeriets resor oftast har startat en viss veckodag och timme, de senaste 12 veckorna (eller 8/26).
 * Ägaren och S admin ser sidan, samma som Åkeridata och Bilar. Vanliga förare ser den inte (t812u).
 * Server: public.zonguide(p_token, p_dow, p_hour, p_weeks) räknar fram allt när sidan öppnas (ingen cron).
 * Ett körpass räknas 06–05, så söndag 02 hör till lördagens pass i dygnsöversikten.
 * Magasinet (290) räknas inte. Använder admin.html:s rpc(), esc(), errText() och render().
 * Ångra: supabase/migrations/undo/20261031a_zonguide_undo.sql + revert av merge-commiten.
 */
(function () {
  'use strict';
  var DAGAR = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
  // Namn som appen redan har (Prognos). Övriga namn kommer från servern (platser med zon).
  var KANDA = { '293': 'Landvetter flygplats', '161': 'Essity', '163': 'Astra', '406': 'Volvo', '432': 'Volvo Cars Torslanda', '15': 'Hotell Draken' };
  var Z = window.ZONGUIDE_ADMIN = { data: null, err: '', dow: null, hour: null, weeks: 12, busy: false };

  (function css() {
    var s = document.createElement('style');
    s.textContent =
      '.zg-info{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px;font-size:calc(14px * var(--font-scale, 1));line-height:1.45}' +
      '.zg-info b{font-size:calc(16px * var(--font-scale, 1))}' +
      '.zg-test{display:inline-block;margin-left:6px;font-size:calc(11px * var(--font-scale, 1));padding:2px 8px;border-radius:10px;font-weight:600;background:var(--c-fefcbf);color:var(--c-975a16);vertical-align:middle}' +
      '.zg-note{background:var(--c-fefcbf);color:var(--c-975a16);border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:calc(14px * var(--font-scale, 1))}' +
      '.zg-ctl{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}' +
      '.zg-ctl select{flex:1;min-width:0;padding:10px 6px;border-radius:8px;border:1px solid var(--c-cbd5e0);font:inherit;font-size:calc(15px * var(--font-scale, 1));background:var(--surface);color:var(--text)}' +
      '.zg-ctl button{padding:10px 14px;font-size:calc(15px * var(--font-scale, 1))}' +
      '.zg-ctl button.on{background:var(--primary);color:var(--on-primary,#fff)}' +
      '.zg-card{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px}' +
      '.zg-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:600;font-size:calc(16px * var(--font-scale, 1))}' +
      '.zg-sub{font-size:calc(13px * var(--font-scale, 1));color:var(--c-718096);margin:2px 0 8px}' +
      '.zg-q{font-size:calc(11px * var(--font-scale, 1));padding:2px 8px;border-radius:10px;font-weight:600;white-space:nowrap}' +
      '.zg-q.lite{background:var(--c-fed7d7);color:var(--c-c53030)}.zg-q.okej{background:var(--c-fefcbf);color:var(--c-975a16)}.zg-q.bra{background:var(--c-c6f6d5);color:var(--c-276749)}' +
      '.zg-z{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--c-edf2f7)}' +
      '.zg-r{width:26px;height:26px;border-radius:13px;background:var(--primary);color:var(--on-primary,#fff);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none;font-size:calc(13px * var(--font-scale, 1))}' +
      '.zg-m{flex:1;min-width:0}.zg-m .n{font-weight:600}.zg-m .p{font-size:calc(12px * var(--font-scale, 1));color:var(--c-718096);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.zg-bar{height:6px;border-radius:3px;background:var(--c-edf2f7);margin-top:4px}.zg-bar i{display:block;height:6px;border-radius:3px;background:var(--primary)}' +
      '.zg-c{text-align:right;font-size:calc(12px * var(--font-scale, 1));color:var(--c-4a5568);white-space:nowrap}.zg-c b{display:block;font-size:calc(15px * var(--font-scale, 1));color:var(--text)}' +
      '.zg-h{display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:6px;cursor:pointer;font-size:calc(13px * var(--font-scale, 1))}' +
      '.zg-h.sel{background:var(--c-edf2f7);font-weight:600}.zg-h .t{width:24px;flex:none;font-variant-numeric:tabular-nums}' +
      '.zg-h .b{width:56px;flex:none;height:8px;border-radius:4px;background:var(--c-edf2f7)}.zg-h .b i{display:block;height:8px;border-radius:4px;background:var(--primary)}' +
      '.zg-h .k{width:22px;flex:none;text-align:right;color:var(--c-718096);font-variant-numeric:tabular-nums}' +
      '.zg-h .zs{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.zg-empty{text-align:center;color:var(--c-718096);font-size:calc(14px * var(--font-scale, 1));padding:16px}' +
      '.zg-err{background:var(--c-fed7d7);color:var(--c-c53030);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:calc(14px * var(--font-scale, 1))}';
    document.head.appendChild(s);
  })();

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isDemo() { return !!(window.DEMO && DEMO.owner && DEMO.owner()); }
  function rr() { if (typeof render === 'function') render(); else Z.render(); }
  function namn(z) {
    var d = Z.data && Z.data.namn && Z.data.namn[z];
    var n = KANDA[z] || d || '';
    var p = n.split(', ');
    return p.length > 3 ? p.slice(0, 3).join(', ') + ' m.fl.' : n;
  }
  function nowSthlm() {
    var p = {}; new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hour12: false })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    var dow = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'].indexOf(String(p.weekday).replace('.', '')) + 1;
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, dow: dow || (new Date().getDay() || 7) };
  }
  function kvalitet(n) {
    if (n < 12) return '<span class="zg-q lite">Lite data</span>';
    if (n < 30) return '<span class="zg-q okej">Okej underlag</span>';
    return '<span class="zg-q bra">Bra underlag</span>';
  }

  // Speciella kvällar: bara en påminnelse, siffrorna är vanliga veckor.
  function special(t) {
    var md = t.m * 100 + t.d, a = [];
    if (md === 1031) a.push('Halloween');
    if (md === 1231) a.push('Nyårsafton');
    if (md === 101) a.push('Nyårsdagen');
    if (md === 430) a.push('Valborg');
    if (md === 1224) a.push('Julafton');
    if (md === 1213) a.push('Lucia');
    if (t.m === 6 && t.dow === 5 && t.d >= 19 && t.d <= 25) a.push('Midsommarafton');
    // Lönehelg: fredag eller lördag 25–31 i månaden, eller fredag 23–24 när den 25:e är en helgdag
    if ((t.dow === 5 || t.dow === 6) && (t.d >= 25 || (t.dow === 5 && t.d >= 23))) a.push('lönehelg');
    if (!a.length) return '';
    return '🎉 I dag är det ' + a.join(' och ') + '. Zonguiden bygger på vanliga veckor, så i kväll kan det bli annorlunda.';
  }

  function demoData(dow, hour, weeks) {
    var z = [['9', 14, 9], ['10', 11, 8], ['292', 9, 7], ['3', 6, 5], ['16', 3, 2]];
    var d0 = hour < 6 ? (dow === 1 ? 7 : dow - 1) : dow, dygn = [];
    for (var i = 0; i < 24; i++) {
      var h = (i + 6) % 24, dd = i < 18 ? d0 : (d0 === 7 ? 1 : d0 + 1), k = 4 + Math.round(10 * Math.abs(Math.sin(h / 4)));
      dygn.push({ dow: dd, hour: h, starter: k, top: [{ zon: '9', n: 3 }, { zon: '10', n: 2 }, { zon: '3', n: 1 }] });
    }
    return { demo: true, dow: dow, hour: hour, weeks: weeks, pass_dag: d0, starter: 43, veckor_med_data: weeks,
      top: z.map(function (r) { return { zon: r[0], n: r[1], veckor: r[2], per_vecka: +(r[1] / weeks).toFixed(2), andel: Math.round(100 * r[1] / 43) }; }),
      dygn: dygn, namn: { '9': 'Exempelplats' } };
  }

  Z.load = async function () {
    var t = nowSthlm();
    if (Z.dow === null) { Z.dow = t.dow; Z.hour = t.h; }
    Z.err = ''; Z.busy = true; rr();
    try {
      Z.data = isDemo() ? demoData(Z.dow, Z.hour, Z.weeks) : await rpc('zonguide', { p_dow: Z.dow, p_hour: Z.hour, p_weeks: Z.weeks });
    } catch (e) {
      Z.data = null;
      Z.err = e.message === 'forbidden' ? 'Du har inte behörighet att se Zonguiden.' : (typeof errText === 'function' ? errText(e) : 'Något gick fel.');
    }
    Z.busy = false; rr();
  };
  Z.set = function (dow, hour) { Z.dow = +dow; Z.hour = +hour; Z.load(); };
  Z.now = function () { var t = nowSthlm(); Z.set(t.dow, t.h); };
  Z.setWeeks = function (w) { Z.weeks = +w; Z.load(); };

  Z.render = function (content) {
    var el = content || document.getElementById('content');
    if (!el || !(path[0] && path[0].id === 'zonguide')) return;
    var t = nowSthlm(), isNow = Z.dow === t.dow && Z.hour === t.h, d = Z.data;
    var h = '<div class="zg-info"><b>🧭 Zonguide</b><span class="zg-test">Test, bara för admin</span><br>' +
      'Här ser du var åkeriets resor oftast har startat en viss veckodag och timme. Siffrorna kommer från alla förares resor de senaste ' + Z.weeks + ' veckorna. ' +
      'Magasinet räknas inte. Förarna ser inte den här sidan.</div>';
    var sp = isNow ? special(t) : '';
    if (sp) h += '<div class="zg-note">' + esc(sp) + '</div>';
    h += '<div class="zg-ctl"><select aria-label="Veckodag" onchange="ZONGUIDE_ADMIN.set(this.value, ZONGUIDE_ADMIN.hour)">' +
      [1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<option value="' + i + '"' + (i === Z.dow ? ' selected' : '') + '>' + DAGAR[i] + '</option>'; }).join('') +
      '</select><select aria-label="Timme" onchange="ZONGUIDE_ADMIN.set(ZONGUIDE_ADMIN.dow, this.value)">';
    for (var i = 0; i < 24; i++) h += '<option value="' + i + '"' + (i === Z.hour ? ' selected' : '') + '>' + pad(i) + '–' + pad((i + 1) % 24) + '</option>';
    h += '</select><select aria-label="Antal veckor" onchange="ZONGUIDE_ADMIN.setWeeks(this.value)">' +
      [8, 12, 26].map(function (w) { return '<option value="' + w + '"' + (w === Z.weeks ? ' selected' : '') + '>' + w + ' v</option>'; }).join('') +
      '</select><button class="' + (isNow ? 'on' : '') + '" onclick="ZONGUIDE_ADMIN.now()">Nu</button></div>';
    if (Z.err) h += '<div class="zg-err">' + esc(Z.err) + '</div>';
    if (!d) { el.innerHTML = h + (Z.err ? '' : '<div class="zg-empty">Laddar…</div>'); return; }

    // Topp 5
    var top = (d.top || []).slice(0, 5), max = top.length ? top[0].n : 1;
    h += '<div class="zg-card"><div class="zg-head"><span>' + DAGAR[d.dow] + ' ' + pad(d.hour) + '–' + pad((d.hour + 1) % 24) + (isNow ? ' (nu)' : '') + '</span>' + kvalitet(d.starter) + '</div>' +
      '<div class="zg-sub">' + d.starter + ' starter på ' + d.weeks + ' veckor' + (Z.busy ? ' · uppdaterar…' : '') + '</div>';
    if (!top.length) h += '<div class="zg-empty">Inga resor startade den här timmen.</div>';
    top.forEach(function (z, i) {
      var nm = namn(z.zon), osaker = z.veckor < 3;
      h += '<div class="zg-z"><span class="zg-r">' + (i + 1) + '</span><div class="zg-m"><div class="n">Zon ' + esc(z.zon) + '</div>' +
        (nm ? '<div class="p">' + esc(nm) + '</div>' : '') +
        '<div class="zg-bar"><i style="width:' + Math.max(6, Math.round(100 * z.n / max)) + '%"></i></div></div>' +
        '<div class="zg-c"><b>' + z.n + ' st</b>' + z.veckor + ' av ' + d.weeks + ' v' + (osaker ? ' ⚠️' : '') + '</div></div>';
    });
    if (top.some(function (z) { return z.veckor < 3; })) h += '<div class="zg-sub" style="margin:6px 0 0">⚠️ = hänt färre än 3 veckor, kan vara slumpen.</div>';
    h += '</div>';

    // Hela passet 06–05
    var dy = d.dygn || [], mx = 1;
    dy.forEach(function (x) { if (x.starter > mx) mx = x.starter; });
    var d1 = d.pass_dag === 7 ? 1 : d.pass_dag + 1;
    h += '<div class="zg-card"><div class="zg-head"><span>Hela passet</span></div><div class="zg-sub">' + DAGAR[d.pass_dag] + ' 06 till ' + DAGAR[d1].toLowerCase() + ' 05. Tryck på en timme. Siffran är antal starter.</div>';
    dy.forEach(function (x) {
      var sel = x.dow === d.dow && x.hour === d.hour, nu = x.dow === t.dow && x.hour === t.h;
      h += '<div class="zg-h' + (sel ? ' sel' : '') + '" onclick="ZONGUIDE_ADMIN.set(' + x.dow + ',' + x.hour + ')"><span class="t">' + pad(x.hour) + '</span>' +
        '<span class="b"><i style="width:' + Math.round(100 * x.starter / mx) + '%"></i></span><span class="k">' + x.starter + '</span>' +
        '<span class="zs">' + (x.top.length ? x.top.map(function (z) { return esc(z.zon); }).join(' · ') : '–') + (nu ? ' ← nu' : '') + '</span></div>';
    });
    h += '</div>';
    if (d.demo) h += '<div class="zg-sub">Exempeldata i demokontot.</div>';
    el.innerHTML = h;
  };
})();
