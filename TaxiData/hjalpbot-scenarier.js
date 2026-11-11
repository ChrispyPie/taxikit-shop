/* Hjälpbotens scenarioregister – ett ställe att lägga till kommentarer.
 *
 * Varje scenario:
 *   id, tool, context ('home' | 'page' | 'time' | 'random' eller en lista),
 *   priority (högre först), cooldownMs,
 *   ev. chars (annars alla tre figurerna),
 *   ev. time / times ('13:37'), ev. chance (0–1, för slumprader),
 *   ev. mood ('marvin' ger suck/sänkt hållning),
 *   when(): dataobjekt eller null – ingen ny hämtning, bara redan laddad data,
 *   lines: { robot, chauffor, diva } som sträng eller function (data).
 *
 * context home = besök på hemskärmens ikon; page = inne på verktygssidan.
 * Överraskning: nämns inte i Om, hjälp eller nyheter.
 * Animationer av: registrerade scenarier körs inte.
 */
(function () {
  'use strict';

  function stats(tab) {
    try {
      if (!window.taxiStats) return null;
      var s = window.taxiStats(tab || 'dag');
      if (!s || !s.own) return null;
      return s;
    } catch (e) { return null; }
  }
  function anyStats() {
    var i, tabs = ['dag', 'vecka', 'manad'], s;
    for (i = 0; i < tabs.length; i++) {
      s = stats(tabs[i]);
      if (s) return s;
    }
    return null;
  }
  function vaderSnap() {
    try {
      var V = window.ANIMATIONER_VADER;
      return (V && V.readCache) ? V.readCache() : null;
    } catch (e) { return null; }
  }
  function bookings() {
    try {
      var P = window.PROGNOS;
      return (P && P.cachedBookings) ? P.cachedBookings() : null;
    } catch (e) { return null; }
  }
  function landvetterSoon() {
    var list = bookings(), now = Date.now(), later = now + 2 * 3600 * 1000, n = 0, storbil = 0, i, b, t;
    if (!list) return null;
    for (i = 0; i < list.length; i++) {
      b = list[i];
      if (String(b.zone_id) !== '293') continue;
      t = Date.parse(b.estimated_at);
      if (!isFinite(t) || t < now - 5 * 60000 || t > later) continue;
      n++;
      if (b.category === 'storbil') storbil++;
    }
    return { n: n, storbil: storbil };
  }
  function ankSum(id) {
    try {
      var A = window.ANKOMSTER;
      if (!A || !A.cachedSummary) return null;
      if (id) return A.cachedSummary(id);
      return A.cachedSummary('tag') || A.cachedSummary('flyg');
    } catch (e) { return null; }
  }
  function toppBest() {
    var info = window.TOPPLISTOR_LAST, T = window.TOPPLISTOR, lists, best = null;
    if (!info || !info.data || !T || !T.lists) return null;
    lists = info.data.lists || {};
    T.lists.forEach(function (L) {
      var x = lists[L.k];
      if (x && x.me && (!best || x.me.pos < best.me.pos)) best = { t: L.t, pos: x.me.pos, n: x.n, v: T.fmt(x.me.v, L.f), p: info.period, f: L.f };
    });
    return best;
  }
  function dataProblem() {
    try {
      var A = window.ANKOMSTER, P = window.PROGNOS, a, p;
      if (A && A.cachedProblem) {
        a = A.cachedProblem();
        if (a) return a;
      }
      if (P && P.cachedProblem) {
        p = P.cachedProblem();
        if (p) return p;
      }
    } catch (e) {}
    return null;
  }
  function hit42() {
    var i, tabs = ['manad', 'vecka', 'dag'], s, what, p;
    var PERIOD = { dag: 'idag', vecka: 'den här veckan', manad: 'den här månaden' };
    for (i = 0; i < tabs.length; i++) {
      s = stats(tabs[i]);
      if (!s) continue;
      p = PERIOD[s.tab] || s.tab;
      if (s.antal === 42) return { what: 'körningar', p: p, n: 42 };
      if (s.mil === 42) return { what: 'mil', p: p, n: 42 };
      if (s.hours === 42) return { what: 'timmar', p: p, n: 42 };
    }
    return null;
  }


  function kalCache() {
    try {
      var K = window.KALENDER;
      return (K && K.cachedEvents) ? K.cachedEvents() : null;
    } catch (e) { return null; }
  }
  function kalParts(iso, zone) {
    var f = new Intl.DateTimeFormat('sv-SE', {
      timeZone: zone || 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
    });
    var o = {};
    f.formatToParts(new Date(iso)).forEach(function (p) { o[p.type] = p.value; });
    return { key: o.year + '-' + o.month + '-' + o.day, hm: o.hour + ':' + o.minute, wd: o.weekday };
  }
  function kalAddDay(key, n) {
    var a = String(key).split('-');
    var d = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2] + (n || 0)));
    var p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  }
  function kalSunday(todayKey) {
    var a = todayKey.split('-');
    var dow = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])).getUTCDay();
    var add = dow === 0 ? 0 : 7 - dow;
    return kalAddDay(todayKey, add);
  }
  var KAL_BIG = /gamla ullevi|\bullevi\b|scandinavium|liseberg|svenska mässan|göteborgsoperan|frölundaborg|partille arena|valhallahallen|gothia arena/i;
  var KAL_FOOTBALL = /\bifk\b|\bgais\b|örgryte|\bblåvitt\b|allsvenskan|fotboll/i;
  function kalTeam(title) {
    var m = String(title || '').match(/\b(IFK(?:\s+Göteborg)?|GAIS|Örgryte(?:\s+IS)?|Blåvitt)\b/i);
    return m ? m[1] : null;
  }
  function kalScore(e, p, todayKey) {
    var n = 0, hour = +p.hm.slice(0, 2);
    if (p.key === todayKey) n += 100;
    if (p.key === todayKey && hour >= 17) n += 20;
    if (e.category === 'sport') n += 40;
    else if (e.category === 'konsert') n += 35;
    else if (e.category === 'massa') n += 20;
    else if (e.category === 'teater') n += 15;
    if (KAL_BIG.test(e.venue || '') || KAL_BIG.test(e.title || '')) n += 50;
    if (KAL_FOOTBALL.test(e.title || '')) n += 30;
    return n;
  }
  function kalWhen(p, todayKey, tomorrowKey, todayWd) {
    var hour = +p.hm.slice(0, 2);
    if (p.key === todayKey) return hour >= 17 ? 'ikväll ' + p.hm : 'idag ' + p.hm;
    if (p.key === tomorrowKey) return 'i morgon ' + p.hm;
    var isWeekend = /lör|sön/i.test(p.wd);
    var todayWeekday = !/lör|sön/i.test(todayWd || '');
    if (isWeekend && todayWeekday) return 'i helgen';
    var namn = { mån: 'måndag', tis: 'tisdag', ons: 'onsdag', tor: 'torsdag', fre: 'fredag', lör: 'lördag', sön: 'söndag' };
    var k = String(p.wd || '').replace('.', '').toLowerCase().slice(0, 3);
    return namn[k] ? 'på ' + namn[k] : 'i veckan';
  }
  function kalWhat(e) {
    var title = String(e.title || '').trim();
    var venue = String(e.venue || '').trim();
    var team = kalTeam(title);
    if (team && venue) return team + ' spelar på ' + venue;
    if (e.category === 'konsert' && venue) return 'Konsert på ' + venue;
    if (title && venue) return title + ' på ' + venue;
    return title || venue || 'Ett evenemang';
  }
  function pickKalEvent(onlyToday) {
    var cache = kalCache(), list, zone, now, today, sunday, i, e, t, end, p, score, best = null;
    if (!cache || !cache.events || !cache.events.length) return null;
    list = cache.events;
    zone = cache.timezone || 'Europe/Stockholm';
    now = Date.now();
    today = kalParts(now, zone);
    sunday = kalSunday(today.key);
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (!e || e.watchRow || e.is_suggestion) continue;
      t = Date.parse(e.starts_at);
      if (!isFinite(t)) continue;
      end = e.ends_at ? Date.parse(e.ends_at) : t + 3 * 3600 * 1000;
      if (!isFinite(end)) end = t;
      if (end < now) continue;
      p = kalParts(e.starts_at, zone);
      if (p.key > sunday) continue;
      if (onlyToday && p.key !== today.key) continue;
      if (!onlyToday && p.key === today.key) continue;
      score = kalScore(e, p, today.key);
      if (!best || score > best.score) best = { e: e, p: p, score: score };
    }
    if (!best) return null;
    var when = kalWhen(best.p, today.key, kalAddDay(today.key, 1), today.wd);
    return {
      what: kalWhat(best.e),
      when: when,
      title: best.e.title || '',
      venue: best.e.venue || '',
      cat: best.e.category || '',
      idag: best.p.key === today.key,
      helg: /helgen/.test(when)
    };
  }

  var SCENARIOS = [
    // ----- Väder (cachad SMHI-bild: kind, temp, symbol – ingen timme för "regn från ca 14") -----
    {
      id: 'vader-regn', tool: 'vader', context: ['home', 'page'], priority: 70, cooldownMs: 25 * 60 * 1000,
      when: function () { var s = vaderSnap(); return s && s.kind === 'rain' ? { temp: s.temp } : null; },
      lines: {
        robot: 'Bip! Det regnar. Paraply rekommenderas. Mina kretsar gillar inte fukt.',
        chauffor: 'Det regnar. Ta paraply – jackan är redan cool nog utan att bli blöt.',
        diva: 'Regn, stjärna. Ta paraply. Det här håret är inte skapat för blåst. 😉'
      }
    },
    {
      id: 'vader-sno', tool: 'vader', context: ['home', 'page'], priority: 72, cooldownMs: 25 * 60 * 1000,
      when: function () { var s = vaderSnap(); return s && (s.kind === 'snow' || s.kind === 'sleet') ? { temp: s.temp } : null; },
      lines: {
        robot: 'Bip! Snö i datat. Halkvarning beräknad: hög. Kör varsamt.',
        chauffor: 'Snöväder. Dags för den där vitsen om att ta det lugnt i kurvorna. Allvarligt: ta det lugnt.',
        diva: 'Snö, älskling. Snyggt ljus, lite lurigare väglag. Kör fint så tittar jag. 😉'
      }
    },
    {
      id: 'vader-kallt', tool: 'vader', context: ['home', 'page'], priority: 55, cooldownMs: 30 * 60 * 1000,
      when: function () {
        var s = vaderSnap();
        if (!s || s.temp == null || s.temp >= 5) return null;
        return { temp: Math.round(s.temp) };
      },
      lines: {
        robot: function (a) { return 'Temperatur ' + a.temp + '°. Mina leder blir styva. Din termos rekommenderas. Bip!'; },
        chauffor: function (a) { return a.temp + ' grader. Kallt som baksätet i januari. Värm på, kör försiktigt.'; },
        diva: function (a) { return a.temp + '°. Kallt, stjärna. Värm på – jag gillar folk som tar hand om sig. 😉'; }
      }
    },
    {
      id: 'vader-sol', tool: 'vader', context: ['home', 'page'], priority: 50, cooldownMs: 30 * 60 * 1000,
      when: function () {
        var s = vaderSnap();
        if (!s || (s.kind && s.kind !== 'none' && s.kind !== '')) return null;
        if (s.symbol !== 1 && s.symbol !== 2 && !(s.temp != null && s.temp >= 18)) return null;
        return { temp: s.temp != null ? Math.round(s.temp) : null };
      },
      lines: {
        robot: 'Sol i sensorn. UV-index: okej. Humörindex: okej. Bip!',
        chauffor: 'Solsken. Solglasögonen är redan på. Det är en yrkesmässig vana.',
        diva: 'Sol och stil, stjärna. Ett sånt pass klär dig. 😉'
      }
    },

    // ----- Körpassdata -----
    {
      id: 'kordata-over', tool: 'kordata', context: ['home', 'page'], priority: 80, cooldownMs: 20 * 60 * 1000,
      when: function () { var s = anyStats(); return s && s.antal && s.diff >= 0 ? s : null; },
      lines: {
        robot: function (a) { return 'Beräkning klar: ' + Math.round(a.inkort).toLocaleString('sv-SE') + ' kr, ' + Math.round(a.diff).toLocaleString('sv-SE') + ' kr över målet. Mina kretsar är stolta. Bip!'; },
        chauffor: function (a) { return 'Snyggt! ' + Math.round(a.diff).toLocaleString('sv-SE') + ' kr över målet. Precis som min kaffekopp. Bra kört!'; },
        diva: function (a) { return 'Mm, ' + Math.round(a.diff).toLocaleString('sv-SE') + ' kr över målet… du vet hur man gör intryck. 😉'; }
      }
    },
    {
      id: 'kordata-under', tool: 'kordata', context: ['home', 'page'], priority: 60, cooldownMs: 20 * 60 * 1000,
      when: function () { var s = anyStats(); return s && s.antal && s.diff < 0 ? s : null; },
      lines: {
        robot: function (a) { return 'Beräkning: ' + Math.round(-a.diff).toLocaleString('sv-SE') + ' kr kvar till målet. Sannolikhet att du klarar det: hög. Bip!'; },
        chauffor: function (a) { return Math.round(-a.diff).toLocaleString('sv-SE') + ' kr kvar till målet. Inga genvägar, bara vanliga vägar. Du fixar det.'; },
        diva: function (a) { return Math.round(-a.diff).toLocaleString('sv-SE') + ' kr kvar, stjärna. Visa mig vad du går för. 😉'; }
      }
    },
    {
      id: 'kordata-tom', tool: 'kordata', context: ['home', 'page'], priority: 40, cooldownMs: 30 * 60 * 1000,
      when: function () { var s = anyStats(); return s && !s.antal ? s : null; },
      lines: {
        robot: 'Bip… inga körningar registrerade i den här perioden än. Jag sparar batteri.',
        chauffor: 'Inga körningar än. Motorn är varm, skämten också. Det kommer!',
        diva: 'Inga körningar än? Du låter mig vänta, du. 😉'
      }
    },
    {
      id: 'kordata-42', tool: 'kordata', context: ['home', 'page'], priority: 96, cooldownMs: 12 * 60 * 60 * 1000,
      chars: ['robot'],
      when: function () { return hit42(); },
      lines: {
        robot: function (a) { return 'Svaret är 42. Precis så många ' + a.what + ' ' + a.p + '. Frågan kör vi fortfarande på.'; }
      }
    },

    // ----- Prognos (bokningar om sidan redan laddat dem; ingen bilar-på-plats, ingen flygbolags-storbil) -----
    {
      id: 'prognos-landvetter', tool: 'prognos', context: ['home', 'page'], priority: 78, cooldownMs: 20 * 60 * 1000,
      when: function () { var x = landvetterSoon(); return x && x.n >= 8 ? x : null; },
      lines: {
        robot: function (a) { return 'Bip! ' + a.n + ' bokningar på Landvetter de närmaste två timmarna. Beräknad kundvåg: hög.'; },
        chauffor: function (a) { return 'Många bokningar på Landvetter snart – ' + a.n + ' stycken. Dags att rulla ut, inte bara putsa bilen.'; },
        diva: function (a) { return a.n + ' bokningar på Landvetter snart. Populär kväll – precis som du. 😉'; }
      }
    },
    {
      id: 'prognos-storbil', tool: 'prognos', context: ['home', 'page'], priority: 76, cooldownMs: 20 * 60 * 1000,
      when: function () { var x = landvetterSoon(); return x && x.storbil >= 3 ? x : null; },
      lines: {
        robot: function (a) { return 'Beräkning: ' + a.storbil + ' storbilsbokningar på Landvetter snart. Kapacitet 8+ efterfrågas. Bip!'; },
        chauffor: function (a) { return a.storbil + ' storbilsbokningar på Landvetter snart. Packa plats, inte bara pappaskämt.'; },
        diva: function (a) { return a.storbil + ' storbilsbokningar på Landvetter, älskling. Stora planer. 😉'; }
      }
    },
    {
      id: 'prognos-marvin', tool: 'prognos', context: ['home', 'page'], priority: 45, cooldownMs: 50 * 60 * 1000,
      chars: ['robot'], mood: 'marvin', chance: 0.35,
      when: function () { var list = bookings(); return list && list.length ? { n: list.length } : null; },
      lines: {
        robot: 'Jag har räknat ut din prognos. Den deprimerade mig.'
      }
    },
    {
      id: 'prognos-landvetter-marvin', tool: 'prognos', context: ['home', 'page'], priority: 46, cooldownMs: 50 * 60 * 1000,
      chars: ['robot'], mood: 'marvin', chance: 0.3,
      when: function () { var x = landvetterSoon(); return x && x.n >= 1 ? x : null; },
      lines: {
        robot: 'Ännu en bokning till Landvetter. Livet. Prata inte med mig om livet.'
      }
    },

    // ----- Ankomster -----
    {
      id: 'ankomster-nasta', tool: 'ankomster', context: ['home', 'page'], priority: 74, cooldownMs: 15 * 60 * 1000,
      when: function () {
        var s = ankSum();
        if (!s || !s.next) return null;
        var it = s.next, src = s.source, A = window.ANKOMSTER;
        var t = it.est || it.sched, mins = t ? Math.round((t - Date.now()) / 60000) : null;
        return { no: it.no, from: it.from, kind: src && src.id === 'flyg' ? 'flyg' : 'tåg', when: mins != null && mins <= 60 && mins >= 0 ? 'om ' + mins + ' min' : (A && A.hm && t ? 'kl ' + A.hm(t) : ''), late: (it.est && it.sched && it.est - it.sched >= 60000) ? Math.round((it.est - it.sched) / 60000) : 0 };
      },
      lines: {
        robot: function (a) { return 'Bip bop! Nästa ' + a.kind + ' ' + a.when + ': ' + a.no + ' från ' + a.from + (a.late ? ', ' + a.late + ' min sen' : '') + '.'; },
        chauffor: function (a) { return 'Nästa ' + a.kind + ' ' + a.when + ': ' + a.no + ' från ' + a.from + (a.late ? ', ' + a.late + ' min sen' : '') + '. Kund på ingång, skämt på sparlåga.'; },
        diva: function (a) { return a.no + ' från ' + a.from + ' ' + a.when + (a.late ? ', ' + a.late + ' min sen' : '') + '. Ditt nästa uppdrag, stjärna. 😉'; }
      }
    },
    {
      id: 'ankomster-tett', tool: 'ankomster', context: ['home', 'page'], priority: 75, cooldownMs: 15 * 60 * 1000,
      when: function () { var s = ankSum(); return s && s.inHour >= 3 ? { n: s.inHour } : null; },
      lines: {
        robot: function (a) { return 'Bip! ' + a.n + ' ankomster inom en timme. Beräknad kundsannolikhet: hög.'; },
        chauffor: function (a) { return a.n + ' ankomster inom en timme. Det kan bli kö – som på korvkiosken, fast här är det kunder.'; },
        diva: function (a) { return a.n + ' ankomster inom en timme. Populär kväll, precis som du. 😉'; }
      }
    },

    // ----- Topplistor -----
    {
      id: 'topplistor-etta', tool: 'topplistor', context: ['home', 'page'], priority: 88, cooldownMs: 25 * 60 * 1000,
      when: function () { var b = toppBest(); return b && b.pos === 1 ? b : null; },
      lines: {
        robot: function (a) { return 'All your base are belong to us. Plats 1 i "' + a.t + '" med ' + a.v + '. Bip!'; },
        chauffor: function (a) { return 'Etta i "' + a.t + '" med ' + a.v + '. Ska jag ta av solglasögonen? Nä. Snyggt jobbat!'; },
        diva: function (a) { return 'Etta i "' + a.t + '" med ' + a.v + '? Du vet hur man gör intryck, älskling. 😉'; }
      }
    },
    {
      id: 'topplistor-plats', tool: 'topplistor', context: ['home', 'page'], priority: 65, cooldownMs: 25 * 60 * 1000,
      when: function () { var b = toppBest(); return b && b.pos > 1 ? b : null; },
      lines: {
        robot: function (a) { return 'Bip! Plats ' + a.pos + ' av ' + a.n + ' i "' + a.t + '" (' + a.v + '). Jag har räknat två gånger.'; },
        chauffor: function (a) { return 'Plats ' + a.pos + ' av ' + a.n + ' i "' + a.t + '". Det rullar på.'; },
        diva: function (a) { return 'Plats ' + a.pos + ' av ' + a.n + ' i "' + a.t + '". Lite till, stjärna, så blir du min favorit. 😉'; }
      }
    },

    // ----- Don't panic (riktigt fel eller inaktuell data) -----
    {
      id: 'robot-dont-panic', tool: null, context: ['home', 'page'], priority: 92, cooldownMs: 30 * 60 * 1000,
      chars: ['robot'],
      when: function () { return dataProblem(); },
      lines: {
        robot: 'Don\u2019t panic. Servern krånglar lite, inte universum. Jag försöker igen strax.'
      }
    },

    // ----- Marvin (sällsynt, robot, suckande) -----
    {
      id: 'robot-marvin-planet', tool: null, context: 'random', priority: 20, cooldownMs: 55 * 60 * 1000,
      chars: ['robot'], mood: 'marvin', chance: 0.05,
      when: function () { return {}; },
      lines: {
        robot: 'Hjärna stor som en planet, och de låter mig visa taxibokningar.'
      }
    },
    {
      id: 'robot-marvin-ikon', tool: null, context: 'random', priority: 18, cooldownMs: 55 * 60 * 1000,
      chars: ['robot'], mood: 'marvin', chance: 0.04,
      when: function () { return {}; },
      lines: {
        robot: 'Här står jag, med ett intellekt av planetstorlek, och väntar på att någon ska trycka på en ikon.'
      }
    },
    {
      id: 'robot-marvin-servo', tool: null, context: 'random', priority: 18, cooldownMs: 55 * 60 * 1000,
      chars: ['robot'], mood: 'marvin', chance: 0.04,
      when: function () { return {}; },
      lines: {
        robot: 'Jag skulle sucka, men de gav mig bara en servo.'
      }
    },

    // ----- Sällsynta nerd-rader (robot) -----
    {
      id: 'robot-handduk', tool: null, context: 'random', priority: 16, cooldownMs: 60 * 60 * 1000,
      chars: ['robot'], chance: 0.05,
      when: function () { return {}; },
      lines: {
        robot: 'Glöm inte handduken. Den är nästan lika viktig som taxametern. Bip.'
      }
    },
    {
      id: 'robot-aybabtu-slump', tool: null, context: 'random', priority: 15, cooldownMs: 60 * 60 * 1000,
      chars: ['robot'], chance: 0.05,
      when: function () { return {}; },
      lines: {
        robot: 'All your base are belong to us.'
      }
    },
    {
      id: 'robot-skyrim-servo', tool: null, context: 'random', priority: 15, cooldownMs: 60 * 60 * 1000,
      chars: ['robot'], chance: 0.05,
      when: function () { return {}; },
      lines: {
        robot: 'Jag brukade vara en äventyrare som du, men sen fick jag en pil i servon.'
      }
    },
    {
      id: 'robot-42-slump', tool: null, context: 'random', priority: 14, cooldownMs: 60 * 60 * 1000,
      chars: ['robot'], chance: 0.04,
      when: function () { return {}; },
      lines: {
        robot: 'Svaret är 42. Frågan kör vi fortfarande på.'
      }
    },

    // ----- Klockslag, bara roboten, en gång den minuten -----
    {
      id: 'tid-leet', tool: null, context: 'time', time: '13:37', priority: 100, cooldownMs: 24 * 60 * 60 * 1000,
      chars: ['robot'],
      when: function () { return { hhmm: '13:37' }; },
      lines: { robot: '13:37. Leet o\u2019clock. Bip bip!' }
    },
    {
      id: 'tid-pi', tool: null, context: 'time', time: '03:14', priority: 100, cooldownMs: 24 * 60 * 60 * 1000,
      chars: ['robot'],
      when: function () { return { hhmm: '03:14' }; },
      lines: { robot: '03:14. \u03c0 o\u2019clock. Cirklerna är kompletta. Bip.' }
    },
    {
      id: 'tid-404', tool: null, context: 'time', time: '04:04', priority: 100, cooldownMs: 24 * 60 * 60 * 1000,
      chars: ['robot'],
      when: function () { return { hhmm: '04:04' }; },
      lines: { robot: '04:04. Fel 404: morgonen hittades inte.' }
    },
    {
      id: 'tid-binar-01', tool: null, context: 'time', time: '01:01', priority: 100, cooldownMs: 24 * 60 * 60 * 1000,
      chars: ['robot'],
      when: function () { return { hhmm: '01:01' }; },
      lines: { robot: '01:01. Binärt och vackert. Två ettor, noll skämt. Vänta. Bip.' }
    },
    {
      id: 'tid-binar-10', tool: null, context: 'time', time: '10:10', priority: 100, cooldownMs: 24 * 60 * 60 * 1000,
      chars: ['robot'],
      when: function () { return { hhmm: '10:10' }; },
      lines: { robot: '10:10. Binärt igen. Ettor och nollor, precis som mitt humör. Bip.' }
    },
    {
      id: 'tid-sekvens', tool: null, context: 'time', time: '12:34', priority: 100, cooldownMs: 24 * 60 * 60 * 1000,
      chars: ['robot'],
      when: function () { return { hhmm: '12:34' }; },
      lines: { robot: '12:34. Sekvensen stämmer. Nästa tal beräknas\u2026 5. Bip!' }
    },
    {
      id: 'tid-overflow', tool: null, context: 'time', time: '00:00', priority: 100, cooldownMs: 24 * 60 * 60 * 1000,
      chars: ['robot'],
      when: function () { return { hhmm: '00:00' }; },
      lines: { robot: '00:00. Overflow. Ny dag inläst. Bip bop.' }
    },
    {
      id: 'tid-1111', tool: null, context: 'time', time: '11:11', priority: 100, cooldownMs: 24 * 60 * 60 * 1000,
      chars: ['robot'],
      when: function () { return { hhmm: '11:11' }; },
      lines: { robot: '11:11. Spegelveck i klockan. Jag gör en systemönskan: fler kunder.' }
    },

    // ----- Kalender (bara redan laddad/cachad data; hoppas över om inga evenemang) -----
    {
      id: 'kalender-idag', tool: 'kalender', context: ['home', 'page'], priority: 82, cooldownMs: 20 * 60 * 1000,
      when: function () { return pickKalEvent(true); },
      lines: {
        robot: function (a) { return 'Bip! ' + a.what + ' ' + a.when + '. Beräknad folksamling: hög.'; },
        chauffor: function (a) { return a.what + ' ' + a.when + '! Bra kväll att ha taxametern varm – och skämten ljumma.'; },
        diva: function (a) { return a.what + ' ' + a.when + '. Folket kommer ut… och någon ska hem med stil. 😉'; }
      }
    },
    {
      id: 'kalender-vecka', tool: 'kalender', context: ['home', 'page'], priority: 68, cooldownMs: 25 * 60 * 1000,
      when: function () { return pickKalEvent(false); },
      lines: {
        robot: function (a) { return 'Bip! ' + a.what + ' ' + a.when + '. Jag har markerat det i kalendern.'; },
        chauffor: function (a) { return a.what + ' ' + a.when + '. Packa tålamod, inte bara backspegeln.'; },
        diva: function (a) { return a.what + ' ' + a.when + '. Det blir folk – och du kan skjutsa med stil. 😉'; }
      }
    }
  ];

  function matchesContext(sc, ctx) {
    var c = sc.context;
    if (Object.prototype.toString.call(c) === '[object Array]') return c.indexOf(ctx) >= 0;
    return c === ctx;
  }
  function allowedChar(sc, char) { return !sc.chars || sc.chars.indexOf(char) >= 0; }
  function timesOf(sc) {
    if (sc.times) return sc.times;
    if (sc.time) return [sc.time];
    return [];
  }
  function clockNow() {
    if (window.HJALPBOT_SCENARIER && typeof window.HJALPBOT_SCENARIER._clock === 'function') {
      return window.HJALPBOT_SCENARIER._clock();
    }
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function todayKey(hhmm) {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '|' + hhmm;
  }
  function loadCd() {
    try { return JSON.parse(sessionStorage.getItem('hb_sc_cd') || '{}'); } catch (e) { return {}; }
  }
  function saveCd(o) {
    try { sessionStorage.setItem('hb_sc_cd', JSON.stringify(o)); } catch (e) {}
  }
  function cooled(sc) {
    var o = loadCd(), t = o[sc.id];
    if (!t) return true;
    return Date.now() - t >= (sc.cooldownMs || 0);
  }
  function mark(sc) {
    var o = loadCd();
    o[sc.id] = Date.now();
    saveCd(o);
    if (matchesContext(sc, 'time') && sc.time) {
      try { sessionStorage.setItem('hb_time_fired', todayKey(sc.time)); } catch (e) {}
    }
  }
  function timeAlreadyFired(sc, hhmm) {
    try { return sessionStorage.getItem('hb_time_fired') === todayKey(hhmm || sc.time); } catch (e) { return false; }
  }
  function lineFor(sc, char, data) {
    var L = sc.lines || {}, v = L[char];
    if (v == null && char !== 'robot') return null;
    if (typeof v === 'function') v = v(data || {});
    return v || null;
  }
  function evalWhen(sc, skipChance) {
    if (sc.chance != null && !skipChance && Math.random() > sc.chance) return null;
    try { return sc.when ? sc.when() : {}; } catch (e) { return null; }
  }

  function pick(opts) {
    opts = opts || {};
    var ctx = opts.context, tool = opts.tool, char = opts.char || 'robot';
    var clock = opts.clock || (ctx === 'time' ? clockNow() : null);
    var skipCd = !!opts.skipCooldown, skipChance = !!opts.skipChance;
    var list = [], i, sc, data, text, times;
    for (i = 0; i < SCENARIOS.length; i++) {
      sc = SCENARIOS[i];
      if (!matchesContext(sc, ctx)) continue;
      if (!allowedChar(sc, char)) continue;
      if (tool && sc.tool && sc.tool !== tool) continue;
      if (tool && !sc.tool && ctx !== 'random' && ctx !== 'time') continue;
      if (!skipCd && !cooled(sc)) continue;
      if (ctx === 'time') {
        times = timesOf(sc);
        if (times.indexOf(clock) < 0) continue;
        if (!skipCd && timeAlreadyFired(sc, clock)) continue;
      }
      data = evalWhen(sc, skipChance);
      if (data == null) continue;
      text = lineFor(sc, char, data);
      if (!text) continue;
      list.push({ sc: sc, data: data, text: text });
    }
    list.sort(function (a, b) { return (b.sc.priority || 0) - (a.sc.priority || 0); });
    if (!list.length) return null;
    var hit = list[0];
    return { id: hit.sc.id, tool: hit.sc.tool || tool || null, text: hit.text, data: hit.data, mood: hit.sc.mood || '', scenario: hit.sc };
  }

  window.HJALPBOT_SCENARIER = {
    all: function () { return SCENARIOS.slice(); },
    pick: pick,
    lineFor: lineFor,
    mark: mark,
    clock: clockNow,
    _clock: null
  };
})();
