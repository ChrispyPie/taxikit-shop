/* Bil & verkstad (förut "Verkstadstimmar"). Menyns id är fortfarande 'verkstad' så sparade vyer fungerar.
 *
 * Flikar:
 *  - Felanmälan: förare anmäler fel på en bil (valfritt foto), "Bilen står" = blockerande.
 *  - Behövs till bilen: kvittorullar, spolarvätska, rengöring eller annat.
 *  - Underhåll: planerad service, däckbyte, bromsar, besiktning … efter datum och/eller km.
 *  - Verkstadstimmar: som förut (get_my_workshop, save_my_workshop, delete_my_workshop).
 *  - Uppgifter: ägaren skickar ett ärende vidare till en förare med instruktion + checklista.
 *    Föraren svarar med bokad tid/plats, bockar av och markerar klart (save_car_task, reply_car_task,
 *    check_car_task_item, done_car_task, delete_car_task). Ägaren väljer notiser i appen/mejl (save_bil_prefs).
 *
 * Synlighet styrs av servern: förare ser bara sina egna anmälningar och uppgifter de fått.
 * Ägaren (agare) och S admin ser allt. Rollen admin räknas som förare här.
 *
 * Allt kontrolleras på servern: get_bil, save_car_issue, set_car_issue_status, save_car_maintenance,
 * done_car_maintenance, delete_car_maintenance, save_car_km, get_bil_notices. Ägaren/S admin
 * ändrar status och planerar underhåll; förare anmäler och föreslår. Foton går via edge-funktionen
 * bil-foto till en privat bucket (bara små, nedskalade jpeg-bilder).
 */
