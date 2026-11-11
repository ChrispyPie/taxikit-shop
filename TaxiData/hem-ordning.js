/* Hemskärm: ordna, dölja och lägga till verktyg. Sparat per förare på servern,
 * med localStorage som reserv. Ångra: se docs/hem-ordning/UNDO.md. */
(function () {
  'use strict';
  if (window.HEM_ORDNING) return;

  var LS = 'taxi_home_order';
  var CORE = { installningar: 1, om: 1, admin: 1, sadmin: 1 };
  var editing = false;
  var order = null;   // string[] or null = default
  var hidden = [];    // ids the driver has removed; empty = all installed
  var catalog = [];   // {id, icon, label} the driver can see
  var drag = null;

  function isCore(id) { return !!CORE[id]; }
  function driverId() {
    try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; }
  }
  function lsKey() { return LS + ':' + (driverId() || 'x'); }
  function okId(id) { return typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id); }
  function cleanList(a) {
    if (!Array.isArray(a)) return [];
    var out = [], seen = {}, i, id;
    for (i = 0; i < a.length; i++) {
      id = a[i];
      if (!okId(id) || seen[id]) continue;
      seen[id] = 1;
      out.push(id);
    }
    return out;
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(lsKey());
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (Array.isArray(v)) return { ids: cleanList(v), hidden: [] };
      if (v && typeof v === 'object') {
        return { ids: cleanList(v.ids), hidden: cleanList(v.hidden).filter(function (id) { return !isCore(id); }) };
      }
    } catch (e) {}
    return null;
  }
  function writeLocal() {
    try {
      if ((!order || !order.length) && !hidden.length) localStorage.removeItem(lsKey());
      else localStorage.setItem(lsKey(), JSON.stringify({ ids: order || [], hidden: hidden || [] }));
    } catch (e) {}
  }

  function token() { try { return localStorage.getItem('taxi_session') || ''; } catch (e) { return ''; } }
  function isDemo() { return !!(window.driverData && window.driverData.demo); }

  function rpc(name, args) {
    var url = window.TRIP_API_URL, key = window.TRIP_API_KEY;
    if (!url || !key || !token() || isDemo()) return Promise.resolve(null);
    return fetch(url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) { return r.text().then(function (t) { return { ok: r.ok, body: t ? JSON.parse(t) : null }; }); })
      .then(function (x) { return x.ok ? x.body : null; })
      .catch(function () { return null; });
  }

  function setState(ids, hid) {
    order = ids && ids.length ? cleanList(ids) : null;
    hidden = cleanList(hid).filter(function (id) { return !isCore(id); });
    writeLocal();
  }

  function arrange(visible) {
    if (catalog.length && visible && visible.length) {
      /* keep catalog fresh when called from renderMenu */
    }
    var shown = visible.filter(function (x) { return isCore(x.id) || hidden.indexOf(x.id) < 0; });
    var def = shown.map(function (x) { return x.id; });
    var saved = (order || []).filter(function (id) { return def.indexOf(id) >= 0; });
    if (!saved.length) return shown.slice();
    var unseen = def.filter(function (id) { return saved.indexOf(id) < 0; });
    var out = saved.slice();
    unseen.forEach(function (id) {
      var di = def.indexOf(id), placed = false, i, j;
      for (i = di - 1; i >= 0; i--) {
        j = out.indexOf(def[i]);
        if (j >= 0) { out.splice(j + 1, 0, id); placed = true; break; }
      }
      if (!placed) out.unshift(id);
    });
    return out.map(function (id) { return shown.filter(function (v) { return v.id === id; })[0]; }).filter(Boolean);
  }

  function currentIds(grid) {
    if (!grid) return [];
    return Array.prototype.map.call(grid.querySelectorAll('.icon[data-tool]'), function (el) {
      return el.getAttribute('data-tool');
    });
  }

  function persist(ids) {
    if (ids) order = cleanList(ids);
    writeLocal();
    rpc('home_tool_order_set', { p_token: token(), p_ids: order || [], p_hidden: hidden || [] });
  }

  function ICO_WRENCH() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d="M21.1 2.9a5.5 5.5 0 0 0-7.4 6.4L5.2 17.8a2.2 2.2 0 1 0 3 3l8.5-8.5a5.5 5.5 0 0 0 6.4-7.4l-3.3 3.3-2.1-2.1 3.4-3.2z"/></svg>';
  }

  function css() {
    if (document.getElementById('td-ordna-css')) return;
    var s = document.createElement('style');
    s.id = 'td-ordna-css';
    s.textContent =
      '#app.is-home #content{padding:4px 10px 20px}' +
      '.td-grid-wrap{position:relative}' +
      '.td-wrench{position:absolute;top:0;right:0;z-index:4;width:44px;height:44px;min-width:44px;min-height:44px;' +
      'padding:0;margin:0;border:0;background:none;box-shadow:none;border-radius:0;color:var(--text-soft,#94a3b8);opacity:.42;' +
      'display:flex;align-items:flex-start;justify-content:flex-end;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '.td-wrench svg{display:block;margin:1px 1px 0 0;width:14px;height:14px}' +
      '.td-wrench,.td-wrench *{-webkit-tap-highlight-color:transparent}' +
      '.td-wrench:active,.td-wrench:focus{background:none;transform:none;outline:none}' +
      '.td-wrench svg{transform-origin:80% 20%}' +
      '.td-wrench:active svg{transform:scale(0.92);filter:brightness(1.16) drop-shadow(0 0 4px rgba(99,179,237,.55))}' +
      '.td-wrench:focus-visible{outline:2px solid var(--accent,#3182ce);outline-offset:-2px;border-radius:8px;background:none}' +
      'body.td-is-ordna .td-wrench{display:none}' +
      '.td-andringslage{display:none;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 6px;padding:0 2px;' +
      'font-size:calc(12px * min(var(--font-scale,1),1.2));line-height:1.25;color:var(--text-soft,#94a3b8)}' +
      'body.td-is-ordna .td-andringslage{display:flex}' +
      '.td-andrings-text{flex:1 1 10em;min-width:0}' +
      '.td-andrings-btns{display:flex;align-items:center;gap:4px;margin-left:auto}' +
      '.td-andringslage button{appearance:none;border:0;background:none;box-shadow:none;color:var(--primary,#2b6cb0);' +
      'padding:8px 10px;min-height:44px;font:600 calc(13px * var(--font-scale,1))/1 inherit;cursor:pointer;border-radius:8px;' +
      '-webkit-tap-highlight-color:transparent}' +
      '.td-andringslage button.primary{font-weight:700}' +
      '.td-andringslage button:active{background:rgba(127,127,127,0.16)}' +
      '.grid.td-ordna .icon[data-tool]{cursor:grab;position:relative;user-select:none;-webkit-user-select:none;touch-action:none}' +
      '.grid.td-ordna .icon.td-dragging{opacity:.45}' +
      '.grid.td-ordna .icon.td-over{outline:2px dashed var(--primary,#2b6cb0);outline-offset:2px}' +
      '.td-handle{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:6px;display:none!important;' +
      'align-items:center;justify-content:center;font-size:13px;line-height:1;color:var(--text-soft,#94a3b8);pointer-events:none;overflow:hidden}' +
      '.grid.td-ordna .icon[data-tool] .td-handle{display:flex!important}' +
      '.td-remove{position:absolute;top:-4px;right:-4px;width:28px;height:28px;min-width:28px;min-height:28px;padding:0;margin:0;' +
      'border:0;border-radius:50%;background:var(--danger,#e53e3e);color:#fff;font:700 16px/1 system-ui,sans-serif;' +
      'display:none;align-items:center;justify-content:center;cursor:pointer;z-index:2;-webkit-tap-highlight-color:transparent}' +
      '.grid.td-ordna .icon[data-tool] .td-remove{display:inline-flex}' +
      '.td-slot-empty{appearance:none;background:transparent;border:1.5px dashed var(--border,#3a4a5c);border-radius:10px;' +
      'min-height:44px;color:var(--text-soft,#94a3b8);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'padding:8px 2px 6px;box-sizing:border-box;-webkit-tap-highlight-color:transparent;font:inherit}' +
      '.td-slot-empty,.td-slot-empty *{-webkit-tap-highlight-color:transparent}' +
      '.td-slot-empty .td-slot-plus{font:600 28px/1 system-ui,sans-serif;color:var(--primary,#2b6cb0);display:inline-block;transform-origin:50% 50%}' +
      '.td-slot-empty .label{font-size:calc(13px * min(var(--font-scale,1),1.15));margin-top:2px;color:var(--text,#e2e8f0)}' +
      '.td-slot-empty:active,.td-slot-empty:focus{background:none;transform:none;outline:none}' +
      '.td-slot-empty:active .td-slot-plus{transform:scale(0.92);filter:brightness(1.16) drop-shadow(0 0 5px rgba(99,179,237,.55))}' +
      '.td-slot-empty:focus-visible{outline:2px solid var(--accent,#3182ce);outline-offset:2px}' +
      'html[data-home="lista"] .td-slot-empty{flex-direction:row;justify-content:flex-start;gap:12px;padding:6px 10px;min-height:44px}' +
      'html[data-home="lista"] .td-slot-empty .td-slot-plus{font-size:22px;width:30px;text-align:center}' +
      '.grid.td-ordna .td-slot-empty{animation:none;cursor:pointer;touch-action:auto}' +
      '@keyframes td-wiggle{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg)}}' +
      '.grid.td-ordna .icon[data-tool]:not(.td-dragging){animation:td-wiggle .45s ease-in-out infinite}' +
      '.grid.td-ordna .icon[data-tool]:nth-child(2n){animation-delay:.08s}' +
      '.grid.td-ordna .icon[data-tool]:nth-child(3n){animation-delay:.16s}' +
      '@media (prefers-reduced-motion:reduce){.grid.td-ordna .icon{animation:none!important}}' +
      '.td-add-panel{position:fixed;left:8px;right:8px;top:56px;width:min(360px,calc(100vw - 16px));margin:0 auto;max-height:min(70vh,420px);' +
      'overflow:auto;z-index:125;display:none;background:var(--surface,#fff);color:var(--text,#1a202c);' +
      'border:1px solid var(--border,#cbd5e0);border-radius:14px;padding:10px 12px 12px;box-shadow:0 8px 24px rgba(0,0,0,.18)}' +
      '.td-add-panel.open{display:block}' +
      '.td-add-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;font-size:calc(15px * var(--font-scale,1));font-weight:700}' +
      '.td-add-x{border:0;background:none;color:var(--text-soft,#718096);font-size:22px;line-height:1;cursor:pointer;padding:4px 6px}' +
      '.td-add-list{margin:0;padding:0;list-style:none}' +
      '.td-add-list li{margin:0}' +
      '.td-add-item{width:100%;display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 8px;border:0;border-radius:10px;' +
      'background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}' +
      '.td-add-item:active{background:rgba(127,127,127,0.16)}' +
      '.td-add-item .emoji{font-size:22px;width:30px;text-align:center}' +
      '.td-add-empty{margin:0;font-size:calc(14px * var(--font-scale,1));color:var(--text-soft,#718096);line-height:1.35}';
    document.head.appendChild(s);
  }

  function ensureGridWrap(content, grid) {
    var wrap = grid.parentNode;
    if (!wrap || !wrap.classList || !wrap.classList.contains('td-grid-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'td-grid-wrap';
      grid.parentNode.insertBefore(wrap, grid);
      wrap.appendChild(grid);
    }
    var wrench = wrap.querySelector('.td-wrench');
    if (!wrench) {
      wrench = document.createElement('button');
      wrench.type = 'button';
      wrench.className = 'td-wrench';
      wrench.setAttribute('data-ordna', 'edit');
      wrench.setAttribute('aria-label', 'Ordna verktygen');
      wrench.innerHTML = ICO_WRENCH();
      wrench.addEventListener('click', onBarClick);
      wrap.appendChild(wrench);
    }
    var banner = content.querySelector('.td-andringslage');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'td-andringslage';
      banner.innerHTML =
        '<span class="td-andrings-text">Ändringsläge – dra för att flytta</span>' +
        '<span class="td-andrings-btns">' +
        '<button type="button" data-ordna="reset">Återställ</button>' +
        '<button type="button" class="primary" data-ordna="done">Klar</button>' +
        '</span>';
      banner.addEventListener('click', onBarClick);
      wrap.parentNode.insertBefore(banner, wrap);
    }
    return wrap;
  }

  function syncChrome(content) {
    css();
    var app = document.getElementById('app');
    var onHome = !!(app && app.style.display !== 'none' && app.classList.contains('is-home'));
    var leftover = document.getElementById('td-ordna-hdr');
    if (leftover && leftover.parentNode) leftover.parentNode.removeChild(leftover);
    if (!onHome) {
      document.body.classList.remove('td-is-ordna');
      closeAdd();
      return;
    }
    var grid = content && content.querySelector('.grid');
    if (grid) ensureGridWrap(content, grid);
    document.body.classList.toggle('td-is-ordna', editing);
  }

  function onBarClick(e) {
    var b = e.target.closest && e.target.closest('[data-ordna]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    var act = b.getAttribute('data-ordna');
    var content = document.getElementById('content');
    if (act === 'edit') {
      editing = true;
      if (content) decorate(content);
    } else if (act === 'done') {
      editing = false;
      persist(currentIds(document.querySelector('#app .grid')));
      if (typeof renderMenu === 'function') renderMenu();
    } else if (act === 'reset') {
      setState(null, []);
      rpc('home_tool_order_set', { p_token: token(), p_ids: [], p_hidden: [] });
      editing = false;
      if (typeof renderMenu === 'function') renderMenu();
    } else if (act === 'add') {
      openAdd();
    }
  }

  function keepPlusLast(grid) {
    if (!grid) return;
    var plus = grid.querySelector('.td-slot-empty');
    if (plus) grid.appendChild(plus);
  }

  function bindDrag(grid) {
    if (!editing || !grid || grid._ordnaDrag) return;
    grid._ordnaDrag = true;
    grid.addEventListener('pointerdown', onDown);
  }
  function onDown(e) {
    if (!editing) return;
    if (e.target.closest && e.target.closest('.td-remove, .td-slot-empty')) return;
    var icon = e.target.closest && e.target.closest('.icon[data-tool]');
    if (!icon || e.button) return;
    var grid = icon.parentNode;
    e.preventDefault();
    try { icon.setPointerCapture(e.pointerId); } catch (err) {}
    drag = { grid: grid, from: icon, startX: e.clientX, startY: e.clientY, moved: false };
    icon.classList.add('td-dragging');
    grid.addEventListener('pointermove', onMove);
    grid.addEventListener('pointerup', onUp);
    grid.addEventListener('pointercancel', onUp);
  }
  function tileAt(grid, x, y) {
    var els = grid.querySelectorAll('.icon[data-tool]'), i, r;
    for (i = 0; i < els.length; i++) {
      r = els[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return els[i];
    }
    return null;
  }
  function onMove(e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 6) drag.moved = true;
    var over = tileAt(drag.grid, e.clientX, e.clientY);
    Array.prototype.forEach.call(drag.grid.querySelectorAll('.icon.td-over'), function (el) { el.classList.remove('td-over'); });
    if (over && over !== drag.from) over.classList.add('td-over');
  }
  function onUp(e) {
    if (!drag) return;
    var grid = drag.grid, from = drag.from, over = tileAt(grid, e.clientX, e.clientY);
    grid.removeEventListener('pointermove', onMove);
    grid.removeEventListener('pointerup', onUp);
    grid.removeEventListener('pointercancel', onUp);
    from.classList.remove('td-dragging');
    Array.prototype.forEach.call(grid.querySelectorAll('.icon.td-over'), function (el) { el.classList.remove('td-over'); });
    if (over && over !== from) {
      var ids = currentIds(grid), a = ids.indexOf(from.getAttribute('data-tool')), b = ids.indexOf(over.getAttribute('data-tool'));
      if (a >= 0 && b >= 0) {
        ids.splice(b, 0, ids.splice(a, 1)[0]);
        if (a < b) grid.insertBefore(from, over.nextSibling);
        else grid.insertBefore(from, over);
        keepPlusLast(grid);
        persist(ids);
      }
    }
    keepPlusLast(grid);
    drag = null;
  }

  function closeAdd() {
    var p = document.getElementById('td-add-panel');
    if (p) p.classList.remove('open');
  }
  function openAdd() {
    css();
    var p = document.getElementById('td-add-panel');
    if (!p) {
      p = document.createElement('div');
      p.id = 'td-add-panel';
      p.className = 'td-add-panel';
      p.setAttribute('role', 'dialog');
      p.setAttribute('aria-label', 'Lägg till verktyg');
      document.body.appendChild(p);
      p.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.td-add-x')) { closeAdd(); return; }
        var it = e.target.closest && e.target.closest('[data-add-id]');
        if (!it) return;
        e.preventDefault();
        addBack(it.getAttribute('data-add-id'));
      });
      if (!document._tdAddDocBound) {
        document._tdAddDocBound = true;
        document.addEventListener('click', function (e) {
          var pan = document.getElementById('td-add-panel');
          if (!pan || !pan.classList.contains('open')) return;
          if (e.target.closest && (e.target.closest('#td-add-panel') || e.target.closest('.td-slot-empty'))) return;
          closeAdd();
        });
      }
    }
    var items = (hidden || []).map(function (id) {
      var m = catalog.filter(function (x) { return x.id === id; })[0];
      return m || { id: id, icon: '', label: id };
    }).filter(function (m) { return !isCore(m.id); });
    var html = '<div class="td-add-h">Lägg till verktyg<button type="button" class="td-add-x" aria-label="Stäng">×</button></div>';
    if (!items.length) {
      html += '<p class="td-add-empty">Alla verktyg är redan tillagda.</p>';
    } else {
      html += '<ul class="td-add-list">';
      items.forEach(function (m) {
        html += '<li><button type="button" class="td-add-item" data-add-id="' + m.id + '">' +
          '<span class="emoji">' + (m.icon || '') + '</span><span>' + (m.label || m.id) + '</span></button></li>';
      });
      html += '</ul>';
    }
    p.innerHTML = html;
    p.classList.add('open');
  }

  function addBack(id) {
    if (!okId(id) || isCore(id)) return;
    hidden = hidden.filter(function (x) { return x !== id; });
    var ids = currentIds(document.querySelector('#app .grid'));
    if (ids.indexOf(id) < 0) ids.push(id);
    persist(ids);
    closeAdd();
    if (typeof renderMenu === 'function') renderMenu();
    else decorate(document.getElementById('content'));
  }

  function removeTool(id) {
    if (!okId(id) || isCore(id)) return;
    if (hidden.indexOf(id) < 0) hidden.push(id);
    var ids = currentIds(document.querySelector('#app .grid')).filter(function (x) { return x !== id; });
    persist(ids);
    if (typeof renderMenu === 'function') renderMenu();
  }

  function decorate(content) {
    if (!content) return;
    css();
    var app = document.getElementById('app');
    if (app) app.classList.add('is-home');
    var grid = content.querySelector('.grid');
    if (!grid) { syncChrome(content); return; }
    if (!grid.querySelector('.td-slot-empty')) {
      var plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'td-slot-empty';
      plus.setAttribute('data-ordna', 'add');
      plus.setAttribute('aria-label', 'Lägg till verktyg');
      plus.innerHTML = '<span class="td-slot-plus" aria-hidden="true">+</span><span class="label">Lägg till</span>';
      plus.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openAdd(); });
      grid.appendChild(plus);
    }
    keepPlusLast(grid);
    Array.prototype.forEach.call(grid.querySelectorAll('.icon[data-tool]'), function (el) {
      var id = el.getAttribute('data-tool');
      if (!el.querySelector('.td-handle')) {
        var h = document.createElement('span');
        h.className = 'td-handle';
        h.setAttribute('aria-hidden', 'true');
        h.textContent = '⋮⋮';
        el.appendChild(h);
      }
      var rm = el.querySelector('.td-remove');
      if (!isCore(id)) {
        if (!rm) {
          rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'td-remove';
          rm.setAttribute('aria-label', 'Ta bort');
          rm.textContent = '×';
          rm.addEventListener('click', function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            removeTool(id);
          });
          el.appendChild(rm);
        }
      } else if (rm && rm.parentNode) {
        rm.parentNode.removeChild(rm);
      }
      if (editing) el.onclick = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
    });
    grid.classList.toggle('td-ordna', editing);
    if (!content._ordnaBound) {
      content._ordnaBound = true;
      content.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-ordna="add"], .td-slot-empty');
        if (!b) return;
        e.preventDefault();
        openAdd();
      });
    }
    bindDrag(grid);
    syncChrome(content);
  }

  function sync(onHome) {
    var app = document.getElementById('app');
    if (app) app.classList.toggle('is-home', !!onHome);
    if (!onHome) {
      editing = false;
      closeAdd();
    }
    syncChrome(document.getElementById('content'));
  }

  function setCatalog(items) {
    catalog = Array.isArray(items) ? items.slice() : [];
  }

  function load() {
    var local = readLocal();
    if (local) {
      order = local.ids.length ? local.ids : null;
      hidden = local.hidden || [];
    }
    rpc('home_tool_order_get', { p_token: token() }).then(function (r) {
      if (!r) return;
      var ids = r.ids;
      var hid = r.hidden;
      if (ids == null && (hid == null || (Array.isArray(hid) && !hid.length))) return;
      var nextIds = Array.isArray(ids) ? cleanList(ids) : (order || []);
      var nextHid = Array.isArray(hid) ? cleanList(hid).filter(function (id) { return !isCore(id); }) : hidden;
      var same = JSON.stringify(nextIds) === JSON.stringify(order || []) &&
        JSON.stringify(nextHid) === JSON.stringify(hidden || []);
      setState(nextIds.length ? nextIds : null, nextHid);
      var onHome = !!(document.querySelector('#app.is-home .grid .icon') && !document.querySelector('.vd, .td-hjalp-panel.open'));
      if (!same && onHome && !editing && typeof renderMenu === 'function') renderMenu();
    });
  }

  window.HEM_ORDNING = {
    arrange: arrange,
    decorate: decorate,
    load: load,
    sync: sync,
    setCatalog: setCatalog,
    isEditing: function () { return editing; },
    isCore: isCore,
    order: function () { return order ? order.slice() : null; },
    hidden: function () { return hidden.slice(); },
    preview: function (ids, hid) { setState(ids, hid || []); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
