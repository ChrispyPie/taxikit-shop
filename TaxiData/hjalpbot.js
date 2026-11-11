/* Hjälpboten: en liten animerad figur i förarappen.
 * Regelbaserad (ingen AI, inga betal-API:er). Den pratar bara om siffror som redan finns i appen.
 * Figurer: Robot, Chaufför och Taxi-Diva (egna SVG-teckningar). Valet sparas per förare i localStorage.
 * Byt namn/repliker här nedan. Inställning: Inställningar på hemskärmen eller tryck på boten.
 * 2026-11-11 botfix: laddas globalt, vandrar fritt utan list, kläder mer tåliga.
 */
(function () {
  'use strict';
  if (window.__HB_LOADED) return;
  window.__HB_LOADED = true;

  var CHARS = {
    robot: { name: 'Robot', svg: robotSvg },
    chauffor: { name: 'Chaufför', svg: chaufforSvg },
    diva: { name: 'Taxi-Diva', svg: divaSvg }
  };
  var DEFAULT_CHAR = 'robot';
  var COMMENT_CHANCE = 0.4;        // chans att boten säger något när en sida öppnas
  var COMMENT_GAP_MS = 60 * 1000;  // minst så här länge mellan spontana kommentarer
  var BUBBLE_MS = 7000;

  // ---------- figurer (SVG, viewBox 64×64) ----------
  var K = '#1a1a1a', Y = '#f5c518', T = '#14a3a3', SKIN = '#f6d2b3';
  function checker(x, y, n, s) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<rect x="' + (x + i * s) + '" y="' + (y + (i % 2 ? s : 0)) + '" width="' + s + '" height="' + s + '" fill="' + Y + '"/>';
    return out;
  }
  function robotSvg() {
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      '<g stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<g class="hb-wheels"><circle cx="22" cy="57" r="5" fill="' + K + '"/><circle cx="42" cy="57" r="5" fill="' + K + '"/>' +
      '<circle cx="22" cy="57" r="1.8" fill="#888"/><circle cx="42" cy="57" r="1.8" fill="#888"/></g>' +
      '<path d="M46 43 L52 50" stroke-width="5"/><path d="M46 43 L52 50" stroke="#fff" stroke-width="3"/><circle cx="52.5" cy="51" r="2.8" fill="#fff"/>' +
      '<rect x="16" y="37" width="32" height="19" rx="8" fill="#fff"/>' +
      '<path d="M21 39 h22 v7 l-4 5 h-14 l-4 -5 z" fill="' + K + '"/>' +
      '<path d="M22 46 h20 l-4 5 h-12 z" fill="' + Y + '"/><path d="M32 45 l2 2 -2 2 -2 -2 z" fill="' + T + '" stroke-width="0.8"/>' +
      '<g class="hb-arm"><path d="M18 43 L10 34" stroke-width="5"/><path d="M18 43 L10 34" stroke="#fff" stroke-width="3"/><circle cx="9.5" cy="32.5" r="3" fill="#fff"/></g>' +
      '<rect x="8.5" y="20" width="4.5" height="10" rx="2" fill="' + T + '"/><rect x="51" y="20" width="4.5" height="10" rx="2" fill="' + T + '"/>' +
      '<rect x="11" y="11" width="42" height="28" rx="13" fill="#fff"/>' +
      '<rect x="16" y="15.5" width="32" height="19" rx="7.5" fill="' + K + '"/>' +
      '<g class="hb-eyes" stroke="' + Y + '" stroke-width="2.2" fill="none"><path d="M22 25.5 q3 -4 6 0"/><path d="M36 25.5 q3 -4 6 0"/></g>' +
      '<path d="M28.5 29.5 q3.5 3 7 0" stroke="' + Y + '" stroke-width="2" fill="none"/>' +
      '<rect x="23" y="4" width="18" height="7.5" rx="2.5" fill="' + Y + '"/></g>' +
      '<text x="32" y="10" text-anchor="middle" font-size="4.6" font-weight="800" font-family="Arial,sans-serif" fill="' + K + '">TAXI</text></svg>';
  }
  function capSvg(cx, top, w) {
    var l = cx - w / 2, r = cx + w / 2;
    return '<path d="M' + l + ' ' + (top + 11) + ' Q' + l + ' ' + top + ' ' + cx + ' ' + top + ' Q' + r + ' ' + top + ' ' + r + ' ' + (top + 11) + ' z" fill="' + Y + '"/>' +
      '<rect x="' + l + '" y="' + (top + 8) + '" width="' + w + '" height="4.4" fill="' + K + '"/>' +
      '<g stroke="none">' + checker(l + 1, top + 8.2, Math.floor((w - 2) / 2.2), 2.2) + '</g>' +
      '<path d="M' + (l + 1) + ' ' + (top + 12.4) + ' Q' + cx + ' ' + (top + 17.5) + ' ' + (r - 1) + ' ' + (top + 12.4) + '" fill="#e0b000"/>';
  }
  function chaufforSvg() {
    var LTH = '#1c1614', LTH2 = '#3a2a24', ZIP = '#c5c0b8';
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<rect x="21" y="54" width="9" height="6" rx="2" fill="' + K + '"/><rect x="34" y="54" width="9" height="6" rx="2" fill="' + K + '"/>' +
      '<path d="M19 60 h11 v3 h-11 z M34 60 h11 v3 h-11 z" fill="' + K + '"/>' +
      '<path d="M46 44 L51 51" stroke-width="5.5"/><path d="M46 44 L51 51" stroke="' + LTH + '" stroke-width="3.5"/><circle cx="51.5" cy="52" r="2.7" fill="' + SKIN + '"/>' +
      '<path d="M17 47 q0 -8 8 -8 h14 q8 0 8 8 v9 h-30 z" fill="' + LTH + '"/>' +
      '<path d="M26 39 l-3.5 3 6 9 z M38 39 l3.5 3 -6 9 z" fill="' + LTH2 + '"/>' +
      '<path d="M32 40 v18" stroke="' + ZIP + '" stroke-width="1.2"/>' +
      '<circle cx="32" cy="41.5" r="1.1" fill="' + ZIP + '" stroke="' + K + '" stroke-width="0.6"/>' +
      '<rect x="23.5" y="45.5" width="5.4" height="4.2" rx="0.8" fill="' + Y + '"/>' +
      '<path d="M24 45.9 h4.4" stroke="' + K + '" stroke-width="0.6"/>' +
      '<g class="hb-arm"><path d="M19 44 L11 35" stroke-width="5.5"/><path d="M19 44 L11 35" stroke="' + LTH + '" stroke-width="3.5"/>' +
      '<path d="M7.5 33 q-1 -4 2 -5 q1 -2 3 0 q2 -1 2.5 1.5 q1.5 2 -1 4 q-3 2 -6.5 -0.5z" fill="' + SKIN + '"/></g>' +
      '<path d="M19 26 q-1 -8 13 -9 q14 1 13 9 z" fill="#2a2118"/>' +
      '<circle cx="32" cy="27.5" r="12.5" fill="' + SKIN + '"/>' +
      '<path d="M22 33 q2 8 10 8 q8 0 10 -8" fill="' + SKIN + '"/>' +
      '<circle cx="19.6" cy="28" r="2.4" fill="' + SKIN + '"/><circle cx="44.4" cy="28" r="2.4" fill="' + SKIN + '"/>' +
      '<g class="hb-eyes" stroke="none"><circle cx="27" cy="28.5" r="2.2" fill="#134e4a"/><circle cx="37" cy="28.5" r="2.2" fill="#134e4a"/>' +
      '<circle cx="27.7" cy="27.8" r="0.7" fill="#fff"/><circle cx="37.7" cy="27.8" r="0.7" fill="#fff"/></g>' +
      '<path d="M24 35 q8 5 16 0" fill="none" stroke="#3a2a24" stroke-width="1.4" opacity="0.45"/>' +
      '<path d="M25 33.5 q7 2.2 14 0" fill="none" stroke="#3a2a24" stroke-width="2.2" opacity="0.22"/>' +
      '<path class="hb-mouth" d="M28.5 33.8 Q32 36 36.2 32.6" fill="none" stroke="#8a4a42" stroke-width="1.4"/>' +
      '<g class="hb-shades">' +
      '<path d="M23 26.4 h18" stroke="' + K + '" stroke-width="1.6"/>' +
      '<path d="M21.5 27.2 Q19.8 28 19.8 29.2" fill="none" stroke="' + K + '" stroke-width="1.3"/>' +
      '<path d="M42.5 27.2 Q44.2 28 44.2 29.2" fill="none" stroke="' + K + '" stroke-width="1.3"/>' +
      '<ellipse cx="26.6" cy="28.6" rx="5.2" ry="3.5" fill="#15181e" stroke="' + K + '" stroke-width="1.3"/>' +
      '<ellipse cx="37.4" cy="28.6" rx="5.2" ry="3.5" fill="#15181e" stroke="' + K + '" stroke-width="1.3"/>' +
      '<path d="M31.8 28.2 h0.6" stroke="' + K + '" stroke-width="1.4"/>' +
      '<path d="M23.8 27.4 l3.2 -1" stroke="#9aa3b2" stroke-width="0.8" opacity="0.75"/>' +
      '<path d="M34.6 27.4 l3.2 -1" stroke="#9aa3b2" stroke-width="0.8" opacity="0.75"/>' +
      '</g>' +
      capSvg(32, 6, 30) + '</g></svg>';
  }
  function divaSvg() {
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<g class="hb-hair"><path d="M18 30 q-3 10 1 16 q2 3 -1 6 q6 1 8 -4 l12 0 q2 5 8 4 q-3 -3 -1 -6 q4 -6 1 -16 z" fill="#8a3f1f"/></g>' +
      '<path d="M26 54 h12 l1 6 h-14 z" fill="' + K + '"/>' +
      '<path d="M28 60 v2.5 M36 60 v2.5" stroke="' + SKIN + '" stroke-width="2"/><path d="M25.5 62.5 h5 M33.5 62.5 h5" stroke-width="2"/>' +
      '<path d="M46 44 L51 50" stroke-width="5"/><path d="M46 44 L51 50" stroke="' + Y + '" stroke-width="3"/><circle cx="51.5" cy="51" r="2.4" fill="' + SKIN + '"/>' +
      '<circle cx="53.5" cy="54.5" r="1.6" fill="none" stroke="#999" stroke-width="1"/><path d="M54.5 55.5 l2 2 m-1 -1 l1 -1" stroke="#999" stroke-width="1"/>' +
      '<path d="M19 47 q0 -8 8 -8 h10 q8 0 8 8 l-4 8 h-18 z" fill="' + Y + '"/>' +
      '<path d="M27 39 l-4 2 6 6 z M37 39 l4 2 -6 6 z" fill="' + K + '"/>' +
      '<path d="M28 39 q4 4 8 0 l-1 3 q-3 2 -6 0 z" fill="' + T + '" stroke-width="1"/><path d="M32 42 l-2 6 2 -1 2 1 z" fill="' + T + '" stroke-width="1"/>' +
      '<g class="hb-arm"><path d="M21 44 L13 35" stroke-width="5"/><path d="M21 44 L13 35" stroke="' + Y + '" stroke-width="3"/>' +
      '<path d="M9.5 33 q-1 -4 2 -5 q1 -2 3 0 q2 -1 2.5 1.5 q1.5 2 -1 4 q-3 2 -6.5 -0.5z" fill="' + SKIN + '"/></g>' +
      '<circle cx="32" cy="27.5" r="12" fill="' + SKIN + '"/>' +
      '<path d="M20 28 q0 -11 12 -11 q12 0 12 11 q-3 -6 -8 -7 q-4 4 -12 4 q-3 1 -4 3 z" fill="#8a3f1f"/>' +
      '<g class="hb-eye-l"><circle cx="27" cy="28.6" r="2.1" fill="#134e4a" stroke="none"/><circle cx="27.7" cy="27.9" r="0.7" fill="#fff" stroke="none"/><path d="M24.6 27.4 l-1.3 -0.9" stroke-width="1"/></g>' +
      '<g class="hb-eye-r"><circle cx="37" cy="28.6" r="2.1" fill="#134e4a" stroke="none"/><circle cx="37.7" cy="27.9" r="0.7" fill="#fff" stroke="none"/><path d="M39.4 27.4 l1.3 -0.9" stroke-width="1"/></g>' +
      '<path d="M25 24.6 q2 -1.2 4 -0.3 M35 24.3 q2 -0.9 4 0.3" stroke="#6b2f15" stroke-width="1" fill="none"/>' +
      '<circle cx="24.5" cy="32" r="1.8" fill="#f4a6a0" stroke="none" opacity="0.85"/><circle cx="39.5" cy="32" r="1.8" fill="#f4a6a0" stroke="none" opacity="0.85"/>' +
      '<circle cx="19.6" cy="36.2" r="1.7" fill="none" stroke="#d4af37" stroke-width="1.3"/>' +
      '<circle cx="44.4" cy="36.2" r="1.7" fill="none" stroke="#d4af37" stroke-width="1.3"/>' +
      '<path class="hb-mouth" d="M28.2 33.4 Q32 37.2 35.8 33.4" fill="#c43b4a" stroke="#9a2a36" stroke-width="1.15"/>' +
      '<g transform="rotate(-14 32 12)">' + capSvg(32, 5, 24) + '</g></g></svg>';
  }


  // Kläder utifrån cachad väderbild (samma SMHI-cache som Animationer).
  // Överraskning: nämns inte i Om, hjälp eller nyheter. Av Animationer → standardklädsel.
  function gearSvg(outfit) {
    if (!outfit) return '';
    var n = '#1e4d6b', n2 = '#163a52', y = Y, t = T, w = '#e8eef5';
    if (outfit === 'cold') {
      return '<g class="hb-gear hb-gear-cold" aria-hidden="true">' +
        '<path d="M18 16 Q18 6 32 5.5 Q46 6 46 16 L45 19 Q32 21 19 19 z" fill="' + n + '" stroke="' + n2 + '" stroke-width="1"/>' +
        '<path d="M19 16 h26" stroke="' + n2 + '" stroke-width="1.6"/>' +
        '<circle cx="32" cy="5" r="2.5" fill="' + w + '" stroke="' + n2 + '" stroke-width="1"/>' +
        '<path d="M21 38 Q32 43 43 38 L45 44 Q32 49 19 44 z" fill="' + t + '" stroke="' + K + '" stroke-width="1"/>' +
        '<path d="M23 43 l-4 11 5 1.2 2.2 -10 z" fill="' + y + '" stroke="' + K + '" stroke-width="0.9"/>' +
        '<path d="M40 43 l5 11 5 -1 -3.2 -10 z" fill="' + t + '" stroke="' + K + '" stroke-width="0.9"/>' +
        '</g>';
    }
    if (outfit === 'rain') {
      return '<g class="hb-gear hb-gear-rain" aria-hidden="true">' +
        '<path d="M8 16 Q8 6 18 6 Q22 6 24 10" fill="none" stroke="' + K + '" stroke-width="1.4"/>' +
        '<path d="M24 10 L24 16" stroke="' + K + '" stroke-width="1.3"/>' +
        '<path d="M8 16 Q18 22 28 16 Q18 12 8 16 z" fill="' + y + '" stroke="' + K + '" stroke-width="1.2"/>' +
        '<path d="M18 36 Q32 32 46 36 L48 56 Q32 58 16 56 z" fill="' + y + '" stroke="' + K + '" stroke-width="1.2"/>' +
        '<path d="M18 37 Q32 41 46 37" fill="none" stroke="' + K + '" stroke-width="1"/>' +
        '<path d="M17 24 Q17 8 32 6.5 Q47 8 47 24 L42 24 Q42 13 32 12 Q22 13 22 24 z" fill="#d4a40a" stroke="' + K + '" stroke-width="1.1"/>' +
        '</g>';
    }
    if (outfit === 'snow') {
      return '<g class="hb-gear hb-gear-snow" aria-hidden="true">' +
        '<path d="M18 36 Q32 31 46 36 L49 57 Q32 60 15 57 z" fill="' + n + '" stroke="' + n2 + '" stroke-width="1.2"/>' +
        '<path d="M18 38 Q32 42 46 38" fill="none" stroke="' + w + '" stroke-width="1.4" opacity="0.7"/>' +
        '<path d="M21 38 Q32 43 43 38 L45 44 Q32 49 19 44 z" fill="#0e7490" stroke="' + K + '" stroke-width="1"/>' +
        '<path d="M23 43 l-4 11 5 1.2 2.2 -10 z" fill="' + y + '" stroke="' + K + '" stroke-width="0.9"/>' +
        '<path d="M18 16 Q18 6 32 5.5 Q46 6 46 16 L45 19 Q32 21 19 19 z" fill="' + n + '" stroke="' + n2 + '" stroke-width="1"/>' +
        '<path d="M19 16 h26" stroke="' + w + '" stroke-width="1.3" opacity="0.8"/>' +
        '<circle cx="32" cy="5" r="2.5" fill="' + w + '" stroke="' + n2 + '" stroke-width="1"/>' +
        '</g>';
    }
    if (outfit === 'sun') {
      return '<g class="hb-gear hb-gear-sun" aria-hidden="true">' +
        '<path d="M20 26.2 h24" stroke="' + K + '" stroke-width="1.7"/>' +
        '<rect x="21.2" y="25.2" width="9.2" height="6.2" rx="2.7" fill="#111" stroke="' + K + '" stroke-width="1"/>' +
        '<rect x="33.6" y="25.2" width="9.2" height="6.2" rx="2.7" fill="#111" stroke="' + K + '" stroke-width="1"/>' +
        '<path d="M23.4 27 l2 -0.9" stroke="#fff" stroke-width="0.8" opacity="0.7"/>' +
        '<path d="M35.8 27 l2 -0.9" stroke="#fff" stroke-width="0.8" opacity="0.7"/>' +
        '</g>';
    }
    try {
      if (window.HJALPBOT_HOGTID && HJALPBOT_HOGTID.gearSvg) return HJALPBOT_HOGTID.gearSvg(outfit) || '';
    } catch (e) {}
    return '';
  }
  function currentOutfit() {
    if (state && state.forceOutfit != null) return state.forceOutfit;
    try {
      if (!window.ANIMATIONER || !window.ANIMATIONER.isOn()) return '';
      var H = window.HJALPBOT_HOGTID, day, ho;
      if (H && H.active) {
        day = H.active();
        if (day && H.outfitFor) {
          ho = H.outfitFor(charId(), day);
          if (ho) return ho;
        }
      }
      var V = window.ANIMATIONER_VADER;
      if (!V) return '';
      var snap = V.readCache ? V.readCache() : null;
      if (V.outfitFrom) return V.outfitFrom(snap) || '';
    } catch (e) {}
    return '';
  }
  function applyGear(svg) {
    if (!svg) return;
    var old = svg.querySelector('.hb-gear');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var outfit = currentOutfit();
    var g = gearSvg(outfit);
    if (!g) return;
    if (outfit === 'sun' && svg.querySelector('.hb-shades')) return;
    try {
      svg.style.overflow = /lucia|pepparkaka|stjarngosse|halloween/.test(outfit) ? 'visible' : 'hidden';
      var doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + g + '</svg>', 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('gear');
      var node = doc.documentElement.firstElementChild;
      while (node) {
        var next = node.nextElementSibling;
        if (node.namespaceURI === 'http://www.w3.org/2000/svg') {
          svg.appendChild(document.importNode(node, true));
        }
        node = next;
      }
    } catch (e) {
      try { svg.insertAdjacentHTML('beforeend', g); } catch (e2) {}
    }
  }

  // ---------- repliker: en egen personlighet per figur ----------
  // Alla siffror kommer från appens riktiga data (a.kr, a.diff osv.). Lägg gärna till fler varianter.
  // a = { p:'idag', g:'dagsmålet', inkort, diff, rest, antal, kind:'tåg'|'flyg', no, from, place, when:'om 7 min'|'kl 20:06', late:' (5 min sen)', n, f, hi, name }
  var L = {
    robot: {
      hello: ['Bip! Vad vill du veta?', 'Mina kretsar är redo. Fråga på!', 'Batteri 100 %, nyfikenhet 100 %. Fråga!'],
      hem: function (a) { return ['Bip bop! ' + a.hi + a.name + '! Systemen är online.', a.hi + a.name + '! Jag har laddat batteriet. Har du laddat dig?',
        'Bip! ' + a.hi + a.name + '. Tryck på mig om du behöver en beräkning.', 'Systemkoll klar: ' + a.hi.toLowerCase() + a.name + ', allt fungerar. Bip!']; },
      needsProfile: function (a) { return ['Bip! Fel 404: profiluppgifter saknas. Tryck på 👤 uppe till höger.', a.hi + a.name + '! Min databas saknar några uppgifter om dig. 👤 uppe till höger.']; },
      noTrips: function (a) { return ['Beräkning klar: 0 körningar ' + a.p + '. Mina kretsar väntar spänt.', 'Bip… inga körningar ' + a.p + ' än. Jag sparar batteri tills du kör.',
        'Noll körningar ' + a.p + '. Även robotar behöver kunder. Bip!']; },
      over: function (a) { return ['Beräkning klar: du är ' + a.diff + ' över målet. Mina kretsar är stolta.', 'Bip bop! ' + a.kr + ' inkört ' + a.p + '. Det är ' + a.diff + ' över ' + a.g + '!',
        a.antal + ' körningar, ' + a.diff + ' över målet. Mina lampor blinkar av glädje.', 'Varning: prestation över förväntan! ' + a.diff + ' över ' + a.g + '. Bip!']; },
      near: function (a) { return ['Beräkning: ' + a.rest + ' kvar till ' + a.g + '. Sannolikhet att du klarar det: hög.', 'Bip! Bara ' + a.rest + ' kvar. Mina kretsar håller tummarna. Har inga tummar.']; },
      under: function (a) { return ['Beräkning klar: ' + a.kr + ' ' + a.p + ', ' + a.rest + ' kvar till ' + a.g + '. Bip!', a.antal + ' körningar inloggade. ' + a.rest + ' kvar till målet. Laddar uppmuntran… klar: du fixar det!',
        'Bip bop! ' + a.kr + ' hittills. Målet ligger ' + a.rest + ' bort. Jag har räknat, det går.']; },
      history: ['Bip! Du tittar i historiken. Mitt minne är också bra.', 'Arkivläge aktiverat. Gamla siffror, bip bop.'],
      next: function (a) { return ['Bip bop! Nästa ' + a.kind + ' ' + a.when + ': ' + a.no + ' från ' + a.from + a.late + '.', 'Beräkning klar: ' + a.no + ' från ' + a.from + ' ankommer ' + a.when + a.late + '. Bip!',
        'Radarn visar ' + a.no + ' från ' + a.from + ' ' + a.when + a.late + '.']; },
      none: function (a) { return ['Bip… inga fler ' + a.kind + ' till ' + a.place + ' på radarn de närmaste timmarna.']; },
      busy: function (a) { return ['Bip! ' + a.n + ' ankomster inom en timme. Mina sensorer anar kunder.', a.n + ' ankomster nästa timme. Beräknad kundsannolikhet: hög!']; },
      late: function (a) { return ['Bip… ' + a.no + ' från ' + a.from + ' är ' + a.n + ' min sen. Tid att ladda batteriet. Eller ta en kaffe.']; },
      canceled: function (a) { return ['Felmeddelande: ' + a.n + ' inställd' + (a.n === 1 ? '' : 'a') + ' ankomst' + (a.n === 1 ? '' : 'er') + '. Kolla listan innan du kör. Bip.']; },
      missing: function (a) { return ['Bip! Fält saknas: ' + a.f + '. Fyll i så slutar jag pipa.', 'Min databas är ofullständig: ' + a.f + ' saknas. Bip bop.']; },
      noEmergency: ['Bip! Tips: lägg in närmast anhörig. Frivilligt, men robotar gillar backup.'],
      tidy: ['Profilkontroll: 100 % ifylld. Bip bop, snyggt!', 'Alla fält godkända. Mina kretsar är nöjda.'],
      idag: function (a) { return ['Beräkning klar: idag ' + a.kr + ' på ' + a.antal + ' körning' + (a.antal === 1 ? '' : 'ar') + ' (' + a.skift + ' skift). Bip!']; },
      idagNone: ['Bip… inga körningar registrerade idag än.'],
      mal: ['Beräkning klar. Bip bop:'],
      losen: ['Bip! Instruktion laddad:'],
      err: ['Bip… anslutningsfel. Försök igen strax.'],
      top: function (a) { return ['Bip bop! Plats 1 av ' + a.n + ' i "' + a.t + '" ' + a.p + ': ' + a.v + '. Mina kretsar jublar.', 'Beräkning klar: du leder "' + a.t + '" med ' + a.v + '. Bip!']; },
      rank: function (a) { return ['Bip! Plats ' + a.pos + ' av ' + a.n + ' i "' + a.t + '" ' + a.p + ' (' + a.v + '). Jag har räknat två gånger.', 'Rankingdata: "' + a.t + '" – plats ' + a.pos + ' av ' + a.n + '. Uppgradering möjlig!']; },
      rankNone: function (a) { return ['Bip… inga pass för dig ' + a.p + ', så du finns inte i listan än.']; },
      vkPending: function (a) { return ['Bip! ' + a.h + ' verkstadstid väntar på ägarens beslut (' + a.n + ' st). Jag håller koll.', 'Kö-status: ' + a.n + ' registrering' + (a.n === 1 ? '' : 'ar') + ' väntar, ' + a.h + '. Bip bop.']; },
      vkApproved: function (a) { return ['Beräkning klar: ' + a.ah + ' godkänd verkstadstid i ' + a.m + ' = ' + a.akr + '. Bip!', 'Bip bop! Godkänt i ' + a.m + ': ' + a.ah + ', ' + a.akr + '. Skruvar och muttrar betalar sig.']; },
      vkRejected: ['Bip… en verkstadstid blev nekad. Läs ägarens kommentar i listan.'],
      vkNone: ['Bip! Inga verkstadstimmar registrerade. Tryck på knappen när bilen står på verkstan.']
    },
    chauffor: {
      hello: ['Hoppa in! Frågan är gratis – skämtet ingår.', 'Vad undrar du? Jag har ett svar och troligen ett pappaskämt.', 'Taxametern är av. Fråga på, jag kör båda vägarna: svar och dåliga vitsar.'],
      hem: function (a) { return [a.hi + a.name + '! Ha ett bra pass. En taxi utan skämt är bara en bil.', a.hi + a.name + '! Kör försiktigt där ute. Och om någon frågar vägen: ja, jag tar den också.',
        a.hi + a.name + '! Tryck på mig om du undrar något. Eller vill höra varför taxin tog med en stege.', a.hi + '! Kolla gärna Ankomster innan du kör ut. Bättre tidigt än att vinka åt fel tåg.']; },
      needsProfile: function (a) { return [a.hi + a.name + '! Profilen saknar några uppgifter – tryck på 👤 uppe till höger. Utan profil är du som en taxi utan skylt.']; },
      noTrips: function (a) { return ['Inga körningar ' + a.p + ' än. Motorn är varm, skämten också. Det kommer!', 'Tomt ' + a.p + ' hittills. Som en taxameter i rastläge. Första körningen väntar.']; },
      over: function (a) { return ['Snyggt! ' + a.diff + ' över målet ' + a.p + '. Precis som min kaffekopp. Bra kört!', 'Bra kört! ' + a.kr + ' inkört och ' + a.g + ' är slaget med ' + a.diff + '. Solglasögonen stannar på. Av respekt.',
        a.antal + ' körningar och ' + a.diff + ' över målet. Starkt – nästan lika starkt som mitt pappaskämt.']; },
      near: function (a) { return ['Nästan där! Bara ' + a.rest + ' kvar till ' + a.g + '. Som att sakna en avfart – men du hinner.', a.rest + ' kvar. En bra körning till så är det klart. Jag håller ratt och tummar.']; },
      under: function (a) { return [a.kr + ' ' + a.p + '. ' + a.rest + ' kvar till ' + a.g + '. Inga genvägar, bara vanliga vägar. Du fixar det.', a.antal + ' körningar hittills. ' + a.rest + ' kvar till målet. Som pappa sa: målet ligger framåt.']; },
      history: ['Kollar du gamla pass? Bra. Bakrutan är till för att se bakåt, vindrutan för att köra.', 'Historiken ser du här. Idag är en ny dag – och ett nytt skämt, lova jag.'],
      next: function (a) { return ['Nästa ' + a.kind + ' ' + a.when + ': ' + a.no + ' från ' + a.from + a.late + '. Kund på ingång, skämt på sparlåga.', a.no + ' från ' + a.from + ' kommer ' + a.when + a.late + '. Var där i tid. Punktlighet är min andra superkraft.']; },
      none: function (a) { return ['Inga fler ' + a.kind + ' till ' + a.place + ' de närmaste timmarna. Dags för kaffe. Svart, som jackan.']; },
      busy: function (a) { return [a.n + ' ankomster inom en timme. Det kan bli kö – som på korvkiosken, fast här är det kunder.']; },
      late: function (a) { return [a.no + ' från ' + a.from + ' är ' + a.n + ' min sen. Hinner du ta en kaffe. Inte för varm, de brukar komma precis då.']; },
      canceled: function (a) { return [a.n + ' inställd' + (a.n === 1 ? '' : 'a') + ' just nu. Kolla listan innan du kör dit. Bättre att veta än att vinka åt ett tåg som redan gått.']; },
      missing: function (a) { return ['Du saknar ' + a.f + '. Fyll i – en taxi utan adress är bara en sightseeing.', 'Psst! ' + a.f + ' saknas i profilen. Jag säger inget till de andra.']; },
      noEmergency: ['Tips: lägg in närmast anhörig. Frivilligt, precis som att skratta åt mina skämt.'],
      tidy: ['Profilen ser bra ut. Allt ifyllt, som ett välstädat baksäte.', 'Allt ifyllt. Proffsigt. Jackan också, om jag får säga det själv.'],
      idag: function (a) { return ['Idag har du kört in ' + a.kr + ' på ' + a.antal + ' körning' + (a.antal === 1 ? '' : 'ar') + ' (' + a.skift + ' skift). Bra jobbat. Skämtet kan vänta.']; },
      idagNone: ['Inga körningar registrerade idag än. Motorn tickar. Jag också, inombords.'],
      mal: ['Så här ser det ut, utan skämt den här gången:'],
      losen: ['Enkelt fixat. Inte som att parkera vid Centralen en lördag:'],
      err: ['Jag kunde inte hämta det just nu. Som när GPS:en tystnar. Försök igen strax.'],
      top: function (a) { return ['Etta i "' + a.t + '" ' + a.p + ' med ' + a.v + '. Ska jag ta av solglasögonen? Nä. Snyggt jobbat!', 'Du toppar "' + a.t + '" ' + a.p + '. Bra kört. Jag hade en vits, men du vann redan.']; },
      rank: function (a) { return ['Du ligger ' + a.o + ' av ' + a.n + ' i "' + a.t + '" ' + a.p + ' (' + a.v + '). Det rullar på.', 'Plats ' + a.pos + ' av ' + a.n + ' i "' + a.t + '". Lite mer gas, lite mindre pappaskämt från mig.']; },
      rankNone: function (a) { return ['Inga pass ' + a.p + ' än, så du syns inte i listan. Som en taxi i dimma. Nästa pass, kompis.']; },
      vkPending: function (a) { return [a.h + ' verkstadstid väntar på att ägaren tittar på den (' + a.n + ' st). Bilen vilar. Jag putsar och väntar.', 'Du har ' + a.n + ' registrering' + (a.n === 1 ? '' : 'ar') + ' som väntar på beslut, ' + a.h + '.']; },
      vkApproved: function (a) { return ['I ' + a.m + ' har du fått ' + a.ah + ' verkstadstid godkänd, det blir ' + a.akr + '. Bilen mår bra.', 'Godkänt i ' + a.m + ': ' + a.ah + ' = ' + a.akr + '. Tack för att du tar hand om bilen!']; },
      vkRejected: ['En verkstadstid blev nekad. Kolla ägarens kommentar i listan. Ibland säger verkstan nej, precis som min GPS.'],
      vkNone: ['Står bilen på verkstan? Registrera tiden här så får du betalt för den. Annars blir det som att köra utan taxameter.']
    },

    diva: {
      hello: ['Hej stjärna! Vad vill du veta? 😉', 'Fråga på, älskling – jag svarar med stil.', 'Ratten i ena handen, svaren i andra. Shoot!'],
      hem: function (a) { return [a.hi + a.name + '! Ska vi ta över stan tillsammans? 😉', a.hi + a.name + '… snyggt att se dig igen.',
        a.hi + a.name + '! Jag har väntat. Inte länge, men ändå. 😉', 'Där är du ju' + a.name + '! Tryck på mig om du vill prata.']; },
      needsProfile: function (a) { return [a.hi + a.name + '! En tjej vill veta lite mer om dig… profilen saknar uppgifter. 👤 uppe till höger. 😉']; },
      noTrips: function (a) { return ['Inga körningar ' + a.p + ' än? Du låter mig vänta, du. 😉', 'Tomt ' + a.p + '. Jag är tålmodig, men gatorna är det inte.']; },
      over: function (a) { return ['Mm, ' + a.diff + ' över målet… du vet hur man imponerar på en tjej. 😉', a.kr + ' ' + a.p + '? ' + a.g.charAt(0).toUpperCase() + a.g.slice(1) + ' slaget med ' + a.diff + '. Jag rodnar nästan.',
        a.antal + ' körningar och ' + a.diff + ' över målet. Älskling, du är farlig bakom ratten. (Lagligt farlig.)']; },
      near: function (a) { return ['Bara ' + a.rest + ' kvar, älskling. Visa mig vad du går för. 😉', 'Så nära! ' + a.rest + ' kvar till ' + a.g + '. Jag håller andan.']; },
      under: function (a) { return [a.kr + ' ' + a.p + '. ' + a.rest + ' kvar till ' + a.g + ' – du klarar det, och jag tittar. 😉', 'Hmm, ' + a.rest + ' kvar till målet. Övertyga mig, stjärna.']; },
      history: ['Bläddrar i det förflutna? Jag gillar folk med bra minne. 😉', 'Gamla bedrifter… nostalgiskt, älskling.'],
      next: function (a) { return ['Älskling, ' + a.no + ' från ' + a.from + ' kommer ' + a.when + a.late + '. Jag väntar inte på någon, men för dig kanske. 😉',
        'Nästa ' + a.kind + ' ' + a.when + ': ' + a.no + ' från ' + a.from + a.late + '. Var där i tid, snygging.', a.no + ' från ' + a.from + ' ' + a.when + a.late + '. Ditt nästa uppdrag, stjärna.']; },
      none: function (a) { return ['Inga fler ' + a.kind + ' till ' + a.place + ' på ett tag. Då har du bara mig. 😉']; },
      busy: function (a) { return [a.n + ' ankomster inom en timme. Populär kväll – precis som du. 😉']; },
      late: function (a) { return [a.no + ' från ' + a.from + ' är ' + a.n + ' min sen. Vissa vet hur man låter någon vänta… 😉']; },
      canceled: function (a) { return [a.n + ' inställd' + (a.n === 1 ? '' : 'a') + ', älskling. Kolla listan innan du kör dit – ingen gillar att bli lämnad på perrongen.']; },
      missing: function (a) { return [a.f.charAt(0).toUpperCase() + a.f.slice(1) + ' saknas. En tjej gillar att veta sånt. 😉', 'Lite mystisk, va? ' + a.f + ' saknas i profilen.']; },
      noEmergency: ['Närmast anhörig saknas. Frivilligt, men omtänksamt är snyggt.'],
      tidy: ['Allt ifyllt. Ordning och reda – det är attraktivt. 😉', 'Snygg profil. Jag är imponerad.'],
      idag: function (a) { return ['Idag, älskling: ' + a.kr + ' på ' + a.antal + ' körning' + (a.antal === 1 ? '' : 'ar') + ' (' + a.skift + ' skift). 😉']; },
      idagNone: ['Inga körningar idag än. Jag väntar… 😉'],
      mal: ['Mm, låt oss se hur du ligger till:'],
      losen: ['Hemligheter ska skyddas, stjärna:'],
      err: ['Hmm, jag fick inget svar. Försök igen strax, älskling.'],
      top: function (a) { return ['Etta i "' + a.t + '" med ' + a.v + '? Du vet hur man gör intryck, älskling. 😉', 'Plats 1 av ' + a.n + '. Alla tittar på dig nu… jag också. 😉']; },
      rank: function (a) { return ['Plats ' + a.pos + ' av ' + a.n + ' i "' + a.t + '" (' + a.v + '). Lite till, stjärna, så blir du min favorit. 😉', a.o + ' i "' + a.t + '"? Charmigt. Jag gillar en som klättrar.']; },
      rankNone: function (a) { return ['Inga pass ' + a.p + '? Spelar svårfångad, va? 😉']; },
      vkPending: function (a) { return [a.h + ' väntar på ägarens beslut, älskling. Tålamod klär dig. 😉', a.n + ' st i kön. Jag håller tummarna för dig, stjärna.']; },
      vkApproved: function (a) { return [a.ah + ' godkänt i ' + a.m + ' – ' + a.akr + '. Händig OCH charmig? 😉', a.akr + ' för verkstan i ' + a.m + '. Jag gillar en som tar hand om sin bil.']; },
      vkRejected: ['En verkstadstid blev nekad, älskling. Läs kommentaren – du klarar det. 😉'],
      vkNone: ['Inga verkstadstimmar än? Så rena händer, stjärna. 😉']
    }
  };
  function lines() { return L[charId()] || L[DEFAULT_CHAR]; }
  function line(key, a) { var v = lines()[key]; return pick(typeof v === 'function' ? v(a || {}) : v); }

  // ---------- hjälp ----------
  function kr(n) { return Math.round(Math.abs(n)).toLocaleString('sv-SE') + ' kr'; }
  function pick(list) {
    var recent = [];
    try { recent = JSON.parse(sessionStorage.getItem('hb_recent') || '[]'); } catch (e) {}
    var fresh = list.filter(function (x) { return recent.indexOf(x) < 0; });
    var s = (fresh.length ? fresh : list)[Math.floor(Math.random() * (fresh.length || list.length))];
    recent.push(s); if (recent.length > 8) recent.shift();
    try { sessionStorage.setItem('hb_recent', JSON.stringify(recent)); } catch (e) {}
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function driverKey() { return 'hb_char_' + (localStorage.getItem('taxi_driver') || 'x'); }
  function charId() {
    var c;
    try { c = localStorage.getItem(driverKey()); } catch (e) { c = ''; }
    if (c === 'off') return 'off';
    if (c === 'cool' || !CHARS[c]) {
      if (c === 'cool') {
        try { localStorage.setItem(driverKey(), DEFAULT_CHAR); } catch (e2) {}
      }
      return DEFAULT_CHAR;
    }
    return c;
  }
  function firstName() { var d = window.driverData; if (!d || d.demo) return ''; return d.first_name ? String(d.first_name).split(' ')[0] : ''; }   // demo: inget namn

  // ---------- sida ----------
  function page() {
    var login = document.getElementById('login-screen');
    if (login && login.style.display !== 'none') return null;
    var dv = document.getElementById('dashboard-view');
    if (dv && !dv.classList.contains('hidden')) return 'kordata';
    var app = document.getElementById('app');
    if (!app || app.style.display === 'none') return null;
    var c = window.current;
    if (c === 'nytt-losenord') return null;
    if (c === 'profil') return 'profil';
    if (window.ANKOMSTER && c === window.ANKOMSTER.id) return 'ankomster';
    if (window.TOPPLISTOR && c === window.TOPPLISTOR.id) return 'topplistor';
    if (window.VERKSTAD && c === window.VERKSTAD.id) return 'verkstad';
    if (!c) return 'hem';
    return c;
  }

  // ---------- vad boten säger (bara riktiga siffror) ----------
  var GOALNAME = { dag: 'dagsmålet', vecka: 'veckomålet', manad: 'månadsmålet' };
  var PERIOD = { dag: 'idag', vecka: 'den här veckan', manad: 'den här månaden' };
  function statsCtx(s) {
    return { p: PERIOD[s.tab], g: GOALNAME[s.tab], kr: kr(s.inkort), diff: kr(s.diff), rest: kr(-s.diff), antal: s.antal, skift: s.skift };
  }
  function statsComment(s) {
    var a = statsCtx(s);
    if (!s.antal) return line('noTrips', a);
    if (s.diff >= 0) return line('over', a);
    return line(-s.diff <= s.goal * 0.2 ? 'near' : 'under', a);
  }
  function kordataComment() {
    if (!window.taxiStats) return null;
    var s0 = window.taxiStats('dag');
    if (!s0 || !s0.own) return null;      // ägaren tittar på någon annan: säg inget om "dig"
    var tab = s0.viewing;
    if (tab === 'period') return null;
    if (!s0.viewingCurrent) return line('history');
    var s = window.taxiStats(tab === 'vecka' || tab === 'manad' ? tab : 'dag');
    return s ? statsComment(s) : null;
  }
  function lateMin(it) { return it && it.est && it.sched ? Math.round((it.est - it.sched) / 60000) : 0; }
  function arrCtx(src, it) {
    var A = window.ANKOMSTER, t = it.est || it.sched, mins = Math.round((t - Date.now()) / 60000), m = lateMin(it);
    return { kind: src.id === 'flyg' ? 'flyg' : 'tåg', place: src.place, no: it.no, from: it.from,
      when: mins <= 0 ? 'nu (kl ' + A.hm(t) + ')' : mins <= 60 ? 'om ' + mins + ' min (kl ' + A.hm(t) + ')' : 'kl ' + A.hm(t),
      late: m >= 1 ? ', ' + m + ' min sen' : '' };
  }
  function arrivalFacts(sum) {   // rena fakta för panelen
    var it = sum.next, A = window.ANKOMSTER;
    if (!it) return '';
    var info = it.info ? it.info.split(' · ')[0] : '';
    var f = info ? info + '.' : '';
    if (sum.after) f += ' Sedan ' + sum.after.no + ' från ' + sum.after.from + ' kl ' + A.hm(sum.after.est || sum.after.sched) + '.';
    if (sum.canceled) f += ' ' + sum.canceled + ' inställd' + (sum.canceled === 1 ? '' : 'a') + ' de närmaste timmarna.';
    return f.trim();
  }
  function ankomsterComment(sum) {
    if (!sum) return null;
    var src = sum.source;
    if (!sum.next) return line('none', { kind: src.id === 'flyg' ? 'flyg' : 'tåg', place: src.place });
    var opts = ['next', 'next'];
    if (sum.inHour >= 3) opts.push('busy');
    if (sum.worst && lateMin(sum.worst) >= 10) opts.push('late');
    if (sum.canceled > 0) opts.push('canceled');
    var k = opts[Math.floor(Math.random() * opts.length)];
    if (k === 'busy') return line('busy', { n: sum.inHour });
    if (k === 'late') return line('late', { no: sum.worst.no, from: sum.worst.from, n: lateMin(sum.worst) });
    if (k === 'canceled') return line('canceled', { n: sum.canceled });
    return line('next', arrCtx(src, sum.next));
  }
  // Topplistor: bara den egna placeringen från serverns svar (window.TOPPLISTOR_LAST)
  function ordSv(n) { var t = n % 100, e = n % 10; return n + ((e === 1 || e === 2) && t !== 11 && t !== 12 ? ':a' : ':e'); }
  function topplistorComment(info) {
    var T = window.TOPPLISTOR; if (!info || !info.data || !T) return null;
    var lists = info.data.lists || {}, best = null;
    T.lists.forEach(function (L) {
      var x = lists[L.k];
      if (x && x.me && (!best || x.me.pos < best.me.pos)) best = { L: L, me: x.me, n: x.n };
    });
    if (!best) return line('rankNone', { p: info.period });
    var a = { t: best.L.t, pos: best.me.pos, o: ordSv(best.me.pos), n: best.n, v: T.fmt(best.me.v, best.L.f), p: info.period };
    return line(best.me.pos === 1 ? 'top' : 'rank', a);
  }
  var FIELD = { first_name: 'förnamn', last_name: 'efternamn', phone: 'telefon', email: 'e-post' };
  function profilComment() {
    var p = window.HB_PROFILE; if (!p) return null;
    if (p.missing.length) return line('missing', { f: p.missing.map(function (x) { return FIELD[x] || x; }).join(', ').replace(/, ([^,]*)$/, ' och $1') });
    return line(p.noEmergency && Math.random() < 0.6 ? 'noEmergency' : 'tidy');
  }
  function hemComment() {
    var n = firstName(), h = new Date().getHours();
    var a = { hi: h < 5 ? 'Nattpass' : h < 10 ? 'God morgon' : h < 17 ? 'Hej' : 'God kväll', name: n ? ' ' + n : '' };
    return line((window.driverData || {}).needs_profile ? 'needsProfile' : 'hem', a);
  }

  // ---------- DOM ----------
  var el = {}, state = { page: undefined, lastComment: +(sessionStorage.getItem('hb_last') || 0), timer: null, pendingFor: null, hideT: null, panel: false, forceOutfit: null, atHome: false, visiting: false, guiding: false, bubbleTool: null };

  function css() {
    var s = document.createElement('style');
    s.id = 'hb-css';
    s.textContent =
      '.hb-walker{position:fixed;left:0;top:0;width:40px;height:40px;z-index:45;pointer-events:none;will-change:transform;overflow:visible;' +
      'transition:transform 3.2s cubic-bezier(.4,.1,.2,1)}' +
      '.hb-walker.snap{transition:none}' +
      '.hb-flip{width:100%;height:100%}' +
      '.hb-walker.hb-left .hb-flip{transform:scaleX(-1)}' +
      '.hb-btn{display:block;width:100%;height:100%;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent}' +
      '.hb-btn svg{width:40px;height:40px;display:block;overflow:visible;animation:hb-bob 1.1s ease-in-out infinite alternate;transform-origin:50% 100%}' +
      '.hb-walker.idle .hb-btn svg{animation-duration:2.2s}' +
      '.hb-walker.talking .hb-btn svg{animation:hb-talk .32s ease-in-out infinite alternate}' +
      '.hb-eyes,.hb-eye-r,.hb-eye-l{transform-box:fill-box;transform-origin:50% 50%;animation:hb-blink 4.6s infinite}' +
      '.hb-eye-r{animation:hb-wink 9s infinite}' +
      '.hb-arm{transform-box:fill-box;transform-origin:100% 100%}' +
      '.hb-walker.waving .hb-arm{animation:hb-wave .35s ease-in-out 4 alternate}' +
      '.hb-hair{transform-box:fill-box;transform-origin:50% 0}' +
      '.hb-walker.waving .hb-hair{animation:hb-hairflip .5s ease-in-out 2 alternate}' +
      '.hb-walker.waving .hb-eye-r{animation:hb-winknow .9s ease-in-out 1}' +
      '@keyframes hb-bob{from{transform:translateY(0)}to{transform:translateY(-2px)}}' +
      '@keyframes hb-talk{from{transform:translateY(0) scale(1)}to{transform:translateY(-4px) scale(1.04,.97)}}' +
      '@keyframes hb-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}' +
      '@keyframes hb-wink{0%,80%,88%,100%{transform:scaleY(1)}83%,85%{transform:scaleY(.1)}}' +
      '@keyframes hb-winknow{0%,100%{transform:scaleY(1)}30%,70%{transform:scaleY(.1)}}' +
      '@keyframes hb-wave{from{transform:rotate(-18deg)}to{transform:rotate(16deg)}}' +
      '@keyframes hb-hairflip{from{transform:rotate(0)}to{transform:rotate(-8deg) translateX(-1px)}}' +
      '.hb-bubble{position:fixed;width:max-content;max-width:min(280px,calc(100vw - 16px));z-index:46;background:var(--surface);color:var(--text);' +
      'border:2px solid var(--text);border-radius:16px;padding:7px 10px 8px;font-size:calc(14px * min(var(--font-scale,1),1.15));line-height:1.3;' +
      'box-shadow:0 3px 10px rgba(0,0,0,.18);pointer-events:none;opacity:0;transition:opacity .2s;box-sizing:border-box}' +
      '.hb-bubble.show{opacity:1;visibility:visible}' +
      '.hb-bubble:not(.show){visibility:hidden}' +
      '.hb-bubble-txt{position:relative;z-index:1}' +
      '.hb-bubble-tail{position:absolute;width:12px;height:12px;background:var(--surface);border:2px solid var(--text);' +
      'left:var(--tail-left,50%);transform:translateX(-50%) rotate(45deg);pointer-events:none}' +
      '.hb-bubble[data-side="above"] .hb-bubble-tail{bottom:-7px;border-top:0;border-left:0}' +
      '.hb-bubble[data-side="below"] .hb-bubble-tail{top:-7px;border-bottom:0;border-right:0}' +
      '.hb-panel{position:fixed;left:8px;right:8px;bottom:12px;max-width:380px;margin:0 auto;max-height:72vh;overflow:auto;z-index:130;background:var(--surface);color:var(--text);' +
      'border:1px solid var(--border);border-radius:14px;padding:12px;box-shadow:0 8px 28px rgba(0,0,0,.25);display:none}' +
      '.hb-panel.open{display:block}' +
      '.hb-ph{display:flex;align-items:center;justify-content:space-between;font-weight:700;margin-bottom:6px}' +
      '.hb-x{background:none;border:0;font-size:1.3rem;color:var(--text-soft);cursor:pointer;padding:0 4px}' +
      '.hb-say{background:var(--surface-soft);border-radius:10px;padding:9px 11px;font-size:.92rem;line-height:1.4;margin-bottom:10px;min-height:1.4em}' +
      '.hb-qs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}' +
      '.hb-q,.hb-c{border:1px solid var(--primary);background:var(--surface);color:var(--primary);border-radius:16px;padding:6px 11px;font-size:.85rem;cursor:pointer}' +
      '.hb-c.on{background:var(--primary);color:var(--on-primary)}' +
      '.hb-set{border-top:1px solid var(--border-soft);padding-top:8px;font-size:.85rem;color:var(--text-soft)}' +
      '.hb-set .hb-cs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '.hb-link{background:none;border:0;color:var(--primary);text-decoration:underline;cursor:pointer;font-size:.9rem;padding:0;margin-top:4px}' +
      '.hb-pick{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}' +
      '.hb-pick button{border:2px solid var(--border);background:var(--surface);border-radius:12px;padding:6px;width:78px;cursor:pointer;color:var(--text);font-size:.8rem}' +
      '.hb-pick button.on{border-color:var(--primary);background:var(--surface-soft);font-weight:700}' +
      '.hb-pick svg{width:56px;height:56px;display:block;margin:0 auto 2px}' +
      '.hb-walker.hb-walk{transition-timing-function:linear}' +
      '.hb-walker.hb-walk .hb-btn svg{animation:hb-stride .36s ease-in-out infinite alternate}' +
      '@keyframes hb-stride{from{transform:translateY(0)}to{transform:translateY(-3px)}}' +
      '.hb-station{position:fixed;left:0;top:0;width:120px;height:72px;z-index:44;pointer-events:none!important;will-change:transform;overflow:visible}' +
      '.hb-station svg{width:120px;height:72px;display:block;overflow:visible;pointer-events:none!important}' +
      '.hb-station.hb-hidden{display:none}' +
      '.hb-batt-fill{transform-box:fill-box;transform-origin:50% 100%}' +
      '.hb-station.hb-on .hb-batt-fill{animation:hb-batt 2.2s ease-in-out infinite alternate}' +
      '@keyframes hb-batt{from{transform:scaleY(.18)}to{transform:scaleY(1)}}' +
      '.hb-shine{opacity:0}' +
      '.hb-station.hb-on .hb-shine{animation:hb-shine 1.1s ease-in-out infinite}' +
      '@keyframes hb-shine{0%,100%{opacity:0}45%,60%{opacity:1}}' +
      '.hb-walker.hb-at-home{overflow:visible}' +
      '.hb-walker.hb-at-home .hb-btn svg{overflow:visible}' +
      '.hb-walker.hb-at-home.hb-act-diva .hb-arm{animation:hb-makeup .7s ease-in-out infinite alternate}' +
      '@keyframes hb-makeup{from{transform:rotate(-8deg)}to{transform:rotate(28deg)}}' +
      '.hb-walker.hb-at-home.hb-act-chauffor .hb-arm{animation:hb-polish .45s ease-in-out infinite alternate}' +
      '@keyframes hb-polish{from{transform:rotate(-22deg)}to{transform:rotate(18deg)}}' +
      '.hb-walker.hb-at-home.hb-act-robot .hb-btn svg{animation:hb-chargebob 1.4s ease-in-out infinite alternate}' +
      '@keyframes hb-chargebob{from{transform:translateY(0)}to{transform:translateY(-1px)}}' +
      '.hb-walker.hb-enter .hb-btn{transition:transform .45s ease,opacity .45s ease;transform:scale(.18);opacity:0}' +
      '.hb-walker.hb-enter-preview .hb-btn{transition:none;transform:scale(.45);opacity:.8}' +
      '.hb-bubble.hb-tap{pointer-events:auto;cursor:pointer}' +
      '.hb-tip-hl{outline:2px solid var(--accent,#63b3ed);outline-offset:3px;border-radius:inherit;animation:hb-tip-pulse 1.1s ease-in-out 4}' +
      '#menu-inkorg.hb-tip-hl{border-radius:8px}' +
      '@keyframes hb-tip-pulse{50%{outline-color:transparent}}' +
      '@media (prefers-reduced-motion:reduce){.hb-tip-hl{animation:none}}' +
      '.hb-walker.hb-marvin .hb-btn svg{animation:hb-marvin-sigh 2.6s ease-in-out;transform-origin:50% 90%}' +
      '@keyframes hb-marvin-sigh{0%{transform:translateY(0) rotate(0)}20%{transform:translateY(2px) rotate(4deg)}55%{transform:translateY(5px) rotate(8deg)}100%{transform:translateY(2px) rotate(3deg)}}' +
      '@media (prefers-reduced-motion: reduce){.hb-walker{transition:none!important}' +
      '.hb-flip,.hb-btn svg,.hb-eyes,.hb-eye-r,.hb-eye-l,.hb-walker.waving .hb-arm,.hb-walker.waving .hb-hair,.hb-walker.talking .hb-btn svg,' +
      '.hb-batt-fill,.hb-shine,.hb-walker.hb-at-home .hb-arm,.hb-walker.hb-at-home .hb-btn svg,.hb-walker.hb-walk .hb-btn svg,.hb-walker.hb-marvin .hb-btn svg{animation:none!important}' +
      '.hb-bubble{transition:none}}';
    document.head.appendChild(s);
  }

  var SIZE = 40, MARGIN = 8, PAD_TOP = 8;
  var WALK_SPEED = 40; // px/s, långsam gång
  var CELL = 8;
  var ST_W = 120, ST_H = 72;
  var wanderTimer = 0, pos = { x: 8, y: 200 }, reduceMotion = false;
  var walkGen = 0, nextVisitAt = 0, nextIconAt = 0, firstVisit = true;

  function prefersReduce() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }
  function headerBottom() {
    var h = document.querySelector('header');
    if (!h) return 56;
    var r = h.getBoundingClientRect();
    return Math.max(48, Math.ceil(r.bottom) + PAD_TOP);
  }
  function avoidRects() {
    var out = [];
    function add(node, pad) {
      if (!node) return;
      var r = node.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      out.push({ l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad });
    }
    document.querySelectorAll('#app .grid .icon, .home-devices, #home-devices, .home-dev, .home-dev-ask').forEach(function (node) { add(node, 10); });
    document.querySelectorAll('header, #profile-menu, .hb-panel').forEach(function (node) { add(node, 6); });
    return out;
  }
  function hits(x, y, boxes) {
    var right = x + SIZE, bot = y + SIZE, i, box;
    for (i = 0; i < boxes.length; i++) {
      box = boxes[i];
      if (x < box.r && right > box.l && y < box.b && bot > box.t) return true;
    }
    return false;
  }
  function bounds() {
    var vw = window.innerWidth, vh = window.innerHeight;
    return {
      minX: MARGIN,
      maxX: Math.max(MARGIN, vw - SIZE - MARGIN),
      minY: headerBottom(),
      maxY: Math.max(headerBottom(), vh - SIZE - MARGIN)
    };
  }
  function pickSpot(from) {
    var b = bounds(), boxes = avoidRects(), i, x, y, sc, best = null, bestScore = -1e9;
    function score(sx, sy) {
      if (hits(sx, sy, boxes)) return -1e6;
      var near = 80, cx = sx + SIZE / 2, cy = sy + SIZE / 2;
      near = Math.min(cx - b.minX, b.maxX + SIZE - cx, cy - b.minY, b.maxY + SIZE - cy, near);
      var grid = document.querySelector('#app.is-home .grid');
      var gridBottom = grid ? grid.getBoundingClientRect().bottom : 0;
      boxes.forEach(function (box) {
        var dx = 0, dy = 0;
        if (cx < box.l) dx = box.l - cx; else if (cx > box.r) dx = cx - box.r;
        if (cy < box.t) dy = box.t - cy; else if (cy > box.b) dy = cy - box.b;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < near) near = d;
      });
      var val = near;
      if (gridBottom && sy + SIZE < gridBottom + 8) val -= 140;
      if (gridBottom && sy >= gridBottom + 6) val += 55;
      if (from) {
        var dist = Math.hypot(sx - from.x, sy - from.y);
        if (dist < 40) val -= 80;
        else val += Math.min(80, dist * 0.12);
      }
      return val;
    }
    var candidates = [
      [b.minX, b.minY], [b.maxX, b.minY],
      [b.minX, b.maxY], [b.maxX, b.maxY],
      [b.minX, (b.minY + b.maxY) / 2], [b.maxX, (b.minY + b.maxY) / 2],
      [(b.minX + b.maxX) / 2, b.maxY],
      [b.minX, b.minY + 20], [b.maxX, b.minY + 20]
    ];
    for (i = 0; i < candidates.length; i++) {
      x = Math.round(Math.min(b.maxX, Math.max(b.minX, candidates[i][0])));
      y = Math.round(Math.min(b.maxY, Math.max(b.minY, candidates[i][1])));
      sc = score(x, y);
      if (sc > bestScore) { bestScore = sc; best = { x: x, y: y }; }
    }
    for (i = 0; i < 28; i++) {
      x = Math.round(b.minX + Math.random() * Math.max(0, b.maxX - b.minX));
      y = Math.round(b.minY + Math.random() * Math.max(0, b.maxY - b.minY));
      sc = score(x, y);
      if (sc > bestScore) { bestScore = sc; best = { x: x, y: y }; }
    }
    return best || { x: b.minX, y: b.maxY };
  }
  function setPos(x, y, dur, flipFrom) {
    pos = { x: x, y: y };
    if (!el.walker) return;
    if (dur === 0 || reduceMotion) el.walker.classList.add('snap');
    else {
      el.walker.classList.remove('snap');
      el.walker.style.transitionDuration = (dur || 3.2) + 's';
    }
    if (typeof flipFrom === 'number') {
      if (x < flipFrom) el.walker.classList.add('hb-left');
      else el.walker.classList.remove('hb-left');
    }
    el.walker.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    placeChrome();
  }
  function placeChrome() {
    if (!el.bubble || !el.walker) return;
    var vw = window.innerWidth, vh = window.innerHeight, pad = 8, tail = 8;
    var bw = Math.min(280, vw - pad * 2);
    el.bubble.style.width = bw + 'px';
    el.bubble.style.maxWidth = bw + 'px';
    var bh = el.bubble.offsetHeight || 48;
    var botCx = pos.x + SIZE / 2, botCy = pos.y + SIZE / 2;
    var headerY = headerBottom();
    var aboveTop = pos.y - bh - tail - 4;
    var belowTop = pos.y + SIZE + tail + 4;
    var side, top;
    if (aboveTop >= Math.max(pad, headerY)) {
      top = aboveTop;
      side = 'above';
    } else if (belowTop + bh <= vh - pad) {
      top = belowTop;
      side = 'below';
    } else {
      top = Math.max(pad, Math.min(vh - pad - bh, belowTop));
      side = (top + bh / 2 < botCy) ? 'above' : 'below';
    }
    if (top < pad) top = pad;
    if (top + bh > vh - pad) top = Math.max(pad, vh - pad - bh);
    var left = botCx - bw / 2;
    if (left < pad) left = pad;
    if (left + bw > vw - pad) left = Math.max(pad, vw - pad - bw);
    el.bubble.style.top = top + 'px';
    el.bubble.style.left = left + 'px';
    el.bubble.style.right = 'auto';
    el.bubble.style.bottom = 'auto';
    el.bubble.style.margin = '0';
    el.bubble.setAttribute('data-side', side);
    var tailX = botCx - left;
    if (tailX < 16) tailX = 16;
    if (tailX > bw - 16) tailX = bw - 16;
    el.bubble.style.setProperty('--tail-left', tailX + 'px');
  }

  function setBubbleText(text) {
    if (el.bubbleTxt) el.bubbleTxt.textContent = text == null ? '' : text;
    else if (el.bubble) el.bubble.textContent = text == null ? '' : text;
  }
  function getBubbleText() {
    if (el.bubbleTxt) return el.bubbleTxt.textContent || '';
    return (el.bubble && el.bubble.textContent) || '';
  }
  function clearTipHl() {
    document.querySelectorAll('.hb-tip-hl').forEach(function (n) { n.classList.remove('hb-tip-hl'); });
  }

  function animOn() {
    try { return !!(window.ANIMATIONER && ANIMATIONER.isOn && ANIMATIONER.isOn()); } catch (e) { return true; }
  }
  function canWalk() { return !reduceMotion && animOn(); }
  function destNearTarget(node) {
    var r = node.getBoundingClientRect();
    var b = bounds();
    var x, y;
    if (r.bottom <= headerBottom() + 12) {
      // Profilikonen sitter i headern: stå precis under, i högerkant, utan att glida in i rutnätet.
      x = Math.round(r.right - SIZE);
      if (x > b.maxX) x = b.maxX;
      if (x < b.minX) x = b.minX;
      y = b.minY;
      return { x: x, y: y };
    }
    x = r.left + r.width / 2 - SIZE / 2;
    y = r.bottom + 6;
    return nearestWalkable(x, y, obstacleRects());
  }
  function glideTo(dest, done, opt) {
    opt = opt || {};
    clearTimeout(wanderTimer);
    var gen = ++walkGen;
    state.visiting = true;
    if (el.walker) {
      el.walker.classList.add('hb-walk');
      el.walker.classList.remove('idle', 'snap');
      el.walker.style.transitionTimingFunction = 'cubic-bezier(.22,.7,.28,1)';
    }
    var dist = Math.hypot(dest.x - pos.x, dest.y - pos.y);
    var dur = dist < 4 ? 0 : Math.max(0.8, Math.min(1.2, 0.8 + dist / 900));
    setPos(dest.x, dest.y, dur, pos.x);
    function finish() {
      if (gen !== walkGen) return;
      if (el.walker) el.walker.classList.remove('hb-walk');
      if (!opt.stay) state.visiting = false;
      if (done) done();
      if (!opt.stay) scheduleWander();
    }
    if (dur === 0) { finish(); return true; }
    wanderTimer = setTimeout(finish, dur * 1000 + 30);
    return true;
  }

  function stationSvg(id) {
    var k = '#1a1a1a', y = Y, wood = '#c4a06a', wood2 = '#8a5a2b', metal = '#6b7280';
    if (id === 'robot') {
      return '<svg viewBox="0 0 120 72" aria-hidden="true">' +
        '<rect x="18" y="52" width="84" height="10" rx="3" fill="#2a3340" stroke="' + k + '" stroke-width="1.4"/>' +
        '<rect x="28" y="46" width="64" height="8" rx="2" fill="#3a4554" stroke="' + k + '" stroke-width="1.2"/>' +
        '<rect x="86" y="18" width="16" height="28" rx="3" fill="#1a2430" stroke="' + k + '" stroke-width="1.3"/>' +
        '<rect x="89" y="22" width="10" height="20" rx="1.5" fill="#0b1220" stroke="' + k + '" stroke-width="1"/>' +
        '<rect class="hb-batt-fill" x="90" y="24" width="8" height="16" rx="1" fill="' + y + '"/>' +
        '<rect x="92" y="15" width="4" height="4" rx="1" fill="' + metal + '" stroke="' + k + '" stroke-width="0.8"/>' +
        '</svg>';
    }
    if (id === 'diva') {
      return '<svg viewBox="0 0 120 72" aria-hidden="true">' +
        '<ellipse cx="86" cy="26" rx="16" ry="20" fill="#dbeafe" stroke="' + k + '" stroke-width="1.4"/>' +
        '<path d="M70 26 H62" stroke="' + k + '" stroke-width="1.4"/>' +
        '<rect x="36" y="46" width="64" height="8" rx="2" fill="#f3e0c8" stroke="' + k + '" stroke-width="1.2"/>' +
        '<rect x="44" y="54" width="6" height="12" fill="#e8c9a0" stroke="' + k + '" stroke-width="1"/>' +
        '<rect x="86" y="54" width="6" height="12" fill="#e8c9a0" stroke="' + k + '" stroke-width="1"/>' +
        '<rect x="50" y="40" width="6" height="8" rx="1" fill="#e11d48" stroke="' + k + '" stroke-width="0.9"/>' +
        '<rect x="60" y="42" width="5" height="6" rx="1" fill="#f5c518" stroke="' + k + '" stroke-width="0.9"/>' +
        '<circle cx="72" cy="44" r="3" fill="#f9a8d4" stroke="' + k + '" stroke-width="0.9"/>' +
        '</svg>';
    }
    if (id === 'chauffor') {
      return '<svg viewBox="0 0 120 72" aria-hidden="true">' +
        '<path d="M38 48 h52 l8 10 h-68 z" fill="' + y + '" stroke="' + k + '" stroke-width="1.3"/>' +
        '<path d="M50 48 l6 -12 h22 l8 12 z" fill="#7dd3fc" stroke="' + k + '" stroke-width="1.2"/>' +
        '<rect x="68" y="32" width="12" height="6" rx="1" fill="' + y + '" stroke="' + k + '" stroke-width="1"/>' +
        '<circle cx="50" cy="58" r="6" fill="' + k + '"/><circle cx="50" cy="58" r="2.4" fill="#9ca3af"/>' +
        '<circle cx="86" cy="58" r="6" fill="' + k + '"/><circle cx="86" cy="58" r="2.4" fill="#9ca3af"/>' +
        '<path class="hb-shine" d="M56 42 l6 -3" stroke="#fff" stroke-width="1.6" fill="none"/>' +
        '</svg>';
    }
    return '';
  }

  function obstacleRects(opts) {
    var out = [], pad = 6;
    function add(node, extra) {
      if (!node) return;
      var r = node.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      var p = extra || pad;
      out.push({ l: r.left - p, t: r.top - p, r: r.right + p, b: r.bottom + p });
    }
    document.querySelectorAll('#app.is-home .grid .icon .emoji, #app.is-home .grid .td-slot-plus').forEach(function (n) {
      if (opts && opts.ignoreTool) {
        var ic = n.closest && n.closest('.icon');
        if (ic && ic.getAttribute('data-tool') === opts.ignoreTool) return;
      }
      add(n, pad);
    });
    var h = document.querySelector('#app header');
    if (h) {
      var r = h.getBoundingClientRect();
      out.push({ l: 0, t: -20, r: window.innerWidth, b: Math.ceil(r.bottom) + 4 });
    }
    if (el.station && el.station.style.display !== 'none' && !el.station.classList.contains('hb-hidden') && !state.atHome && !(opts && opts.ignoreStation)) {
      add(el.station, 4);
    }
    return out;
  }
  function overlaps(a, b) { return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t; }
  function blockedAt(x, y, obs) {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (x < MARGIN || y < MARGIN || x + SIZE > vw - MARGIN || y + SIZE > vh - MARGIN) return true;
    var box = { l: x, t: y, r: x + SIZE, b: y + SIZE }, i;
    for (i = 0; i < obs.length; i++) if (overlaps(box, obs[i])) return true;
    return false;
  }
  function nearestWalkable(x, y, obs) {
    x = Math.round(x); y = Math.round(y);
    if (!blockedAt(x, y, obs)) return { x: x, y: y };
    var rad, a, nx, ny, best = null, bestD = 1e9, d;
    for (rad = CELL; rad <= 160; rad += CELL) {
      for (a = 0; a < 16; a++) {
        nx = Math.round(x + Math.cos(a * Math.PI / 8) * rad);
        ny = Math.round(y + Math.sin(a * Math.PI / 8) * rad);
        if (blockedAt(nx, ny, obs)) continue;
        d = Math.hypot(nx - x, ny - y);
        if (d < bestD) { bestD = d; best = { x: nx, y: ny }; }
      }
      if (best && bestD <= rad) return best;
    }
    return best || { x: MARGIN, y: Math.max(headerBottom(), window.innerHeight - SIZE - MARGIN) };
  }
  function findPath(from, to, opts) {
    var obs = obstacleRects(opts);
    from = nearestWalkable(from.x, from.y, obs);
    to = nearestWalkable(to.x, to.y, obs);
    var key = function (x, y) { return Math.round(x / CELL) + ',' + Math.round(y / CELL); };
    var q = [from], seen = {}, prev = {}, startK = key(from.x, from.y), goalK = key(to.x, to.y), i, cur, nx, ny, k, steps = 0;
    seen[startK] = 1;
    var dirs = [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL], [CELL, CELL], [CELL, -CELL], [-CELL, CELL], [-CELL, -CELL]];
    while (q.length && steps < 6000) {
      cur = q.shift(); steps++;
      k = key(cur.x, cur.y);
      if (k === goalK) break;
      for (i = 0; i < dirs.length; i++) {
        nx = cur.x + dirs[i][0]; ny = cur.y + dirs[i][1];
        if (blockedAt(nx, ny, obs)) continue;
        var nk = key(nx, ny);
        if (seen[nk]) continue;
        seen[nk] = 1;
        prev[nk] = cur;
        q.push({ x: nx, y: ny });
      }
    }
    var endK = key(to.x, to.y);
    if (!seen[endK] && !seen[key(from.x, from.y)]) return [from, to];
    if (!seen[endK]) {
      // closest reached
      var ck, bestK = startK, bd = 1e9, parts, dx, dy;
      for (ck in seen) {
        if (!Object.prototype.hasOwnProperty.call(seen, ck)) continue;
        parts = ck.split(',');
        dx = Number(parts[0]) * CELL - to.x; dy = Number(parts[1]) * CELL - to.y;
        if (dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; bestK = ck; }
      }
      endK = bestK;
      parts = bestK.split(',');
      to = { x: Number(parts[0]) * CELL, y: Number(parts[1]) * CELL };
    }
    var path = [to], p = prev[endK];
    while (p) { path.push(p); p = prev[key(p.x, p.y)]; }
    path.reverse();
    if (!path.length) path = [from, to];
    // compress colinear
    var out = [], a, b, c;
    for (i = 0; i < path.length; i++) {
      a = out[out.length - 2]; b = out[out.length - 1]; c = path[i];
      if (a && b && (b.x - a.x) * (c.y - b.y) === (b.y - a.y) * (c.x - b.x)) out[out.length - 1] = c;
      else out.push(c);
    }
    return out;
  }
  function pickWalkTarget(from) {
    var obs = obstacleRects(), vw = window.innerWidth, vh = window.innerHeight, i, x, y, cand = [], b = bounds();
    var spots = [
      { x: MARGIN, y: headerBottom() + 8 },
      { x: vw - SIZE - MARGIN, y: headerBottom() + 8 },
      { x: MARGIN, y: vh - SIZE - MARGIN },
      { x: vw - SIZE - MARGIN, y: vh - SIZE - MARGIN },
      { x: MARGIN, y: (headerBottom() + vh) / 2 },
      { x: vw - SIZE - MARGIN, y: (headerBottom() + vh) / 2 }
    ];
    // mid-aisle samples between first-row emojis
    var em = document.querySelectorAll('#app.is-home .grid .icon .emoji');
    for (i = 0; i < em.length; i++) {
      var r = em[i].getBoundingClientRect();
      spots.push({ x: r.left - SIZE - 8, y: r.bottom + 6 });
      spots.push({ x: r.right + 8, y: r.bottom + 6 });
      if (i + 1 < em.length) {
        var n = em[i + 1].getBoundingClientRect();
        spots.push({ x: (r.right + n.left) / 2 - SIZE / 2, y: Math.max(r.bottom, n.bottom) + 4 });
        spots.push({ x: (r.right + n.left) / 2 - SIZE / 2, y: Math.min(r.top, n.top) - SIZE - 4 });
      }
    }
    for (i = 0; i < 18; i++) {
      spots.push({
        x: MARGIN + Math.random() * Math.max(0, vw - SIZE - 2 * MARGIN),
        y: headerBottom() + Math.random() * Math.max(0, vh - SIZE - MARGIN - headerBottom())
      });
    }
    for (i = 0; i < spots.length; i++) {
      var w = nearestWalkable(spots[i].x, spots[i].y, obs);
      if (!w) continue;
      var dist = from ? Math.hypot(w.x - from.x, w.y - from.y) : 80;
      if (dist < 28) continue;
      cand.push({ p: w, d: dist });
    }
    if (!cand.length) return nearestWalkable(b.minX, b.maxY, obs);
    cand.sort(function (a, b) { return b.d - a.d; });
    return cand[Math.floor(Math.random() * Math.min(6, cand.length))].p;
  }

  function stopWalk() {
    walkGen += 1;
    clearTimeout(wanderTimer);
    if (el.walker) {
      el.walker.classList.remove('hb-walk', 'hb-at-home', 'hb-act-robot', 'hb-act-diva', 'hb-act-chauffor', 'hb-enter', 'hb-enter-preview', 'hb-marvin');
    }
    if (el.station) el.station.classList.remove('hb-on');
    state.atHome = false;
    state.visiting = false;
  }

  function walkPath(pts, onDone, walkOpt) {
    var gen = ++walkGen;
    if (!pts || !pts.length) { if (onDone) onDone(); return; }
    function go(i) {
      if (gen !== walkGen) return;
      if (i >= pts.length) {
        if (el.walker) el.walker.classList.remove('hb-walk');
        if (onDone) onDone();
        return;
      }
      // paus ibland mitt i en gång
      if (!walkOpt || !walkOpt.noPause) if (i > 0 && i < pts.length - 1 && Math.random() < 0.18) {
        if (el.walker) el.walker.classList.remove('hb-walk');
        el.walker.classList.add('idle');
        wanderTimer = setTimeout(function () {
          if (el.walker) el.walker.classList.remove('idle');
          go(i);
        }, 700 + Math.random() * 1200);
        return;
      }
      var p = pts[i];
      var dist = Math.hypot(p.x - pos.x, p.y - pos.y);
      var dur = Math.max(0.15, dist / WALK_SPEED);
      if (el.walker) {
        el.walker.classList.add('hb-walk');
        el.walker.classList.remove('idle');
        el.walker.style.transitionTimingFunction = 'linear';
      }
      setPos(p.x, p.y, dur, pos.x);
      wanderTimer = setTimeout(function () { go(i + 1); }, dur * 1000 + 20);
    }
    go(0);
  }

  function stationRoom() {
    if (!document.getElementById('app') || !document.getElementById('app').classList.contains('is-home')) return null;
    var vw = window.innerWidth, vh = window.innerHeight;
    var grid = document.querySelector('#app.is-home .grid');
    var dev = document.getElementById('home-devices');
    var bottom = headerBottom();
    if (grid) bottom = Math.max(bottom, grid.getBoundingClientRect().bottom);
    if (dev) bottom = Math.max(bottom, dev.getBoundingClientRect().bottom);
    var y = vh - ST_H - 10;
    var x = Math.max(MARGIN, Math.min(vw - ST_W - MARGIN, vw - ST_W - 16));
    if (y < bottom + 6) y = bottom + 8;
    if (y + ST_H > vh - 2) return null;
    // får inte täcka en ikon
    var box = { l: x, t: y, r: x + ST_W, b: y + ST_H };
    var obs = [];
    document.querySelectorAll('#app.is-home .grid .icon .emoji, #app.is-home .grid .td-slot-plus').forEach(function (n) {
      var r = n.getBoundingClientRect();
      obs.push({ l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 });
    });
    var i;
    for (i = 0; i < obs.length; i++) if (overlaps(box, obs[i])) return null;
    return { x: x, y: y };
  }
  function standAtStation(room, id) {
    if (!room) return null;
    var x = room.x + 8, y = room.y + ST_H - SIZE - 2;
    if (id === 'diva') { x = room.x + 6; y = room.y + 20; }
    if (id === 'chauffor') { x = room.x + 4; y = room.y + 16; }
    if (id === 'robot') { x = room.x + 28; y = room.y + ST_H - SIZE - 2; }
    return nearestWalkable(x, y, obstacleRects({ ignoreStation: true }));
  }
  function paintStation() {
    if (!el.station) return;
    var c = charId();
    if (c === 'off') { el.station.classList.add('hb-hidden'); return; }
    var room = stationRoom();
    if (!room) { el.station.classList.add('hb-hidden'); return; }
    el.station.classList.remove('hb-hidden');
    el.station.setAttribute('data-station', c);
    el.station.innerHTML = stationSvg(c);
    el.station.style.transform = 'translate3d(' + Math.round(room.x) + 'px,' + Math.round(room.y) + 'px,0)';
    el.station.style.display = '';
    return room;
  }
  function ensureStation() {
    if (el.station) return el.station;
    var s = document.createElement('div');
    s.className = 'hb-station hb-hidden';
    s.setAttribute('aria-hidden', 'true');
    document.body.appendChild(s);
    el.station = s;
    return s;
  }
  function arriveHome() {
    var c = charId();
    state.atHome = true;
    if (el.walker) {
      el.walker.classList.remove('hb-walk');
      el.walker.classList.add('idle', 'hb-at-home', 'hb-act-' + c);
    }
    if (el.station) el.station.classList.add('hb-on');
    var stay = 8000 + Math.random() * 6000;
    wanderTimer = setTimeout(function () {
      if (el.walker) el.walker.classList.remove('hb-at-home', 'hb-act-robot', 'hb-act-diva', 'hb-act-chauffor');
      if (el.station) el.station.classList.remove('hb-on');
      state.atHome = false;
      scheduleNextVisit();
      scheduleWander();
    }, stay);
  }
  function scheduleNextVisit() {
    var ms = firstVisit ? (40000 + Math.random() * 50000) : (150000 + Math.random() * 120000);
    firstVisit = false;
    nextVisitAt = Date.now() + ms;
  }
  function goToStation() {
    var room = paintStation();
    if (!room) { scheduleNextVisit(); scheduleWander(); return; }
    var stand = standAtStation(room, charId());
    if (!stand) { scheduleNextVisit(); scheduleWander(); return; }
    var path = findPath(pos, stand, { ignoreStation: true });
    walkPath(path, arriveHome);
  }


  function iconNode(tool) {
    return document.querySelector('#app.is-home .grid .icon[data-tool="' + tool + '"] .emoji');
  }
  function visibleTools() {
    var out = [];
    document.querySelectorAll('#app.is-home .grid .icon[data-tool]').forEach(function (n) {
      var id = n.getAttribute('data-tool');
      if (id && id !== 'installningar' && id !== 'om' && n.getBoundingClientRect().width > 8) out.push(id);
    });
    return out;
  }
  function tryIconVisit() {
    if (!scenarioAnimOn() || !canWalk() || charId() === 'off') {
      nextIconAt = Date.now() + 120000;
      return false;
    }
    var ids = visibleTools(), i, hit = null, tool = null, order = ids.slice();
    order.sort(function () { return Math.random() - 0.5; });
    for (i = 0; i < order.length; i++) {
      hit = pickScenario('home', order[i]);
      if (hit && iconNode(order[i])) { tool = order[i]; break; }
    }
    nextIconAt = Date.now() + 150000 + Math.random() * 120000;
    if (!tool || !hit) return false;
    visitIcon(tool, hit);
    return true;
  }
  function visitIcon(tool, hit) {
    var node = iconNode(tool);
    if (!node || !el.walker) return false;
    var r = node.getBoundingClientRect();
    var dest = { x: r.left + r.width / 2 - SIZE / 2, y: r.top + r.height / 2 - SIZE / 2 };
    var path = findPath(pos, dest, { ignoreTool: tool });
    state.visiting = true;
    clearTimeout(wanderTimer);
    walkPath(path, function () {
      if (!el.walker) { state.visiting = false; return; }
      el.walker.classList.add('hb-enter');
      wanderTimer = setTimeout(function () {
        if (!el.walker) { state.visiting = false; return; }
        el.walker.classList.remove('hb-enter');
        var out = nearestWalkable(dest.x, dest.y + Math.max(36, r.height + 8), obstacleRects());
        walkPath(findPath(pos, out, { ignoreTool: tool }), function () {
          state.visiting = false;
          if (hit && window.HJALPBOT_SCENARIER && HJALPBOT_SCENARIER.mark && hit.scenario) HJALPBOT_SCENARIER.mark(hit.scenario);
          if (hit && hit.text) say(hit.text, { tool: tool, mood: hit.mood });
          else scheduleWander();
        }, { noPause: true });
      }, 2600);
    }, { noPause: true });
    return true;
  }

  function scheduleWander() {
    clearTimeout(wanderTimer);
    if (!el.walker || el.walker.style.display === 'none' || document.hidden) return;
    ensureStation();
    paintStation();
    if (!canWalk()) {
      var park = nearestWalkable(pos.x, pos.y, obstacleRects());
      setPos(park.x, park.y, 0, pos.x);
      el.walker.classList.add('idle');
      el.walker.classList.remove('hb-walk');
      return;
    }
    if (state.panel || state.atHome || state.visiting) return;
    if (!nextVisitAt) scheduleNextVisit();
    if (!nextIconAt) nextIconAt = Date.now() + 70000 + Math.random() * 50000;
    var pause = 1800 + Math.random() * 2200;
    wanderTimer = setTimeout(function () {
      if (!el.walker || el.walker.style.display === 'none' || state.panel || state.atHome || state.visiting) return;
      if (Date.now() >= nextVisitAt && paintStation()) {
        goToStation();
        return;
      }
      if (Date.now() >= nextIconAt && tryIconVisit()) return;
      maybeRandomComment();
      var next = pickWalkTarget(pos);
      var path = findPath(pos, next);
      walkPath(path, function () {
        if (el.walker) el.walker.classList.add('idle');
        scheduleWander();
      });
    }, pause);
  }

    function onResize() {
    paintStation();
    var w = nearestWalkable(pos.x, pos.y, obstacleRects());
    setPos(w.x, w.y, 0);
    if (el.walker && el.walker.style.display !== 'none') scheduleWander();
  }


  function build() {
    if (document.querySelector('.hb-walker') && document.getElementById('hb-css')) {
      el.walker = document.querySelector('.hb-walker');
      el.btn = el.walker.querySelector('.hb-btn');
      el.bubble = document.querySelector('.hb-bubble');
      el.panel = document.querySelector('.hb-panel');
      el.station = document.querySelector('.hb-station');
      ensureStation();
      return;
    }
    css();
    el.walker = document.createElement('div'); el.walker.className = 'hb-walker idle';
    el.walker.innerHTML = '<div class="hb-flip"><button class="hb-btn" type="button" aria-label="Hjälpbot – tryck för frågor"></button></div>';
    el.btn = el.walker.querySelector('.hb-btn');
    el.bubble = document.createElement('div'); el.bubble.className = 'hb-bubble'; el.bubble.setAttribute('role', 'status'); el.bubble.setAttribute('aria-live', 'polite');
    el.bubbleTxt = document.createElement('div'); el.bubbleTxt.className = 'hb-bubble-txt';
    el.bubbleTail = document.createElement('span'); el.bubbleTail.className = 'hb-bubble-tail'; el.bubbleTail.setAttribute('aria-hidden', 'true');
    el.bubble.appendChild(el.bubbleTxt); el.bubble.appendChild(el.bubbleTail);
    el.panel = document.createElement('div'); el.panel.className = 'hb-panel'; el.panel.setAttribute('role', 'dialog'); el.panel.setAttribute('aria-label', 'Hjälpbot');
    [el.walker, el.bubble, el.panel].forEach(function (x) { document.body.appendChild(x); });
    ensureStation();
    el.btn.addEventListener('click', function () { wave(); state.panel ? closePanel() : openPanel(); });
    el.bubble.addEventListener('click', function (e) {
      var tip = state.bubbleTip, id = state.bubbleTool;
      if (!tip && !id) return;
      e.preventDefault();
      e.stopPropagation();
      if (tip && tip.go) state.visiting = true;
      hideBubble({ keepVisit: !!(tip && tip.go) });
      if (tip && tip.go) tip.go({ walk: canWalk() });
      else if (id && typeof window.openItem === 'function') window.openItem(id);
    });

    el.panel.addEventListener('click', onPanel);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', function () {
      if (!pageVisible()) {
        stopWalk();
        clearTimeout(wanderTimer);
        pauseStickyBubble();
      } else {
        resumeStickyBubble();
        flushPendingTip();
        if (el.walker && el.walker.style.display !== 'none') scheduleWander();
        drawChar();
      }
      if (window.HJALPBOT_HOGTID && HJALPBOT_HOGTID.onVisibility) HJALPBOT_HOGTID.onVisibility();
    });
    drawChar();
    paintStation();
  }
  function drawChar() {
    try {
      var c = charId();
      if (c === 'off' || !el.btn) return;
      el.btn.innerHTML = CHARS[c].svg();
      applyGear(el.btn.querySelector('svg'));
      paintStation();
    } catch (e) {}
  }
  function wave() {
    el.walker.classList.remove('waving'); void el.walker.offsetWidth; el.walker.classList.add('waving');
    setTimeout(function () { el.walker.classList.remove('waving'); }, 1500);
  }
  function pageVisible() {
    try { return document.visibilityState === 'visible'; } catch (e) { return true; }
  }
  function say(text, opt) {
    if (!text || charId() === 'off' || !el.walker || el.walker.style.display === 'none' || state.panel) return;
    opt = opt || {};
    var sticky = !!(opt.persist || opt.tip);
    if (sticky && !pageVisible() && !opt.force) {
      state.pausedTip = { text: text, tip: opt.tip || null, tool: opt.tool || null, marked: !!opt.alreadyCounted };
      return;
    }
    clearTimeout(state.hideT);
    setBubbleText(text);
    state.bubbleTool = opt.tool || null;
    state.bubbleTip = opt.tip || null;
    state.stickyBubble = sticky;
    if (state.bubbleTool || state.bubbleTip) el.bubble.classList.add('hb-tap');
    else el.bubble.classList.remove('hb-tap');
    el.bubble.classList.add('show');
    if (opt.mood === 'marvin' && el.walker) {
      el.walker.classList.remove('hb-marvin');
      void el.walker.offsetWidth;
      el.walker.classList.add('hb-marvin');
    }
    placeChrome();
    el.walker.classList.add('talking', 'idle');
    state.lastComment = Date.now(); sessionStorage.setItem('hb_last', String(state.lastComment));
    setTimeout(function () { el.walker.classList.remove('talking'); }, 2200);
    if (sticky && pageVisible() && opt.tip && opt.tip.id && !opt.alreadyCounted && !opt.skipCount) {
      try { if (window.HJALPBOT_TIPS && HJALPBOT_TIPS.markShown) HJALPBOT_TIPS.markShown(opt.tip.id); } catch (e) {}
      state.tipCounted = true;
    } else {
      state.tipCounted = !!opt.alreadyCounted;
    }
    if (!sticky) state.hideT = setTimeout(hideBubble, BUBBLE_MS);
    else state.hideT = null;
    if (sticky && opt.tip && !opt.skipGuide && typeof opt.tip.guide === 'function') {
      opt.tip.guide({ walk: canWalk() });
    }
  }
  function hideBubble(opt) {
    opt = opt || {};
    clearTimeout(state.hideT);
    if (el.bubble) { el.bubble.classList.remove('show', 'hb-tap'); }
    state.bubbleTool = null;
    state.bubbleTip = null;
    state.stickyBubble = false;
    state.tipCounted = false;
    state.pausedTip = null;
    if (el.walker) el.walker.classList.remove('hb-marvin');
    if (!opt.keepVisit) {
      clearTipHl();
      state.guiding = false;
      if (!state.visiting) scheduleWander();
    }
  }
  function pauseStickyBubble() {
    if (!state.stickyBubble && !state.bubbleTip) return;
    if (!el.bubble || !el.bubble.classList.contains('show')) return;
    state.pausedTip = { text: getBubbleText(), tip: state.bubbleTip, tool: state.bubbleTool, marked: !!state.tipCounted };
    clearTimeout(state.hideT);
    el.bubble.classList.remove('show', 'hb-tap');
  }
  function resumeStickyBubble() {
    if (!state.pausedTip || !pageVisible()) return;
    var p = state.pausedTip;
    state.pausedTip = null;
    say(p.text, { tip: p.tip, tool: p.tool, persist: true, alreadyCounted: p.marked, skipGuide: true });
  }

  // Verkstadstimmar: förarens egna siffror från serverns svar (window.VERKSTAD_LAST)
  var MONL = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  function verkstadComment(d) {
    var V = window.VERKSTAD; if (!d || !d.summary || !V) return null;
    var s = d.summary, opts = [];
    if (s.pending_n) opts.push('vkPending');
    if (s.approved_month_min) opts.push('vkApproved');
    if (s.rejected_recent) opts.push('vkRejected');
    if (!opts.length) return (d.entries || []).length ? null : line('vkNone');
    var k = opts[Math.floor(Math.random() * opts.length)];
    return line(k, { h: V.dur(s.pending_min), n: s.pending_n, ah: V.dur(s.approved_month_min), akr: V.kr(s.approved_month_kr), m: MONL[new Date().getMonth()] });
  }

  function show(on) {
    var was = el.walker && el.walker.style.display !== 'none';
    if (el.walker) el.walker.style.display = on ? '' : 'none';
    if (el.station) el.station.style.display = on ? '' : 'none';
    if (!on) { hideBubble(); closePanel(); stopWalk(); if (el.station) el.station.classList.add('hb-hidden'); }
    else if (!was) {
      ensureStation();
      paintStation();
      var startAt = nearestWalkable((pickSpot(null) || pos).x, (pickSpot(null) || pos).y, obstacleRects());
      setPos(startAt.x, startAt.y, 0);
      scheduleWander();
    }
  }

  // ---------- spontana kommentarer ----------
  function scenarioAnimOn() {
    try { return !!(window.ANIMATIONER && ANIMATIONER.isOn && ANIMATIONER.isOn()); } catch (e) { return false; }
  }
  function pickScenario(ctx, tool, extra) {
    var S = window.HJALPBOT_SCENARIER;
    if (!S || !S.pick) return null;
    extra = extra || {};
    return S.pick({ context: ctx, tool: tool, char: charId(), clock: extra.clock, skipCooldown: extra.skipCooldown, skipChance: extra.skipChance });
  }
  function speakScenario(hit, delay) {
    if (!hit || !hit.text) return false;
    function go() {
      if (window.HJALPBOT_SCENARIER && HJALPBOT_SCENARIER.mark && hit.scenario) HJALPBOT_SCENARIER.mark(hit.scenario);
      say(hit.text, { tool: hit.tool, mood: hit.mood });
    }
    if (delay) setTimeout(go, delay);
    else go();
    return true;
  }
  function flushPendingTip() {
    if (!state.pendingTip || !state.pendingTipHit) return;
    if (page() !== 'hem' || charId() === 'off' || state.panel) {
      state.pendingTip = false;
      state.pendingTipHit = null;
      return;
    }
    if (!pageVisible()) return;
    var hit = state.pendingTipHit;
    state.pendingTip = false;
    state.pendingTipHit = null;
    say(hit.text, { tip: hit.tip, persist: true });
  }
  function maybeTip() {
    if (charId() === 'off' || !el.walker || el.walker.style.display === 'none' || state.panel) return false;
    if (!pageVisible()) return false;
    var T = window.HJALPBOT_TIPS, last, hit;
    if (!T || !T.pick) return false;
    last = +(sessionStorage.getItem('hb_last') || 0);
    if (Date.now() - last < COMMENT_GAP_MS) return false;
    hit = T.pick({ char: charId() });
    if (!hit) return false;
    state.pendingTip = true;
    state.pendingTipHit = hit;
    setTimeout(flushPendingTip, 1600);
    return true;
  }
  function maybeTipQuiet() {
    if (state.pendingTip || state.panel || state.visiting) return;
    var last = +(sessionStorage.getItem('hb_last') || 0);
    if (Date.now() - last < COMMENT_GAP_MS * 4) return;
    maybeTip();
  }
  function maybeComment(p) {
    if (!scenarioAnimOn()) return;
    var last = +(sessionStorage.getItem('hb_last') || 0);
    if (Date.now() - last < COMMENT_GAP_MS) return;
    if (p && p !== 'hem') {
      var hit = pickScenario('page', p);
      if (hit) {
        state.pendingFor = p;
        setTimeout(function () {
          if (page() === p && state.pendingFor === p) { state.pendingFor = null; speakScenario(hit); }
        }, 1200);
        return;
      }
    }
    if (Math.random() > COMMENT_CHANCE) return;
    state.pendingFor = p;
    if (p === 'hem') setTimeout(function () { if (page() === 'hem' && state.pendingFor === 'hem') { state.pendingFor = null; say(hemComment()); } }, 1200);
    else if (p === 'kordata') { if (window.taxiStats && window.taxiStats('dag')) setTimeout(fireKordata, 1200); }
    else if (p === 'ankomster') setTimeout(fireAnk, 2500);
    else if (p === 'topplistor') setTimeout(fireTopp, 1500);
    else if (p === 'verkstad') setTimeout(fireVerkstad, 1500);
    else if (p === 'profil' && window.HB_PROFILE && Date.now() - window.HB_PROFILE.at < 3000) setTimeout(fireProfil, 800);
  }
  function maybeTimeComment() {
    if (!scenarioAnimOn() || document.hidden || charId() !== 'robot') return;
    if (state.panel || !el.walker || el.walker.style.display === 'none') return;
    var hit = pickScenario('time');
    if (hit) speakScenario(hit);
  }
  function maybeRandomComment() {
    if (!scenarioAnimOn() || document.hidden) return;
    if (state.panel || state.visiting || !el.walker || el.walker.style.display === 'none') return;
    var last = +(sessionStorage.getItem('hb_last') || 0);
    if (Date.now() - last < COMMENT_GAP_MS * 3) return;
    var hit = pickScenario('random');
    if (hit) speakScenario(hit);
  }
  function fireKordata() { if (state.pendingFor === 'kordata' && page() === 'kordata') { state.pendingFor = null; say(kordataComment()); } }
  function fireProfil() { if (state.pendingFor === 'profil' && page() === 'profil') { state.pendingFor = null; say(profilComment()); } }
  function fireAnk() {
    if (state.pendingFor !== 'ankomster' || page() !== 'ankomster') return;
    var id = window.ANKOMSTER.current(); if (!id) return;
    state.pendingFor = null;
    window.ANKOMSTER.summary(id).then(function (s) { if (page() === 'ankomster') say(ankomsterComment(s)); });
  }
  document.addEventListener('taxidata:render', function () { if (state.pendingFor === 'kordata') setTimeout(fireKordata, 600); });
  function fireTopp() {
    var info = window.TOPPLISTOR_LAST;
    if (state.pendingFor !== 'topplistor' || page() !== 'topplistor' || !info) return;
    state.pendingFor = null; say(topplistorComment(info));
  }
  document.addEventListener('topplistor:data', function () { if (state.pendingFor === 'topplistor') setTimeout(fireTopp, 600); });
  function fireVerkstad() {
    var d = window.VERKSTAD_LAST;
    if (state.pendingFor !== 'verkstad' || page() !== 'verkstad' || !d) return;
    state.pendingFor = null; say(verkstadComment(d));
  }
  document.addEventListener('verkstad:data', function () { if (state.pendingFor === 'verkstad') setTimeout(fireVerkstad, 600); });
  document.addEventListener('profil:loaded', function () { if (state.pendingFor === 'profil') setTimeout(fireProfil, 600); });

  function tick() {
    if (!el.walker) return;
    var p = page(), on = !!p && charId() !== 'off';
    if ((el.walker.style.display !== 'none') !== on) show(on);
    if (p !== state.page) {
      state.page = p;
      hideBubble(); if (state.panel) closePanel();
      if (on && pageVisible()) {
        if (p === 'hem' && maybeTip()) { /* tipset tar den här visningen */ }
        else maybeComment(p);
        if (window.HJALPBOT_HOGTID && HJALPBOT_HOGTID.maybePlay) HJALPBOT_HOGTID.maybePlay();
      }
    } else if (on && pageVisible()) {
      maybeTimeComment();
      if (p === 'hem') maybeTipQuiet();
      if (window.HJALPBOT_HOGTID && HJALPBOT_HOGTID.maybePlay) HJALPBOT_HOGTID.maybePlay();
    }
  }

  // ---------- panel ----------
  var QS = [
    { id: 'idag', q: 'Vad har jag kört in idag?' },
    { id: 'mal', q: 'Hur går det mot målet?' },
    { id: 'tag', q: 'Nästa tåg?' },
    { id: 'flyg', q: 'Nästa flyg?' },
    { id: 'losen', q: 'Hur byter jag lösenord?' }
  ];
  function charButtons(cls) {
    return Object.keys(CHARS).map(function (k) {
      return '<button class="' + cls + (charId() === k ? ' on' : '') + '" data-hb-char="' + k + '">' + (cls === 'hb-pickbtn' ? CHARS[k].svg() : '') + esc(CHARS[k].name) + '</button>';
    }).join('');
  }
  function openPanel() {
    state.panel = true; clearTimeout(wanderTimer); el.walker.classList.add('idle'); hideBubble();
    var c = charId();
    el.panel.innerHTML = '<div class="hb-ph"><span>' + esc(CHARS[c].name) + '</span><button class="hb-x" data-hb-close aria-label="Stäng">✕</button></div>' +
      '<div class="hb-say" id="hb-say">' + esc(line('hello')) + '</div>' +
      '<div class="hb-qs">' + QS.map(function (x) { return '<button class="hb-q" data-hb-q="' + x.id + '">' + esc(x.q) + '</button>'; }).join('') + '</div>' +
      '<div class="hb-set">Välj figur:<div class="hb-cs">' + charButtons('hb-c') + '<button class="hb-c" data-hb-char="off">Stäng av</button></div></div>';
    el.panel.classList.add('open');
  }
  function hideBubble2() { clearTimeout(state.hideT); el.bubble.classList.remove('show'); }
  function closePanel() { state.panel = false; if (el.panel) el.panel.classList.remove('open'); scheduleWander(); }
  function answer(html) { var s = document.getElementById('hb-say'); if (s) s.innerHTML = html; el.walker.classList.add('talking'); setTimeout(function () { el.walker.classList.remove('talking'); }, 1800); }

  function onPanel(e) {
    var t;
    if (e.target.closest('[data-hb-close]')) { closePanel(); return; }
    if ((t = e.target.closest('[data-hb-char]'))) { setChar(t.getAttribute('data-hb-char')); if (charId() !== 'off') openPanel(); return; }
    if (e.target.closest('[data-hb-profil]')) { closePanel(); if (window.openProfile) window.openProfile(); return; }
    if ((t = e.target.closest('[data-hb-q]'))) ask(t.getAttribute('data-hb-q'));
  }
  function ask(q) {
    answer('…');
    if (q === 'losen') {
      answer(esc(line('losen')) + ' Tryck på 👤 uppe till höger → <b>Profil</b> → längst ner <b>Byt lösenord</b>. Skriv ditt nuvarande lösenord och det nya två gånger. ' +
        'Glömt det? Logga ut och tryck <b>Glömt lösenord?</b> så kommer en länk till din e-post (gäller 1 timme).<br><button class="hb-link" data-hb-profil>Öppna Profil</button>');
      return;
    }
    if (q === 'tag' || q === 'flyg') {
      if (!window.ANKOMSTER) { answer(esc(line('err'))); return; }
      window.ANKOMSTER.summary(q).then(function (s) {
        if (!s) { answer(esc(line('err'))); return; }
        if (!s.next) { answer(esc(line('none', { kind: q === 'flyg' ? 'flyg' : 'tåg', place: s.source.place }))); return; }
        answer(esc(line('next', arrCtx(s.source, s.next))) + '<br><small>' + esc(arrivalFacts(s)) +
          (q === 'tag' ? ' (tåg från Stockholm, Köpenhamn och Oslo till ' + esc(s.source.place) + ')' : '') + '</small>');
      });
      return;
    }
    var ensure = window.taxiEnsureData ? window.taxiEnsureData() : Promise.resolve();
    Promise.resolve(ensure).then(function () {
      var d = window.taxiStats ? window.taxiStats('dag') : null;
      if (!d) { answer(esc(line('err'))); return; }
      var who = d.own ? '' : ' <small>(för föraren du har valt i Körpassdata)</small>';
      if (q === 'idag') { answer(esc(d.antal ? line('idag', statsCtx(d)) : line('idagNone')) + who); return; }
      var rows = ['dag', 'vecka', 'manad'].map(function (tab) {
        var s = window.taxiStats(tab), name = { dag: 'Dag', vecka: 'Vecka', manad: 'Månad' }[tab];
        return name + ': ' + kr(s.inkort) + ' av ' + kr(s.goal) + ' – ' + (s.diff >= 0 ? '<b>' + kr(s.diff) + ' över</b>' : kr(-s.diff) + ' kvar');
      });
      answer(esc(line('mal')) + '<br>' + rows.join('<br>') + '<br>' + esc(statsComment(d)) + who);
    });
  }

  function setChar(c) {
    localStorage.setItem(driverKey(), c);
    if (c === 'off') { show(false); return; }
    drawChar(); wave(); tick();
  }

  // Inställningar-sidan (hemskärmen → Inställningar)
  window.HJALPBOT = {
    renderSettings: function (content) {
      var c = charId();
      content.innerHTML = '<div class="section"><h3 style="margin-top:0">Hjälpbot</h3>' +
        '<p style="font-size:.9rem;color:var(--text-soft);margin:.3rem 0">En liten figur på skärmen som kommenterar dina siffror och svarar på enkla frågor. Tryck på den för att fråga.</p>' +
        '<div class="hb-pick">' + charButtons('hb-pickbtn') + '<button class="hb-pickbtn' + (c === 'off' ? ' on' : '') + '" data-hb-char="off"><div style="height:56px;display:flex;align-items:center;justify-content:center;font-size:1.6rem">🚫</div>Av</button></div></div>';
      content.onclick = function (e) {
        var t = e.target.closest('[data-hb-char]'); if (!t) return;
        setChar(t.getAttribute('data-hb-char'));
        window.HJALPBOT.renderSettings(content);
      };
    },
    say: function (t) { say(t); },
    chars: CHARS,
    lines: L,
    previewOutfit: function (outfit) {
      var ok = { cold: 1, rain: 1, snow: 1, sun: 1, lucia: 1, pepparkaka: 1, stjarngosse: 1, 'halloween-robot': 1, 'halloween-diva': 1, 'halloween-chauffor': 1 };
      state.forceOutfit = ok[outfit] ? outfit : '';
      drawChar();
      return state.forceOutfit;
    },
    currentOutfit: currentOutfit,
    previewStation: function (id) {
      if (id && CHARS[id]) {
        try { localStorage.setItem(driverKey(), id); } catch (e) {}
      }
      show(true);
      drawChar();
      ensureStation();
      var room = paintStation();
      var stand = standAtStation(room, charId());
      if (!stand) return false;
      stopWalk();
      setPos(stand.x, stand.y, 0);
      arriveHome();
      return true;
    },
    pickScenario: function (ctx, tool, extra) { return pickScenario(ctx, tool, extra || { skipCooldown: true, skipChance: true }); },
    previewSay: function (text, tool, mood) {
      show(true);
      say(text, { tool: tool, mood: mood });
      return true;
    },
    previewMarvin: function (text) {
      show(true);
      if (charId() !== 'robot') {
        try { localStorage.setItem(driverKey(), 'robot'); } catch (e) {}
        drawChar();
      }
      say(text || 'Hjärna stor som en planet, och de låter mig visa taxibokningar.', { mood: 'marvin' });
      return true;
    },
    previewVisit: function (tool, phase, text) {
      show(true);
      tool = tool || 'kordata';
      var node = iconNode(tool);
      if (!node) return false;
      var r = node.getBoundingClientRect();
      var dest = { x: r.left + r.width / 2 - SIZE / 2, y: r.top + r.height / 2 - SIZE / 2 };
      stopWalk();
      hideBubble();
      state.visiting = true;
      if (phase === 'in') {
        setPos(dest.x, dest.y, 0);
        el.walker.classList.add('hb-enter-preview');
        return true;
      }
      el.walker.classList.remove('hb-enter', 'hb-enter-preview');
      var out = nearestWalkable(dest.x, dest.y + Math.max(36, r.height + 8), obstacleRects());
      setPos(out.x, out.y, 0);
      state.visiting = false;
      say(text || 'Bip! En kommentar.', { tool: tool });
      return true;
    },
    previewAisle: function () {
      show(true);
      ensureStation();
      paintStation();
      var em = document.querySelectorAll('#app.is-home .grid .icon .emoji');
      if (em.length < 2) return false;
      var a = em[0].getBoundingClientRect(), b = em[1].getBoundingClientRect();
      var x = (a.right + b.left) / 2 - SIZE / 2;
      var y = Math.max(a.bottom, b.bottom) + 4;
      var w = nearestWalkable(x, y, obstacleRects());
      stopWalk();
      setPos(w.x, w.y, 0);
      if (el.walker) {
        el.walker.classList.add('hb-walk');
        el.walker.classList.remove('idle');
        if (w.x < pos.x) el.walker.classList.add('hb-left');
      }
      return { x: w.x, y: w.y };
    }
  };

  function start() {
    reduceMotion = prefersReduce();
    build();
    show(false);
    tick();
    setInterval(function () { if (!document.hidden) tick(); }, 1000);
    var boot = setInterval(function () {
      tick();
      if (el.walker && el.walker.style.display !== 'none') clearInterval(boot);
    }, 200);
    setTimeout(function () { clearInterval(boot); }, 8000);
    setTimeout(function () {
      if (window.HJALPBOT_HOGTID && HJALPBOT_HOGTID.maybePlay) HJALPBOT_HOGTID.maybePlay();
    }, 800);
    document.addEventListener('animationer-change', function () {
      drawChar();
      if (!canWalk()) { stopWalk(); var park = nearestWalkable(pos.x, pos.y, obstacleRects()); setPos(park.x, park.y, 0); }
      else if (el.walker && el.walker.style.display !== 'none') scheduleWander();
      if (window.HJALPBOT_HOGTID) {
        if (!animOn()) { if (HJALPBOT_HOGTID.stop) HJALPBOT_HOGTID.stop(); }
        else if (HJALPBOT_HOGTID.maybePlay) HJALPBOT_HOGTID.maybePlay();
      }
    });
    document.addEventListener('animationer-vader', function () { drawChar(); });
    window.HJALPBOT.walkTo = function (node, done, opt) {
      opt = opt || {};
      if (typeof node === 'string') node = document.querySelector(node);
      if (!node || !el.walker || !canWalk()) { if (done) done(); return false; }
      var dest = destNearTarget(node);
      state.visiting = true;
      state.guiding = !!opt.stay;
      clearTimeout(wanderTimer);
      if (opt.fast) return glideTo(dest, done, opt);
      walkPath(findPath(pos, dest), function () {
        if (!opt.stay) state.visiting = false;
        if (done) done();
        if (!opt.stay) scheduleWander();
      }, { noPause: true });
      return true;
    };
    window.HJALPBOT.previewHoliday = function (id, opts) {
      opts = opts || {};
      var H = window.HJALPBOT_HOGTID, list, day, i, y, m, d;
      if (!H) return false;
      list = H.all ? H.all() : [];
      day = null;
      if (id) for (i = 0; i < list.length; i++) if (list[i].id === id) day = list[i];
      if (!day) day = H.active && H.active();
      if (!day) return false;
      if (H.setTestDate && day.month && day.day) {
        y = String((H.today && H.today().year) || new Date().getFullYear());
        m = (day.month < 10 ? '0' : '') + day.month;
        d = (day.day < 10 ? '0' : '') + day.day;
        H.setTestDate(y + '-' + m + '-' + d);
      }
      show(true);
      if (day.outfits && day.outfits[charId()]) {
        state.forceOutfit = day.outfits[charId()];
        drawChar();
      }
      if (H.play) {
        H.play(day, {
          force: true,
          skipCap: true,
          progress: opts.progress != null ? opts.progress : (day.mode === 'tag' ? 0.58 : null)
        });
      }
      if (day.mode !== 'tag') {
        var line = H.lineFor ? H.lineFor(day, charId() === 'off' ? 'robot' : charId()) : null;
        if (line) say(line, { persist: true, skipCount: true, force: true });
      }
      return day;
    };
    window.HJALPBOT.previewTip = function (id) {
      var T = window.HJALPBOT_TIPS, hit, list, i;
      if (!T) return false;
      list = T.all ? T.all() : [];
      hit = null;
      if (id) {
        for (i = 0; i < list.length; i++) if (list[i].id === id) hit = { id: list[i].id, text: list[i].text, tip: list[i] };
      }
      if (!hit) hit = T.pick({ char: charId(), skipShows: true });
      if (!hit) {
        hit = list[0] ? { id: list[0].id, text: list[0].text, tip: list[0] } : null;
      }
      if (!hit) return false;
      show(true);
      say(hit.text, { tip: hit.tip });
      return hit;
    };
    window.HJALPBOT._previewPos = function (x, y, dur) { setPos(x, y, dur == null ? 0 : dur, pos.x); };
    window.HJALPBOT._pickSpot = pickSpot;
    window.HJALPBOT._pos = function () { return { x: pos.x, y: pos.y }; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
