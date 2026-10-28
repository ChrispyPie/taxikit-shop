/* Om appen: vad appen är, vem som bygger den, hur man rapporterar fel, versionsnummer och vanliga frågor.
 * All text finns i om-data.js (window.OM_DATA) så att den är lätt att ändra.
 */
(function () {
  'use strict';
  var O = window.OM = { id: 'om', title: 'Om appen', icon: 'ℹ️' };
  var CSS = '/* Om appen (om.js) */\n' +
    '.om-feat { display: flex; gap: 8px; padding: .25rem 0; font-size: .93rem; } .om-feat b { color: var(--primary); }\n' +
    '.om-faq details { border-top: 1px solid var(--border-soft, #e2e8f0); padding: .55rem 0; }\n' +
    '.om-faq details:first-of-type { border-top: none; }\n' +
    '.om-faq summary { cursor: pointer; font-weight: 600; color: var(--primary); }\n' +
    '.om-faq p { margin: .35rem 0 0; white-space: pre-wrap; font-size: .93rem; color: var(--text); }\n' +
    '.om-ver { text-align: center; color: var(--text-soft); font-size: .85rem; margin: .4rem 0 1rem; }\n' +
    '.om-copy { font-size: .75rem; opacity: .8; }\n' +
    '#om-nyheter { margin-bottom: .7rem; }\n' +
    '.om-nyh-rubrik { font-weight: 700; color: var(--primary); font-size: 1.05rem; margin: .6rem .1rem .5rem; }\n' +
    '.om-nyh-dag { background: var(--surface); border: 1px solid var(--border, #cbd5e0); border-radius: 12px; padding: .55rem .75rem .6rem; margin-bottom: .7rem; }\n' +
    '.om-nyh-datum { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--primary); font-size: .98rem; padding-bottom: .4rem; margin-bottom: .45rem; border-bottom: 1px solid var(--border-soft, #e2e8f0); }\n' +
    '.om-nyh-ny { padding: 1px 8px; border-radius: 999px; background: var(--badge, #e53e3e); color: #fff; font-size: .72rem; font-weight: 700; }\n' +
    '.om-nyh-rad { display: flex; align-items: flex-start; gap: 8px; font-size: .92rem; line-height: 1.4; margin: 0 0 .55rem; overflow-wrap: anywhere; }\n' +
    '.om-nyh-rad:last-child { margin-bottom: .1rem; }\n' +
    '.om-nyh-rad b { color: var(--text); }\n' +
    '.om-nyh-typ { flex: 0 0 auto; min-width: 6.4em; box-sizing: border-box; text-align: center; font-size: .7rem; font-weight: 700; letter-spacing: .02em; padding: 2px 6px; border-radius: 999px; margin-top: .15em; color: #fff; background: #3182ce; }\n' +
    '.om-nyh-typ.t-nytt { background: #2f855a; }\n' +
    '.om-nyh-typ.t-fixat { background: #c53030; }\n' +
    '.om-nyh-not { color: var(--text-soft); font-size: .8rem; margin: 0 .1rem .5rem; }';
  var NYH_VISA = 3;            // antal datum som visas innan "Visa alla"
  var NYH_KEY = 'taxi_nyheter_sett';
  var MAN = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  function datumText(d) { var p = String(d).split('-'); return p.length === 3 ? (+p[2]) + ' ' + MAN[+p[1] - 1] + ' ' + p[0] : d; }
  function typKlass(t) { t = String(t).toLowerCase(); return t === 'nytt' ? 't-nytt' : t === 'fixat' ? 't-fixat' : 't-forb'; }
  (function () { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); })();
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- Nyheter (changelog.js) ----------
  // Vad föraren senast sett sparas per förare på servern (changelog_seen_get/_set) och cachas i localStorage
  // så att pricken inte blinkar. Ny förare (ingen markering): bara senaste datumet räknas som nytt.
  function nyhId(dag) { return dag.id || dag.datum; }
  // Vem ser vad (t543u): rader märkta 'admin' eller 'agare' i changelog.js visas bara för de rollerna.
  // Rollen är samma som styr menyn (menuRole i index.html: get_me, eller demots roll). Okänd roll = förare.
  var AUD = { admin: ['admin', 'agare', 'superadmin'], agare: ['agare', 'superadmin'] };
  function minRoll() { try { return (typeof window.menuRole === 'function' && window.menuRole()) || 'standard'; } catch (e) { return 'standard'; } }
  function lista() {
    var roll = minRoll(), ut = [];
    (window.CHANGELOG || []).forEach(function (dag) {
      var rader = [];
      (dag.rader || []).forEach(function (r) {
        var aud = r[2] || dag.aud;
        if (!aud || (AUD[aud] || []).indexOf(roll) >= 0) rader.push([r[0], r[1]]);
        else if (r[3]) rader.push([r[0], r[3]]);
      });
      if (rader.length) ut.push(Object.assign({}, dag, { rader: rader }));
    });
    return ut;
  }
  O.lista = lista;
  function cacheKey() { return NYH_KEY + ':' + (localStorage.getItem('taxi_driver') || ''); }
  function cacheGet() { try { return localStorage.getItem(cacheKey()); } catch (e) { return null; } }
  function cacheSet(v) { try { localStorage.setItem(cacheKey(), v); } catch (e) {} }
  function apiUrl() { try { return TRIP_API_URL; } catch (e) { return ''; } }
  function apiKey() { try { return TRIP_API_KEY; } catch (e) { return ''; } }
  function call(fn, args) {
    if (!apiUrl()) return Promise.reject(new Error('no api'));
    args.p_token = localStorage.getItem('taxi_session') || '';
    return fetch(apiUrl() + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': apiKey(), 'Authorization': 'Bearer ' + apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  // Markering att jämföra mot. Ingen markering alls = ny förare: allt utom senaste datumet räknas som sett.
  function seenMark(v) {
    var L = lista();
    if (v) return v;
    return L.length > 1 ? nyhId(L[1]) : (L.length ? nyhId(L[0]) : '');
  }
  function newest() { var L = lista(); return L.length ? nyhId(L[0]) : ''; }
  function hasUnseen(v) { var n = newest(); return !!n && n > seenMark(v); }
  // När gick nyheten live? datum 'YYYY-MM-DD' + valfri tid 'HH:MM' (svensk tid). Aldrig i framtiden.
  // Utan tid: day = true (flödet visar bara dagen) och at = dagens slut, men högst nu.
  O.when = function (dag) {
    var now = Date.now(), p = String((dag && dag.datum) || '').split('-');
    if (p.length !== 3) return { at: new Date(now).toISOString(), day: true };
    var t = /^(\d{1,2}):(\d{2})$/.exec(String((dag && dag.tid) || ''));
    var d = t ? new Date(+p[0], +p[1] - 1, +p[2], +t[1], +t[2]) : new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59);
    return { at: new Date(Math.min(d.getTime(), now)).toISOString(), day: !t };
  };
  // För notisflödet (notis.js): finns det nyheter föraren inte sett? Ger senaste nyhetens id, datum och första raden.
  O.unseen = function () {
    var L = lista();
    if (!L.length || !hasUnseen(serverSeen !== undefined ? serverSeen : cacheGet())) return null;
    var r = (L[0].rader || [])[0];
    var w = O.when(L[0]);
    return { id: nyhId(L[0]), at: w.at, day: w.day, text: r ? String(r[1]) : '' };
  };
  // "Markera alla som lästa" i notisflödet: räkna alla nyheter som sedda
  O.markSeen = function () {
    var n = newest(); if (!n) return;
    cacheSet(n); serverSeen = n; showDot(n);
    call('changelog_seen_set', { p_seen: n }).then(function (v) { if (v) { serverSeen = v; cacheSet(v); } }).catch(function () {});
  };
  var serverSeen;           // undefined = inte hämtat än, null = aldrig sett
  function showDot(v) { if (window.setBadge) window.setBadge('nyheter', hasUnseen(v)); }
  // Anropas från startskärmen: visar pricken direkt från cachen och frågar sedan servern.
  var refreshedAt = 0;
  O.refreshBadge = function () {
    if (!localStorage.getItem('taxi_session')) return;
    showDot(serverSeen !== undefined ? serverSeen : cacheGet());
    if (Date.now() - refreshedAt < 60000) return;
    refreshedAt = Date.now();
    call('changelog_seen_get', {}).then(function (v) {
      serverSeen = v || null;
      if (v) cacheSet(v);
      showDot(serverSeen);
    }).catch(function () {});
  };
  // Markera allt som sett (efter en kort stund på Om-sidan, så att "Ny" hinner synas)
  var markTimer = null;
  function markSeenSoon() {
    clearTimeout(markTimer);
    var n = newest();
    var cur = serverSeen !== undefined ? serverSeen : cacheGet();
    if (!n || !hasUnseen(cur)) return;
    markTimer = setTimeout(function () {
      if (!document.getElementById('om-nyheter')) return;   // föraren lämnade sidan
      cacheSet(n); serverSeen = n; showDot(n);
      call('changelog_seen_set', { p_seen: n }).then(function (v) { if (v) { serverSeen = v; cacheSet(v); } }).catch(function () {});
    }, 4000);
  }

  // "Prognos: text" -> område i fetstil, så att raderna går lätt att skumma
  function radText(t) {
    t = String(t || ''); var i = t.indexOf(': ');
    return (i > 0 && i <= 24) ? '<b>' + esc(t.slice(0, i + 1)) + '</b> ' + esc(t.slice(i + 2)) : esc(t);
  }
  function nyheter(alla, mark) {
    var L = lista();
    if (!L.length) return '';
    var sett = seenMark(mark);
    var h = '<div id="om-nyheter"><div class="om-nyh-rubrik"><span class="badge-host' + (hasUnseen(mark) ? ' has-badge' : '') + '" data-badge="nyheter" style="padding-right:12px">Nyheter</span></div>';
    var ungefar = false;
    L.forEach(function (dag, i) {
      if (!alla && i >= NYH_VISA) return;
      if (dag.ungefar) ungefar = true;
      var ny = nyhId(dag) > sett;
      h += '<div class="om-nyh-dag"><div class="om-nyh-datum">' + esc(datumText(dag.datum)) + (ny ? '<span class="om-nyh-ny">Ny</span>' : '') + '</div>';
      (dag.rader || []).forEach(function (r) { h += '<div class="om-nyh-rad"><span class="om-nyh-typ ' + typKlass(r[0]) + '">' + esc(r[0]) + '</span><span>' + radText(r[1]) + '</span></div>'; });
      h += '</div>';
    });
    if (alla && ungefar) h += '<p class="om-nyh-not">Äldre historik är ungefärlig.</p>';
    if (L.length > NYH_VISA) h += '<div class="vk-iact"><button data-om="nyh">' + (alla ? 'Visa färre' : 'Visa alla') + '</button></div>';
    h += '</div>';
    return h;
  }
  var shownMark = null;   // markeringen som gällde när sidan öppnades ("Ny" ligger kvar tills nästa besök)

  O.render = function (content) {
    shownMark = serverSeen !== undefined ? serverSeen : cacheGet();
    var d = window.OM_DATA || { faq: [], features: [] };
    var h = '<div class="vk-card"><div class="fo-title" style="font-weight:700;color:var(--primary);font-size:1.1rem;margin-bottom:.3rem">TaxiData</div>' +
      '<p style="margin:0 0 .5rem">' + esc(d.intro) + '</p>';
    (d.features || []).forEach(function (f) { h += '<div class="om-feat"><span>' + esc(f[0]) + '</span><span><b>' + esc(f[1]) + '</b> – ' + esc(f[2]) + '</span></div>'; });
    h += '</div>' + nyheter(false, shownMark) + '<div class="vk-card"><p style="margin:0 0 .5rem">' + esc(window.DEMO && DEMO.get && DEMO.get() && d.builder_demo ? d.builder_demo : d.builder) + '</p><p style="margin:0 0 .6rem">' + esc(d.report) + '</p>' +
      (window.FORUM ? '<div class="vk-iact"><button data-om="forum">💬 Gå till Forum</button></div>' : '') + '</div>' +
      '<div class="vk-card om-faq"><div class="vk-lbl">Vanliga frågor</div>';
    (d.faq || []).forEach(function (x) { h += '<details><summary>' + esc(x.q) + '</summary><p>' + esc(x.a) + '</p></details>'; });
    h += '</div><div class="om-ver">Version ' + esc(d.version) + '<br><span class="om-copy">© 2026 Christian Parsa</span></div>';
    content.innerHTML = h;
    markSeenSoon();
    if (serverSeen === undefined && localStorage.getItem('taxi_session')) {
      call('changelog_seen_get', {}).then(function (v) {
        serverSeen = v || null; if (v) cacheSet(v);
        if (shownMark !== serverSeen && (v || !shownMark)) {
          shownMark = serverSeen;
          var box = document.getElementById('om-nyheter');
          if (box) box.outerHTML = nyheter(false, shownMark);
          markSeenSoon();
        }
      }).catch(function () {});
    }
    content.onclick = function (e) {
      var n = e.target.closest('[data-om="nyh"]');
      if (n) {
        var box = document.getElementById('om-nyheter');
        var alla = n.textContent === 'Visa alla';
        if (box) box.outerHTML = nyheter(alla, shownMark);
        if (!alla) { var nb = document.getElementById('om-nyheter'); if (nb) nb.scrollIntoView({ block: 'start' }); }
        return;
      }
      var b = e.target.closest('[data-om="forum"]');
      if (b && typeof window.openItem === 'function') window.openItem(window.FORUM.id);
    };
  };
})();
