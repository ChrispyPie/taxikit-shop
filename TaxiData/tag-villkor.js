/* Villkor för tågbevakningar (12 nov 2026): NÄR en bevakning får ge notis och ljud.
 * Problemet: bevakar man alla snabbtåg från Stockholm piper varje liten försening hela resan.
 *
 * - Ankomster (Tåg): bara en kryssruta Ljud för tåg och länken Specificera villkor i Mina bevakningar.
 * - Mina bevakningar: standard för alla tåg (tillfälliga och fasta) och egna villkor per avgång (🔔 i Schema).
 * - Små förseningar (under 15 min): ingen notis, inget ljud. Stor (30 min) eller plötslig (15 min på en gång):
 *   notis även långt bort. Inom X min från ankomst: notis från 15 min. Ankommit/inställt: alltid notis.
 * - Själva beslutet för push och notisflödet tas på servern (supabase/functions/bevakning/villkor.ts, samma
 *   logik som decide() här). Pushen bär silent (ingen ljud) och v: 1. Äldre push utan v: appen använder
 *   villkoren här (bara ljudet i appen).
 * - Sparas i telefonen (localStorage 'taxi_bev_villkor:<förar-id>') och hos servern (bev_villkor_get/save,
 *   migrationen 20261112c). Utan migrationen: bara i telefonen, servern använder standard (tystare).
 * Ångra: docs/bevakningar/UNDO-tag-ljudvillkor-20261112.md
 */
