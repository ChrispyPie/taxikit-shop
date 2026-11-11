/* Hjälptexter till ?-knappen. En post per skärm, 3–6 korta rader på enkel svenska.
 * Ändra bara i HJALP.texter nedan. Skriv aldrig "hen" eller "Stig" (säg "servern").
 * 2026-11-11: syns på alla skärmar, inte över hem- eller helskärmsknappen. */
(function () {
  'use strict';
  if (window.__TD_HJALP) return;
  window.__TD_HJALP = true;

  var TEXTER = {
    login: [
      'Skriv ditt förar-ID och lösenord för att komma in.',
      'Har du glömt lösenordet kan du be om en länk, om kontot har en e-postadress.',
      'Annars kan din åkare hjälpa dig att nollställa det.',
      'Efter inloggning kommer du till startskärmen med alla verktyg.'
    ],
    hem: [
      'Här öppnar du verktygen. En röd prick betyder att något nytt väntar. Hjälpboten syns bara här på startskärmen.',
      'Tryck på den lilla skiftnyckeln vid verktygen för att flytta ikonerna. Dra en ikon till en ny plats och tryck Klar.',
      'Tryck länge på en ikon för en meny med Modulinfo, Flytta, Hjälp och Avinstallera. Inställningar, Om appen och Admin går inte att ta bort.',
      'Rutan Moduler längst ner öppnar en lista där du kan installera verktyg igen.',
      'I ordningsläget kan du också ta bort ett verktyg med krysset. Återställ sätter tillbaka standardordningen och alla verktyg. Valen sparas på ditt konto.',
      'Inloggade enheter visar telefoner som är inne på ditt konto just nu.'
    ],
    moduler: [
      'Här ser du alla verktyg som hör till ditt konto.',
      'Varje rad visar en bild, namnet och en kort beskrivning.',
      'Installera lägger till verktyget på startskärmen. Installerad betyder att det redan finns där.',
      'Inställningar, Om appen och Admin är alltid installerade och går inte att ta bort.',
      'Från startskärmen kan du trycka länge på en ikon för Modulinfo, Flytta, Hjälp eller Avinstallera.'
    ],
    kordata: [
      'Här ser du vad du kört in, per dag, vecka, månad eller år.',
      'Byt period med flikarna och pilarna.',
      'Siffrorna hämtas från servern när du är inloggad.',
      'Kvitto och passrapport finns när underlaget räcker.'
    ],
    lonekoll: [
      'Lönekoll är ett underlag för lön, utifrån godkänd tid.',
      'Det är en kontroll, inte den färdiga lönen.',
      'Siffrorna hämtas från servern.',
      'Hör med din åkare om något ser fel ut.'
    ],
    ankomster: [
      'Här ser du tåg till Göteborg C, flyg till Landvetter och Stena-båtar till Göteborg.',
      'Båtarna kommer från Fredrikshamn (Danmarksterminalen i Masthugget) och Kiel (Tysklandsterminalen vid Majnabbe).',
      'Tryck på en rad för mer om just den ankomsten. På båtar finns en länk till vägbeskrivning.',
      'Du kan bevaka en ankomst och få en påminnelse.',
      'Tiderna uppdateras från servern. Båttiderna kommer från Stena Lines tidtabell.'
    ],
    prognos: [
      'Prognos visar hur resenärer kan röra sig kring tåg och flyg.',
      'På Landvetter syns planen i flygspalten. Tryck på ett plan för mer uppgifter. Stjärnan i rutan gör en tillfällig bevakning, samma som på Ankomster.',
      'Välj typ och tid för att se läget i området.',
      'Det är ett stöd när du planerar, inte en garanti för körningar.',
      'Uppgifterna uppdateras från servern.'
    ],
    vader: [
      'Kartan visar väder över Västsverige, med Göteborg i mitten.',
      'Välj Nederbörd, Blixt, Vind eller Temperatur med knapparna över kartan.',
      'Nederbörd är radar ungefär den senaste timmen.',
      'Uppgifterna kommer från SMHI och Open-Meteo. Kartan från OpenStreetMap.'
    ],
    nyheter: [
      'Här läser du korta nyheter. Göteborg från SVT Väst visas alltid.',
      'Du kan lägga till Politik, Sport, Sverige och Nöje. Valet sparas på den här enheten.',
      'Varje rad visar rubrik, en kort sammanfattning, källa och tid.',
      'Tryck på en nyhet för att öppna artikeln hos källan i en ny flik.',
      'Listan uppdateras när du öppnar sidan. Hela artiklar kopieras inte hit.'
    ],
    kalender: [
      'Kalendern samlar det som är inbokat.',
      'Tryck på en dag för att se detaljerna.',
      'Uppgifterna kommer från servern.',
      'Gå tillbaka med hemknappen uppe till vänster.',
      'Vid platsen i ett evenemang finns en liten länk till vägbeskrivning i Google Maps.'
    ],
    topplistor: [
      'Här jämförs resultat mellan förare för en vald period.',
      'Listorna räknas av servern utifrån godkända pass.',
      'Du syns i listan när du har pass i perioden.',
      'Det är tänkt som en sporre, inte som lön.'
    ],
    forum: [
      'Forumet är till för frågor och tips mellan förare.',
      'Skriv tydligt, och undvik personuppgifter om kunder.',
      'Inlägg sparas på servern.',
      'Svara i en tråd eller starta en ny när du behöver.'
    ],
    'mina-bevakningar': [
      'Här finns de ankomster och händelser du bevakar.',
      'Tryck på en rad för att öppna den.',
      'Stäng av en bevakning när du inte längre behöver den.',
      'Påminnelser kommer när något du bevakar händer.'
    ],
    installningar: [
      'Här byter du tema, textstorlek och hur startskärmen ser ut.',
      'Animationer styr korta rörelser i appen. Det påverkar inte ljudet.',
      'Valen sparas på den här enheten.',
      'Här väljer du också om hjälpboten ska synas. Den visas bara på startskärmen. Tryck på figuren för en kort reaktion. Finns en pratbubbla stängs den vid tryck. Hjälp finns under frågetecknet.'
    ],
    om: [
      'Här står vad som är nytt i appen, överst i listan.',
      'Du kan också läsa kort om hur TaxiData fungerar.',
      'Frågor om ditt konto ställer du till din åkare.'
    ],
    verkstad: [
      'Här anmäler du till exempel verkstad, sjuk och andra ärenden.',
      'Det du skickar in sparas på servern.',
      'Du ser status på dina egna ärenden här.',
      'Öppna ett ärende för mer detaljer eller för att komplettera.'
    ],
    profil: [
      'Här fyller du i uppgifter om dig.',
      'Det som saknas är markerat, så det är lätt att komplettera.',
      'Lösenord byter du längst ner på sidan.',
      'Uppgifterna sparas på servern.'
    ],
    inkorg: [
      'Meddelanden från åkeriet och andra förare hamnar här.',
      'En röd prick betyder att något är oläst.',
      'När du svarar skickas det via servern.',
      'Öppna ett samtal för att läsa hela tråden.'
    ],
    admin: [
      'Här finns verktyg för åkeriet.',
      'Välj ett alternativ i menyn.',
      'Ändringar sparas på servern och kan påverka förare.'
    ],
    akeridata: [
      'Åkeridata samlar översikt för åkeriet.',
      'Siffrorna kommer från servern.',
      'Uppgifterna är tänkta som stöd, inte som färdig lön.'
    ],
    chaufforer: [
      'Här hanterar du chaufförer i åkeriet.',
      'Ändringar sparas på servern.',
      'Var rädd om personuppgifter när du tittar eller ändrar.'
    ],
    sadmin: [
      'S admin är verktyg för den som har högsta behörigheten.',
      'Ändringar sparas på servern och kan påverka hela appen.',
      'Gör bara det du är säker på.'
    ]
  };

  var FALLBACK = [
    'Tryck på hemknappen uppe till vänster för att komma till startskärmen.',
    'Siffror och ändringar hämtas från eller sparas på servern.',
    'Har du frågor om kontot, vänd dig till din åkare.'
  ];

  var el = { btns: [], panel: null, body: null, open: false };

  function css() {
    if (document.getElementById('td-hjalp-css')) return;
    var s = document.createElement('style');
    s.id = 'td-hjalp-css';
    s.textContent =
      '.td-hjalp-btn{width:44px;height:44px;min-width:44px;min-height:44px;padding:0;margin:0;border:0;background:none;' +
      'color:var(--primary,#2b6cb0);font:700 calc(18px * var(--font-scale,1))/1 system-ui,sans-serif;cursor:pointer;' +
      'border-radius:10px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;' +
      '-webkit-tap-highlight-color:transparent}' +
      '.td-hjalp-btn:active{background:rgba(127,127,127,0.18);transform:scale(0.94)}' +
      '.td-hjalp-btn:focus-visible{outline:2px solid var(--accent,#3182ce);outline-offset:1px}' +
      'html body header .hdr-right .td-hjalp-btn{width:44px;height:44px;min-width:44px;min-height:44px;border-radius:10px}' +
      '.td-hjalp-btn[aria-expanded="true"]{background:rgba(49,130,206,0.15)}' +
      '.td-hjalp-btn-float{position:fixed;top:max(8px,env(safe-area-inset-top,0px));' +
      'right:max(8px,env(safe-area-inset-right,0px));z-index:80;' +
      'border:1px solid var(--border,#cbd5e0);border-radius:10px;background:var(--surface,#fff);' +
      'box-shadow:0 1px 3px rgba(0,0,0,.12)}' +
      '.td-hjalp-panel{position:fixed;right:8px;top:56px;width:min(360px,calc(100vw - 16px));max-height:min(70vh,420px);' +
      'overflow:auto;z-index:120;display:none;background:var(--surface,#fff);color:var(--text,#1a202c);' +
      'border:1px solid var(--border,#cbd5e0);border-radius:14px;padding:10px 12px 12px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.18)}' +
      '.td-hjalp-panel.open{display:block}' +
      '.td-hjalp-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px;' +
      'font-size:calc(15px * var(--font-scale,1));font-weight:700}' +
      '.td-hjalp-x{border:0;background:none;color:var(--text-soft,#718096);font-size:22px;line-height:1;cursor:pointer;padding:4px 6px}' +
      '.td-hjalp-body{margin:0;padding:0;list-style:none}' +
      '.td-hjalp-body li{font-size:calc(14px * var(--font-scale,1));line-height:1.35;margin:0 0 8px}' +
      '.td-hjalp-body li:last-child{margin-bottom:0}';
    document.head.appendChild(s);
  }

  function pageKey() {
    var file = (location.pathname || '').split('/').pop();
    if (file === 'admin.html') return 'admin';
    if (file === 'sadmin.html') return 'sadmin';
    if (file === 'akeridata.html') return 'akeridata';
    var login = document.getElementById('login-screen');
    if (login && login.style.display !== 'none' && login.offsetParent !== null) return 'login';
    var dv = document.getElementById('dashboard-view');
    if (dv && !dv.classList.contains('hidden') && dv.style.display !== 'none') return 'kordata';
    var app = document.getElementById('app');
    if (!app || app.style.display === 'none') {
      if (login && login.style.display !== 'none') return 'login';
    }
    var c = window.current;
    if (!c) return 'hem';
    return c;
  }

  function linesFor(key) {
    var rows = TEXTER[key];
    if (rows && rows.length) return rows;
    return FALLBACK;
  }

  function visibleHeader() {
    var list = document.querySelectorAll('header');
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h.offsetParent !== null && getComputedStyle(h).display !== 'none') return h;
    }
    return null;
  }

  function ensureBtns() {
    var headers = document.querySelectorAll('header');
    for (var i = 0; i < headers.length; i++) {
      var right = headers[i].querySelector('.hdr-right');
      if (!right) continue;
      if (right.querySelector('.td-hjalp-btn')) continue;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'td-hjalp-btn';
      b.setAttribute('aria-label', 'Hjälp');
      b.setAttribute('aria-expanded', 'false');
      b.textContent = '?';
      b.addEventListener('click', onToggle);
      right.insertBefore(b, right.firstChild);
      el.btns.push(b);
    }
    var login = document.getElementById('login-screen');
    var needFloat = login && login.style.display !== 'none' && login.offsetParent !== null && !visibleHeader();
    var fl = document.querySelector('.td-hjalp-btn-float');
    if (needFloat && !fl) {
      fl = document.createElement('button');
      fl.type = 'button';
      fl.className = 'td-hjalp-btn td-hjalp-btn-float';
      fl.setAttribute('aria-label', 'Hjälp');
      fl.setAttribute('aria-expanded', 'false');
      fl.textContent = '?';
      fl.addEventListener('click', onToggle);
      document.body.appendChild(fl);
      el.btns.push(fl);
    } else if (fl && !needFloat) {
      fl.remove();
      el.btns = el.btns.filter(function (x) { return x !== fl && x.isConnected; });
    }
  }

  function ensurePanel() {
    if (el.panel) return;
    var p = document.createElement('div');
    p.className = 'td-hjalp-panel';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Hjälp');
    p.innerHTML = '<div class="td-hjalp-h"><span>Hjälp</span><button type="button" class="td-hjalp-x" aria-label="Stäng">×</button></div><ul class="td-hjalp-body"></ul>';
    p.querySelector('.td-hjalp-x').addEventListener('click', close);
    el.body = p.querySelector('.td-hjalp-body');
    el.panel = p;
    document.body.appendChild(p);
  }

  function fill() {
    ensurePanel();
    var rows = linesFor(el.forceKey || pageKey());
    el.body.innerHTML = rows.map(function (t) {
      return '<li>' + String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</li>';
    }).join('');
  }

  function placePanel() {
    if (!el.panel) return;
    var btn = document.querySelector('header .td-hjalp-btn, .td-hjalp-btn-float');
    var top = 56;
    if (btn) {
      var r = btn.getBoundingClientRect();
      top = Math.round(r.bottom + 6);
    }
    el.panel.style.top = top + 'px';
  }

  function open() {
    ensurePanel();
    fill();
    placePanel();
    el.open = true;
    el.panel.classList.add('open');
    el.btns.forEach(function (b) { if (b.isConnected) b.setAttribute('aria-expanded', 'true'); });
  }
  function openFor(key) {
    el.forceKey = key || null;
    open();
  }
  function close() {
    el.open = false;
    el.forceKey = null;
    if (el.panel) el.panel.classList.remove('open');
    el.btns.forEach(function (b) { if (b.isConnected) b.setAttribute('aria-expanded', 'false'); });
  }
  function onToggle(e) {
    e.stopPropagation();
    if (el.open) close(); else open();
  }

  function sync() {
    css();
    ensureBtns();
    if (el.open) { fill(); placePanel(); }
  }

  document.addEventListener('click', function (e) {
    if (!el.open) return;
    if (e.target.closest && (e.target.closest('.td-hjalp-panel') || e.target.closest('.td-hjalp-btn'))) return;
    close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', function () { if (el.open) placePanel(); });

  window.HJALP = {
    texter: TEXTER,
    fallback: FALLBACK,
    pageKey: pageKey,
    linesFor: linesFor,
    open: open,
    openFor: openFor,
    close: close,
    sync: sync,
    isOpen: function () { return !!el.open; }
  };

  function start() {
    sync();
    setInterval(sync, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