(function () {
  'use strict';

  var V = window.VERKSTAD = { id: 'verkstad', title: 'Bil & verkstad', icon: '🛠️' };
  var WARN_MIN = 10 * 60;      // fråga "stämmer det?" över 10 timmar
  var MAX_MIN = 24 * 60;       // servern tillåter högst 24 timmar
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  var MONL = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  var WD = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  var STATUS = { pending: 'Väntar', approved: 'Godkänd', rejected: 'Nekad' };
  var ISTATUS = { ny: 'Ny', pagar: 'Pågår', klar: 'Klar' };
  var SUPPLY = [['kvitto', '🧾', 'Kvittorullar'], ['spolar', '💧', 'Spolarvätska'], ['rengoring', '🧽', 'Rengöring'], ['annat', '✏️', 'Annat']];
  var MTYPES = [['service', '🔧', 'Service'], ['dack_sommar', '☀️', 'Däck sommar'], ['dack_vinter', '❄️', 'Däck vinter'],
    ['bromsar', '🛑', 'Bromsar'], ['besiktning', '📋', 'Besiktning'], ['annat', '✏️', 'Annat']];
  var TABS = [['fel', '🚨', 'Fel'], ['behov', '🧴', 'Behövs'], ['underhall', '🗓️', 'Underhåll'], ['uppg', '📋', 'Uppgifter'], ['timmar', '⏱️', 'Timmar']];
  var TSTATUS = { ny: 'Ny', bokad: 'Bokad', klar: 'Klar' };
  var NTYPES = [['bil_stop', '🛑 Bilen står'], ['bil_fault', '⚠️ Nytt fel'], ['bil_supply', '🧴 Något behövs'], ['bil_suggest', '💡 Förslag på underhåll'],
    ['bil_maint', '🔧 Underhåll snart/försenat'], ['bil_task_reply', '📅 Förare har bokat tid/svarat'], ['bil_task_done', '✅ Uppgift klar']];
  var ERR = {
    bad_time: 'Stopptiden måste vara efter starttiden.',
    too_long: 'Högst 24 timmar per registrering. Dela upp längre tider.',
    future: 'Du kan inte registrera tid som inte har hänt än.',
    too_old: 'Det datumet är för långt bak i tiden.',
    bad_car: 'Välj en bil, eller välj "Annan bil" och skriv bilnummer.',
    bad_car_label: 'Skriv ett giltigt bilnummer (bara bokstäver och siffror, t.ex. A123).',
    overlap: 'Tiden krockar med en annan registrering du har gjort.',
    not_editable: 'Det går inte att ändra längre.',
    not_found: 'Det finns inte längre.',
    comment_too_long: 'Kommentaren får vara högst 500 tecken.',
    forbidden: 'Du har inte behörighet att göra det.',
    need_text: 'Skriv vad det gäller.',
    bad_supply: 'Välj vad som behövs.',
    bad_type: 'Välj typ av underhåll.',
    need_due: 'Fyll i datum eller km (eller båda).',
    bad_km: 'Kontrollera km-siffran.',
    km_odd: 'Mätarställningen ser konstig ut (lägre än förra eller mycket högre). Be ägaren rätta.',
    bad_interval: 'Kontrollera intervallet.',
    bad_date: 'Kontrollera datumet.',
    bad_cost: 'Kontrollera kostnaden.',
    bad_issue: 'Felanmälan finns inte.',
    too_many: 'Du har skickat väldigt många idag. Försök igen i morgon.',
    too_many_photos: 'Högst 3 foton.',
    bad_driver: 'Välj en förare i listan.',
    bad_items: 'Högst 15 punkter i checklistan.',
    bad_prefs: 'Kunde inte spara valen.',
    too_big: 'Fotot är för stort.',
    bad_image: 'Fotot gick inte att läsa.',
    upload_failed: 'Fotot kunde inte sparas. Försök igen.'
  };
  var st = { el: null, data: null, bil: null, err: null, bilErr: null, form: null, busy: false,
    tab: localStorage.getItem('bil_tab') || 'fel', car: null, showDone: false, f: null, photos: {}, mDone: null, tf: null, tr: null, tlog: {} };
  if (!TABS.some(function (t) { return t[0] === st.tab; })) st.tab = 'fel';

  // ---------- hjälp ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return String(n).padStart(2, '0'); }
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function ddmm(d) { return p2(d.getDate()) + '/' + p2(d.getMonth() + 1); }
  function dayLabel(d) { return WD[d.getDay()] + ' ' + ddmm(d) + '-' + String(d.getFullYear()).slice(-2); }
  function hm(d) { return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function dur(m) { m = Math.round(m); var h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min'; }
  function kr(n) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }
  function km(n) { return Math.round(n).toLocaleString('sv-SE') + ' km'; }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function dateSv(s) { if (!s) return ''; var p = String(s).slice(0, 10).split('-'); return +p[2] + ' ' + MON[+p[1] - 1].toLowerCase() + ' ' + p[0]; }
  function when(ts) { var d = new Date(ts); return dayLabel(d) + ' ' + hm(d); }
  V.dur = dur; V.kr = kr;
  function span(s, e) {
    var a = new Date(s), b = new Date(e);
    return dayLabel(a) + ' ' + hm(a) + '–' + (sod(a).getTime() === sod(b).getTime() ? '' : dayLabel(b) + ' ') + hm(b);
  }
  function carById(id) { return ((st.bil && st.bil.cars) || []).filter(function (c) { return c.id === id; })[0] || null; }
  function admin() { return !!(st.bil && st.bil.is_admin); }
  function tabs() { return TABS.filter(function (t) { return t[0] !== 'uppg' || admin() || (st.bil && (st.bil.tasks || []).length); }); }
  function openFaults(car, keep) {
    return ((st.bil && st.bil.issues) || []).filter(function (i) {
      return i.kind === 'fault' && (i.status !== 'klar' || i.id === keep) && (!car || i.car_id === car);
    });
  }
  function issueLabel(id) {
    var i = ((st.bil && st.bil.issues) || []).filter(function (x) { return x.id === id; })[0];
    return i ? 'Felanmälan: ' + cut(i.body, 60) : 'Kopplad till en felanmälan';
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
  // Foton: edge-funktionen bil-foto kontrollerar inloggningen i databasen och sparar i en privat bucket
  function photoApi(body) {
    body.token = localStorage.getItem('taxi_session') || '';
    return fetch(TRIP_API_URL + '/functions/v1/bil-foto', {
      method: 'POST', headers: { 'apikey': TRIP_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) { var er = new Error((b && b.error) || ('HTTP ' + r.status)); er.code = b && b.code; throw er; }
        return b;
      });
    });
  }
  function errText(e) { return ERR[e && e.message] || 'Det gick inte att spara. Försök igen.'; }
  function fail(e) { if (e && e.code === '28000') { location.reload(); return true; } return false; }

  // Skala ner fotot i telefonen innan det skickas (max 1280 px, jpeg)
  function shrink(file) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var tries = [[1280, 0.72], [1024, 0.6], [800, 0.5]], out = null;
        for (var i = 0; i < tries.length; i++) {
          var s = Math.min(1, tries[i][0] / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', tries[i][1]);
          if (out.length < 1300000) break;
        }
        URL.revokeObjectURL(url); ok(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('bad_image')); };
      img.src = url;
    });
  }

  // ---------- data ----------
  function load() {
    st.err = null; st.bilErr = null;
    var a = rpc('get_my_workshop', {}).then(function (d) {
      st.data = d;
      window.VERKSTAD_LAST = d;
      document.dispatchEvent(new CustomEvent('verkstad:data', { detail: d }));
    }).catch(function (e) {
      if (fail(e)) return;
      st.err = 'Kunde inte hämta verkstadstimmarna. Försök igen.';
    });
    var b = rpc('get_bil', {}).then(function (d) { st.bil = d; badge(d); })
      .catch(function (e) { if (fail(e)) return; st.bilErr = 'Kunde inte hämta bilarna. Försök igen.'; });
    return Promise.all([a, b]).then(draw);
  }
  // Siffra på menyrutan: olästa bil-notiser (admin: annars antal bilar som står)
  function badge(d) {
    if (!window.setBadge || !d) return;
    var n = +d.unread || 0;
    if (!n && d.is_admin) n = ((d.cars || []).filter(function (c) { return c.blocking; })).length;
    if (!n) n = (d.tasks || []).filter(function (t) { return t.mine && t.status !== 'klar'; }).length;
    setBadge('bil', n);
  }
  V.refreshBadge = function () {
    if (!localStorage.getItem('taxi_session')) return;
    rpc('bil_badge', {}).then(function (b) {
      if (!window.setBadge || !b) return;
      // servern räknar "står" bara för ägaren/S admin, och "tasks" = mina öppna uppgifter
      setBadge('bil', (+b.unread || 0) || (+b.blocking || 0) || (+b.tasks || 0));
    }).catch(function () {});
  };

  V.render = function (content) {
    st.el = content; st.form = null; st.f = null; st.mDone = null; st.tf = null; st.tr = null; window.VERKSTAD_LAST = null;
    content.innerHTML = '<div id="bv-root"><div id="bv-top"></div><div id="vk-body"><div class="tl-msg">Laddar…</div></div></div>';
    drawTop();
    load();
  };
  V.openTab = function (t) { st.tab = t; localStorage.setItem('bil_tab', t); st.f = null; st.mDone = null; st.tf = null; st.tr = null; drawTop(); draw(); window.scrollTo(0, 0); };

  function drawTop() {
    var top = document.getElementById('bv-top'); if (!top) return;
    var unread = st.bil ? +st.bil.unread || 0 : 0, tl = tabs();
    var open = st.bil ? (st.bil.tasks || []).filter(function (t) { return t.mine && t.status !== 'klar'; }).length : 0;
    top.innerHTML = '<div class="bv-tabs' + (tl.length > 4 ? ' five' : '') + '">' + tl.map(function (t) {
      return '<button type="button" class="tl-tab bv-tab' + (st.tab === t[0] ? ' active' : '') + '" data-t="' + t[0] + '"><span>' + t[1] + '</span>' + t[2] +
        (t[0] === 'uppg' && open ? '<b class="bv-tn">' + open + '</b>' : '') + '</button>';
    }).join('') + '<button type="button" class="bv-bell" id="bv-bell" aria-label="Notiser">🔔' + (unread ? '<b>' + unread + '</b>' : '') + '</button></div>';
    top.querySelectorAll('.bv-tab').forEach(function (b) { b.onclick = function () { V.openTab(b.dataset.t); }; });
    document.getElementById('bv-bell').onclick = showNotices;
  }

  function draw() {
    var body = st.el && document.getElementById('vk-body'); if (!body) return;
    drawTop();
    if (st.tab === 'timmar') return drawHours(body);
    if (st.bil && st.tab === 'uppg' && !tabs().some(function (t) { return t[0] === 'uppg'; })) st.tab = 'fel';
    if (st.bilErr) { body.innerHTML = '<div class="tl-msg err">' + esc(st.bilErr) + '</div>'; return; }
    if (!st.bil) { body.innerHTML = '<div class="tl-msg">Laddar…</div>'; return; }
    if (st.tab === 'fel') drawIssues(body, 'fault');
    else if (st.tab === 'behov') drawIssues(body, 'supply');
    else if (st.tab === 'uppg') drawTasks(body);
    else drawMaint(body);
  }

  // ---------- bilar (med märken) ----------
  function carBadges(c) {
    var h = '';
    if (c.blocking) h += '<span class="bv-b stop">🛑 Står</span>';
    else if (c.open_faults) h += '<span class="bv-b warn">⚠️ ' + c.open_faults + ' fel</span>';
    if (c.maint_level === 2) h += '<span class="bv-b stop">⏰ Försenad</span>';
    else if (c.maint_level === 1) h += '<span class="bv-b soon">🔧 Snart</span>';
    return h;
  }
  function carsCard() {
    var cars = st.bil.cars || [];
    if (!cars.length) return '<div class="vk-warn">Det finns inga bilar upplagda än. Be ägaren lägga till bilen under Admin › Bilar.</div>';
    return '<div class="bv-cars">' + cars.map(function (c) {
      return '<button type="button" class="bv-car' + (st.car === c.id ? ' on' : '') + (c.blocking ? ' stop' : '') + '" data-c="' + c.id + '">' +
        '<b>' + esc(c.bilnummer) + '</b><small>' + esc(cut(c.modell, 18)) + '</small>' + carBadges(c) + '</button>';
    }).join('') + '</div>';
  }
  function bindCars(body) {
    body.querySelectorAll('.bv-car').forEach(function (b) {
      b.onclick = function () { var id = +b.dataset.c; st.car = st.car === id ? null : id; draw(); };
    });
  }
  // bilen föraren kör nu (servern läser senaste resekvitto/pass från STIG)
  function curCar() { return (st.bil && st.bil.current_car_id) || null; }
  function curLabel() { return (st.bil && st.bil.current_car_label) || ''; }
  function curHint(f) {
    var lbl = curLabel(); if (!lbl || f.id) return '';
    var on = f.other ? f.label === lbl : f.car && carById(f.car) && carById(f.car).bilnummer.toUpperCase() === lbl;
    if (!on) return '';
    var at = st.bil.current_car_at ? ' (' + (st.bil.current_car_source === 'kvitto' ? 'senaste resa ' : 'senaste pass ') + when(st.bil.current_car_at) + ')' : '';
    return '<div class="vk-foot2">Förvald: bilen du körde senast' + esc(at) + '. Du kan välja en annan.</div>';
  }
  function carOptions(sel, allowNone, noneText, other) {
    return (allowNone ? '<option value="">' + esc(noneText || 'Välj bil…') + '</option>' : '<option value="">Välj bil…</option>') +
      (st.bil.cars || []).map(function (c) {
        var extra = c.blocking ? ' – 🛑 står' : c.open_faults ? ' – ⚠️ ' + c.open_faults + ' öppet fel' : '';
        return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.bilnummer) + (c.modell ? ' – ' + esc(c.modell) : '') + extra + '</option>';
      }).join('') + (other ? '<option value="other"' + (other === 'on' ? ' selected' : '') + '>Annan bil (skriv bilnummer)</option>' : '');
  }

  // ---------- felanmälan / behövs till bilen ----------
  function newIssue(kind, i) {
    var cc = st.car || curCar(), lbl = !st.car && !cc ? curLabel() : '';
    return { kind: kind, id: i ? i.id : null, car: i ? i.car_id : cc, supply: i ? i.supply : null,
      other: i ? (!i.car_id && !!i.car) : !!lbl, label: i ? (i.car_id ? '' : (i.car || '')) : lbl,
      body: i ? (i.body || '') : '', blocking: i ? !!i.blocking : false, files: [], msg: '' };
  }
  function issueForm(f) {
    var h = '<div class="vk-card vk-form"><div class="vk-ftitle">' + (f.kind === 'fault' ? (f.id ? 'Ändra felanmälan' : 'Anmäl fel på bilen') : (f.id ? 'Ändra' : 'Något som behövs till bilen')) + '</div>';
    if (f.kind === 'supply') {
      h += '<div class="vk-field"><span class="vk-lbl">Vad behövs?</span><div class="ank-chips kal-chips bv-chips">' + SUPPLY.map(function (s) {
        return '<button type="button" class="ank-chip bv-sup' + (f.supply === s[0] ? ' on' : '') + '" data-s="' + s[0] + '">' + s[1] + ' ' + s[2] + '</button>';
      }).join('') + '</div></div>';
    }
    h += '<div class="vk-field"><span class="vk-lbl">Bil</span><select id="bv-car">' + carOptions(f.other ? null : f.car, f.kind === 'supply', 'Allmänt / alla bilar', f.other ? 'on' : 'off') + '</select>' +
      (f.other ? '<input id="bv-carlbl" class="kal-input" style="margin-top:6px" maxlength="20" autocapitalize="characters" placeholder="Bilnummer, t.ex. A123" value="' + esc(f.label) + '">' +
        '<div class="vk-foot2">För bilar som inte finns i listan, t.ex. när du kör åt ett annat bolag.</div>' : '') + curHint(f) + '</div>';
    var already = !f.other && f.car ? openFaults(f.car).filter(function (i) { return i.id !== f.id; }) : [];
    if (f.kind === 'fault' && already.length) {
      h += '<div class="vk-warn"><b>Redan anmält på bil ' + esc(carById(f.car) ? carById(f.car).bilnummer : '') + ':</b>' + already.map(function (i) {
        return '<div>• ' + (i.blocking ? '🛑 ' : '') + esc(cut(i.body, 70)) + ' <i>(' + ISTATUS[i.status].toLowerCase() + ')</i></div>';
      }).join('') + '</div>';
    }
    h += '<div class="vk-field"><span class="vk-lbl">' + (f.kind === 'fault' ? 'Vad är fel?' : 'Mer info' + (f.supply === 'annat' ? '' : ' (valfritt)')) + '</span>' +
      '<textarea id="bv-text" maxlength="1000" rows="3" placeholder="' + (f.kind === 'fault' ? 'T.ex. bromsarna tjuter, varningslampa lyser' : 'T.ex. slut på kvittorullar i bilen') + '">' + esc(f.body) + '</textarea></div>';
    if (f.kind === 'fault') {
      h += '<div class="vk-field"><span class="vk-lbl">Går bilen att köra?</span><div class="bv-two">' +
        '<button type="button" class="bv-opt' + (!f.blocking ? ' on' : '') + '" data-b="0">✅ Bilen går att köra</button>' +
        '<button type="button" class="bv-opt stop' + (f.blocking ? ' on' : '') + '" data-b="1">🛑 Bilen står</button></div></div>';
    }
    if (!f.id) h += photoField(f);
    if (f.msg) h += '<div class="vk-warn bad">' + esc(f.msg) + '</div>';
    h += '<div class="pm-btns"><button type="button" id="bv-cancel">Avbryt</button><button type="button" id="bv-save" class="primary"' + (st.busy ? ' disabled' : '') + '>' +
      (st.busy ? 'Skickar…' : f.id ? 'Spara' : 'Skicka') + '</button></div></div>';
    return h;
  }
  function photoField(f) {
    return '<div class="vk-field"><span class="vk-lbl">Foto (valfritt, högst 3)</span>' +
      '<label class="bv-photo-btn">📷 Ta eller välj foto<input type="file" id="bv-file" accept="image/*" capture="environment" hidden></label>' +
      '<div class="bv-thumbs">' + f.files.map(function (u, n) { return '<span class="bv-thumb"><img src="' + u + '" alt=""><button type="button" data-n="' + n + '" aria-label="Ta bort foto">×</button></span>'; }).join('') + '</div></div>';
  }
  function bindPhotoField(body, f, before) {
    var fi = document.getElementById('bv-file');
    if (fi) fi.onchange = function () {
      var file = fi.files && fi.files[0]; if (!file) return;
      if (before) before();
      if (f.files.length >= 3) { f.msg = ERR.too_many_photos; draw(); return; }
      shrink(file).then(function (u) { f.files.push(u); f.msg = ''; draw(); }).catch(function () { f.msg = ERR.bad_image; draw(); });
    };
    body.querySelectorAll('.bv-thumb button').forEach(function (b) { b.onclick = function () { if (before) before(); f.files.splice(+b.dataset.n, 1); draw(); }; });
  }
  function uploadAll(files, key, id) {
    var chain = Promise.resolve(), bad = 0;
    files.forEach(function (u) {
      chain = chain.then(function () { var b = { action: 'upload', image: u.split(',')[1] }; b[key] = id; return photoApi(b).catch(function () { bad++; }); });
    });
    return chain.then(function () { return bad; });
  }
  function bindIssueForm(body) {
    var f = st.f;
    body.querySelectorAll('.bv-sup').forEach(function (b) { b.onclick = function () { f.supply = b.dataset.s; draw(); }; });
    document.getElementById('bv-car').onchange = function (ev) {
      var v = ev.target.value; f.other = v === 'other'; f.car = v && v !== 'other' ? +v : null; draw();
      if (f.other) document.getElementById('bv-carlbl').focus();
    };
    var cl = document.getElementById('bv-carlbl'); if (cl) cl.oninput = function () { f.label = cl.value; };
    document.getElementById('bv-text').oninput = function (ev) { f.body = ev.target.value; };
    body.querySelectorAll('.bv-opt').forEach(function (b) { b.onclick = function () { f.blocking = b.dataset.b === '1'; draw(); }; });
    bindPhotoField(body, f);
    document.getElementById('bv-cancel').onclick = function () { st.f = null; draw(); };
    document.getElementById('bv-save').onclick = saveIssue;
  }
  function saveIssue() {
    var f = st.f;
    var lbl = f.other ? f.label.trim().toUpperCase().replace(/\s+/g, ' ') : '';
    if (f.kind === 'fault' && !f.car && !lbl) { f.msg = ERR.bad_car; draw(); return; }
    if (lbl && !/^[A-ZÅÄÖ0-9][A-ZÅÄÖ0-9 -]{0,19}$/.test(lbl)) { f.msg = ERR.bad_car_label; draw(); return; }
    if (f.kind === 'fault' && !f.body.trim()) { f.msg = 'Skriv vad som är fel.'; draw(); return; }
    if (f.kind === 'supply' && !f.supply) { f.msg = ERR.bad_supply; draw(); return; }
    if (f.kind === 'supply' && f.supply === 'annat' && !f.body.trim()) { f.msg = ERR.need_text; draw(); return; }
    st.busy = true; f.msg = ''; draw();
    var savedId = null;
    rpc('save_car_issue', { p_id: f.id, p_kind: f.kind, p_car_id: f.other ? null : f.car, p_car_label: lbl || null, p_supply: f.supply, p_body: f.body || null, p_blocking: f.blocking })
      .then(function (r) {
        savedId = r.id;
        return uploadAll(f.files, 'issue_id', savedId);
      })
      .then(function (bad) {
        st.busy = false; st.f = null;
        flash(f.id ? 'Ändringen är sparad.' : (f.kind === 'fault' ? (f.blocking ? 'Skickat! Ägaren har fått en notis.' : 'Felanmälan skickad. Tack!') : 'Skickat. Tack!') +
          (bad ? ' (' + bad + ' foto kunde inte sparas)' : ''));
        return load();
      })
      .catch(function (e) { st.busy = false; if (fail(e)) return; f.msg = errText(e); draw(); });
  }
  function setStatus(i, s) {
    var c = prompt((s === 'klar' ? 'Markera som klar.' : s === 'pagar' ? 'Markera som pågår.' : 'Öppna igen.') + ' Kommentar (valfri):', '');
    if (c === null) return;
    rpc('set_car_issue_status', { p_id: i.id, p_status: s, p_comment: c || null })
      .then(function () { flash('Status: ' + ISTATUS[s] + '.'); return load(); })
      .catch(function (e) { if (!fail(e)) alert(errText(e)); });
  }
  function delIssue(i) {
    if (!confirm('Ta bort den här anmälan helt?')) return;
    photoApi({ action: 'delete_issue', issue_id: i.id }).then(function () { flash('Borttagen.'); return load(); })
      .catch(function (e) { if (!fail(e)) alert(errText(e)); });
  }
  function addPhoto(i, key) {
    key = key || 'issue_id';
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
    inp.onchange = function () {
      var file = inp.files && inp.files[0]; if (!file) return;
      flash('Skickar foto…'); draw();
      shrink(file).then(function (u) { var b = { action: 'upload', image: u.split(',')[1] }; b[key] = i.id; return photoApi(b); })
        .then(function () { delete st.photos[pk(key, i.id)]; flash('Fotot är sparat.'); return load(); })
        .catch(function (e) { if (!fail(e)) { flashMsg = ''; alert(errText(e)); draw(); } });
    };
    inp.click();
  }
  function pk(key, id) { return (key === 'maint_id' ? 'm' : '') + id; }
  function showPhotos(i, key) {
    key = key || 'issue_id'; var k = pk(key, i.id), b = { action: 'list' }; b[key] = i.id;
    st.photos[k] = 'loading'; draw();
    photoApi(b).then(function (r) { st.photos[k] = r.photos || []; draw(); })
      .catch(function (e) { if (!fail(e)) { st.photos[k] = null; alert('Kunde inte visa fotona.'); draw(); } });
  }
  function photoBlock(key, id) {
    var ph = st.photos[pk(key, id)];
    if (ph === 'loading') return '<div class="vk-imeta">Hämtar foton…</div>';
    if (ph && ph.length) return '<div class="bv-thumbs big">' + ph.map(function (p) { return p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.url) + '" alt="Foto"></a>' : ''; }).join('') + '</div>';
    return '';
  }
  function startHours(i) {
    st.tab = 'timmar'; localStorage.setItem('bil_tab', 'timmar');
    st.form = newForm(null); st.form.car = i.car_id; st.form.issue = i.id;
    draw(); window.scrollTo(0, 0);
  }
  function issueCard(i) {
    var c = carById(i.car_id), sup = SUPPLY.filter(function (s) { return s[0] === i.supply; })[0];
    var h = '<div class="vk-card bv-issue' + (i.blocking && i.status !== 'klar' ? ' stop' : '') + (i.status === 'klar' ? ' done' : '') + '">' +
      '<div class="vk-ihead"><span class="vk-when">' + (i.kind === 'supply' ? (sup ? sup[1] + ' ' + sup[2] : 'Behövs') + ' · ' : '') +
      (i.car ? 'Bil ' + esc(i.car) : 'Alla bilar') + (c && c.modell ? ' <small>' + esc(cut(c.modell, 20)) + '</small>' : '') + '</span>' +
      '<span class="bv-st ' + i.status + '">' + ISTATUS[i.status] + '</span></div>';
    if (i.blocking && i.status !== 'klar') h += '<div class="bv-stopline">🛑 Bilen står</div>';
    if (i.body) h += '<div class="bv-text">' + esc(i.body) + '</div>';
    h += '<div class="vk-imeta">' + esc(when(i.created_at)) + (i.mine ? ' · av dig' : i.reporter ? ' · av ' + esc(i.reporter_name ? i.reporter_name + ' (' + i.reporter + ')' : i.reporter) : '') +
      (i.photos ? ' · 📷 ' + i.photos : '') + (i.workshop_min ? ' · ⏱️ ' + dur(i.workshop_min) + ' verkstad' : '') + '</div>';
    if (i.status_comment) h += '<div class="vk-boss">' + esc(i.status_comment) + '</div>';
    var ph = st.photos[i.id];
    h += photoBlock('issue_id', i.id) + taskLinks(i.tasks);
    var act = [];
    if (i.photos && !ph) act.push('<button type="button" data-a="photos">📷 Visa foto</button>');
    if (i.kind === 'fault' && i.status !== 'klar') act.push('<button type="button" data-a="hours">⏱️ Verkstadstid</button>');
    if (admin()) {
      if (i.status === 'ny') act.push('<button type="button" class="bv-pagar" data-a="pagar">Pågår</button>');
      if (i.status !== 'klar') act.push('<button type="button" class="kal-ok" data-a="klar">✓ Klar</button>');
      else act.push('<button type="button" data-a="ny">Öppna igen</button>');
      if (i.status !== 'klar') act.push('<button type="button" class="bv-send" data-a="task">📋 Skicka som uppgift</button>');
    }
    var mayEdit = admin() || (i.mine && i.status === 'ny');
    if (mayEdit && i.photos < 3 && i.status !== 'klar') act.push('<button type="button" data-a="addphoto">📷 +</button>');
    if (mayEdit && i.status !== 'klar') act.push('<button type="button" data-a="edit">Ändra</button>');
    if (mayEdit) act.push('<button type="button" class="vk-del" data-a="del">Ta bort</button>');
    if (act.length) h += '<div class="vk-iact bv-act" data-id="' + i.id + '">' + act.join('') + '</div>';
    return h + '</div>';
  }
  function drawIssues(body, kind) {
    var h = '';
    if (flashMsg) h += '<div id="vk-flash" class="vk-flash">' + esc(flashMsg) + '</div>';
    h += '<div class="vk-ltitle">' + (kind === 'fault' ? 'Felanmälan' : 'Behövs till bilen') + '</div>';
    if (kind === 'fault') h += carsCard();
    if (st.f && st.f.kind === kind) h += issueForm(st.f);
    else h += '<button type="button" id="bv-new" class="vk-new">' + (kind === 'fault' ? '＋ Anmäl fel' : '＋ Något behövs') + '</button>';
    var all = (st.bil.issues || []).filter(function (i) { return i.kind === kind && (kind !== 'fault' || !st.car || i.car_id === st.car); });
    var open = all.filter(function (i) { return i.status !== 'klar'; }), done = all.filter(function (i) { return i.status === 'klar'; });
    if (kind === 'fault' && st.car) h += '<div class="bv-filter">Visar bil ' + esc((carById(st.car) || {}).bilnummer) + ' <button type="button" id="bv-allcars">Visa alla</button></div>';
    h += '<div class="vk-ltitle">Öppna (' + open.length + ')</div>';
    if (!open.length) h += '<div class="tl-msg">' + (kind === 'fault' ? 'Inga öppna fel. 👍' : 'Inget som behövs just nu.') + '</div>';
    open.forEach(function (i) { h += issueCard(i); });
    if (done.length) {
      h += '<button type="button" class="ank-more" id="bv-done">' + (st.showDone ? 'Dölj klara' : 'Visa klara (' + done.length + ')') + '</button>';
      if (st.showDone) done.forEach(function (i) { h += issueCard(i); });
    }
    h += '<div class="tl-foot">' + (admin()
      ? 'Du som ägare (och S admin) ser alla förares anmälningar. Varje förare ser bara sina egna. Du kan ändra status eller skicka en anmälan vidare som uppgift till en förare. "Bilen står" hamnar alltid överst.'
      : 'Bara du och ägaren ser dina anmälningar. Ägaren ändrar status (Ny → Pågår → Klar). Du kan ändra eller ta bort så länge den är Ny.') + '</div>';
    body.innerHTML = h;
    bindCars(body);
    var nb = document.getElementById('bv-new'); if (nb) nb.onclick = function () { st.f = newIssue(kind, null); draw(); };
    var ac = document.getElementById('bv-allcars'); if (ac) ac.onclick = function () { st.car = null; draw(); };
    var sd = document.getElementById('bv-done'); if (sd) sd.onclick = function () { st.showDone = !st.showDone; draw(); };
    body.querySelectorAll('.bv-act button').forEach(function (b) {
      b.onclick = function () {
        var id = +b.parentNode.dataset.id, i = all.filter(function (x) { return x.id === id; })[0]; if (!i) return;
        var a = b.dataset.a;
        if (a === 'pagar' || a === 'klar' || a === 'ny') setStatus(i, a);
        else if (a === 'edit') { st.f = newIssue(kind, i); draw(); window.scrollTo(0, 0); }
        else if (a === 'del') delIssue(i);
        else if (a === 'photos') showPhotos(i);
        else if (a === 'addphoto') addPhoto(i);
        else if (a === 'hours') startHours(i);
        else if (a === 'task') startTask({ issue: i });
      };
    });
    if (st.f && st.f.kind === kind) bindIssueForm(body);
  }

  // ---------- underhåll ----------
  function mLabel(t) { var m = MTYPES.filter(function (x) { return x[0] === t; })[0]; return m ? m[1] + ' ' + m[2] : t; }
  function newMaint(m, suggest) {
    return { id: m ? m.id : null, suggest: !!suggest, car: m ? m.car_id : (st.car || (suggest ? curCar() : null)), type: m ? m.type : 'service', title: m ? (m.title || '') : '',
      due_date: m ? (m.due_date || '') : '', due_km: m && m.due_km != null ? String(m.due_km) : '', im: m && m.interval_months ? String(m.interval_months) : '',
      ikm: m && m.interval_km ? String(m.interval_km) : '', note: m ? (m.note || '') : '', files: [], msg: '' };
  }
  function num(s) { s = String(s || '').replace(/\s/g, ''); return s === '' ? null : (/^\d+$/.test(s) ? +s : NaN); }
  function maintForm(f) {
    var h = '<div class="vk-card vk-form"><div class="vk-ftitle">' + (f.suggest ? 'Föreslå underhåll' : f.id ? 'Ändra underhåll' : 'Planera underhåll') + '</div>';
    h += '<div class="vk-field"><span class="vk-lbl">Bil</span><select id="bm-car">' + carOptions(f.car) + '</select></div>';
    h += '<div class="vk-field"><span class="vk-lbl">Vad?</span><div class="ank-chips kal-chips bv-chips">' + MTYPES.map(function (t) {
      return '<button type="button" class="ank-chip bm-type' + (f.type === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + ' ' + t[2] + '</button>';
    }).join('') + '</div></div>';
    if (f.type === 'annat') h += '<div class="vk-field"><span class="vk-lbl">Namn</span><input id="bm-title" class="kal-input" maxlength="80" placeholder="T.ex. byta torkarblad" value="' + esc(f.title) + '"></div>';
    if (!f.suggest) {
      h += '<div class="vk-field"><span class="vk-lbl">Senast datum och/eller km</span><div class="bv-two">' +
        '<input id="bm-date" type="date" class="kal-input" value="' + esc(f.due_date) + '">' +
        '<input id="bm-km" class="kal-input" inputmode="numeric" placeholder="km, t.ex. 60000" value="' + esc(f.due_km) + '"></div></div>';
      h += '<div class="vk-field"><span class="vk-lbl">Upprepa (valfritt) – används när du markerar klar</span><div class="bv-two">' +
        '<input id="bm-im" class="kal-input" inputmode="numeric" placeholder="var … månad" value="' + esc(f.im) + '">' +
        '<input id="bm-ikm" class="kal-input" inputmode="numeric" placeholder="var … km" value="' + esc(f.ikm) + '"></div></div>';
    }
    h += '<div class="vk-field"><span class="vk-lbl">' + (f.suggest ? 'Varför? (valfritt)' : 'Anteckning (valfri)') + '</span><textarea id="bm-note" maxlength="500" rows="2" placeholder="' +
      (f.suggest ? 'T.ex. däckmönstret är slitet' : 'T.ex. bokat hos verkstaden') + '">' + esc(f.note) + '</textarea></div>';
    if (f.suggest && !f.id) h += photoField(f);
    if (f.msg) h += '<div class="vk-warn bad">' + esc(f.msg) + '</div>';
    h += '<div class="pm-btns"><button type="button" id="bm-cancel">Avbryt</button><button type="button" id="bm-save" class="primary"' + (st.busy ? ' disabled' : '') + '>' +
      (f.suggest ? 'Skicka förslag' : 'Spara') + '</button></div></div>';
    return h;
  }
  function bindMaintForm(body) {
    var f = st.f, g = function (id) { return document.getElementById(id); };
    function sync() {
      if (g('bm-title')) f.title = g('bm-title').value;
      if (g('bm-date')) { f.due_date = g('bm-date').value; f.due_km = g('bm-km').value; f.im = g('bm-im').value; f.ikm = g('bm-ikm').value; }
      f.note = g('bm-note').value;
    }
    g('bm-car').onchange = function (ev) { sync(); f.car = ev.target.value ? +ev.target.value : null; };
    body.querySelectorAll('.bm-type').forEach(function (b) { b.onclick = function () { sync(); f.type = b.dataset.t; draw(); }; });
    bindPhotoField(body, f, sync);
    g('bm-cancel').onclick = function () { st.f = null; draw(); };
    g('bm-save').onclick = function () {
      sync();
      if (!f.car) { f.msg = ERR.bad_car; draw(); return; }
      if (f.type === 'annat' && !f.title.trim()) { f.msg = 'Skriv vad det gäller.'; draw(); return; }
      var dk = num(f.due_km), im = num(f.im), ikm = num(f.ikm);
      if ([dk, im, ikm].some(function (x) { return x !== null && isNaN(x); })) { f.msg = 'Skriv bara siffror i km och intervall.'; draw(); return; }
      if (!f.suggest && !f.due_date && dk === null) { f.msg = ERR.need_due; draw(); return; }
      st.busy = true; f.msg = ''; draw();
      rpc('save_car_maintenance', { p_id: f.id, p_car_id: f.car, p_type: f.type, p_title: f.type === 'annat' ? f.title : null,
        p_due_date: f.suggest ? null : (f.due_date || null), p_due_km: f.suggest ? null : dk, p_interval_months: f.suggest ? null : im,
        p_interval_km: f.suggest ? null : ikm, p_note: f.note || null })
        .then(function (r) { return f.suggest && f.files.length && r && r.id ? uploadAll(f.files, 'maint_id', r.id) : 0; })
        .then(function (bad) { st.busy = false; st.f = null; flash((f.suggest ? 'Förslaget är skickat till ägaren.' : 'Sparat.') + (bad ? ' (' + bad + ' foto kunde inte sparas)' : '')); return load(); })
        .catch(function (e) { st.busy = false; if (fail(e)) return; f.msg = errText(e); draw(); });
    };
  }
  function dueText(m) {
    var a = [];
    if (m.due_date) a.push(dateSv(m.due_date));
    if (m.due_km != null) a.push(km(m.due_km));
    return a.length ? 'Senast ' + a.join(' eller ') : '';
  }
  function doneForm(m) {
    var f = st.mDone, nx = [];
    if (m.interval_months) nx.push('om ' + m.interval_months + ' mån');
    if (m.interval_km) nx.push('+' + km(m.interval_km));
    return '<div class="bv-done">' +
      '<div class="vk-field"><span class="vk-lbl">Datum</span><input id="bd-date" type="date" class="kal-input" value="' + esc(f.date) + '"></div>' +
      '<div class="bv-two"><div class="vk-field"><span class="vk-lbl">Mätarställning (km)</span><input id="bd-km" class="kal-input" inputmode="numeric" value="' + esc(f.km) + '"></div>' +
      '<div class="vk-field"><span class="vk-lbl">Kostnad kr (valfri)</span><input id="bd-cost" class="kal-input" inputmode="decimal" value="' + esc(f.cost) + '"></div></div>' +
      '<div class="vk-field"><span class="vk-lbl">Kommentar (valfri)</span><input id="bd-com" class="kal-input" maxlength="500" value="' + esc(f.com) + '"></div>' +
      (nx.length ? '<label class="bv-check"><input type="checkbox" id="bd-next"' + (f.next ? ' checked' : '') + '> Planera nästa (' + nx.join(' / ') + ')</label>' : '') +
      (f.msg ? '<div class="vk-warn bad">' + esc(f.msg) + '</div>' : '') +
      '<div class="pm-btns"><button type="button" id="bd-cancel">Avbryt</button><button type="button" id="bd-save" class="primary">Markera klar</button></div></div>';
  }
  function saveDone(m) {
    var f = st.mDone, g = function (id) { return document.getElementById(id); };
    f.date = g('bd-date').value; f.km = g('bd-km').value; f.cost = g('bd-cost').value; f.com = g('bd-com').value; f.next = g('bd-next') ? g('bd-next').checked : false;
    var k = num(f.km), cost = String(f.cost || '').replace(/\s/g, '').replace(',', '.');
    if (!f.date) { f.msg = ERR.bad_date; draw(); return; }
    if (k !== null && isNaN(k)) { f.msg = ERR.bad_km; draw(); return; }
    if (cost && isNaN(+cost)) { f.msg = ERR.bad_cost; draw(); return; }
    rpc('done_car_maintenance', { p_id: m.id, p_done_date: f.date, p_done_km: k, p_cost: cost ? +cost : null, p_comment: f.com || null, p_next: !!f.next })
      .then(function (r) { st.mDone = null; flash(r && r.next ? 'Klart! Nästa är planerad.' : 'Markerad som klar.'); return load(); })
      .catch(function (e) { if (fail(e)) return; f.msg = errText(e); draw(); });
  }
  function maintCard(m) {
    var c = carById(m.car_id), lv = m.status === 'plan' ? m.level : 0;
    var h = '<div class="vk-card bv-m' + (lv === 2 ? ' late' : lv === 1 ? ' soon' : '') + (m.status === 'klar' ? ' done' : '') + '">' +
      '<div class="vk-ihead"><span class="vk-when">' + esc(m.type === 'annat' ? '✏️ ' + m.label : mLabel(m.type)) + ' · Bil ' + esc(c ? c.bilnummer : '?') + '</span>' +
      (m.status === 'forslag' ? '<span class="bv-b soon">💡 Förslag</span>' : m.status === 'klar' ? '<span class="bv-st klar">Klar</span>' :
        lv === 2 ? '<span class="bv-b stop">Försenad</span>' : lv === 1 ? '<span class="bv-b soon">Snart</span>' : '') + '</div>';
    if (m.status === 'klar') {
      h += '<div class="vk-imeta">Gjort ' + dateSv(m.done_date) + (m.done_km != null ? ' vid ' + km(m.done_km) : '') + (m.cost != null ? ' · ' + kr(m.cost) : '') + '</div>';
      if (m.done_comment) h += '<div class="vk-icom">💬 ' + esc(m.done_comment) + '</div>';
    } else {
      var dt = dueText(m); if (dt) h += '<div class="vk-imeta">' + esc(dt) + (c && c.km != null ? ' · nu ' + km(c.km) : '') + '</div>';
      if (m.interval_months || m.interval_km) h += '<div class="vk-imeta">Upprepas ' + [m.interval_months ? 'var ' + m.interval_months + ' mån' : '', m.interval_km ? 'var ' + km(m.interval_km) : ''].filter(Boolean).join(' eller ') + '</div>';
    }
    if (m.note) h += '<div class="vk-icom">📝 ' + esc(m.note) + '</div>';
    if (m.suggested_name && m.status === 'forslag') h += '<div class="vk-imeta">Förslag från ' + esc(m.suggested_name) + '</div>';
    h += photoBlock('maint_id', m.id) + taskLinks(m.tasks);
    if (st.mDone && st.mDone.id === m.id) return h + doneForm(m) + '</div>';
    var act = [], ph = st.photos['m' + m.id];
    if (m.photos && !ph) act.push('<button type="button" data-a="photos">📷 Visa foto (' + m.photos + ')</button>');
    if (m.status === 'forslag' && m.mine && m.photos < 3) act.push('<button type="button" data-a="addphoto">📷 +</button>');
    if (admin() && m.status !== 'klar') act.push('<button type="button" class="bv-send" data-a="task">📋 Skicka som uppgift</button>');
    if (admin() && m.status === 'plan') act.push('<button type="button" class="kal-ok" data-a="done">✓ Klar</button>');
    if (admin() && m.status === 'forslag') act.push('<button type="button" class="kal-ok" data-a="edit">Planera</button>');
    if (admin() && m.status === 'plan') act.push('<button type="button" data-a="edit">Ändra</button>');
    if (admin() && m.status !== 'klar' || (!admin() && m.status === 'forslag' && m.mine)) act.push('<button type="button" class="vk-del" data-a="del">Ta bort</button>');
    if (act.length) h += '<div class="vk-iact bm-act" data-id="' + m.id + '">' + act.join('') + '</div>';
    return h + '</div>';
  }
  function setKm(c) {
    var v = prompt('Mätarställning för bil ' + c.bilnummer + ' (km):', c.km != null ? c.km : '');
    if (v === null) return;
    var k = num(v); if (k === null || isNaN(k)) { alert(ERR.bad_km); return; }
    rpc('save_car_km', { p_car_id: c.id, p_km: k }).then(function () { flash('Mätarställningen är sparad.'); return load(); })
      .catch(function (e) { if (!fail(e)) alert(errText(e)); });
  }
  function drawMaint(body) {
    var h = '';
    if (flashMsg) h += '<div id="vk-flash" class="vk-flash">' + esc(flashMsg) + '</div>';
    h += '<div class="vk-ltitle">Underhåll</div>' + carsCard();
    if (st.car) {
      var c = carById(st.car);
      if (c) h += '<div class="vk-card bv-km"><span>Bil ' + esc(c.bilnummer) + ': ' + (c.km != null ? '<b>' + km(c.km) + '</b> <small>(' + esc(when(c.km_at)) + ')</small>' : 'ingen mätarställning än') +
        '</span><button type="button" id="bv-setkm">Ange km</button></div>';
      h += '<div class="bv-filter">Visar bil ' + esc(c ? c.bilnummer : '') + ' <button type="button" id="bv-allcars">Visa alla</button></div>';
    } else h += '<div class="bv-filter">Tryck på en bil för att se den och ange mätarställning.</div>';
    if (st.f && st.f.kind === 'maint') h += maintForm(st.f);
    else h += admin() ? '<button type="button" id="bm-new" class="vk-new">＋ Planera underhåll</button>'
      : '<button type="button" id="bm-sug" class="vk-new">💡 Föreslå underhåll (t.ex. dags för service)</button>';
    var all = (st.bil.maint || []).filter(function (m) { return !st.car || m.car_id === st.car; });
    var sug = all.filter(function (m) { return m.status === 'forslag'; });
    var plan = all.filter(function (m) { return m.status === 'plan'; }).sort(function (a, b) { return (b.level - a.level) || String(a.due_date || '9').localeCompare(String(b.due_date || '9')); });
    var done = all.filter(function (m) { return m.status === 'klar'; });
    if (sug.length) { h += '<div class="vk-ltitle">Förslag från förare (' + sug.length + ')</div>'; sug.forEach(function (m) { h += maintCard(m); }); }
    h += '<div class="vk-ltitle">Planerat (' + plan.length + ')</div>';
    if (!plan.length) h += '<div class="tl-msg">Inget planerat underhåll.</div>';
    plan.forEach(function (m) { h += maintCard(m); });
    if (done.length) {
      h += '<button type="button" class="ank-more" id="bv-done">' + (st.showDone ? 'Dölj gjort' : 'Visa gjort senaste året (' + done.length + ')') + '</button>';
      if (st.showDone) done.forEach(function (m) { h += maintCard(m); });
    }
    h += '<div class="tl-foot">"Snart" = inom 14 dagar eller 1 000 km. "Försenad" = datum eller km har passerats. ' +
      (admin() ? 'Du får en notis när något blir snart eller försenat.' : 'Här ser du bara dina egna förslag. Ange gärna mätarställningen så att km-påminnelserna stämmer.') + '</div>';
    body.innerHTML = h;
    bindCars(body);
    var g = function (id) { return document.getElementById(id); };
    if (g('bv-setkm')) g('bv-setkm').onclick = function () { setKm(carById(st.car)); };
    if (g('bv-allcars')) g('bv-allcars').onclick = function () { st.car = null; draw(); };
    if (g('bv-done')) g('bv-done').onclick = function () { st.showDone = !st.showDone; draw(); };
    if (g('bm-new')) g('bm-new').onclick = function () { st.f = newMaint(null, false); st.f.kind = 'maint'; draw(); };
    if (g('bm-sug')) g('bm-sug').onclick = function () { st.f = newMaint(null, true); st.f.kind = 'maint'; draw(); };
    body.querySelectorAll('.bm-act button').forEach(function (b) {
      b.onclick = function () {
        var id = +b.parentNode.dataset.id, m = all.filter(function (x) { return x.id === id; })[0]; if (!m) return;
        if (b.dataset.a === 'edit') { st.f = newMaint(m, false); st.f.kind = 'maint'; draw(); window.scrollTo(0, 0); }
        else if (b.dataset.a === 'photos') showPhotos(m, 'maint_id');
        else if (b.dataset.a === 'addphoto') addPhoto(m, 'maint_id');
        else if (b.dataset.a === 'task') startTask({ maint: m });
        else if (b.dataset.a === 'done') {
          var cc = carById(m.car_id);
          st.mDone = { id: m.id, date: ymd(new Date()), km: cc && cc.km != null ? String(cc.km) : '', cost: '', com: '', next: !!(m.interval_months || m.interval_km), msg: '' }; draw();
        } else if (b.dataset.a === 'del') {
          if (!confirm('Ta bort?')) return;
          (m.photos ? photoApi({ action: 'delete_maint', maint_id: m.id }) : rpc('delete_car_maintenance', { p_id: m.id })).then(function () { flash('Borttaget.'); return load(); })
            .catch(function (e) { if (!fail(e)) alert(errText(e)); });
        }
      };
    });
    if (st.mDone && g('bd-save')) {
      var dm = all.filter(function (x) { return x.id === st.mDone.id; })[0];
      g('bd-cancel').onclick = function () { st.mDone = null; draw(); };
      g('bd-save').onclick = function () { saveDone(dm); };
    }
    if (st.f && st.f.kind === 'maint') bindMaintForm(body);
  }

  // ---------- uppgifter (ägaren → förare) ----------
  function taskLinks(list) {
    if (!list || !list.length) return '';
    return list.map(function (t) {
      return '<div class="bv-tlink">📋 Uppgift till ' + esc(t.name) + ' <span class="bv-st ' + tcls(t.status) + '">' + TSTATUS[t.status] + '</span></div>';
    }).join('');
  }
  function tcls(s) { return s === 'bokad' ? 'pagar' : s; }
  function supLabel(k) { var x = SUPPLY.filter(function (s) { return s[0] === k; })[0]; return x ? x[2] : 'Behövs'; }
  function startTask(o) {
    var i = o.issue, m = o.maint, t = o.task;
    var f = { id: null, issue: null, maint: null, car: st.car || null, to: '', title: '', ins: '', items: [{ text: '' }], msg: '', link: '' };
    if (t) {
      f = { id: t.id, issue: t.issue ? t.issue.id : null, maint: t.maint ? t.maint.id : null, car: t.car_id, to: t.assigned_to, title: t.title,
        ins: t.instruction || '', items: (t.items || []).map(function (x) { return { id: x.id, text: x.text }; }), msg: '', link: linkText(t.issue, t.maint) };
      if (!f.items.length) f.items.push({ text: '' });
    } else if (i) {
      f.issue = i.id; f.car = i.car_id;
      f.title = i.kind === 'fault' ? 'Åtgärda fel' + (i.car ? ' på bil ' + i.car : '') : supLabel(i.supply) + (i.car ? ' till bil ' + i.car : '');
      f.items = i.kind === 'fault' ? [{ text: 'Boka tid på verkstad' }, { text: 'Lämna bilen' }, { text: 'Felet är åtgärdat' }] : [{ text: 'Fixat' }];
      f.link = linkText(i, null);
    } else if (m) {
      f.maint = m.id; f.car = m.car_id;
      f.title = (m.type === 'annat' ? m.label : mLabel(m.type).replace(/^\S+\s/, '')) + ' – bil ' + ((carById(m.car_id) || {}).bilnummer || '');
      f.items = [{ text: 'Boka tid' }, { text: 'Utfört' }];
      f.link = linkText(null, m);
    }
    st.tf = f; st.tr = null; st.tab = 'uppg'; localStorage.setItem('bil_tab', 'uppg'); draw(); window.scrollTo(0, 0);
  }
  function linkText(i, m) {
    if (i) return (i.kind === 'fault' ? (i.blocking ? '🛑 ' : '⚠️ ') + 'Felanmälan: ' : '🧴 ' + supLabel(i.supply) + ': ') + cut(i.body || '', 80);
    if (m) return '🔧 Underhåll: ' + (m.label || m.type) + (m.note ? ' – ' + cut(m.note, 60) : '');
    return '';
  }
  function driverOptions(sel) {
    return '<option value="">Välj förare…</option>' + ((st.bil && st.bil.drivers) || []).map(function (d) {
      return '<option value="' + esc(d.id) + '"' + (d.id === sel ? ' selected' : '') + '>' + esc(d.name) + ' (' + esc(d.id) + ')</option>';
    }).join('');
  }
  function taskForm(f) {
    var h = '<div class="vk-card vk-form"><div class="vk-ftitle">' + (f.id ? 'Ändra uppgift' : 'Skicka uppgift till en förare') + '</div>';
    if (f.link) h += '<div class="bv-tlink big">🔗 ' + esc(f.link) + '</div>';
    h += '<div class="vk-field"><span class="vk-lbl">Till förare</span><select id="bt-to">' + driverOptions(f.to) + '</select></div>';
    if (!f.issue && !f.maint) h += '<div class="vk-field"><span class="vk-lbl">Bil (valfritt)</span><select id="bt-car">' + carOptions(f.car, true, 'Ingen särskild bil') + '</select></div>';
    h += '<div class="vk-field"><span class="vk-lbl">Rubrik</span><input id="bt-title" class="kal-input" maxlength="120" placeholder="T.ex. Byt till vinterdäck" value="' + esc(f.title) + '"></div>';
    h += '<div class="vk-field"><span class="vk-lbl">Instruktion (valfri)</span><textarea id="bt-ins" maxlength="1000" rows="3" placeholder="T.ex. Boka tid hos däckfirman och skriv in tiden här.">' + esc(f.ins) + '</textarea></div>';
    h += '<div class="vk-field"><span class="vk-lbl">Checklista (valfri, högst 15)</span><div id="bt-items">' + f.items.map(function (x, n) {
      return '<div class="bt-irow"><input class="kal-input bt-itext" data-n="' + n + '" maxlength="200" placeholder="Punkt ' + (n + 1) + '" value="' + esc(x.text) + '">' +
        '<button type="button" class="bt-idel" data-n="' + n + '" aria-label="Ta bort punkt">×</button></div>';
    }).join('') + '</div>' + (f.items.length < 15 ? '<button type="button" id="bt-iadd" class="bt-iadd">＋ Lägg till punkt</button>' : '') + '</div>';
    if (f.msg) h += '<div class="vk-warn bad">' + esc(f.msg) + '</div>';
    h += '<div class="vk-foot2">Föraren får en notis i appen och ser ' + (f.issue || f.maint ? 'anmälan, fotona och ' : '') + 'instruktionen.</div>';
    h += '<div class="pm-btns"><button type="button" id="bt-cancel">Avbryt</button><button type="button" id="bt-save" class="primary"' + (st.busy ? ' disabled' : '') + '>' +
      (st.busy ? 'Skickar…' : f.id ? 'Spara' : 'Skicka uppgift') + '</button></div></div>';
    return h;
  }
  function bindTaskForm(body) {
    var f = st.tf, g = function (id) { return document.getElementById(id); };
    function sync() {
      f.to = g('bt-to').value; if (g('bt-car')) f.car = g('bt-car').value ? +g('bt-car').value : null;
      f.title = g('bt-title').value; f.ins = g('bt-ins').value;
      body.querySelectorAll('.bt-itext').forEach(function (x) { f.items[+x.dataset.n].text = x.value; });
    }
    body.querySelectorAll('.bt-idel').forEach(function (b) { b.onclick = function () { sync(); f.items.splice(+b.dataset.n, 1); if (!f.items.length) f.items.push({ text: '' }); draw(); }; });
    if (g('bt-iadd')) g('bt-iadd').onclick = function () { sync(); f.items.push({ text: '' }); draw(); var l = body.querySelectorAll('.bt-itext'); if (l.length) l[l.length - 1].focus(); };
    g('bt-cancel').onclick = function () { st.tf = null; draw(); };
    g('bt-save').onclick = function () {
      sync();
      if (!f.to) { f.msg = ERR.bad_driver; draw(); return; }
      if (!f.title.trim()) { f.msg = 'Skriv en rubrik.'; draw(); return; }
      var items = f.items.filter(function (x) { return x.text.trim(); }).map(function (x) { return x.id ? { id: x.id, text: x.text.trim() } : { text: x.text.trim() }; });
      st.busy = true; f.msg = ''; draw();
      rpc('save_car_task', { p_id: f.id, p_issue_id: f.issue, p_maint_id: f.maint, p_car_id: f.car, p_assigned_to: f.to, p_title: f.title.trim(),
        p_instruction: f.ins.trim() || null, p_items: items })
        .then(function (r) { st.busy = false; st.tf = null; flash(f.id ? 'Uppgiften är sparad.' : 'Uppgiften är skickad till ' + (r && r.assigned_name || 'föraren') + '.'); return load(); })
        .catch(function (e) { st.busy = false; if (fail(e)) return; f.msg = errText(e); draw(); });
    };
  }
  var LOGTXT = { skapad: 'Skapad', flyttad: 'Flyttad', andrad: 'Ändrad', bokad: 'Bokad tid', svar: 'Svar', bockad: 'Bockade av', obockad: 'Tog bort bock', klar: 'Klar' };
  function replyForm(t) {
    var f = st.tr;
    return '<div class="bv-done"><div class="vk-ftitle">Svara ägaren</div>' +
      '<div class="bv-two"><div class="vk-field"><span class="vk-lbl">Bokad dag</span><input id="br-date" type="date" class="kal-input" value="' + esc(f.date) + '"></div>' +
      '<div class="vk-field"><span class="vk-lbl">Tid</span><input id="br-time" type="time" class="kal-input" value="' + esc(f.time) + '"></div></div>' +
      '<div class="vk-field"><span class="vk-lbl">Var? (valfritt)</span><input id="br-place" class="kal-input" maxlength="200" placeholder="T.ex. Däckmästarn, Industrigatan 4" value="' + esc(f.place) + '"></div>' +
      '<div class="vk-field"><span class="vk-lbl">Meddelande (valfritt)</span><textarea id="br-reply" maxlength="500" rows="2" placeholder="T.ex. Lämnar bilen kl 7">' + esc(f.reply) + '</textarea></div>' +
      (f.msg ? '<div class="vk-warn bad">' + esc(f.msg) + '</div>' : '') +
      '<div class="pm-btns"><button type="button" id="br-cancel">Avbryt</button><button type="button" id="br-save" class="primary">Skicka svar</button></div></div>';
  }
  function taskCard(t) {
    var me = t.mine, own = admin(), open = t.status !== 'klar', items = t.items || [];
    var nd = items.filter(function (x) { return x.done; }).length;
    var h = '<div class="vk-card bv-task' + (open ? '' : ' done') + (me && open ? ' mine' : '') + '" id="bt-' + t.id + '">' +
      '<div class="vk-ihead"><span class="vk-when">📋 ' + esc(t.title) + (t.car ? ' <small>· Bil ' + esc(t.car) + '</small>' : '') + '</span>' +
      '<span class="bv-st ' + tcls(t.status) + '">' + TSTATUS[t.status] + '</span></div>';
    h += '<div class="vk-imeta">' + (own ? 'Till ' + esc(me ? 'dig' : t.assigned_name) + ' · ' : 'Från ägaren · ') + esc(when(t.created_at)) + '</div>';
    if (t.instruction) h += '<div class="bv-text">' + esc(t.instruction) + '</div>';
    if (t.issue || t.maint) {
      var lk = t.issue ? 'issue_id' : 'maint_id', lo = t.issue || t.maint;
      h += '<div class="bv-tlink big">🔗 ' + esc(linkText(t.issue, t.maint)) + (lo.photos ? ' · 📷 ' + lo.photos : '') + '</div>';
      h += photoBlock(lk, lo.id);
    }
    if (t.booked_at || t.booked_place || t.reply) {
      h += '<div class="bv-booked">' + (t.booked_at ? '📅 <b>Bokad ' + esc(when(t.booked_at)) + '</b>' : '💬 Svar') +
        (t.booked_place ? '<div>📍 ' + esc(t.booked_place) + '</div>' : '') + (t.reply ? '<div>💬 ' + esc(t.reply) + '</div>' : '') + '</div>';
    }
    if (items.length) {
      var can = open && (me || own);
      h += '<div class="bt-list"><div class="vk-imeta">Checklista: ' + nd + ' av ' + items.length + ' klara</div>' + items.map(function (x) {
        return '<label class="bv-check bt-check' + (x.done ? ' on' : '') + '"><input type="checkbox" class="bt-item" data-id="' + x.id + '"' + (x.done ? ' checked' : '') + (can ? '' : ' disabled') + '> ' + esc(x.text) + '</label>';
      }).join('') + '</div>';
    }
    if (!open) h += '<div class="vk-boss">✅ Klar ' + esc(when(t.done_at)) + (t.done_name ? ' av ' + esc(t.done_name) : '') + '</div>';
    if (st.tr && st.tr.id === t.id) h += replyForm(t);
    else {
      var act = [], lo2 = t.issue || t.maint;
      if (lo2 && lo2.photos && !st.photos[pk(t.issue ? 'issue_id' : 'maint_id', lo2.id)]) act.push('<button type="button" data-a="photos">📷 Visa foto</button>');
      if (open && me) act.push('<button type="button" class="bv-pagar" data-a="reply">📅 ' + (t.booked_at ? 'Ändra tid' : 'Svara / boka tid') + '</button>');
      if (open && (me || own)) act.push('<button type="button" class="kal-ok" data-a="done">✓ Klar</button>');
      if (open && own) act.push('<button type="button" data-a="edit">Ändra</button>');
      if (own) act.push('<button type="button" class="vk-del" data-a="del">Ta bort</button>');
      act.push('<button type="button" data-a="log">' + (st.tlog[t.id] ? 'Dölj historik' : '🕑 Historik') + '</button>');
      h += '<div class="vk-iact bt-act" data-id="' + t.id + '">' + act.join('') + '</div>';
    }
    if (st.tlog[t.id]) {
      h += '<div class="bt-log">' + (t.log || []).map(function (l) {
        return '<div><span>' + esc(when(l.at)) + '</span> ' + esc(l.by_name || '') + ': ' + esc(LOGTXT[l.action] || l.action) + (l.detail ? ' – ' + esc(l.detail) : '') + '</div>';
      }).join('') + '</div>';
    }
    return h + '</div>';
  }
  function drawTasks(body) {
    var all = st.bil.tasks || [], own = admin(), h = '';
    if (flashMsg) h += '<div id="vk-flash" class="vk-flash">' + esc(flashMsg) + '</div>';
    h += '<div class="vk-ltitle">Uppgifter</div>';
    if (own) h += st.tf ? taskForm(st.tf) : '<button type="button" id="bt-new" class="vk-new">＋ Ny uppgift till en förare</button>';
    var open = all.filter(function (t) { return t.status !== 'klar'; }), done = all.filter(function (t) { return t.status === 'klar'; });
    var mine = open.filter(function (t) { return t.mine; }), sent = open.filter(function (t) { return !t.mine; });
    if (mine.length || !own) {
      h += '<div class="vk-ltitle">Till dig (' + mine.length + ')</div>';
      if (!mine.length) h += '<div class="tl-msg">Inga uppgifter just nu.</div>';
      mine.forEach(function (t) { h += taskCard(t); });
    }
    if (own) {
      h += '<div class="vk-ltitle">Skickade, inte klara (' + sent.length + ')</div>';
      if (!sent.length) h += '<div class="tl-msg">Inga öppna uppgifter. Tryck "📋 Skicka som uppgift" på en anmälan eller ett underhåll.</div>';
      sent.forEach(function (t) { h += taskCard(t); });
    }
    if (done.length) {
      h += '<button type="button" class="ank-more" id="bv-done">' + (st.showDone ? 'Dölj klara' : 'Visa klara (' + done.length + ')') + '</button>';
      if (st.showDone) done.forEach(function (t) { h += taskCard(t); });
    }
    h += '<div class="tl-foot">' + (own
      ? 'Föraren ser bara uppgifter som skickats till hen. Du får en notis när föraren bokat tid och när det är klart.'
      : 'Skriv in tiden du bokat, bocka av punkterna och tryck Klar när det är gjort. Ägaren får en notis.') + '</div>';
    body.innerHTML = h;
    var g = function (id) { return document.getElementById(id); };
    if (g('bt-new')) g('bt-new').onclick = function () { startTask({}); };
    if (g('bv-done')) g('bv-done').onclick = function () { st.showDone = !st.showDone; draw(); };
    body.querySelectorAll('.bt-item').forEach(function (c) {
      c.onchange = function () {
        c.disabled = true;
        rpc('check_car_task_item', { p_item_id: +c.dataset.id, p_done: c.checked }).then(function () { return load(); })
          .catch(function (e) { if (!fail(e)) { alert(errText(e)); load(); } });
      };
    });
    body.querySelectorAll('.bt-act button').forEach(function (b) {
      b.onclick = function () {
        var id = +b.parentNode.dataset.id, t = all.filter(function (x) { return x.id === id; })[0]; if (!t) return;
        var a = b.dataset.a;
        if (a === 'log') { st.tlog[id] = !st.tlog[id]; draw(); }
        else if (a === 'photos') showPhotos(t.issue || t.maint, t.issue ? 'issue_id' : 'maint_id');
        else if (a === 'edit') startTask({ task: t });
        else if (a === 'reply') {
          var d = t.booked_at ? new Date(t.booked_at) : null;
          st.tr = { id: id, date: d ? ymd(d) : '', time: d ? hm(d) : '', place: t.booked_place || '', reply: t.reply || '', msg: '' }; draw();
        } else if (a === 'done') {
          var left = (t.items || []).filter(function (x) { return !x.done; }).length;
          if (left && !confirm(left + ' punkt' + (left > 1 ? 'er' : '') + ' är inte avbockad' + (left > 1 ? 'e' : '') + '. Markera klar ändå?')) return;
          var c = prompt('Klart! Kommentar till ägaren (valfri):', ''); if (c === null) return;
          rpc('done_car_task', { p_id: id, p_comment: c || null }).then(function () { flash(own ? 'Uppgiften är klar.' : 'Bra! Ägaren har fått en notis.'); return load(); })
            .catch(function (e) { if (!fail(e)) alert(errText(e)); });
        } else if (a === 'del') {
          if (!confirm('Ta bort uppgiften? ' + (t.status !== 'klar' ? 'Föraren får en notis.' : ''))) return;
          rpc('delete_car_task', { p_id: id }).then(function () { flash('Uppgiften är borttagen.'); return load(); })
            .catch(function (e) { if (!fail(e)) alert(errText(e)); });
        }
      };
    });
    if (st.tr && g('br-save')) {
      var f = st.tr;
      g('br-cancel').onclick = function () { st.tr = null; draw(); };
      g('br-save').onclick = function () {
        f.date = g('br-date').value; f.time = g('br-time').value; f.place = g('br-place').value; f.reply = g('br-reply').value;
        if (f.time && !f.date) { f.msg = 'Välj dag också.'; draw(); return; }
        if (!f.date && !f.place.trim() && !f.reply.trim()) { f.msg = 'Fyll i bokad dag eller skriv ett meddelande.'; draw(); return; }
        var at = f.date ? new Date(f.date + 'T' + (f.time || '00:00')) : null;
        if (at && isNaN(at.getTime())) { f.msg = ERR.bad_date; draw(); return; }
        rpc('reply_car_task', { p_id: f.id, p_booked_at: at ? at.toISOString() : null, p_place: f.place.trim() || null, p_reply: f.reply.trim() || null })
          .then(function () { st.tr = null; flash('Svaret är skickat till ägaren.'); return load(); })
          .catch(function (e) { if (fail(e)) return; f.msg = errText(e); draw(); });
      };
    }
    if (st.tf && own) bindTaskForm(body);
  }

  // ---------- ägarens notisval ----------
  function showPrefs(m) {
    var p = {}, src = (st.bil && st.bil.prefs) || {};
    NTYPES.forEach(function (t) { p[t[0]] = src[t[0]] === 'mail' ? 'mail' : 'app'; });
    function paint(msg) {
      m.querySelector('.pm-box').innerHTML = '<div class="pm-head" style="justify-content:center">⚙️ Notiser för Bil & verkstad</div>' +
        '<div class="vk-foot2">Välj för varje typ. Mejl skickas inom några minuter.</div>' +
        (st.bil && st.bil.has_email === false ? '<div class="vk-warn">Du har ingen mejladress sparad, så mejl kan inte skickas än. Be S admin lägga in din mejladress.</div>' : '') +
        NTYPES.map(function (t) {
          return '<div class="bp-row"><div class="bp-lbl">' + t[1] + '</div><div class="bv-two">' +
            '<button type="button" class="bv-opt' + (p[t[0]] === 'app' ? ' on' : '') + '" data-k="' + t[0] + '" data-v="app">Endast i appen</button>' +
            '<button type="button" class="bv-opt' + (p[t[0]] === 'mail' ? ' on' : '') + '" data-k="' + t[0] + '" data-v="mail">I appen + mejl</button></div></div>';
        }).join('') + (msg ? '<div class="vk-warn bad">' + esc(msg) + '</div>' : '') +
        '<div class="pm-btns" style="margin-top:.7rem"><button type="button" id="bp-cancel">Avbryt</button><button type="button" class="primary" id="bp-save">Spara</button></div>';
      m.querySelectorAll('.bp-row .bv-opt').forEach(function (b) { b.onclick = function () { p[b.dataset.k] = b.dataset.v; paint(); }; });
      document.getElementById('bp-cancel').onclick = function () { m.classList.remove('open'); };
      document.getElementById('bp-save').onclick = function () {
        rpc('save_bil_prefs', { p_prefs: p }).then(function (r) {
          if (st.bil) st.bil.prefs = (r && r.prefs) || p;
          m.classList.remove('open'); flash('Notisvalen är sparade.'); draw();
        }).catch(function (e) { if (!fail(e)) paint(errText(e)); });
      };
    }
    paint(''); m.classList.add('open');
  }

  // ---------- notiser (samma mekanism som kalenderns påminnelser) ----------
  function showNotices() {
    rpc('get_bil_notices', { p_mark_read: true }).then(function (list) {
      if (st.bil) st.bil.unread = 0; badge(st.bil); drawTop();
      var m = document.getElementById('bv-nmodal');
      if (!m) {
        m = document.createElement('div'); m.id = 'bv-nmodal'; m.className = 'pm-overlay';
        m.innerHTML = '<div class="pm-box" role="dialog" aria-label="Notiser"></div>';
        document.body.appendChild(m);
        m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('open'); });
      }
      m.querySelector('.pm-box').innerHTML = '<div class="pm-head" style="justify-content:center">🔔 Bil & verkstad</div>' +
        ((list || []).length ? list.map(function (n) {
          return '<div class="kal-com' + (n.read ? '' : ' unread') + '"><div class="kal-cwho">' + esc(when(n.created_at)) + '</div><div>' + esc(n.body) + '</div></div>';
        }).join('') : '<div class="kal-none">Inga notiser än.</div>') +
        '<div class="pm-btns" style="margin-top:.7rem">' + (admin() ? '<button type="button" id="bv-nprefs">⚙️ Inställningar</button>' : '') +
        '<button type="button" class="primary" id="bv-nclose">Stäng</button></div>';
      m.classList.add('open');
      document.getElementById('bv-nclose').onclick = function () { m.classList.remove('open'); };
      var np = document.getElementById('bv-nprefs'); if (np) np.onclick = function () { showPrefs(m); };
    }).catch(function (e) { if (!fail(e)) alert('Kunde inte hämta notiserna.'); });
  }

  // ---------- formulär ----------
  function newForm(entry) {
    var s, e;
    if (entry) { s = new Date(entry.start); e = new Date(entry.end); }
    else {
      e = new Date(); e.setSeconds(0, 0); e.setMinutes(e.getMinutes() - e.getMinutes() % 5);
      s = new Date(e); s.setHours(s.getHours() - 1);
    }
    var cars = (st.data && st.data.cars) || [];
    var cc = curCar() && cars.some(function (c) { return c.id === curCar(); }) ? curCar() : null;
    return { id: entry ? entry.id : null, s: s, e: e, car: entry ? entry.car_id : (cc || (cars.length === 1 ? cars[0].id : null)),
      comment: entry ? (entry.comment || '') : '', issue: entry ? (entry.issue_id || null) : null, msg: '' };
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
    var faults = openFaults(f.car, f.issue);
    if (faults.length) h += '<div class="vk-field"><span class="vk-lbl">Gäller felanmälan (valfritt)</span><select id="vk-issue"><option value="">Ingen koppling</option>' +
      faults.map(function (i) { return '<option value="' + i.id + '"' + (i.id === f.issue ? ' selected' : '') + '>' + (i.blocking ? '🛑 ' : '') + esc(cut(i.body, 50)) + '</option>'; }).join('') + '</select></div>';
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
    document.getElementById('vk-car').onchange = function (ev) { f.car = ev.target.value ? +ev.target.value : null; f.issue = null; draw(); };
    var is = document.getElementById('vk-issue'); if (is) is.onchange = function (ev) { f.issue = ev.target.value ? +ev.target.value : null; };
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
    rpc('save_my_workshop', { p_id: f.id, p_start: f.s.toISOString(), p_end: f.e.toISOString(), p_car_id: f.car, p_comment: f.comment || null, p_issue_id: f.issue || null })
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

  // ---------- vy: verkstadstimmar (som förut) ----------
  function drawHours(body) {
    if (st.err) { body.innerHTML = '<div class="tl-msg err">' + esc(st.err) + '</div>'; return; }
    var d = st.data; if (!d) { body.innerHTML = '<div class="tl-msg">Laddar…</div>'; return; }
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
        (x.issue_id ? '<div class="vk-icom">🔗 ' + esc(issueLabel(x.issue_id)) + '</div>' : '') +
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
