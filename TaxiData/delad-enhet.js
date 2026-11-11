/* Delad enhet (Inställningar) och inloggade enheter (startsidan).
 * Delad enhet sparas i localStorage 'taxi_delad_enhet' (av som standard). På delade
 * plattor märks sessionen på servern redan vid inloggning, och igen som backup
 * efteråt (med omförsök). Servern stänger den när passet är slut, när appen
 * används igen, eller om timkörningen inte har uppdaterats på 1 timme. Orsaken sparas på enheten per
 * förar-ID. När samma konto loggar in igen på den enheten visas ett rött meddelande
 * (inte på inloggningsskärmen, så nästa förare inte ser det). Annat konto: visas inte.
 * Övriga inloggade enheter får en notis (push + Notiser). Startsidan visar inloggade
 * enheter; du kan logga ut en annan.
 * Ångra: ta bort anropen i index.html, den här filen, inställningsrutan, ev. RPC:er och cron. */
(function () {
  var KEY = 'taxi_delad_enhet';
  var AT = 'taxi_delad_login_at';
  var MSG = 'taxi_delad_logout';
  var INTERVAL_MS = 5 * 60 * 1000;
  var timer = null;
  var busy = false;
  var stopped = false;
  var devicesBusy = false;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function isOn() { return get(KEY) === '1'; }
  function loginAt() { return get(AT); }
  function token() { return get('taxi_session') || ''; }

  function formatKl(at) {
    var d = at ? new Date(at) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    try {
      return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    } catch (e) {
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
  }

  function fallbackText(reason, at) {
    var kl = formatKl(at);
    var why = reason === 'stale' ? 'servern har inte uppdaterats på 1 timme'
      : reason === 'remote' ? 'utloggad från annan enhet'
      : 'passet avslutat';
    return 'Du loggades ut automatiskt kl ' + kl + ' – ' + why;
  }

  function currentDriver() { return get('taxi_driver') || ''; }
  function msgKey(driver) { return MSG + ':' + String(driver || ''); }

  function dropLegacyLogout() {
    del(MSG);
    try { sessionStorage.removeItem(MSG); } catch (e) {}
  }

  function saveLogout(r) {
    dropLegacyLogout();
    var driver = currentDriver();
    if (!driver) return;
    var text = (r && r.text) || fallbackText(r && r.reason, r && r.at);
    put(msgKey(driver), JSON.stringify({ driver: driver, reason: r && r.reason, at: r && r.at, text: text }));
  }

  function loadLogoutFor(driver) {
    if (!driver) return null;
    try {
      var raw = get(msgKey(driver));
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && o.text) return o;
    } catch (e) {}
    return null;
  }

  function clearLogoutFor(driver) {
    if (driver) del(msgKey(driver));
    dropLegacyLogout();
  }

  function hideAfterLoginMsg() {
    var wrap = document.getElementById('delad-logout-msg');
    if (!wrap) return;
    wrap.hidden = true;
    wrap.classList.remove('is-on');
  }

  function showAfterLogin() {
    dropLegacyLogout();
    hideAfterLoginMsg();
    var driver = currentDriver();
    if (!token() || !driver) return;
    var rec = loadLogoutFor(driver);
    if (!rec || !rec.text) return;
    var wrap = document.getElementById('delad-logout-msg');
    var textEl = document.getElementById('delad-logout-text');
    if (!wrap || !textEl) return;
    textEl.textContent = rec.text;
    wrap.hidden = false;
    wrap.classList.add('is-on');
    clearLogoutFor(driver);
    var close = function () { hideAfterLoginMsg(); };
    var ok = document.getElementById('delad-logout-ok');
    if (ok) ok.onclick = close;
    wrap.onclick = function (e) { if (e.target === wrap) close(); };
  }

  function currentEndpoint(cb) {
    if (!navigator.serviceWorker || !navigator.serviceWorker.ready) { cb(null); return; }
    Promise.resolve(navigator.serviceWorker.ready)
      .then(function (reg) { return reg.pushManager && reg.pushManager.getSubscription && reg.pushManager.getSubscription(); })
      .then(function (sub) { cb(sub && sub.endpoint || null); })
      .catch(function () { cb(null); });
  }

  function syncFlag(on) {
    var t = token();
    if (!t || typeof window.rpc !== 'function') return;
    function send(endpoint, attempt) {
      var args = { p_token: t, p_on: !!on };
      if (endpoint) args.p_endpoint = endpoint;
      Promise.resolve(window.rpc('session_set_delad_enhet', args))
        .then(function () { reportDevice(); })
        .catch(function (e) {
          if (on && e && e.code === '28000') { signOutForPass(); return; }
          var n = attempt || 1;
          if (on && n < 3) {
            setTimeout(function () { send(endpoint, n + 1); }, 800 * n);
            return;
          }
        });
    }
    if (!on) { send(null); return; }
    currentEndpoint(send);
  }

  function reportDevice() {
    var t = token();
    if (!t || typeof window.rpc !== 'function') return;
    var w = 0, h = 0;
    try { w = screen.width || window.innerWidth || 0; h = screen.height || window.innerHeight || 0; } catch (e) {}
    var ua = '';
    try { ua = (navigator.userAgent || '').slice(0, 200); } catch (e2) {}
    Promise.resolve(window.rpc('session_set_device', { p_token: t, p_ua: ua, p_width: w, p_height: h }))
      .catch(function () {});
  }

  function markLogin() {
    if (!isOn()) { del(AT); syncFlag(false); reportDevice(); return; }
    put(AT, new Date().toISOString());
    syncFlag(true);
  }

  function ensureLoginAt() {
    if (!isOn()) return;
    if (!loginAt()) markLogin();
  }

  function setOn(on) {
    if (on) {
      put(KEY, '1');
      if (!loginAt()) markLogin();
      else syncFlag(true);
      start();
    } else {
      del(KEY);
      del(AT);
      syncFlag(false);
      stop();
    }
  }

  function isDemo() {
    try { return !!(window.DEMO && DEMO.on && DEMO.on()); } catch (e) { return false; }
  }

  function shouldWatch() {
    return isOn() && !!token() && !!loginAt() && !isDemo();
  }

  function signOutForPass() {
    if (stopped) return;
    stopped = true;
    stop();
    var go = function () {
      if (typeof window.logout === 'function') {
        Promise.resolve(window.logout()).catch(function () { hardExit(); });
      } else hardExit();
    };
    fetchReason().then(go, go);
  }

  function hardExit() {
    del(AT);
    del('taxi_session');
    del('taxi_logged_in');
    del('taxi_driver');
    del('taxi_view');
    try { location.reload(); } catch (e) {}
  }

  function fetchReason() {
    var t = token();
    if (!t || typeof window.rpc !== 'function') return Promise.resolve();
    return Promise.resolve(window.rpc('session_delad_logout_reason', { p_token: t }))
      .then(function (r) { if (r && r.ended) saveLogout(r); })
      .catch(function () {});
  }

  function onInvalidSession() {
    return fetchReason();
  }

  function check() {
    if (!shouldWatch() || busy) return;
    var since = loginAt();
    var t = token();
    if (!since || !t || typeof window.rpc !== 'function') return;
    busy = true;
    Promise.resolve(window.rpc('pass_ended_since', { p_token: t, p_since: since }))
      .then(function (r) {
        busy = false;
        if (r && r.ended === true) {
          saveLogout({ reason: 'pass', at: new Date().toISOString() });
          signOutForPass();
        }
      })
      .catch(function (e) {
        busy = false;
        if (e && e.code === '28000') signOutForPass();
      });
  }

  function onVis() {
    if (document.visibilityState === 'visible') check();
  }

  function start() {
    stopped = false;
    if (!token()) return;
    showAfterLogin();
    reportDevice();
    if (!isOn() || isDemo()) return;
    ensureLoginAt();
    syncFlag(true);
    if (timer) return;
    timer = setInterval(function () { check(); }, INTERVAL_MS);
    document.addEventListener('visibilitychange', onVis);
    check();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    document.removeEventListener('visibilitychange', onVis);
    busy = false;
  }

  function onClearSession() {
    stop();
    del(AT);
    stopped = false;
  }

  function onLoginSuccess() {
    /* Meddelandet sparas per förar-ID och visas efter inloggning, inte här. */
  }

  function seenLabel(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    var now = Date.now();
    var diff = now - d.getTime();
    if (diff < 2 * 60 * 1000) return 'nu';
    if (diff < 60 * 60 * 1000) return 'för ' + Math.max(1, Math.round(diff / 60000)) + ' min sedan';
    return 'kl ' + formatKl(d);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function renderDevices(box) {
    if (!box) return;
    if (!token() || isDemo() || typeof window.rpc !== 'function') {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = '<div class="home-devices-h">Inloggade enheter</div><div class="home-devices-row" role="list">Hämtar…</div>';
    Promise.resolve(window.rpc('list_my_sessions', { p_token: token() }))
      .then(function (r) {
        var list = (r && r.devices) || [];
        var row = '<div class="home-devices-h">Inloggade enheter</div>';
        row += '<div class="home-devices-row" role="list">';
        if (!list.length) {
          row += '<div class="home-dev home-dev-this" role="listitem"><div class="home-dev-name">Denna enhet</div></div>';
        } else {
          list.forEach(function (d) {
            var label = d.label || 'Enhet';
            var meta = seenLabel(d.last_seen);
            var cls = 'home-dev' + (d.current ? ' home-dev-this' : '');
            var id = d.id || '';
            if (d.current) {
              row += '<div class="' + cls + '" role="listitem"><div class="home-dev-name">' + esc(label) + '</div>' +
                '<div class="home-dev-meta">' + (meta ? esc(meta) + ' · ' : '') + 'denna enhet</div></div>';
            } else {
              row += '<button type="button" class="' + cls + '" role="listitem" data-dev="' + esc(id) + '" data-label="' + esc(label) + '">' +
                '<div class="home-dev-name">' + esc(label) + '</div>' +
                '<div class="home-dev-meta">' + esc(meta) + '</div></button>';
            }
          });
        }
        row += '</div><div class="home-dev-ask" hidden></div>';
        box.innerHTML = row;
        box.onclick = function (e) {
          var btn = e.target && e.target.closest ? e.target.closest('[data-dev]') : null;
          if (btn) askLogout(box, btn.getAttribute('data-dev'), btn.getAttribute('data-label'));
        };
      })
      .catch(function () { box.innerHTML = ''; });
  }

  function askLogout(box, id, label) {
    var ask = box.querySelector('.home-dev-ask');
    if (!ask || !id) return;
    ask.hidden = false;
    ask.innerHTML = '<p>Logga ut ' + esc(label || 'enheten') + '?</p>' +
      '<p class="home-dev-ask-note">Nästa gång den öppnas visas att den loggats ut härifrån.</p>' +
      '<div class="home-dev-ask-btns">' +
        '<button type="button" data-dev-cancel>Avbryt</button>' +
        '<button type="button" class="home-dev-ask-go" data-dev-go="' + esc(id) + '">Logga ut</button>' +
      '</div>';
    ask.onclick = function (e) {
      if (e.target.getAttribute('data-dev-cancel') !== null) { ask.hidden = true; ask.innerHTML = ''; return; }
      var go = e.target.getAttribute('data-dev-go');
      if (!go || devicesBusy) return;
      devicesBusy = true;
      Promise.resolve(window.rpc('logout_my_session', { p_token: token(), p_device_id: go }))
        .then(function (r) {
          devicesBusy = false;
          ask.hidden = true;
          if (r && r.ok) renderDevices(box);
        })
        .catch(function () { devicesBusy = false; ask.hidden = true; });
    };
  }

  function renderSettings(box) {
    if (!box) return;
    var on = isOn();
    box.innerHTML = '<div class="section"><h3 style="margin-top:0">Delad enhet</h3>' +
      '<p style="font-size:.9rem;color:var(--text-soft);margin:.3rem 0">' +
      'Slå på det här på en platta som flera förare delar, till exempel i bilen. När ditt pass är slut loggas du ut automatiskt, även om skärmen varit av, så nästa förare inte kommer in på ditt konto. Om servern inte har uppdaterats på 1 timme loggas du också ut, även mitt i passet. På din egen telefon ska det vara av.</p>' +
      '<div class="hl-opts" role="radiogroup">' +
        '<label class="hl-opt' + (!on ? ' on' : '') + '"><input type="radio" name="delad-enhet" value="0"' + (!on ? ' checked' : '') + '><span>Av</span></label>' +
        '<label class="hl-opt' + (on ? ' on' : '') + '"><input type="radio" name="delad-enhet" value="1"' + (on ? ' checked' : '') + '><span>På</span></label>' +
      '</div></div>';
    box.onchange = function (e) {
      if (!e.target || e.target.name !== 'delad-enhet') return;
      setOn(e.target.value === '1');
      renderSettings(box);
    };
  }

  window.DELAD = {
    isOn: isOn,
    setOn: setOn,
    markLogin: markLogin,
    start: start,
    stop: stop,
    onClearSession: onClearSession,
    onInvalidSession: onInvalidSession,
    onLoginSuccess: onLoginSuccess,
    showAfterLogin: showAfterLogin,
    renderSettings: renderSettings,
    renderDevices: renderDevices,
    reportDevice: reportDevice,
    check: check
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dropLegacyLogout);
  } else {
    dropLegacyLogout();
  }
})();
