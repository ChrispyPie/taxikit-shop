/* Notisflöde: alla notiser samlade i en panel som dras in från högra kanten (eller 🔔 uppe till höger).
 * Innehåll: push-notiser (flyg/tåg-bevakning, prognos) + notiser från Bil & verkstad, Forum och Kalender + nya Nyheter.
 * Tryck på en notis: den markeras som läst och appen öppnar det notisen gäller.
 * Push sparas av sw.js i telefonen (IndexedDB) och skickas hit till servern (notis_add) när appen öppnas.
 * Servern: notis_feed, notis_add, notis_read (supabase/migrations/20261028r_notisflode.sql).
 * Servern sparar även flyg/tåg/prognos-push själv när den skickas (notis_svc_add, 20261028u_notis_server.sql);
 * samma nyckel (nkey) som här, så samma notis syns bara en gång. Fliken i högra kanten (#notis-edge) öppnar panelen.
 * Vart en notis leder (t551u): NOTIS.goTo – samma för notisflödet, den lilla rutan som ploppar upp (BEVAKNING.toast)
 * och tryck på en push (sw.js -> 'bev-open'). Prognos öppnas på rätt zon med förbokningen markerad (target, 20261028v).
 * Ångra: ta bort filen, skript-taggen och 🔔-knappen i index.html (se UNDO-notisflode-2026-10-28.md). */
