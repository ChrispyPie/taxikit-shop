/* Bevakning: markera ett flyg eller tåg i Ankomster och få en notis med ljud när det händer något
 * (flyg: landat, bagaget rullar, sista väskan ute, ny tid, inställt; tåg: ankommit, ny tid, inställt).
 *
 * - Flyg: tryck på ☆ (eller håll fingret på raden). Tåg: håll fingret på raden ca en halv sekund.
 * - Notiserna skickas från servern (Supabase edge-funktionen "bevakning") som webbnotiser (push),
 *   så de kommer även när telefonen ligger i fickan med skärmen släckt.
 * - När appen är öppen spelas dessutom ett ljud och telefonen vibrerar.
 * - Bevakningen tas bort automatiskt 30 min efter sista händelsen (flyg: sista väskan, tåg: ankomst; AFTER_MIN i edge-funktionen).
 * - Utloggning: B.logout() stänger av notiserna på telefonen och tar bort den hos servern.
 */
(function () {
  'use strict';
  // SB_URL och SB_KEY (publik nyckel) definieras i index.html
  function API() { return (typeof SB_URL !== 'undefined' && SB_URL) || 'https://lpfdryvukqmjlgenuzpb.supabase.co'; }
  function KEY() { return (typeof SB_KEY !== 'undefined' && SB_KEY) || ''; }
  function FN() { return API() + '/functions/v1/bevakning'; }

  // Klick på en notis öppnar /TaxiData/?sida=ankomster&flik=flyg|tag → visa Ankomster direkt på rätt flik.
  try {
    var q0 = new URLSearchParams(location.search);
    if (q0.get('sida') === 'ankomster') {
      if (q0.get('flik') === 'flyg' || q0.get('flik') === 'tag') localStorage.setItem('ank_tab', q0.get('flik'));
      localStorage.setItem('taxi_view', 'ankomster');
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) {}
  var HOLD_MS = 500;

  var B = window.BEVAKNING = {};
  var st = { list: [], loadedAt: 0, loading: false, push: 'unknown', busy: false, reg: null, help: false };

  function token() { return localStorage.getItem('taxi_session') || ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hm(v) {
    var x = new Date(v); if (isNaN(x)) return '';
    return x.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
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
  function fn(body) {
    return fetch(FN(), { method: 'POST', headers: { 'apikey': KEY(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; }); });
  }

  // nyckel i Ankomster: 'f' + flygnr + '|' + planerad tid, 't' + tågnr + '|' + planerad tid
  function parseKey(key) {
    var m = /^([ft])(.*)\|(.*)$/.exec(String(key || ''));
    if (!m) return null;
    return { kind: m[1] === 'f' ? 'flyg' : 'tag', ident: m[2], schedRaw: m[3], sched: Date.parse(m[3]) };
  }
  function watchOf(key) {
    var k = parseKey(key); if (!k) return null;
    var now = Date.now();
    for (var i = 0; i < st.list.length; i++) {
      var w = st.list[i];
      if (w.kind === k.kind && w.ident === k.ident && Math.abs(Date.parse(w.sched) - k.sched) < 60000 && Date.parse(w.expires_at) > now) return w;
    }
    return null;
  }
  B.isWatched = function (key) { return !!watchOf(key); };

  // ---------- notiser (push) ----------
  var supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  function b64ToBytes(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out;
  }
  function register() {
    if (!supported) return Promise.resolve(null);
    if (st.reg) return Promise.resolve(st.reg);
    return navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (r) { st.reg = r; return r; });
  }
  function checkPush() {
    if (!supported) { st.push = 'unsupported'; return Promise.resolve(); }
    if (Notification.permission === 'denied') { st.push = 'denied'; return Promise.resolve(); }
    return register().then(function (r) { return r ? r.pushManager.getSubscription() : null; })
      .then(function (s) { st.push = (s && Notification.permission === 'granted') ? 'on' : 'off'; if (s) save(s); })
      .catch(function () { st.push = 'off'; });
  }
  var savedOnce = false;
  function save(sub) {
    if (savedOnce || !token() || (window.DEMO && DEMO.on())) return Promise.resolve();
    var j = sub.toJSON();
    return rpc('push_save', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) })
      .then(function () { savedOnce = true; });
  }
  function enable() {
    if (!supported) return Promise.resolve();
    if (window.DEMO && DEMO.on()) { toast(DEMO.MSG); return Promise.resolve(); }  // demokonton får inga notiser
    unlockAudio();
    st.busy = true; repaint();
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') { st.push = p === 'denied' ? 'denied' : 'off'; throw new Error('perm'); }
      return Promise.all([register().then(function () { return navigator.serviceWorker.ready; }), fn({ action: 'vapid' })]);
    }).then(function (x) {
      var reg = x[0];
      return reg.pushManager.getSubscription().then(function (old) {
        return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(x[1].key) });
      });
    }).then(function (sub) { savedOnce = false; return save(sub); })
      .then(function () { st.push = 'on'; toast('Notiser är på 🔔 Tryck "Testa" för att höra hur det låter.'); })
      .catch(function (e) { if (String(e && e.message) !== 'perm') toast('Det gick inte att slå på notiser. Försök igen.'); })
      .then(function () { st.busy = false; repaint(); });
  }
  function disable() {
    st.busy = true; repaint();
    return register().then(function (r) { return r && r.pushManager.getSubscription(); }).then(function (s) {
      if (!s) return;
      var ep = s.endpoint;
      return s.unsubscribe().then(function () { return rpc('push_delete', { p_endpoint: ep }); });
    }).catch(function () {}).then(function () { st.push = 'off'; st.busy = false; savedOnce = false; repaint(); });
  }
  function test() {
    unlockAudio();
    st.busy = true; repaint();
    fn({ action: 'test', token: token() }).then(function (r) {
      if (!r.sent) toast('Ingen enhet tog emot testnotisen. Tryck "Aktivera" igen.');
    }).catch(function () { toast('Testnotisen gick inte att skicka.'); })
      .then(function () { st.busy = false; repaint(); });
  }

  // ---------- ljud + vibration när appen är öppen ----------
  var actx = null;
  function unlockAudio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }
  document.addEventListener('pointerdown', function once() { unlockAudio(); document.removeEventListener('pointerdown', once); });
  function beep() {
    if (!actx) return;
    try {
      var t = actx.currentTime;
      [0, 0.25, 0.5].forEach(function (o, i) {
        var osc = actx.createOscillator(), g = actx.createGain();
        osc.type = 'sine'; osc.frequency.value = i === 2 ? 1320 : 880;
        g.gain.setValueAtTime(0.0001, t + o); g.gain.exponentialRampToValueAtTime(0.4, t + o + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.2);
        osc.connect(g); g.connect(actx.destination); osc.start(t + o); osc.stop(t + o + 0.22);
      });
    } catch (e) {}
  }
  // Push medan appen är öppen: ljud + ruta. Rutan går att trycka på och öppnar det notisen gäller (t551u).
  B.alert = function (msg, key) {
    msg = msg || {};
    beep();
    try { if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]); } catch (e) {}
    toast((msg.title ? msg.title : 'Ny händelse') + (msg.body ? ' – ' + msg.body : ''), 8000,
      { key: key || msg.nkey || '', tag: msg.tag || '', title: msg.title || '', body: msg.body || '', target: msg.target || null });
    st.loadedAt = 0; refresh();
  };
  // Samma ljud/vibration/toast används av Prognos-notiser (prognos-notis.js)
  // item (valfritt): { key, tag, target } -> rutan leder dit, t.ex. Prognos på rätt zon
  B.ring = function (text, item) {
    beep();
    try { if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]); } catch (e) {}
    toast(text, 8000, item);
  };
  B.toast = function (text, ms, item) { toast(text, ms, item); };
  if (supported) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'bev-push') return;
      var m = e.data.msg || {};
      // Prognos-push hanteras globalt av prognos-notis.js (avdubblering mot appens egen koll)
      if (String(m.tag || '').indexOf('prognos') === 0) { if (window.PROGNOS_NOTIS && PROGNOS_NOTIS.onPush) PROGNOS_NOTIS.onPush(m, e.data.key); return; }
      B.alert(m, e.data.key);
    });
  }

  // ---------- bevakningar ----------
  function refresh(force) {
    if (!token() || st.loading || (!force && Date.now() - st.loadedAt < 60000)) return Promise.resolve();
    st.loading = true;
    return rpc('watch_list', {}).then(function (l) { st.list = l || []; st.loadedAt = Date.now(); })
      .catch(function () {}).then(function () { st.loading = false; repaint(); });
  }
  function toggle(key, item) {
    var k = parseKey(key); if (!k || !token()) return;
    var on = !watchOf(key);
    var state = {};
    if (item && on) {
      if (k.kind === 'flyg') { state.landed = !!item.act; state.firstBag = /Första väskan/.test(item.info || ''); state.lastBag = !!(item.lastBag && item.act && item.lastBag >= item.act - 30 * 60000); }
      else state.arrived = !!item.act;
      state.canceled = !!item.canceled;
      if (item.est && item.sched && Math.abs(item.est - item.sched) >= 60000) state.est = new Date(item.est).toISOString();
    }
    rpc('watch_set', { p_kind: k.kind, p_ident: k.ident, p_sched: k.schedRaw, p_on: on,
      p_label: item ? item.from : null, p_sub: item ? item.sub : null, p_state: state })
      .then(function (l) {
        st.list = l || []; st.loadedAt = Date.now();
        var what = k.kind === 'flyg' ? 'flyget landar, när bagaget rullar och när sista väskan är ute' : 'tåget ankommer';
        toast(on ? '⭐ Bevakas – du får en notis när ' + what + '.' + (st.push === 'on' ? '' : ' Slå på notiser ovanför listan.')
                 : 'Bevakningen är borttagen.');
        repaint();
      }).catch(function (e) {
        toast(e && e.message === 'too_many' ? 'Du kan bevaka högst 20 ankomster.' : 'Det gick inte att ändra bevakningen.');
      });
  }

  // ---------- toast ----------
  var toastTimer = null;
  // item (valfritt): notisen rutan gäller -> tryck öppnar samma ställe som i notisflödet (NOTIS.goTo)
  function toast(text, ms, item) {
    var t = document.getElementById('bev-toast');
    if (!t) { t = document.createElement('div'); t.id = 'bev-toast'; t.className = 'bev-toast'; document.body.appendChild(t); }
    var link = !!(item && window.NOTIS && NOTIS.goTo && (!NOTIS.hasLink || NOTIS.hasLink(item)));
    t.textContent = text;
    t.classList.toggle('bev-toast-link', link);
    if (link) {
      var go = document.createElement('span'); go.className = 'bev-go'; go.textContent = 'Visa ›'; t.appendChild(go);
      t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0'); t.setAttribute('aria-label', text + ' – tryck för att visa');
      var open = function () { clearTimeout(toastTimer); t.classList.remove('show', 'bev-toast-link'); t.onclick = t.onkeydown = null; NOTIS.goTo(item); };
      t.onclick = open;
      t.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    } else {
      t.removeAttribute('role'); t.removeAttribute('tabindex'); t.removeAttribute('aria-label'); t.onclick = t.onkeydown = null;
    }
    t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show', 'bev-toast-link'); t.onclick = t.onkeydown = null; }, ms || 3500);
  }

  // ---------- ritas in i Ankomster ----------
  var host = null;
  function repaint() { if (host && host.isConnected && window.ANKOMSTER && ANKOMSTER.repaint) ANKOMSTER.repaint(); }

  function barHtml() {
    var h = '<div class="bev-bar">';
    var now = Date.now();
    var active = st.list.filter(function (w) { return Date.parse(w.expires_at) > now; });
    if (active.length) {
      h += '<div class="bev-list"><b>⭐ Bevakar</b>' + active.map(function (w) {
        var key = (w.kind === 'flyg' ? 'f' : 't') + w.ident + '|' + w.sched;
        return '<span class="bev-chip">' + (w.kind === 'flyg' ? '✈️ ' : '🚆 ') + esc(w.ident) + ' ' + hm(w.sched) +
          '<button data-bev-del="' + esc(key) + '" aria-label="Sluta bevaka">✕</button></span>';
      }).join('') + '</div>';
    }
    if (st.push === 'on') {
      h += '<div class="bev-row"><span>🔔 Notiser med ljud är på</span><span>' +
        '<button class="bev-btn" data-bev-test' + (st.busy ? ' disabled' : '') + '>Testa</button>' +
        '<button class="bev-btn ghost" data-bev-off' + (st.busy ? ' disabled' : '') + '>Stäng av</button></span></div>';
    } else if (st.push === 'off' || st.push === 'unknown') {
      h += '<button class="bev-btn main" data-bev-on' + (st.busy ? ' disabled' : '') + '>🔔 Aktivera ljudsignal/notiser</button>';
    } else if (st.push === 'denied') {
      h += '<div class="bev-note">🔕 Notiser är blockerade för appen. Tillåt dem i webbläsarens inställningar för taxikit.shop.</div>';
    } else {
      h += '<div class="bev-note">' + (isIos && !standalone
        ? '🔔 På iPhone: lägg först appen på hemskärmen (Dela ⬆️ → Lägg till på hemskärmen) och öppna den därifrån. Kräver iOS 16.4 eller senare.'
        : '🔕 Den här webbläsaren kan inte ta emot notiser.') + '</div>';
    }
    h += '<div class="bev-hint">' + (src() === 'flyg' ? 'Tryck ☆ på ett flyg' : 'Håll fingret på ett tåg') +
      ' för att bevaka det. <button class="bev-link" data-bev-help>' + (st.help ? 'Dölj hjälp' : 'Hjälp') + '</button></div>';
    if (st.help) {
      h += '<div class="bev-help">' +
        '<p><b>Så fungerar det:</b> du får en notis med ljud när ett bevakat flyg landar, när bagaget börjar rulla, när sista väskan är ute, ' +
        'när tiden ändras eller om det ställs in. För tåg: när tåget ankommer. Det fungerar även när telefonen ligger i fickan. ' +
        'Bevakningen tas bort av sig själv en halvtimme efter sista händelsen (för flyg: sista väskan). ' +
        'När du loggar ut stängs notiserna av på telefonen.</p>' +
        '<p><b>Android:</b> tryck "Aktivera ljudsignal/notiser" och välj Tillåt. Kolla att notiser för Chrome inte är avstängda och att telefonen inte står på ljudlöst.</p>' +
        '<p><b>iPhone:</b> öppna taxikit.shop/TaxiData i Safari, tryck Dela ⬆️ → "Lägg till på hemskärmen". Öppna appen från hemskärmen, ' +
        'logga in och tryck "Aktivera ljudsignal/notiser". Kräver iOS 16.4 eller senare.</p>' +
        '<p>Flygtider uppdateras ungefär var 5:e minut, tåg varje minut.</p></div>';
    }
    return h + '</div>';
  }
  function src() { return (window.ANKOMSTER && ANKOMSTER.current && ANKOMSTER.current()) || ''; }

  function bind(el) {
    if (el._bev) return; el._bev = true;
    var timer = null, sx = 0, sy = 0, fired = false, key = null;
    function clear() { clearTimeout(timer); timer = null; }
    el.addEventListener('pointerdown', function (e) {
      var row = e.target.closest('[data-ank-key]');
      if (!row || e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      fired = false; key = row.getAttribute('data-ank-key'); sx = e.clientX; sy = e.clientY;
      row.classList.add('bev-press');
      clear();
      timer = setTimeout(function () {
        fired = true; row.classList.remove('bev-press');
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (x) {}
        toggle(key, window.ANKOMSTER && ANKOMSTER.item ? ANKOMSTER.item(key) : null);
      }, HOLD_MS);
    });
    function cancel() { clear(); var p = el.querySelector('.bev-press'); if (p) p.classList.remove('bev-press'); }
    el.addEventListener('pointermove', function (e) { if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) cancel(); });
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('contextmenu', function (e) { if (e.target.closest('[data-ank-key]')) e.preventDefault(); });
    el.addEventListener('click', function (e) {
      if (fired) { fired = false; e.stopImmediatePropagation(); e.preventDefault(); return; }
      var s = e.target.closest('[data-bev-star]');
      if (s) { var r = s.closest('[data-ank-key]'); var k = r.getAttribute('data-ank-key'); toggle(k, ANKOMSTER.item ? ANKOMSTER.item(k) : null); return; }
      var d = e.target.closest('[data-bev-del]');
      if (d) { toggle(d.getAttribute('data-bev-del'), null); return; }
      if (e.target.closest('[data-bev-on]')) { enable(); return; }
      if (e.target.closest('[data-bev-off]')) { disable(); return; }
      if (e.target.closest('[data-bev-test]')) { test(); return; }
      if (e.target.closest('[data-bev-help]')) { st.help = !st.help; repaint(); }
    }, true);
  }

  // Anropas i slutet av ANKOMSTER paint()
  B.decorate = function (el) {
    host = el; bind(el);
    var head = el.querySelector('.ank-head');
    var wrap = document.createElement('div'); wrap.innerHTML = barHtml();
    if (head) head.parentNode.insertBefore(wrap.firstChild, head.nextSibling);
    if (!st.loadedAt) refresh();
    if (st.push === 'unknown' && !st.checking) { st.checking = true; checkPush().then(function () { st.checking = false; repaint(); }); }
  };
  document.addEventListener('ankomster:data', function () { refresh(); });

  // Registrera service workern i bakgrunden när man är inloggad (så notisklick öppnar appen)
  if (supported && token()) { register().catch(function () {}); }
  // Notisklick (sw.js 'bev-open') sköts nu av notis.js (NOTIS.goTo): rätt flik i Ankomster, rätt zon i Prognos (t551u)
  // ---------- utloggning: inga notiser till en utloggad telefon ----------
  // Avregistrerar push i webbläsaren och tar bort telefonen (och, om ingen annan telefon har notiser, bevakningarna) hos servern.
  // Väntar högst 4 s så att utloggningen aldrig fastnar.
  B.logout = function () {
    var tok = token();
    var work = (supported ? navigator.serviceWorker.getRegistration('./').then(function (r) { return r && r.pushManager.getSubscription(); })
      : Promise.resolve(null)).catch(function () { return null; }).then(function (s) {
        var ep = s ? s.endpoint : null;
        var srv = tok ? rpc('push_logout', { p_endpoint: ep }).catch(function () {}) : Promise.resolve();
        var loc = s ? s.unsubscribe().catch(function () {}) : Promise.resolve();
        return Promise.all([srv, loc]);
      });
    st.list = []; st.push = 'unknown'; savedOnce = false;
    try { if (window.PROGNOS_NOTIS && PROGNOS_NOTIS.logout) PROGNOS_NOTIS.logout(); } catch (e) {}
    return Promise.race([work, new Promise(function (r) { setTimeout(r, 4000); })]);
  };
  // Sessionen har gått ut (servern loggade ut oss): avregistrera lokalt. Push-tjänsten svarar då 410 och servern tar bort raden.
  B.localOff = function () {
    if (!supported) return Promise.resolve();
    return Promise.race([new Promise(function (r) { setTimeout(r, 3000); }), navigator.serviceWorker.getRegistration('./').then(function (r) { return r && r.pushManager.getSubscription(); })
      .then(function (s) { return s && s.unsubscribe(); }).catch(function () {})]);
  };
  // För Prognos → Notiser: samma knapp/flöde som i Ankomster
  B.pushState = function () { return st.push; };
  B.checkPush = function () { return checkPush(); };
  B.enablePush = function () { return enable(); };
  B.testPush = function () { return test(); };
  B._state = st;
})();
