/* Helskärm för hela appen. Laddas på alla sidor (efter tema.js).
   I en vanlig Chrome-flik: Fullscreen API på document.documentElement så att
   adressraden försvinner. Appens egen meny och navigation stannar kvar.
   Läget följer med när man byter sida. Om API:t saknas eller nekas växlar
   knappen ändå visningsläget (body.app-fs).
   I installerad PWA (display-mode standalone/fullscreen) är adressraden redan
   borta. Då betyder knappen "Gå ur helskärm" och öppnar samma sida i vanliga
   webbläsaren (se docs/taxidata-pwa-webblasare.md). Service worker/push rörs inte. */
(function () {
  var manual = false;
  var btn = null;
  var lastOn = null;
  var lastImmersive = null;
  var placeTimer = 0;

  var ICON_ENTER = '<svg class="app-fs-ico" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
  var ICON_EXIT = '<svg class="app-fs-ico" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>';

  function fsEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }
  function isOn() { return !!fsEl() || manual; }

  function isStandalone() {
    try {
      if (window.matchMedia && (
        matchMedia('(display-mode: standalone)').matches ||
        matchMedia('(display-mode: fullscreen)').matches ||
        matchMedia('(display-mode: window-controls-overlay)').matches
      )) return true;
    } catch (e) {}
    if (window.navigator && navigator.standalone) return true;
    return false;
  }

  function isImmersive() { return isOn() || isStandalone(); }

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

  function trampolineUrl(url) {
    // Scope är /TaxiData/, så den här sidan ligger utanför PWA:n och öppnas i webbläsaren.
    return location.origin + '/oppna-taxidata.html?u=' + encodeURIComponent(url);
  }

  function clickAnchor(href) {
    var a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('data-td-open-browser', '1');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 0);
  }

  /* Öppna samma sida i vanliga webbläsaren, med adressrad.
     Android: en riktig länk-klick på intent:// (inte location.href — Android
     skickar bara intent:// via länknavigering). package=com.android.chrome och
     NEW_TASK|MULTIPLE_TASK|NEW_DOCUMENT. Ofta blir det en Chrome Custom Tab
     med adressrad, inte alltid en full flik med flikväxlaren.
     iOS: window.open, annars x-safari-https.
     Annars: window.open, annars hopp till /oppna-taxidata.html utanför scope. */
  function openInBrowser() {
    var url = location.href;
    var ua = navigator.userAgent || '';
    var android = /Android/i.test(ua);
    var ios = /iPhone|iPad|iPod/i.test(ua);
    if (android) {
      var hostPath = location.host + location.pathname + location.search + location.hash;
      var scheme = location.protocol === 'http:' ? 'http' : 'https';
      var flags = 0x10000000 | 0x08000000 | 0x00080000;
      var intent = 'intent://' + hostPath +
        '#Intent;scheme=' + scheme +
        ';action=android.intent.action.VIEW' +
        ';package=com.android.chrome' +
        ';launchFlags=' + flags +
        ';S.browser_fallback_url=' + encodeURIComponent(trampolineUrl(url)) +
        ';end';
      clickAnchor(intent);
      return;
    }
    if (ios) {
      var w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) {
        var safari = url.replace(/^https:\/\//i, 'x-safari-https://').replace(/^http:\/\//i, 'x-safari-http://');
        clickAnchor(safari);
      }
      return;
    }
    var w2 = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w2) clickAnchor(trampolineUrl(url));
  }

  function onBtnClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (isStandalone()) { openInBrowser(); return; }
    toggle();
  }

  function notify(on) {
    try { document.dispatchEvent(new CustomEvent('helskarmchange', { detail: { on: on } })); } catch (e) {}
    try {
      if (window.PROGNOS && typeof PROGNOS.onFullscreen === 'function') PROGNOS.onFullscreen(on);
    } catch (e) {}
  }

  function setIcon(b, exitMode) {
    var want = exitMode ? 'exit' : 'enter';
    if (b.getAttribute('data-fs-ico') === want && b.querySelector('svg.app-fs-ico')) return;
    b.setAttribute('data-fs-ico', want);
    b.innerHTML = exitMode ? ICON_EXIT : ICON_ENTER;
  }

  function syncBtn(b, immersive) {
    if (!b) return;
    b.setAttribute('aria-pressed', immersive ? 'true' : 'false');
    b.setAttribute('aria-label', immersive ? 'Gå ur helskärm' : 'Helskärm');
    b.title = immersive ? 'Gå ur helskärm' : 'Helskärm';
    b.classList.toggle('on', !!immersive);
    setIcon(b, immersive);
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

  function ensureBrand() {
    if (document.querySelector('.td-shop-mark')) return;
    var el = document.createElement('div');
    el.className = 'td-shop-mark';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = 'taxikit.shop';
    document.body.appendChild(el);
  }

  function ensure() {
    if (btn && btn.isConnected) return btn;
    btn = document.querySelector('button.app-fs-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-fs-btn';
      btn.setAttribute('data-app-fs', '1');
      setIcon(btn, false);
    }
    if (!btn._helskarmBound) {
      btn._helskarmBound = true;
      btn.addEventListener('click', onBtnClick);
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
    ensureBrand();
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
    var immersive = isImmersive();
    if (document.documentElement) document.documentElement.classList.toggle('td-standalone', isStandalone());
    if (document.body) document.body.classList.toggle('app-fs', on);
    place();
    document.querySelectorAll('button.app-fs-btn').forEach(function (b) { syncBtn(b, immersive); });
    if (lastOn !== on) {
      lastOn = on;
      notify(on);
    }
    lastImmersive = immersive;
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
  // Gå inte in i helskärm automatiskt vid liggande – det kräver en gest, använd knappen.
  // I installerad PWA lämnas inte appen automatiskt (knappen öppnar webbläsaren).
  var lastLand = isLandscape();
  function onOrient() {
    var land = isLandscape();
    if (lastLand && !land && isOn() && !isStandalone()) exit();
    lastLand = land;
    schedulePlace();
  }

  function watchDisplayMode() {
    if (!window.matchMedia) return;
    ['standalone', 'fullscreen', 'minimal-ui', 'browser', 'window-controls-overlay'].forEach(function (mode) {
      try {
        var mq = matchMedia('(display-mode: ' + mode + ')');
        if (mq.addEventListener) mq.addEventListener('change', sync);
        else if (mq.addListener) mq.addListener(sync);
      } catch (e) {}
    });
  }

  function injectCss() {
    if (document.getElementById('td-helskarm-css')) return;
    var css = document.createElement('style');
    css.id = 'td-helskarm-css';
    css.textContent =
      '.app-fs-btn svg.app-fs-ico{width:22px;height:22px;display:block;flex-shrink:0}' +
      '.td-shop-mark{display:none;position:fixed;left:0;right:0;bottom:0;z-index:40;pointer-events:none;' +
      'padding:1px 8px calc(2px + env(safe-area-inset-bottom,0px));text-align:center;' +
      'font-size:10px;line-height:1.2;letter-spacing:.04em;font-weight:500;' +
      'color:var(--text-soft,#888);opacity:.7}' +
      'html.td-standalone .td-shop-mark{display:block}' +
      '@media (display-mode:standalone),(display-mode:fullscreen),(display-mode:window-controls-overlay){' +
      '.td-shop-mark{display:block}}';
    (document.head || document.documentElement).appendChild(css);
  }

  function boot() {
    injectCss();
    ensure();
    place();
    sync();
    lastLand = isLandscape();
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);
    watchDisplayMode();
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
    isStandalone: isStandalone,
    isImmersive: isImmersive,
    toggle: toggle,
    request: request,
    exit: exit,
    openInBrowser: openInBrowser,
    place: place,
    sync: sync
  };
})();
