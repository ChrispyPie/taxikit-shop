/* Startskärmens lätta kärna: läser lokal layout (per enhet, och per förar-id på Delad enhet),
 * migrerar eventuella äldre mappar/fri-placering till rak sekventiell ordning,
 * håller Väder och Nyheter avstängda som standard tills föraren lägger till dem,
 * och laddar hem-ordning.js först när föraren håller in en ikon eller redigerar. */
(function () {
  'use strict';
  if (window.HEM_ORDNING) return;

  var LS = 'taxi_home_order';
  var SEED = 'taxi_home_order_local';
  var CORE = { installningar: 1, om: 1, admin: 1, sadmin: 1 };
  var PINNED = { moduler: 1 };
  var DEFAULT_OFF = { nyheter: 1, vader: 1 };

  var st = {
    order: null,
    hidden: [],
    sida2: [],
    off: [],
    catalog: [],
    lastTop: [],
    lastLayout: [],
    editing: false,
    loadedDriver: ''
  };
  var editor = null;

  function isCore(id) { return !!CORE[id]; }
  function isPinned(id) { return !!PINNED[id]; }
  function isDefaultOff(id) { return !!DEFAULT_OFF[id]; }
  function okId(id) { return typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id); }
  function isFolderId(id) { return typeof id === 'string' && /^mapp-[a-z0-9]{1,30}$/.test(id); }
  function cleanList(a) {
    if (!Array.isArray(a)) return [];
    var out = [], seen = {};
    for (var i = 0; i < a.length; i++) {
      var id = a[i];
      if (!okId(id) || seen[id]) continue;
      seen[id] = 1;
      out.push(id);
    }
    return out;
  }
  function driverId() { try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; } }
  function isDelad() { try { return localStorage.getItem('taxi_delad_enhet') === '1'; } catch (e) { return false; } }
  function lsKey() { return LS + ':' + (driverId() || 'x'); }
  function seedKey() { return SEED + ':' + (driverId() || 'x'); }
  function isSeeded() { try { return localStorage.getItem(seedKey()) === '1'; } catch (e) { return false; } }
  function markSeeded() { try { localStorage.setItem(seedKey(), '1'); } catch (e) {} }
  function token() { try { return localStorage.getItem('taxi_session') || ''; } catch (e) { return ''; } }
  function optedIn(id) {
    return (Array.isArray(st.order) && st.order.indexOf(id) >= 0) ||
           st.sida2.indexOf(id) >= 0;
  }
  function isOff(id) { return st.off.indexOf(id) >= 0; }

  // Migrerar äldre mappar (folders) och pos.sida2 / pos.ute till rak lista utan mappar.
  function migrateRaw(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var fmap = {};
    if (Array.isArray(raw.folders)) {
      raw.folders.forEach(function (f) {
        if (f && isFolderId(f.id) && Array.isArray(f.items)) {
          fmap[f.id] = cleanList(f.items).filter(function (x) { return !isFolderId(x) && !isPinned(x); });
        }
      });
    }
    function unpack(arr) {
      var out = [], seen = {};
      if (!Array.isArray(arr)) return out;
      arr.forEach(function (id) {
        if (isFolderId(id)) {
          (fmap[id] || []).forEach(function (sub) {
            if (!seen[sub]) { seen[sub] = 1; out.push(sub); }
          });
          return;
        }
        if (okId(id) && !seen[id]) { seen[id] = 1; out.push(id); }
      });
      return out;
    }
    var ids = unpack(raw.ids);
    var p = raw.pos && typeof raw.pos === 'object' ? raw.pos : {};
    var sida2 = unpack(Array.isArray(raw.sida2) ? raw.sida2 : p.sida2).filter(function (x) { return !isPinned(x); });
    var off = cleanList(Array.isArray(raw.off) ? raw.off : p.ute).filter(function (x) { return !isCore(x) && !isPinned(x); });
    var hidden = cleanList(raw.hidden).filter(function (x) { return !isCore(x) && !isPinned(x); });
    // Eventuella mapp-verktyg vars mapp-id saknades i ids läggs in före moduler
    Object.keys(fmap).forEach(function (fid) {
      fmap[fid].forEach(function (sub) {
        if (ids.indexOf(sub) < 0 && sida2.indexOf(sub) < 0 && hidden.indexOf(sub) < 0 && off.indexOf(sub) < 0) {
          var mi = ids.indexOf('moduler');
          if (mi >= 0) ids.splice(mi, 0, sub); else ids.push(sub);
        }
      });
    });
    var changed = !!(Array.isArray(raw.folders) && raw.folders.length) || !!raw.pos;
    return { ids: ids, hidden: hidden, sida2: sida2, off: off, migrated: changed };
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(lsKey());
      if (!raw) return null;
      return migrateRaw(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function writeLocal() {
    try {
      localStorage.setItem(lsKey(), JSON.stringify({
        ids: st.order ? st.order.slice() : [],
        hidden: st.hidden.slice(),
        sida2: st.sida2.slice(),
        off: st.off.slice()
      }));
      markSeeded();
    } catch (e) {}
  }

  function applyClean(res) {
    if (!res) return;
    st.order = res.ids && res.ids.length ? res.ids : null;
    st.hidden = res.hidden || [];
    st.sida2 = res.sida2 || [];
    st.off = res.off || [];
  }

  function load() {
    st.loadedDriver = driverId();
    var local = readLocal();
    if (local) {
      applyClean(local);
      if (local.migrated) writeLocal();
      markSeeded();
      return;
    }
    st.order = null; st.hidden = []; st.sida2 = []; st.off = [];
    // Delad enhet: hämta aldrig gemensam serverlayout – varje förare får sin egen lokala layout på enheten.
    if (isDelad() || isSeeded() || !token()) { markSeeded(); return; }
    var apiUrl = (typeof TRIP_API_URL !== 'undefined' && TRIP_API_URL) || '';
    var apiKey = (typeof TRIP_API_KEY !== 'undefined' && TRIP_API_KEY) || '';
    if (!apiUrl || !apiKey || typeof fetch !== 'function') { markSeeded(); return; }
    fetch(apiUrl + '/rest/v1/rpc/home_tool_order_get', {
      method: 'POST',
      headers: { apikey: apiKey, Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token() })
    }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
      if (isSeeded() || readLocal() || !txt) { markSeeded(); return; }
      var r = null; try { r = JSON.parse(txt); } catch (e) {}
      if (!r) { markSeeded(); return; }
      var mig = migrateRaw(r);
      if (!mig || (!mig.ids.length && !mig.hidden.length && !mig.sida2.length && !mig.off.length)) {
        markSeeded();
        return;
      }
      applyClean(mig);
      writeLocal();
      var onHome = !!(document.querySelector('#app.is-home .grid .icon') && !document.querySelector('.vd, .td-hjalp-panel.open'));
      if (onHome && !st.editing && typeof window.renderMenu === 'function') window.renderMenu();
    }).catch(function () { markSeeded(); });
  }

  function ICO_MODULER() {
    return '<svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M5 11.5h8V7c0-1.7 1.3-3 3-3s3 1.3 3 3v4.5h8c1.5 0 2.5 1.2 2.5 2.6s-1 2.6-2.5 2.6H19v3.2c0 2-1.6 3.6-3.6 3.6h-.3V28c0 1.7-1.3 3-3 3s-3-1.3-3-3v-4.5h-.3c-2 0-3.6-1.6-3.6-3.6v-3.2H5c-1.5 0-2.5-1.2-2.5-2.6S3.5 11.5 5 11.5z"/>' +
      '<path d="M16 13.2v6.2M12.9 16.3h6.2"/>' +
      '</svg>';
  }
  function arrange(visible) {
    if (driverId() !== st.loadedDriver) load();
    var list = Array.isArray(visible) ? visible.slice() : [];
    var byId = {};
    list.forEach(function (x) { if (x && x.id) byId[x.id] = x; });
    var active = list.filter(function (x) {
      if (!x || !x.id) return false;
      if (isCore(x.id) || isPinned(x.id)) return true;
      if (st.hidden.indexOf(x.id) >= 0) return false;
      if (isOff(x.id)) return false;
      if (isDefaultOff(x.id) && !optedIn(x.id)) return false;
      return true;
    });
    if (!byId.moduler) {
      var modItem = { id: 'moduler', icon: ICO_MODULER(), label: 'Moduler' };
      byId.moduler = modItem;
      active.push(modItem);
    }
    var activeIds = active.map(function (x) { return x.id; });
    var seq = [];
    if (Array.isArray(st.order) && st.order.length) {
      st.order.forEach(function (id) {
        if (activeIds.indexOf(id) >= 0 && seq.indexOf(id) < 0) seq.push(id);
      });
    }
    activeIds.forEach(function (id) {
      if (seq.indexOf(id) < 0) seq.push(id);
    });
    // Moduler stannar alltid på hemskärmen; om den inte finns i sparad ordning läggs den sist.
    if (byId.moduler && seq.indexOf('moduler') < 0) seq.push('moduler');
    st.lastTop = seq.slice();
    st.lastLayout = seq.map(function (id) { return { type: 'tool', id: id }; });
    return seq.map(function (id) { return byId[id]; }).filter(Boolean);
  }

  function ensureInOrder(id) {
    var base = st.order ? st.order.slice() : st.lastTop.slice();
    if (base.indexOf(id) < 0) {
      var mi = base.indexOf('moduler');
      if (mi >= 0) base.splice(mi, 0, id); else base.push(id);
    }
    st.order = base;
  }

  function rerender() {
    if (typeof window.renderMenu === 'function') window.renderMenu();
  }

  function install(id) {
    if (!okId(id)) return;
    st.hidden = st.hidden.filter(function (x) { return x !== id; });
    st.off = st.off.filter(function (x) { return x !== id; });
    ensureInOrder(id);
    writeLocal();
    rerender();
  }

  function uninstall(id) {
    if (isCore(id) || isPinned(id)) return;
    if (st.hidden.indexOf(id) < 0) st.hidden.push(id);
    st.off = st.off.filter(function (x) { return x !== id; });
    st.sida2 = st.sida2.filter(function (x) { return x !== id; });
    if (st.order) st.order = st.order.filter(function (x) { return x !== id; });
    writeLocal();
    rerender();
  }

  function addToHome(id, opts) {
    if (!okId(id) || isPinned(id)) return false;
    var onHomeNow = !isOff(id) && st.hidden.indexOf(id) < 0 && (!isDefaultOff(id) || optedIn(id));
    if (onHomeNow && (!opts || !opts.force)) return false;
    st.hidden = st.hidden.filter(function (x) { return x !== id; });
    st.off = st.off.filter(function (x) { return x !== id; });
    ensureInOrder(id);
    writeLocal();
    rerender();
    return true;
  }

  function removeShortcut(id) {
    if (isCore(id) || isPinned(id)) return;
    if (st.off.indexOf(id) < 0) st.off.push(id);
    st.sida2 = st.sida2.filter(function (x) { return x !== id; });
    writeLocal();
    rerender();
  }

  function openModuler(focusId) {
    try { if (focusId) sessionStorage.setItem('td_moduler_focus', focusId); } catch (e) {}
    if (typeof window.openItem === 'function') window.openItem('moduler');
  }

  function decorate(content) {
    if (!content) return;
    var grid = content.querySelector && content.querySelector('.grid');
    if (!grid) return;
    // Flytta ikoner som hör till Sida 2 dit direkt i följd
    var eg = window.HEM_SIDOR && HEM_SIDOR.extraGrid ? HEM_SIDOR.extraGrid(true) : null;
    if (eg) {
      while (eg.firstChild) eg.removeChild(eg.firstChild);
      var ex = st.sida2;
      Array.prototype.slice.call(grid.querySelectorAll('.icon[data-tool]')).forEach(function (n) {
        var id = n.getAttribute('data-tool');
        if (ex.indexOf(id) >= 0 && !isPinned(id)) eg.appendChild(n);
      });
    }
    if (editor && editor.decorate) { editor.decorate(content); return; }
    // Ladda hem-ordning.js först när användaren håller in en ikon på hemskärmen
    bindLazyTrigger();
  }

  var triggerBound = false;
  function loadEditor() {
    if (editor) return Promise.resolve(editor);
    if (window.LAZY && LAZY.ensure) return LAZY.ensure('hem-ordning').then(function () { return editor; });
    return Promise.reject(new Error('no_lazy'));
  }
  function bindLazyTrigger() {
    if (triggerBound || typeof document === 'undefined' || !document.addEventListener) return;
    triggerBound = true;
    document.addEventListener('pointerdown', function (e) {
      if (editor) return;
      var icon = e.target && e.target.closest && e.target.closest('#app.is-home .grid .icon[data-tool], .td-sida[data-sida="extra"] .grid .icon[data-tool]');
      if (!icon) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var sx = e.clientX, sy = e.clientY, pid = e.pointerId, ptype = e.pointerType;
      var cancelled = false;
      var hold = setTimeout(function () {
        cleanup();
        if (cancelled) return;
        loadEditor().then(function (ed) {
          if (ed && ed.onHeldIcon) ed.onHeldIcon(icon, sx, sy, ptype, pid);
        }).catch(function () {});
      }, 650);
      // Förladda mjukt efter 180 ms om fingret fortfarande hålls ner
      var prefetch = setTimeout(function () { if (!cancelled) loadEditor().catch(function () {}); }, 180);
      function onMove(ev) {
        if (ev.pointerId !== pid) return;
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) { cancelled = true; cleanup(); }
      }
      function onUp(ev) { if (ev.pointerId === pid) { cancelled = true; cleanup(); } }
      function cleanup() {
        clearTimeout(hold); clearTimeout(prefetch);
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
      }
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    });
  }

  function sync(onHome) {
    var app = document.getElementById('app');
    if (app) app.classList.toggle('is-home', !!onHome);
    if (!onHome) st.editing = false;
    if (editor && editor.sync) editor.sync(!!onHome);
    if (window.HEM_SIDOR && HEM_SIDOR.sync) HEM_SIDOR.sync(!!onHome);
  }

  window.__HO = {
    st: st,
    isCore: isCore,
    isPinned: isPinned,
    isDefaultOff: isDefaultOff,
    okId: okId,
    cleanList: cleanList,
    writeLocal: writeLocal,
    rerender: rerender,
    attach: function (ed) { editor = ed; }
  };

  window.HEM_ORDNING = {
    arrange: arrange,
    decorate: decorate,
    load: load,
    sync: sync,
    setCatalog: function (items) { st.catalog = Array.isArray(items) ? items.slice() : []; },
    isEditing: function () { return !!st.editing; },
    isDragging: function () { return !!(editor && editor.isDragging && editor.isDragging()); },
    isCore: isCore,
    isPinned: isPinned,
    isDefaultOff: isDefaultOff,
    isInstalled: function (id) {
      if (isCore(id) || isPinned(id)) return true;
      if (st.hidden.indexOf(id) >= 0) return false;
      if (isDefaultOff(id) && !optedIn(id)) return false;
      return true;
    },
    order: function () { return st.order ? st.order.slice() : null; },
    hidden: function () { return st.hidden.slice(); },
    extraIds: function () { return st.sida2.slice(); },
    layout: function () { return JSON.parse(JSON.stringify(st.lastLayout)); },
    catalog: function () { return st.catalog.slice(); },
    install: install,
    uninstall: uninstall,
    addToHome: addToHome,
    removeShortcut: removeShortcut,
    openModuler: openModuler,
    beginDragFrom: function (id, x, y, ptype, pid) {
      if (editor && editor.beginDragFrom) return editor.beginDragFrom(id, x, y, ptype, pid);
      loadEditor().then(function (ed) {
        if (ed && ed.beginDragFrom) ed.beginDragFrom(id, x, y, ptype, pid);
      }).catch(function () {});
      return true;
    },
    isBusy: function () { return !!(editor && editor.isBusy && editor.isBusy()); },
    _drag: function () { return editor && editor._drag ? editor._drag() : null; },
    LIFT_MS: 650,
    preview: function (ids, hid, _folders, p) {
      var raw = { ids: ids, hidden: hid || [], pos: p || {} };
      var mig = migrateRaw(raw);
      applyClean(mig);
      writeLocal();
    },
    persist: writeLocal,
    isLocal: isSeeded
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
