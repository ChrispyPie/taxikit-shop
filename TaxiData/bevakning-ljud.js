/* Ljud för bevakningar (tåg, flyg, båt) när appen är öppen.
 * Syntetiseras med Web Audio, inga ljudfiler. Sparas bara i telefonen
 * (localStorage 'taxi_bev_ljud'). Av = tyst, typ-toggle stänger av en sort.
 * Ljudet låses upp vid första trycket (webbläsare kräver en användargest).
 * Ångra: ta bort den här filen, script-taggen och rutan i Inställningar,
 * och återställ beep() i bevakning.js.
 */
(function () {
  'use strict';
  var KEY = 'taxi_bev_ljud';
  var DEFAULTS = { on: true, tag: true, flyg: true, bat: true };
  var actx = null;
  var unlocked = false;
  var queue = [];
  var busyUntil = 0;

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

  function playKind(kind, force) {
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
    var dur = playKind(kind, force);
    busyUntil = Date.now() + Math.max(200, Math.round((dur || 0.3) * 1000) + 40);
    if (queue.length) setTimeout(kick, Math.max(30, busyUntil - Date.now()));
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

  function playFromMessage(msg, key) {
    var kind = kindOf(msg, key);
    if (kind) play(kind, false);
    return kind;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderSettings(box) {
    if (!box) return;
    var s = read();
    var types = [
      { id: 'tag', icon: '🚆', label: 'Tåg' },
      { id: 'flyg', icon: '✈️', label: 'Flyg' },
      { id: 'bat', icon: '⛴️', label: 'Båt' }
    ];
    var h = '<div class="section"><h3 style="margin-top:0">Ljud för bevakningar</h3>' +
      '<p style="font-size:.9rem;color:var(--text-soft);margin:.3rem 0">När en bevakning slår till medan appen är öppen spelas ett kort ljud: tåghornet, ett flygljud eller en båtsignal. Push-notisen kommer som vanligt även när appen är stängd. Ljudet sparas bara i den här telefonen.</p>' +
      '<div class="hl-opts" role="radiogroup" aria-label="Ljud för bevakningar">' +
        '<label class="hl-opt' + (s.on ? ' on' : '') + '"><input type="radio" name="bev-ljud" value="1"' + (s.on ? ' checked' : '') + '><span>På</span></label>' +
        '<label class="hl-opt' + (!s.on ? ' on' : '') + '"><input type="radio" name="bev-ljud" value="0"' + (!s.on ? ' checked' : '') + '><span>Av</span></label>' +
      '</div>';
    h += '<div class="bljud-types"' + (s.on ? '' : ' aria-disabled="true" style="opacity:.55"') + '>';
    types.forEach(function (t) {
      h += '<div class="bljud-row">' +
        '<label class="bljud-check"><input type="checkbox" name="bev-ljud-' + t.id + '"' + (s[t.id] ? ' checked' : '') + (s.on ? '' : ' disabled') + '> ' + t.icon + ' ' + esc(t.label) + '</label>' +
        '<button type="button" class="bljud-try" data-bljud-try="' + t.id + '">Prova</button>' +
        '</div>';
    });
    h += '</div><p class="bljud-hint">Tryck Prova för att höra. En del telefoner spelar inget ljud förrän du har rört skärmen en gång.</p></div>';
    box.innerHTML = h;
    if (!document.getElementById('bljud-style')) {
      var css = document.createElement('style');
      css.id = 'bljud-style';
      css.textContent =
        '.bljud-types{margin-top:10px;display:flex;flex-direction:column;gap:8px}' +
        '.bljud-row{display:flex;align-items:center;gap:10px;min-height:48px}' +
        '.bljud-check{flex:1;display:flex;align-items:center;gap:10px;min-height:44px;font-size:calc(15px * var(--font-scale, 1))}' +
        '.bljud-check input{width:22px;height:22px;accent-color:var(--primary);flex-shrink:0}' +
        '.bljud-try{flex:none;min-height:44px;min-width:72px;padding:8px 14px;border-radius:10px;border:1px solid var(--border,#3a4a5c);background:var(--surface-soft,#222e3b);color:inherit;font:inherit;cursor:pointer}' +
        '.bljud-hint{font-size:.8rem;color:var(--muted,#94a3b8);margin:10px 0 0;line-height:1.45}';
      document.head.appendChild(css);
    }
    box.onchange = function (e) {
      var t = e.target; if (!t) return;
      var cur = read();
      if (t.name === 'bev-ljud') cur.on = t.value === '1';
      else if (t.name === 'bev-ljud-tag') cur.tag = t.checked;
      else if (t.name === 'bev-ljud-flyg') cur.flyg = t.checked;
      else if (t.name === 'bev-ljud-bat') cur.bat = t.checked;
      else return;
      write(cur);
      renderSettings(box);
    };
    box.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-bljud-try]');
      if (!b) return;
      unlock();
      play(b.getAttribute('data-bljud-try'), true);
    };
  }

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

  window.BEV_LJUD = {
    play: play,
    playFromMessage: playFromMessage,
    kindOf: kindOf,
    enabled: enabled,
    read: read,
    write: write,
    unlock: unlock,
    renderSettings: renderSettings
  };
})();
