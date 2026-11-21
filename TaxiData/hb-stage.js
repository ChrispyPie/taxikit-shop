/* Hjälpbotens scen & strålkastare (lätt platsmarkör vid start).
 * När strålkastaren är släkt laddas bara en statisk, nedtonad scenbild för vald figur
 * (robot i laddstation i skugga, chaufför i bil med släckt taxiskylt, eller diva vid sminkbord i skugga)
 * utan att hämta tunga hjalpbot*.js / berra.js vid uppstart.
 * När föraren tänder strålkastaren laddas hela Hjälpboten (LAZY.ensure('hjalpbot')) och scenen lyses upp. */
(function () {
  'use strict';
  if (window.HB_STAGE) return;

  var CHAR_DEFAULT = 'robot';
  var VALID_CHARS = { robot: 1, chauffor: 1, diva: 1, off: 1 };

  function driverId() { try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; } }
  function charKey() { return 'hb_char_' + (driverId() || 'default'); }
  function lightKey() { return 'taxi_hb_light:' + (driverId() || 'default'); }

  function charId() {
    var c = null;
    try { c = localStorage.getItem(charKey()); } catch (e) {}
    if (c === 'cool') c = 'robot';
    return VALID_CHARS[c] ? c : CHAR_DEFAULT;
  }
  function isLit() {
    try { return localStorage.getItem(lightKey()) === '1'; } catch (e) { return false; }
  }
  function setLitLocal(on) {
    try { localStorage.setItem(lightKey(), on ? '1' : '0'); } catch (e) {}
  }

  function css() {
    if (document.getElementById('hb-stage-css')) return;
    var s = document.createElement('style');
    s.id = 'hb-stage-css';
    s.textContent =
      '.hb-stage{margin:14px auto 4px;max-width:340px;border-radius:14px;border:1px solid var(--border,#cbd5e0);' +
        'background:linear-gradient(180deg,#111827 0%,#1a2232 100%);color:#e2e8f0;padding:8px 12px 10px;position:relative;overflow:hidden}' +
      '.hb-stage.lit{background:linear-gradient(180deg,#1a2436 0%,#28374d 100%);border-color:#d69e2e}' +
      '.hb-stage-top{display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative;z-index:2}' +
      '.hb-stage-lamp{display:flex;align-items:center;gap:6px}' +
      '.hb-stage-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.22);' +
        'background:rgba(255,255,255,.08);color:#e2e8f0;font:600 .8rem inherit;cursor:pointer;min-height:32px}' +
      '.hb-stage.lit .hb-stage-btn{background:#f5c518;color:#1a202c;border-color:#f5c518}' +
      '.hb-stage-scene{position:relative;display:flex;flex-direction:column;align-items:center;padding-top:2px;cursor:pointer}' +
      '.hb-stage-svg{width:100%;max-width:250px;height:112px;display:block}' +
      '.hb-stage-note{font-size:.74rem;color:#94a3b8;text-align:center;margin-top:2px}' +
      '.hb-stage.lit .hb-stage-note{color:#fde68a}';
    document.head.appendChild(s);
  }

  function lampSvg(lit) {
    // Scenstrålkastare ovanför figuren (par-kanna med klaffar + stativbygel)
    return '<svg width="46" height="34" viewBox="0 0 64 48" aria-hidden="true">' +
      '<path d="M18 4 h28 M32 4 v7" stroke="#94a3b8" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M21 11 h22 v6 h-22 z" fill="#334155" stroke="#0f172a" stroke-width="1.5"/>' +
      '<g transform="rotate(14 32 22)">' +
        '<rect x="20" y="14" width="24" height="17" rx="4" fill="#1e293b" stroke="#0f172a" stroke-width="1.6"/>' +
        '<path d="M20 31 l-5 7 h34 l-5 -7 z" fill="#0f172a" stroke="#334155" stroke-width="1.2"/>' +
        '<ellipse cx="32" cy="31" rx="9" ry="2.8" fill="' + (lit ? '#fef08a' : '#334155') + '"/>' +
      '</g></svg>';
  }

  function sceneSvg(id, lit) {
    var beam = lit
      ? '<polygon points="105,0 145,0 232,110 18,110" fill="url(#hbBeam)" opacity="0.55"/>'
      : '';
    var defs = '<defs><linearGradient id="hbBeam" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#fef08a" stop-opacity="0.78"/>' +
      '<stop offset="100%" stop-color="#fef08a" stop-opacity="0.04"/></linearGradient></defs>';
    var dimOp = lit ? '1' : '0.42';
    var floor = '<ellipse cx="125" cy="102" rx="88" ry="8" fill="' + (lit ? '#fef08a' : '#0b1019') + '" opacity="' + (lit ? '0.22' : '0.65') + '"/>';
    var art = '';
    if (id === 'chauffor') {
      // Taxi i profil med chauffören i bilen; taxiskylten är släckt när strålkastaren är av
      var signFill = lit ? '#f5c518' : '#2d3748';
      var signTxt = lit ? '#1a202c' : '#4a5568';
      var hlFill = lit ? '#fef08a' : '#334155';
      art =
        '<g opacity="' + dimOp + '">' +
          '<rect x="97" y="25" width="38" height="11" rx="3" fill="' + signFill + '" stroke="#0f172a" stroke-width="1.4"/>' +
          '<text x="116" y="33" text-anchor="middle" font-size="7" font-weight="800" font-family="Arial,sans-serif" fill="' + signTxt + '">TAXI</text>' +
          '<path d="M56 64 l16 -24 h74 l22 24 h24 q10 0 10 10 v16 h-158 v-18 q0 -8 12 -8 z" fill="' + (lit ? '#334155' : '#1e293b') + '" stroke="#0f172a" stroke-width="2"/>' +
          '<path d="M77 44 h30 v18 h-36 z M113 44 h28 l14 18 h-42 z" fill="#0f172a" opacity="0.85"/>' +
          // Chaufför-silhuett i framsätet
          '<circle cx="126" cy="52" r="6.5" fill="' + (lit ? '#f6d2b3' : '#475569') + '"/>' +
          '<path d="M119 47 q7 -5 14 0 z" fill="' + signFill + '"/>' +
          '<rect x="118" y="58" width="16" height="6" rx="2" fill="#1c1614"/>' +
          // Rutig taxirand + strålkastare
          '<rect x="64" y="72" width="112" height="6" fill="' + (lit ? '#f5c518' : '#334155') + '" opacity="0.85"/>' +
          '<circle cx="196" cy="73" r="4.5" fill="' + hlFill + '"/>' +
          '<circle cx="82" cy="91" r="11" fill="#0f172a" stroke="#475569" stroke-width="2"/><circle cx="82" cy="91" r="4.5" fill="#64748b"/>' +
          '<circle cx="166" cy="91" r="11" fill="#0f172a" stroke="#475569" stroke-width="2"/><circle cx="166" cy="91" r="4.5" fill="#64748b"/>' +
        '</g>';
    } else if (id === 'diva') {
      // Taxi-Diva vid sitt sminkbord i skuggan (släckta spegellampor när av)
      var bulb = lit ? '#fef08a' : '#334155';
      var dress = lit ? '#f5c518' : '#3b4252';
      art =
        '<g opacity="' + dimOp + '">' +
          '<rect x="74" y="22" width="54" height="44" rx="8" fill="#1e293b" stroke="#475569" stroke-width="2"/>' +
          '<rect x="81" y="28" width="40" height="32" rx="5" fill="' + (lit ? '#7dd3fc' : '#0f172a') + '" opacity="0.7"/>' +
          '<circle cx="82" cy="24" r="2.8" fill="' + bulb + '"/><circle cx="101" cy="22" r="2.8" fill="' + bulb + '"/><circle cx="120" cy="24" r="2.8" fill="' + bulb + '"/>' +
          '<circle cx="75" cy="44" r="2.8" fill="' + bulb + '"/><circle cx="127" cy="44" r="2.8" fill="' + bulb + '"/>' +
          '<rect x="64" y="66" width="78" height="8" rx="3" fill="#475569"/>' +
          '<path d="M72 74 v24 M134 74 v24" stroke="#334155" stroke-width="3"/>' +
          // Diva på pallen
          '<circle cx="156" cy="46" r="9.5" fill="' + (lit ? '#f6d2b3' : '#475569') + '"/>' +
          '<path d="M146 46 q0 -11 10 -11 q10 0 10 11 q-3 -5 -10 -4 q-7 1 -10 4 z" fill="#7c2d12"/>' +
          '<path d="M144 64 q0 -8 12 -8 q12 0 12 8 l-3 14 h-18 z" fill="' + dress + '"/>' +
          '<rect x="145" y="80" width="22" height="5" rx="2" fill="#e11d48"/>' +
          '<path d="M156 85 v13 M148 98 h16" stroke="#475569" stroke-width="2.5"/>' +
        '</g>';
    } else {
      // Robot i sin laddstation i skugga
      var batt = lit ? '#4ade80' : '#334155';
      var visor = lit ? '#f5c518' : '#334155';
      art =
        '<g opacity="' + dimOp + '">' +
          '<rect x="76" y="34" width="38" height="64" rx="7" fill="#1e293b" stroke="#475569" stroke-width="2"/>' +
          '<rect x="85" y="42" width="20" height="8" rx="2" fill="' + batt + '"/>' +
          '<rect x="85" y="54" width="20" height="8" rx="2" fill="' + batt + '" opacity="0.7"/>' +
          '<path d="M114 78 q12 0 16 -10" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>' +
          // Robot bredvid/i laddstationen
          '<rect x="128" y="28" width="36" height="24" rx="10" fill="' + (lit ? '#f8fafc' : '#334155') + '" stroke="#0f172a" stroke-width="1.6"/>' +
          '<rect x="133" y="33" width="26" height="14" rx="6" fill="#0f172a"/>' +
          '<circle cx="140" cy="40" r="2.2" fill="' + visor + '"/><circle cx="152" cy="40" r="2.2" fill="' + visor + '"/>' +
          '<rect x="137" y="22" width="18" height="6" rx="2" fill="' + visor + '"/>' +
          '<rect x="131" y="53" width="30" height="26" rx="8" fill="' + (lit ? '#f8fafc' : '#334155') + '" stroke="#0f172a" stroke-width="1.6"/>' +
          '<rect x="136" y="59" width="20" height="10" rx="3" fill="' + visor + '"/>' +
          '<circle cx="139" cy="84" r="6" fill="#0f172a"/><circle cx="153" cy="84" r="6" fill="#0f172a"/>' +
        '</g>';
    }
    return '<svg class="hb-stage-svg" viewBox="0 0 250 112" aria-hidden="true">' + defs + beam + floor + art + '</svg>';
  }

  function wakeBot() {
    if (window.HJALPBOT) {
      if (window.HJALPBOT.tick) window.HJALPBOT.tick();
      return Promise.resolve();
    }
    if (window.LAZY && LAZY.ensure) {
      return LAZY.ensure('hjalpbot').then(function () {
        if (window.HJALPBOT && window.HJALPBOT.tick) window.HJALPBOT.tick();
      }).catch(function () {});
    }
    return Promise.resolve();
  }

  function render(host) {
    if (!host) return;
    var c = charId();
    if (c === 'off') { host.innerHTML = ''; return; }
    css();
    var lit = isLit();
    var title = c === 'chauffor' ? 'Chaufför' : (c === 'diva' ? 'Taxi-Diva' : 'Robot');
    host.innerHTML =
      '<div class="hb-stage' + (lit ? ' lit' : '') + '" id="hb-stage-card">' +
        '<div class="hb-stage-top">' +
          '<div class="hb-stage-lamp">' + lampSvg(lit) + '<span style="font-size:.82rem;font-weight:700">' + title + '</span></div>' +
          '<button type="button" class="hb-stage-btn" id="hb-stage-toggle" aria-pressed="' + (lit ? 'true' : 'false') + '">' +
            (lit ? '💡 Strålkastare: På' : '🔦 Tänd strålkastare') +
          '</button>' +
        '</div>' +
        '<div class="hb-stage-scene" id="hb-stage-scene" role="button" tabindex="0" aria-label="' + (lit ? 'Släck strålkastaren' : 'Tänd strålkastaren och väck Hjälpboten') + '">' +
          sceneSvg(c, lit) +
          '<div class="hb-stage-note">' + (lit ? 'Strålkastaren är tänd · tryck på boten eller släck här' : 'Strålkastaren är släkt · tryck för att tända och väcka boten') + '</div>' +
        '</div>' +
      '</div>';

    function toggle() {
      var next = !isLit();
      setLitLocal(next);
      render(host);
      if (next) wakeBot();
      else if (window.HJALPBOT && window.HJALPBOT.tick) window.HJALPBOT.tick();
    }
    var btn = document.getElementById('hb-stage-toggle');
    var scn = document.getElementById('hb-stage-scene');
    if (btn) btn.onclick = function (e) { e.stopPropagation(); toggle(); };
    if (scn) {
      scn.onclick = function () { if (!isLit()) toggle(); else if (window.HJALPBOT && window.HJALPBOT.poke) window.HJALPBOT.poke(); };
      scn.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
    }
    if (lit && !window.HJALPBOT) {
      setTimeout(function () { if (isLit()) wakeBot(); }, 400);
    }
  }

  window.HB_STAGE = {
    render: render,
    isLit: isLit,
    setLit: function (on) {
      setLitLocal(!!on);
      var box = document.getElementById('hb-stage-box');
      if (box) render(box);
      if (on) return wakeBot();
      if (window.HJALPBOT && window.HJALPBOT.tick) window.HJALPBOT.tick();
      return Promise.resolve();
    },
    charId: charId
  };
})();