(function () {
  var N = window.NOTIS = {};
  var LS_PEND = 'notis_pend';   // notiser som inte kommit fram till servern än (och demokontots notiser)
  var EDGE = 24;                // px från högra kanten där man kan börja dra

  var CSS =
    '.notis-btn{font-size:calc(17px * var(--font-scale, 1))}' +
    '.hdr-right{display:flex;align-items:center;gap:8px}' +
    '#notis-dim{position:fixed;inset:0;background:rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .2s;z-index:900}' +
    '#notis-dim.open{opacity:1;pointer-events:auto}' +
    '#notis-panel{position:fixed;top:0;right:0;bottom:0;width:min(88vw,400px);background:var(--bg,#fff);color:var(--text);' +
      'box-shadow:-4px 0 18px rgba(0,0,0,.18);transform:translateX(105%);transition:transform .22s ease-out;z-index:901;display:flex;flex-direction:column;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}' +
    '#notis-panel.open{transform:translateX(0)}' +
    '#notis-panel.drag,#notis-dim.drag{transition:none}' +
    '.np-head{display:flex;align-items:center;gap:.5rem;padding:.8rem .9rem;border-bottom:1px solid var(--border)}' +
    '.np-head h2{margin:0;font-size:1.15rem;flex:1}' +
    '.np-head button{background:none;border:none;color:var(--primary);font-size:.9rem;font-weight:600;padding:.35rem .4rem;cursor:pointer}' +
    '.np-head button:disabled{color:var(--text-soft);opacity:.6;cursor:default}' +
    '#np-close{font-size:1.25rem;color:var(--text)}' +
    '#np-list{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:.4rem .5rem 1rem}' +
    '.np-item{display:flex;gap:.65rem;align-items:flex-start;width:100%;text-align:left;background:var(--surface);color:var(--text);border:1px solid var(--border);' +
      'border-radius:10px;padding:.65rem .7rem;margin:.35rem 0;font:inherit;cursor:pointer}' +
    '.np-item.unread{border-left:4px solid var(--primary);background:var(--surface-soft,var(--surface))}' +
    '.np-ico{font-size:1.35rem;line-height:1.2;flex-shrink:0;width:1.7rem;text-align:center}' +
    '.np-txt{flex:1;min-width:0;font-size:.93rem;line-height:1.3;overflow-wrap:anywhere}' +
    '.np-item.unread .np-txt b{font-weight:700}.np-txt b{font-weight:600}' +
    '.np-when{display:block;margin-top:.2rem;font-size:.78rem;color:var(--text-soft)}' +
    '.np-dot{width:9px;height:9px;border-radius:50%;background:var(--badge,#e53e3e);flex-shrink:0;margin-top:.35rem}' +
    '.np-msg{color:var(--text-soft);text-align:center;padding:1.5rem .5rem;font-size:.95rem}' +
    '.np-foot{color:var(--text-soft);font-size:.78rem;text-align:center;padding:.6rem .5rem 0}' +
    // Liten flik i högra kanten som visar att panelen finns (t547u). Färgerna följer ljust/mörkt tema.
    '#notis-edge{position:fixed;right:0;top:50%;transform:translateY(-50%);width:16px;height:48px;padding:0;margin:0;z-index:899;' +
      'display:none;align-items:center;justify-content:center;background:var(--surface,#fff);color:var(--text-soft,#718096);' +
      'border:1px solid var(--border,#cbd5e0);border-right:none;border-radius:10px 0 0 10px;opacity:.8;cursor:pointer;' +
      'font-size:15px;line-height:1;box-shadow:-1px 0 4px rgba(0,0,0,.12);-webkit-tap-highlight-color:transparent}' +
    '#notis-edge.show{display:flex}' +
    '#notis-edge:active{opacity:1}' +
    '#notis-edge.unread::after{content:"";position:absolute;top:-3px;left:-3px;width:8px;height:8px;border-radius:50%;background:var(--badge,#e53e3e)}' +
    '@media print{#notis-edge{display:none!important}}' +
    // Rutan som ploppar upp (bevakning.js) går att trycka på när den leder någonstans (t551u)
    '.bev-toast.show.bev-toast-link{pointer-events:auto;cursor:pointer}' +
    '.bev-toast .bev-go{display:inline-block;margin-left:.45rem;font-weight:700;text-decoration:underline;white-space:nowrap}';
  (function () { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); })();

  var st = { items: null, unread: 0, err: false, open: false, pushed: false, skipPop: false, loading: false, at: 0, timer: null };

  // ---------- hjälp ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function token() { return localStorage.getItem('taxi_session') || ''; }
  function demo() { return !!(window.DEMO && DEMO.on && DEMO.on()); }
  function apiUrl() { try { return TRIP_API_URL; } catch (e) { return ''; } }
  function apiKey() { try { return TRIP_API_KEY; } catch (e) { return ''; } }
  function rpc(fn, args) {
    if (!apiUrl() || !token()) return Promise.reject(new Error('no session'));
    args = args || {}; args.p_token = token();
    return fetch(apiUrl() + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': apiKey(), 'Authorization': 'Bearer ' + apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error(j.message || ('HTTP ' + r.status)); e.code = j.code; throw e; });
      return r.json();
    });
  }
  function kindOf(tag) {
    tag = String(tag || '');
    if (tag.indexOf('flyg') === 0) return 'flyg';
    if (tag.indexOf('tag') === 0) return 'tag';
    if (tag.indexOf('prognos') === 0) return 'prognos';
    if (tag === 'test') return 'test';
    return 'push';
  }
  // Samma nyckel som sw.js räknar fram (notisKey) – så sparas en notis bara en gång.
  N.keyOf = function (d, now) {
    if (d && d.nkey) return String(d.nkey);
    var tag = String((d && d.tag) || 'push'), t = new Date(now || Date.now());
    var ymd = t.getFullYear() + p2(t.getMonth() + 1) + p2(t.getDate());
    if (tag.indexOf('prognos') === 0) {
      var m = /ca (\d\d):(\d\d)/.exec((d && d.body) || '');
      if (m) return 'prognos|' + tag + '@' + m[1] + m[2] + '|' + ymd;
    }
    return tag + '|' + ((d && d.ts) || now || Date.now());
  };

  // Vart en notis leder: target från servern/appen, annars zon och kategori ur taggen (prognos-161-app)
  // och tiden ur texten ("ca 14:35") – så öppnar även äldre Prognos-notiser rätt zon.
  N.targetOf = function (it) {
    it = it || {};
    var t = it.target && typeof it.target === 'object' ? it.target : null, out = {};
    if (t) Object.keys(t).forEach(function (k) { out[k] = t[k]; });
    if (String(it.kind || kindOf(it.tag)) !== 'prognos') return t ? out : null;
    var m = /^prognos-(\d{1,5})-([a-z_]{1,20})$/.exec(String(it.tag || ''));
    if (m) { if (!out.zone) out.zone = m[1]; if (!out.cat) out.cat = m[2]; }
    if (!out.at) {
      var h = /ca (\d\d):(\d\d)/.exec(String(it.body || '')), base = Date.parse(it.created_at || '') || it.at || Date.now();
      if (h) {
        var d = new Date(base); d.setHours(+h[1], +h[2], 0, 0);
        if (d.getTime() < base - 3 * 3600000) d = new Date(d.getTime() + 864e5);   // förbokning efter midnatt
        out.at = d.toISOString();
      }
    }
    return out.zone ? out : null;
  };

  // "nyss", "5 min sedan", "2 tim sedan", "i går 14:05", "12/10 14:05"
  function ago(ts) {
    var t = new Date(ts), now = new Date(), s = (now - t) / 1000;
    if (!isFinite(s)) return '';
    if (s < 60) return 'nyss';
    if (s < 3600) return Math.floor(s / 60) + ' min sedan';
    var d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    var hm = p2(t.getHours()) + ':' + p2(t.getMinutes());
    if (t >= d0) return Math.floor(s / 3600) + ' tim sedan';
    if (t >= new Date(d0 - 864e5)) return 'i går ' + hm;
    return t.getDate() + '/' + (t.getMonth() + 1) + (t.getFullYear() !== now.getFullYear() ? '/' + t.getFullYear() : '') + ' ' + hm;
  }

  // Bara dagen (nyheter utan klockslag): "i dag", "i går", "12/10"
  function dayText(ts) {
    var t = new Date(ts), now = new Date();
    if (!isFinite(t)) return '';
    var d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    if (t >= d0) return 'i dag';
    if (t >= new Date(d0 - 864e5)) return 'i går';
    return t.getDate() + '/' + (t.getMonth() + 1) + (t.getFullYear() !== now.getFullYear() ? '/' + t.getFullYear() : '');
  }

  // ---------- notiser som väntar i telefonen ----------
  function pendGet() { try { return JSON.parse(localStorage.getItem(LS_PEND + ':' + (localStorage.getItem('taxi_driver') || '')) || '[]') || []; } catch (e) { return []; } }
  function pendSet(l) { try { localStorage.setItem(LS_PEND + ':' + (localStorage.getItem('taxi_driver') || ''), JSON.stringify(l.slice(0, 50))); } catch (e) {} }
  function pendPut(it) {
    var l = pendGet();
    if (l.some(function (x) { return x.key === it.key; })) return false;
    l.unshift(it); pendSet(l); return true;
  }
  // Köen som sw.js skrivit (IndexedDB)
  function idb(fn) {
    return new Promise(function (res) {
      try {
        if (!window.indexedDB) return res([]);
        var rq = indexedDB.open('taxidata-notis', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('q', { keyPath: 'key' }); };
        rq.onerror = function () { res([]); };
        rq.onsuccess = function () {
          var db = rq.result, out = [];
          try {
            var tx = db.transaction('q', 'readwrite'), os = tx.objectStore('q');
            fn(os, out);
            tx.oncomplete = function () { db.close(); res(out); };
            tx.onerror = tx.onabort = function () { db.close(); res([]); };
          } catch (e) { db.close(); res([]); }
        };
      } catch (e) { res([]); }
    });
  }
  function idbAll() { return idb(function (os, out) { var r = os.getAll(); r.onsuccess = function () { (r.result || []).forEach(function (x) { out.push(x); }); }; }); }
  function idbDel(keys) { return keys.length ? idb(function (os) { keys.forEach(function (k) { os.delete(k); }); }) : Promise.resolve([]); }
  function idbClear() { return idb(function (os) { os.clear(); }); }

  // Skicka väntande notiser till servern. Demokonto: notiserna stannar i telefonen.
  var syncing = null;
  function sync() {
    if (!token()) return Promise.resolve();
    if (syncing) return syncing;
    syncing = idbAll().then(function (q) {
      q.forEach(function (x) { pendPut({ key: x.key, kind: kindOf(x.tag), tag: x.tag || '', title: x.title || 'TaxiData', body: x.body || '', at: x.at || Date.now(), target: x.target || null }); });
      return idbDel(q.map(function (x) { return x.key; }));
    }).then(function () {
      if (demo()) return;
      var l = pendGet().filter(function (x) { return !x.sent; });
      if (!l.length) return;
      return rpc('notis_add', { p_items: l.map(function (x) { return { key: x.key, kind: x.kind, tag: x.tag, title: x.title, body: x.body, at: x.at, read: !!x.read, target: x.target || null }; }) })
        .then(function () {
          var sent = {}; l.forEach(function (x) { sent[x.key] = 1; });
          pendSet(pendGet().filter(function (x) { return !sent[x.key]; }));
        });
    }).catch(function () {}).then(function () { syncing = null; });
    return syncing;
  }

  // Ny notis inne i appen (t.ex. Prognos-kollen eller en push som kom medan appen var öppen)
  N.add = function (it) {
    if (!token() || !it || !it.title) return;
    var at = it.at || Date.now();
    var item = { key: it.key || N.keyOf(it, at), kind: it.kind || kindOf(it.tag), tag: it.tag || '', title: String(it.title).slice(0, 200), body: String(it.body || '').slice(0, 600), at: at,
      target: it.target && typeof it.target === 'object' ? it.target : null };
    if (!pendPut(item)) return;
    paintBadge(); if (st.open) paint();
    sync().then(function () { refresh(true); });
  };

  // ---------- Nyheter (om.js) ----------
  function nyheter() {
    var u = window.OM && OM.unseen ? OM.unseen() : null;
    if (!u) return null;
    var t = String(u.text || '');
    if (t.length > 110) t = t.slice(0, 105).replace(/\s+\S*$/, '') + ' …';
    return { src: 'n', id: u.id, kind: 'nyheter', title: 'Nyheter i appen', body: t, created_at: u.at, day_only: !!u.day, read: false };
  }

  // ---------- flödet ----------
  function allItems() {
    var out = [];
    var ny = nyheter(); if (ny) out.push(ny);
    var onServer = {}; (st.items || []).forEach(function (x) { if (x.nkey) onServer[x.nkey] = 1; });
    pendGet().forEach(function (x) { if (onServer[x.key]) return; out.push({ src: 'l', id: x.key, nkey: x.key, kind: x.kind, tag: x.tag, title: x.title, body: x.body, created_at: new Date(x.at).toISOString(), read: !!x.read, target: x.target || null }); });
    (st.items || []).forEach(function (x) { out.push(x); });
    out.sort(function (a, b) { return (a.src === 'n' ? -1 : 0) - (b.src === 'n' ? -1 : 0) || Date.parse(b.created_at) - Date.parse(a.created_at); });
    return out;
  }
  function unreadCount() {
    var n = st.unread || 0;
    var onServer = {}; (st.items || []).forEach(function (x) { if (x.nkey) onServer[x.nkey] = 1; });
    pendGet().forEach(function (x) { if (!x.read && !onServer[x.key]) n++; });
    if (nyheter()) n++;
    return n;
  }
  function paintBadge() { if (window.setBadge) setBadge('notiser', token() ? unreadCount() : 0); paintEdge(); }
  // Fliken syns bara när man är inloggad och panelen är stängd; röd prick = olästa notiser.
  function paintEdge() {
    var e = document.getElementById('notis-edge'); if (!e) return;
    var on = !st.open && canOpen();
    e.classList.toggle('show', on);
    e.classList.toggle('unread', on && unreadCount() > 0);
  }

  function refresh(force) {
    if (!token()) return Promise.resolve();
    if (st.loading || (!force && Date.now() - st.at < 30000)) { paintBadge(); return Promise.resolve(); }
    st.loading = true;
    return sync().then(function () {
      if (demo()) { st.items = []; st.unread = 0; st.err = false; return; }
      return rpc('notis_feed', { p_limit: 80 }).then(function (r) {
        st.items = (r && r.items) || []; st.unread = (r && r.unread) || 0; st.err = false; st.at = Date.now();
      });
    }).catch(function (e) { st.err = true; if (e && e.code === '28000') { st.items = []; st.unread = 0; } })
      .then(function () { st.loading = false; paintBadge(); if (st.open) paint(); });
  }
  N.refresh = refresh;

  // Ikon: notisens egen emoji först (t.ex. "💬 Ägaren skrev…"), annars efter typ
  var ICON = { flyg: '🛬', tag: '🚆', prognos: '🔮', test: '🔔', nyheter: '✨', reminder: '📅',
    bil_stop: '🛑', bil_fault: '⚠️', bil_supply: '🧴', bil_maint: '🔧', bil_suggest: '💡', bil_status: '🛠️', bil_issue_msg: '💬' };
  var EMO = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D|\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;
  function iconOf(it) {
    var k = String(it.kind || '');
    if (ICON[k]) return ICON[k];
    if (k.indexOf('forum') === 0) return '💬';
    if (k.indexOf('bil_task') === 0) return '📋';
    if (k.indexOf('bil_wh') === 0) return '⏱️';
    if (k.indexOf('bil') === 0) return '🛠️';
    return '🔔';
  }
  function view(it) {
    var txt = String(it.body || ''), ttl = String(it.title || ''), ico = null, m;
    try { m = EMO.exec(ttl || txt); } catch (e) { m = null; }
    if (m) { ico = m[1]; if (ttl) ttl = ttl.slice(m[0].length); else txt = txt.slice(m[0].length); }
    return { ico: ico || iconOf(it), html: ttl ? '<b>' + esc(ttl) + '</b>' + (txt ? ' – ' + esc(txt) : '') : esc(txt) };
  }

  function paint() {
    var list = document.getElementById('np-list'); if (!list) return;
    var items = allItems(), h = '';
    var all = document.getElementById('np-all'); if (all) all.disabled = !items.some(function (x) { return !x.read; });
    if (!items.length) {
      h = st.items === null && st.loading ? '<div class="np-msg">Laddar…</div>'
        : st.err ? '<div class="np-msg">Kunde inte hämta notiserna. Kontrollera nätet och försök igen.</div>'
        : '<div class="np-msg">Inga notiser än.<br>Här samlas notiser om bevakade flyg och tåg, Prognos, Bil &amp; verkstad, Forum och Kalender.</div>';
    } else {
      items.forEach(function (it, i) {
        var v = view(it);
        h += '<button type="button" class="np-item' + (it.read ? '' : ' unread') + '" data-i="' + i + '">' +
          '<span class="np-ico" aria-hidden="true">' + v.ico + '</span>' +
          '<span class="np-txt">' + v.html + '<span class="np-when">' + esc(it.day_only ? dayText(it.created_at) : ago(it.created_at)) + '</span></span>' +
          (it.read ? '' : '<span class="np-dot" aria-label="Oläst"></span>') + '</button>';
      });
      if (st.err) h += '<div class="np-foot">Kunde inte hämta alla notiser just nu.</div>';
      h += '<div class="np-foot">Notiser sparas i 60 dagar.</div>';
    }
    list.innerHTML = h;
    list._items = items;
  }

  function markRead(it) {
    if (it.read) return;
    it.read = true;
    if (it.src === 'l') {
      var l = pendGet(); l.forEach(function (x) { if (x.key === it.id) x.read = true; }); pendSet(l);
    } else if (it.src === 'p' || it.src === 'e') {
      st.unread = Math.max(0, (st.unread || 0) - 1);
      rpc('notis_read', { p_src: it.src, p_id: it.id }).catch(function () {});
    }
    paintBadge();
  }
  function markAll() {
    var l = pendGet(); l.forEach(function (x) { x.read = true; }); pendSet(l);
    (st.items || []).forEach(function (x) { x.read = true; });
    st.unread = 0;
    if (window.OM && OM.markSeen && nyheter()) { try { OM.markSeen(); } catch (e) {} }
    paintBadge(); paint();
    if (!demo()) rpc('notis_read', { p_src: null, p_id: null }).catch(function () { st.at = 0; });
  }

  // Vart en notis leder
  function bilTab(it) {
    var k = String(it.kind || ''), b = String(it.body || '').toLowerCase();
    if (k.indexOf('bil_wh') === 0) return 'timmar';
    if (k.indexOf('bil_task') === 0) return 'uppg';
    if (k === 'bil_maint' || k === 'bil_suggest') return 'underhall';
    if (k === 'bil_supply') return 'behov';
    if (k === 'bil_stop' || k === 'bil_fault') return 'fel';
    if (/felanm|står:|nytt fel/.test(b)) return 'fel';
    if (k === 'bil_status' || k === 'bil_issue_msg') return 'behov';
    return null;
  }
  function go(it) {
    var k = String(it.kind || '');
    var open = window.openItem;
    if (typeof open !== 'function') return;
    if (k === 'nyheter') {
      open('om');
      setTimeout(function () { var el = document.getElementById('om-nyheter'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
    } else if (k === 'flyg' || k === 'tag') {
      if (!window.ANKOMSTER) return;
      try { localStorage.setItem('ank_tab', k); } catch (e) {}   // rätt flik: Flyg eller Tåg
      open(ANKOMSTER.id);
    } else if (k === 'prognos') {
      if (!window.PROGNOS) return;
      var tg = N.targetOf(it);
      if (tg && PROGNOS.focus) { try { PROGNOS.focus(tg); } catch (e) {} }   // rätt zon + markera förbokningen
      open(PROGNOS.id);
    }
    else if (k.indexOf('forum') === 0) {
      if (it.forum_post_id && window.FORUM && FORUM.openPost) FORUM.openPost(it.forum_post_id);
      else if (window.FORUM) open(FORUM.id);
    } else if (k.indexOf('bil') === 0) {
      if (!window.VERKSTAD) return;
      open(VERKSTAD.id);
      var t = bilTab(it);
      if (t && VERKSTAD.openTab) { try { VERKSTAD.openTab(t); } catch (e) {} }
    } else if (it.src === 'e') {
      if (it.event_id && window.KALENDER && KALENDER.openEvent) KALENDER.openEvent(it.event_id);
      else if (window.KALENDER) open(KALENDER.id);
    }
    // test-notiser och okända: bara markerade som lästa
  }
  // Leder notisen någonstans? (testnotiser och okända gör det inte)
  N.hasLink = function (it) {
    var k = String((it && (it.kind || kindOf(it.tag))) || '');
    return k !== 'test' && k !== 'push' && k !== '';
  };
  // Öppna det en notis gäller från den lilla rutan eller en push (samma som tryck i notisflödet).
  // it: { key, kind, tag, title, body, target }. Notisen markeras som läst om den finns i flödet.
  N.goTo = function (it) {
    if (!it || !token()) return;
    it = { key: it.key || '', kind: it.kind || kindOf(it.tag), tag: it.tag || '', title: it.title || '', body: it.body || '',
      target: it.target || null, created_at: it.created_at || new Date().toISOString() };
    var hit = null;
    if (it.key) allItems().forEach(function (x) { if (!hit && (x.nkey === it.key || (x.src === 'l' && x.id === it.key))) hit = x; });
    if (hit) { markRead(hit); if (!it.target && hit.target) it.target = hit.target; }
    else if (it.key) {   // inte i flödet än (sw.js-kön): markera i kön så den kommer in som läst
      var l = pendGet(), ch = false; l.forEach(function (x) { if (x.key === it.key && !x.read) { x.read = true; ch = true; } }); if (ch) pendSet(l);
    }
    if (st.open) closeForNav();
    go(it);
  };

  // ---------- panelen ----------
  function build() {
    if (document.getElementById('notis-panel')) return;
    var dim = document.createElement('div'); dim.id = 'notis-dim';
    var p = document.createElement('aside'); p.id = 'notis-panel';
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Notiser'); p.setAttribute('aria-hidden', 'true');
    p.innerHTML = '<div class="np-head"><h2>Notiser</h2><button type="button" id="np-all">Markera alla som lästa</button>' +
      '<button type="button" id="np-close" aria-label="Stäng">✕</button></div><div id="np-list"></div>';
    document.body.appendChild(dim); document.body.appendChild(p);
    var edge = document.createElement('button'); edge.id = 'notis-edge'; edge.type = 'button';
    edge.setAttribute('aria-label', 'Öppna notiser'); edge.title = 'Notiser'; edge.textContent = '‹';
    edge.onclick = function () { N.open(); };
    document.body.appendChild(edge);
    dim.onclick = function () { N.close(); };
    document.getElementById('np-close').onclick = function () { N.close(); };
    document.getElementById('np-all').onclick = markAll;
    document.getElementById('np-list').onclick = function (e) {
      var b = e.target.closest('.np-item'); if (!b) return;
      var it = (this._items || [])[+b.dataset.i]; if (!it) return;
      markRead(it);
      closeForNav();
      go(it);
    };
  }
  function canOpen() {
    var app = document.getElementById('app');
    return !!token() && app && app.style.display !== 'none';
  }
  function show(on) {
    build();
    var p = document.getElementById('notis-panel'), d = document.getElementById('notis-dim');
    p.classList.remove('drag'); d.classList.remove('drag'); p.style.transform = ''; d.style.opacity = '';
    p.classList.toggle('open', on); d.classList.toggle('open', on);
    p.setAttribute('aria-hidden', on ? 'false' : 'true');
    st.open = on;
    paintEdge();
  }
  N.isOpen = function () { return st.open; };
  N.open = function () {
    if (st.open || !canOpen()) return;
    if (typeof window.lockBlocked === 'function' && window.lockBlocked()) return;
    var pm = document.getElementById('profile-menu'); if (pm) pm.classList.remove('show');
    show(true); paint(); refresh(true);
    try { history.pushState({ notis: 1 }, ''); st.pushed = true; } catch (e) { st.pushed = false; }
  };
  N.close = function () {
    if (!st.open) return;
    show(false);
    if (st.pushed) { st.pushed = false; st.skipPop = true; try { history.back(); } catch (e) { st.skipPop = false; } }
  };
  N.toggle = function () { if (st.open) N.close(); else N.open(); };
  // Panelen stängs och appen går vidare till notisens sida: historikraden för panelen återanvänds.
  function closeForNav() {
    show(false);
    if (st.pushed) { st.pushed = false; try { history.replaceState(null, ''); } catch (e) {} }
  }
  // Anropas först i index.html:s popstate. true = bakåt-steget hörde till panelen.
  N.onPop = function () {
    if (st.skipPop) { st.skipPop = false; return true; }
    if (st.open) { st.pushed = false; show(false); return true; }
    return false;
  };

  // ---------- dra in från högra kanten ----------
  function scrollsX(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 2) { var o = getComputedStyle(el).overflowX; if (o === 'auto' || o === 'scroll') return true; }
    }
    return false;
  }
  var tg = null;
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tg = null; return; }
    var t = e.touches[0];
    var fromEdge = !st.open && t.clientX >= window.innerWidth - EDGE && canOpen() && !scrollsX(e.target);
    var inPanel = st.open && e.target.closest && e.target.closest('#notis-panel, #notis-dim');
    tg = (fromEdge || inPanel) ? { x: t.clientX, y: t.clientY, opening: fromEdge, active: false, dx: 0 } : null;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!tg) return;
    var t = e.touches[0], dx = t.clientX - tg.x, dy = t.clientY - tg.y;
    if (!tg.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { tg = null; return; }   // lodrät = vanlig scroll
      if (tg.opening ? dx < -12 : dx > 12) {
        if (tg.opening && typeof window.lockBlocked === 'function' && window.lockBlocked()) { tg = null; return; }
        tg.active = true; build();
        document.getElementById('notis-panel').classList.add('drag');
        document.getElementById('notis-dim').classList.add('drag');
      } else return;
    }
    var p = document.getElementById('notis-panel'), d = document.getElementById('notis-dim'), w = p.offsetWidth || 300;
    var shown = tg.opening ? Math.min(w, -dx) : Math.max(0, w - dx);
    shown = Math.max(0, shown);
    tg.dx = dx; tg.w = w; tg.shown = shown;
    p.style.transform = 'translateX(' + (w - shown) + 'px)';
    d.classList.add('open'); d.style.opacity = String(shown / w);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', function () {
    if (!tg) return;
    var g = tg; tg = null;
    if (!g.active) return;
    var openIt = g.shown > g.w * (g.opening ? 0.3 : 0.7);
    if (g.opening) { if (openIt) { show(false); N.open(); } else show(false); }
    else { if (openIt) show(true); else N.close(); }
  });
  document.addEventListener('touchcancel', function () { if (tg && tg.active) show(st.open); tg = null; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.open) N.close(); });

  // ---------- push medan appen är öppen ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'bev-push') return;
    var m = e.data.msg || {};
    N.add({ key: e.data.key, tag: m.tag || '', title: m.title || 'TaxiData', body: m.body || '', at: e.data.at || Date.now(), target: m.target || null });
  });

  // Tryck på en push medan appen är öppen (sw.js notificationclick -> 'bev-open'): öppna det notisen gäller.
  // Ersätter de gamla lyssnarna i bevakning.js (Ankomster) och prognos-notis.js (Prognos).
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'bev-open') return;
    var tag = String(e.data.tag || '');
    if (kindOf(tag) === 'test') return;
    N.goTo({ key: e.data.key || '', tag: tag, title: e.data.title || '', body: e.data.body || '', target: e.data.target || null });
  });

  // ---------- start / stopp ----------
  N.start = function () {
    build(); paintBadge(); refresh(true);
    clearInterval(st.timer);
    st.timer = setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, 60000);
  };
  N.logout = function () {
    clearInterval(st.timer); st.timer = null;
    st.items = null; st.unread = 0; st.at = 0;
    if (st.open) show(false);
    var ed = document.getElementById('notis-edge'); if (ed) ed.classList.remove('show', 'unread');
    idbClear();
    if (window.setBadge) setBadge('notiser', 0);
  };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && token()) refresh(); });
  window.addEventListener('focus', function () { if (token()) refresh(); });
})();
