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
  var AUTO_KEY = 'taxi_delad_auto_logout';
  var HIDE_KEY = 'taxi_delad_hide_private';
  var AT = 'taxi_delad_login_at';
  var MSG = 'taxi_delad_logout';
  var PRIVATE_VIEWS = {
    kordata: 1, lonekoll: 1, verkstad: 1, topplistor: 1, forum: 1,
    profil: 1, inkorg: 1, admin: 1, sadmin: 1
  };
  var INTERVAL_MS = 5 * 60 * 1000;
  var timer = null;
  var busy = false;
  var stopped = false;
  var devicesBusy = false;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function isOn() { return get(KEY) === '1'; }
  function isAutoLogout() { return isOn() && get(AUTO_KEY) !== '0' && !isHidePrivate(); }
  function isHidePrivate() { return isOn() && get(HIDE_KEY) === '1'; }
  function isPrivateView(id) { return !!(id && PRIVATE_VIEWS[String(id)]); }
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

  var cachedLabel = '';
  var HINT_KEY = 'taxi_device_hint';
  function cleanModel(m) {
    m = String(m == null ? '' : m).replace(/[\x00-\x1f\x7f<>]+/g, '').replace(/\s+/g, ' ').trim();
    if (!m || m.toUpperCase() === 'K' || /^(android|mobile|linux|unknown|generic)$/i.test(m)) return '';
    return m.slice(0, 40);
  }
  function parseUaModel(ua) {
    var m = /;\s*Android\s+[^;)]+;\s*([^;)]+?)(?:\s+Build\/|\))/i.exec(String(ua || ''));
    return m ? cleanModel(m[1]) : '';
  }
  /* Kort tabell: modellkod (prefix) -> vänligt namn. Okänd kod visas som den är, ev. med märkesnamn. */
  var MODEL_NAMES = {
    'SM-S938': 'Samsung Galaxy S25 Ultra', 'SM-S937': 'Samsung Galaxy S25 Edge',
    'SM-S936': 'Samsung Galaxy S25+', 'SM-S931': 'Samsung Galaxy S25',
    'SM-S928': 'Samsung Galaxy S24 Ultra', 'SM-S926': 'Samsung Galaxy S24+', 'SM-S921': 'Samsung Galaxy S24',
    'SM-S918': 'Samsung Galaxy S23 Ultra', 'SM-S916': 'Samsung Galaxy S23+', 'SM-S911': 'Samsung Galaxy S23',
    'SM-S908': 'Samsung Galaxy S22 Ultra', 'SM-S906': 'Samsung Galaxy S22+', 'SM-S901': 'Samsung Galaxy S22',
    'SM-G998': 'Samsung Galaxy S21 Ultra', 'SM-G996': 'Samsung Galaxy S21+', 'SM-G991': 'Samsung Galaxy S21',
    'SM-F966': 'Samsung Galaxy Z Fold 7', 'SM-F956': 'Samsung Galaxy Z Fold 6', 'SM-F946': 'Samsung Galaxy Z Fold 5',
    'SM-F761': 'Samsung Galaxy Z Flip 7', 'SM-F741': 'Samsung Galaxy Z Flip 6', 'SM-F731': 'Samsung Galaxy Z Flip 5',
    'SM-A566': 'Samsung Galaxy A56', 'SM-A556': 'Samsung Galaxy A55', 'SM-A546': 'Samsung Galaxy A54',
    'SM-A536': 'Samsung Galaxy A53', 'SM-A366': 'Samsung Galaxy A36', 'SM-A356': 'Samsung Galaxy A35',
    'SM-A266': 'Samsung Galaxy A26', 'SM-A256': 'Samsung Galaxy A25', 'SM-A166': 'Samsung Galaxy A16', 'SM-A155': 'Samsung Galaxy A15',
    'SM-X216': 'Samsung Galaxy Tab A9', 'SM-X210': 'Samsung Galaxy Tab A9',
    'SM-X205': 'Samsung Galaxy Tab A8', 'SM-X200': 'Samsung Galaxy Tab A8',
    'SM-X516': 'Samsung Galaxy Tab S9 FE', 'SM-X510': 'Samsung Galaxy Tab S9 FE',
    'SM-X616': 'Samsung Galaxy Tab S9 FE+', 'SM-X610': 'Samsung Galaxy Tab S9 FE+',
    'SM-X710': 'Samsung Galaxy Tab S9', 'SM-X810': 'Samsung Galaxy Tab S9+', 'SM-X910': 'Samsung Galaxy Tab S9 Ultra',
    'SM-X726': 'Samsung Galaxy Tab S10+', 'SM-X820': 'Samsung Galaxy Tab S10+', 'SM-X926': 'Samsung Galaxy Tab S10 Ultra',
    'CPH2653': 'OnePlus 13', 'CPH2645': 'OnePlus 13', 'CPH2649': 'OnePlus 13R',
    'CPH2581': 'OnePlus 12', 'CPH2573': 'OnePlus 12R', 'CPH2449': 'OnePlus 11', 'CPH2451': 'OnePlus 11R',
    'A142': 'Nothing Phone (3)', 'A065': 'Nothing Phone (2a)', 'A063': 'Nothing Phone (2)'
  };
  function mapModelCode(raw) {
    var m = cleanModel(raw);
    if (!m) return '';
    if (/^pixel\b/i.test(m) || /^nexus\b/i.test(m) || /^iphone\b/i.test(m) || /^ipad\b/i.test(m)) return m;
    var key = m.toUpperCase().replace(/\s+/g, '');
    var best = '', bestLen = 0, k;
    for (k in MODEL_NAMES) {
      if (!Object.prototype.hasOwnProperty.call(MODEL_NAMES, k)) continue;
      if (key === k || key.indexOf(k) === 0) {
        if (k.length > bestLen) { best = MODEL_NAMES[k]; bestLen = k.length; }
      }
    }
    if (best) return best;
    if (/^SM-|^GT-|^SCH-|^SGH-/.test(key)) return 'Samsung ' + m;
    if (/^ONEPLUS|^OP5|^KB200|^LE21|^IN20/.test(key)) return /^oneplus/i.test(m) ? m : 'OnePlus ' + m;
    if (/^CPH\d/.test(key)) return 'Oppo ' + m;
    if (/^(REDMI|POCO|MI |M2\d{3}|2[0-9]{6,}|2208|2211|2304|2307|2311|2312|2406|2407|2410|2411)/.test(key)) return 'Xiaomi ' + m;
    if (/^XT\d|^MOTOROLA|^MOTO/.test(key)) return /^moto/i.test(m) ? m : 'Motorola ' + m;
    if (/^XQ-|^SO-\d|^XQX|^XPERIA/.test(key)) return /xperia/i.test(m) ? m : 'Sony Xperia';
    if (/^A0[0-9]{2}$|^A1[0-9]{2}$|^NOTHING/.test(key)) return 'Nothing ' + m;
    if (/^RMX|^REALME/.test(key)) return /realme/i.test(m) ? m : 'Realme ' + m;
    if (/^HONOR|^ALI-|^ANN-|^REP-/.test(key)) return /honor/i.test(m) ? m : 'Honor ' + m;
    if (/^ANY-|^CLS-|^HUAWEI|^LYA-|^VOG-/.test(key)) return /huawei/i.test(m) ? m : 'Huawei ' + m;
    return m;
  }
  function iosName(ua, kind) {
    var u = String(ua || '');
    if (/ipad/i.test(u) || (kind === 'platta' && /macintosh/i.test(u) && /mobile|safari/i.test(u))) return 'iPad';
    if (/macintosh/i.test(u) && kind === 'platta') return 'iPad';
    if (/iphone|ipod/i.test(u)) return 'iPhone';
    return '';
  }
  function browserName(ua) {
    var u = String(ua || '');
    if (/Edg\//.test(u)) return 'Edge';
    if (/OPR\/|Opera\//.test(u)) return 'Opera';
    if (/Firefox\/|FxiOS\//.test(u)) return 'Firefox';
    if (/CriOS\/|Chrome\//.test(u) && !/Edg\//.test(u)) return 'Chrome';
    if (/Safari\//.test(u) && !/Chrome|CriOS|Chromium|Edg|OPR|FxiOS/.test(u)) return 'Safari';
    return '';
  }
  function osName(ua, platform, platformVersion) {
    var p = String(platform || ''), u = String(ua || ''), ver = String(platformVersion || '');
    var major = parseInt(ver, 10);
    if (/windows/i.test(p) || /windows nt/i.test(u)) {
      if (major >= 13) return 'Windows 11';
      if (major >= 10 || /windows nt 10/i.test(u)) return 'Windows 10';
      return 'Windows';
    }
    if (/mac/i.test(p) || /macintosh|mac os/i.test(u)) return 'macOS';
    if (/cros|chrome os/i.test(p + ' ' + u)) return 'ChromeOS';
    if (/android/i.test(p) || /android/i.test(u)) return major ? ('Android ' + major) : 'Android';
    if (/linux/i.test(p) || /linux/i.test(u)) return 'Linux';
    return p;
  }
  function friendlyDeviceName(raw, ua, kind, platform, platformVersion) {
    var ios = iosName(ua, kind);
    if (ios) return ios;
    var mapped = mapModelCode(raw);
    if (mapped) return mapped;
    if (kind === 'dator') {
      var br = browserName(ua), os = osName(ua, platform, platformVersion);
      if (br && os) return br + ' på ' + os;
      return br || os || '';
    }
    return '';
  }
  function readHintCache(ua) {
    try {
      var o = JSON.parse(localStorage.getItem(HINT_KEY) || '');
      if (o && typeof o === 'object' && o.ua === ua) return o;
    } catch (e) {}
    return null;
  }
  function writeHintCache(ua, o) {
    try {
      o = o || {};
      o.ua = ua;
      o.at = Date.now();
      localStorage.setItem(HINT_KEY, JSON.stringify(o));
    } catch (e2) {}
  }

  function detectDeviceKind(ua, w, h, touchPoints, uadMobile, deladOn) {
    if (deladOn) return 'platta';
    var u = String(ua || '').toLowerCase();
    var tp = Number(touchPoints || 0);
    if (/ipad|tablet|kindle|playbook|silk/.test(u) || (/macintosh/.test(u) && tp > 1)) return 'platta';
    var sw = Number(w || 0), sh = Number(h || 0);
    var shortSide = Math.min(sw, sh), longSide = Math.max(sw, sh);
    if (/android/.test(u)) {
      if (!/mobile/.test(u)) return 'platta';
      if (uadMobile === false) return 'platta';
      if (sw > 0 && sh > 0 && shortSide >= 580 && longSide >= 800) return 'platta';
      return 'telefon';
    }
    if (/iphone|ipod/.test(u)) return 'telefon';
    if (sw > 0 && sh > 0 && shortSide >= 580 && longSide >= 800 && (tp > 0 || shortSide < 900)) return 'platta';
    if (/windows|macintosh|linux/.test(u) && !/mobile|android|iphone/.test(u) && tp <= 1) return 'dator';
    if (sw >= 1024 && sh >= 680 && tp <= 1) return 'dator';
    return (shortSide >= 580 && longSide >= 800) ? 'platta' : 'telefon';
  }
  function defaultLabelFor(kind, model) {
    var ico = kind === 'platta' ? '🚕' : (kind === 'dator' ? '💻' : '📱');
    var name = cleanModel(model) || (kind === 'platta' ? 'Platta' : (kind === 'dator' ? 'Dator' : 'Telefon'));
    return ico + ' ' + name;
  }
  function fetchUaData(ua) {
    var fallbackModel = parseUaModel(ua);
    var fallback = { model: fallbackModel, platform: '', platformVersion: '' };
    try {
      var uad = navigator.userAgentData;
      if (uad && typeof uad.getHighEntropyValues === 'function') {
        return Promise.race([
          uad.getHighEntropyValues(['model', 'platform', 'platformVersion']).then(function (v) {
            v = v || {};
            var plat = '';
            try { plat = String((v.platform || uad.platform || '') || ''); } catch (e0) { plat = String(v.platform || ''); }
            return {
              model: cleanModel(v.model) || fallbackModel,
              platform: plat,
              platformVersion: String(v.platformVersion || '')
            };
          }).catch(function () { return fallback; }),
          new Promise(function (res) { setTimeout(function () { res(fallback); }, 500); })
        ]);
      }
    } catch (e) {}
    return Promise.resolve(fallback);
  }
  function refreshHomeDevices() {
    var box = document.getElementById('home-devices');
    if (box && box.innerHTML) renderDevices(box);
  }
  function reportDevice() {
    var t = token();
    if (!t || typeof window.rpc !== 'function') return Promise.resolve();
    var w = 0, h = 0, tp = 0, uadMob = null;
    try { w = screen.width || window.innerWidth || 0; h = screen.height || window.innerHeight || 0; } catch (e) {}
    try { tp = navigator.maxTouchPoints || 0; } catch (e1) {}
    try { if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') uadMob = navigator.userAgentData.mobile; } catch (e2) {}
    var ua = '';
    try { ua = (navigator.userAgent || '').slice(0, 200); } catch (e3) {}
    var kind = detectDeviceKind(ua, w, h, tp, uadMob, isOn());
    var cached = readHintCache(ua);
    if (cached && cached.label) cachedLabel = cached.label;
    return fetchUaData(ua).then(function (info) {
      var name = friendlyDeviceName(info.model, ua, kind, info.platform, info.platformVersion);
      cachedLabel = defaultLabelFor(kind, name);
      writeHintCache(ua, { model: info.model, name: name, label: cachedLabel, kind: kind });
      var args = { p_token: t, p_ua: ua, p_width: w, p_height: h, p_model: name || info.model || null, p_kind: kind };
      return Promise.resolve(window.rpc('session_set_device', args)).then(function (r) {
        if (r && r.label) cachedLabel = r.label;
        refreshHomeDevices();
      }).catch(function () {
        return Promise.resolve(window.rpc('session_set_device', { p_token: t, p_ua: ua, p_width: w, p_height: h })).catch(function () {}).then(function () { refreshHomeDevices(); });
      });
    });
  }

  function applyPrivateMode() {
    try { document.documentElement.classList.toggle('delad-hide-private', isHidePrivate()); } catch (e) {}
    try { if (window.HEM_SIDOR && HEM_SIDOR.sync && window.NAV_VIEW) HEM_SIDOR.sync(window.NAV_VIEW() === ''); } catch (e2) {}
    try { if (typeof window.onDeladModeChange === 'function') window.onDeladModeChange(); } catch (e3) {}
  }

  function applyLoginForm() {
    var on = isOn();
    var idEl = document.getElementById('driver-id');
    var pwEl = document.getElementById('password');
    var fgEl = document.getElementById('forgot-id');
    if (idEl) {
      idEl.setAttribute('autocomplete', on ? 'off' : 'username');
      if (on) {
        idEl.setAttribute('name', 'taxi_uid_nosave');
        idEl.setAttribute('data-lpignore', 'true');
        idEl.setAttribute('data-1p-ignore', 'true');
        idEl.setAttribute('data-form-type', 'other');
      } else {
        idEl.removeAttribute('name');
        idEl.removeAttribute('data-lpignore');
        idEl.removeAttribute('data-1p-ignore');
        idEl.removeAttribute('data-form-type');
      }
    }
    if (pwEl) {
      pwEl.type = on ? 'text' : 'password';
      if (pwEl.classList) pwEl.classList.toggle('pw-masked', on);
      pwEl.setAttribute('autocomplete', on ? 'off' : 'current-password');
      if (on) {
        pwEl.setAttribute('name', 'taxi_pw_nosave');
        pwEl.setAttribute('data-lpignore', 'true');
        pwEl.setAttribute('data-1p-ignore', 'true');
        pwEl.setAttribute('data-form-type', 'other');
      } else {
        pwEl.removeAttribute('name');
        pwEl.removeAttribute('data-lpignore');
        pwEl.removeAttribute('data-1p-ignore');
        pwEl.removeAttribute('data-form-type');
      }
    }
    if (fgEl) fgEl.setAttribute('autocomplete', on ? 'off' : 'username');
  }

  function markLogin() {
    if (!isAutoLogout()) { del(AT); syncFlag(false); reportDevice(); return; }
    put(AT, new Date().toISOString());
    syncFlag(true);
  }

  function ensureLoginAt() {
    if (!isAutoLogout()) return;
    if (!loginAt()) markLogin();
  }

  function setOn(on) {
    if (on) {
      put(KEY, '1');
      if (isAutoLogout()) {
        if (!loginAt()) markLogin();
        else syncFlag(true);
      } else {
        del(AT);
        syncFlag(false);
      }
      start();
    } else {
      del(KEY);
      del(AT);
      syncFlag(false);
      stop();
    }
    applyLoginForm();
    applyPrivateMode();
    try { if (window.TEMA && TEMA.applyLayout) TEMA.applyLayout(); } catch (e) {}
    reportDevice();
  }

  function applyAutoLogoutState() {
    if (!isOn()) return;
    if (isAutoLogout()) {
      if (!loginAt()) markLogin();
      else syncFlag(true);
      start();
    } else {
      del(AT);
      syncFlag(false);
      stop();
    }
  }

  function setAutoLogout(on) {
    put(AUTO_KEY, on ? '1' : '0');
    applyAutoLogoutState();
  }

  function setHidePrivate(on) {
    put(HIDE_KEY, on ? '1' : '0');
    applyPrivateMode();
    applyAutoLogoutState();
  }

  function isDemo() {
    try { return !!(window.DEMO && DEMO.on && DEMO.on()); } catch (e) { return false; }
  }

  function shouldWatch() {
    return isAutoLogout() && !!token() && !!loginAt() && !isDemo();
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
    applyPrivateMode();
    if (!token()) return;
    if (isHidePrivate()) hideAfterLoginMsg(); else showAfterLogin();
    reportDevice();
    if (!isAutoLogout() || isDemo()) { stop(); del(AT); if (!isDemo()) syncFlag(false); return; }
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
    reportDevice();
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
    function devicesFallback() {
      box.innerHTML = '<div class="home-devices-h">Inloggade enheter</div><div class="home-devices-row" role="list">' +
        '<div class="home-dev home-dev-this" role="listitem"><div class="home-dev-name">' + esc(cachedLabel || 'Denna enhet') + '</div></div></div>';
    }
    if (isHidePrivate() || !token() || isDemo()) {
      box.innerHTML = '';
      return;
    }
    if (typeof window.rpc !== 'function') {
      devicesFallback();
      return;
    }
    box.innerHTML = '<div class="home-devices-h">Inloggade enheter</div><div class="home-devices-row" role="list">Hämtar…</div>';
    Promise.resolve(window.rpc('list_my_sessions', { p_token: token() }))
      .then(function (r) {
        var list = (r && r.devices) || [];
        var byId = {};
        var row = '<div class="home-devices-h">Inloggade enheter</div>';
        row += '<div class="home-devices-row" role="list">';
        if (!list.length) {
          row += '<div class="home-dev home-dev-this" role="listitem"><div class="home-dev-name">' + esc(cachedLabel || 'Denna enhet') + '</div></div>';
        } else {
          list.forEach(function (d) {
            var label = d.label || 'Enhet';
            if (d.current) cachedLabel = label;
            var meta = seenLabel(d.last_seen);
            var cls = 'home-dev' + (d.current ? ' home-dev-this' : '');
            var id = d.id || '';
            byId[id] = d;
            if (d.current) {
              row += '<button type="button" class="' + cls + '" role="listitem" data-dev="' + esc(id) + '" data-label="' + esc(label) + '" data-cur="1">' +
                '<div class="home-dev-name">' + esc(label) + ' <span aria-hidden="true" style="font-weight:400;opacity:.7">✏️</span></div>' +
                '<div class="home-dev-meta">' + (meta ? esc(meta) + ' · ' : '') + 'denna enhet</div></button>';
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
          if (!btn) return;
          var did = btn.getAttribute('data-dev');
          var dev = byId[did] || { id: did, label: btn.getAttribute('data-label'), current: btn.getAttribute('data-cur') === '1' };
          askDevice(box, dev);
        };
      })
      .catch(function () { devicesFallback(); });
  }

  function askDevice(box, dev) {
    var ask = box.querySelector('.home-dev-ask');
    if (!ask || !dev || !dev.id) return;
    ask.hidden = false;
    var curVal = dev.custom_name || '';
    var autoPh = dev.auto_label || dev.label || 'T.ex. Plattan i bilen';
    ask.innerHTML =
      '<p>' + esc(dev.label || 'Enhet') + (dev.current ? ' (denna enhet)' : '') + '</p>' +
      '<div style="display:flex;gap:6px;margin:6px 0">' +
        '<input type="text" maxlength="40" class="home-dev-name-inp" value="' + esc(curVal) + '" placeholder="' + esc(autoPh) + '" aria-label="Namn på enhet" style="flex:1;min-width:0;padding:7px 9px;border-radius:8px;border:1px solid var(--border,#cbd5e0);font:inherit">' +
        '<button type="button" data-dev-save="' + esc(dev.id) + '" style="padding:7px 12px;border-radius:8px;background:var(--primary,#2b6cb0);color:#fff;border:0;font-weight:700">Spara</button>' +
      '</div>' +
      '<div class="home-dev-ask-btns">' +
        (curVal ? '<button type="button" data-dev-reset="' + esc(dev.id) + '">Återställ namn</button>' : '') +
        (!dev.current ? '<button type="button" class="home-dev-ask-go" data-dev-logout="' + esc(dev.id) + '">Logga ut enhet</button>' : '') +
        '<button type="button" data-dev-cancel>Stäng</button>' +
      '</div>';
    ask.onclick = function (e) {
      if (e.target.getAttribute('data-dev-cancel') !== null) { ask.hidden = true; ask.innerHTML = ''; return; }
      var saveId = e.target.getAttribute('data-dev-save');
      var resetId = e.target.getAttribute('data-dev-reset');
      var outId = e.target.getAttribute('data-dev-logout');
      if ((saveId || resetId) && !devicesBusy) {
        var inp = ask.querySelector('.home-dev-name-inp');
        var newName = resetId ? '' : (inp ? inp.value.trim() : '');
        devicesBusy = true;
        Promise.resolve(window.rpc('session_rename_device', { p_token: token(), p_device_id: saveId || resetId, p_name: newName }))
          .then(function (r) {
            devicesBusy = false;
            ask.hidden = true;
            if (r && r.ok) renderDevices(box);
          })
          .catch(function () { devicesBusy = false; ask.hidden = true; });
        return;
      }
      if (outId && !devicesBusy) {
        devicesBusy = true;
        Promise.resolve(window.rpc('logout_my_session', { p_token: token(), p_device_id: outId }))
          .then(function (r) {
            devicesBusy = false;
            ask.hidden = true;
            if (r && r.ok) renderDevices(box);
          })
          .catch(function () { devicesBusy = false; ask.hidden = true; });
      }
    };
  }

  function renderSettings(box) {
    if (!box) return;
    var on = isOn();
    var autoSaved = get(AUTO_KEY) !== '0';
    var hideOn = get(HIDE_KEY) === '1';
    var autoLocked = hideOn;
    box.innerHTML = '<div class="section"><h3 style="margin-top:0">Delad enhet</h3>' +
      '<p style="font-size:.9rem;color:var(--text-soft);margin:.3rem 0">' +
      'Slå på det här på en platta som flera förare delar, till exempel i bilen. Då ber inloggningen inte om att spara lösenord på enheten, och du kan välja hur kontot ska skyddas. På din egen telefon ska det vara av.</p>' +
      '<div class="hl-opts" role="radiogroup">' +
        '<label class="hl-opt' + (!on ? ' on' : '') + '"><input type="radio" name="delad-enhet" value="0"' + (!on ? ' checked' : '') + '><span>Av</span></label>' +
        '<label class="hl-opt' + (on ? ' on' : '') + '"><input type="radio" name="delad-enhet" value="1"' + (on ? ' checked' : '') + '><span>På</span></label>' +
      '</div>' +
      (on ? '<div class="delad-sub">' +
        '<label class="delad-chk' + (autoSaved && !autoLocked ? ' on' : '') + (autoLocked ? ' delad-chk-disabled' : '') + '">' +
          '<input type="checkbox" name="delad-auto-logout"' + (autoSaved ? ' checked' : '') + (autoLocked ? ' disabled' : '') + '>' +
          '<span><span class="delad-chk-t">Logga ut automatiskt</span>' +
          '<span class="delad-chk-d">' + (autoLocked
            ? 'Av så länge privata moduler är dolda. Går tillbaka till ditt val när du visar dem igen.'
            : 'Loggar ut automatiskt när ditt pass är slut, eller om data inte uppdaterats på ett tag.') + '</span></span>' +
        '</label>' +
        '<label class="delad-chk' + (hideOn ? ' on' : '') + '">' +
          '<input type="checkbox" name="delad-hide-private"' + (hideOn ? ' checked' : '') + '>' +
          '<span><span class="delad-chk-t">Dölj privata moduler</span>' +
          '<span class="delad-chk-d">Döljer och laddar inte kördata, lön, rapporter, ärenden, meddelanden, den fullständiga profilen och admin. Notiser och en begränsad profil (namn, förarnummer och logga ut) finns kvar, liksom Ankomster, Prognos, Väder, Nyheter, Kalender och Mina bevakningar.</span></span>' +
        '</label>' +
      '</div>' : '') +
      '</div>';
    box.onchange = function (e) {
      if (!e.target) return;
      if (e.target.name === 'delad-enhet') {
        setOn(e.target.value === '1');
        renderSettings(box);
      } else if (e.target.name === 'delad-auto-logout') {
        setAutoLogout(!!e.target.checked);
        renderSettings(box);
      } else if (e.target.name === 'delad-hide-private') {
        setHidePrivate(!!e.target.checked);
        renderSettings(box);
      }
    };
  }

  window.DELAD = {
    isOn: isOn,
    isAutoLogout: isAutoLogout,
    isHidePrivate: isHidePrivate,
    isPrivateView: isPrivateView,
    setOn: setOn,
    setAutoLogout: setAutoLogout,
    setHidePrivate: setHidePrivate,
    applyLoginForm: applyLoginForm,
    applyPrivateMode: applyPrivateMode,
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
    detectDeviceKind: detectDeviceKind,
    parseUaModel: parseUaModel,
    mapModelCode: mapModelCode,
    friendlyDeviceName: friendlyDeviceName,
    currentLabel: function () { return cachedLabel || (isOn() ? '🚕 Platta' : 'Enhet'); },
    check: check
  };

  try { document.documentElement.classList.toggle('delad-hide-private', isHidePrivate()); } catch (e) {}
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { dropLegacyLogout(); applyLoginForm(); });
  } else {
    dropLegacyLogout();
    applyLoginForm();
  }
})();
