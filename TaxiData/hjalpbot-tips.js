/* Hjälpbotens tipsregister – nyttiga pekare till funktioner som flyttats eller är nya.
 *
 * Varje tips:
 *   id, text (eller lines: { robot, chauffor, diva }),
 *   maxShows (standard 3, sparas per förare i localStorage),
 *   priority (högre först), ev. boost(): extra prioritet när tipset är mer relevant,
 *   audience(): om tipset bara ska visas för vissa förare (saknas eller returnerar true = alla),
 *   used(): hoppa över helt om föraren redan hittat/använt funktionen,
 *   go(opt): körs när bubblan trycks; opt.walk är false när Animationer är av.
 */
(function () {
  'use strict';

  var KEY_SHOWN = 'hb_tips_';
  var KEY_USED = 'hb_tip_used_';

  function driverId() {
    try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; }
  }
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }
  function write(key, o) {
    try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) {}
  }
  function shownMap() { return read(KEY_SHOWN + driverId()); }
  function usedMap() { return read(KEY_USED + driverId()); }

  function markUsed(kind) {
    if (!kind) return;
    var o = usedMap();
    o[kind] = 1;
    write(KEY_USED + driverId(), o);
  }
  function hasUsed(kind) { return !!usedMap()[kind]; }

  function hasSubmittedHours() {
    if (hasUsed('submitted')) return true;
    try {
      var d = window.VERKSTAD_LAST;
      if (!d) return false;
      if (d.entries && d.entries.length) return true;
      var s = d.summary || {};
      if (s.pending_n || s.approved_month_min || s.approved_n) return true;
    } catch (e) {}
    return false;
  }

  function nearMonthEnd() {
    var d = new Date(), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return last - d.getDate() <= 3;
  }
  function nearPassEnd() {
    try {
      var snap = window.PAY_DATA && PAY_DATA.snapshot && PAY_DATA.snapshot();
      var shifts = snap && snap.shifts, i, end, now = Date.now();
      if (!shifts) return false;
      for (i = 0; i < shifts.length; i++) {
        end = Date.parse(String(shifts[i].slut || shifts[i].end || '').replace(' ', 'T'));
        if (!isFinite(end) && shifts[i].slut) {
          var p = String(shifts[i].slut).split(' ');
          if (p.length >= 2) end = Date.parse(p[0].slice(0, 4) + '-' + p[0].slice(4, 6) + '-' + p[0].slice(6, 8) + 'T' + p[1].replace(/\s/g, ''));
        }
        if (isFinite(end) && end > now && end - now <= 2 * 3600 * 1000) return true;
      }
    } catch (e) {}
    return false;
  }

  function visibleProfileBtn() {
    var nodes = document.querySelectorAll('#profile-btn, header .profile-btn[aria-label="Profil"], .kp-profile-btn');
    var i, r;
    for (i = 0; i < nodes.length; i++) {
      r = nodes[i].getBoundingClientRect();
      if (r.width > 8 && r.height > 8) return nodes[i];
    }
    return nodes[0] || null;
  }

  function highlightMeddelanden() {
    var menu = document.getElementById('profile-menu');
    var item = document.getElementById('menu-inkorg');
    var btn = visibleProfileBtn();
    if (typeof window.toggleProfile === 'function' && menu && !menu.classList.contains('show')) {
      try { window.toggleProfile(); } catch (e) { if (btn) btn.click(); }
    } else if (menu && !menu.classList.contains('show') && btn) {
      btn.click();
    }
    [item, btn].forEach(function (n) {
      if (!n) return;
      n.classList.add('hb-tip-hl');
      setTimeout(function () { n.classList.remove('hb-tip-hl'); }, 5500);
    });
  }

  var TIPS = [
    {
      id: 'verkstadstimmar-flyttad',
      text: 'Ska du rapportera verkstadstimmar? Häng med in på Meddelanden i din profil',
      maxShows: 3,
      priority: 80,
      // audience finns för framtida tips. Här visas tipset för alla förare (även natt).
      audience: function () { return true; },
      used: function () {
        return hasUsed('inkorg') || hasUsed('verkstad') || hasSubmittedHours();
      },
      boost: function () { return (nearMonthEnd() || nearPassEnd()) ? 20 : 0; },
      go: function (opt) {
        var walk = !!(opt && opt.walk);
        var run = function () { highlightMeddelanden(); };
        if (walk && window.HJALPBOT && typeof window.HJALPBOT.walkTo === 'function') {
          var started = window.HJALPBOT.walkTo(visibleProfileBtn(), function () { setTimeout(run, 30); });
          if (started) return;
        }
        setTimeout(run, 30);
      }
    }
  ];

  function lineFor(tip, char) {
    if (tip.lines && char && tip.lines[char] != null) {
      var v = tip.lines[char];
      return typeof v === 'function' ? v() : v;
    }
    return tip.text || null;
  }

  function shownCount(id) {
    var x = shownMap()[id];
    if (!x) return 0;
    return typeof x === 'number' ? x : (x.n || 0);
  }

  function pick(opts) {
    opts = opts || {};
    var char = opts.char || 'robot', list = [], i, tip, aud;
    for (i = 0; i < TIPS.length; i++) {
      tip = TIPS[i];
      try { if (tip.used && tip.used()) continue; } catch (e) { continue; }
      if (!opts.skipShows && shownCount(tip.id) >= (tip.maxShows || 3)) continue;
      aud = true;
      try { if (typeof tip.audience === 'function') aud = !!tip.audience(); } catch (e2) { aud = true; }
      if (!aud) continue;
      if (!lineFor(tip, char)) continue;
      list.push(tip);
    }
    list.sort(function (a, b) {
      var pa = (a.priority || 0) + (a.boost ? (a.boost() || 0) : 0);
      var pb = (b.priority || 0) + (b.boost ? (b.boost() || 0) : 0);
      return pb - pa;
    });
    if (!list.length) return null;
    var hit = list[0];
    return { id: hit.id, text: lineFor(hit, char), tip: hit };
  }

  function markShown(id) {
    var o = shownMap(), cur = o[id] || { n: 0, last: 0 };
    if (typeof cur === 'number') cur = { n: cur, last: 0 };
    cur.n = (cur.n || 0) + 1;
    cur.last = Date.now();
    o[id] = cur;
    write(KEY_SHOWN + driverId(), o);
  }

  window.HJALPBOT_TIPS = {
    all: function () { return TIPS.slice(); },
    pick: pick,
    markShown: markShown,
    markUsed: markUsed,
    hasUsed: hasUsed,
    shownCount: shownCount,
    hasSubmittedHours: hasSubmittedHours
  };
})();
