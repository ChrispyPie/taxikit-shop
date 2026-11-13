/* Hemskärm: ordna, dölja, lägga till verktyg och samla dem i mappar. Sparat per förare på servern,
 * med localStorage som reserv. Ångra: se docs/hem-ordning/UNDO.md, docs/hem-mappar/UNDO.md och docs/hem-moduler/UNDO.md.
 * DEFAULT_OFF-verktyg (t.ex. Nyheter) ligger inte på startskärmen förrän föraren installerar dem.
 * 2026-11-12: skiftnyckeln är borttagen. Håll in en ikon (~1 s) för meny och dra, som på Android.
 * Släpp en ikon på en annan för att göra en mapp.
 * Moduler är en vanlig ikon på startskärmen: den kan flyttas, men den får inte ligga i en mapp,
 * avinstalleras eller döljas. Saknas den lägger normalize tillbaka den sist. */
(function () {
  'use strict';
  if (window.HEM_ORDNING) return;

  var LS = 'taxi_home_order';
  var CORE = { installningar: 1, om: 1, admin: 1, sadmin: 1 };
  var PINNED = { moduler: 1 }; // alltid en egen ruta på startskärmen, aldrig i mapp
  var DEFAULT_OFF = { nyheter: 1 }; // nya tillval: visas inte förrän föraren installerar
  var LIFT_MS = 900;        // håll in så länge innan ikonen lyfts (nära en sekund)
  var SLOP = 10;            // px rörelse före lyft = scroll, ingen dragning
  var FOLDER_DWELL = 240;   // ms över en ikon innan den visas som mapp-mål
  var LEAVE_DWELL = 220;
  var REORDER_DWELL = 170;  // ms stilla innan de andra ikonerna flyttar sig    // ms utanför öppen mapp innan den stängs och ikonen kommer ut på startskärmen
  var MAX_FOLDERS = 20;
  var NAME_MAX = 24;
  var DEFAULT_NAME = 'Mapp';
  var editing = false;
  var order = null;   // string[] (verktyg och mapp-id) eller null = standard
  var hidden = [];    // ids the driver has removed; empty hidden = alla vanliga verktyg är installerade
  var folders = [];   // [{id, name, items}]
  var catalog = [];   // {id, icon, label} the driver can see
  var lastTop = [];   // startskärmens översta nivå från senaste arrange
  var lastLayout = [];

  function isCore(id) { return !!CORE[id]; }
  function isPinned(id) { return !!PINNED[id]; }
  function isDefaultOff(id) { return !!DEFAULT_OFF[id]; }
  function inFolders(id) { return folders.some(function (f) { return f.items.indexOf(id) >= 0; }); }
  function optedIn(id) { return !!((order && M.expand(order, folders).indexOf(id) >= 0) || inFolders(id)); }
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
  /* ---------- Layoutmodell (rena funktioner, testas i tests/hem-mappar) ----------
   * top: verktygs-id och mapp-id i den ordning de ligger på startskärmen.
   * folders: [{ id: 'mapp-xxx', name: 'Mapp', items: [verktygs-id, ...] }]
   * En mapp med färre än två verktyg löses upp; kvarvarande verktyg tar mappens plats. Mappar i mappar finns inte. */
  var M = (function () {
    function isFolderId(id) { return typeof id === 'string' && /^mapp-[a-z0-9]{1,30}$/.test(id); }
    function cleanName(n) {
      n = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
      return n.slice(0, NAME_MAX).trim();
    }
    function cleanFolders(a) {
      if (!Array.isArray(a)) return [];
      var out = [], seenF = {}, seenT = {};
      a.forEach(function (f) {
        if (!f || typeof f !== 'object' || !isFolderId(f.id) || seenF[f.id] || out.length >= MAX_FOLDERS) return;
        var items = cleanList(f.items).filter(function (id) { return !isFolderId(id) && !isPinned(id) && !seenT[id]; });
        items.forEach(function (id) { seenT[id] = 1; });
        seenF[f.id] = 1;
        out.push({ id: f.id, name: cleanName(f.name), items: items });
      });
      return out;
    }
    function copy(fs) { return cleanFolders(fs).map(function (f) { return { id: f.id, name: f.name, items: f.items.slice() }; }); }
    function find(fs, id) { for (var i = 0; i < fs.length; i++) if (fs[i].id === id) return fs[i]; return null; }
    function folderOf(fs, tool) { for (var i = 0; i < fs.length; i++) if (fs[i].items.indexOf(tool) >= 0) return fs[i]; return null; }
    function normalize(top, fs) {
      fs = copy(fs);
      fs.forEach(function (f) { f.items = f.items.filter(function (i) { return !isPinned(i); }); });
      top = cleanList(top);
      var keep = {}, inF = {}, out = [];
      fs.forEach(function (f) { if (f.items.length >= 2) { keep[f.id] = 1; f.items.forEach(function (i) { inF[i] = f.id; }); } });
      top.forEach(function (id) {
        if (isFolderId(id)) {
          if (keep[id]) { if (out.indexOf(id) < 0) out.push(id); return; }
          var f = find(fs, id);
          if (f) f.items.forEach(function (i) { if (out.indexOf(i) < 0) out.push(i); });
          return;
        }
        if (inF[id]) {
          // verktyg som ligger i en mapp: mappen tar dess plats om mappen inte redan står i listan
          var fid = inF[id];
          if (top.indexOf(fid) < 0 && out.indexOf(fid) < 0) out.push(fid);
          return;
        }
        if (out.indexOf(id) >= 0) return;
        out.push(id);
      });
      if (out.indexOf('moduler') < 0) out.push('moduler');
      return { top: out, folders: fs.filter(function (f) { return keep[f.id]; }) };
    }
    function without(top, fs, id) {
      fs = copy(fs);
      fs.forEach(function (f) { f.items = f.items.filter(function (x) { return x !== id; }); });
      return { top: cleanList(top).filter(function (x) { return x !== id; }), folders: fs };
    }
    /* Lägg id på startskärmen enligt newTop (hela ordningen, med id på sin nya plats). */
    function placeTop(top, fs, id, newTop) {
      if (isFolderId(id)) return normalize(newTop, fs);
      return normalize(newTop, without(top, fs, id).folders);
    }
    function createFolder(top, fs, dragId, targetId, newId, name) {
      if (isFolderId(targetId)) return addToFolder(top, fs, dragId, targetId);
      if (isPinned(dragId) || isPinned(targetId)) {
        var p = without(top, fs, dragId), t = p.top.slice(), i = t.indexOf(targetId);
        if (i < 0) t.push(dragId); else t.splice(i + 1, 0, dragId);
        return normalize(t, p.folders);
      }
      if (isFolderId(dragId) || dragId === targetId || !isFolderId(newId) || find(fs, newId)) return normalize(top, fs);
      if (cleanList(top).indexOf(targetId) < 0) return normalize(top, fs);
      var s = without(top, fs, dragId);
      s.top = s.top.map(function (x) { return x === targetId ? newId : x; });
      s.folders.push({ id: newId, name: cleanName(name) || DEFAULT_NAME, items: [targetId, dragId] });
      return normalize(s.top, s.folders);
    }
    function addToFolder(top, fs, id, folderId, index) {
      if (isPinned(id) || isFolderId(id) || !find(fs, folderId)) return normalize(top, fs);
      var s = without(top, fs, id), f = find(s.folders, folderId);
      var at = typeof index === 'number' ? Math.max(0, Math.min(index, f.items.length)) : f.items.length;
      f.items.splice(at, 0, id);
      return normalize(s.top, s.folders);
    }
    function removeFromFolder(top, fs, id, index) {
      var f = folderOf(fs, id);
      if (!f) return normalize(top, fs);
      var s = without(top, fs, id), fi = s.top.indexOf(f.id);
      var at = typeof index === 'number' ? Math.max(0, Math.min(index, s.top.length)) : (fi >= 0 ? fi + 1 : s.top.length);
      s.top.splice(at, 0, id);
      return normalize(s.top, s.folders);
    }
    function reorderInFolder(top, fs, folderId, items) {
      fs = copy(fs);
      var f = find(fs, folderId);
      if (!f) return normalize(top, fs);
      var want = cleanList(items).filter(function (x) { return f.items.indexOf(x) >= 0; });
      f.items.forEach(function (x) { if (want.indexOf(x) < 0) want.push(x); });
      f.items = want;
      return normalize(top, fs);
    }
    function unpackFolder(top, fs, folderId) {
      fs = copy(fs);
      var f = find(fs, folderId);
      if (!f) return normalize(top, fs);
      var t = cleanList(top), i = t.indexOf(folderId);
      if (i < 0) t = t.concat(f.items); else t.splice.apply(t, [i, 1].concat(f.items));
      return normalize(t, fs.filter(function (x) { return x.id !== folderId; }));
    }
    function renameFolder(fs, folderId, name) {
      fs = copy(fs);
      var f = find(fs, folderId);
      if (f) f.name = cleanName(name) || DEFAULT_NAME;
      return fs;
    }
    function removeTool(top, fs, id) {
      if (isPinned(id)) return normalize(top, fs);
      var s = without(top, fs, id);
      return normalize(s.top, s.folders);
    }
    function expand(top, fs) {
      var out = [];
      cleanList(top).forEach(function (id) {
        if (isFolderId(id)) { var f = find(fs, id); if (f) f.items.forEach(function (i) { out.push(i); }); }
        else out.push(id);
      });
      return cleanList(out);
    }
    /* flat: synliga verktyg i ordning -> [{type:'tool',id} | {type:'folder',id,name,items}] */
    function group(flat, fs) {
      var inF = {}, done = {}, out = [];
      fs.forEach(function (f) { f.items.forEach(function (i) { inF[i] = f; }); });
      flat.forEach(function (id) {
        var f = inF[id];
        if (!f) { out.push({ type: 'tool', id: id }); return; }
        if (done[f.id]) return;
        done[f.id] = 1;
        var vis = f.items.filter(function (i) { return flat.indexOf(i) >= 0; });
        if (vis.length >= 2) out.push({ type: 'folder', id: f.id, name: f.name || DEFAULT_NAME, items: vis });
        else vis.forEach(function (i) { out.push({ type: 'tool', id: i }); });
      });
      return out;
    }
    return { isFolderId: isFolderId, cleanName: cleanName, cleanFolders: cleanFolders, normalize: normalize, placeTop: placeTop,
      createFolder: createFolder, addToFolder: addToFolder, removeFromFolder: removeFromFolder, reorderInFolder: reorderInFolder,
      unpackFolder: unpackFolder, renameFolder: renameFolder, removeTool: removeTool, expand: expand, group: group, find: find, folderOf: folderOf, isPinned: isPinned };
  })();

  function readLocal() {
    try {
      var raw = localStorage.getItem(lsKey());
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (Array.isArray(v)) return { ids: cleanList(v), hidden: [], folders: [] };
      if (v && typeof v === 'object') {
        return {
          ids: cleanList(v.ids),
          hidden: cleanList(v.hidden).filter(function (id) { return !isCore(id) && !isPinned(id); }),
          folders: M.cleanFolders(v.folders).filter(function (f) { return f.items.length >= 2; })
        };
      }
    } catch (e) {}
    return null;
  }
  function writeLocal() {
    try {
      if ((!order || !order.length) && !hidden.length && !folders.length) localStorage.removeItem(lsKey());
      else {
        var v = { ids: order || [], hidden: hidden || [] };
        if (folders.length) v.folders = folders;
        localStorage.setItem(lsKey(), JSON.stringify(v));
      }
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

  function setState(ids, hid, fs) {
    if (fs !== undefined) folders = M.cleanFolders(fs).filter(function (f) { return f.items.length >= 2; });
    order = ids && ids.length ? cleanList(ids) : null;
    hidden = cleanList(hid).filter(function (id) { return !isCore(id) && !isPinned(id); });
    folders.forEach(function (f) { f.items = f.items.filter(function (x) { return (hidden.indexOf(x) < 0 || isCore(x)) && !isPinned(x); }); });
    var n = M.normalize(order || [], folders);
    folders = n.folders;
    if (order) order = n.top;
    writeLocal();
  }

  function arrange(visible) {
    var shown = visible.filter(function (x) {
      if (isPinned(x.id) || isCore(x.id)) return true;
      if (hidden.indexOf(x.id) >= 0) return false;
      if (isDefaultOff(x.id) && !optedIn(x.id)) return false;
      return true;
    }).filter(function (x) { return !isPinned(x.id); });
    shown.push({ id: 'moduler', icon: ICO_MODULER(), label: 'Moduler' });
    var def = shown.map(function (x) { return x.id; });
    var saved = M.expand(order || [], folders).filter(function (id) { return def.indexOf(id) >= 0; });
    var flat;
    if (!saved.length) flat = def.slice();
    else {
      var unseen = def.filter(function (id) { return saved.indexOf(id) < 0; });
      flat = saved.slice();
      unseen.forEach(function (id) {
        var di = def.indexOf(id), placed = false, i, j;
        for (i = di - 1; i >= 0; i--) {
          j = flat.indexOf(def[i]);
          if (j >= 0) { flat.splice(j + 1, 0, id); placed = true; break; }
        }
        if (!placed) flat.unshift(id);
      });
    }
    lastLayout = M.group(flat, folders);
    lastTop = lastLayout.map(function (e) { return e.id; });
    var ordered = [];
    lastLayout.forEach(function (e) { if (e.type === 'folder') ordered = ordered.concat(e.items); else ordered.push(e.id); });
    return ordered.map(function (id) { return shown.filter(function (v) { return v.id === id; })[0]; }).filter(Boolean);
  }

  function currentTop() { return lastTop.slice(); }

  function saveServer() {
    var base = { p_token: token(), p_ids: order || [], p_hidden: hidden || [] };
    var withF = { p_token: base.p_token, p_ids: base.p_ids, p_hidden: base.p_hidden, p_folders: folders };
    // 4-arg (med mappar) finns efter migration 20261112b. Saknas den faller vi tillbaka på 3-arg; mapparna finns då kvar i localStorage.
    return rpc('home_tool_order_set', withF).then(function (r) {
      if (r == null && token() && !isDemo()) return rpc('home_tool_order_set', base);
      return r;
    });
  }
  function apply(res) {
    order = res.top && res.top.length ? res.top.slice() : null;
    folders = res.folders || [];
  }
  function persist(ids) {
    if (ids) order = cleanList(ids);
    writeLocal();
    saveServer();
  }
  function rerender() {
    if (typeof renderMenu === 'function') renderMenu();
    else decorate(document.getElementById('content'));
  }

  function ICO_MODULER() {
    return '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M5 11.5h8V7c0-1.7 1.3-3 3-3s3 1.3 3 3v4.5h8c1.5 0 2.5 1.2 2.5 2.6s-1 2.6-2.5 2.6H19v3.2c0 2-1.6 3.6-3.6 3.6h-.3V28c0 1.7-1.3 3-3 3s-3-1.3-3-3v-4.5h-.3c-2 0-3.6-1.6-3.6-3.6v-3.2H5c-1.5 0-2.5-1.2-2.5-2.6S3.5 11.5 5 11.5z"/>' +
      '<path d="M16 13.2v6.2M12.9 16.3h6.2"/>' +
      '</svg>';
  }

  function css() {
    if (document.getElementById('td-ordna-css')) return;
    var s = document.createElement('style');
    s.id = 'td-ordna-css';
    s.textContent =
      '#app.is-home #content{padding:4px 10px 20px}' +
      '.td-grid-wrap{position:relative}' +
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
      '.grid.td-ordna .icon[data-tool],.grid.td-ordna .td-folder,.td-ordna-on .td-mapp-grid .icon{cursor:grab;position:relative;user-select:none;-webkit-user-select:none;touch-action:none}' +
      '.td-handle{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:6px;display:none!important;' +
      'align-items:center;justify-content:center;font-size:13px;line-height:1;color:var(--text-soft,#94a3b8);pointer-events:none;overflow:hidden}' +
      '.grid.td-ordna .icon[data-tool] .td-handle{display:flex!important}' +
      '.td-remove{position:absolute;top:-4px;right:-4px;width:28px;height:28px;min-width:28px;min-height:28px;padding:0;margin:0;' +
      'border:0;border-radius:50%;background:var(--danger,#e53e3e);color:#fff;font:700 16px/1 system-ui,sans-serif;' +
      'display:none;align-items:center;justify-content:center;cursor:pointer;z-index:2;-webkit-tap-highlight-color:transparent}' +
      '.grid.td-ordna .icon[data-tool] .td-remove{display:inline-flex}' +
      '.icon[data-tool="moduler"] .emoji{color:var(--text,#e2e8f0)}' +
      '.icon[data-tool="moduler"] .emoji svg{width:30px;height:30px;display:block;margin:0 auto}' +
      'html[data-home="lista"] .icon[data-tool="moduler"] .emoji svg{width:24px;height:24px}' +
      '@keyframes td-wiggle{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg)}}' +
      '.grid.td-ordna .icon[data-tool]:not(.td-dragging){animation:td-wiggle .45s ease-in-out infinite}' +
      '.grid.td-ordna .td-folder:not(.td-ph){animation:td-wiggle .45s ease-in-out infinite}' +
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
      '.td-add-empty{margin:0;font-size:calc(14px * var(--font-scale,1));color:var(--text-soft,#718096);line-height:1.35}' +
      '.td-lp-menu{position:fixed;z-index:140;min-width:12.5em;max-width:min(17em,calc(100vw - 16px));padding:6px 6px 4px;margin:0;' +
      'background:var(--surface,#fff);color:var(--text,#1a202c);border:1px solid var(--border,#cbd5e0);border-radius:18px;' +
      'box-shadow:0 10px 28px rgba(0,0,0,.22);transform-origin:50% 100%;animation:td-lp-in .16s ease-out}' +
      '@keyframes td-lp-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}' +
      '.td-lp-top{display:flex;justify-content:center;gap:10px;padding:6px 8px 8px;border-bottom:1px solid var(--border-soft,rgba(127,127,127,.22));margin-bottom:2px}' +
      '.td-lp-ico{appearance:none;border:0;background:none;color:inherit;padding:4px 8px;min-width:64px;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;border-radius:12px;font:600 11px/1.1 inherit;-webkit-tap-highlight-color:transparent}' +
      '.td-lp-ico svg{width:22px;height:22px;display:block}' +
      '.td-lp-ico.td-lp-off{color:var(--danger,#e53e3e)}' +
      '.td-lp-ico:active{background:rgba(127,127,127,.14)}' +
      '.td-lp-list button{appearance:none;display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:none;color:inherit;' +
      'font:inherit;font-size:calc(15px * min(var(--font-scale,1),1.15));padding:8px 10px;min-height:44px;border-radius:12px;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent}' +
      '.td-lp-list button svg{width:18px;height:18px;flex:0 0 auto;color:var(--text-soft,#718096)}' +
      '.td-lp-list button:active{background:rgba(127,127,127,.16)}' +
      '.grid.td-ordna .icon.td-picked{outline:2px solid var(--primary,#2b6cb0);outline-offset:2px;border-radius:10px}' +
      /* Håll in och dra (Android-likt) */
      '#app.is-home .grid .icon,.td-mapp-grid .icon{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
      '.icon.td-lifted .emoji{transform:scale(1.16);filter:drop-shadow(0 6px 10px rgba(0,0,0,.5));transition:transform .14s ease-out}' +
      '.icon.td-ph{opacity:0!important;animation:none!important}' +
      '.td-ghost{position:fixed!important;z-index:160;pointer-events:none;margin:0!important;animation:none!important;' +
      'transform:scale(1.12);transform-origin:50% 40%;opacity:.96;transition:opacity .12s}' +
      '.td-ghost .emoji{filter:drop-shadow(0 8px 12px rgba(0,0,0,.55))}' +
      '.td-ghost .td-remove,.td-ghost .td-handle{display:none!important}' +
      '.td-ghost.td-ghost-off{opacity:.45}' +
      'body.td-drag-on .grid .icon{animation:none!important}' +
      'body.td-drag-on,body.td-drag-on *{cursor:grabbing!important}' +
      '.icon.td-drop-target .emoji{transform:scale(1.14);transition:transform .14s ease-out;border-radius:14px;' +
      'background:rgba(148,163,184,.22);box-shadow:0 0 0 7px rgba(148,163,184,.22)}' +
      '.td-folder.td-drop-target .td-folder-ico{transform:scale(1.16);background:rgba(148,163,184,.3);box-shadow:none}' +
      /* Mappikonen: genomskinlig ruta med de fyra första ikonerna, som på Android */
      '.icon.td-folder .td-folder-ico{width:42px;height:42px;margin:-6px 0 -2px;padding:4px;box-sizing:border-box;border-radius:14px;' +
      'display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:1px;place-items:center;font-size:15px;line-height:1;' +
      'background:rgba(148,163,184,.16);box-shadow:inset 0 0 0 1px rgba(148,163,184,.26);' +
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:transform .14s ease-out}' +
      '.icon.td-folder .td-folder-ico.td-fn-2{grid-template-rows:1fr;font-size:16px}' +
      '.td-folder-ico .td-fmini{display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden}' +
      '.td-folder-ico .td-fmini img,.td-folder-ico .td-fmini svg{width:15px;height:15px}' +
      '.icon.td-folder.td-open .td-folder-ico{opacity:.35}' +
      'html[data-home="lista"] .icon.td-folder .td-folder-ico{width:32px;height:32px;margin:0 11px 0 -1px;padding:2px;border-radius:9px;font-size:11px}' +
      'html[data-home="lista"] .td-folder-ico .td-fmini img,html[data-home="lista"] .td-folder-ico .td-fmini svg{width:11px;height:11px}' +
      /* Öppen mapp */
      '.td-mapp{position:fixed;inset:0;z-index:130}' +
      '.td-mapp-scrim{position:absolute;inset:0;background:rgba(0,0,0,.45);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}' +
      '.td-mapp-box{position:absolute;left:50%;width:min(340px,calc(100vw - 28px));transform:translateX(-50%);box-sizing:border-box;' +
      'background:var(--surface,#1a2430);color:var(--text,#e2e8f0);border:1px solid var(--border-soft,rgba(127,127,127,.25));' +
      'border-radius:24px;padding:8px 10px 10px;box-shadow:0 18px 44px rgba(0,0,0,.45);animation:td-mapp-in .18s ease-out}' +
      '@keyframes td-mapp-in{from{opacity:0;transform:translateX(-50%) scale(.9)}to{opacity:1;transform:translateX(-50%) scale(1)}}' +
      '.td-mapp-namn{display:block;margin:0 auto 4px;appearance:none;border:0;background:none;box-shadow:none;color:inherit;' +
      'font:700 calc(16px * min(var(--font-scale,1),1.2))/1.2 inherit;padding:10px 14px;min-height:44px;max-width:100%;border-radius:12px;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:text;-webkit-tap-highlight-color:transparent}' +
      '.td-mapp-namn:active{background:rgba(127,127,127,.16)}' +
      '.td-mapp-input{display:block;width:100%;box-sizing:border-box;margin:0 0 4px;min-height:44px;padding:8px 10px;text-align:center;' +
      'font:700 16px/1.2 inherit;color:var(--text,#e2e8f0);background:var(--surface-soft,#222e3b);border:1px solid var(--accent,#3182ce);border-radius:12px;outline:none}' +
      '.td-mapp .td-mapp-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 4px;max-height:min(60vh,420px);overflow:auto;max-width:none}' +
      'html[data-home="lista"] .td-mapp .td-mapp-grid{grid-template-columns:1fr;gap:2px}' +
      'html[data-home="2"] .td-mapp .td-mapp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}' +
      '.td-mapp-tips{margin:6px 4px 0;font-size:calc(12px * min(var(--font-scale,1),1.2));line-height:1.3;color:var(--text-soft,#94a3b8);text-align:center}' +
      '.td-lp-menu .td-lp-top button.td-lp-ico.td-lp-unpack{color:inherit}' +
      '@media (prefers-reduced-motion:reduce){.td-mapp-box{animation:none}.icon.td-lifted .emoji,.icon.td-drop-target .emoji{transition:none}}' +
      '@media (prefers-reduced-motion:reduce){.td-lp-menu{animation:none}}';
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
    // Skiftnyckeln är borttagen 2026-11-12 (låg för nära översta högra ikonen). Ordningsläget nås via Flytta i håll-in-menyn.
    var old = wrap.querySelector('.td-wrench');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var banner = content.querySelector('.td-andringslage');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'td-andringslage';
      banner.innerHTML =
        '<span class="td-andrings-text">Ändringsläge – dra för att flytta, släpp på en ikon för att göra en mapp</span>' +
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
      document.body.classList.remove('td-ordna-on');
      closeAdd();
      closeFolder();
      return;
    }
    var grid = content && content.querySelector('.grid');
    if (grid) ensureGridWrap(content, grid);
    document.body.classList.toggle('td-is-ordna', editing);
    document.body.classList.toggle('td-ordna-on', editing);
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
      persist();
      rerender();
    } else if (act === 'reset') {
      if (folders.length && typeof window.confirm === 'function' &&
          !window.confirm('Återställ startskärmen? Mapparna tas bort och ikonerna läggs tillbaka i standardordning.')) return;
      folders = [];
      setState(null, []);
      rpc('home_tool_order_set', { p_token: token(), p_ids: [], p_hidden: [], p_folders: [] }).then(function (r) {
        if (r == null && token() && !isDemo()) rpc('home_tool_order_set', { p_token: token(), p_ids: [], p_hidden: [] });
      });
      editing = false;
      rerender();
    } else if (act === 'add') {
      openModuler();
    }
  }

  function dropOldSlot(grid) {
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll('.td-slot-empty'), function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }

  function closeAdd() { closeLpMenu(); }

  function openModuler(focusId) {
    closeLpMenu();
    closeFolder();
    if (window.MODULER && window.MODULER.setFocus) window.MODULER.setFocus(focusId || '');
    if (typeof window.openItem === 'function') window.openItem('moduler');
  }

  function homeGrid() { return document.querySelector('#app.is-home .grid'); }
  function tileId(el) { return el ? (el.getAttribute('data-tool') || el.getAttribute('data-folder') || '') : ''; }
  function gridTiles(grid) {
    if (!grid) return [];
    return Array.prototype.filter.call(grid.children, function (n) {
      return n.classList && n.classList.contains('icon') && (n.hasAttribute('data-tool') || n.hasAttribute('data-folder'));
    });
  }
  function topIdsFromDom(grid) { return gridTiles(grid).map(tileId).filter(Boolean); }
  function newFolderId() {
    var id;
    do { id = 'mapp-' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
    while (M.find(folders, id));
    return id;
  }
  function animOff() {
    try { if (localStorage.getItem('taxi_animationer') === '0') return true; } catch (e) {}
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e2) { return false; }
  }
  function vibrate() { try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {} }

  /* ---------- Mappar på startskärmen ---------- */
  function store() {
    var s = document.getElementById('td-mapp-forrad');
    if (!s) {
      s = document.createElement('div');
      s.id = 'td-mapp-forrad';
      s.hidden = true;
      s.style.display = 'none';
      document.body.appendChild(s);
      if (window.MutationObserver) {
        new MutationObserver(function () { folderBadges(); }).observe(s, { attributes: true, attributeFilter: ['class'], subtree: true });
      }
    }
    return s;
  }
  function storeBox(id) { return store().querySelector('[data-folder-store="' + id + '"]'); }
  function folderBadges() {
    var grid = homeGrid();
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll('.td-folder'), function (t) {
      var id = t.getAttribute('data-folder');
      var box = storeBox(id) || (openF && openF.id === id ? openF.grid : null);
      t.classList.add('badge-host');
      t.setAttribute('data-badge-text', '');
      t.classList.toggle('has-badge', !!(box && box.querySelector('.has-badge')));
    });
  }
  function previewHtml(nodes) {
    var h = '';
    nodes.slice(0, 4).forEach(function (n) {
      var em = n.querySelector('.emoji');
      h += '<span class="td-fmini" aria-hidden="true">' + (em ? em.innerHTML : '') + '</span>';
    });
    return h;
  }
  function buildFolders(grid) {
    var st = store();
    st.innerHTML = '';
    lastLayout.forEach(function (e) {
      if (e.type !== 'folder') return;
      var nodes = e.items.map(function (id) { return grid.querySelector('.icon[data-tool="' + id + '"]'); }).filter(Boolean);
      if (nodes.length < 2) return;
      var tile = document.createElement('div');
      tile.className = 'icon td-folder';
      tile.setAttribute('data-folder', e.id);
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('aria-haspopup', 'dialog');
      tile.setAttribute('aria-label', 'Mapp ' + (e.name || DEFAULT_NAME) + ', ' + nodes.length + ' verktyg');
      tile.innerHTML = '<div class="emoji td-folder-ico td-fn-' + Math.min(nodes.length, 4) + '">' + previewHtml(nodes) + '</div><div class="label"></div>';
      tile.querySelector('.label').textContent = e.name || DEFAULT_NAME;
      tile.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); openFolder(e.id); });
      tile.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openFolder(e.id); }
      });
      grid.insertBefore(tile, nodes[0]);
      var box = document.createElement('div');
      box.setAttribute('data-folder-store', e.id);
      nodes.forEach(function (n) { box.appendChild(n); });
      st.appendChild(box);
    });
    folderBadges();
  }

  var openF = null; // {id, tile, box, panel, grid}
  function openFolder(id, opts) {
    closeLpMenu();
    closeFolder();
    var grid = homeGrid();
    var tile = grid && grid.querySelector('.td-folder[data-folder="' + id + '"]');
    var box = storeBox(id), f = M.find(folders, id);
    if (!tile || !box || !f) return;
    var panel = document.createElement('div');
    panel.id = 'td-mapp';
    panel.className = 'td-mapp';
    panel.innerHTML =
      '<div class="td-mapp-scrim" data-mapp="close"></div>' +
      '<div class="td-mapp-box" role="dialog" aria-modal="true">' +
      '<button type="button" class="td-mapp-namn" data-mapp="rename" aria-label="Byt namn på mappen"></button>' +
      '<div class="grid td-mapp-grid"></div>' +
      '<p class="td-mapp-tips">Håll in en ikon och dra ut den för att lägga den på startskärmen.</p>' +
      '</div>';
    var name = f.name || DEFAULT_NAME;
    panel.querySelector('.td-mapp-namn').textContent = name;
    panel.querySelector('.td-mapp-box').setAttribute('aria-label', 'Mapp ' + name);
    var pg = panel.querySelector('.td-mapp-grid');
    while (box.firstChild) pg.appendChild(box.firstChild);
    document.body.appendChild(panel);
    var bx = panel.querySelector('.td-mapp-box');
    if (animOff()) bx.style.animation = 'none';
    var r = tile.getBoundingClientRect(), h = bx.offsetHeight, vh = window.innerHeight || 640;
    var top = Math.max(12, Math.min(r.top + r.height / 2 - h / 2, vh - h - 12));
    bx.style.top = Math.round(top) + 'px';
    bx.style.transformOrigin = '50% ' + Math.round(Math.max(0, Math.min(h, r.top + r.height / 2 - top))) + 'px';
    openF = { id: id, tile: tile, box: box, panel: panel, grid: pg };
    tile.classList.add('td-open');
    panel.addEventListener('click', onPanelClick);
    if (opts && opts.rename) startRename();
  }
  function closeFolder(keep) {
    if (!openF) return;
    var o = openF;
    openF = null;
    Array.prototype.slice.call(o.grid.children).forEach(function (n) { if (n !== keep) o.box.appendChild(n); });
    if (o.panel.parentNode) o.panel.parentNode.removeChild(o.panel);
    if (o.tile) o.tile.classList.remove('td-open');
    folderBadges();
  }
  function onPanelClick(e) {
    var t = e.target;
    if (t.closest && t.closest('[data-mapp="close"]')) { e.preventDefault(); closeFolder(); return; }
    if (t.closest && t.closest('[data-mapp="rename"]')) { e.preventDefault(); startRename(); return; }
    if (t.closest && t.closest('.icon[data-tool]') && !editing) {
      // modulen öppnas av ikonens egen onclick; mappen stängs
      setTimeout(function () { closeFolder(); }, 0);
    }
  }
  function startRename() {
    if (!openF) return;
    var o = openF, btn = o.panel.querySelector('.td-mapp-namn');
    if (!btn) return;
    var f = M.find(folders, o.id);
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'td-mapp-input';
    input.maxLength = NAME_MAX;
    input.value = (f && f.name) || DEFAULT_NAME;
    input.setAttribute('aria-label', 'Mappens namn');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('autocomplete', 'off');
    btn.parentNode.replaceChild(input, btn);
    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      if (save) {
        folders = M.renameFolder(folders, o.id, input.value);
        writeLocal();
        saveServer();
      }
      var nf = M.find(folders, o.id), name = (nf && nf.name) || DEFAULT_NAME;
      btn.textContent = name;
      if (input.parentNode) input.parentNode.replaceChild(btn, input);
      if (o.tile) {
        var lb = o.tile.querySelector('.label');
        if (lb) lb.textContent = name;
        o.tile.setAttribute('aria-label', 'Mapp ' + name);
      }
      lastLayout.forEach(function (e) { if (e.id === o.id) e.name = name; });
    }
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); input.blur(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', function () { finish(true); });
    try { input.focus(); input.select(); } catch (e) {}
  }
  function unpack(id) {
    closeFolder();
    apply(M.unpackFolder(currentTop(), folders, id));
    persist();
    rerender();
  }
  function takeOut(id) {
    var f = M.folderOf(folders, id);
    closeFolder();
    if (!f) return;
    apply(M.removeFromFolder(currentTop(), folders, id));
    persist();
    rerender();
  }

  /* ---------- Håll in, meny och dra (som på Android) ----------
   * Kort tryck öppnar verktyget som vanligt. Håll in ~1 s: ikonen lyfts och menyn visas.
   * Rör fingret: menyn stängs och ikonen följer med. Släpp i en lucka = flytta, släpp på en ikon = mapp.
   * I öppen mapp: håll in och dra utanför mappen, så stängs den och ikonen kan släppas på startskärmen. */
  var dg = null;
  function tileOf(t) {
    if (!t || !t.closest) return null;
    return t.closest('#app.is-home .grid .icon[data-tool], #app.is-home .grid .td-folder, #td-mapp .td-mapp-grid .icon[data-tool]');
  }
  function onPDown(e) {
    if (dg || (e.pointerType === 'mouse' && e.button !== 0) || e.isPrimary === false) return;
    if (e.target.closest && e.target.closest('.td-remove, .td-mapp-namn, input, #td-lp-menu')) return;
    var el = tileOf(e.target);
    if (!el) return;
    var inPanel = !!(el.closest && el.closest('#td-mapp'));
    closeLpMenu();
    dg = {
      el: el, id: tileId(el), kind: el.classList.contains('td-folder') ? 'folder' : 'tool',
      from: inPanel && openF ? openF.id : null, zone: inPanel ? 'folder' : 'grid',
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, pid: e.pointerId, ptype: e.pointerType || 'mouse',
      lifted: false, dragging: false, timer: 0, target: null, tTimer: 0, tCand: null, leaveTimer: 0, outside: false, rTimer: 0, rKey: null
    };
    if (editing) {
      dg.lifted = true;
      if (e.pointerType === 'mouse') e.preventDefault();
    } else {
      dg.timer = setTimeout(lift, LIFT_MS);
    }
    window.addEventListener('pointermove', onPMove, true);
    window.addEventListener('pointerup', onPUp, true);
    window.addEventListener('pointercancel', onPCancel, true);
  }
  function lift() {
    if (!dg) return;
    dg.timer = 0;
    dg.lifted = true;
    dg.el.classList.add('td-lifted');
    vibrate();
    showLpMenu(dg.el, dg.id, dg.kind === 'folder' ? 'folder' : (dg.from ? 'intool' : 'tool'));
  }
  function onPMove(e) {
    if (!dg || (dg.pid != null && e.pointerId !== dg.pid)) return;
    moveTo(e.clientX, e.clientY);
  }
  function onTouchMove(e) {
    if (!dg) return;
    if (dg.lifted) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation(); // ingen bakåt-swipe eller scroll medan en ikon bärs
      var t = e.touches && e.touches[0];
      if (t) moveTo(t.clientX, t.clientY);
    }
  }
  function onTouchEnd(e) {
    if (!dg || !dg.lifted) return;
    if (e.touches && e.touches.length) return;
    e.stopPropagation();
    finishDrag(false);
  }
  function onPUp(e) {
    if (!dg || (dg.pid != null && e.pointerId !== dg.pid)) return;
    dg.x = e.clientX; dg.y = e.clientY;
    finishDrag(false);
  }
  function onPCancel(e) {
    if (!dg || (dg.pid != null && e.pointerId !== dg.pid)) return;
    // Efter lyft styr touch-händelserna vidare (vissa webbläsare avbryter pekaren vid håll-in).
    if (dg.lifted && dg.ptype === 'touch') { dg.pid = null; return; }
    finishDrag(true);
  }
  function moveTo(x, y) {
    if (!dg) return;
    dg.x = x; dg.y = y;
    var d = Math.hypot(x - dg.x0, y - dg.y0);
    if (!dg.lifted) {
      if (d > SLOP) { clearTimeout(dg.timer); endListen(); dg = null; } // scroll, inget lyft
      return;
    }
    if (!dg.dragging) {
      if (d <= SLOP) return;
      startDrag();
    }
    placeGhost();
    hitTest();
  }
  function startDrag() {
    closeLpMenu();
    dg.dragging = true;
    document.body.classList.add('td-drag-on');
    var r = dg.el.getBoundingClientRect();
    var g = dg.el.cloneNode(true);
    ['onclick', 'data-tool', 'data-folder', 'data-badge', 'id', 'tabindex', 'role'].forEach(function (a) { g.removeAttribute(a); });
    g.classList.remove('td-lifted', 'td-ph', 'td-open');
    g.classList.add('td-ghost');
    g.setAttribute('aria-hidden', 'true');
    g.style.left = r.left + 'px';
    g.style.top = r.top + 'px';
    g.style.width = r.width + 'px';
    g.style.height = r.height + 'px';
    document.body.appendChild(g);
    dg.ghost = g;
    dg.offX = dg.x0 - r.left;
    dg.offY = dg.y0 - r.top;
    dg.el.classList.remove('td-lifted');
    dg.el.classList.add('td-ph');
    autoScroll();
  }
  function placeGhost() {
    if (!dg || !dg.ghost) return;
    dg.ghost.style.left = Math.round(dg.x - dg.offX) + 'px';
    dg.ghost.style.top = Math.round(dg.y - dg.offY) + 'px';
  }
  function inside(r, x, y, pad) { pad = pad || 0; return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad; }
  function isList() { return document.documentElement.getAttribute('data-home') === 'lista'; }
  function flip(container, fn) {
    var kids = Array.prototype.filter.call(container.children, function (n) { return n !== dg.el && n.nodeType === 1; });
    var before = kids.map(function (n) { return n.getBoundingClientRect(); });
    fn();
    if (animOff()) return;
    kids.forEach(function (n, i) {
      var a = n.getBoundingClientRect(), b = before[i], dx = b.left - a.left, dy = b.top - a.top;
      if (!dx && !dy) return;
      n.style.transition = 'none';
      n.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      void n.offsetWidth;
      n.style.transition = 'transform .18s ease';
      n.style.transform = '';
      setTimeout(function () { n.style.transition = ''; }, 220);
    });
  }
  function clearTarget() {
    clearTimeout(dg.tTimer); dg.tTimer = 0; dg.tCand = null;
    if (dg.target) dg.target.classList.remove('td-drop-target');
    dg.target = null;
  }
  /* Som på Android flyttas de andra ikonerna först när fingret stannat en kort stund,
   * så att ikoner man bara passerar inte hoppar undan. */
  function queueInsert(container, ref) {
    if (dg.el.parentNode === container && (dg.el.nextSibling === ref || ref === dg.el)) { clearTimeout(dg.rTimer); dg.rKey = null; return; }
    if (dg.rKey && dg.rKey.c === container && dg.rKey.r === ref) return;
    clearTimeout(dg.rTimer);
    dg.rKey = { c: container, r: ref };
    dg.rTimer = setTimeout(function () {
      if (!dg || !dg.rKey || dg.rKey.c !== container || dg.rKey.r !== ref) return;
      dg.rKey = null;
      if (ref && ref.parentNode !== container) return;
      flip(container, function () { container.insertBefore(dg.el, ref); });
    }, REORDER_DWELL);
  }
  function reorderIn(container, tiles, x, y) {
    var t = null, i, r;
    for (i = 0; i < tiles.length; i++) {
      r = tiles[i].getBoundingClientRect();
      if (inside(r, x, y)) { t = tiles[i]; break; }
    }
    if (!t) {
      // nedanför eller till höger om sista ikonen: lägg sist
      var last = tiles[tiles.length - 1];
      var lr = last && last.getBoundingClientRect();
      var below = lr && (y > lr.bottom || (y > lr.top && x > lr.right));
      if (below) queueInsert(container, null);
      return;
    }
    r = t.getBoundingClientRect();
    var after = isList() ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
    queueInsert(container, after ? t.nextSibling : t);
  }
  function hitTest() {
    var x = dg.x, y = dg.y;
    if (dg.zone === 'folder' && openF) {
      var br = openF.panel.querySelector('.td-mapp-box').getBoundingClientRect();
      if (inside(br, x, y, 4)) {
        clearTimeout(dg.leaveTimer); dg.leaveTimer = 0;
        reorderIn(openF.grid, Array.prototype.filter.call(openF.grid.children, function (n) { return n !== dg.el; }), x, y);
      } else if (!dg.leaveTimer) {
        dg.leaveTimer = setTimeout(leaveFolder, LEAVE_DWELL);
      }
      return;
    }
    var grid = homeGrid();
    if (!grid) return;
    var wrap = grid.parentNode && grid.parentNode.classList && grid.parentNode.classList.contains('td-grid-wrap') ? grid.parentNode : grid;
    dg.outside = !inside(wrap.getBoundingClientRect(), x, y, 28);
    if (dg.ghost) dg.ghost.classList.toggle('td-ghost-off', dg.outside);
    if (dg.outside) { clearTarget(); clearTimeout(dg.rTimer); dg.rKey = null; return; }
    var tiles = gridTiles(grid).filter(function (n) { return n !== dg.el; });
    // mitt på en ikon = mapp-mål (inte för mappar: inga mappar i mappar;
    // Moduler stannar på startskärmen, så varken den eller målet bildar mapp med den)
    var cand = null;
    if (dg.kind === 'tool' && !isPinned(dg.id)) {
      for (var i = 0; i < tiles.length; i++) {
        var em = tiles[i].querySelector('.emoji');
        if (em && inside(em.getBoundingClientRect(), x, y, 8) && !isPinned(tileId(tiles[i]))) { cand = tiles[i]; break; }
      }
    }
    if (cand) {
      clearTimeout(dg.rTimer); dg.rKey = null;
      if (dg.target === cand || dg.tCand === cand) return;
      clearTarget();
      dg.tCand = cand;
      dg.tTimer = setTimeout(function () {
        if (!dg || dg.tCand !== cand) return;
        dg.target = cand;
        cand.classList.add('td-drop-target');
        vibrate();
      }, FOLDER_DWELL);
      return;
    }
    clearTarget();
    reorderIn(grid, tiles, x, y);
  }
  function leaveFolder() {
    if (!dg) return;
    dg.leaveTimer = 0;
    if (!openF || dg.zone !== 'folder') return;
    var tile = openF.tile, grid = homeGrid();
    closeFolder(dg.el);
    dg.zone = 'grid';
    if (grid && tile && tile.parentNode === grid) grid.insertBefore(dg.el, tile.nextSibling);
    else if (grid) grid.appendChild(dg.el);
    hitTest();
  }
  function autoScroll() {
    if (!dg || !dg.dragging) return;
    var edge = 56, vh = window.innerHeight || 0, dy = 0;
    if (dg.y < edge + 40) dy = -8; else if (dg.y > vh - edge) dy = 8;
    if (dy && dg.zone === 'grid') {
      var grid = homeGrid(), sc = grid, cs;
      while (sc && sc !== document.body) {
        cs = getComputedStyle(sc);
        if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollHeight > sc.clientHeight) break;
        sc = sc.parentElement;
      }
      if (!sc || sc === document.body) sc = document.scrollingElement || document.documentElement;
      var before = sc.scrollTop;
      sc.scrollTop = before + dy;
      if (sc.scrollTop !== before) hitTest();
    }
    requestAnimationFrame(autoScroll);
  }
  function endListen() {
    window.removeEventListener('pointermove', onPMove, true);
    window.removeEventListener('pointerup', onPUp, true);
    window.removeEventListener('pointercancel', onPCancel, true);
  }
  /* Klicket som webbläsaren skickar när fingret släpps efter håll in ska inte öppna verktyget. Bara det ena klicket. */
  function blockNextClick() {
    var t0 = Date.now();
    function off() { document.removeEventListener('click', block, true); document.removeEventListener('pointerdown', off, true); }
    function block(e) {
      off();
      if (Date.now() - t0 > 450) return;
      if (e.target.closest && (e.target.closest('#td-lp-menu') || e.target.closest('#td-info-sheet'))) return;
      if (!tileOf(e.target) && !(e.target.closest && e.target.closest('.td-folder, #td-mapp'))) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    document.addEventListener('click', block, true);
    setTimeout(function () { document.addEventListener('pointerdown', off, true); }, 0); // nytt tryck = nytt klick
    setTimeout(off, 450);
  }
  function finishDrag(cancel) {
    var d = dg;
    if (!d) return;
    dg = null;
    endListen();
    clearTimeout(d.timer); clearTimeout(d.tTimer); clearTimeout(d.leaveTimer); clearTimeout(d.rTimer);
    if (!d.lifted) return;              // kort tryck: verktyget öppnas av click
    if (!d.dragging) {                  // håll in utan att röra: menyn står kvar
      if (!editing) blockNextClick();
      if (!document.getElementById('td-lp-menu')) d.el.classList.remove('td-lifted');
      return;
    }
    blockNextClick();
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    document.body.classList.remove('td-drag-on');
    d.el.classList.remove('td-ph', 'td-lifted');
    if (d.target) d.target.classList.remove('td-drop-target');
    var reopen = null, res = null;
    if (cancel || (d.zone === 'grid' && d.outside)) {
      reopen = d.zone === 'folder' ? d.from : null;
    } else if (d.zone === 'folder' && isPinned(d.id)) {
      res = M.placeTop(currentTop(), folders, d.id, topIdsFromDom(homeGrid()));
    } else if (d.zone === 'grid' && d.target && !isPinned(d.id) && !isPinned(tileId(d.target))) {
      var tid = tileId(d.target);
      if (M.isFolderId(tid)) res = M.addToFolder(currentTop(), folders, d.id, tid);
      else res = M.createFolder(currentTop(), folders, d.id, tid, newFolderId(), DEFAULT_NAME);
    } else if (d.zone === 'grid') {
      res = M.placeTop(currentTop(), folders, d.id, topIdsFromDom(homeGrid()));
    } else if (d.zone === 'folder' && openF) {
      res = M.reorderInFolder(currentTop(), folders, d.from, Array.prototype.map.call(openF.grid.children, tileId));
      reopen = d.from;
    }
    if (res) { apply(res); persist(); }
    closeFolder();
    rerender();
    if (reopen && M.find(folders, reopen)) openFolder(reopen);
  }
  function bindPointer() {
    if (document._tdDragBound) return;
    document._tdDragBound = true;
    document.addEventListener('pointerdown', onPDown);
    window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    window.addEventListener('touchend', onTouchEnd, true);
    window.addEventListener('touchcancel', function () { if (dg && dg.lifted) finishDrag(true); }, true);
    document.addEventListener('contextmenu', function (e) { if (tileOf(e.target)) e.preventDefault(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (dg) { finishDrag(true); return; }
      if (document.getElementById('td-lp-menu')) closeLpMenu();
      else if (openF) closeFolder();
    });
  }

  /* ---------- Håll-in-menyn ---------- */
  function closeLpMenu() {
    var m = document.getElementById('td-lp-menu');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    Array.prototype.forEach.call(document.querySelectorAll('.td-lifted'), function (n) {
      if (!dg || n !== dg.el) n.classList.remove('td-lifted');
    });
  }

  function icoInfo() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>';
  }
  function icoMove() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3v18M3 12h18M7 7l5-5 5 5M7 17l5 5 5-5M7 7L2 12l5 5M17 7l5 5-5 5"/></svg>';
  }
  function icoHelp() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.8-1.2 1.6V14"/><path d="M12 17h.01"/></svg>';
  }
  function icoTrash() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13"/></svg>';
  }
  function icoUnpack() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h7l2 2h9v9H3z"/><path d="M12 17v-5M9.5 14.5L12 12l2.5 2.5"/></svg>';
  }
  function icoPen() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>';
  }
  function icoOpen() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>';
  }
  function icoOut() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h6l2 2h8v9H4z"/><path d="M12 13v-9M9 7l3-3 3 3"/></svg>';
  }

  function startEdit(id) {
    editing = true;
    closeFolder();
    var content = document.getElementById('content');
    if (content) decorate(content);
    var icon = document.querySelector('#app.is-home .grid .icon[data-tool="' + id + '"], #app.is-home .grid .td-folder[data-folder="' + id + '"]');
    if (icon) {
      icon.classList.add('td-picked');
      try { icon.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    }
  }

  /* kind: 'tool' (på startskärmen), 'intool' (i öppen mapp) eller 'folder' */
  function showLpMenu(icon, id, kind) {
    closeLpMenu();
    kind = kind || 'tool';
    var menu = document.createElement('div');
    menu.id = 'td-lp-menu';
    menu.className = 'td-lp-menu';
    menu.setAttribute('role', 'menu');
    var html = '';
    if (kind === 'folder') {
      html += '<div class="td-lp-top">' +
        '<button type="button" class="td-lp-ico td-lp-unpack" data-lp="unpack" role="menuitem" aria-label="Ta bort mapp">' +
        icoUnpack() + '<span>Ta bort mapp</span></button></div>' +
        '<div class="td-lp-list">' +
        '<button type="button" role="menuitem" data-lp="open">' + icoOpen() + '<span>Öppna</span></button>' +
        '<button type="button" role="menuitem" data-lp="rename">' + icoPen() + '<span>Byt namn</span></button>' +
        '<button type="button" role="menuitem" data-lp="move">' + icoMove() + '<span>Flytta</span></button>' +
        '</div>';
    } else {
      if (!isCore(id) && !isPinned(id)) {
        html += '<div class="td-lp-top">' +
          '<button type="button" class="td-lp-ico td-lp-off" data-lp="off" role="menuitem" aria-label="Avinstallera">' +
          icoTrash() + '<span>Avinstallera</span></button></div>';
      }
      html += '<div class="td-lp-list">' +
        '<button type="button" role="menuitem" data-lp="info">' + icoInfo() + '<span>Modulinfo</span></button>' +
        (kind === 'intool'
          ? '<button type="button" role="menuitem" data-lp="out">' + icoOut() + '<span>Ta ut ur mappen</span></button>'
          : '<button type="button" role="menuitem" data-lp="move">' + icoMove() + '<span>Flytta</span></button>') +
        '<button type="button" role="menuitem" data-lp="help">' + icoHelp() + '<span>Hjälp</span></button>' +
        '</div>';
    }
    menu.innerHTML = html;
    document.body.appendChild(menu);
    var r = icon.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    var x = Math.min(window.innerWidth - mw - 8, Math.max(8, r.left + r.width / 2 - mw / 2));
    var y = r.top - mh - 8, above = true;
    if (y < 8) { y = r.bottom + 8; above = false; }
    if (y + mh > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 8 - mh);
    menu.style.left = Math.round(x) + 'px';
    menu.style.top = Math.round(y) + 'px';
    menu.style.transformOrigin = above ? '50% 100%' : '50% 0%';
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
    try { if (localStorage.getItem('taxi_animationer') === '0') menu.style.animation = 'none'; } catch (e2) {}
    menu.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-lp]');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      var act = b.getAttribute('data-lp');
      closeLpMenu();
      if (act === 'info') {
        if (window.MODULER && MODULER.showInfo) MODULER.showInfo(id);
      } else if (act === 'move') {
        startEdit(id);
      } else if (act === 'help') {
        closeFolder();
        if (window.HJALP && HJALP.openFor) HJALP.openFor(id);
        else if (window.HJALP && HJALP.open) HJALP.open();
      } else if (act === 'off') {
        removeTool(id);
      } else if (act === 'out') {
        takeOut(id);
      } else if (act === 'open') {
        openFolder(id);
      } else if (act === 'rename') {
        openFolder(id, { rename: true });
      } else if (act === 'unpack') {
        unpack(id);
      }
    });
    if (!document._tdLpDocBound) {
      document._tdLpDocBound = true;
      document.addEventListener('click', function (e) {
        var m = document.getElementById('td-lp-menu');
        if (!m) return;
        if (e.target.closest && e.target.closest('#td-lp-menu')) return;
        closeLpMenu();
      });
    }
  }

  function addBack(id) {
    if (!okId(id) || isCore(id) || isPinned(id)) return;
    hidden = hidden.filter(function (x) { return x !== id; });
    var top = currentTop();
    if (!top.length && order) top = order.slice();
    if (top.indexOf(id) < 0 && !inFolders(id)) top.push(id);
    apply(M.normalize(top, folders));
    persist();
    if (window.current === 'moduler' && window.MODULER) MODULER.render(document.getElementById('content'));
    else rerender();
  }

  function removeTool(id) {
    if (!okId(id) || isCore(id) || isPinned(id)) return;
    var f = M.folderOf(folders, id), reopen = null;
    if (hidden.indexOf(id) < 0) hidden.push(id);
    if (f && openF && openF.id === f.id) reopen = f.id;
    closeFolder();
    apply(M.removeTool(currentTop(), folders, id));
    persist();
    rerender();
    if (reopen && M.find(folders, reopen)) openFolder(reopen);
  }

  function decorate(content) {
    if (!content) return;
    css();
    var reopen = openF ? openF.id : null;
    closeFolder();
    var app = document.getElementById('app');
    if (app) app.classList.add('is-home');
    var grid = content.querySelector('.grid');
    if (!grid) { syncChrome(content); return; }
    dropOldSlot(grid);
    if (!grid.querySelector('.icon[data-tool="moduler"]')) {
      var plus = document.createElement('div');
      plus.className = 'icon';
      plus.setAttribute('data-tool', 'moduler');
      plus.setAttribute('role', 'button');
      plus.setAttribute('tabindex', '0');
      plus.setAttribute('aria-label', 'Moduler');
      plus.innerHTML = '<div class="emoji">' + ICO_MODULER() + '</div><div class="label">Moduler</div>';
      plus.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (!editing) openModuler(); });
      grid.appendChild(plus);
    }
    Array.prototype.forEach.call(grid.querySelectorAll('.icon[data-tool]'), function (el) {
      var id = el.getAttribute('data-tool');
      if (id === 'moduler' && !el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Moduler');
      if (!el.querySelector('.td-handle')) {
        var h = document.createElement('span');
        h.className = 'td-handle';
        h.setAttribute('aria-hidden', 'true');
        h.textContent = '⋮⋮';
        el.appendChild(h);
      }
      var rm = el.querySelector('.td-remove');
      if (!isCore(id) && !isPinned(id)) {
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
    buildFolders(grid);
    grid.classList.toggle('td-ordna', editing);
    bindPointer();
    syncChrome(content);
    if (reopen && M.find(folders, reopen)) openFolder(reopen);
  }

  function sync(onHome) {
    var app = document.getElementById('app');
    if (app) app.classList.toggle('is-home', !!onHome);
    if (!onHome) {
      editing = false;
      closeAdd();
      closeFolder();
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
      folders = local.folders || [];
    }
    rpc('home_tool_order_get', { p_token: token() }).then(function (r) {
      if (!r) return;
      var ids = r.ids;
      var hid = r.hidden;
      var fs = r.folders;
      var hasF = Array.isArray(fs);
      if (ids == null && (hid == null || (Array.isArray(hid) && !hid.length)) && !(hasF && fs.length)) return;
      var nextIds = Array.isArray(ids) ? cleanList(ids) : (order || []);
      var nextHid = Array.isArray(hid) ? cleanList(hid).filter(function (id) { return !isCore(id) && !isPinned(id); }) : hidden;
      // Utan mappkolumn (före migration 20261112b) behålls mapparna från den här enheten.
      var nextF = hasF ? M.cleanFolders(fs).filter(function (f) { return f.items.length >= 2; }) : folders;
      var pushLocal = false;
      if (hasF && !nextF.length && folders.length && nextIds.some(function (id) { return !!M.find(folders, id); })) {
        nextF = folders; // mappar gjorda innan servern kunde spara dem: behåll och skicka upp
        pushLocal = true;
      }
      var same = JSON.stringify(nextIds) === JSON.stringify(order || []) &&
        JSON.stringify(nextHid) === JSON.stringify(hidden || []) &&
        JSON.stringify(nextF) === JSON.stringify(folders || []);
      setState(nextIds.length ? nextIds : null, nextHid, nextF);
      if (pushLocal) saveServer();
      var onHome = !!(document.querySelector('#app.is-home .grid .icon') && !document.querySelector('.vd, .td-hjalp-panel.open'));
      if (!same && onHome && !editing && !dg && !openF && typeof renderMenu === 'function') renderMenu();
    });
  }

  window.HEM_ORDNING = {
    arrange: arrange,
    decorate: decorate,
    load: load,
    sync: sync,
    setCatalog: setCatalog,
    isEditing: function () { return editing; },
    isDragging: function () { return !!(dg && dg.dragging); },
    isCore: isCore,
    isPinned: isPinned,
    order: function () { return order ? order.slice() : null; },
    hidden: function () { return hidden.slice(); },
    folders: function () { return JSON.parse(JSON.stringify(folders)); },
    layout: function () { return JSON.parse(JSON.stringify(lastLayout)); },
    catalog: function () { return catalog.slice(); },
    isInstalled: function (id) {
      if (isCore(id) || isPinned(id)) return true;
      if (hidden.indexOf(id) >= 0) return false;
      if (isDefaultOff(id) && !optedIn(id)) return false;
      return true;
    },
    isDefaultOff: isDefaultOff,
    install: addBack,
    uninstall: removeTool,
    openModuler: openModuler,
    openFolder: openFolder,
    closeFolder: closeFolder,
    unpackFolder: unpack,
    model: M,
    LIFT_MS: LIFT_MS,
    preview: function (ids, hid, fs) { setState(ids, hid || [], fs === undefined ? [] : fs); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