(function (root) {
  'use strict';
  var DEFAULTS = { sound: true, lead_min: 30, small_min: 15, big_min: 30, jump_min: 15 };
  var LIMITS = { lead_min: [0, 600], small_min: [0, 600], big_min: [1, 1440], jump_min: [1, 1440] };
  var WINDOW_STEP_MIN = 10;
  var NUMS = ['lead_min', 'small_min', 'big_min', 'jump_min'];
  var MAX_DEP = 60;

  // ---------- ren logik (samma som villkor.ts) ----------
  function num(v, d, lo, hi) {
    var n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
    if (!isFinite(n)) return d;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  }
  function normalize(o, base) {
    base = base || DEFAULTS;
    var x = (o && typeof o === 'object') ? o : {};
    var out = { sound: typeof x.sound === 'boolean' ? x.sound : base.sound };
    NUMS.forEach(function (k) { out[k] = num(x[k], base[k], LIMITS[k][0], LIMITS[k][1]); });
    return out;
  }
  function ms(v) { if (!v) return 0; var t = typeof v === 'number' ? v : Date.parse(String(v)); return isFinite(t) ? t : 0; }
  function depKey(ident, sched) {
    var t = ms(sched);
    return 't' + String(ident == null ? '' : ident) + '|' + (t ? new Date(t).toISOString() : String(sched == null ? '' : sched));
  }
  function routeKey(id) { return 'rw' + String(id); }
  function resolve(data, q) {
    q = q || {};
    var tag = (data && typeof data === 'object' && data.tag) || {};
    var def = normalize(tag.default);
    var dep = (tag.dep && typeof tag.dep === 'object') ? tag.dep : {};
    if (q.ident != null && q.sched != null) {
      var o = dep[depKey(q.ident, q.sched)];
      if (o && typeof o === 'object') return { settings: normalize(o, def), source: 'dep' };
    }
    if (q.routeId != null) {
      var r = dep[routeKey(q.routeId)];
      if (r && typeof r === 'object') return { settings: normalize(r, def), source: 'route' };
    }
    return { settings: def, source: 'default' };
  }
  function decide(ev, settings, now) {
    var s = normalize(settings);
    var sched = ms(ev.sched), est = ms(ev.est) || sched;
    var late = sched ? Math.round((est - sched) / 60e3) : 0;
    function yes(r) { return { notify: true, sound: s.sound, reason: r, late: late }; }
    function no(r) { return { notify: false, sound: false, reason: r, late: late }; }
    if (ev.type === 'arrived') return yes('arrived');
    if (ev.type === 'canceled') return yes('canceled');
    if (ev.type === 'lead') return yes('lead');
    var prev = ms(ev.seenEst) || sched;
    var jump = Math.round((est - prev) / 60e3);
    var nLate = Math.max(0, Math.round(Number(ev.notifiedLate) || 0));
    var nEst = ms(ev.notifiedEst) || sched;
    if (Math.abs(jump) >= s.jump_min && (late >= s.small_min || nLate >= s.small_min) && est !== nEst) return yes('jump');
    if (late < s.small_min) return no('small');
    if (late >= s.big_min && nLate < s.big_min) return yes('big');
    if (late >= s.big_min && late - nLate >= Math.max(s.big_min, nLate)) return yes('bigger');
    if (s.lead_min > 0 && est - now <= s.lead_min * 60e3 &&
      (nLate < s.small_min || Math.abs(est - nEst) >= WINDOW_STEP_MIN * 60e3)) return yes('window');
    return no('drip');
  }

  var V = root.TAG_VILLKOR = { DEFAULTS: DEFAULTS, LIMITS: LIMITS, WINDOW_STEP_MIN: WINDOW_STEP_MIN,
    normalize: normalize, depKey: depKey, routeKey: routeKey, resolve: resolve, decide: decide };
  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  if (typeof document === 'undefined' || !root.localStorage) return;

  // ---------- lagring: telefonen + servern ----------
  var LKEY = 'taxi_bev_villkor';
  var st = { key: null, data: null, srv: 'unknown', syncing: null, open: false };
  V._state = st;
  function token() { try { return localStorage.getItem('taxi_session') || ''; } catch (e) { return ''; } }
  function lkey() { var d = ''; try { d = localStorage.getItem('taxi_driver') || ''; } catch (e) {} return LKEY + (d ? ':' + d : ''); }
  function legacySound() {
    try { var o = JSON.parse(localStorage.getItem('taxi_bev_ljud') || '{}') || {}; return o.on !== false && o.tag !== false; } catch (e) { return true; }
  }
  function clean(d) {
    var out = { v: 1, updated_at: (d && d.updated_at) || '', tag: { default: normalize(d && d.tag && d.tag.default, normalize({ sound: legacySound() })), dep: {} } };
    var dep = (d && d.tag && d.tag.dep) || {}, now = Date.now(), keys = [];
    Object.keys(dep).forEach(function (k) {
      var o = dep[k]; if (!o || typeof o !== 'object') return;
      if (!/^(t[^|]{1,20}\|.{1,40}|rw\d{1,12})$/.test(k)) return;
      // Engångsavgångar städas bort ett dygn efter planerad tid.
      if (k.charAt(0) === 't') { var at = ms(k.split('|')[1]); if (at && at < now - 24 * 3600e3) return; }
      keys.push(k);
    });
    keys.slice(-MAX_DEP).forEach(function (k) {
      var o = dep[k], n = normalize(o, out.tag.default);
      if (o.label) n.label = String(o.label).slice(0, 80);
      out.tag.dep[k] = n;
    });
    return out;
  }
  function readLocal() {
    try { var o = JSON.parse(localStorage.getItem(lkey()) || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
  }
  function writeLocal(d) { try { localStorage.setItem(lkey(), JSON.stringify(d)); } catch (e) {} }
  function get() {
    if (st.key !== lkey() || !st.data) { st.key = lkey(); st.data = clean(readLocal()); st.srv = st.srv === 'missing' ? 'missing' : 'unknown'; }
    return st.data;
  }
  function rpc(name, args) {
    var base = (typeof SB_URL !== 'undefined' && SB_URL) || root.TRIP_API_URL || 'https://lpfdryvukqmjlgenuzpb.supabase.co';
    var key = (typeof SB_KEY !== 'undefined' && SB_KEY) || root.TRIP_API_KEY || '';
    args.p_token = token();
    return fetch(base + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(args)
    }).then(function (r) {
      return r.text().then(function (t) {
        var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var er = new Error((b && b.message) || ('HTTP ' + r.status)); er.status = r.status; er.code = b && b.code; throw er; }
        return b;
      });
    });
  }
  function missing(e) { return e && (e.status === 404 || e.code === 'PGRST202' || e.code === '42883'); }
  function syncSound(d) {
    // Kryssrutan Tågljud (bevakning-ljud.js) och standardens ljud är samma sak.
    if (!root.BEV_LJUD || !BEV_LJUD.read || !BEV_LJUD.write) return;
    var cur = BEV_LJUD.read(), want = !!d.tag.default.sound;
    if (!!(cur.on && cur.tag) === want) return;
    cur.tag = want; cur.on = !!(cur.tag || cur.flyg || cur.bat);
    BEV_LJUD.write(cur);
  }
  function changed() {
    try { document.dispatchEvent(new CustomEvent('tag-villkor-change')); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('bev-ljud-change')); } catch (e) {}
  }
  function save() {
    var d = get();
    d.updated_at = new Date().toISOString();
    st.data = d = clean(d);
    writeLocal(d); syncSound(d); changed();
    if (!token() || st.srv === 'missing' || (root.DEMO && DEMO.on && DEMO.on())) return Promise.resolve(d);
    return rpc('bev_villkor_save', { p_data: d }).then(function () { st.srv = 'ok'; return d; })
      .catch(function (e) { if (missing(e)) st.srv = 'missing'; return d; });
  }
  function sync(force) {
    if (!token() || st.srv === 'missing') return Promise.resolve(get());
    if (st.syncing) return st.syncing;
    if (!force && st.syncedKey === lkey() && Date.now() - (st.syncedAt || 0) < 60000) return Promise.resolve(get());
    st.syncedAt = Date.now(); st.syncedKey = lkey();
    var k = lkey();
    st.syncing = rpc('bev_villkor_get', {}).then(function (srv) {
      st.srv = 'ok';
      if (k !== lkey()) return get();
      var loc = get();
      if (srv && typeof srv === 'object' && srv.tag) {
        if (!loc.updated_at || String(srv.updated_at || '') > String(loc.updated_at)) {
          st.data = clean(srv); writeLocal(st.data); syncSound(st.data); changed();
        } else if (String(srv.updated_at || '') < String(loc.updated_at)) return save();
      } else if (loc.updated_at) return save();
      return get();
    }).catch(function (e) { if (missing(e)) st.srv = 'missing'; return get(); })
      .then(function (d) { st.syncing = null; return d; });
    return st.syncing;
  }
  V.get = get;
  V.sync = sync;
  V.settingsFor = function (q) { return resolve(get(), q); };
  V.setDefault = function (patch) {
    var d = get();
    d.tag.default = normalize(Object.assign({}, d.tag.default, patch || {}));
    return save();
  };
  V.setOverride = function (key, settings, meta) {
    var d = get();
    if (!settings) delete d.tag.dep[key];
    else {
      var n = normalize(settings, d.tag.default);
      if (meta && meta.label) n.label = String(meta.label).slice(0, 80);
      delete d.tag.dep[key]; d.tag.dep[key] = n;
    }
    return save();
  };
  V.hasOverride = function (key) { var d = get(); return !!(key && d.tag.dep[key]); };
  V.resetLocal = function () { st.key = null; st.data = null; st.srv = 'unknown'; st.syncedAt = 0; st.draft = null; };

  // Ljud i appen när en push kommer (bevakning-ljud.js). true = spela.
  // Ny server (v: 1) har redan avgjort: silent = tyst. Äldre push: lokala villkor, bara stor försening piper.
  V.shouldPlay = function (msg) {
    msg = msg || {};
    if (msg.v === 1) return msg.silent !== true;
    var s = resolve(get(), {}).settings;
    if (!s.sound) return false;
    if (/: ny tid /.test(String(msg.title || ''))) {
      var m = /försenat (\d+) min/.exec(String(msg.body || ''));
      return (m ? +m[1] : 0) >= s.big_min;
    }
    return true;
  };

  // ---------- UI ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function style() {
    if (document.getElementById('tv-style')) return;
    var c = document.createElement('style'); c.id = 'tv-style';
    c.textContent =
      '.tv-ank{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin:4px 0 6px}' +
      '.tv-ank label{display:inline-flex;align-items:center;gap:6px;font-size:calc(13px * var(--font-scale, 1));min-height:32px;white-space:nowrap}' +
      '.tv-ank input{width:18px;height:18px;margin:0;accent-color:var(--primary)}' +
      '.tv-link{background:none;border:0;padding:4px 0;min-height:32px;color:var(--primary,#4aa3ff);font:inherit;font-size:calc(13px * var(--font-scale, 1));text-decoration:underline;cursor:pointer;text-align:left}' +
      '.tv-card{background:var(--surface);border:1px solid var(--border-soft,#2c3a48);border-radius:12px;margin:0 0 10px;overflow:hidden}' +
      '.tv-head{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;background:none;border:0;padding:10px 12px;color:var(--text);font:inherit;cursor:pointer;min-height:44px;text-align:left}' +
      '.tv-head small{display:block;color:var(--muted);font-size:.8rem;font-weight:400;margin-top:2px}' +
      '.tv-body{padding:0 12px 12px;display:flex;flex-direction:column;gap:8px}' +
      '.tv-dim{color:var(--muted);font-size:.82rem;margin:0;line-height:1.35}' +
      '.tv-check{display:flex;gap:8px;align-items:center;font-size:.95rem;min-height:40px}.tv-check input{width:20px;height:20px;accent-color:var(--primary)}' +
      '.tv-num{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.92rem;line-height:1.35;padding:6px 0;border-top:1px solid var(--border-soft,#2c3a48)}' +
      '.tv-t{flex:1;min-width:0}.tv-t small{display:block;color:var(--muted);font-size:.8rem;margin-top:2px}' +
      '.tv-in{flex:none;display:inline-flex;align-items:center;gap:6px;color:var(--text-soft,#aab);white-space:nowrap}' +
      '.tv-num input{width:4.2em;font:inherit;padding:7px 6px;border:1px solid var(--border,#3a4a5c);border-radius:8px;background:var(--surface);color:var(--text);min-height:40px;box-sizing:border-box;text-align:center}' +
      '.tv-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}' +
      '.tv-save{flex:1;min-height:44px;background:var(--primary);color:var(--on-primary,#fff);border:0;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer}' +
      '.tv-sec{min-height:44px;background:none;border:1px solid var(--border,#3a4a5c);color:var(--text);border-radius:10px;padding:0 12px;cursor:pointer;font:inherit}' +
      '.tv-err{color:var(--danger-text,#f87171);font-size:.86rem;min-height:1em}' +
      '.tv-seg{display:flex;border:1px solid var(--border,#3a4a5c);border-radius:10px;overflow:hidden}.tv-seg label{flex:1}' +
      '.tv-seg input{position:absolute;opacity:0;pointer-events:none}.tv-seg span{display:block;text-align:center;padding:10px 6px;font-size:.9rem;cursor:pointer}' +
      '.tv-seg input:checked+span{background:var(--primary);color:var(--on-primary,#fff)}' +
      '.tv-sheet{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:flex-end;justify-content:center}' +
      '.tv-form{background:var(--surface);color:var(--text);width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:14px 14px 0 0;padding:12px 14px calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;box-sizing:border-box}' +
      '.tv-form>*{flex-shrink:0}.tv-sh-head{display:flex;justify-content:space-between;align-items:center;font-size:1.05rem}' +
      '.tv-x{background:none;border:0;font-size:1.2rem;color:var(--text-soft,#aab);cursor:pointer;min-width:44px;min-height:44px}' +
      'html.tv-lock,html.tv-lock body{overflow:hidden}';
    document.head.appendChild(c);
  }
  function summary(s) {
    if (!s.sound) return 'Ljud av · tyst under ' + s.small_min + ' min · notis från ' + s.big_min + ' min';
    return 'Ljud på · tyst under ' + s.small_min + ' min · alltid från ' + s.big_min + ' min · ' + (s.lead_min ? 'nära ankomst ' + s.lead_min + ' min' : 'inget fönster');
  }
  function fieldsHtml(s) {
    function row(name, text, hint) {
      var l = LIMITS[name];
      return '<label class="tv-num"><span class="tv-t">' + text + (hint ? '<small>' + hint + '</small>' : '') + '</span>' +
        '<span class="tv-in"><input type="number" inputmode="numeric" name="' + name + '" min="' + l[0] + '" max="' + l[1] + '" step="1" value="' + s[name] + '" aria-label="' + esc(LABEL[name]) + '"> min</span></label>';
    }
    return '<label class="tv-check"><input type="checkbox" name="sound"' + (s.sound ? ' checked' : '') + '> Ljud på</label>' +
      row('lead_min', 'Notis och ljud när tåget är så här nära ankomst', 'Räknas på beräknad ankomst, med förseningen. 0 = av.') +
      row('small_min', 'Ingen notis och inget ljud för förseningar under', '') +
      row('big_min', 'Alltid notis när förseningen är minst', 'Även om tåget är långt bort.') +
      row('jump_min', 'Alltid notis när tiden ändras på en gång med minst', 'Till exempel något som plötsligt hänt på vägen.') +
      '<p class="tv-dim">Ankommit och inställt ger alltid notis. Små förseningar syns ändå i Ankomster och här.</p>';
  }
  var LABEL = { lead_min: 'Minuter från ankomst', small_min: 'Tyst under så många minuters försening', big_min: 'Alltid notis från så många minuters försening', jump_min: 'Alltid notis när tiden ändras så många minuter på en gång' };
  function readForm(f, base) {
    var o = { sound: !!(f.elements.sound && f.elements.sound.checked) }, bad = '';
    NUMS.forEach(function (k) {
      var el = f.elements[k]; if (!el) return;
      var v = String(el.value || '').trim();
      if (v === '' || !/^\d{1,4}$/.test(v)) { bad = bad || 'Skriv hela minuter, till exempel 20.'; return; }
      o[k] = +v;
    });
    if (bad) return { err: bad };
    var n = normalize(o, base);
    return { val: n };
  }
  function toast(t) { if (root.BEVAKNING && BEVAKNING.toast) BEVAKNING.toast(t, 3500); }

  // Ankomster, fliken Tåg: bara kryssrutan och länken. Inga fält här.
  V.renderAnkomster = function (box) {
    if (!box) return;
    style();
    var s = get().tag.default;
    box.innerHTML = '<div class="tv-ank"><label><input type="checkbox" data-tv-sound' + (s.sound ? ' checked' : '') + '> Ljud för tåg</label>' +
      '<button type="button" class="tv-link" data-tv-open>Specificera villkor i Mina bevakningar</button></div>';
    box.onchange = function (e) {
      if (!e.target || !e.target.hasAttribute('data-tv-sound')) return;
      if (root.BEV_LJUD && BEV_LJUD.unlock) BEV_LJUD.unlock();
      V.setDefault({ sound: !!e.target.checked });
    };
    box.onclick = function (e) {
      if (!e.target.closest || !e.target.closest('[data-tv-open]')) return;
      e.preventDefault();
      V.openSettings();
    };
    sync();
  };
  V.openSettings = function () {
    st.open = true;
    try { sessionStorage.setItem('tv_focus', '1'); } catch (e) {}
    if (typeof root.openItem === 'function') root.openItem('mina-bevakningar');
  };

  // Mina bevakningar: standard för alla tåg
  V.renderPanel = function (box) {
    if (!box) return;
    style();
    var focus = false; try { focus = sessionStorage.getItem('tv_focus') === '1'; sessionStorage.removeItem('tv_focus'); } catch (e) {}
    if (focus) st.open = true;
    var s = st.draft ? normalize(st.draft, get().tag.default) : get().tag.default;
    var h = '<section class="tv-card" id="tv-card"><button type="button" class="tv-head" data-tv-toggle aria-expanded="' + st.open + '"><span>🔔 <b>Ljud och notiser för tåg</b><small>' + esc(summary(s)) + '</small></span><span aria-hidden="true">' + (st.open ? '▴' : '▾') + '</span></button>';
    if (st.open) {
      h += '<form class="tv-body" data-tv-default novalidate><p class="tv-dim">Standard för alla tåg du bevakar, tillfälliga och fasta. Vill du ha andra villkor för en viss avgång: tryck 🔔 på avgången i Schema.</p>' +
        fieldsHtml(s) + '<div class="tv-err" aria-live="polite"></div><div class="tv-actions"><button type="submit" class="tv-save">Spara</button><button type="button" class="tv-sec" data-tv-reset>Återställ standard</button></div></form>';
    }
    box.innerHTML = h + '</section>';
    var head = box.querySelector('[data-tv-toggle]');
    head.onclick = function () { st.open = !st.open; st.draft = null; V.renderPanel(box); };
    var f = box.querySelector('[data-tv-default]');
    if (f) {
      // Det du skrivit men inte sparat ligger kvar när listan uppdateras (varje minut).
      if (st.draft && st.draft.sound === false && f.elements.sound) f.elements.sound.checked = false;
      f.oninput = f.onchange = function () { var r = readForm(f, DEFAULTS); if (r.val) st.draft = r.val; };
      f.onsubmit = function (e) {
        e.preventDefault();
        var r = readForm(f, DEFAULTS), err = f.querySelector('.tv-err');
        if (r.err) { err.textContent = r.err; return; }
        st.draft = null;
        V.setDefault(r.val).then(function () { toast('Sparat. Gäller alla tåg som inte har egna villkor.'); });
      };
      f.querySelector('[data-tv-reset]').onclick = function () {
        st.draft = null;
        V.setDefault(DEFAULTS).then(function () { toast('Standard återställd.'); });
      };
      if (focus) setTimeout(function () { try { if (box.getBoundingClientRect().top > innerHeight * 0.5) box.scrollIntoView({ block: 'start' }); } catch (x) {} }, 30);
    }
    sync();
  };

  // Egna villkor för en avgång. t: { key (avgång), routeKey (fast bevakning, valfri), title, onlyRoute }
  function closeSheet() {
    var s = document.querySelector('.tv-sheet'); if (s) s.remove();
    document.documentElement.classList.remove('tv-lock');
  }
  V.closeSheet = closeSheet;
  V.openSheet = function (t) {
    if (!t || (!t.key && !t.routeKey)) return;
    style(); closeSheet();
    var d = get();
    var scope = t.onlyRoute || !t.key ? 'route' : (t.routeKey && d.tag.dep[t.routeKey] && !d.tag.dep[t.key] ? 'route' : 'dep');
    function keyOf(sc) { return sc === 'route' ? t.routeKey : t.key; }
    function draw() {
      var k = keyOf(scope), own = !!d.tag.dep[k];
      var s = own ? normalize(d.tag.dep[k], d.tag.default) : (scope === 'dep' && t.routeKey && d.tag.dep[t.routeKey] ? normalize(d.tag.dep[t.routeKey], d.tag.default) : d.tag.default);
      var h = '<div class="tv-sheet" role="dialog" aria-modal="true" aria-label="Ljud och notiser för avgången"><form class="tv-form" novalidate>' +
        '<div class="tv-sh-head"><b>Ljud och notiser</b><button type="button" class="tv-x" data-tv-close aria-label="Stäng">✕</button></div>' +
        '<p class="tv-dim"><b>' + esc(t.title || '') + '</b></p>';
      if (t.key && t.routeKey && !t.onlyRoute) {
        h += '<div class="tv-seg" role="radiogroup" aria-label="Gäller"><label><input type="radio" name="scope" value="dep"' + (scope === 'dep' ? ' checked' : '') + '><span>Bara den här avgången</span></label>' +
          '<label><input type="radio" name="scope" value="route"' + (scope === 'route' ? ' checked' : '') + '><span>Varje gång (fast)</span></label></div>';
      }
      h += '<p class="tv-dim">' + (own ? 'Egna villkor. Går före standarden.' : 'Följer standarden nu. Ändra och spara för att ge ' + (scope === 'route' ? 'den fasta bevakningen' : 'avgången') + ' egna villkor.') + '</p>' +
        fieldsHtml(s) + '<div class="tv-err" aria-live="polite"></div><div class="tv-actions"><button type="submit" class="tv-save">Spara</button>' +
        (own ? '<button type="button" class="tv-sec" data-tv-std>Använd standard</button>' : '') + '<button type="button" class="tv-sec" data-tv-close>Avbryt</button></div></form></div>';
      var box = document.createElement('div'); box.innerHTML = h;
      var sh = box.firstChild; document.body.appendChild(sh);
      document.documentElement.classList.add('tv-lock');
      var f = sh.querySelector('form');
      sh.addEventListener('click', function (e) {
        if (e.target === sh || e.target.closest('[data-tv-close]')) { e.preventDefault(); closeSheet(); return; }
        if (e.target.closest('[data-tv-std]')) {
          e.preventDefault();
          V.setOverride(keyOf(scope), null).then(function () { closeSheet(); toast('Avgången följer standarden igen.'); });
        }
      });
      f.addEventListener('change', function (e) {
        if (e.target.name === 'scope') { scope = e.target.value; closeSheet(); draw(); }
      });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var r = readForm(f, d.tag.default);
        if (r.err) { f.querySelector('.tv-err').textContent = r.err; return; }
        V.setOverride(keyOf(scope), r.val, { label: t.title }).then(function () {
          closeSheet(); toast(scope === 'route' ? 'Sparat för den fasta bevakningen.' : 'Sparat för den här avgången.');
        });
      });
    }
    draw();
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.tv-sheet')) closeSheet(); });
  // Annan förare loggar in på samma telefon: läs om rätt förares villkor.
  root.addEventListener && root.addEventListener('storage', function (e) { if (e && (e.key === 'taxi_driver' || e.key === 'taxi_session')) V.resetLocal(); });
  if (token()) setTimeout(function () { sync(); }, 1500);
})(typeof window !== 'undefined' ? window : globalThis);
