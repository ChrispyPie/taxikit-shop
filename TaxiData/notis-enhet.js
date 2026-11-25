/* Notisinställningar per enhet + "Kopiera inställningar från annan enhet".
 * Varje enhet (telefon, platta, dator) styr själv vilka kategorier som ska ge push och plinga/låta här,
 * medan meddelanden, ärenden och notisflöde alltid ligger kvar på servern. */
(function () {
  'use strict';
  if (window.NOTIS_ENHET) return;

  var KEY = 'taxi_notis_enhet';
  var CATS = ['tag', 'flyg', 'bat', 'prognos'];
  var LABELS = { tag: '🚆 Tåg', flyg: '✈️ Flyg', bat: '⛴️ Båt', prognos: '🔮 Prognos (förbokningar)' };

  function api() { return (typeof SB_URL !== 'undefined' && SB_URL) || window.TRIP_API_URL || 'https://lpfdryvukqmjlgenuzpb.supabase.co'; }
  function apiKey() { return (typeof SB_KEY !== 'undefined' && SB_KEY) || window.TRIP_API_KEY || ''; }
  function token() { try { return localStorage.getItem('taxi_session') || ''; } catch (e) { return ''; } }
  function driverId() { try { return localStorage.getItem('taxi_driver') || ''; } catch (e) { return ''; } }
  function isDelad() { try { return localStorage.getItem('taxi_delad_enhet') === '1'; } catch (e) { return false; } }
  function isDemo() { return !!(window.DEMO && DEMO.on && DEMO.on()); }
  function lsKey() { return isDelad() && driverId() ? KEY + ':' + driverId() : KEY; }
  function deviceKey() {
    if (window.TAXI_ENHET) return window.TAXI_ENHET;
    try { return localStorage.getItem('taxi_enhet') || ''; } catch (e) { return ''; }
  }
  function deviceName() {
    try {
      if (window.DELAD && DELAD.currentLabel) return DELAD.currentLabel() || 'Denna enhet';
    } catch (e) {}
    return isDelad() ? '🚕 Platta' : 'Enhet';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function rpc(name, args) {
    var t = token();
    if (!t) return Promise.reject(new Error('no_session'));
    args = Object.assign({}, args || {}, { p_token: t });
    return fetch(api() + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: apiKey(), Authorization: 'Bearer ' + apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.text().then(function (txt) {
        var b = null; try { b = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!r.ok) { var er = new Error((b && b.message) || ('HTTP ' + r.status)); er.status = r.status; er.code = b && b.code; throw er; }
        return b;
      });
    });
  }

  function norm(o) {
    o = o && typeof o === 'object' ? o : {};
    return {
      tag: o.tag !== false,
      flyg: o.flyg !== false,
      bat: o.bat !== false,
      prognos: o.prognos !== false
    };
  }
  function read() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(lsKey()) || 'null'); } catch (e) {}
    return norm(o);
  }
  function write(p) {
    var n = norm(p);
    try { localStorage.setItem(lsKey(), JSON.stringify(n)); } catch (e) {}
    return n;
  }
  function allows(kind) {
    if (!kind) return true;
    var k = String(kind);
    if (k.indexOf('prognos') === 0) k = 'prognos';
    else if (k.indexOf('flyg') === 0) k = 'flyg';
    else if (k.indexOf('tag') === 0) k = 'tag';
    else if (k.indexOf('bat') === 0 || k.indexOf('båt') === 0) k = 'bat';
    if (CATS.indexOf(k) < 0) return true;
    return read()[k] !== false;
  }

  function syncPushPrefs() {
    var prefs = read();
    if (!token() || isDemo() || !('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve();
    return navigator.serviceWorker.getRegistration('./').then(function (reg) {
      return reg && reg.pushManager ? reg.pushManager.getSubscription() : null;
    }).then(function (sub) {
      if (!sub || !sub.endpoint) return;
      return rpc('push_save_prefs', { p_endpoint: sub.endpoint, p_prefs: prefs }).catch(function () {});
    }).catch(function () {});
  }

  function readLjud() {
    if (window.BEV_LJUD && BEV_LJUD.read) return BEV_LJUD.read();
    try {
      var o = JSON.parse(localStorage.getItem('taxi_bev_ljud') || 'null') || {};
      return { on: o.on !== false, tag: o.tag !== false, flyg: o.flyg !== false, bat: o.bat !== false };
    } catch (e) { return { on: true, tag: true, flyg: true, bat: true }; }
  }
  function readVillkor() {
    if (window.TAG_VILLKOR && TAG_VILLKOR.get) return TAG_VILLKOR.get();
    try {
      var k = 'taxi_bev_villkor:' + (driverId() || 'anon');
      var o = JSON.parse(localStorage.getItem(k) || 'null');
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }

  function saveSnapshot() {
    var dk = deviceKey();
    if (!token() || !dk || isDemo()) return Promise.resolve(false);
    var data = {
      v: 1,
      push: read(),
      ljud: readLjud(),
      villkor: readVillkor()
    };
    return rpc('notis_device_settings_save', {
      p_device_key: dk,
      p_device_name: deviceName(),
      p_data: data
    }).then(function () { return true; }).catch(function () { return false; });
  }

  function set(patch) {
    var cur = read();
    CATS.forEach(function (c) {
      if (patch && Object.prototype.hasOwnProperty.call(patch, c)) cur[c] = !!patch[c];
    });
    write(cur);
    try { document.dispatchEvent(new CustomEvent('notis-enhet-change', { detail: cur })); } catch (e) {}
    syncPushPrefs();
    saveSnapshot();
    return cur;
  }

  function applyCopied(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.push && typeof data.push === 'object') write(data.push);
    if (data.ljud && typeof data.ljud === 'object') {
      if (window.BEV_LJUD && BEV_LJUD.write) BEV_LJUD.write(data.ljud);
      else {
        try { localStorage.setItem('taxi_bev_ljud', JSON.stringify(data.ljud)); } catch (e) {}
      }
    }
    if (data.villkor && typeof data.villkor === 'object') {
      try {
        var k = 'taxi_bev_villkor:' + (driverId() || 'anon');
        localStorage.setItem(k, JSON.stringify(data.villkor));
        if (window.TAG_VILLKOR && TAG_VILLKOR.resetLocal) TAG_VILLKOR.resetLocal();
        document.dispatchEvent(new CustomEvent('tag-villkor-change'));
      } catch (e2) {}
    }
    try { document.dispatchEvent(new CustomEvent('bev-ljud-change')); } catch (e3) {}
    try { document.dispatchEvent(new CustomEvent('notis-enhet-change', { detail: read() })); } catch (e4) {}
    syncPushPrefs();
    saveSnapshot();
    return true;
  }

  function listOtherDevices() {
    var dk = deviceKey();
    return rpc('notis_device_settings_list', {}).then(function (rows) {
      var list = Array.isArray(rows) ? rows : [];
      var others = list.filter(function (r) { return r && r.device_key && r.device_key !== dk; });
      if (others.length) return others;
      // Fallback: om bara gamla tågvillkor finns på servern
      return rpc('bev_villkor_get', {}).then(function (v) {
        if (v && typeof v === 'object' && v.tag) {
          return [{ device_key: 'legacy', device_name: 'Tidigare sparade inställningar', data: { villkor: v }, updated_at: v.updated_at || null }];
        }
        return [];
      }).catch(function () { return []; });
    }).catch(function () { return []; });
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function toast(msg) {
    if (window.BEVAKNING && BEVAKNING.toast) { BEVAKNING.toast(msg); return; }
    var t = document.getElementById('app-toast');
    if (t) { t.textContent = msg; t.style.display = 'block'; setTimeout(function () { t.style.display = 'none'; }, 3500); }
  }

  function css() {
    if (document.getElementById('ne-css')) return;
    var s = document.createElement('style');
    s.id = 'ne-css';
    s.textContent =
      '.ne-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:.6rem 0}' +
      '.ne-chk{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border,#cbd5e0);border-radius:9px;background:var(--surface,#fff);cursor:pointer;font-size:.9rem}' +
      '.ne-chk input{width:18px;height:18px;accent-color:var(--primary,#2b6cb0)}' +
      '.ne-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:.5rem 0}' +
      '.ne-btn{padding:8px 12px;border-radius:9px;border:1px solid var(--border,#cbd5e0);background:var(--surface,#fff);color:var(--text);font:600 .88rem inherit;cursor:pointer}' +
      '.ne-btn.pri{background:var(--primary,#2b6cb0);color:#fff;border-color:transparent}' +
      '.ne-copy-list{margin-top:8px;display:flex;flex-direction:column;gap:6px}' +
      '.ne-copy-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:9px;border:1px solid var(--border,#cbd5e0);background:var(--surface-soft,#edf2f7);text-align:left;cursor:pointer}';
    document.head.appendChild(s);
  }

  function renderSettings(box) {
    if (!box) return;
    css();
    var p = read();
    var lj = readLjud();
    var B = window.BEVAKNING;
    var ps = B && B.pushState ? B.pushState() : 'unknown';
    if (ps === 'unknown' && B && B.checkPush) {
      B.checkPush().then(function () { if (box.isConnected) renderSettings(box); });
    }
    var pushHtml = '';
    if (ps === 'on') {
      pushHtml = '<div class="ne-row"><span>🔔 Webbnotiser är på på denna enhet</span>' +
        '<button type="button" class="ne-btn" data-ne-push="test">Testa</button>' +
        '<button type="button" class="ne-btn" data-ne-push="off">Stäng av här</button></div>';
    } else if (ps === 'denied') {
      pushHtml = '<p style="font-size:.86rem;color:#c53030;margin:.3rem 0">🔕 Notiser är blockerade i webbläsaren för den här sidan.</p>';
    } else if (ps === 'unsupported') {
      pushHtml = '<p style="font-size:.86rem;color:var(--text-soft);margin:.3rem 0">🔕 Den här webbläsaren kan inte ta emot pushnotiser.</p>';
    } else {
      pushHtml = '<div class="ne-row"><button type="button" class="ne-btn pri" data-ne-push="on">🔔 Aktivera notiser på denna enhet</button></div>';
    }

    var h = '<div class="section"><h3 style="margin-top:0">Notiser på den här enheten</h3>' +
      '<p style="font-size:.9rem;color:var(--text-soft);margin:.3rem 0">' +
      'Välj vilka notiser och ljud som ska plinga just här (t.ex. bara i telefonen eller bara på plattan). Meddelanden och notisflödet finns alltid kvar på servern.</p>' +
      pushHtml +
      '<div style="font-weight:600;font-size:.88rem;margin-top:8px">Plinga / pusha på denna enhet för:</div>' +
      '<div class="ne-grid">' +
      CATS.map(function (c) {
        return '<label class="ne-chk"><input type="checkbox" data-ne-cat="' + c + '"' + (p[c] ? ' checked' : '') + '><span>' + LABELS[c] + '</span></label>';
      }).join('') +
      '</div>' +
      '<div style="font-weight:600;font-size:.88rem;margin-top:8px">Ljud när appen är öppen (denna enhet):</div>' +
      '<div class="ne-grid">' +
        '<label class="ne-chk"><input type="checkbox" data-ne-ljud="on"' + (lj.on ? ' checked' : '') + '><span>🔊 Ljud på</span></label>' +
        '<label class="ne-chk"><input type="checkbox" data-ne-ljud="tag"' + (lj.tag ? ' checked' : '') + '><span>🚆 Tågljud</span></label>' +
        '<label class="ne-chk"><input type="checkbox" data-ne-ljud="flyg"' + (lj.flyg ? ' checked' : '') + '><span>✈️ Flygljud</span></label>' +
        '<label class="ne-chk"><input type="checkbox" data-ne-ljud="bat"' + (lj.bat ? ' checked' : '') + '><span>⛴️ Båtljud</span></label>' +
      '</div>' +
      '<div class="ne-row" style="margin-top:10px">' +
        '<button type="button" class="ne-btn" data-ne-copy>Kopiera inställningar från annan enhet</button>' +
      '</div>' +
      '<div class="ne-copy-list" id="ne-copy-list" hidden></div>' +
      '</div>';
    box.innerHTML = h;

    box.onchange = function (e) {
      var cat = e.target.getAttribute('data-ne-cat');
      if (cat) {
        var patch = {}; patch[cat] = !!e.target.checked;
        set(patch);
        return;
      }
      var ljKey = e.target.getAttribute('data-ne-ljud');
      if (ljKey) {
        var curL = readLjud();
        curL[ljKey] = !!e.target.checked;
        if (window.BEV_LJUD && BEV_LJUD.write) BEV_LJUD.write(curL);
        else try { localStorage.setItem('taxi_bev_ljud', JSON.stringify(curL)); } catch (err) {}
        if (ljKey === 'tag' && window.TAG_VILLKOR && TAG_VILLKOR.setDefault) TAG_VILLKOR.setDefault({ sound: !!curL.tag });
        try { document.dispatchEvent(new CustomEvent('bev-ljud-change')); } catch (err2) {}
        saveSnapshot();
      }
    };

    box.onclick = function (e) {
      var pushBtn = e.target.closest && e.target.closest('[data-ne-push]');
      if (pushBtn && B) {
        var act = pushBtn.getAttribute('data-ne-push');
        if (act === 'on' && B.enable) B.enable().then(function () { syncPushPrefs(); saveSnapshot(); renderSettings(box); });
        else if (act === 'off' && B.disable) B.disable().then(function () { renderSettings(box); });
        else if (act === 'test' && B.test) B.test();
        return;
      }
      var copyBtn = e.target.closest && e.target.closest('[data-ne-copy]');
      if (copyBtn) {
        var listBox = box.querySelector('#ne-copy-list');
        if (!listBox) return;
        listBox.hidden = false;
        listBox.innerHTML = '<div style="font-size:.86rem;color:var(--text-soft)">Hämtar andra enheter…</div>';
        listOtherDevices().then(function (others) {
          if (!others.length) {
            listBox.innerHTML = '<div style="font-size:.86rem;color:var(--text-soft)">Ingen annan enhet har sparat notisinställningar ännu.</div>';
            return;
          }
          listBox.innerHTML = '<div style="font-size:.85rem;font-weight:600">Välj enhet att kopiera från:</div>' +
            others.map(function (o, i) {
              var when = fmtTime(o.updated_at);
              return '<button type="button" class="ne-copy-item" data-ne-pick="' + i + '">' +
                '<span><b>' + esc(o.device_name || 'Annan enhet') + '</b>' + (when ? '<br><small style="color:var(--text-soft)">Sparad ' + esc(when) + '</small>' : '') + '</span>' +
                '<span>Kopiera ›</span></button>';
            }).join('');
          listBox.onclick = function (ev) {
            var pick = ev.target.closest && ev.target.closest('[data-ne-pick]');
            if (!pick) return;
            var item = others[+pick.getAttribute('data-ne-pick')];
            if (!item || !item.data) return;
            applyCopied(item.data);
            renderSettings(box);
            toast('Inställningar kopierade från ' + (item.device_name || 'annan enhet') + '. Du kan nu ändra dem fritt här.');
          };
        });
      }
    };
  }

  // Skapa en knapp för att öppna/kopiera direkt från Bevakningar / Ankomster
  function renderCopyButton(host) {
    if (!host) return;
    css();
    host.innerHTML = '<div class="ne-row" style="margin:.4rem 0">' +
      '<button type="button" class="ne-btn" data-ne-copy-inline>Kopiera inställningar från annan enhet</button>' +
      '</div><div class="ne-copy-list" hidden></div>';
    host.querySelector('[data-ne-copy-inline]').onclick = function () {
      var listBox = host.querySelector('.ne-copy-list');
      listBox.hidden = false;
      listBox.innerHTML = '<div style="font-size:.86rem;color:var(--text-soft)">Hämtar andra enheter…</div>';
      listOtherDevices().then(function (others) {
        if (!others.length) {
          listBox.innerHTML = '<div style="font-size:.86rem;color:var(--text-soft)">Ingen annan enhet har sparat notisinställningar ännu.</div>';
          return;
        }
        listBox.innerHTML = others.map(function (o, i) {
          var when = fmtTime(o.updated_at);
          return '<button type="button" class="ne-copy-item" data-ne-pick="' + i + '">' +
            '<span><b>' + esc(o.device_name || 'Annan enhet') + '</b>' + (when ? ' · ' + esc(when) : '') + '</span>' +
            '<span>Kopiera ›</span></button>';
        }).join('');
        listBox.onclick = function (ev) {
          var pick = ev.target.closest && ev.target.closest('[data-ne-pick]');
          if (!pick) return;
          var item = others[+pick.getAttribute('data-ne-pick')];
          if (!item || !item.data) return;
          applyCopied(item.data);
          listBox.hidden = true;
          toast('Inställningar kopierade från ' + (item.device_name || 'annan enhet') + '.');
        };
      });
    };
  }

  window.NOTIS_ENHET = {
    read: read,
    write: write,
    set: set,
    allows: allows,
    syncPushPrefs: syncPushPrefs,
    saveSnapshot: saveSnapshot,
    listOtherDevices: listOtherDevices,
    applyCopied: applyCopied,
    renderSettings: renderSettings,
    renderCopyButton: renderCopyButton
  };
})();
