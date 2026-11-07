/* Shared arrival normalization/data only. No view DOM or polling. */
(function(){'use strict';
  var TRAIN_URLS = ['https://taxikit-shop.vercel.app/api/trains', '../skiftlogg/feed/tag.json'];
  var FLIGHT_URLS = ['../skiftlogg/feed/got.json',
    'https://raw.githubusercontent.com/ChrispyPie/taxikit-shop/main/skiftlogg/feed/got.json'];

  function d(v) { if (!v) return null; var x = new Date(v); return isNaN(x) ? null : x; }
  function hm(x) {
    return x ? x.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }) : '';
  }
  function getJson(urls, bust) {
    var i = 0;
    function next(lastErr) {
      if (i >= urls.length) return Promise.reject(lastErr || new Error('ingen källa'));
      var u = urls[i++];
      if (bust) u += (u.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 30000);
      return fetch(u, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).catch(next);
    }
    return next();
  }

  // ---------- tåg ----------
  function trainItem(t, station) {
    var product = String(t.product || '');
    return {
      station:station||'G',
      key: 't' + t.id + '|' + t.sched,
      no: 'Tåg ' + (t.id || ''),
      sub: product,
      from: t.other || (t.from && t.from[0]) || '',
      sched: d(t.sched), est: d(t.est), act: d(t.act),
      canceled: !!t.canceled,
      info: trainLine(t,station),
      tid: t.id || '', schedRaw: t.sched || '',
      note: '',
      group: trainGroup(t),
      snabb: !!t.snabb,
      reason: String(t.reason || ''),
      reasonInfo: String(t.info || '')
    };
  }
  // Nedersta raden: "Anlänt spår 5" / "Inkommande spår 5" / "Senast sedd: Alingsås 15:12" / "Ej avgått".
  // Inkommande = inte ankommet och beräknad ankomst inom 10 min (och tåget har setts någonstans,
  // eller inom 5 min), eller senast sett vid Olskroken/Marieholm/Gubbero precis utanför Göteborg C.
  var NEAR_G = { G: 1, Or: 1, Gbm: 1, Gro: 1 };
  function trainLine(t,station) {
    var tr = t.track && String(t.track).toLowerCase() !== 'x' ? ' spår ' + t.track : '';
    if (t.act) return 'Anlänt' + tr;
    if (t.canceled) return 'Inställt' + (tr ? ' · Spår ' + t.track : '');
    var arr = d(t.est) || d(t.sched), mins = arr ? (arr - Date.now()) / 60000 : 1e9;
    var seen = t.lastSeen && t.lastSeenTs ? d(t.lastSeenTs) : null;
    if (((!station||station==='G')&&NEAR_G[t.lastSeenSig]) || (mins <= 10 && (seen || mins <= 5))) return 'Inkommande' + tr;
    if (seen) return 'Senast sedd: ' + t.lastSeen + ' ' + hm(seen);
    if ((t.posChecked && mins > 30) || mins > 300) return 'Ej avgått';
    return tr ? 'Spår ' + t.track : '';
  }
  // Grupp efter avgångsstation (FromLocation från Trafikverket). Både namn och signatur
  // kontrolleras, eftersom reservfilen tag.json ibland bara har signaturen (t.ex. "Dk.kh").
  // Verifierat mot riktig data 2026-10-25: Stockholm C = Cst, Köpenhamn H = Dk.kh, Oslo S = No.osl.
  var TRAIN_GROUPS = [
    { id: 'sthlm', label: 'Stockholm', short: 'Sthlm', sig: /^(Cst|Sci|Arnc)$/, name: /^(Stockholm|Arlanda)/i },
    { id: 'kbh', label: 'Köpenhamn', short: 'Kbh', sig: /^(Dk\.|Kh$)/, name: /^(Köpenhamn|København|Kastrup)/i },
    { id: 'oslo', label: 'Oslo', sig: /^(No\.|Öslo$|Xoslo$)/, name: /^Oslo/i }
  ];
  function trainGroup(t) {
    var sig = String(t.otherSig || ''), name = String(t.other || (t.from && t.from[0]) || '');
    for (var i = 0; i < TRAIN_GROUPS.length; i++) {
      var g = TRAIN_GROUPS[i];
      if (g.sig.test(sig) || g.sig.test(name) || g.name.test(name)) return g.id;
    }
    return '';
  }
  function loadTrains(station) {
    station=station||'G';
    if(!/^[A-Za-zÅÄÖåäö.]{1,8}$/.test(station))return Promise.reject(new Error('Okänd station'));
    var urls=station==='G'?TRAIN_URLS:[TRAIN_URLS[0]+'?station='+encodeURIComponent(station)];
    return getJson(urls,false).then(function(j){
      // An older/manual Vercel deployment may ignore station: never show Göteborg under another name.
      if(station!=='G'&&j.stationSignature!==station)throw new Error('Stationsval kräver uppdaterad tågtjänst');
      if(j.stationSignature&&j.stationSignature!==station)throw new Error('Fel station i svaret');
      return {station:station,updated:j.updated,warning:!!j.error,items:(j.trains||[]).filter(function(t){return t.dir==='ANK';}).map(function(t){return trainItem(t,station);})};
    });
  }
  // Filterknappar överst på tågfliken: Alla | Stockholm | Köpenhamn | Oslo. Senaste val sparas.
  function trainGroups() {
    return [{ id: '', label: 'Alla' }].concat(TRAIN_GROUPS);
  }
  function flightItem(f) {
    var st = String(f.status || '').toUpperCase();
    // En statusrad: Sista bagage > Första bagage > Bagage ca. Terminal, band och gate visas inte (onödigt för förare).
    // Före landning: bara status om Swedavia skickar en (t.ex. ACT = Avgått/på väg), annars tom rad.
    var bag = '', arr = d(f.act) || d(f.est) || d(f.sched), fb = d(f.firstBag), lb = d(f.lastBag);
    if (fb && arr && fb < arr - 30 * 60000) fb = null;  // gammal tid från tidigare flyg
    if (lb && arr && lb < arr - 30 * 60000) lb = null;
    if (lb) bag = 'Sista bagage kl ' + hm(lb);
    else if (fb) bag = 'Första bagage kl ' + hm(fb);
    else if (f.firstBagEst) bag = 'Bagage ca kl ' + hm(d(f.firstBagEst));
    // Statusraden (t894u): Planerad skrivs aldrig (klockslaget syns ju). Landat kl HH:MM, sedan bagaget efter.
    // DEL betyder enligt Swedavia "Deleted" (borttagen ur tidtabellen), inte inställd (det är CAN).
    var landed = st === 'LAN' ? (d(f.act) || d(f.est) || d(f.sched)) : null;
    // Alla koder i Swedavia FlightInfo v2 (apideveloper.swedavia.se/content/Using_the_FlightInfo_API.pdf):
    // SCH FPL FLS SEQ ACT CAN LAN RER DIV DEL. Okänd kod: Swedavias egen svenska text visas.
    var WORD = { SCH: '', FPL: '', SEQ: '', ACT: 'Avgått/på väg', FLS: 'Stoppad', CAN: 'Inställt',
                 RER: 'Omdirigerad', DIV: 'Omdirigerad', DEL: 'Borttagen' };
    var head = landed ? 'Landat kl ' + hm(landed) : (st in WORD ? WORD[st] : (f.statusSv || st));
    var line = st === 'DEL' || st === 'CAN' ? head : [head, bag].filter(Boolean).join(' · ');
    var special = { RER: 'Omdirigerad', DIV: 'Omdirigerad', FLS: 'Stoppad' }[st];
    return {
      key: 'f' + f.id + '|' + f.sched,
      no: f.id || '',
      sub: f.airline || '',
      from: f.other || f.iata || '',
      sched: d(f.sched), est: d(f.est), act: d(f.act) || (st === 'LAN' ? d(f.est) || d(f.sched) : null),
      lastBag: d(f.lastBag),
      canceled: st === 'CAN',
      removed: st === 'DEL',
      special: special || '',
      info: line,
      note: '',  // statusen står nu i statusraden (info)
      reason: String(f.reason || f.rawStatus || ''),
      reasonInfo: ''
    };
  }
  function loadFlights() {
    return getJson(FLIGHT_URLS, true).then(function (j) {
      return { updated: j.arrivalsUpdated || j.updated,
               items: (j.arrivals || []).map(flightItem) };
    });
  }


 var cache={},pending={};
 function watchItems(kind){if(pending[kind])return pending[kind];var p=(kind==='tag'?loadTrains():loadFlights()).then(function(r){cache[kind]={at:Date.now(),items:r.items};return r.items;}).finally(function(){delete pending[kind];});pending[kind]=p;return p;}
 var catalogPending=null;
 function stationCatalog(force){
   if(!force){try{var saved=JSON.parse(localStorage.getItem('taxi_train_stations_v1')||'null');if(saved&&Array.isArray(saved.stations)&&Date.now()-saved.at<24*3600*1000)return Promise.resolve(saved.stations);}catch(e){}}
   if(catalogPending)return catalogPending;
   catalogPending=getJson([TRAIN_URLS[0]+'?stations=1'],false).then(function(j){if(!Array.isArray(j.stations)||!j.stations.some(function(s){return s.id==='G';}))throw new Error('Stationslistan kunde inte hämtas');var rows=j.stations.filter(function(s){return typeof s.label==='string'&&/^[A-Za-zÅÄÖåäö.]{1,8}$/.test(s.id||'');});try{localStorage.setItem('taxi_train_stations_v1',JSON.stringify({at:Date.now(),stations:rows}));}catch(e){}return rows;}).finally(function(){catalogPending=null;});return catalogPending;
 }
 window.ARRIVAL_DATA={date:d,hm:hm,stationCatalog:stationCatalog,loadTrains:loadTrains,loadFlights:loadFlights,trainGroups:trainGroups,watchItems:watchItems,flightItems:function(age){return cache.flyg&&Date.now()-cache.flyg.at<(age||120000)?Promise.resolve(cache.flyg.items):watchItems('flyg').catch(function(){return cache.flyg?cache.flyg.items:[];});}};
})();
