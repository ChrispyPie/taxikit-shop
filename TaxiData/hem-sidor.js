/* Hemskärmens sidor och applådan (2026-11-14sidor1), som på Android.
 *   Sidorna (svep vänster/höger på hemskärmen, prickar längst ned):
 *     [S admin]  [Admin]  [Startskärmen]  [Sida 2]
 *     S admin syns bara för S admin, Admin bara för admin/ägare/S admin. Alla har startskärmen + sida 2.
 *     Sida 2 är ett eget fritt rutnät (hem-ordning.js): dra en ikon till skärmkanten så byts sidan.
 *   Applådan: svep uppåt från hemskärmen (när den är skrollad längst ned) eller tryck på ⌃.
 *     Alla moduler föraren har tillgång till, i bokstavsordning, med sökfält. Svep nedåt / bakåt stänger.
 *     Håll in: meny 'Lägg till på hemskärm', eller dra ut modulen på en hemsida.
 * Svepet på hemskärmen byter sida (ingen bakåt-/framåt-swipe där, swipe-back.js frågar ownsSwipe()).
 * Ångra: ta bort skript-taggen i index.html (hem-ordning.js fungerar utan den här filen). */
(function () {
  'use strict';
  var ADMIN = ['admin', 'agare', 'superadmin'], AKERI = ['agare', 'superadmin'];
  var NOTIS_EDGE = 24, LP_MS = 600, SLOP = 10;
  var st = { cur: 'hem', drawer: false, pushed: false, awaitPop: false, shown: false };
  var ADMIN_ITEMS = [
    { id: 'a-arenden', icon: '📥', label: 'Ärenden', href: 'admin.html#arenden', roles: ADMIN },
    { id: 'a-chaufforer', icon: '👥', label: 'Chaufförer', href: 'admin.html#chaufforer', roles: ADMIN },
    { id: 'a-onskemal', icon: '💡', label: 'Önskemål och idéer', href: 'admin.html#onskemal', roles: ADMIN },
    { id: 'a-akeridata', icon: '📊', label: 'Åkeridata', href: 'akeridata.html', roles: AKERI },
    { id: 'a-bilar', icon: '🚕', label: 'Bilar', href: 'admin.html#bilar', roles: AKERI },
    { id: 'a-loner', icon: '💰', label: 'Löner', href: 'admin.html#loner', roles: AKERI },
    { id: 'a-panel', icon: '🔐', label: 'Adminpanelen', href: 'admin.html', roles: ADMIN }
  ];
  var SADMIN_ITEMS = [
    { id: 's-zonguide', icon: '🧭', label: 'Zonguide', href: 'sadmin.html#zonguide' },
    { id: 's-prognos', icon: '📈', label: 'Prognos mot resor', href: 'sadmin.html#prognos' },
    { id: 's-kundtid', icon: '⏱️', label: 'Prognostid: utskick eller kund?', href: 'sadmin.html#kundtid' },
    { id: 's-panel', icon: '🛡️', label: 'S admin-panelen', href: 'sadmin.html' }
  ];

  function role() { try { return typeof window.menuRole === 'function' ? String(window.menuRole() || '') : ''; } catch (e) { return ''; } }
  function isAdmin() { return ADMIN.indexOf(role()) >= 0; }
  function isS() { return role() === 'superadmin'; }
  function pages() { var p = []; if (isS()) p.push('sadmin'); if (isAdmin()) p.push('admin'); p.push('hem', 'extra'); return p; }
  function idx(name) { return pages().indexOf(name); }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function animOff() {
    try { if (localStorage.getItem('taxi_animationer') === '0') return true; } catch (e) {}
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e2) { return false; }
  }
  function app() { return document.getElementById('app'); }
  function content() { return document.getElementById('content'); }
  function onHome() {
    var a = app();
    return !!(st.shown && a && a.classList.contains('is-home') && a.style.display !== 'none' && !window.current &&
      document.querySelector('#content .grid'));
  }
  function HO() { return window.HEM_ORDNING || null; }

  function css() {
    if (document.getElementById('td-sidor-css')) return;
    var s = document.createElement('style');
    s.id = 'td-sidor-css';
    s.textContent =
      '.td-sida{position:fixed;left:0;right:0;top:var(--td-sida-top,56px);bottom:0;overflow-y:auto;overflow-x:hidden;padding:16px 16px 84px;' +
      'box-sizing:border-box;background:var(--bg,#e8f1f8);z-index:4;will-change:transform;visibility:hidden}' +
      '.td-sida.td-vis{visibility:visible}' +
      '.td-sida h2{margin:0 0 12px;font-size:calc(17px * var(--font-scale,1));opacity:.8}' +
      '.td-sida-tom{opacity:.65;text-align:center;font-size:calc(14px * var(--font-scale,1));margin:12px 16px 0;line-height:1.45}' +
      '.td-extra-grid{min-height:calc(100% - 40px);align-content:start}' +
      '.td-sida .td-link .label{white-space:normal}' +
      'html.td-on-sida,html.td-on-sida body{overflow:hidden}' +
      '#app.is-home.td-has-dots #content{padding-bottom:84px}' +
      '.td-dots{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:30;' +
      'display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none}' +
      '.td-dots-row{display:flex;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(15,23,42,.28);pointer-events:auto}' +
      '.td-dot{width:8px;height:8px;border-radius:999px;border:0;padding:0;background:rgba(255,255,255,.55);cursor:pointer;transition:width .2s}' +
      '.td-dot.on{width:20px;background:#fff}' +
      '.td-lada-btn{pointer-events:auto;border:0;background:rgba(15,23,42,.28);color:#fff;border-radius:999px;width:44px;height:26px;' +
      'font-size:16px;line-height:26px;padding:0;cursor:pointer}' +
      '.td-lada{position:fixed;inset:0;z-index:120;background:var(--bg,#e8f1f8);color:var(--text,inherit);display:flex;flex-direction:column;' +
      'transform:translateY(100%);visibility:hidden;will-change:transform}' +
      '.td-lada.td-vis{visibility:visible}' +
      '.td-lada-top{padding:calc(env(safe-area-inset-top,0px) + 6px) 12px 8px;display:flex;flex-direction:column;gap:8px;touch-action:none}' +
      '.td-lada-grip{width:40px;height:4px;border-radius:4px;background:rgba(148,163,184,.7);margin:2px auto 0}' +
      '.td-lada-rad{display:flex;gap:8px;align-items:center}' +
      '.td-lada-rad input{flex:1;min-width:0;font-size:16px;padding:10px 12px;border-radius:12px;border:1px solid rgba(148,163,184,.55);' +
      'background:var(--surface,#fff);color:var(--text,inherit)}' +
      '.td-lada-rad button{border:0;background:none;color:inherit;font-size:22px;padding:6px 10px;cursor:pointer}' +
      '.td-lada-list{flex:1;overflow-y:auto;padding:4px 12px calc(24px + env(safe-area-inset-bottom,0px))}' +
      '.td-lada-list .grid{max-width:none}' +
      '.td-lada-list .icon{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
      '.td-lada-list .icon.td-lifted{transform:scale(1.08);transition:transform .12s}' +
      '.td-lada-tag{display:block;font-size:11px;opacity:.6;margin-top:1px}' +
      '.td-lada-inget{opacity:.65;text-align:center;padding:24px}' +
      '.td-lada-meny{position:fixed;z-index:130;background:var(--surface,#fff);color:var(--text,#1a365d);border:1px solid var(--border-soft,transparent);border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.28);' +
      'padding:6px;min-width:200px}' +
      '.td-lada-meny button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;color:inherit;padding:12px;' +
      'font-size:calc(15px * var(--font-scale,1));text-align:left;border-radius:10px;cursor:pointer}' +
      '.td-lada-meny button:hover{background:rgba(148,163,184,.18)}' +
      '.td-toast{position:fixed;left:50%;bottom:calc(64px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:150;' +
      'background:rgba(15,23,42,.9);color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;pointer-events:none}';
    document.head.appendChild(s);
  }
  function toast(t) {
    var o = document.querySelector('.td-toast'); if (o && o.parentNode) o.parentNode.removeChild(o);
    var d = document.createElement('div'); d.className = 'td-toast'; d.setAttribute('role', 'status'); d.textContent = t;
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2200);
  }

  /* ---------- Sidorna ---------- */
  function panel(name, create) {
    var p = document.querySelector('.td-sida[data-sida="' + name + '"]');
    if (p || !create) return p;
    var a = app(); if (!a) return null;
    css();
    p = document.createElement('section');
    p.className = 'td-sida';
    p.setAttribute('data-sida', name);
    p.setAttribute('aria-hidden', 'true');
    if (name === 'extra') {
      p.setAttribute('aria-label', 'Hemskärm sida 2');
      p.innerHTML = '<div class="grid td-extra-grid"></div><p class="td-sida-tom">Tom sida. Håll in en ikon på startskärmen och dra den till skärmens högra kant, eller dra ut en modul från applådan (svep uppåt).</p>';
    } else {
      p.setAttribute('aria-label', name === 'admin' ? 'Admin' : 'S admin');
    }
    a.appendChild(p);
    return p;
  }
  function linkTiles(items) {
    return '<div class="grid">' + items.map(function (it) {
      return '<div class="icon td-link" role="link" tabindex="0" data-href="' + esc(it.href) + '"><div class="emoji">' + it.icon +
        '</div><div class="label">' + esc(it.label) + '</div></div>';
    }).join('') + '</div>';
  }
  function adminItems() { var r = role(); return ADMIN_ITEMS.filter(function (it) { return it.roles.indexOf(r) >= 0; }); }
  function renderSide(name) {
    var p = panel(name, true);
    if (!p) return;
    if (name === 'admin') p.innerHTML = '<h2>Admin</h2>' + linkTiles(adminItems());
    else if (name === 'sadmin') p.innerHTML = '<h2>S admin</h2>' + linkTiles(SADMIN_ITEMS);
  }
  function extraGrid(create) {
    var p = panel('extra', !!create);
    return p ? p.querySelector('.td-extra-grid') : null;
  }
  function headerTop() {
    var h = document.querySelector('#app > header');
    var b = h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom)) : 56;
    document.documentElement.style.setProperty('--td-sida-top', b + 'px');
  }
  // Lägg ut sidorna: off = fingrets förskjutning i px (under svepet), anim = med övergång.
  function layout(off, anim) {
    var ps = pages(), ci = ps.indexOf(st.cur), W = window.innerWidth || 1, c = content();
    if (ci < 0) { st.cur = 'hem'; ci = ps.indexOf('hem'); }
    var tr = anim && !animOff() ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
    ps.forEach(function (name, i) {
      var x = (i - ci) * W + (off || 0);
      var el = name === 'hem' ? c : panel(name, true);
      if (!el) return;
      if (name !== 'hem' && !el.childNodes.length) renderSide(name);
      el.style.transition = tr;
      var near = Math.abs(x) < W - 1;
      if (name === 'hem') {
        el.style.transform = x ? 'translateX(' + x + 'px)' : '';
        el.style.visibility = near ? '' : 'hidden';
      } else {
        el.style.transform = 'translateX(' + x + 'px)';
        el.classList.toggle('td-vis', near);
        el.setAttribute('aria-hidden', x === 0 ? 'false' : 'true');
      }
    });
    // Sidor som inte längre finns (roll ändrad): göm
    Array.prototype.forEach.call(document.querySelectorAll('.td-sida'), function (p) {
      if (ps.indexOf(p.getAttribute('data-sida')) < 0) p.classList.remove('td-vis');
    });
    document.documentElement.classList.toggle('td-on-sida', st.cur !== 'hem' || !!off);
    dots();
  }
  function go(name, anim) {
    if (idx(name) < 0) return false;
    headerTop();
    var changed = st.cur !== name;
    st.cur = name;
    layout(0, anim !== false);
    var p = panel(name);
    if (p && changed && name !== 'hem') p.scrollTop = 0;
    return true;
  }
  function goRel(dir) { var ps = pages(), i = ps.indexOf(st.cur) + dir; return i >= 0 && i < ps.length ? go(ps[i]) : false; }
  function canDropRel(dir) { var ps = pages(), n = ps[ps.indexOf(st.cur) + dir]; return n === 'hem' || n === 'extra'; }
  function activeGrid() { return onHome() && st.cur === 'extra' ? extraGrid(false) : null; }

  function dots() {
    var d = document.getElementById('td-dots'), a = app();
    if (!onHome()) { if (d) d.style.display = 'none'; if (a) a.classList.remove('td-has-dots'); return; }
    if (!d) {
      d = document.createElement('div');
      d.id = 'td-dots';
      d.className = 'td-dots';
      d.innerHTML = '<button type="button" class="td-lada-btn" aria-label="Alla moduler (applådan)">⌃</button><div class="td-dots-row" role="tablist" aria-label="Hemskärmens sidor"></div>';
      d.querySelector('.td-lada-btn').addEventListener('click', function (e) { e.preventDefault(); openDrawer(); });
      d.querySelector('.td-dots-row').addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-p]');
        if (b) go(b.getAttribute('data-p'));
      });
      document.body.appendChild(d);
    }
    var names = { sadmin: 'S admin', admin: 'Admin', hem: 'Startskärmen', extra: 'Sida 2' };
    d.querySelector('.td-dots-row').innerHTML = pages().map(function (n) {
      return '<button type="button" role="tab" class="td-dot' + (n === st.cur ? ' on' : '') + '" data-p="' + n + '" aria-label="' + names[n] + '" aria-selected="' + (n === st.cur) + '"></button>';
    }).join('');
    d.style.display = '';
    lift(d);
    if (a) a.classList.add('td-has-dots');
  }

  // Väderrutan längst ned (animationer-vader.js) får inte täcka prickarna: lyft dem ovanför den.
  function lift(d) {
    var v = document.getElementById('animationer-vader-plats'), r = v && v.getClientRects().length ? v.getBoundingClientRect() : null;   // fixed: offsetParent är alltid null
    d.style.bottom = r && r.height ? 'calc(' + Math.round((window.innerHeight || 0) - r.top + 8) + 'px + 0px)' : '';
  }
  if (window.MutationObserver) {
    var liftQ = 0;
    new MutationObserver(function () {
      if (liftQ) return;
      liftQ = requestAnimationFrame(function () { liftQ = 0; var d = document.getElementById('td-dots'); if (d && d.style.display !== 'none') lift(d); });
    }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // hem-ordning.js: anropas när startskärmen visas eller lämnas
  function sync(home) {
    st.shown = !!home;
    if (!home) {
      if (st.drawer) closeDrawer(true);
      Array.prototype.forEach.call(document.querySelectorAll('.td-sida'), function (p) { p.classList.remove('td-vis'); });
      var c = content(); if (c) { c.style.transform = ''; c.style.visibility = ''; c.style.transition = ''; }
      document.documentElement.classList.remove('td-on-sida');
      dots();
      return;
    }
    if (idx(st.cur) < 0) st.cur = 'hem';
    headerTop();
    var tom = document.querySelector('.td-sida[data-sida="extra"] .td-sida-tom'), g = extraGrid(false);
    if (tom && g) tom.style.display = g.querySelector('.icon') ? 'none' : '';
    ['admin', 'sadmin'].forEach(function (n) { if (idx(n) >= 0) renderSide(n); });
    layout(0, false);
  }
  function reset() { st.cur = 'hem'; if (st.shown) layout(0, false); }

  /* ---------- Svep på hemskärmen ---------- */
  var tg = null;
  function scrollsX(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 2) { var o = getComputedStyle(el).overflowX; if (o === 'auto' || o === 'scroll') return true; }
    }
    return false;
  }
  function blocked(t) {
    if (!t || !t.closest) return true;
    return !!t.closest('input, textarea, select, [contenteditable="true"], #td-mapp, #td-lp-menu, .td-lada, .td-dots, [data-swipe-ignore], .leaflet-container');
  }
  function busy() { var h = HO(); return !!(h && ((h.isBusy && h.isBusy()) || (h.isEditing && h.isEditing()))); }
  function atBottom() {
    if (st.cur === 'hem') { var se = document.scrollingElement || document.documentElement; return se.scrollTop + window.innerHeight >= se.scrollHeight - 4; }
    var p = panel(st.cur); return !p || p.scrollTop + p.clientHeight >= p.scrollHeight - 4;
  }
  function ownsSwipe() { return onHome() || st.drawer; }
  document.addEventListener('touchstart', function (e) {
    tg = null;
    if (!onHome() || st.drawer || e.touches.length !== 1 || busy() || document.querySelector('.notis-panel.open, .vd')) return;
    var t = e.touches[0], W = window.innerWidth;
    if (t.clientX >= W - NOTIS_EDGE) return;
    if (blocked(e.target) || scrollsX(e.target)) return;
    tg = { x: t.clientX, y: t.clientY, t: Date.now(), dir: '', dx: 0, dy: 0, bottom: atBottom() };
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', function (e) {
    if (!tg) return;
    if (busy() || e.touches.length !== 1) { if (tg.dir === 'x') layout(0, true); if (tg.dir === 'up') drawerAt(null); tg = null; return; }
    var t = e.touches[0], dx = t.clientX - tg.x, dy = t.clientY - tg.y;
    if (!tg.dir) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      if (Math.abs(dx) > Math.abs(dy)) tg.dir = 'x';
      else if (dy < 0 && tg.bottom && st.cur !== 'admin' && st.cur !== 'sadmin') { tg.dir = 'up'; showDrawerEl(); }
      else { tg = null; return; }   // vanlig skroll
    }
    if (e.cancelable) e.preventDefault();
    tg.dx = dx; tg.dy = dy;
    if (tg.dir === 'x') {
      var ps = pages(), i = ps.indexOf(st.cur);
      if ((dx > 0 && i === 0) || (dx < 0 && i === ps.length - 1)) dx = dx / 3;   // motstånd vid sista sidan
      layout(dx, false);
    } else {
      drawerAt(Math.max(0, (window.innerHeight || 600) + Math.min(0, dy)));
    }
  }, { passive: false, capture: true });
  function endSwipe() {
    var g = tg; tg = null;
    if (!g || !g.dir) return;
    var W = window.innerWidth || 1, fast = Date.now() - g.t < 250;
    if (g.dir === 'x') {
      var need = Math.abs(g.dx) > W * 0.22 || (fast && Math.abs(g.dx) > 40);
      if (!(need && goRel(g.dx < 0 ? 1 : -1))) layout(0, true);
    } else {
      if (-g.dy > 90 || (fast && -g.dy > 40)) openDrawer(); else drawerAt(null);
    }
  }
  document.addEventListener('touchend', endSwipe, { passive: true, capture: true });
  document.addEventListener('touchcancel', function () { if (tg && tg.dir === 'x') layout(0, true); if (tg && tg.dir === 'up') drawerAt(null); tg = null; }, { passive: true, capture: true });

  // Länkrutor på admin-sidorna
  document.addEventListener('click', function (e) {
    var l = e.target.closest && e.target.closest('.td-sida .td-link[data-href], .td-lada .icon[data-href]');
    if (!l) return;
    e.preventDefault();
    location.href = l.getAttribute('data-href');
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('.td-sida .td-link[data-href]')) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Escape' && st.drawer) closeDrawer();
  });
  window.addEventListener('resize', function () { if (st.shown) { headerTop(); layout(0, false); } });

  /* ---------- Applådan ---------- */
  function drawerEl(create) {
    var d = document.getElementById('td-lada');
    if (d || !create) return d;
    css();
    d = document.createElement('div');
    d.id = 'td-lada';
    d.className = 'td-lada';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Alla moduler');
    d.innerHTML = '<div class="td-lada-top"><div class="td-lada-grip" aria-hidden="true"></div><div class="td-lada-rad">' +
      '<input type="search" placeholder="Sök modul" aria-label="Sök modul" autocomplete="off" enterkeyhint="search">' +
      '<button type="button" class="td-lada-stang" aria-label="Stäng">✕</button></div></div><div class="td-lada-list"></div>';
    document.body.appendChild(d);
    var inp = d.querySelector('input');
    inp.addEventListener('input', function () { fill(inp.value); });
    d.querySelector('.td-lada-stang').addEventListener('click', function () { closeDrawer(); });
    bindDrawerTouch(d);
    bindDrawerPress(d);
    return d;
  }
  function items() {
    var h = HO(), cat = h && h.catalog ? h.catalog() : [], out = [], seen = {};
    cat.forEach(function (it) { if (it && it.id && !seen[it.id]) { seen[it.id] = 1; out.push({ id: it.id, icon: it.icon, label: String(it.label || it.id), tool: true }); } });
    if (!seen.moduler && h) out.push({ id: 'moduler', icon: '🧩', label: 'Moduler', tool: true });
    if (isAdmin()) adminItems().forEach(function (it) { if (it.id !== 'a-panel') out.push({ id: it.id, icon: it.icon, label: it.label, href: it.href, tag: 'Admin' }); });
    if (isS()) SADMIN_ITEMS.forEach(function (it) { if (it.id !== 's-panel') out.push({ id: it.id, icon: it.icon, label: it.label, href: it.href, tag: 'S admin' }); });
    out.sort(function (a, b) { return a.label.localeCompare(b.label, 'sv', { sensitivity: 'base' }); });
    return out;
  }
  function fill(q) {
    var d = drawerEl(false); if (!d) return;
    q = String(q || '').trim().toLocaleLowerCase('sv');
    var list = items().filter(function (it) { return !q || (it.label + ' ' + (it.tag || '')).toLocaleLowerCase('sv').indexOf(q) >= 0; });
    var html = list.length ? '<div class="grid">' + list.map(function (it) {
      return '<div class="icon" role="button" tabindex="0" ' + (it.href ? 'data-href="' + esc(it.href) + '"' : 'data-lada="' + esc(it.id) + '"') +
        ' aria-label="' + esc(it.label) + '"><div class="emoji">' + it.icon + '</div><div class="label">' + esc(it.label) +
        (it.tag ? '<span class="td-lada-tag">' + esc(it.tag) + '</span>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="td-lada-inget">Ingen modul heter så.</div>';
    d.querySelector('.td-lada-list').innerHTML = html;
  }
  function showDrawerEl() {
    var d = drawerEl(true);
    if (!d.classList.contains('td-vis')) { fill(d.querySelector('input').value = ''); d.querySelector('.td-lada-list').scrollTop = 0; }
    d.classList.add('td-vis');
    return d;
  }
  // y = px från toppen (null = tillbaka till där den ska vara: öppen eller stängd)
  function drawerAt(y, anim) {
    var d = drawerEl(false); if (!d) return;
    var H = window.innerHeight || 600;
    if (y == null) y = st.drawer ? 0 : H;
    d.style.transition = anim !== false && !animOff() ? 'transform .26s cubic-bezier(.2,.8,.2,1)' : 'none';
    d.style.transform = 'translateY(' + Math.round(y) + 'px)';
    if (!st.drawer && y >= H) {
      var done = function () { if (!st.drawer) d.classList.remove('td-vis'); };
      if (d.style.transition === 'none') done(); else setTimeout(done, 280);
    }
  }
  function openDrawer() {
    if (!onHome()) return false;
    showDrawerEl();
    if (!st.drawer) {
      st.drawer = true;
      st.awaitPop = false;
      try { history.pushState({ view: null, sub: true, lada: 1 }, ''); st.pushed = true; } catch (e) { st.pushed = false; }
    }
    requestAnimationFrame(function () { drawerAt(0); });
    return true;
  }
  // noBack: stäng utan att gå tillbaka i historiken (t.ex. när en modul öppnas från lådan)
  function closeDrawer(noBack) {
    closeMenu();
    if (!st.drawer) return false;
    st.drawer = false;
    var inp = document.querySelector('#td-lada input'); if (inp) inp.blur();
    drawerAt(null);
    if (st.pushed) {
      st.pushed = false;
      if (!noBack) { st.awaitPop = true; try { history.back(); } catch (e) { st.awaitPop = false; } }
    }
    return true;
  }
  // index.html navSubBack: bakåtknappen stänger lådan
  function onBack() {
    if (st.drawer) { st.pushed = false; closeDrawer(true); return true; }
    if (st.awaitPop) { st.awaitPop = false; return true; }
    return false;
  }
  function bindDrawerTouch(d) {
    var g = null;
    d.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || press) { g = null; return; }
      var list = d.querySelector('.td-lada-list'), inTop = !!(e.target.closest && e.target.closest('.td-lada-top'));
      if (e.target.closest && e.target.closest('button')) { g = null; return; }
      g = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: Date.now(), ok: inTop || list.scrollTop <= 0, dy: 0, on: false };
    }, { passive: true });
    d.addEventListener('touchmove', function (e) {
      if (!g || !g.ok || press) return;
      var dy = e.touches[0].clientY - g.y, dx = e.touches[0].clientX - g.x;
      if (!g.on) {
        if (dy > SLOP && dy > Math.abs(dx)) g.on = true;
        else if (Math.abs(dy) > SLOP || Math.abs(dx) > SLOP) { g = null; return; }
        else return;
      }
      if (e.cancelable) e.preventDefault();
      g.dy = Math.max(0, dy);
      drawerAt(g.dy, false);
    }, { passive: false });
    d.addEventListener('touchend', function () {
      var x = g; g = null;
      if (!x || !x.on) return;
      if (x.dy > 90 || (Date.now() - x.t < 250 && x.dy > 40)) closeDrawer(); else drawerAt(0);
    }, { passive: true });
  }

  /* Tryck = öppna. Håll in = meny 'Lägg till på hemskärm'; rör fingret efter håll in = dra ut på hemskärmen. */
  var press = null;
  function closeMenu() {
    var m = document.getElementById('td-lada-meny'); if (m && m.parentNode) m.parentNode.removeChild(m);
    Array.prototype.forEach.call(document.querySelectorAll('.td-lada .td-lifted'), function (n) { n.classList.remove('td-lifted'); });
  }
  function showMenu(el, id) {
    closeMenu();
    el.classList.add('td-lifted');
    var m = document.createElement('div');
    m.id = 'td-lada-meny';
    m.className = 'td-lada-meny';
    m.setAttribute('role', 'menu');
    m.innerHTML = '<button type="button" role="menuitem" data-m="add"><span aria-hidden="true">➕</span><span>Lägg till på hemskärm</span></button>' +
      '<button type="button" role="menuitem" data-m="open"><span aria-hidden="true">↗</span><span>Öppna</span></button>';
    document.body.appendChild(m);
    var r = el.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    var x = Math.min(window.innerWidth - mw - 8, Math.max(8, r.left + r.width / 2 - mw / 2));
    var y = r.bottom + 6; if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    m.style.left = Math.round(x) + 'px'; m.style.top = Math.round(y) + 'px';
    m.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-m]'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var act = b.getAttribute('data-m');
      closeMenu();
      if (act === 'add') addHome(id);
      else openTool(id);
    });
  }
  function addHome(id) {
    var h = HO(); if (!h || !h.addToHome) return;
    closeDrawer();
    go('hem', false);
    var added = h.addToHome(id, { firstFree: true });
    toast(added ? 'Lagd på hemskärmen' : 'Finns redan på hemskärmen');
  }
  function openTool(id) {
    closeDrawer(true);
    if (typeof window.openItem === 'function') window.openItem(id);
  }
  function bindDrawerPress(d) {
    var list = d.querySelector('.td-lada-list');
    list.addEventListener('pointerdown', function (e) {
      if (press || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var el = e.target.closest && e.target.closest('.icon[data-lada]');
      if (!el) return;
      var id = el.getAttribute('data-lada');
      press = { el: el, id: id, x0: e.clientX, y0: e.clientY, pid: e.pointerId, ptype: e.pointerType, lifted: false, gone: false };
      press.timer = setTimeout(function () {
        if (!press) return;
        press.lifted = true;
        try { if (navigator.vibrate) navigator.vibrate(10); } catch (er) {}
        showMenu(el, id);
      }, LP_MS);
    });
    function move(x, y, e) {
      if (!press) return;
      var dd = Math.hypot(x - press.x0, y - press.y0);
      if (!press.lifted) { if (dd > SLOP) { clearTimeout(press.timer); press = null; } return; }
      if (e && e.cancelable) e.preventDefault();
      if (dd > SLOP && !press.gone && press.id !== 'moduler') {
        // dra ut: lådan stängs och modulen bärs vidare på hemskärmen
        press.gone = true;
        var p = press; press = null;
        closeMenu();
        closeDrawer();
        var h = HO();
        if (h && h.beginDragFrom) h.beginDragFrom(p.id, x, y, p.ptype, p.ptype === 'touch' ? null : p.pid);
      }
    }
    window.addEventListener('pointermove', function (e) { if (press && e.pointerId === press.pid) move(e.clientX, e.clientY, e); }, true);
    window.addEventListener('touchmove', function (e) { if (press && press.lifted && e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false, capture: true });
    function up(e) {
      if (!press || (e.pointerId != null && e.pointerId !== press.pid && e.type.indexOf('pointer') === 0)) return;
      var p = press; press = null;
      clearTimeout(p.timer);
      if (p.lifted) { swallowClick(); return; }   // menyn står kvar
    }
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', function (e) { if (press && !press.lifted && e.pointerId === press.pid) { clearTimeout(press.timer); press = null; } }, true);
    window.addEventListener('touchend', function () { if (press && press.lifted) { var p = press; press = null; clearTimeout(p.timer); swallowClick(); } }, true);
    list.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('.icon[data-lada]');
      if (!el || document.getElementById('td-lada-meny')) return;
      e.preventDefault();
      openTool(el.getAttribute('data-lada'));
    });
    list.addEventListener('keydown', function (e) {
      var el = e.target.closest && e.target.closest('.icon[data-lada], .icon[data-href]');
      if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
    });
    list.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('.icon')) e.preventDefault(); });
    document.addEventListener('pointerdown', function (e) {
      var m = document.getElementById('td-lada-meny');
      if (m && !(e.target.closest && e.target.closest('#td-lada-meny'))) closeMenu();
    }, true);
  }
  function swallowClick() {
    function block(e) { document.removeEventListener('click', block, true); if (e.target.closest && e.target.closest('#td-lada-meny')) return; e.preventDefault(); e.stopPropagation(); }
    document.addEventListener('click', block, true);
    setTimeout(function () { document.removeEventListener('click', block, true); }, 450);
  }

  window.HEM_SIDOR = {
    sync: sync,
    reset: reset,
    go: go,
    goRel: goRel,
    canDropRel: canDropRel,
    current: function () { return st.cur; },
    pages: pages,
    activeGrid: activeGrid,
    extraGrid: extraGrid,
    ownsSwipe: ownsSwipe,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    drawerOpen: function () { return st.drawer; },
    onBack: onBack,
    drawerItems: items
  };
})();
