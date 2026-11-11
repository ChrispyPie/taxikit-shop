/* Hemskärm: föraren kan ordna verktygsikonerna. Sparat per förare på servern,
 * med localStorage som reserv. Ångra: se docs/hem-ordning/UNDO.md. */
(function () {
  'use strict';
  if (window.HEM_ORDNING) return;

  var LS = 'taxi_home_order';
  var editing = false;
  var order = null; // string[] or null = default
  var drag = null;

  function driverId() {
    try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; }
  }
  function lsKey() { return LS + ':' + (driverId() || 'x'); }
  function readLocal() {
    try {
      var raw = localStorage.getItem(lsKey());
      if (!raw) return null;
      var a = JSON.parse(raw);
      return Array.isArray(a) && a.length ? a.filter(okId) : null;
    } catch (e) { return null; }
  }
  function writeLocal(ids) {
    try {
      if (!ids || !ids.length) localStorage.removeItem(lsKey());
      else localStorage.setItem(lsKey(), JSON.stringify(ids));
    } catch (e) {}
  }
  function okId(id) { return typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id); }

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

  function setOrder(ids) {
    order = ids && ids.length ? ids.filter(okId) : null;
    writeLocal(order);
  }

  function arrange(visible) {
    var def = visible.map(function (x) { return x.id; });
    var saved = (order || []).filter(function (id) { return def.indexOf(id) >= 0; });
    if (!saved.length) return visible.slice();
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
    return out.map(function (id) { return visible.filter(function (v) { return v.id === id; })[0]; }).filter(Boolean);
  }

  function currentIds(grid) {
    return Array.prototype.map.call(grid.querySelectorAll('.icon[data-tool]'), function (el) {
      return el.getAttribute('data-tool');
    });
  }

  function persist(ids) {
    setOrder(ids);
    rpc('home_tool_order_set', { p_token: token(), p_ids: ids || [] });
  }

  function css() {
    if (document.getElementById('td-ordna-css')) return;
    var s = document.createElement('style');
    s.id = 'td-ordna-css';
    s.textContent =
      '.td-ordna-bar{display:flex;justify-content:flex-end;gap:8px;align-items:center;margin:0 0 8px}' +
      '.td-ordna-bar button{appearance:none;border:1px solid var(--border,#3a4a5c);background:var(--surface,#1a2430);' +
      'color:var(--text,#e2e8f0);border-radius:10px;padding:6px 12px;min-height:44px;font:600 calc(13px * var(--font-scale,1))/1.2 inherit;cursor:pointer}' +
      '.td-ordna-bar button.primary{background:var(--primary,#2b6cb0);color:var(--on-primary,#fff);border-color:var(--primary,#2b6cb0)}' +
      '.grid.td-ordna .icon{cursor:grab;position:relative;user-select:none;-webkit-user-select:none;touch-action:none}' +
      '.grid.td-ordna .icon.td-dragging{opacity:.45}' +
      '.grid.td-ordna .icon.td-over{outline:2px dashed var(--primary,#2b6cb0);outline-offset:2px}' +
      '.td-handle{position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:6px;display:none;' +
      'align-items:center;justify-content:center;font-size:14px;color:var(--text-soft,#94a3b8);pointer-events:none}' +
      '.grid.td-ordna .td-handle{display:flex}' +
      /* reserverad stil för senare "+"-luckor; visas inte än */
      '.td-slot-empty{display:none;border:1px dashed var(--border,#3a4a5c);border-radius:10px;min-height:44px}' +
      '@keyframes td-wiggle{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg)}}' +
      '.grid.td-ordna .icon:not(.td-dragging){animation:td-wiggle .45s ease-in-out infinite}' +
      '.grid.td-ordna .icon:nth-child(2n){animation-delay:.08s}' +
      '.grid.td-ordna .icon:nth-child(3n){animation-delay:.16s}' +
      '@media (prefers-reduced-motion:reduce){.grid.td-ordna .icon{animation:none!important}}';
    document.head.appendChild(s);
  }

  function toolbar(edit) {
    if (edit) {
      return '<div class="td-ordna-bar">' +
        '<button type="button" data-ordna="reset">Återställ</button>' +
        '<button type="button" class="primary" data-ordna="done">Klar</button>' +
        '</div>';
    }
    return '<div class="td-ordna-bar"><button type="button" data-ordna="edit" aria-label="Ordna verktygen">Ordna</button></div>';
  }

  function bindDrag(grid) {
    if (!editing || !grid || grid._ordnaDrag) return;
    grid._ordnaDrag = true;
    grid.addEventListener('pointerdown', onDown);
  }
  function onDown(e) {
    if (!editing) return;
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
        persist(ids);
      }
    }
    drag = null;
  }

  function decorate(content) {
    if (!content) return;
    css();
    var grid = content.querySelector('.grid');
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll('.icon[data-tool]'), function (el) {
      if (!el.querySelector('.td-handle')) {
        var h = document.createElement('span');
        h.className = 'td-handle';
        h.setAttribute('aria-hidden', 'true');
        h.textContent = '⋮⋮';
        el.appendChild(h);
      }
      if (editing) el.onclick = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
    });
    grid.classList.toggle('td-ordna', editing);
    var bar = content.querySelector('.td-ordna-bar');
    var html = toolbar(editing);
    if (bar) bar.outerHTML = html;
    else grid.insertAdjacentHTML('beforebegin', html);
    bar = content.querySelector('.td-ordna-bar');
    if (!content._ordnaBound) {
      content._ordnaBound = true;
      content.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-ordna]');
        if (!b) return;
        e.preventDefault();
        var act = b.getAttribute('data-ordna');
        if (act === 'edit') { editing = true; decorate(content); }
        else if (act === 'done') { editing = false; persist(currentIds(content.querySelector('.grid'))); if (typeof renderMenu === 'function') renderMenu(); }
        else if (act === 'reset') {
          setOrder(null);
          rpc('home_tool_order_set', { p_token: token(), p_ids: [] });
          editing = false;
          if (typeof renderMenu === 'function') renderMenu();
        }
      });
    }
    bindDrag(grid);
  }

  function load() {
    var local = readLocal();
    if (local) order = local;
    rpc('home_tool_order_get', { p_token: token() }).then(function (r) {
      if (!r) return;
      var ids = r.ids;
      if (ids == null) return;
      if (!Array.isArray(ids)) return;
      var next = ids.filter(okId);
      var same = JSON.stringify(next) === JSON.stringify(order || []);
      setOrder(next.length ? next : null);
      var onHome = !!(document.querySelector('#app .grid .icon') && !document.querySelector('.vd, .td-hjalp-panel.open'));
      if (!same && onHome && !editing && typeof renderMenu === 'function') renderMenu();
    });
  }

  window.HEM_ORDNING = {
    arrange: arrange,
    decorate: decorate,
    load: load,
    isEditing: function () { return editing; },
    order: function () { return order ? order.slice() : null; },
    preview: function (ids) { setOrder(ids); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
