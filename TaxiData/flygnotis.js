/* Flyg-Bevakningar: fasta bevakningar för ankomster till Landvetter,
 * bara under de tider föraren väljer.
 *
 * - Kort "🔔 Mina bevakningar" på fliken Flyg i Ankomster (under notisknappen).
 * - Välj avreseort (IATA) och/eller flygnummer. Samma notiser som för tåg: före ankomst, försening, inställt.
 * - Sparas hos servern (flight_watch_*), skickas av edge-funktionen "bevakning" som push.
 * - Flyg som matchar en påslagen bevakning får en liten 🔔 i listan.
 */
(function () {
  'use strict';
  function API() { return (typeof SB_URL !== 'undefined' && SB_URL) || 'https://lpfdryvukqmjlgenuzpb.supabase.co'; }
  function KEY() { return (typeof SB_KEY !== 'undefined' && SB_KEY) || ''; }
  function token() { return localStorage.getItem('taxi_session') || ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rpc(name, args) {
    args.p_token = token();
    return fetch(API() + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': KEY(), 'Authorization': 'Bearer ' + KEY(), 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.text().then(function (t) {
        var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var er = new Error((b && b.message) || ('HTTP ' + r.status)); er.code = b && b.code; throw er; }
        return b;
      });
    });
  }
  function toast(t, ms) { if (window.BEVAKNING && BEVAKNING.toast) BEVAKNING.toast(t, ms); else alert(t); }

  var T = window.FLYGNOTIS = {};
  var DAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
  var ORIGINS = [
    ['ARN', 'Stockholm ARN'], ['CPH', 'Köpenhamn'], ['OSL', 'Oslo'],
    ['LHR', 'London LHR'], ['STN', 'London STN'], ['AMS', 'Amsterdam'],
    ['FRA', 'Frankfurt'], ['MUC', 'München'], ['HEL', 'Helsingfors'],
    ['AYT', 'Antalya'], ['AGP', 'Malaga'], ['TFS', 'Teneriffa'],
    ['PMI', 'Palma'], ['BCN', 'Barcelona'], ['DUS', 'Düsseldorf'],
    ['IST', 'Istanbul'], ['CDG', 'Paris'], ['BRU', 'Bryssel'],
    ['MXP', 'Milano'], ['MAN', 'Manchester'], ['BGO', 'Bergen'],
    ['MMX', 'Malmö'], ['UME', 'Umeå'], ['LLA', 'Luleå']
  ];
  var CITY = {
    stockholm: 'ARN', 'stockholm arn': 'ARN', arlanda: 'ARN',
    'stockholm bma': 'BMA', bromma: 'BMA',
    'malmö': 'MMX', malmo: 'MMX',
    'köpenhamn': 'CPH', kopenhamn: 'CPH', 'københavn': 'CPH',
    oslo: 'OSL', amsterdam: 'AMS', frankfurt: 'FRA',
    'münchen': 'MUC', munchen: 'MUC',
    helsingfors: 'HEL', helsinki: 'HEL',
    antalya: 'AYT', malaga: 'AGP', 'málaga': 'AGP',
    teneriffa: 'TFS', palma: 'PMI', barcelona: 'BCN',
    'düsseldorf': 'DUS', dusseldorf: 'DUS',
    istanbul: 'IST', 'istanbul ist': 'IST',
    paris: 'CDG', 'paris cdg': 'CDG', bryssel: 'BRU',
    milano: 'MXP', 'milano mxp': 'MXP', manchester: 'MAN',
    bergen: 'BGO', 'umeå': 'UME', umea: 'UME', 'luleå': 'LLA', lulea: 'LLA',
    london: 'LHR'
  };
  var LEADS = [0, 10, 20, 30, 45, 60];
  var DELAYS = [5, 10, 15, 20, 30, 45];
  var PRESET = { name: 'Från Stockholm ARN', enabled: true, origins: ['ARN'], airlines: [], flight_nos: [],
    lead_min: 20, notify_delay: true, delay_min: 10, notify_cancel: true, days: [1, 2, 3, 4, 5, 6, 7], from_min: 0, to_min: 0 };
  var ERR = {
    too_broad: 'Välj minst en avreseort eller ett flygnummer. Annars blir det notiser för alla flyg.',
    too_many: 'Du kan ha högst 10 flyg-Bevakningar.',
    bad_flight_no: 'Flygnummer ska se ut som SK169 eller FR966.',
    bad_days: 'Välj minst en dag.',
    nothing_to_send: 'Välj minst en sak att få notis om.',
    not_found: 'Bevakningen finns inte längre.'
  };
  var st = { list: null, loading: false, err: false, open: localStorage.getItem('fn_open') === '1', busy: false };
  T._state = st;

  function cur() { return (window.ANKOMSTER && ANKOMSTER.current && ANKOMSTER.current()) || ''; }
  function repaint() { if (window.ANKOMSTER && ANKOMSTER.repaint) ANKOMSTER.repaint(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function mins(v) { var p = /^(\d{1,2}):(\d{2})/.exec(v || ''); return p ? Math.min(1439, +p[1] * 60 + +p[2]) : 0; }

  function originOf(it) {
    var iata = String((it && it.iata) || '').toUpperCase().trim();
    if (/^[A-Z]{3}$/.test(iata)) return iata;
    var from = String((it && it.from) || '').trim();
    var m = /\b([A-Z]{3})$/.exec(from);
    if (m) return m[1];
    return CITY[from.toLowerCase()] || '';
  }
  function airlineOf(it) {
    var m = /^([A-Z]{1,3})\d/i.exec(String((it && it.no) || ''));
    return m ? m[1].toUpperCase() : '';
  }
  T.originOf = originOf;

  function load() {
    if (!token() || st.loading) return;
    st.loading = true;
    rpc('flight_watch_list', {}).then(function (l) { st.list = Array.isArray(l) ? l : []; st.err = false; })
      .catch(function () { st.err = true; if (!st.list) st.list = []; })
      .then(function () { st.loading = false; repaint(); });
  }
  T.reload = load;

  function daysText(d) {
    d = (d || []).slice().sort();
    if (d.length === 7) return 'alla dagar';
    if (d.join() === '1,2,3,4,5') return 'mån–fre';
    if (d.join() === '6,7') return 'lör–sön';
    return d.map(function (x) { return DAYS[x - 1].toLowerCase(); }).join(', ');
  }
  function timeText(w) { return w.from_min === w.to_min ? 'hela dygnet' : hhmm(w.from_min) + '–' + hhmm(w.to_min); }
  function originLabel(k) {
    k = String(k || '').toUpperCase();
    for (var i = 0; i < ORIGINS.length; i++) if (ORIGINS[i][0] === k) return ORIGINS[i][1];
    return k;
  }
  function whatText(w) {
    var o = (w.origins || []).map(originLabel);
    var p = [];
    if (o.length) p.push('Flyg från ' + o.join(', '));
    else p.push('Flyg');
    if ((w.airlines || []).length) p.push('bolag ' + w.airlines.join(', '));
    if ((w.flight_nos || []).length) p.push('nr ' + w.flight_nos.join(', '));
    return p.join(', ');
  }
  function sendText(w) {
    var p = [];
    if (w.lead_min) p.push(w.lead_min + ' min före');
    if (w.notify_delay) p.push('försening ' + w.delay_min + '+ min');
    if (w.notify_cancel) p.push('inställt');
    return p.join(' · ');
  }

  T.matches = function (w, it) {
    if (!w || !it || String(it.key || '').charAt(0) !== 'f') return false;
    if ((w.origins || []).length) {
      var code = originOf(it);
      if (!code || w.origins.map(function (x) { return String(x).toUpperCase(); }).indexOf(code) < 0) return false;
    }
    if ((w.airlines || []).length) {
      var ac = airlineOf(it), name = String(it.sub || '');
      var ok = w.airlines.some(function (a) {
        var k = String(a || '').toUpperCase();
        if (ac && k === ac) return true;
        if (k === 'SK' && /sas/i.test(name)) return true;
        if ((k === 'DY' || k === 'D8') && /norwegian/i.test(name)) return true;
        if (k === 'FR' && /ryanair/i.test(name)) return true;
        if (k === 'AY' && /finnair/i.test(name)) return true;
        if (k === 'KL' && /klm/i.test(name)) return true;
        if (k === 'LH' && /lufthansa/i.test(name)) return true;
        if (k === 'BA' && /british/i.test(name)) return true;
        if ((k === 'W6' || k === 'W4') && /wizz/i.test(name)) return true;
        return false;
      });
      if (!ok) return false;
    }
    if ((w.flight_nos || []).length) {
      var id = String(it.no || '').toUpperCase();
      if (w.flight_nos.map(function (x) { return String(x).toUpperCase(); }).indexOf(id) < 0) return false;
    }
    return true;
  };

  function extraOrigins() {
    var seen = {}, out = [];
    ORIGINS.forEach(function (o) { seen[o[0]] = true; });
    var items = (window.ANKOMSTER && ANKOMSTER.current && ANKOMSTER.current() === 'flyg' && window.ANKOMSTER.list)
      ? (ANKOMSTER.list() || []) : [];
    if (!items.length && window.ARRIVAL_DATA && ARRIVAL_DATA._cache) items = [];
    items.forEach(function (it) {
      var code = originOf(it);
      if (!code || seen[code]) return;
      seen[code] = true;
      out.push([code, (it.from || code)]);
    });
    return out;
  }

  function cardHtml() {
    var l = st.list || [];
    var on = l.filter(function (w) { return w.enabled; }).length;
    var h = '<div class="tn-card" id="fn-card"><button class="tn-head" data-fn-toggle aria-expanded="' + st.open + '">' +
      '<span>🔔 <b>Mina bevakningar</b></span><span class="tn-count">' + (st.list ? (l.length ? on + ' på' : 'Ingen än') : '…') +
      ' ' + (st.open ? '▴' : '▾') + '</span></button>';
    if (!st.open) return h + '</div>';
    h += '<div class="tn-body">';
    if (st.err) h += '<div class="tn-note">Kunde inte hämta dina bevakningar. Försök igen strax.</div>';
    l.forEach(function (w) {
      h += '<div class="tn-item' + (w.enabled ? '' : ' off') + '">' +
        '<button class="tn-switch' + (w.enabled ? ' on' : '') + '" role="switch" aria-checked="' + !!w.enabled + '" aria-label="' + esc(w.name) + ' på/av" data-fn-onoff="' + w.id + '"' + (st.busy ? ' disabled' : '') + '><span></span></button>' +
        '<div class="tn-txt"><b>' + esc(w.name) + '</b>' +
        (whatText(w) === w.name ? '' : '<div>' + esc(whatText(w)) + '</div>') +
        '<div>' + esc(timeText(w) + ', ' + daysText(w.days)) + (w.enabled ? (w.active_now ? ' <span class="tn-live">● aktiv nu</span>' : ' <span class="tn-rest">vilar nu</span>') : '') + '</div>' +
        '<div class="tn-dim">' + esc(sendText(w)) + '</div></div>' +
        '<button class="tn-edit" data-fn-edit="' + w.id + '">Ändra</button></div>';
    });
    if (!l.some(function (w) { return w.name === PRESET.name; })) {
      h += '<button class="tn-add main" data-fn-preset>+ Från Stockholm ARN</button>';
    }
    if (l.length < 10) h += '<button class="tn-add" data-fn-new>+ Egen bevakning</button>';
    var push = window.BEVAKNING && BEVAKNING.pushState ? BEVAKNING.pushState() : 'unknown';
    if (l.length && push === 'denied') h += '<div class="tn-note">⚠️ Notiser är blockerade för den här sidan. Tillåt dem i webbläsarens inställningar, annars kommer inga notiser från dina bevakningar hit.</div>';
    h += '<div class="tn-hint">Du får notis före ankomst, vid försening och om flyget ställs in, bara under tiderna du valt. Fungerar även när appen är stängd.</div>';
    return h + '</div></div>';
  }

  // Korten på Ankomster är borttagna; inställning sker i Mina bevakningar.
  T.decorate = function () {
    if (!token()) return;
    if (st.tok !== token()) { st.tok = token(); st.list = null; st.err = false; }
    if (st.list === null && !st.loading) load();
  };

  function errText(e) {
    if (window.DEMO && DEMO.isErr && DEMO.isErr(e)) return DEMO.MSG;
    if (ERR[e && e.message]) return ERR[e.message];
    if (e && e.message && e.code === '22023' && String(e.message).length < 180) return e.message;
    return 'Det gick inte att spara. Försök igen.';
  }
  function save(id, data) {
    if (window.DEMO && DEMO.on && DEMO.on()) { toast(DEMO.MSG); return Promise.reject(new Error('demo')); }
    st.busy = true; repaint();
    return rpc('flight_watch_save', { p_id: id || null, p_data: data }).then(function () { return load(); })
      .finally(function () { st.busy = false; repaint(); });
  }
  function find(id) { return (st.list || []).filter(function (w) { return String(w.id) === String(id); })[0]; }
  function dataOf(w) {
    return { name: w.name, enabled: w.enabled, origins: w.origins || [], airlines: w.airlines || [], flight_nos: w.flight_nos || [],
      lead_min: w.lead_min, notify_delay: w.notify_delay, delay_min: w.delay_min, notify_cancel: w.notify_cancel,
      days: w.days, from_min: w.from_min, to_min: w.to_min };
  }

  function sheetHtml(w, id) {
    var allDay = w.from_min === w.to_min;
    var chips = ORIGINS.concat(extraOrigins());
    var h = '<div class="tn-sheet fn-sheet" role="dialog" aria-modal="true" aria-label="Bevakning"><form class="tn-form" novalidate>' +
      '<div class="tn-sh-head"><b>' + (id ? 'Ändra bevakning' : 'Ny bevakning') + '</b><button type="button" class="tn-x" data-fn-close aria-label="Stäng">✕</button></div>' +
      '<label class="tn-lbl">Namn<input name="name" maxlength="40" value="' + esc(w.name) + '" placeholder="t.ex. Kvällsflyg från ARN"></label>' +
      '<div class="tn-lbl">Flyg från</div><div class="tn-chips">' + chips.map(function (o) {
        return '<label class="tn-chip"><input type="checkbox" name="o" value="' + o[0] + '"' + ((w.origins || []).indexOf(o[0]) >= 0 ? ' checked' : '') + '><span>' + esc(o[1]) + '</span></label>';
      }).join('') + '</div><div class="tn-dim">Välj minst en ort eller ett flygnummer.</div>' +
      '<label class="tn-lbl">Bara dessa flygnummer (valfritt)<input name="nos" inputmode="text" value="' + esc((w.flight_nos || []).join(', ')) + '" placeholder="t.ex. SK169, FR966"></label>' +
      '<div class="tn-lbl">Notis om</div>' +
      '<label class="tn-row">Före ankomst<select name="lead">' + LEADS.map(function (m) {
        return '<option value="' + m + '"' + (m === w.lead_min ? ' selected' : '') + '>' + (m ? m + ' min före' : 'Ingen') + '</option>';
      }).join('') + '</select></label>' +
      '<label class="tn-row"><span><input type="checkbox" name="delay"' + (w.notify_delay ? ' checked' : '') + '> Försening, minst</span><select name="delayMin">' + DELAYS.map(function (m) {
        return '<option value="' + m + '"' + (m === w.delay_min ? ' selected' : '') + '>' + m + ' min</option>';
      }).join('') + '</select></label>' +
      '<label class="tn-check"><input type="checkbox" name="cancel"' + (w.notify_cancel ? ' checked' : '') + '> Inställt flyg</label>' +
      '<div class="tn-lbl">När vill du ha notiser?</div>' +
      '<div class="tn-seg"><label><input type="radio" name="mode" value="all"' + (allDay ? ' checked' : '') + '><span>Hela dygnet</span></label>' +
      '<label><input type="radio" name="mode" value="tid"' + (allDay ? '' : ' checked') + '><span>Bara vissa tider</span></label></div>' +
      '<div class="tn-times"' + (allDay ? ' hidden' : '') + '><label>Från<input type="time" name="from" step="900" value="' + hhmm(allDay ? 17 * 60 : w.from_min) + '"></label>' +
      '<label>Till<input type="time" name="to" step="900" value="' + hhmm(allDay ? 5 * 60 : w.to_min) + '"></label></div>' +
      '<div class="tn-dim tn-times-hint"' + (allDay ? ' hidden' : '') + '>Till före Från = över natten, t.ex. 17:00–05:00. Morgonen räknas till dagen passet började.</div>' +
      '<div class="tn-chips tn-days">' + DAYS.map(function (d, i) {
        return '<label class="tn-chip"><input type="checkbox" name="d" value="' + (i + 1) + '"' + ((w.days || []).indexOf(i + 1) >= 0 ? ' checked' : '') + '><span>' + d + '</span></label>';
      }).join('') + '</div>' +
      '<div class="tn-err" aria-live="polite"></div>' +
      '<div class="tn-actions">' + (id ? '<button type="button" class="tn-del" data-fn-del>Ta bort</button>' : '<span></span>') +
      '<button type="submit" class="tn-save">Spara</button></div>' +
      '</form></div>';
    return h;
  }
  function parseNos(v) {
    return (String(v || '').toUpperCase().match(/[A-Z]{1,3}[0-9]{1,5}/g) || []).slice(0, 30);
  }
  function collect(f, base) {
    var all = function (n) { return Array.prototype.slice.call(f.querySelectorAll('input[name="' + n + '"]:checked')).map(function (x) { return x.value; }); };
    var E = f.elements;
    var mode = (f.querySelector('input[name="mode"]:checked') || {}).value;
    var from = mins(E.from.value), to = mins(E.to.value);
    if (mode === 'all') { from = 0; to = 0; } else if (from === to) { from = 0; to = 0; }
    return { name: E.name.value.trim() || 'Bevakning', enabled: base.enabled !== false, origins: all('o'), airlines: base.airlines || [],
      flight_nos: parseNos(E.nos.value), lead_min: +E.lead.value, notify_delay: E.delay.checked,
      delay_min: +E.delayMin.value, notify_cancel: E.cancel.checked, days: all('d').map(Number), from_min: from, to_min: to };
  }
  function check(d) {
    if (!d.origins.length && !(d.airlines || []).length && !d.flight_nos.length) return ERR.too_broad;
    if (!d.days.length) return ERR.bad_days;
    if (!d.lead_min && !d.notify_delay && !d.notify_cancel) return ERR.nothing_to_send;
    return '';
  }
  function closeSheet() {
    var s = document.querySelector('.fn-sheet'); if (s) s.remove();
    if (!document.querySelector('.tn-sheet')) document.documentElement.classList.remove('tn-lock');
  }
  function openSheet(id, preset) {
    closeSheet();
    var w = id ? find(id) : (preset ? PRESET : { name: '', enabled: true, origins: [], airlines: [], flight_nos: [], lead_min: 20,
      notify_delay: true, delay_min: 10, notify_cancel: true, days: [1, 2, 3, 4, 5, 6, 7], from_min: 0, to_min: 0 });
    if (!w) return;
    var box = document.createElement('div'); box.innerHTML = sheetHtml(w, id);
    var sh = box.firstChild; document.body.appendChild(sh);
    document.documentElement.classList.add('tn-lock');
    var f = sh.querySelector('form'), err = sh.querySelector('.tn-err');
    sh.addEventListener('click', function (e) {
      if (e.target === sh || e.target.closest('[data-fn-close]')) { closeSheet(); return; }
      if (e.target.closest('[data-fn-del]')) {
        if (!confirm('Ta bort bevakningen "' + w.name + '"?')) return;
        if (window.DEMO && DEMO.on && DEMO.on()) { toast(DEMO.MSG); return; }
        rpc('flight_watch_delete', { p_id: +id }).then(function () { closeSheet(); toast('Bevakningen är borttagen.'); load(); })
          .catch(function (e2) { err.textContent = errText(e2); });
      }
    });
    f.addEventListener('change', function (e) {
      if (e.target.name === 'mode') {
        var tid = e.target.value === 'tid';
        sh.querySelector('.tn-times').hidden = !tid; sh.querySelector('.tn-times-hint').hidden = !tid;
      }
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = collect(f, w);
      var raw = f.elements.nos.value;
      if (raw.trim() && !parseNos(raw).length) { err.textContent = ERR.bad_flight_no; return; }
      var msg = check(d);
      if (msg) { err.textContent = msg; return; }
      err.textContent = '';
      var btn = f.querySelector('.tn-save'); btn.disabled = true;
      save(id, d).then(function () {
        closeSheet(); st.open = true; localStorage.setItem('fn_open', '1');
        var done = function (push) {
          toast(push === 'on' ? 'Sparat. Du får notiser ' + timeText(d) + ', ' + daysText(d.days) + '.'
            : 'Sparat. Tillåt notiser i webbläsaren för att få dem på telefonen.', 4500);
          repaint();
        };
        if (window.BEVAKNING && BEVAKNING.ensurePush) BEVAKNING.ensurePush().then(done);
        else done(window.BEVAKNING && BEVAKNING.pushState ? BEVAKNING.pushState() : 'unknown');
      }).catch(function (e2) { btn.disabled = false; if (e2 && e2.message !== 'demo') err.textContent = errText(e2); });
    });
    var first = f.querySelector('input[name="name"]'); if (first && !id && !preset) setTimeout(function () { try { first.focus(); } catch (x) {} }, 50);
  }
  T.open = openSheet;

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-fn-toggle],[data-fn-onoff],[data-fn-edit],[data-fn-preset],[data-fn-new]');
    if (!t) return;
    if (t.hasAttribute('data-fn-toggle')) { st.open = !st.open; localStorage.setItem('fn_open', st.open ? '1' : '0'); if (st.open) load(); repaint(); return; }
    if (t.hasAttribute('data-fn-preset')) { openSheet(null, true); return; }
    if (t.hasAttribute('data-fn-new')) { openSheet(null, false); return; }
    if (t.hasAttribute('data-fn-edit')) { openSheet(t.getAttribute('data-fn-edit')); return; }
    var w = find(t.getAttribute('data-fn-onoff')); if (!w || st.busy) return;
    var d = dataOf(w); d.enabled = !w.enabled;
    save(w.id, d).then(function () { toast(d.enabled ? '🔔 ' + w.name + ' är på.' : '🔕 ' + w.name + ' är av.'); })
      .catch(function (e2) { if (e2 && e2.message !== 'demo') toast(errText(e2)); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.fn-sheet')) closeSheet(); });
  T.reset = function () { st.list = null; st.err = false; };
  T.whatText = whatText;

  if (!document.getElementById('tn-style')) {
    var s = document.createElement('style'); s.id = 'tn-style'; s.textContent = ''; document.head.appendChild(s);
  }
})();
