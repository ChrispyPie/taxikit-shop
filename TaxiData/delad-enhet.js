/* Delad enhet (Inställningar). Device-lokal, sparas i localStorage 'taxi_delad_enhet' (av som standard).
 * På delade plattor i bilen: minns inloggningstiden ('taxi_delad_login_at') och frågar servern
 * då och då (var 5:e minut och när appen blir synlig) om timkörningen har registrerat ett
 * avslutat pass vars sluttid är efter inloggningen. I så fall loggas föraren ut och meddelandet
 * "Passet är avslutat – du har loggats ut" visas. Ingen egen timer. Den egna telefonen (av) påverkas inte.
 * Ångra: ta bort anropen i index.html, den här filen, inställningsrutan och ev. RPC pass_ended_since. */
(function () {
  var KEY = 'taxi_delad_enhet';
  var AT = 'taxi_delad_login_at';
  var MSG = 'taxi_delad_msg';
  var TEXT = 'Passet är avslutat – du har loggats ut';
  var INTERVAL_MS = 5 * 60 * 1000;
  var timer = null;
  var busy = false;
  var stopped = false;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function isOn() { return get(KEY) === '1'; }
  function loginAt() { return get(AT); }

  function markLogin() {
    if (!isOn()) { del(AT); return; }
    put(AT, new Date().toISOString());
  }

  function ensureLoginAt() {
    if (!isOn()) return;
    if (!loginAt()) markLogin();
  }

  function setOn(on) {
    if (on) {
      put(KEY, '1');
      if (!loginAt()) markLogin();
      start();
    } else {
      del(KEY);
      del(AT);
      stop();
    }
  }

  function showPendingMessage() {
    var flag;
    try { flag = sessionStorage.getItem(MSG); if (flag) sessionStorage.removeItem(MSG); } catch (e) { flag = null; }
    if (!flag) return;
    var el = document.getElementById('login-notice');
    if (!el) return;
    el.textContent = TEXT;
    el.style.display = 'block';
  }

  function isDemo() {
    try { return !!(window.DEMO && DEMO.on && DEMO.on()); } catch (e) { return false; }
  }

  function shouldWatch() {
    return isOn() && !!get('taxi_session') && !!loginAt() && !isDemo();
  }

  function signOutForPass() {
    if (stopped) return;
    stopped = true;
    stop();
    try { sessionStorage.setItem(MSG, '1'); } catch (e) {}
    if (typeof window.logout === 'function') {
      Promise.resolve(window.logout()).catch(function () { hardExit(); });
    } else {
      hardExit();
    }
  }

  function hardExit() {
    del(AT);
    del('taxi_session');
    del('taxi_logged_in');
    del('taxi_driver');
    del('taxi_view');
    try { location.reload(); } catch (e) {}
  }

  function check() {
    if (!shouldWatch() || busy) return;
    var since = loginAt();
    var token = get('taxi_session') || '';
    if (!since || !token || typeof window.rpc !== 'function') return;
    busy = true;
    Promise.resolve(window.rpc('pass_ended_since', { p_token: token, p_since: since }))
      .then(function (r) {
        busy = false;
        if (r && r.ended === true) signOutForPass();
      })
      .catch(function () { busy = false; });
  }

  function onVis() {
    if (document.visibilityState === 'visible') check();
  }

  function start() {
    stopped = false;
    if (!isOn() || !get('taxi_session')) return;
    if (isDemo()) return;
    ensureLoginAt();
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

  function renderSettings(box) {
    if (!box) return;
    var on = isOn();
    box.innerHTML = '<div class="section"><h3 style="margin-top:0">Delad enhet</h3>' +
      '<p style="font-size:.9rem;color:var(--text-soft);margin:.3rem 0">' +
      'Slå på det här på en platta som flera förare delar, till exempel i bilen. När timkörningen har registrerat att ditt pass är slut loggas du ut automatiskt, så nästa förare inte kommer in på ditt konto. På din egen telefon ska det vara av.</p>' +
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
    showPendingMessage: showPendingMessage,
    renderSettings: renderSettings,
    check: check
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showPendingMessage);
  } else {
    showPendingMessage();
  }
})();
