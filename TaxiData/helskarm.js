/* Helskärm för hela appen. Laddas på alla sidor (efter tema.js).
   Använder Fullscreen API på document.documentElement så att Chromes adressrad försvinner.
   Appens egen meny och navigation stannar kvar. Läget följer med när man byter sida i appen.
   Om API:t saknas eller nekas växlar knappen ändå visningsläget (body.app-fs). */
(function () {
  var manual = false;
  var btn = null;
  var lastOn = null;
  var placeTimer = 0;

  function fsEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }
  function isOn() { return !!fsEl() || manual; }

  function request() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
    if (!fn) { manual = true; sync(); return Promise.resolve(false); }
    try {
      return Promise.resolve(fn.call(el, { navigationUI: 'hide' })).then(function () {
        manual = false;
        sync();
        return true;
      }).catch(function () {
        manual = true;
        sync();
        return false;
      });
    } catch (e) {
      manual = true;
      sync();
      return Promise.resolve(false);
    }
  }

  function exit() {
    manual = false;
    if (!fsEl()) { sync(); return Promise.resolve(); }
    var fn = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.msExitFullscreen;
    if (!fn) { sync(); return Promise.resolve(); }
    try {
      return Promise.resolve(fn.call(document)).then(function () { sync(); }).catch(function () { sync(); });
    } catch (e) {
      sync();
      return Promise.resolve();
    }
  }

  function toggle() { return isOn() ? exit() : request(); }

  function notify(on) {
    try { document.dispatchEvent(new CustomEvent('helskarmchange', { detail: { on: on } })); } catch (e) {}
    try {
      if (window.PROGNOS && typeof PROGNOS.onFullscreen === 'function') PROGNOS.onFullscreen(on);
    } catch (e) {}
  }

  function syncBtn(b, on) {
    if (!b) return;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? 'Avsluta helskärm' : 'Helskärm');
    b.title = on ? 'Avsluta helskärm' : 'Helskärm';
    b.classList.toggle('on', !!on);
  }

  function isHidden(el) {
    var cur = el;
    while (cur && cur !== document.documentElement) {
      if (cur.classList && cur.classList.contains('hidden')) return true;
      if (cur.style && cur.style.display === 'none') return true;
      var id = cur.id;
      if (id === 'login-screen' && cur.style && cur.style.display === 'none') return true;
      try {
        var cs = window.getComputedStyle(cur);
        if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      } catch (e) {}
      cur = cur.parentElement;
    }
    return !el;
  }

  function visibleHeader() {
    var list = document.querySelectorAll('header');
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (isHidden(h)) continue;
      var r = h.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      return h;
    }
    return null;
  }

  function ensure() {
    if (btn && btn.isConnected) return btn;
    btn = document.querySelector('button.app-fs-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-fs-btn';
      btn.setAttribute('data-app-fs', '1');
      btn.appendChild(document.createTextNode('⛶'));
    }
    if (!btn._helskarmBound) {
      btn._helskarmBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      });
    }
    return btn;
  }

  function ensureHeaderSlots(h) {
    var left = h.querySelector('.hdr-left');
    if (!left) {
      left = document.createElement('div');
      left.className = 'hdr-left';
      h.insertBefore(left, h.firstChild);
      var n = left.nextElementSibling;
      while (n && n.tagName === 'BUTTON') {
        var next = n.nextElementSibling;
        left.appendChild(n);
        n = next;
      }
    }
    var right = h.querySelector('.hdr-right');
    if (!right) {
      right = document.createElement('div');
      right.className = 'hdr-right';
      h.appendChild(right);
      Array.prototype.slice.call(h.children).forEach(function (el) {
        if (el === left || el === right) return;
        if (el.tagName === 'H1') return;
        if (el.tagName === 'BUTTON' || (el.classList && el.classList.contains('profile-btn'))) {
          right.appendChild(el);
        }
      });
    }
    return left;
  }

  function place() {
    if (!document.body) return;
    ensure();
    var h = visibleHeader();
    if (!h) {
      if (btn.parentNode !== document.body) document.body.appendChild(btn);
      btn.classList.add('app-fs-btn-float');
      return;
    }
    var left = ensureHeaderSlots(h);
    // Alltid till höger om hemknappen, i vänstergruppen — samma på telefon och platta.
    if (btn.parentNode !== left) left.appendChild(btn);
    else if (left.lastElementChild !== btn) left.appendChild(btn);
    btn.classList.remove('app-fs-btn-float');
  }

  function sync() {
    var on = isOn();
    if (document.body) document.body.classList.toggle('app-fs', on);
    place();
    document.querySelectorAll('button.app-fs-btn').forEach(function (b) { syncBtn(b, on); });
    if (lastOn !== on) {
      lastOn = on;
      notify(on);
    }
  }

  function onFsChange() {
    if (fsEl()) manual = false;
    else if (!manual) { /* exited via back/swipe */ }
    sync();
  }

  function schedulePlace() {
    if (placeTimer) cancelAnimationFrame(placeTimer);
    placeTimer = requestAnimationFrame(function () { placeTimer = 0; place(); });
  }

  function isLandscape() {
    try {
      if (window.matchMedia && window.matchMedia('(orientation: landscape)').matches) return true;
      if (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) return false;
    } catch (e) {}
    try {
      var t = window.screen && screen.orientation && screen.orientation.type;
      if (t) return String(t).indexOf('landscape') === 0;
    } catch (e2) {}
    return (window.innerWidth || 0) > (window.innerHeight || 0);
  }

  // Vid vridning tillbaka till stående: lämna helskärm (exitFullscreen kräver ingen gest).
  // Gå inte in i helskärm automatiskt vid liggande – det kräver en gest, använd ⛶.
  var lastLand = isLandscape();
  function onOrient() {
    var land = isLandscape();
    if (lastLand && !land && isOn()) exit();
    lastLand = land;
    schedulePlace();
  }

  function boot() {
    ensure();
    place();
    sync();
    lastLand = isLandscape();
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);
    if (window.MutationObserver) {
      var obs = new MutationObserver(schedulePlace);
      obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class', 'hidden'] });
    }
    window.addEventListener('resize', onOrient);
    try {
      if (window.matchMedia) {
        var mq = matchMedia('(orientation: portrait)');
        if (mq.addEventListener) mq.addEventListener('change', onOrient);
        else if (mq.addListener) mq.addListener(onOrient);
      }
    } catch (e) {}
    try {
      if (window.screen && screen.orientation && screen.orientation.addEventListener) {
        screen.orientation.addEventListener('change', onOrient);
      }
    } catch (e2) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.HELSKARM = {
    isOn: isOn,
    toggle: toggle,
    request: request,
    exit: exit,
    place: place,
    sync: sync
  };
})();
