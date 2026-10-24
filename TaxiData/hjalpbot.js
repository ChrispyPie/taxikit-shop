/* Hjälpboten: en liten animerad figur längst ner i förarappen.
 * Regelbaserad (ingen AI, inga betal-API:er). Den pratar bara om siffror som redan finns i appen.
 * Figurer: Robot, Chaufför, Cool och Taxi-Diva (egna SVG-teckningar). Valet sparas per förare i localStorage.
 * Byt namn/repliker här nedan. Inställning: Inställningar på hemskärmen eller tryck på boten.
 */
(function () {
  'use strict';

  var CHARS = {
    robot: { name: 'Robot', svg: robotSvg },
    chauffor: { name: 'Chaufför', svg: chaufforSvg },
    cool: { name: 'Cool', svg: coolSvg },
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
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<rect x="21" y="54" width="9" height="6" rx="2" fill="' + K + '"/><rect x="34" y="54" width="9" height="6" rx="2" fill="' + K + '"/>' +
      '<path d="M19 60 h11 v3 h-11 z M34 60 h11 v3 h-11 z" fill="' + K + '"/>' +
      '<path d="M46 44 L51 51" stroke-width="5.5"/><path d="M46 44 L51 51" stroke="' + Y + '" stroke-width="3.5"/><circle cx="51.5" cy="52" r="2.7" fill="' + SKIN + '"/>' +
      '<path d="M17 47 q0 -8 8 -8 h14 q8 0 8 8 v9 h-30 z" fill="' + Y + '"/>' +
      '<path d="M27 39 l5 7 5 -7 z" fill="#fff"/><path d="M27 39 l-3 2 6 7 z M37 39 l3 2 -6 7 z" fill="' + K + '"/>' +
      '<path d="M31 41 h2 l1 9 -2 2 -2 -2 z" fill="' + T + '" stroke-width="1"/>' +
      '<g class="hb-arm"><path d="M19 44 L11 35" stroke-width="5.5"/><path d="M19 44 L11 35" stroke="' + Y + '" stroke-width="3.5"/>' +
      '<path d="M7.5 33 q-1 -4 2 -5 q1 -2 3 0 q2 -1 2.5 1.5 q1.5 2 -1 4 q-3 2 -6.5 -0.5z" fill="' + SKIN + '"/></g>' +
      '<path d="M19 26 q-1 -8 13 -9 q14 1 13 9 z" fill="#5a3825"/>' +
      '<circle cx="32" cy="27.5" r="12.5" fill="' + SKIN + '"/>' +
      '<circle cx="19.6" cy="28" r="2.4" fill="' + SKIN + '"/><circle cx="44.4" cy="28" r="2.4" fill="' + SKIN + '"/>' +
      '<g class="hb-eyes" stroke="none"><circle cx="27" cy="28.5" r="2.2" fill="#134e4a"/><circle cx="37" cy="28.5" r="2.2" fill="#134e4a"/>' +
      '<circle cx="27.7" cy="27.8" r="0.7" fill="#fff"/><circle cx="37.7" cy="27.8" r="0.7" fill="#fff"/></g>' +
      '<circle cx="24" cy="32.5" r="1.8" fill="#f4a6a0" stroke="none" opacity="0.7"/><circle cx="40" cy="32.5" r="1.8" fill="#f4a6a0" stroke="none" opacity="0.7"/>' +
      '<path class="hb-mouth" d="M28.5 33 Q32 37.5 35.5 33 z" fill="#e05a5a"/>' +
      capSvg(32, 6, 30) + '</g></svg>';
  }
  function coolSvg() {
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<rect x="21" y="54" width="9" height="6" rx="2" fill="#2b2b3a"/><rect x="34" y="54" width="9" height="6" rx="2" fill="#2b2b3a"/>' +
      '<path d="M19 60 h11 v3 h-11 z M34 60 h11 v3 h-11 z" fill="#fff"/>' +
      '<path d="M46 44 L51 51" stroke-width="5.5"/><path d="M46 44 L51 51" stroke="#2d2d2d" stroke-width="3.5"/><circle cx="51.5" cy="52" r="2.7" fill="' + SKIN + '"/>' +
      '<path d="M17 47 q0 -8 8 -8 h14 q8 0 8 8 v9 h-30 z" fill="#2d2d2d"/>' +
      '<path d="M27 39 l5 9 5 -9 z" fill="' + Y + '"/><path d="M26 39 l-4 3 7 8 z M38 39 l4 3 -7 8 z" fill="#3d3d3d"/>' +
      '<path d="M20 52 h24" stroke="' + Y + '" stroke-width="1.2"/>' +
      '<g class="hb-arm"><path d="M19 44 L11 35" stroke-width="5.5"/><path d="M19 44 L11 35" stroke="#2d2d2d" stroke-width="3.5"/>' +
      '<path d="M7.5 33 q-1 -4 2 -5 q1 -2 3 0 q2 -1 2.5 1.5 q1.5 2 -1 4 q-3 2 -6.5 -0.5z" fill="' + SKIN + '"/></g>' +
      '<circle cx="32" cy="27.5" r="12.5" fill="' + SKIN + '"/>' +
      '<path d="M19.5 25 q-1 -12 12 -12 q9 0 12 5 q-4 -2 -8 0 q2 2 1 4 q-5 -4 -11 -1 q-4 1 -6 4 z" fill="#2a1d14"/>' +
      '<circle cx="19.6" cy="28.5" r="2.4" fill="' + SKIN + '"/><circle cx="44.4" cy="28.5" r="2.4" fill="' + SKIN + '"/>' +
      '<path d="M21 26 h22" stroke-width="1.6"/>' +
      '<rect x="21.5" y="25" width="9" height="6" rx="2.6" fill="' + K + '"/><rect x="33.5" y="25" width="9" height="6" rx="2.6" fill="' + K + '"/>' +
      '<g class="hb-eyes" stroke="#fff" stroke-width="1" opacity="0.85"><path d="M23.5 27 l2 -1"/><path d="M35.5 27 l2 -1"/></g>' +
      '<path class="hb-mouth" d="M28.5 35 Q33 37 36.5 33.5" fill="none" stroke-width="1.6"/></g></svg>';
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
      '<circle cx="24.5" cy="32" r="1.6" fill="#f4a6a0" stroke="none" opacity="0.7"/><circle cx="39.5" cy="32" r="1.6" fill="#f4a6a0" stroke="none" opacity="0.7"/>' +
      '<path class="hb-mouth" d="M28.5 33.5 Q32 36.8 35.5 33.5" fill="#d9534f" stroke-width="1.3"/>' +
      '<g transform="rotate(-14 32 12)">' + capSvg(32, 5, 24) + '</g></g></svg>';
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
      err: ['Bip… anslutningsfel. Försök igen strax.']
    },
    chauffor: {
      hello: ['Hej! Vad undrar du?', 'Hoppa in! Vad vill du veta?', 'Taxametern är av – fråga gratis!'],
      hem: function (a) { return [a.hi + a.name + '! Ha ett bra pass idag.', a.hi + a.name + '! Kör försiktigt där ute.', a.hi + a.name + '! Tryck på mig om du undrar något.',
        a.hi + '! Kolla gärna Ankomster innan du kör ut.']; },
      needsProfile: function (a) { return [a.hi + a.name + '! Din profil saknar några uppgifter – tryck på 👤 uppe till höger.']; },
      noTrips: function (a) { return ['Inga körningar ' + a.p + ' än. Lugn start – det kommer!', 'Tomt ' + a.p + ' hittills. Första körningen är alltid roligast.']; },
      over: function (a) { return ['Snyggt jobbat, ' + a.diff + ' över målet ' + a.p + '!', 'Bra kört! ' + a.kr + ' inkört och ' + a.g + ' är slaget med ' + a.diff + '.',
        a.antal + ' körningar och ' + a.diff + ' över målet. Starkt!']; },
      near: function (a) { return ['Nästan där! Bara ' + a.rest + ' kvar till ' + a.g + '.', a.rest + ' kvar. En bra körning till så är det klart.']; },
      under: function (a) { return [a.kr + ' ' + a.p + '. ' + a.rest + ' kvar till ' + a.g + ' – det fixar du.', a.antal + ' körningar hittills. ' + a.rest + ' kvar till målet, kämpa på!']; },
      history: ['Kollar du gamla pass? Bra koll på läget.', 'Historiken ser du här. Idag är en ny dag!'],
      next: function (a) { return ['Nästa ' + a.kind + ' ' + a.when + ': ' + a.no + ' från ' + a.from + a.late + '.', a.no + ' från ' + a.from + ' kommer ' + a.when + a.late + '. Kunder på ingång!']; },
      none: function (a) { return ['Inga fler ' + a.kind + ' till ' + a.place + ' de närmaste timmarna.']; },
      busy: function (a) { return [a.n + ' ankomster inom en timme. Det kan bli resenärer!']; },
      late: function (a) { return [a.no + ' från ' + a.from + ' är ' + a.n + ' min sen. Hinner du ta en kaffe.']; },
      canceled: function (a) { return [a.n + ' inställd' + (a.n === 1 ? '' : 'a') + ' just nu. Kolla listan innan du kör dit.']; },
      missing: function (a) { return ['Du saknar ' + a.f + '. Fyll i, så är det klart.', 'Psst! ' + a.f + ' saknas i profilen.']; },
      noEmergency: ['Tips: lägg in närmast anhörig. Frivilligt, men bra att ha.'],
      tidy: ['Profilen ser bra ut. Allt ifyllt!', 'Allt ifyllt. Proffsigt!'],
      idag: function (a) { return ['Idag har du kört in ' + a.kr + ' på ' + a.antal + ' körning' + (a.antal === 1 ? '' : 'ar') + ' (' + a.skift + ' skift). Bra jobbat!']; },
      idagNone: ['Inga körningar registrerade idag än.'],
      mal: ['Så här ser det ut:'],
      losen: ['Enkelt fixat:'],
      err: ['Jag kunde inte hämta det just nu. Försök igen strax.']
    },
    cool: {
      hello: ['Yo. Vad behöver du?', 'Shoot. Jag har svar.', 'Lugnt. Fråga på.'],
      hem: function (a) { return ['Yo' + a.name + '. Stan är din.', a.hi + a.name + '. Solglasögonen på, nu kör vi.', 'Lugnt' + a.name + '. Jag har koll, tryck om du undrar något.']; },
      needsProfile: function (a) { return ['Yo' + a.name + ', profilen saknar grejer. 👤 uppe till höger. Ingen stress. Lite stress.']; },
      noTrips: function (a) { return ['Noll körningar ' + a.p + '. Coola starter är också starter.', 'Inget än ' + a.p + '. Gatorna väntar på dig, chill.']; },
      over: function (a) { return [a.diff + ' över målet ' + a.p + '. Inte illa. Inte illa alls.', 'Lugnt. ' + a.kr + ' inkört, ' + a.g + ' slaget med ' + a.diff + '. Som vanligt.', a.antal + ' körningar, ' + a.diff + ' över. Du gör det se lätt ut.']; },
      near: function (a) { return [a.rest + ' kvar till ' + a.g + '. Easy.', 'Bara ' + a.rest + ' kvar. En körning till, sen är du legend.']; },
      under: function (a) { return [a.kr + ' ' + a.p + '. ' + a.rest + ' kvar till ' + a.g + '. Inget du inte fixar.', a.rest + ' bort från målet. Chill, natten är ung.']; },
      history: ['Gamla siffror. Respekt för historien.', 'Kollar arkivet? Smart drag.'],
      next: function (a) { return ['Nästa ' + a.kind + ' ' + a.when + ': ' + a.no + ' från ' + a.from + a.late + '. Var där.', a.no + ' från ' + a.from + ' ' + a.when + a.late + '. Du vet vad som gäller.']; },
      none: function (a) { return ['Inga fler ' + a.kind + ' till ' + a.place + ' på ett tag. Ta det lugnt.']; },
      busy: function (a) { return [a.n + ' ankomster inom en timme. Showtime.']; },
      late: function (a) { return [a.no + ' från ' + a.from + ' är ' + a.n + ' min sen. Coolt, mer tid för kaffe.']; },
      canceled: function (a) { return [a.n + ' inställd' + (a.n === 1 ? '' : 'a') + '. Kolla listan, kör smart.']; },
      missing: function (a) { return [a.f + ' saknas i profilen. Fixa det, så slipper vi prata om det.']; },
      noEmergency: ['Närmast anhörig saknas. Frivilligt, men smart drag.'],
      tidy: ['Profilen är clean. Gillar det.', 'Allt ifyllt. Stilrent.'],
      idag: function (a) { return ['Idag: ' + a.kr + ' på ' + a.antal + ' körning' + (a.antal === 1 ? '' : 'ar') + ' (' + a.skift + ' skift). Lugnt.']; },
      idagNone: ['Inget registrerat idag än. Lugnt, det kommer.'],
      mal: ['Läget:'],
      losen: ['Easy:'],
      err: ['Hmm, fick inget svar. Testa igen strax.']
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
      err: ['Hmm, jag fick inget svar. Försök igen strax, älskling.']
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
  function charId() { var c = localStorage.getItem(driverKey()); return c === 'off' ? 'off' : (CHARS[c] ? c : DEFAULT_CHAR); }
  function firstName() { var d = window.driverData; return d && d.first_name ? String(d.first_name).split(' ')[0] : ''; }

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
    if (!c) return 'hem';
    return 'annat';
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
  var el = {}, state = { page: undefined, lastComment: +(sessionStorage.getItem('hb_last') || 0), timer: null, pendingFor: null, hideT: null, panel: false };

  function css() {
    var s = document.createElement('style');
    s.textContent =
      'body.hb-on{padding-bottom:66px}' +
      '.hb-road{position:fixed;left:0;right:0;bottom:0;height:62px;background:var(--surface);border-top:1px solid var(--border);z-index:40;' +
      'background-image:repeating-linear-gradient(90deg,var(--border) 0 14px,transparent 14px 28px);background-size:100% 2px;background-repeat:no-repeat;background-position:0 58px}' +
      '.hb-walker{position:fixed;left:0;bottom:3px;width:56px;height:56px;z-index:41;animation:hb-walk 26s ease-in-out infinite alternate;will-change:transform}' +
      '.hb-flip{width:100%;height:100%;animation:hb-flip 52s linear infinite}' +
      '.hb-btn{display:block;width:100%;height:100%;padding:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '.hb-btn svg{width:56px;height:56px;display:block;animation:hb-bob 1.1s ease-in-out infinite alternate;transform-origin:50% 100%}' +
      '.hb-walker.idle,.hb-walker.idle .hb-flip{animation-play-state:paused}' +
      '.hb-walker.idle .hb-btn svg{animation-duration:2.2s}' +
      '.hb-walker.talking .hb-btn svg{animation:hb-talk .32s ease-in-out infinite alternate}' +
      '.hb-eyes,.hb-eye-r,.hb-eye-l{transform-box:fill-box;transform-origin:50% 50%;animation:hb-blink 4.6s infinite}' +
      '.hb-eye-r{animation:hb-wink 9s infinite}' +
      '.hb-arm{transform-box:fill-box;transform-origin:100% 100%}' +
      '.hb-walker.waving .hb-arm{animation:hb-wave .35s ease-in-out 4 alternate}' +
      '.hb-hair{transform-box:fill-box;transform-origin:50% 0}' +
      '.hb-walker.waving .hb-hair{animation:hb-hairflip .5s ease-in-out 2 alternate}' +
      '.hb-walker.waving .hb-eye-r{animation:hb-winknow .9s ease-in-out 1}' +
      '@keyframes hb-walk{from{transform:translateX(6px)}to{transform:translateX(calc(100vw - 62px))}}' +
      '@keyframes hb-flip{0%,49.99%{transform:scaleX(1)}50%,100%{transform:scaleX(-1)}}' +
      '@keyframes hb-bob{from{transform:translateY(0)}to{transform:translateY(-2px)}}' +
      '@keyframes hb-talk{from{transform:translateY(0) scale(1)}to{transform:translateY(-4px) scale(1.04,.97)}}' +
      '@keyframes hb-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}' +
      '@keyframes hb-wink{0%,80%,88%,100%{transform:scaleY(1)}83%,85%{transform:scaleY(.1)}}' +
      '@keyframes hb-winknow{0%,100%{transform:scaleY(1)}30%,70%{transform:scaleY(.1)}}' +
      '@keyframes hb-wave{from{transform:rotate(-18deg)}to{transform:rotate(16deg)}}' +
      '@keyframes hb-hairflip{from{transform:rotate(0)}to{transform:rotate(-8deg) translateX(-1px)}}' +
      '.hb-bubble{position:fixed;left:10px;right:10px;bottom:68px;max-width:360px;margin:0 auto;z-index:42;background:var(--surface);color:var(--text);' +
      'border:1px solid var(--border);border-radius:12px;padding:9px 12px;font-size:.92rem;line-height:1.35;box-shadow:0 4px 14px rgba(0,0,0,.15);' +
      'pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s}' +
      '.hb-bubble.show{opacity:1;transform:none}' +
      '.hb-panel{position:fixed;left:8px;right:8px;bottom:68px;max-width:380px;margin:0 auto;max-height:72vh;overflow:auto;z-index:130;background:var(--surface);color:var(--text);' +
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
      '@media (prefers-reduced-motion: reduce){.hb-walker{animation:none;transform:translateX(calc(100vw - 62px))}' +
      '.hb-flip,.hb-btn svg,.hb-eyes,.hb-eye-r,.hb-eye-l,.hb-walker.waving .hb-arm,.hb-walker.waving .hb-hair,.hb-walker.talking .hb-btn svg{animation:none!important}' +
      '.hb-bubble{transition:none}}';
    document.head.appendChild(s);
  }

  function build() {
    css();
    el.road = document.createElement('div'); el.road.className = 'hb-road'; el.road.setAttribute('aria-hidden', 'true');
    el.walker = document.createElement('div'); el.walker.className = 'hb-walker idle';
    el.walker.innerHTML = '<div class="hb-flip"><button class="hb-btn" type="button" aria-label="Hjälpbot – tryck för frågor"></button></div>';
    el.btn = el.walker.querySelector('.hb-btn');
    el.bubble = document.createElement('div'); el.bubble.className = 'hb-bubble'; el.bubble.setAttribute('role', 'status'); el.bubble.setAttribute('aria-live', 'polite');
    el.panel = document.createElement('div'); el.panel.className = 'hb-panel'; el.panel.setAttribute('role', 'dialog'); el.panel.setAttribute('aria-label', 'Hjälpbot');
    [el.road, el.walker, el.bubble, el.panel].forEach(function (x) { document.body.appendChild(x); });
    el.btn.addEventListener('click', function () { wave(); state.panel ? closePanel() : openPanel(); });
    el.panel.addEventListener('click', onPanel);
    drawChar();
  }
  function drawChar() { var c = charId(); if (c !== 'off') el.btn.innerHTML = CHARS[c].svg(); }

  // Går en stund, står still en stund (snällare mot batteriet)
  var walkT = null;
  function rhythm() {
    clearTimeout(walkT);
    if (!el.walker || state.panel || el.walker.classList.contains('talking')) return;
    var walking = !el.walker.classList.contains('idle');
    el.walker.classList.toggle('idle', walking);
    walkT = setTimeout(rhythm, walking ? 9000 + Math.random() * 9000 : 7000 + Math.random() * 6000);
  }
  function wave() {
    el.walker.classList.remove('waving'); void el.walker.offsetWidth; el.walker.classList.add('waving');
    setTimeout(function () { el.walker.classList.remove('waving'); }, 1500);
  }
  function say(text) {
    if (!text || charId() === 'off' || !el.walker || el.walker.style.display === 'none' || state.panel) return;
    clearTimeout(state.hideT);
    el.bubble.textContent = text;
    el.bubble.classList.add('show');
    el.walker.classList.add('talking', 'idle');
    state.lastComment = Date.now(); sessionStorage.setItem('hb_last', String(state.lastComment));
    setTimeout(function () { el.walker.classList.remove('talking'); }, 2200);
    state.hideT = setTimeout(hideBubble, BUBBLE_MS);
  }
  function hideBubble() { el.bubble.classList.remove('show'); rhythm(); }

  function show(on) {
    document.body.classList.toggle('hb-on', on);
    [el.road, el.walker].forEach(function (x) { x.style.display = on ? '' : 'none'; });
    if (!on) { hideBubble(); closePanel(); }
  }

  // ---------- spontana kommentarer ----------
  function maybeComment(p) {
    var last = +(sessionStorage.getItem('hb_last') || 0);
    if (Date.now() - last < COMMENT_GAP_MS) return;
    if (Math.random() > COMMENT_CHANCE) return;
    state.pendingFor = p;
    if (p === 'hem') setTimeout(function () { if (page() === 'hem' && state.pendingFor === 'hem') { state.pendingFor = null; say(hemComment()); } }, 1200);
    else if (p === 'kordata') { if (window.taxiStats && window.taxiStats('dag')) setTimeout(fireKordata, 1200); }
    else if (p === 'ankomster') setTimeout(fireAnk, 2500);
    else if (p === 'profil' && window.HB_PROFILE && Date.now() - window.HB_PROFILE.at < 3000) setTimeout(fireProfil, 800);
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
  document.addEventListener('profil:loaded', function () { if (state.pendingFor === 'profil') setTimeout(fireProfil, 600); });

  function tick() {
    if (!el.walker) return;
    var p = page(), on = !!p && charId() !== 'off';
    if ((el.walker.style.display !== 'none') !== on) show(on);
    if (p !== state.page) {
      state.page = p;
      hideBubble(); if (state.panel) closePanel();
      if (on && !document.hidden) { maybeComment(p); }
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
    state.panel = true; clearTimeout(walkT); el.walker.classList.add('idle'); hideBubble2();
    var c = charId();
    el.panel.innerHTML = '<div class="hb-ph"><span>' + esc(CHARS[c].name) + '</span><button class="hb-x" data-hb-close aria-label="Stäng">✕</button></div>' +
      '<div class="hb-say" id="hb-say">' + esc(line('hello')) + '</div>' +
      '<div class="hb-qs">' + QS.map(function (x) { return '<button class="hb-q" data-hb-q="' + x.id + '">' + esc(x.q) + '</button>'; }).join('') + '</div>' +
      '<div class="hb-set">Välj figur:<div class="hb-cs">' + charButtons('hb-c') + '<button class="hb-c" data-hb-char="off">Stäng av</button></div></div>';
    el.panel.classList.add('open');
  }
  function hideBubble2() { clearTimeout(state.hideT); el.bubble.classList.remove('show'); }
  function closePanel() { state.panel = false; if (el.panel) el.panel.classList.remove('open'); rhythm(); }
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
          (q === 'tag' && localStorage.getItem('ank_fjarr') !== '0' ? ' (fjärrtåg till ' + esc(s.source.place) + ')' : '') + '</small>');
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
        '<p style="font-size:.9rem;color:var(--text-soft);margin:.3rem 0">En liten figur längst ner som kommenterar dina siffror och svarar på enkla frågor. Tryck på den för att fråga.</p>' +
        '<div class="hb-pick">' + charButtons('hb-pickbtn') + '<button class="hb-pickbtn' + (c === 'off' ? ' on' : '') + '" data-hb-char="off"><div style="height:56px;display:flex;align-items:center;justify-content:center;font-size:1.6rem">🚫</div>Av</button></div></div>';
      content.onclick = function (e) {
        var t = e.target.closest('[data-hb-char]'); if (!t) return;
        setChar(t.getAttribute('data-hb-char'));
        window.HJALPBOT.renderSettings(content);
      };
    },
    say: function (t) { say(t); },
    chars: CHARS,
    lines: L
  };

  function start() {
    build();
    show(false);
    tick(); rhythm();
    setInterval(function () { if (!document.hidden) tick(); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
