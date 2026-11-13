/* Sidan Moduler: lista med förhandsvisning, beskrivning och Installera/Installerad.
 * Öppnas från rutan Moduler på hemskärmen, som kan flyttas men alltid ligger kvar där. Modulinfo vid långtryck öppnar en infosida, inte den här listan. */
(function () {
  'use strict';

  var BLURB = {
    kordata: 'Se vad du kört in, per dag, vecka, månad eller år.',
    lonekoll: 'Ett underlag för lön, utifrån godkänd tid.',
    ankomster: 'Tåg och flyg som är på väg in, med möjlighet att bevaka.',
    prognos: 'Hur resenärer kan röra sig kring tåg och flyg.',
    vader: 'Väderkarta över Västsverige, med nederbörd, vind och temperatur.',
    nyheter: 'Korta nyheter från Göteborg, med fler flöden om du vill.',
    kalender: 'Det som är inbokat, samlat på ett ställe.',
    topplistor: 'Jämför resultat mellan förare för en vald period.',
    forum: 'Frågor och tips mellan förare.',
    'mina-bevakningar': 'Ankomster och händelser du bevakar.',
    installningar: 'Tema, textstorlek och hur startskärmen ser ut.',
    om: 'Om appen och vad som är nytt.',
    admin: 'Administration för åkeriet.',
    sadmin: 'Systemadmin för TaxiData.',
    verkstad: 'Anmälningar och ärenden, till exempel när bilen är på verkstan.',
    moduler: 'Här ser du alla verktyg och kan installera dem på startskärmen. Rutan ligger alltid kvar på startskärmen.'
  };

  function css() {
    if (document.getElementById('td-moduler-css')) return;
    var s = document.createElement('style');
    s.id = 'td-moduler-css';
    s.textContent =
      '.td-mod-page{margin:0;padding:0 0 16px}' +
      '.td-mod-lead{margin:0 0 10px;font-size:calc(13px * min(var(--font-scale,1),1.2));line-height:1.35;color:var(--text-soft,#718096)}' +
      '.td-mod-list{list-style:none;margin:0;padding:0}' +
      '.td-mod-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border-soft,rgba(127,127,127,.22));scroll-margin-top:8px}' +
      '.td-mod-row:last-child{border-bottom:0}' +
      '.td-mod-row.td-mod-focus{background:rgba(49,130,206,.12);border-radius:10px;padding-left:6px;padding-right:6px;margin:0 -6px}' +
      '.td-mod-shot{flex:0 0 auto;width:96px;height:68px;border-radius:8px;overflow:hidden;background:var(--surface-soft,#edf2f7);border:1px solid var(--border-soft,rgba(127,127,127,.25));position:relative}' +
      '.td-mod-shot img{width:100%;height:100%;object-fit:cover;display:block;background:var(--surface-soft,#edf2f7)}' +
      '.td-mod-shot .td-mod-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px}' +
      '.td-mod-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px}' +
      '.td-mod-name{font-weight:700;font-size:calc(15px * min(var(--font-scale,1),1.15));line-height:1.2}' +
      '.td-mod-desc{margin:0;font-size:calc(12px * min(var(--font-scale,1),1.2));line-height:1.3;color:var(--text-soft,#718096);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}' +
      '.td-mod-btn{appearance:none;margin-top:4px;align-self:flex-start;min-height:40px;padding:6px 12px;border-radius:10px;font:600 calc(13px * min(var(--font-scale,1),1.15))/1 inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '.td-mod-btn.on{border:1px solid var(--border,#cbd5e0);background:transparent;color:var(--text-soft,#718096);cursor:default;opacity:.75}' +
      '.td-mod-btn.add{border:0;background:var(--primary,#2b6cb0);color:var(--on-primary,#fff)}' +
      '.td-mod-btn.add:active{filter:brightness(.92)}' +
      '@media (min-width:800px){.td-mod-shot{width:128px;height:88px}.td-mod-page{max-width:720px}}' +
      '.td-info-back{position:fixed;inset:0;z-index:145;background:rgba(0,0,0,.08);pointer-events:auto}' +
      '.td-info-sheet{position:fixed;left:10px;right:10px;bottom:12px;z-index:146;max-width:420px;margin:0 auto;' +
      'background:var(--surface,#fff);color:var(--text,#1a202c);border:1px solid var(--border,#cbd5e0);border-radius:16px;' +
      'box-shadow:0 10px 28px rgba(0,0,0,.2);padding:12px 14px 14px;animation:td-lp-in .16s ease-out}' +
      '.td-info-h{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;font-weight:700;font-size:calc(17px * min(var(--font-scale,1),1.15));line-height:1.2;margin:0 0 6px}' +
      '.td-info-x{appearance:none;border:0;background:none;color:var(--text-soft,#718096);font-size:22px;line-height:1;cursor:pointer;padding:4px 6px;min-height:36px}' +
      '.td-info-desc{margin:0 0 10px;font-size:calc(13px * min(var(--font-scale,1),1.2));line-height:1.35;color:var(--text-soft,#718096)}' +
      '.td-info-meta{display:grid;grid-template-columns:minmax(8.5em,auto) 1fr;gap:3px 12px;margin:0 0 12px;font-size:calc(13px * min(var(--font-scale,1),1.15));line-height:1.35;align-items:baseline}' +
      '.td-info-meta dt{color:var(--text-soft,#718096);font-weight:500;white-space:nowrap}' +
      '.td-info-meta dd{margin:0;min-width:0;overflow-wrap:anywhere}' +
      '.td-info-clear{appearance:none;width:100%;min-height:44px;border:0;border-radius:12px;background:var(--primary,#2b6cb0);color:var(--on-primary,#fff);' +
      'font:600 calc(14px * min(var(--font-scale,1),1.15))/1 inherit;cursor:pointer}' +
      '.td-info-clear:disabled{opacity:.75;cursor:default}' +
      '.td-info-prog{height:3px;border-radius:2px;background:rgba(127,127,127,.2);margin:8px 0 0;overflow:hidden;display:none}' +
      '.td-info-prog.on{display:block}' +
      '.td-info-prog i{display:block;height:100%;width:0;background:var(--primary,#2b6cb0);animation:td-info-bar .7s ease-out forwards}' +
      '@keyframes td-info-bar{from{width:0}to{width:100%}}' +
      '.td-info-msg{margin:8px 0 0;font-size:calc(13px * min(var(--font-scale,1),1.15));color:var(--primary,#2b6cb0);min-height:1.2em}' +
      '@media (prefers-reduced-motion:reduce){.td-info-sheet,.td-info-prog i{animation:none}.td-info-prog i{width:100%}}';
    document.head.appendChild(s);
  }

  function catalog() {
    if (window.HEM_ORDNING && typeof HEM_ORDNING.catalog === 'function') return HEM_ORDNING.catalog() || [];
    return [];
  }
  function installed(id) {
    if (window.HEM_ORDNING && HEM_ORDNING.isCore && HEM_ORDNING.isCore(id)) return true;
    if (window.HEM_ORDNING && typeof HEM_ORDNING.isInstalled === 'function') return HEM_ORDNING.isInstalled(id);
    return true;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rowHtml(m) {
    var id = m.id, on = installed(id), core = !!(window.HEM_ORDNING && HEM_ORDNING.isCore && HEM_ORDNING.isCore(id));
    var name = m.label || id;
    var desc = BLURB[id] || 'Ett verktyg i TaxiData.';
    var src = 'moduler-preview/' + encodeURIComponent(id) + '.webp';
    var btn = on
      ? '<button type="button" class="td-mod-btn on" disabled>Installerad</button>'
      : '<button type="button" class="td-mod-btn add" data-mod-install="' + esc(id) + '">Installera</button>';
    return '<li class="td-mod-row" data-mod-id="' + esc(id) + '"' + (core ? ' data-mod-core="1"' : '') + '>' +
      '<div class="td-mod-shot">' +
      '<span class="td-mod-ph" aria-hidden="true">' + (m.icon || '') + '</span>' +
      '<img src="' + src + '" alt="" width="96" height="68" loading="lazy" decoding="async">' +
      '</div>' +
      '<div class="td-mod-body">' +
      '<div class="td-mod-name">' + esc(name) + '</div>' +
      '<p class="td-mod-desc">' + esc(desc) + '</p>' +
      btn +
      '</div></li>';
  }

  function bindImgs(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.td-mod-shot img'), function (img) {
      img.addEventListener('error', function () {
        img.style.display = 'none';
      });
      img.addEventListener('load', function () {
        var ph = img.parentNode && img.parentNode.querySelector('.td-mod-ph');
        if (ph) ph.style.display = 'none';
      });
    });
  }

  var focusId = '';

  function render(el) {
    if (!el) return;
    css();
    var items = catalog();
    var html = '<div class="td-mod-page">' +
      '<p class="td-mod-lead">Alla verktyg. Installera lägger till det på startskärmen.</p>' +
      '<ul class="td-mod-list">';
    items.forEach(function (m) { html += rowHtml(m); });
    html += '</ul></div>';
    el.onclick = null;
    el.innerHTML = html;
    bindImgs(el);
    el.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-mod-install]');
      if (!b) return;
      e.preventDefault();
      var id = b.getAttribute('data-mod-install');
      if (window.HEM_ORDNING && HEM_ORDNING.install) HEM_ORDNING.install(id);
    };
    var fid = focusId;
    focusId = '';
    if (fid) {
      var row = el.querySelector('[data-mod-id="' + fid + '"]');
      if (row) {
        row.classList.add('td-mod-focus');
        try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { row.scrollIntoView(true); }
      }
    }
  }



  var MONTHS = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var PROTECTED_EXACT = {
    taxi_session: 1, taxi_driver: 1, taxi_logged_in: 1, taxi_theme: 1, taxi_animationer: 1,
    taxi_enhet: 1, taxi_delad_enhet: 1, taxi_bev_ljud: 1, lk_settings: 1, taxi_kal_watches: 1
  };
  var PROTECTED_PREFIX = [
    'taxi_home_order', 'taxi_home_layout', 'hb_char_', 'hb_tips_', 'hb_tip_used_', 'forum_rules', 'taxi_bev',
    'prognos_cats', 'prognos_zones', 'prognos_zone_tab', 'prognos_kundtid',
    'ank_tab', 'bil_tab', 'taxi_font', 'taxi_text', 'taxi_notis', 'tn_open', 'fn_open',
    'taxi_view', 'taxi_mb_view', 'taxi_kal_view', 'taxi_kal_chan', 'taxi_tab', 'taxi_akeri_tab'
  ];
  var CACHE_KEYS = {
    kordata: [], lonekoll: [], ankomster: ['taxi_train_stations_v1'], prognos: [],
    vader: ['taxi_animationer_vader'], nyheter: [], kalender: [], topplistor: [], forum: [],
    'mina-bevakningar': [], installningar: [], om: [], admin: [], sadmin: [], verkstad: []
  };

  function isProtected(key) {
    if (PROTECTED_EXACT[key]) return true;
    var i;
    for (i = 0; i < PROTECTED_PREFIX.length; i++) {
      if (key === PROTECTED_PREFIX[i] || key.indexOf(PROTECTED_PREFIX[i]) === 0) return true;
    }
    return false;
  }

  function moduleFiles(id) {
    var files = [];
    try {
      if (window.LAZY && LAZY.manifest && LAZY.manifest[id]) files = LAZY.manifest[id].slice();
    } catch (e) {}
    if (id === 'vader') files.push('vader.css?v=20261111karta1');
    if (id === 'mina-bevakningar') files.push('mina-bevakningar.css?v=20261111bev2');
    return files;
  }

  function versionOf(files) {
    var best = '', i, m, v;
    for (i = 0; i < files.length; i++) {
      m = String(files[i]).match(/[?&]v=([^&]+)/);
      v = m ? m[1] : '';
      if (v && v > best) best = v;
    }
    return best;
  }

  function dateOfVersion(v) {
    var m = String(v || '').match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return '';
    var y = +m[1], mo = +m[2], d = +m[3];
    if (!mo || mo > 12 || !d) return '';
    return d + ' ' + MONTHS[mo - 1] + ' ' + y;
  }

  function sizeFromTiming(files) {
    var entries = [];
    try { entries = performance.getEntriesByType('resource') || []; } catch (e) {}
    var total = 0, found = 0, i, j, base, e;
    for (i = 0; i < files.length; i++) {
      base = String(files[i]).split('?')[0];
      for (j = 0; j < entries.length; j++) {
        e = entries[j];
        if (e && e.name && e.name.indexOf(base) >= 0) {
          var sz = e.encodedBodySize || e.decodedBodySize || 0;
          if (!sz) continue;
          total += sz;
          found++;
          break;
        }
      }
    }
    return { bytes: total, found: found };
  }

  function fetchOne(src) {
    return new Promise(function (resolve) {
      try {
        var x = new XMLHttpRequest();
        x.open('GET', src);
        x.responseType = 'blob';
        x.onload = function () {
          var n = (x.response && x.response.size) || 0;
          resolve(n >= 64 ? n : 0);
        };
        x.onerror = function () { resolve(0); };
        x.send();
      } catch (e) { resolve(0); }
    });
  }

  function fetchSizes(files) {
    return Promise.all(files.map(fetchOne)).then(function (arr) {
      var n = 0, i;
      for (i = 0; i < arr.length; i++) n += arr[i] || 0;
      return n;
    });
  }

  function fmtKb(bytes) {
    if (!bytes || bytes < 64) return '–';
    var kb = bytes / 1024;
    if (kb < 10) return (Math.round(kb * 10) / 10).toLocaleString('sv-SE') + ' kB';
    return Math.round(kb).toLocaleString('sv-SE') + ' kB';
  }

  function onInfoKey(e) {
    if (e.key === 'Escape') closeInfo();
  }

  function closeInfo() {
    document.removeEventListener('keydown', onInfoKey);
    var b = document.getElementById('td-info-back');
    var sh = document.getElementById('td-info-sheet');
    if (b && b.parentNode) b.parentNode.removeChild(b);
    if (sh && sh.parentNode) sh.parentNode.removeChild(sh);
  }

  function clearModuleCache(id) {
    var keys = (CACHE_KEYS[id] || []).slice(), i, k;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (isProtected(k)) continue;
      try { localStorage.removeItem(k); } catch (e) {}
      try { sessionStorage.removeItem(k); } catch (e2) {}
    }
    try {
      if (id === 'kordata' || id === 'lonekoll') {
        if (window.taxiClearCachedData) window.taxiClearCachedData();
        if (window.PAY_DATA && PAY_DATA.clear) PAY_DATA.clear();
      }
      if (id === 'ankomster' && window.ANKOMSTER && ANKOMSTER.clearCache) ANKOMSTER.clearCache();
      if (id === 'prognos' && window.PROGNOS && PROGNOS.clearCache) PROGNOS.clearCache();
      if (id === 'topplistor' && window.TOPPLISTOR && TOPPLISTOR.clearCache) TOPPLISTOR.clearCache();
      if (id === 'vader' && window.ANIMATIONER_VADER && ANIMATIONER_VADER.cacheKey) {
        try { localStorage.removeItem(ANIMATIONER_VADER.cacheKey); } catch (e3) {}
      }
    } catch (e) {}
  }

  function showInfo(id) {
    css();
    closeInfo();
    var items = catalog();
    var m = null, i;
    for (i = 0; i < items.length; i++) if (items[i].id === id) m = items[i];
    if (!m) m = { id: id, label: id === 'moduler' ? 'Moduler' : id, icon: '' };
    var files = moduleFiles(id);
    var ver = versionOf(files);
    var when = dateOfVersion(ver);
    var timed = sizeFromTiming(files);
    var sizeTxt = files.length ? (timed.found ? fmtKb(timed.bytes) : 'Beräknar…') : 'Ingår i grundappen';
    var back = document.createElement('div');
    back.id = 'td-info-back';
    back.className = 'td-info-back';
    var sheet = document.createElement('div');
    sheet.id = 'td-info-sheet';
    sheet.className = 'td-info-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', m.label || 'Modulinfo');
    sheet.innerHTML =
      '<div class="td-info-h"><span>' + esc(m.label || id) + '</span>' +
      '<button type="button" class="td-info-x" aria-label="Stäng">×</button></div>' +
      '<p class="td-info-desc">' + esc(BLURB[id] || 'Ett verktyg i TaxiData.') + '</p>' +
      '<dl class="td-info-meta">' +
      '<dt>Storlek</dt><dd data-info="size">' + esc(sizeTxt) + '</dd>' +
      '<dt>Version</dt><dd>' + esc(ver || '–') + '</dd>' +
      '<dt>Uppdaterad</dt><dd>' + esc(when || '–') + '</dd>' +
      '</dl>' +
      '<button type="button" class="td-info-clear">Rensa cache</button>' +
      '<div class="td-info-prog" aria-hidden="true"><i></i></div>' +
      '<p class="td-info-msg" role="status"></p>';
    document.body.appendChild(back);
    document.body.appendChild(sheet);
    document.addEventListener('keydown', onInfoKey);
    back.addEventListener('click', function () { closeInfo(); });
    sheet.querySelector('.td-info-x').addEventListener('click', function () { closeInfo(); });
    if (files.length && (!timed.found || timed.found < files.length)) {
      fetchSizes(files).then(function (n) {
        var dd = document.querySelector('#td-info-sheet [data-info="size"]');
        if (dd) dd.textContent = fmtKb(n || timed.bytes);
      });
    }
    sheet.querySelector('.td-info-clear').addEventListener('click', function () {
      var btn = sheet.querySelector('.td-info-clear');
      var prog = sheet.querySelector('.td-info-prog');
      var msg = sheet.querySelector('.td-info-msg');
      btn.disabled = true;
      prog.classList.add('on');
      prog.innerHTML = '<i></i>';
      msg.textContent = '';
      clearModuleCache(id);
      setTimeout(function () {
        if (!sheet.isConnected) return;
        msg.textContent = 'Cache rensad';
        btn.disabled = false;
      }, 750);
    });
  }

  window.MODULER = {
    id: 'moduler',
    title: 'Moduler',
    render: render,
    setFocus: function (id) { focusId = id || ''; },
    showInfo: showInfo,
    closeInfo: closeInfo,
    clearCache: clearModuleCache,
    isProtectedKey: isProtected,
    blurb: BLURB
  };
})();
