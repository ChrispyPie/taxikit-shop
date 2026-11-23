/* Startskärmens ordningsläge & dragning (laddas först vid långtryck, redigering eller dra från applådan).
 * Enkel, sekventiell ordning utan mappar eller fri placering: ikoner lägger sig alltid i följd,
 * och föraren kan dra för att ändra ordning, flytta mellan Startskärmen och Sida 2, eller ta bort genväg. */
(function () {
  'use strict';
  var HO = window.__HO;
  if (!HO || HO._editorLoaded) return;
  HO._editorLoaded = true;

  var st = HO.st;
  var LIFT_MS = 650;
  var SLOP = 10;
  var EDGE_PX = 22;
  var EDGE_DWELL = 600;
  var REORDER_DWELL = 120;
  var dg = null;
  var trash = null;
  var lpBound = false;

  function css() {
    if (document.getElementById('td-ordna-css')) return;
    var s = document.createElement('style');
    s.id = 'td-ordna-css';
    s.textContent =
      '#app.is-home .grid .icon{position:relative;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:pan-y}' +
      '.td-sida .grid .icon{position:relative;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
      '#app.is-home .grid.td-ordna .icon,.td-sida .grid.td-ordna .icon{touch-action:none;cursor:grab}' +
      '.grid.td-ordna .icon{animation:td-wobble .32s ease-in-out infinite alternate}' +
      '.grid.td-ordna .icon:nth-child(2n){animation-delay:-.14s}' +
      '@keyframes td-wobble{from{transform:rotate(-.9deg)}to{transform:rotate(.9deg)}}' +
      '.td-lifted{transform:scale(1.06)!important;filter:drop-shadow(0 8px 16px rgba(0,0,0,.22));transition:transform .12s;animation:none!important}' +
      '.td-ph{opacity:.18!important;animation:none!important}' +
      '.td-drag-ghost{position:fixed;z-index:10050;pointer-events:none;transform:translate(-50%,-50%) scale(1.08);' +
        'border-radius:14px;background:var(--surface,#fff);box-shadow:0 12px 28px rgba(0,0,0,.26);padding:8px 4px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}' +
      '.td-drag-ghost .emoji{font-size:calc(28px * var(--icon-k,1));line-height:1;margin-bottom:4px}' +
      '.td-drag-ghost .label{font-size:calc(12.5px * var(--font-scale,1) * var(--icon-tk,1));line-height:1.15;color:var(--text)}' +
      'body.td-drag-on{user-select:none;-webkit-user-select:none;overflow-x:hidden}' +
      '.td-remove{position:absolute;top:2px;right:4px;z-index:3;width:22px;height:22px;border-radius:50%;border:0;' +
        'background:rgba(197,48,48,.92);color:#fff;font-size:15px;line-height:22px;padding:0;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25)}' +
      '.td-handle{position:absolute;top:2px;left:4px;font-size:12px;color:var(--text-soft,#718096);opacity:.8;pointer-events:none}' +
      '.td-ordna-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;margin:0 0 10px;' +
        'border-radius:12px;background:var(--surface-soft,#edf2f7);border:1px solid var(--border,#cbd5e0);font-size:.88rem}' +
      '.td-ordna-bar-btns{display:flex;gap:8px}' +
      '.td-ordna-bar button{padding:6px 12px;border-radius:8px;font:600 .85rem inherit;cursor:pointer}' +
      '.td-ordna-reset{background:transparent;border:1px solid var(--border,#cbd5e0);color:var(--text)}' +
      '.td-ordna-done{background:var(--primary,#2b6cb0);border:0;color:#fff}' +
      '.td-lp-menu{position:fixed;z-index:10040;min-width:190px;max-width:240px;background:var(--surface,#fff);color:var(--text,#1a365d);' +
        'border:1px solid var(--border,#cbd5e0);border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.22);padding:6px;display:flex;flex-direction:column;gap:2px}' +
      '.td-lp-menu button{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;color:inherit;text-align:left;' +
        'padding:9px 10px;border-radius:9px;font:500 .92rem inherit;cursor:pointer}' +
      '.td-lp-menu button:hover,.td-lp-menu button:active{background:var(--surface-soft,#edf2f7)}' +
      '.td-lp-menu button svg{width:18px;height:18px;flex-shrink:0}' +
      '.td-lp-menu .td-lp-danger{color:#c53030}' +
      '.td-trash{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%) translateY(16px);' +
        'z-index:10035;display:none;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;background:rgba(45,55,72,.92);' +
        'color:#fff;font:600 .9rem inherit;box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .14s,background .14s}' +
      '.td-trash.show{display:flex;transform:translateX(-50%) translateY(0)}' +
      '.td-trash.hot{background:#c53030;transform:translateX(-50%) scale(1.06)}' +
      '.td-toast{position:fixed;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);' +
        'z-index:10060;background:rgba(26,32,44,.92);color:#fff;padding:9px 16px;border-radius:999px;font-size:.88rem;pointer-events:none}';
    document.head.appendChild(s);
  }

  function tileId(n) { return n && n.getAttribute ? n.getAttribute('data-tool') : ''; }
  function tileOf(t) { return t && t.closest ? t.closest('#app.is-home .grid .icon[data-tool], .td-sida[data-sida="extra"] .grid .icon[data-tool]') : null; }
  function mainGrid() { return document.querySelector('#app.is-home #content .grid'); }
  function extraGrid() { return window.HEM_SIDOR && HEM_SIDOR.extraGrid ? HEM_SIDOR.extraGrid(false) : null; }
  function isExtra(g) { return !!(g && g.closest && g.closest('.td-sida[data-sida="extra"]')); }
  function activeGrid() {
    if (window.HEM_SIDOR && HEM_SIDOR.activeGrid) return HEM_SIDOR.activeGrid() || mainGrid();
    return mainGrid();
  }
  function gridTiles(g) { return g ? Array.prototype.slice.call(g.querySelectorAll(':scope > .icon[data-tool]')) : []; }

  function toast(msg) {
    var old = document.getElementById('td-ho-toast');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var d = document.createElement('div');
    d.id = 'td-ho-toast'; d.className = 'td-toast'; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2600);
  }

  function showTrash(show, hot) {
    if (!show) { if (trash) trash.classList.remove('show', 'hot'); return; }
    if (!trash) {
      trash = document.createElement('div');
      trash.className = 'td-trash';
      trash.innerHTML = '<span>🗑️</span><span>Ta bort genväg</span>';
      document.body.appendChild(trash);
    }
    trash.classList.add('show');
    trash.classList.toggle('hot', !!hot);
  }

  function syncChrome(content) {
    if (!content) return;
    var bar = document.getElementById('td-ordna-bar');
    var onHome = !!document.querySelector('#app.is-home');
    if (!st.editing || !onHome) {
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'td-ordna-bar';
      bar.className = 'td-ordna-bar';
      bar.innerHTML = '<span>Dra ikoner för att flytta</span>' +
        '<div class="td-ordna-bar-btns">' +
        '<button type="button" class="td-ordna-reset">Återställ</button>' +
        '<button type="button" class="td-ordna-done">Klar</button></div>';
      content.insertBefore(bar, content.firstChild);
      bar.querySelector('.td-ordna-done').onclick = function () {
        st.editing = false;
        decorate(document.getElementById('content'));
      };
      bar.querySelector('.td-ordna-reset').onclick = function () {
        st.order = null;
        st.hidden = [];
        st.sida2 = [];
        st.off = [];
        st.editing = false;
        HO.writeLocal();
        HO.rerender();
        toast('Standardordningen återställd');
      };
    }
  }

  function decorate(content) {
    css();
    if (!content) return;
    var grid = content.querySelector && content.querySelector('.grid');
    if (!grid) return;
    var eg = extraGrid();
    [grid, eg].forEach(function (g) {
      if (!g) return;
      g.classList.toggle('td-ordna', !!st.editing);
      gridTiles(g).forEach(function (el) {
        var id = tileId(el);
        var h = el.querySelector('.td-handle');
        if (st.editing && !h) {
          h = document.createElement('span');
          h.className = 'td-handle'; h.setAttribute('aria-hidden', 'true'); h.textContent = '⋮⋮';
          el.appendChild(h);
        } else if (!st.editing && h && h.parentNode) h.parentNode.removeChild(h);
        var rm = el.querySelector('.td-remove');
        if (st.editing) {
          if (!rm) {
            rm = document.createElement('button');
            rm.type = 'button'; rm.className = 'td-remove';
            rm.setAttribute('aria-label', 'Ta bort genväg'); rm.textContent = '×';
            rm.onclick = function (ev) {
              ev.stopPropagation(); ev.preventDefault();
              window.HEM_ORDNING.removeShortcut(id);
            };
            el.appendChild(rm);
          }
        } else if (rm && rm.parentNode) rm.parentNode.removeChild(rm);
        if (st.editing) el.onclick = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      });
    });
    bindPointer();
    syncChrome(content);
  }

  function sync(onHome) {
    if (!onHome) { closeLpMenu(); finishDrag(true); }
    syncChrome(document.getElementById('content'));
  }

  function saveOrderFromDom() {
    var mg = mainGrid(), eg = extraGrid();
    var mIds = gridTiles(mg).map(tileId).filter(Boolean);
    var eIds = gridTiles(eg).map(tileId).filter(function (id) { return id && !HO.isPinned(id); });
    // Håll ordningen konsekvent i st.order (huvudsida först, sedan sida2)
    var seen = {}, all = [];
    mIds.concat(eIds).forEach(function (id) { if (!seen[id]) { seen[id] = 1; all.push(id); } });
    // Bevara eventuella dolda/avinstallerade ordningsplatser inte nödvändiga; spara aktiva i ordning
    st.order = all;
    st.sida2 = eIds;
    HO.writeLocal();
  }

  function closeLpMenu() {
    var m = document.getElementById('td-lp-menu');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    Array.prototype.forEach.call(document.querySelectorAll('.td-lifted'), function (n) {
      if (!dg || n !== dg.el) n.classList.remove('td-lifted');
    });
  }

  function icoSvg(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  function showLpMenu(icon, id) {
    closeLpMenu();
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
    css();
    icon.classList.add('td-lifted');
    var m = document.createElement('div');
    m.id = 'td-lp-menu';
    m.className = 'td-lp-menu';
    m.setAttribute('role', 'menu');
    var h = '';
    h += '<button type="button" role="menuitem" data-lp="move">' + icoSvg('<path d="M12 3v18M3 12h18M7 7l5-5 5 5M7 17l5 5 5-5M7 7L2 12l5 5M17 7l5 5-5 5"/>') + '<span>Flytta ikoner</span></button>';
    h += '<button type="button" role="menuitem" data-lp="info">' + icoSvg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>') + '<span>Modulinfo</span></button>';
    h += '<button type="button" role="menuitem" data-lp="help">' + icoSvg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.6-2.5 2-2.5 3.5M12 16.5h.01"/>') + '<span>Hjälp</span></button>';
    h += '<button type="button" role="menuitem" data-lp="off">' + icoSvg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9l6 6M15 9l-6 6"/>') + '<span>Ta bort genväg</span></button>';
    if (!HO.isCore(id) && !HO.isPinned(id)) {
      h += '<button type="button" role="menuitem" class="td-lp-danger" data-lp="uninstall">' + icoSvg('<path d="M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13"/>') + '<span>Avinstallera</span></button>';
    }
    m.innerHTML = h;
    document.body.appendChild(m);
    var r = icon.getBoundingClientRect(), mw = m.offsetWidth || 200, mh = m.offsetHeight || 140;
    var x = Math.min((window.innerWidth || 390) - mw - 8, Math.max(8, r.left + r.width / 2 - mw / 2));
    var y = r.bottom + 6;
    if (y + mh > (window.innerHeight || 700) - 8) y = Math.max(8, r.top - mh - 6);
    m.style.left = Math.round(x) + 'px';
    m.style.top = Math.round(y) + 'px';
    m.onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-lp]');
      if (!b) return;
      ev.preventDefault(); ev.stopPropagation();
      var act = b.getAttribute('data-lp');
      closeLpMenu();
      if (act === 'move') { st.editing = true; HO.rerender(); }
      else if (act === 'info') { window.HEM_ORDNING.openModuler(id); }
      else if (act === 'help') { if (window.HJALP && HJALP.openFor) HJALP.openFor(id); }
      else if (act === 'off') { window.HEM_ORDNING.removeShortcut(id); toast('Genväg borttagen (finns kvar i applådan)'); }
      else if (act === 'uninstall') { window.HEM_ORDNING.uninstall(id); toast('Avinstallerad (finns i Moduler)'); }
    };
  }

  function blockNextClick() {
    var t0 = Date.now();
    function off() { document.removeEventListener('click', block, true); document.removeEventListener('pointerdown', off, true); }
    function block(e) {
      off();
      if (Date.now() - t0 > 450) return;
      if (e.target.closest && e.target.closest('#td-lp-menu')) return;
      if (!tileOf(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    document.addEventListener('click', block, true);
    setTimeout(function () { document.addEventListener('pointerdown', off, true); }, 0);
    setTimeout(off, 450);
  }

  function makeGhost(el) {
    var g = document.createElement('div');
    g.className = 'td-drag-ghost';
    var em = el.querySelector('.emoji'), lb = el.querySelector('.label');
    g.innerHTML = (em ? em.outerHTML : '') + (lb ? lb.outerHTML : '');
    var r = el.getBoundingClientRect();
    g.style.width = Math.max(64, r.width) + 'px';
    document.body.appendChild(g);
    return g;
  }

  function startDrag() {
    if (!dg || dg.dragging) return;
    dg.dragging = true;
    closeLpMenu();
    dg.el.classList.remove('td-lifted');
    dg.el.classList.add('td-ph');
    dg.ghost = makeGhost(dg.el);
    document.body.classList.add('td-drag-on');
    showTrash(true, false);
  }

  function placeGhost() {
    if (!dg || !dg.ghost) return;
    dg.ghost.style.left = Math.round(dg.x) + 'px';
    dg.ghost.style.top = Math.round(dg.y) + 'px';
  }

  function overTrash(x, y) {
    if (!trash || !trash.classList.contains('show')) return false;
    var r = trash.getBoundingClientRect();
    return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
  }

  function edgeCheck(x) {
    if (!dg || !window.HEM_SIDOR || !HEM_SIDOR.canDropRel || HO.isPinned(dg.id)) return;
    var W = window.innerWidth || 0;
    var dir = x <= EDGE_PX ? -1 : (x >= W - EDGE_PX ? 1 : 0);
    if (!dir || !HEM_SIDOR.canDropRel(dir)) { clearTimeout(dg.eTimer); dg.eDir = 0; return; }
    if (dg.eDir === dir) return;
    clearTimeout(dg.eTimer);
    dg.eDir = dir;
    dg.eTimer = setTimeout(function () {
      if (!dg || !dg.dragging) return;
      HEM_SIDOR.goRel(dir);
      var ng = activeGrid();
      if (ng && dg.el.parentNode !== ng) ng.appendChild(dg.el);
      dg.eDir = 0;
    }, EDGE_DWELL);
  }

  function hitTest() {
    if (!dg || !dg.dragging) return;
    var inTrash = !HO.isPinned(dg.id) && overTrash(dg.x, dg.y);
    dg.trash = inTrash;
    if (trash && trash.classList.contains('show')) trash.classList.toggle('hot', inTrash);
    if (inTrash) { clearTimeout(dg.rTimer); dg.rKey = ''; return; }
    edgeCheck(dg.x);
    var grid = activeGrid();
    if (!grid) return;
    if (dg.el.parentNode !== grid && (!isExtra(grid) || !HO.isPinned(dg.id))) grid.appendChild(dg.el);
    var tiles = gridTiles(grid);
    var hit = null, before = false;
    for (var i = 0; i < tiles.length; i++) {
      var n = tiles[i];
      if (n === dg.el) continue;
      var r = n.getBoundingClientRect();
      if (dg.x >= r.left && dg.x <= r.right && dg.y >= r.top && dg.y <= r.bottom) {
        hit = n;
        before = dg.x < r.left + r.width / 2;
        break;
      }
    }
    if (!hit) { clearTimeout(dg.rTimer); dg.rKey = ''; return; }
    var key = tileId(hit) + ':' + (before ? 'b' : 'a');
    if (dg.rKey === key) return;
    clearTimeout(dg.rTimer);
    dg.rKey = key;
    dg.rTimer = setTimeout(function () {
      if (!dg || !dg.dragging || !hit.parentNode) return;
      if (before) hit.parentNode.insertBefore(dg.el, hit);
      else hit.parentNode.insertBefore(dg.el, hit.nextSibling);
    }, REORDER_DWELL);
  }

  function finishDrag(cancel) {
    var d = dg;
    if (!d) return;
    dg = null;
    endListen();
    clearTimeout(d.timer); clearTimeout(d.rTimer); clearTimeout(d.eTimer);
    showTrash(false);
    if (!d.lifted) return;
    if (!d.dragging) {
      if (!st.editing) blockNextClick();
      if (!document.getElementById('td-lp-menu')) d.el.classList.remove('td-lifted');
      return;
    }
    blockNextClick();
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    document.body.classList.remove('td-drag-on');
    d.el.classList.remove('td-ph', 'td-lifted');
    if (!cancel && d.trash && !HO.isPinned(d.id)) {
      window.HEM_ORDNING.removeShortcut(d.id);
      toast('Genväg borttagen');
      return;
    }
    if (!cancel) saveOrderFromDom();
    HO.rerender();
  }

  function onPMove(e) {
    if (!dg || (dg.pid != null && e.pointerId !== dg.pid)) return;
    dg.x = e.clientX; dg.y = e.clientY;
    if (!dg.lifted) {
      if (Math.hypot(dg.x - dg.x0, dg.y - dg.y0) > SLOP) {
        if (st.editing && !dg.dragging) { startDrag(); placeGhost(); hitTest(); }
        else { clearTimeout(dg.timer); finishDrag(true); }
      }
      return;
    }
    if (e.cancelable) e.preventDefault();
    if (!dg.dragging && Math.hypot(dg.x - dg.x0, dg.y - dg.y0) > SLOP) startDrag();
    if (dg.dragging) { placeGhost(); hitTest(); }
  }
  function onTouchMove(e) {
    if (!dg || !dg.lifted || !e.touches[0]) return;
    if (e.cancelable) e.preventDefault();
    dg.x = e.touches[0].clientX; dg.y = e.touches[0].clientY;
    if (!dg.dragging && Math.hypot(dg.x - dg.x0, dg.y - dg.y0) > SLOP) startDrag();
    if (dg.dragging) { placeGhost(); hitTest(); }
  }
  function onPUp(e) {
    if (!dg || (dg.pid != null && e.pointerId !== dg.pid)) return;
    finishDrag(false);
  }
  function onPCancel(e) {
    if (!dg || (dg.pid != null && e.pointerId !== dg.pid)) return;
    finishDrag(true);
  }
  function endListen() {
    window.removeEventListener('pointermove', onPMove, true);
    window.removeEventListener('pointerup', onPUp, true);
    window.removeEventListener('pointercancel', onPCancel, true);
  }

  function onPDown(e) {
    if (dg || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest && e.target.closest('.td-remove, #td-lp-menu, #td-ordna-bar')) return;
    if (!(e.target.closest && (e.target.closest('#app.is-home') || e.target.closest('.td-sida[data-sida="extra"]')))) return;
    var el = tileOf(e.target);
    if (!el) return;
    var id = tileId(el);
    if (!id) return;
    dg = {
      el: el, id: id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      pid: e.pointerType === 'touch' ? null : e.pointerId, ptype: e.pointerType,
      lifted: st.editing, dragging: false, timer: 0, rTimer: 0, rKey: '', eTimer: 0, eDir: 0, trash: false
    };
    window.addEventListener('pointermove', onPMove, true);
    window.addEventListener('pointerup', onPUp, true);
    window.addEventListener('pointercancel', onPCancel, true);
    if (!st.editing) {
      dg.timer = setTimeout(function () {
        if (!dg) return;
        dg.lifted = true;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (er) {}
        showLpMenu(dg.el, dg.id);
      }, LIFT_MS);
    }
  }

  function bindPointer() {
    if (lpBound) return;
    lpBound = true;
    document.addEventListener('pointerdown', onPDown);
    window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    window.addEventListener('touchend', function () { if (dg && dg.lifted) finishDrag(false); }, true);
    window.addEventListener('touchcancel', function () { if (dg && dg.lifted) finishDrag(true); }, true);
    document.addEventListener('pointerdown', function (e) {
      var m = document.getElementById('td-lp-menu');
      if (m && !(e.target.closest && e.target.closest('#td-lp-menu'))) closeLpMenu();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (dg) finishDrag(true);
      else if (document.getElementById('td-lp-menu')) closeLpMenu();
    });
  }

  function onHeldIcon(icon, x, y, ptype, pid) {
    if (!icon || !icon.isConnected) return;
    css();
    bindPointer();
    var id = tileId(icon);
    if (!id) return;
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (er) {}
    dg = {
      el: icon, id: id, x0: x, y0: y, x: x, y: y,
      pid: ptype === 'touch' ? null : pid, ptype: ptype,
      lifted: true, dragging: false, timer: 0, rTimer: 0, rKey: '', eTimer: 0, eDir: 0, trash: false
    };
    window.addEventListener('pointermove', onPMove, true);
    window.addEventListener('pointerup', onPUp, true);
    window.addEventListener('pointercancel', onPCancel, true);
    showLpMenu(icon, id);
  }

  function beginDragFrom(id, x, y, ptype, pid) {
    if (!HO.okId(id) || HO.isPinned(id)) return false;
    css();
    bindPointer();
    if (dg) finishDrag(true);
    closeLpMenu();
    window.HEM_ORDNING.addToHome(id, { force: true });
    var el = document.querySelector('#app.is-home .grid .icon[data-tool="' + id + '"], .td-sida[data-sida="extra"] .grid .icon[data-tool="' + id + '"]');
    if (!el) return false;
    var r = el.getBoundingClientRect();
    dg = {
      el: el, id: id, x0: r.left + r.width / 2, y0: r.top + r.height / 2, x: x, y: y,
      pid: ptype === 'touch' ? null : pid, ptype: ptype || 'touch',
      lifted: true, dragging: false, timer: 0, rTimer: 0, rKey: '', eTimer: 0, eDir: 0, trash: false
    };
    window.addEventListener('pointermove', onPMove, true);
    window.addEventListener('pointerup', onPUp, true);
    window.addEventListener('pointercancel', onPCancel, true);
    startDrag();
    placeGhost();
    hitTest();
    return true;
  }

  HO.attach({
    decorate: decorate,
    sync: sync,
    onHeldIcon: onHeldIcon,
    beginDragFrom: beginDragFrom,
    isDragging: function () { return !!(dg && dg.dragging); },
    isBusy: function () { return !!(dg && dg.lifted) || !!document.getElementById('td-lp-menu'); },
    _drag: function () { return dg ? { trash: !!dg.trash, lifted: dg.lifted, dragging: dg.dragging } : null; }
  });
  decorate(document.getElementById('content'));
})();
