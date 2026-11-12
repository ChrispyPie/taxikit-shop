/* Ljud för bevakningar (tåg, flyg, båt) när appen är öppen.
 * Spelar ljud/tag.mp3, flyg.mp3, bat.mp3 om filen finns, annars en reservton
 * (Web Audio). Sparas bara i telefonen (localStorage 'taxi_bev_ljud').
 * Av = tyst, typ-toggle stänger av en sort. Ljudet låses upp vid första
 * trycket (webbläsare kräver en användargest). Inställningarna sitter på
 * Ankomster och i Mina bevakningar, inte under Inställningar.
 * Tåg (12 nov): om ljudet spelas avgörs av villkoren i tag-villkor.js (push med v: 1 och silent).
 * Ångra: ta bort filerna i ljud/, återställ den här filen och beep() i bevakning.js.
 */
(function () {
  'use strict';
  var KEY = 'taxi_bev_ljud';
  var DEFAULTS = { on: true, tag: true, flyg: true, bat: true };
  var actx = null;
  var unlocked = false;
  var queue = [];
  var busyUntil = 0;
  var V = '20261111bev1';
  var FILE = { tag: 'ljud/tag.mp3?v=' + V, flyg: 'ljud/flyg.mp3?v=' + V, bat: 'ljud/bat.mp3?v=' + V };
  var missing = {};
  var mounted = [];
  var currentAudio = null;


  function read() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || ''); } catch (e) { o = {}; }
    if (!o || typeof o !== 'object') o = {};
    return {
      on: o.on !== false,
      tag: o.tag !== false,
      flyg: o.flyg !== false,
      bat: o.bat !== false
    };
  }
  function write(s) {
    try { localStorage.setItem(KEY, JSON.stringify({ on: !!s.on, tag: !!s.tag, flyg: !!s.flyg, bat: !!s.bat })); } catch (e) {}
  }

  function enabled(kind) {
    var s = read();
    if (!s.on) return false;
    if (kind === 'test') return s.tag || s.flyg || s.bat;
    if (kind === 'tag' || kind === 'flyg' || kind === 'bat') return !!s[kind];
    return false;
  }

  function kindOf(msg, key) {
    var tag = String((msg && msg.tag) || '');
    var k = String(key || (msg && (msg.nkey || msg.key)) || '');
    var title = String((msg && msg.title) || '');
    if (tag === 'test') return 'test';
    if (tag.indexOf('flyg') === 0) return 'flyg';
    if (tag.indexOf('tag') === 0) return 'tag';
    if (tag.indexOf('bat') === 0 || tag.indexOf('båt') === 0) return 'bat';
    if (/^f[^|]*\|/.test(k)) return 'flyg';
    if (/^t[^|]*\|/.test(k)) return 'tag';
    if (/^b[^|]*\|/.test(k)) return 'bat';
    if (/✈️|landat|flyg/i.test(title)) return 'flyg';
    if (/🚆|tåg/i.test(title)) return 'tag';
    if (/⛴️|båt|fartyg/i.test(title)) return 'bat';
    return '';
  }

  function unlock() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      unlocked = true;
    } catch (e) {}
  }
  function onFirstGesture() { unlock(); }
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (ev) {
    document.addEventListener(ev, onFirstGesture, { capture: true, passive: true });
  });

  function tone(c, type, freq, t, dur, peak) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.04, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noiseWhoosh(c, t, dur, fromHz, toHz, peak) {
    var n = Math.floor(c.sampleRate * (dur + 0.05));
    var buf = c.createBuffer(1, n, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3.2;
    bp.frequency.setValueAtTime(fromHz, t);
    bp.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // Korta, mjuka signaler som funkar på telefonhögtalare. Inte alarmlika.
  function playTag(c, t) {
    tone(c, 'sine', 587, t, 0.26, 0.18);
    tone(c, 'sine', 440, t, 0.26, 0.08);
    tone(c, 'sine', 523, t + 0.34, 0.30, 0.18);
    tone(c, 'sine', 392, t + 0.34, 0.30, 0.08);
    return 0.72;
  }
  function playFlyg(c, t) {
    noiseWhoosh(c, t, 0.78, 450, 2400, 0.16);
    tone(c, 'sine', 880, t + 0.18, 0.22, 0.07);
    tone(c, 'sine', 1175, t + 0.36, 0.18, 0.05);
    return 0.86;
  }
  function playBat(c, t) {
    tone(c, 'sine', 196, t, 0.42, 0.22);
    tone(c, 'triangle', 196, t, 0.42, 0.06);
    tone(c, 'sine', 185, t, 0.42, 0.10);
    tone(c, 'sine', 196, t + 0.58, 0.38, 0.20);
    tone(c, 'triangle', 196, t + 0.58, 0.38, 0.05);
    tone(c, 'sine', 185, t + 0.58, 0.38, 0.09);
    return 1.05;
  }

  function playSynth(kind, force) {
    if (!force && !enabled(kind === 'test' ? 'test' : kind)) return 0;
    unlock();
    if (!actx) return 0;
    var c = actx, t = c.currentTime + 0.02, dur = 0;
    try {
      if (kind === 'tag') dur = playTag(c, t);
      else if (kind === 'flyg') dur = playFlyg(c, t);
      else if (kind === 'bat') dur = playBat(c, t);
      else if (kind === 'test') {
        var s = read();
        if (s.tag || force) { dur = Math.max(dur, playTag(c, t)); t += 0.85; }
        if (s.flyg || force) { dur = (t - c.currentTime) + playFlyg(c, t); t += 0.95; }
        if (s.bat || force) { dur = (t - c.currentTime) + playBat(c, t); }
      }
    } catch (e) { return 0; }
    return dur;
  }

  function playFile(kind) {
    return new Promise(function (resolve) {
      if (!FILE[kind] || missing[kind]) { resolve(0); return; }
      try {
        if (currentAudio) { try { currentAudio.pause(); currentAudio.src = ''; } catch (e) {} }
        var a = new Audio(FILE[kind]);
        currentAudio = a;
        a.preload = 'auto';
        a.setAttribute('playsinline', 'true');
        var settled = false;
        function done(dur) {
          if (settled) return;
          settled = true;
          resolve(dur);
        }
        a.onerror = function () { missing[kind] = true; done(0); };
        a.onended = function () { if (currentAudio === a) currentAudio = null; };
        var p = a.play();
        if (p && p.then) {
          p.then(function () {
            var d = a.duration;
            done(isFinite(d) && d > 0 ? d : 3);
          }).catch(function () { done(0); });
        } else {
          var d = a.duration;
          done(isFinite(d) && d > 0 ? d : 3);
        }
      } catch (e) { resolve(0); }
    });
  }

  function playKind(kind, force, cb) {
    if (!force && !enabled(kind === 'test' ? 'test' : kind)) { if (cb) cb(0); return; }
    unlock();
    var types = kind === 'test' ? ['tag', 'flyg', 'bat'].filter(function (k) { var s = read(); return force || s[k]; }) : [kind];
    var i = 0, total = 0;
    function next() {
      if (i >= types.length) { if (cb) cb(total); return; }
      var k = types[i++];
      playFile(k).then(function (dur) {
        if (!(dur > 0)) dur = playSynth(k, true);
        total += dur || 0;
        setTimeout(next, Math.max(200, Math.round((dur || 0.4) * 1000) + 60));
      });
    }
    next();
  }

  function kick() {
    var now = Date.now();
    if (!queue.length) return;
    if (now < busyUntil) {
      setTimeout(kick, Math.max(30, busyUntil - now));
      return;
    }
    var kind = queue.shift();
    var force = kind.indexOf('force:') === 0;
    if (force) kind = kind.slice(6);
    busyUntil = Date.now() + 8000;
    playKind(kind, force, function (dur) {
      busyUntil = Date.now() + Math.max(200, Math.round((dur || 0.3) * 1000) + 40);
      if (queue.length) setTimeout(kick, Math.max(30, busyUntil - Date.now()));
    });
  }

  // force: används av Prova-knappar, spelar även om typen är av (så man hör innan man slår på).
  function play(kind, force) {
    if (!kind) return;
    if (force) kind = 'force:' + kind;
    else if (!enabled(kind)) return;
    if (queue.length >= 4) return;
    queue.push(kind);
    kick();
  }

  // Animation bara vid själva ankomsten, inte vid försening, inställt, ny tid eller bagage.
  // "ankommer" (förvarning) räknas inte; bara "har ankommit" / "har landat".
  function isArrival(msg) {
    var title = String((msg && msg.title) || '');
    return /har landat|har ankommit/i.test(title);
  }

  function playFromMessage(msg, key) {
    var kind = kindOf(msg, key);
    if (kind && kind !== 'test') {
      try {
        document.dispatchEvent(new CustomEvent('bev-watch-fire', {
          detail: { kind: kind, arrival: isArrival(msg) }
        }));
      } catch (e) {}
    }
    // Tåg: förarens villkor (tag-villkor.js). Ny server skickar v: 1 + silent, äldre push: lokala villkor.
    if (kind === 'tag' && window.TAG_VILLKOR && TAG_VILLKOR.shouldPlay) {
      if (!TAG_VILLKOR.shouldPlay(msg, key)) return kind;
      if (msg && msg.v === 1) { play(kind, true); return kind; }
    }
    if (kind && kind !== 'test' && msg && msg.silent === true) return kind;
    if (kind) play(kind, false);
    return kind;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // notifying: händelsen bev-ljud-change lyssnas också på här, så utan spärr anropade notify sig själv i all oändlighet.
  var notifying = false;
  function notify() {
    if (notifying) return;
    notifying = true;
    try {
      try { document.dispatchEvent(new CustomEvent('bev-ljud-change')); } catch (e) {}
      mounted = mounted.filter(function (m) { return m.box && m.box.isConnected; });
      mounted.forEach(function (m) { paintCompact(m.box, m.kinds, true); });
    } finally { notifying = false; }
  }

  function ensureCompactStyle() {
    if (document.getElementById('bljud-style')) return;
    var css = document.createElement('style');
    css.id = 'bljud-style';
    css.textContent =
      '.bljud-compact{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:4px 0 6px}' +
      '.bljud-c{display:inline-flex;align-items:center;gap:5px;font-size:calc(13px * var(--font-scale, 1));line-height:1.2;white-space:nowrap;min-height:28px}' +
      '.bljud-c input{width:16px;height:16px;accent-color:var(--primary);flex-shrink:0;margin:0}' +
      '.bljud-try{flex:none;min-height:28px;padding:2px 8px;border-radius:8px;border:1px solid var(--border,#3a4a5c);background:var(--surface-soft,#222e3b);color:inherit;font:inherit;font-size:calc(12px * var(--font-scale, 1));cursor:pointer}';
    document.head.appendChild(css);
  }

  var LABELS = { tag: 'Tågljud', flyg: 'Flygljud', bat: 'Båtljud' };

  function paintCompact(box, kinds, fromSync) {
    if (!box) return;
    ensureCompactStyle();
    var s = read();
    var h = '<div class="bljud-compact">';
    kinds.forEach(function (id) {
      var on = !!(s.on && s[id]);
      h += '<label class="bljud-c"><input type="checkbox" data-bljud-k="' + id + '"' + (on ? ' checked' : '') + '> ' +
        esc(LABELS[id] || id) + '</label>' +
        '<button type="button" class="bljud-try" data-bljud-try="' + id + '">Testa ljud</button>';
    });
    h += '</div>';
    box.innerHTML = h;
    if (fromSync) return;
    box.onchange = function (e) {
      var el = e.target; if (!el || !el.getAttribute) return;
      var k = el.getAttribute('data-bljud-k'); if (!k) return;
      var cur = read();
      cur[k] = !!el.checked;
      cur.on = !!(cur.tag || cur.flyg || cur.bat);
      write(cur);
      // Tågljudet är samma som standardens Ljud på i villkoren (sparas även hos servern).
      if (k === 'tag' && window.TAG_VILLKOR && TAG_VILLKOR.setDefault) TAG_VILLKOR.setDefault({ sound: !!el.checked });
      notify();
    };
    box.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-bljud-try]');
      if (!b) return;
      e.preventDefault();
      unlock();
      play(b.getAttribute('data-bljud-try'), true);
    };
  }

  function renderCompact(box, kinds) {
    if (!box) return;
    kinds = typeof kinds === 'string' ? [kinds] : (kinds && kinds.length ? kinds : ['tag', 'flyg', 'bat']);
    mounted = mounted.filter(function (m) { return m.box !== box && m.box && m.box.isConnected; });
    mounted.push({ box: box, kinds: kinds });
    paintCompact(box, kinds, false);
  }

  // Inte längre i Inställningar – lämnas tom om någon gammal sida fortfarande anropar den.
  function renderSettings(box) { if (box) box.innerHTML = ''; }

  // Om bevakning.js inte är laddat (appen öppen på en annan sida) spelar vi ändå ljudet.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'bev-push') return;
      var m = e.data.msg || {};
      if (String(m.tag || '').indexOf('prognos') === 0) return;
      if (window.BEVAKNING && typeof BEVAKNING.alert === 'function') return;
      playFromMessage(m, e.data.key);
    });
  }

  if (document && document.addEventListener) document.addEventListener('bev-ljud-change', function () { notify(); });
  if (window && window.addEventListener) window.addEventListener('storage', function (e) { if (e && e.key === KEY) notify(); });

  window.BEV_LJUD = {
    play: play,
    playFromMessage: playFromMessage,
    isArrival: isArrival,
    kindOf: kindOf,
    enabled: enabled,
    read: read,
    write: write,
    unlock: unlock,
    renderSettings: renderSettings,
    renderCompact: renderCompact,
    files: FILE
  };
})();
