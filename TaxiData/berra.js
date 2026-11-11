/* Berra: en stillastående figur längst ner på startskärmen, under rutorna.
 * Inte valbar, syns för alla, ingen inställning för att ta bort honom.
 * Han säger bara något när man trycker. Rörelse bara om Animationer är på. */
(function () {
  'use strict';
  if (window.BERRA) return;

  var W = 48, H = 52, MARGIN = 10;
  var KEY_LAST = 'td_berra_recent';
  var RECENT = 8;
  var BUBBLE_MS = 6500;
  var K = '#1a1a1a', SKIN = '#f6d2b3';
  var HAIR = '#e4c45a', HAIR_DARK = '#c9a84a';
  var SHIRT = '#6d7a88', PANTS = '#3d4550';
  var EYE = '#7ec8e8', EYE_IN = '#3a7ca5';

  var JOKES = [
    'Berra sover inte på natten. Natten tar rast när Berra kör.',
    'När Berra tar en storbil backar de andra undan av ren vana.',
    'Berra behöver ingen GPS. Göteborg frågar honom om vägen.',
    'När Berra spelar klart en bana ber sista bossen om en returmatch.',
    'Klockan frågar Berra när det är natt.',
    'Berra räknar inte poäng. Spelet räknar Berra.',
    'En storbil får mer plats när Berra sätter sig. Inte tvärtom.',
    'När Berra blinkar i mörkret tänds gatlyktorna.',
    'Berra har inte högsta rekordet. Rekordet har Berra.',
    'Taxikön flyttar på sig när Berra kommer till hållplatsen.',
    'Berra laddar inte ner kartor. Kartorna laddar ner Berra.',
    'Berra pausar inte spelet. Spelet väntar på Berra.',
    'Berra behöver ingen ficklampa. Natten ser honom ändå.',
    'Chefer brukar kalla in folk. På Taxi Göteborg ringer folk till Berra.',
    'Berra dör inte i spelet. Spelet tar en paus.',
    'Berra spelar inte på lätt. Lätt läget spelar på Berra.',
    'En natt utan Berra är bara tretton timmar lång.',
    'Berra hämtar inte på adressen. Adressen kommer ut.',
    'Berra läser inte instruktioner. Instruktionerna tar anteckningar.',
    'Berra loggar inte in i spelet. Spelet loggar in hos Berra.',
    'Andra tar rast efter natten. Natten tar rast efter Berra.',
    'När Berra backar en storbil flyttar hörnet på sig.',
    'Berra trycker inte på start. Start trycker på Berra.',
    'I rusningen tar andra den korta vägen. Berra tar den rätta.',
    'Berra sparar inte spelet. Spelet sparar sig när Berra reser sig.',
    'En bokning klockan tre på natten ser sig glad ut när Berra tar den.',
    'När Berra tar en kaffe på natten blir den extra stark av respekt.',
    'I ett race kommer mållinjen mot Berra.',
    'Berra fattar beslut så snabbt att datorn får be om en stund.',
    'En storbil får inte plats i en liten lucka. Utom när Berra visar hur.',
    'När radion sprakar på natten är det Göteborg som säger hej till Berra.',
    'Berra har inga favoritbanor. Banorna har en favoritchaufför.',
    'Berra förlorar inte en duell i spelet. Motståndaren får en lärorik kväll.',
    'Berra behöver ingen högtalare i bilen. Storbilen lyssnar ändå.',
    'På natten är det Berra som bestämmer vilken väg som är öppen.',
    'När Berra är i tjänst håller tidtabellen andan.',
    'Berra tar inte en genväg i spelet. Genvägen tar Berra.',
    'När det är rusning kör de andra runt Berra. Inte för att han är långsam.',
    'Berra väcker inte natten. Natten är redan vaken när han kommer.',
    'En storbil har många säten. När Berra kör räcker de till.',
    'Berra frågar inte om highscore. Highscore frågar om Berra.',
    'När Berra blinkar till vänster lyssnar hela leden.',
    'Berra behöver ingen pausmeny. Världen väntar tills han är klar.',
    'På Taxi Göteborg börjar nattskiftet när Berra sätter sig.'
  ];

  var el = {}, hideT = 0, lastAt = 0;

  function animOn() {
    try { return !!(window.ANIMATIONER && ANIMATIONER.isOn && ANIMATIONER.isOn()); } catch (e) { return false; }
  }
  function reduceMotion() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function onHome() {
    var app = document.getElementById('app');
    return !!(app && app.classList.contains('is-home') && app.style.display !== 'none');
  }

  function svg() {
    // Blond mycket kort hår med lätt sidbena, isblå ögon, stort leende,
    // lätt rund mage men fortfarande atletisk. Ingen skäggstubb, inga glasögon, inga kläddetaljer.
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<rect x="21" y="55.5" width="8.5" height="5.5" rx="2" fill="' + K + '"/>' +
      '<rect x="34.5" y="55.5" width="8.5" height="5.5" rx="2" fill="' + K + '"/>' +
      '<path d="M22.5 51 h8 l0.8 5.5 h-8.2 z M33.5 51 h8 l0.2 5.5 h-8.5 z" fill="' + PANTS + '"/>' +
      // Bredare axlar, lätt rundad mage, slät tröja utan märke.
      '<path d="M18.2 40.2 q0 -2.8 5.2 -4 h17.2 q5.2 1.2 5.2 4 q1 5.6 -1.4 10.2 q-2.2 3.2 -11.4 3.2 q-9.2 0 -11.4 -3.2 q-2.4 -4.6 -1.4 -10.2 z" fill="' + SHIRT + '"/>' +
      '<path d="M47.2 43 L51.8 50.2" stroke-width="5"/><path d="M47.2 43 L51.8 50.2" stroke="' + SHIRT + '" stroke-width="3"/>' +
      '<circle cx="52.3" cy="51.2" r="2.5" fill="' + SKIN + '"/>' +
      '<g class="td-berra-arm"><path d="M18.6 42.8 L11.6 34.6" stroke-width="5"/><path d="M18.6 42.8 L11.6 34.6" stroke="' + SHIRT + '" stroke-width="3"/>' +
      '<circle cx="10.8" cy="33.3" r="2.6" fill="' + SKIN + '"/></g>' +
      // Hals bakom huvudet, ingen skugglinje som liknar skägg.
      '<path d="M27.5 36 v4 q4.5 1.6 9 0 v-4" fill="' + SKIN + '" stroke="none"/>' +
      // Kort blont hår som täcker hjässan, lätt sidbena.
      '<ellipse cx="32" cy="24.2" rx="13.2" ry="13.6" fill="' + HAIR + '"/>' +
      '<ellipse cx="32" cy="22.8" rx="11.5" ry="7.5" fill="' + HAIR_DARK + '" opacity="0.2"/>' +
      '<circle cx="32" cy="28.2" r="11.7" fill="' + SKIN + '"/>' +
      '<path d="M29.2 12.8 q-0.2 5.2 0.5 9.4" fill="none" stroke="' + SKIN + '" stroke-width="1.45"/>' +
      '<circle cx="20.2" cy="28.6" r="2.25" fill="' + SKIN + '"/>' +
      '<circle cx="43.8" cy="28.6" r="2.25" fill="' + SKIN + '"/>' +
      // Isblå ögon, inga glasögon.
      '<g class="td-berra-eyes" stroke="none">' +
      '<circle cx="27.1" cy="28.6" r="2.5" fill="#eef8fc"/><circle cx="36.9" cy="28.6" r="2.5" fill="#eef8fc"/>' +
      '<circle cx="27.1" cy="28.7" r="1.65" fill="' + EYE + '"/><circle cx="36.9" cy="28.7" r="1.65" fill="' + EYE + '"/>' +
      '<circle cx="27.1" cy="28.7" r="0.74" fill="' + EYE_IN + '"/><circle cx="36.9" cy="28.7" r="0.74" fill="' + EYE_IN + '"/>' +
      '<circle cx="27.55" cy="28.15" r="0.55" fill="#fff"/><circle cx="37.35" cy="28.15" r="0.55" fill="#fff"/>' +
      '</g>' +
      // Stort leende.
      '<path d="M23.2 34.4 q8.8 8.4 17.6 0" fill="none" stroke="' + K + '" stroke-width="2.1"/>' +
      '</g></svg>';
  }

  function css() {
    if (document.getElementById('td-berra-css')) return;
    var s = document.createElement('style');
    s.id = 'td-berra-css';
    s.textContent =
      '.td-berra-slot{display:flex;justify-content:flex-start;align-items:flex-end;padding:8px 2px 16px;box-sizing:border-box;pointer-events:none}' +
      '.td-berra{position:relative;width:' + W + 'px;height:' + H + 'px;margin:0;padding:0;border:0;background:none;cursor:pointer;' +
      'pointer-events:auto;flex:0 0 auto;-webkit-tap-highlight-color:transparent;overflow:visible;z-index:2}' +
      '.td-berra svg{width:' + W + 'px;height:' + H + 'px;display:block;overflow:visible;transform-origin:50% 100%}' +
      '.td-berra.td-berra-poke svg{animation:td-berra-poke .45s ease-out}' +
      '@keyframes td-berra-poke{0%{transform:translateY(0) rotate(0)}30%{transform:translateY(-5px) rotate(-7deg)}62%{transform:translateY(-1px) rotate(4deg)}100%{transform:translateY(0) rotate(0)}}' +
      '@media (prefers-reduced-motion:reduce){.td-berra.td-berra-poke svg{animation:none}}' +
      '.td-berra-bubble{position:fixed;width:max-content;max-width:min(260px,calc(100vw - 16px));z-index:46;background:var(--surface);color:var(--text);' +
      'border:2px solid var(--text);border-radius:16px;padding:7px 10px 8px;font-size:calc(14px * min(var(--font-scale,1),1.15));line-height:1.3;' +
      'box-shadow:0 3px 10px rgba(0,0,0,.18);pointer-events:none;opacity:0;visibility:hidden;transition:opacity .2s;box-sizing:border-box}' +
      '.td-berra-bubble.show{opacity:1;visibility:visible}' +
      '.td-berra-bubble-txt{position:relative;z-index:1}' +
      '.td-berra-bubble-tail{position:absolute;width:12px;height:12px;background:var(--surface);border:2px solid var(--text);' +
      'left:var(--tail-left,50%);transform:translateX(-50%) rotate(45deg);pointer-events:none}' +
      '.td-berra-bubble[data-side="above"] .td-berra-bubble-tail{bottom:-7px;border-top:0;border-left:0}' +
      '.td-berra-bubble[data-side="below"] .td-berra-bubble-tail{top:-7px;border-bottom:0;border-right:0}';
    document.head.appendChild(s);
  }

  function berraBox() {
    if (!el.btn || el.btn.style.display === 'none') return null;
    var r = el.btn.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return r;
  }

  function sizeSlot() {
    if (!el.slot) return;
    el.slot.style.minHeight = '0px';
    var rect = el.slot.getBoundingClientRect();
    var topDoc = rect.top + (window.scrollY || window.pageYOffset || 0);
    // Fyll ut utrymmet under rutorna så Berra sitter längst ner på startskärmen.
    // Om innehållet redan är högre än skärmen räcker det med plats för figuren —
    // då når man honom genom att skrolla ner.
    var leftover = window.innerHeight - topDoc;
    var h = Math.max(H + 32, leftover);
    el.slot.style.minHeight = h + 'px';
  }

  function unmount() {
    if (el.slot && el.slot.parentNode) el.slot.parentNode.removeChild(el.slot);
    if (el.btn) el.btn.style.display = 'none';
  }

  function place() {
    if (!el.btn) return;
    if (!onHome()) {
      unmount();
      hideBubble();
      return;
    }
    var content = document.getElementById('content');
    if (!content) return;
    if (!el.slot) {
      el.slot = document.createElement('div');
      el.slot.className = 'td-berra-slot';
    }
    if (el.btn.parentNode !== el.slot) el.slot.appendChild(el.btn);
    if (el.slot.parentNode !== content || content.lastElementChild !== el.slot) content.appendChild(el.slot);
    el.btn.style.display = '';
    el.btn.style.transform = '';
    sizeSlot();
    if (el.bubble && el.bubble.classList.contains('show')) placeBubble();
  }

  function placeBubble() {
    var r = berraBox();
    if (!el.bubble || !r) return;
    var vw = window.innerWidth, vh = window.innerHeight, pad = 8, tail = 8;
    var bw = Math.min(260, vw - pad * 2);
    el.bubble.style.width = bw + 'px';
    el.bubble.style.maxWidth = bw + 'px';
    var bh = el.bubble.offsetHeight || 48;
    var cx = r.left + r.width / 2;
    var aboveTop = r.top - bh - tail - 4;
    var belowTop = r.bottom + tail + 4;
    var side, top;
    var header = document.querySelector('#app > header');
    var headerY = header ? Math.ceil(header.getBoundingClientRect().bottom) + 4 : 56;
    if (aboveTop >= Math.max(pad, headerY)) { top = aboveTop; side = 'above'; }
    else if (belowTop + bh <= vh - pad) { top = belowTop; side = 'below'; }
    else { top = Math.max(pad, Math.min(vh - pad - bh, aboveTop)); side = 'above'; }
    if (top < pad) top = pad;
    if (top + bh > vh - pad) top = Math.max(pad, vh - pad - bh);
    var left = cx - bw / 2;
    if (left < pad) left = pad;
    if (left + bw > vw - pad) left = Math.max(pad, vw - pad - bw);
    el.bubble.style.top = top + 'px';
    el.bubble.style.left = left + 'px';
    el.bubble.setAttribute('data-side', side);
    var tailX = cx - left;
    if (tailX < 16) tailX = 16;
    if (tailX > bw - 16) tailX = bw - 16;
    el.bubble.style.setProperty('--tail-left', tailX + 'px');
  }

  function readRecent() {
    try {
      var v = JSON.parse(sessionStorage.getItem(KEY_LAST) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeRecent(a) {
    try { sessionStorage.setItem(KEY_LAST, JSON.stringify(a.slice(0, RECENT))); } catch (e) {}
  }

  function pickJoke() {
    var recent = readRecent(), i, choices = [];
    for (i = 0; i < JOKES.length; i++) if (recent.indexOf(i) < 0) choices.push(i);
    if (!choices.length) { writeRecent([]); return pickJoke(); }
    var ix = choices[Math.floor(Math.random() * choices.length)];
    recent.unshift(ix);
    writeRecent(recent);
    return JOKES[ix];
  }

  function hideBubble() {
    clearTimeout(hideT);
    if (el.bubble) el.bubble.classList.remove('show');
  }

  function say(text) {
    if (!el.bubble || !el.txt) return;
    el.txt.textContent = text;
    el.bubble.classList.add('show');
    placeBubble();
    clearTimeout(hideT);
    hideT = setTimeout(hideBubble, BUBBLE_MS);
  }

  function poke() {
    if (!onHome() || !el.btn || el.btn.style.display === 'none') return;
    if (Date.now() - lastAt < 400) return;
    lastAt = Date.now();
    if (animOn() && !reduceMotion()) {
      el.btn.classList.remove('td-berra-poke');
      void el.btn.offsetWidth;
      el.btn.classList.add('td-berra-poke');
      setTimeout(function () { if (el.btn) el.btn.classList.remove('td-berra-poke'); }, 500);
    }
    say(pickJoke());
  }

  function build() {
    css();
    el.btn = document.createElement('button');
    el.btn.type = 'button';
    el.btn.className = 'td-berra';
    el.btn.setAttribute('aria-label', 'Berra');
    el.btn.innerHTML = svg();
    el.btn.style.display = 'none';
    el.bubble = document.createElement('div');
    el.bubble.className = 'td-berra-bubble';
    el.bubble.setAttribute('role', 'status');
    el.bubble.setAttribute('aria-live', 'polite');
    el.txt = document.createElement('div');
    el.txt.className = 'td-berra-bubble-txt';
    el.tail = document.createElement('span');
    el.tail.className = 'td-berra-bubble-tail';
    el.tail.setAttribute('aria-hidden', 'true');
    el.bubble.appendChild(el.txt);
    el.bubble.appendChild(el.tail);
    document.body.appendChild(el.bubble);
    el.btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      poke();
    });
  }

  function tick() { place(); }

  function start() {
    build();
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', function () {
      if (el.bubble && el.bubble.classList.contains('show')) placeBubble();
    }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') hideBubble();
      else place();
    });
    setInterval(tick, 1000);
    var app = document.getElementById('app');
    if (app && window.MutationObserver) {
      new MutationObserver(function () { place(); }).observe(app, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    var content = document.getElementById('content');
    if (content && window.MutationObserver) {
      new MutationObserver(function () { place(); }).observe(content, { childList: true });
    }
  }

  window.BERRA = {
    jokes: function () { return JOKES.slice(); },
    pickJoke: pickJoke,
    poke: poke,
    place: place,
    preview: function (text) {
      place();
      say(text || pickJoke());
      return true;
    },
    _pos: function () {
      var r = berraBox();
      return r ? { x: r.left, y: r.top } : null;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
