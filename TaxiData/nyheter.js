/* Nyheter: korta rubriker från öppna RSS-flöden, cachade som JSON.
 * Hämtas först när sidan öppnas. Hela artiklar kopieras inte hit. */
(function () {
  'use strict';

  var LS = 'taxi_nyheter_feeds';
  var URLS = [
    '../skiftlogg/feed/nyheter.json',
    'https://raw.githubusercontent.com/ChrispyPie/taxikit-shop/main/skiftlogg/feed/nyheter.json'
  ];
  var FEEDS = [
    { id: 'goteborg', label: 'Göteborg', locked: true },
    { id: 'politik', label: 'Politik' },
    { id: 'sport', label: 'Sport' },
    { id: 'sverige', label: 'Sverige' },
    { id: 'noje', label: 'Nöje' }
  ];
  var ALLOWED = {};
  FEEDS.forEach(function (f) { ALLOWED[f.id] = 1; });

  var cache = null;
  var testdata = null;
  var inflight = null;
  var lastErr = null;

  function driverId() {
    try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; }
  }
  function feedKey() { return LS + ':' + (driverId() || 'x'); }

  function readSel() {
    var extra = [];
    try {
      var v = JSON.parse(localStorage.getItem(feedKey()) || '[]');
      if (Array.isArray(v)) {
        v.forEach(function (id) {
          if (ALLOWED[id] && id !== 'goteborg' && extra.indexOf(id) < 0) extra.push(id);
        });
      }
    } catch (e) {}
    return ['goteborg'].concat(extra);
  }

  function writeSel(ids) {
    var extra = (ids || []).filter(function (id) { return ALLOWED[id] && id !== 'goteborg'; });
    try {
      if (!extra.length) localStorage.removeItem(feedKey());
      else localStorage.setItem(feedKey(), JSON.stringify(extra));
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function stockholmDay(d) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  }

  function fmtTime(iso, now) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var at = now || new Date();
    var hm = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
    var day = stockholmDay(d);
    if (day === stockholmDay(at)) return hm;
    var yest = new Date(at.getTime() - 86400000);
    if (day === stockholmDay(yest)) return 'i går ' + hm;
    var dat = d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' });
    return dat + ' ' + hm;
  }

  function css() {
    if (document.getElementById('td-nyheter-css')) return;
    var s = document.createElement('style');
    s.id = 'td-nyheter-css';
    s.textContent =
      '.td-ny-page{margin:0;padding:0 0 16px}' +
      '.td-ny-lead{margin:0 0 8px;font-size:calc(12px * min(var(--font-scale,1),1.2));line-height:1.35;color:var(--text-soft,#718096)}' +
      '.td-ny-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}' +
      '.td-ny-chip{appearance:none;border:1px solid var(--border-soft,rgba(127,127,127,.35));background:transparent;color:inherit;border-radius:999px;padding:4px 9px;font:inherit;font-size:calc(12px * min(var(--font-scale,1),1.2));line-height:1.2;min-height:28px}' +
      '.td-ny-chip[aria-pressed="true"]{background:var(--accent,#2b6cb0);border-color:transparent;color:#fff}' +
      '.td-ny-chip.is-locked{cursor:default}' +
      '.td-ny-list{list-style:none;margin:0;padding:0}' +
      '.td-ny-item a{display:block;padding:8px 0;border-bottom:1px solid var(--border-soft,rgba(127,127,127,.22));text-decoration:none;color:inherit}' +
      '.td-ny-title{margin:0 0 3px;font-size:calc(15px * min(var(--font-scale,1),1.25));font-weight:650;line-height:1.25}' +
      '.td-ny-sum{margin:0 0 3px;font-size:calc(12px * min(var(--font-scale,1),1.2));line-height:1.35;color:var(--text-soft,#718096);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.td-ny-meta{font-size:calc(11px * min(var(--font-scale,1),1.2));color:var(--text-soft,#718096)}' +
      '.td-ny-empty,.td-ny-err{margin:12px 0;font-size:calc(13px * min(var(--font-scale,1),1.2));color:var(--text-soft,#718096)}' +
      '.td-ny-retry{appearance:none;border:1px solid var(--border-soft,rgba(127,127,127,.35));background:transparent;color:inherit;border-radius:8px;padding:5px 10px;font:inherit;font-size:calc(13px * min(var(--font-scale,1),1.2));margin-top:8px}';
    document.head.appendChild(s);
  }

  function getJson(urls) {
    var i = 0;
    function next(last) {
      if (i >= urls.length) return Promise.reject(last || new Error('ingen källa'));
      var u = urls[i++];
      u += (u.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 60000);
      return fetch(u, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).catch(next);
    }
    return next();
  }

  function payload() { return testdata || cache; }

  function load() {
    if (testdata) return Promise.resolve(testdata);
    if (cache) return Promise.resolve(cache);
    if (inflight) return inflight;
    inflight = getJson(URLS).then(function (j) {
      if (!j || typeof j !== 'object' || !j.feeds) throw new Error('tomt svar');
      cache = j;
      lastErr = null;
      return j;
    }).catch(function (e) {
      lastErr = e;
      throw e;
    }).finally(function () { inflight = null; });
    return inflight;
  }

  function itemsFor(sel, pack) {
    pack = pack || payload() || {};
    var feeds = pack.feeds || {};
    var out = [];
    (sel || []).forEach(function (id) {
      var f = feeds[id];
      if (!f || !Array.isArray(f.items)) return;
      f.items.forEach(function (it) {
        if (!it || !it.title || !it.url) return;
        out.push({
          title: String(it.title),
          summary: String(it.summary || ''),
          source: String(it.source || f.source || ''),
          published: String(it.published || ''),
          url: String(it.url),
          feed: id
        });
      });
    });
    out.sort(function (a, b) { return (b.published || '').localeCompare(a.published || ''); });
    return out;
  }

  function chipsHtml(sel) {
    return '<div class="td-ny-chips" role="group" aria-label="Flöden">' + FEEDS.map(function (f) {
      var on = sel.indexOf(f.id) >= 0;
      var locked = !!f.locked;
      return '<button type="button" class="td-ny-chip' + (locked ? ' is-locked' : '') + '"' +
        ' data-ny-feed="' + esc(f.id) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
        (locked ? ' aria-disabled="true" title="Göteborg visas alltid"' : '') +
        '>' + esc(f.label) + '</button>';
    }).join('') + '</div>';
  }

  function listHtml(items) {
    if (!items.length) return '<p class="td-ny-empty">Inga nyheter att visa just nu.</p>';
    return '<ul class="td-ny-list">' + items.map(function (it) {
      var sum = it.summary ? '<p class="td-ny-sum">' + esc(it.summary) + '</p>' : '';
      var meta = [it.source, fmtTime(it.published)].filter(Boolean).join(' · ');
      return '<li class="td-ny-item"><a href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<p class="td-ny-title">' + esc(it.title) + '</p>' +
        sum +
        (meta ? '<div class="td-ny-meta">' + esc(meta) + '</div>' : '') +
        '</a></li>';
    }).join('') + '</ul>';
  }

  function paint(el, opts) {
    opts = opts || {};
    var sel = readSel();
    var html = '<div class="td-ny-page">' +
      '<p class="td-ny-lead">Korta nyheter från Göteborg. Lägg till fler flöden om du vill. Tryck på en rad för att öppna artikeln hos källan.</p>' +
      chipsHtml(sel);
    if (opts.loading) html += '<p class="td-ny-empty" role="status">Hämtar nyheter…</p>';
    else if (opts.err) {
      html += '<div class="td-ny-err" role="alert"><p>Kunde inte hämta nyheterna. Försök igen.</p>' +
        '<button type="button" class="td-ny-retry">Försök igen</button></div>';
    } else html += listHtml(itemsFor(sel));
    html += '</div>';
    el.innerHTML = html;
    bind(el);
  }

  function bind(el) {
    Array.prototype.forEach.call(el.querySelectorAll('[data-ny-feed]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-ny-feed');
        if (!id || id === 'goteborg') return;
        var sel = readSel();
        var i = sel.indexOf(id);
        if (i >= 0) sel.splice(i, 1);
        else sel.push(id);
        writeSel(sel);
        if (payload() || lastErr) paint(el, { err: lastErr && !payload() });
        else paint(el, { loading: true });
      });
    });
    var retry = el.querySelector('.td-ny-retry');
    if (retry) retry.addEventListener('click', function () { render(el); });
  }

  function render(el) {
    if (!el) return;
    css();
    lastErr = null;
    if (payload()) { paint(el, {}); return; }
    paint(el, { loading: true });
    load().then(function () { if (window.current === 'nyheter' || el.isConnected) paint(el, {}); })
      .catch(function () { if (window.current === 'nyheter' || el.isConnected) paint(el, { err: true }); });
  }

  var api = window.NYHETER || {};
  api.id = 'nyheter';
  api.title = 'Nyheter';
  api.icon = '📰';
  api.render = render;
  api.stop = function () {};
  api.setTestData = function (j) { testdata = j || null; cache = null; lastErr = null; inflight = null; };
  api._readSel = readSel;
  api._writeSel = writeSel;
  api._itemsFor = itemsFor;
  api._fmtTime = fmtTime;
  api._esc = esc;
  window.NYHETER = api;
})();
