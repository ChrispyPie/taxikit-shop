/* Mina tågnotiser (t609u): fasta notiser för vissa tåg, t.ex. snabbtågen från Stockholm,
 * bara under de tider föraren väljer (t.ex. 17:00–05:00 mån–fre, så inga notiser när man är ledig).
 *
 * - Visas som ett kort "🔔 Mina tågnotiser" på fliken Tåg i Ankomster (under notisknappen).
 * - Snabbval "Snabbtåg från Stockholm" eller egen: varifrån, bara snabbtåg, tågnummer.
 * - Notis X min före ankomst, vid försening och om tåget ställs in.
 * - Sparas hos servern (train_watch_*), notiserna skickas av edge-funktionen "bevakning" som push,
 *   så de kommer även när appen är stängd. Kräver att notiser är påslagna på telefonen.
 * - Tåg som matchar en påslagen tågnotis får en liten 🔔 i listan.
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

  var T = window.TAGNOTIS = {};
  var DAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
  var ORIGINS = [['sthlm', 'Stockholm'], ['kbh', 'Köpenhamn'], ['oslo', 'Oslo']];
  var LEADS = [0, 10, 15, 20, 30, 45, 60];
  var DELAYS = [5, 10, 15, 20, 30];
  var PRESET = { name: 'Snabbtåg från Stockholm', enabled: true, origins: ['sthlm'], fast_only: true, train_nos: [],
    lead_min: 20, notify_delay: true, delay_min: 10, notify_cancel: true, days: [1, 2, 3, 4, 5, 6, 7], from_min: 0, to_min: 0 };
  var ERR = {
    too_broad: 'Välj varifrån, bara snabbtåg eller tågnummer. Annars blir det notiser för alla tåg.',
    too_many: 'Du kan ha högst 10 tågnotiser.',
    bad_train_no: 'Tågnummer ska vara siffror, t.ex. 423, 541.',
    bad_days: 'Välj minst en dag.',
    nothing_to_send: 'Välj minst en sak att få notis om.',
    not_found: 'Tågnotisen finns inte längre.'
  };
  var st = { list: null, loading: false, err: false, open: localStorage.getItem('tn_open') === '1', busy: false };
  T._state = st;

  function cur() { return (window.ANKOMSTER && ANKOMSTER.current && ANKOMSTER.current()) || ''; }
  function repaint() { if (window.ANKOMSTER && ANKOMSTER.repaint) ANKOMSTER.repaint(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function mins(v) { var p = /^(\d{1,2}):(\d{2})/.exec(v || ''); return p ? Math.min(1439, +p[1] * 60 + +p[2]) : 0; }

  function load() {
    if (!token() || st.loading) return;
    st.loading = true;
    rpc('train_watch_list', {}).then(function (l) { st.list = Array.isArray(l) ? l : []; st.err = false; })
      .catch(function () { st.err = true; if (!st.list) st.list = []; })
      .then(function () { st.loading = false; repaint(); });
  }
  T.reload = load;

  // ---------- text ----------
  function daysText(d) {
    d = (d || []).slice().sort();
    if (d.length === 7) return 'alla dagar';
    if (d.join() === '1,2,3,4,5') return 'mån–fre';
    if (d.join() === '6,7') return 'lör–sön';
    return d.map(function (x) { return DAYS[x - 1].toLowerCase(); }).join(', ');
  }
  function timeText(w) { return w.from_min === w.to_min ? 'hela dygnet' : hhmm(w.from_min) + '–' + hhmm(w.to_min); }
  function whatText(w) {
    var o = (w.origins || []).map(function (k) { for (var i = 0; i < ORIGINS.length; i++) if (ORIGINS[i][0] === k) return ORIGINS[i][1]; return k; });
    var p = [];
    p.push((w.fast_only ? 'Snabbtåg' : 'Tåg') + (o.length ? ' från ' + o.join(', ') : ''));
    if ((w.train_nos || []).length) p.push('nr ' + w.train_nos.join(', '));
    return p.join(', ');
  }
  function sendText(w) {
    var p = [];
    if (w.lead_min) p.push(w.lead_min + ' min före');
    if (w.notify_delay) p.push('försening ' + w.delay_min + '+ min');
    if (w.notify_cancel) p.push('inställt');
    return p.join(' · ');
  }

  // Samma filter som servern (supabase/functions/bevakning/tagnotis.ts)
  function isFast(it) { return !!it.snabb || /snabbt[åa]g|x\s?2000|sj\s?3000/i.test(it.sub || ''); }
  T.matches = function (w, it) {
    if (!w || !it || it.key.charAt(0) !== 't') return false;
    if ((w.origins || []).length && w.origins.indexOf(it.group) < 0) return false;
    if (w.fast_only && !isFast(it)) return false;
    if ((w.train_nos || []).length && w.train_nos.indexOf(String(it.tid)) < 0) return false;
    return true;
  };

  // ---------- kortet på Tåg-fliken ----------
  function cardHtml() {
    var l = st.list || [];
    var on = l.filter(function (w) { return w.enabled; }).length;
    var h = '<div class="tn-card" id="tn-card"><button class="tn-head" data-tn-toggle aria-expanded="' + st.open + '">' +
      '<span>🔔 <b>Mina tågnotiser</b></span><span class="tn-count">' + (st.list ? (l.length ? on + ' på' : 'Ingen än') : '…') +
      ' ' + (st.open ? '▴' : '▾') + '</span></button>';
    if (!st.open) return h + '</div>';
    h += '<div class="tn-body">';
    if (st.err) h += '<div class="tn-note">Kunde inte hämta dina tågnotiser. Försök igen strax.</div>';
    l.forEach(function (w) {
      h += '<div class="tn-item' + (w.enabled ? '' : ' off') + '">' +
        '<button class="tn-switch' + (w.enabled ? ' on' : '') + '" role="switch" aria-checked="' + !!w.enabled + '" aria-label="' + esc(w.name) + ' på/av" data-tn-onoff="' + w.id + '"' + (st.busy ? ' disabled' : '') + '><span></span></button>' +
        '<div class="tn-txt"><b>' + esc(w.name) + '</b>' +
        (whatText(w) === w.name ? '' : '<div>' + esc(whatText(w)) + '</div>') +
        '<div>' + esc(timeText(w) + ', ' + daysText(w.days)) + (w.enabled ? (w.active_now ? ' <span class="tn-live">● aktiv nu</span>' : ' <span class="tn-rest">vilar nu</span>') : '') + '</div>' +
        '<div class="tn-dim">' + esc(sendText(w)) + '</div></div>' +
        '<button class="tn-edit" data-tn-edit="' + w.id + '">Ändra</button></div>';
    });
    if (!l.some(function (w) { return w.name === PRESET.name; })) {
      h += '<button class="tn-add main" data-tn-preset>+ Snabbtåg från Stockholm</button>';
    }
    if (l.length < 10) h += '<button class="tn-add" data-tn-new>+ Egen tågnotis</button>';
    var push = window.BEVAKNING && BEVAKNING.pushState ? BEVAKNING.pushState() : 'unknown';
    if (l.length && push !== 'on') h += '<div class="tn-note">⚠️ Notiser är inte påslagna på den här telefonen. Slå på dem med knappen ovan, annars kommer inga tågnotiser hit.</div>';
    h += '<div class="tn-hint">Du får notis före ankomst, vid försening och om tåget ställs in, bara under tiderna du valt. Fungerar även när appen är stängd.</div>';
    return h + '</div></div>';
  }

  // Anropas i slutet av ANKOMSTER paint() (efter BEVAKNING.decorate)
  T.decorate = function (el) {
    if (cur() !== 'tag' || !token()) return;
    if (st.tok !== token()) { st.tok = token(); st.list = null; st.err = false; }  // annan förare loggade in
    if (st.list === null && !st.loading) load();
    var after = el.querySelector('.bev-bar') || el.querySelector('.ank-head');
    var wrap = document.createElement('div'); wrap.innerHTML = cardHtml();
    if (after) after.parentNode.insertBefore(wrap.firstChild, after.nextSibling);
    // 🔔 på tåg som matchar en påslagen tågnotis
    var on = (st.list || []).filter(function (w) { return w.enabled; });
    if (!on.length || !window.ANKOMSTER || !ANKOMSTER.item) return;
    var rows = el.querySelectorAll('[data-ank-key^="t"]');
    for (var i = 0; i < rows.length; i++) {
      var it = ANKOMSTER.item(rows[i].getAttribute('data-ank-key'));
      if (it && on.some(function (w) { return T.matches(w, it); })) {
        var f = rows[i].querySelector('.ank-from');
        if (f && !f.querySelector('.tn-bell')) { var b = document.createElement('span'); b.className = 'tn-bell'; b.title = 'Mina tågnotiser'; b.textContent = ' 🔔'; f.appendChild(b); }
      }
    }
  };

  // ---------- spara ----------
  function errText(e) {
    if (window.DEMO && DEMO.isErr && DEMO.isErr(e)) return DEMO.MSG;
    return ERR[e && e.message] || 'Det gick inte att spara. Försök igen.';
  }
  function save(id, data) {
    if (window.DEMO && DEMO.on && DEMO.on()) { toast(DEMO.MSG); return Promise.reject(new Error('demo')); }
    st.busy = true; repaint();
    return rpc('train_watch_save', { p_id: id || null, p_data: data }).then(function (l) {
      st.list = Array.isArray(l) ? l : st.list; return l;
    }).finally(function () { st.busy = false; repaint(); });
  }
  function find(id) { return (st.list || []).filter(function (w) { return String(w.id) === String(id); })[0]; }
  function dataOf(w) {
    return { name: w.name, enabled: w.enabled, origins: w.origins, fast_only: w.fast_only, train_nos: w.train_nos, lead_min: w.lead_min,
      notify_delay: w.notify_delay, delay_min: w.delay_min, notify_cancel: w.notify_cancel, days: w.days, from_min: w.from_min, to_min: w.to_min };
  }

  // ---------- redigera (eget lager ovanpå, så att Ankomsters uppdatering varje minut inte nollställer formuläret) ----------
  function sheetHtml(w, id) {
    var allDay = w.from_min === w.to_min;
    var h = '<div class="tn-sheet" role="dialog" aria-modal="true" aria-label="Tågnotis"><form class="tn-form" novalidate>' +
      '<div class="tn-sh-head"><b>' + (id ? 'Ändra tågnotis' : 'Ny tågnotis') + '</b><button type="button" class="tn-x" data-tn-close aria-label="Stäng">✕</button></div>' +
      '<label class="tn-lbl">Namn<input name="name" maxlength="40" value="' + esc(w.name) + '" placeholder="t.ex. Snabbtåg kväll"></label>' +
      '<div class="tn-lbl">Tåg från</div><div class="tn-chips">' + ORIGINS.map(function (o) {
        return '<label class="tn-chip"><input type="checkbox" name="o" value="' + o[0] + '"' + (w.origins.indexOf(o[0]) >= 0 ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
      }).join('') + '</div><div class="tn-dim">Inget valt = alla orter.</div>' +
      '<label class="tn-check"><input type="checkbox" name="fast"' + (w.fast_only ? ' checked' : '') + '> Bara snabbtåg (SJ Snabbtåg/X2000/SJ 3000)</label>' +
      '<label class="tn-lbl">Bara dessa tågnummer (valfritt)<input name="nos" inputmode="text" value="' + esc((w.train_nos || []).join(', ')) + '" placeholder="t.ex. 423, 541"></label>' +
      '<div class="tn-lbl">Notis om</div>' +
      '<label class="tn-row">Före ankomst<select name="lead">' + LEADS.map(function (m) {
        return '<option value="' + m + '"' + (m === w.lead_min ? ' selected' : '') + '>' + (m ? m + ' min före' : 'Ingen') + '</option>';
      }).join('') + '</select></label>' +
      '<label class="tn-row"><span><input type="checkbox" name="delay"' + (w.notify_delay ? ' checked' : '') + '> Försening, minst</span><select name="delayMin">' + DELAYS.map(function (m) {
        return '<option value="' + m + '"' + (m === w.delay_min ? ' selected' : '') + '>' + m + ' min</option>';
      }).join('') + '</select></label>' +
      '<label class="tn-check"><input type="checkbox" name="cancel"' + (w.notify_cancel ? ' checked' : '') + '> Inställt tåg</label>' +
      '<div class="tn-lbl">När vill du ha notiser?</div>' +
      '<div class="tn-seg"><label><input type="radio" name="mode" value="all"' + (allDay ? ' checked' : '') + '><span>Hela dygnet</span></label>' +
      '<label><input type="radio" name="mode" value="tid"' + (allDay ? '' : ' checked') + '><span>Bara vissa tider</span></label></div>' +
      '<div class="tn-times"' + (allDay ? ' hidden' : '') + '><label>Från<input type="time" name="from" step="900" value="' + hhmm(allDay ? 17 * 60 : w.from_min) + '"></label>' +
      '<label>Till<input type="time" name="to" step="900" value="' + hhmm(allDay ? 5 * 60 : w.to_min) + '"></label></div>' +
      '<div class="tn-dim tn-times-hint"' + (allDay ? ' hidden' : '') + '>Till före Från = över natten, t.ex. 17:00–05:00. Morgonen räknas till dagen passet började.</div>' +
      '<div class="tn-chips tn-days">' + DAYS.map(function (d, i) {
        return '<label class="tn-chip"><input type="checkbox" name="d" value="' + (i + 1) + '"' + (w.days.indexOf(i + 1) >= 0 ? ' checked' : '') + '><span>' + d + '</span></label>';
      }).join('') + '</div>' +
      '<div class="tn-err" aria-live="polite"></div>' +
      '<div class="tn-actions">' + (id ? '<button type="button" class="tn-del" data-tn-del>Ta bort</button>' : '<span></span>') +
      '<button type="submit" class="tn-save">Spara</button></div>' +
      '</form></div>';
    return h;
  }
  function collect(f, base) {
    var all = function (n) { return Array.prototype.slice.call(f.querySelectorAll('input[name="' + n + '"]:checked')).map(function (x) { return x.value; }); };
    var E = f.elements;
    var mode = (f.querySelector('input[name="mode"]:checked') || {}).value;
    var from = mins(E.from.value), to = mins(E.to.value);
    if (mode === 'all') { from = 0; to = 0; } else if (from === to) { from = 0; to = 0; }
    return { name: E.name.value.trim() || 'Tågnotis', enabled: base.enabled !== false, origins: all('o'), fast_only: E.fast.checked,
      train_nos: (E.nos.value.match(/\d+/g) || []).slice(0, 20), lead_min: +E.lead.value, notify_delay: E.delay.checked,
      delay_min: +E.delayMin.value, notify_cancel: E.cancel.checked, days: all('d').map(Number), from_min: from, to_min: to };
  }
  function check(d) {
    if (!d.origins.length && !d.fast_only && !d.train_nos.length) return ERR.too_broad;
    if (!d.days.length) return ERR.bad_days;
    if (!d.lead_min && !d.notify_delay && !d.notify_cancel) return ERR.nothing_to_send;
    if (/[^\d,\s]/.test(d._raw || '')) return ERR.bad_train_no;
    return '';
  }
  function closeSheet() {
    var s = document.querySelector('.tn-sheet'); if (s) s.remove();
    document.documentElement.classList.remove('tn-lock');
  }
  function openSheet(id, preset) {
    closeSheet();
    var w = id ? find(id) : (preset ? PRESET : { name: '', enabled: true, origins: [], fast_only: false, train_nos: [], lead_min: 20,
      notify_delay: true, delay_min: 10, notify_cancel: true, days: [1, 2, 3, 4, 5, 6, 7], from_min: 0, to_min: 0 });
    if (!w) return;
    var box = document.createElement('div'); box.innerHTML = sheetHtml(w, id);
    var sh = box.firstChild; document.body.appendChild(sh);
    document.documentElement.classList.add('tn-lock');
    var f = sh.querySelector('form'), err = sh.querySelector('.tn-err');
    sh.addEventListener('click', function (e) {
      if (e.target === sh || e.target.closest('[data-tn-close]')) { closeSheet(); return; }
      if (e.target.closest('[data-tn-del]')) {
        if (!confirm('Ta bort tågnotisen "' + w.name + '"?')) return;
        if (window.DEMO && DEMO.on && DEMO.on()) { toast(DEMO.MSG); return; }
        rpc('train_watch_delete', { p_id: +id }).then(function (l) { st.list = Array.isArray(l) ? l : st.list; closeSheet(); toast('Tågnotisen är borttagen.'); repaint(); })
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
      var d = collect(f, w); d._raw = f.elements.nos.value;
      var msg = check(d); delete d._raw;
      if (msg) { err.textContent = msg; return; }
      err.textContent = '';
      var btn = f.querySelector('.tn-save'); btn.disabled = true;
      save(id, d).then(function () {
        closeSheet(); st.open = true; localStorage.setItem('tn_open', '1');
        var push = window.BEVAKNING && BEVAKNING.pushState ? BEVAKNING.pushState() : 'unknown';
        toast(push === 'on' ? 'Sparat. Du får tågnotiser ' + timeText(d) + ', ' + daysText(d.days) + '.'
          : 'Sparat. Slå på notiser (🔔 Aktivera) för att få tågnotiserna.', 4500);
        repaint();
      }).catch(function (e2) { btn.disabled = false; if (e2 && e2.message !== 'demo') err.textContent = errText(e2); });
    });
    var first = f.querySelector('input[name="name"]'); if (first && !id && !preset) setTimeout(function () { try { first.focus(); } catch (x) {} }, 50);
  }
  T.open = openSheet;

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-tn-toggle],[data-tn-onoff],[data-tn-edit],[data-tn-preset],[data-tn-new]');
    if (!t) return;
    if (t.hasAttribute('data-tn-toggle')) { st.open = !st.open; localStorage.setItem('tn_open', st.open ? '1' : '0'); if (st.open) load(); repaint(); return; }
    if (t.hasAttribute('data-tn-preset')) { openSheet(null, true); return; }
    if (t.hasAttribute('data-tn-new')) { openSheet(null, false); return; }
    if (t.hasAttribute('data-tn-edit')) { openSheet(t.getAttribute('data-tn-edit')); return; }
    var w = find(t.getAttribute('data-tn-onoff')); if (!w || st.busy) return;
    var d = dataOf(w); d.enabled = !w.enabled;
    save(w.id, d).then(function () { toast(d.enabled ? '🔔 ' + w.name + ' är på.' : '🔕 ' + w.name + ' är av.'); })
      .catch(function (e2) { if (e2 && e2.message !== 'demo') toast(errText(e2)); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.tn-sheet')) closeSheet(); });
  // Ny inloggning / utloggning: hämta om
  T.reset = function () { st.list = null; st.err = false; };

  // ---------- stil ----------
  var css = '' +
    '.tn-card{background:var(--surface);border:1px solid var(--border-soft);border-radius:10px;margin:0 0 8px;overflow:hidden}' +
    '.tn-head{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;background:none;border:0;padding:10px 12px;font-size:.95rem;color:var(--text);cursor:pointer;min-height:44px}' +
    '.tn-count{color:var(--muted);font-size:.85rem;white-space:nowrap}' +
    '.tn-body{padding:0 10px 10px;display:flex;flex-direction:column;gap:8px}' +
    '.tn-item{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border-soft);border-radius:10px;padding:8px;background:var(--surface-soft)}' +
    '.tn-item.off .tn-txt{opacity:.6}' +
    '.tn-txt{flex:1;min-width:0;font-size:.86rem;color:var(--text-soft);line-height:1.35}.tn-txt b{color:var(--text);font-size:.92rem}' +
    '.tn-dim{color:var(--muted);font-size:.8rem}' +
    '.tn-live{color:var(--ok);font-weight:700;white-space:nowrap}.tn-rest{color:var(--muted);white-space:nowrap}' +
    '.tn-switch{flex:none;width:46px;height:28px;border-radius:14px;border:0;background:var(--border);position:relative;cursor:pointer;margin-top:2px}' +
    '.tn-switch span{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 3px rgba(0,0,0,.3)}' +
    '.tn-switch.on{background:var(--ok)}.tn-switch.on span{left:21px}.tn-switch[disabled]{opacity:.6}' +
    '.tn-edit{flex:none;background:none;border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);cursor:pointer;min-height:36px}' +
    '.tn-add{border:2px dashed var(--border);background:none;color:var(--text);border-radius:10px;padding:10px;font-weight:700;font-size:.95rem;cursor:pointer;min-height:44px}' +
    '.tn-add.main{border:2px solid var(--primary);background:var(--primary);color:var(--on-primary)}' +
    '.tn-note{background:var(--danger-bg);color:var(--danger-text);border-radius:8px;padding:8px;font-size:.85rem}' +
    '.tn-hint{color:var(--muted);font-size:.8rem}' +
    '.tn-bell{font-size:.8em}' +
    'html.tn-lock,html.tn-lock body{overflow:hidden}' +
    '.tn-sheet{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:flex-end;justify-content:center}' +
    '.tn-form{background:var(--surface);color:var(--text);width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:14px 14px 0 0;padding:12px 14px calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;box-sizing:border-box}.tn-form>*{flex-shrink:0}' +
    '.tn-sh-head{display:flex;justify-content:space-between;align-items:center;font-size:1.05rem;position:sticky;top:-12px;background:var(--surface);padding:4px 0}' +
    '.tn-x{background:none;border:0;font-size:1.2rem;color:var(--text-soft);cursor:pointer;min-width:44px;min-height:44px}' +
    '.tn-lbl{display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:.9rem;margin-top:4px}' +
    '.tn-form input[type=text],.tn-form input:not([type]),.tn-form input[type=time],.tn-form select{font:inherit;font-weight:400;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);min-height:42px;box-sizing:border-box}' +
    '.tn-chips{display:flex;flex-wrap:wrap;gap:6px}' +
    '.tn-chip input,.tn-seg input{position:absolute;opacity:0;pointer-events:none}' +
    '.tn-chip span{display:inline-block;padding:8px 12px;border:1px solid var(--border);border-radius:18px;font-size:.9rem;cursor:pointer;min-width:30px;text-align:center}' +
    '.tn-chip input:checked+span{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}' +
    '.tn-chip input:focus-visible+span,.tn-seg input:focus-visible+span{outline:2px solid var(--accent)}' +
    '.tn-days .tn-chip span{padding:8px 0;width:40px}' +
    '.tn-check{display:flex;gap:8px;align-items:center;font-size:.92rem;min-height:36px}.tn-check input,.tn-row input{width:20px;height:20px}' +
    '.tn-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:.92rem}.tn-row span{display:flex;gap:8px;align-items:center}' +
    '.tn-seg{display:flex;border:1px solid var(--border);border-radius:10px;overflow:hidden}.tn-seg label{flex:1}' +
    '.tn-seg span{display:block;text-align:center;padding:10px 6px;font-size:.9rem;cursor:pointer}.tn-seg input:checked+span{background:var(--primary);color:var(--on-primary)}' +
    '.tn-times{display:flex;gap:10px}.tn-times label{flex:1;display:flex;flex-direction:column;gap:4px;font-size:.85rem;color:var(--text-soft)}' +
    '.tn-err{color:var(--danger-text);font-size:.88rem;min-height:1em}' +
    '.tn-actions{display:flex;justify-content:space-between;gap:10px}' +
    '.tn-save{flex:1;max-width:60%;background:var(--primary);color:var(--on-primary);border:0;border-radius:10px;padding:12px;font-weight:700;font-size:1rem;cursor:pointer}' +
    '.tn-save[disabled]{opacity:.6}' +
    '.tn-del{background:none;border:1px solid var(--danger);color:var(--danger-text);border-radius:10px;padding:10px 12px;cursor:pointer}';
  var s = document.createElement('style'); s.id = 'tn-style'; s.textContent = css; document.head.appendChild(s);
})();
