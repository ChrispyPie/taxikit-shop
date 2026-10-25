/* Profilbild: visa, byta och ta bort sin egen profilbild (förarappen och adminsidan).
 * Bilden beskärs till en cirkel i telefonen, skalas ner till 256x256 jpeg och skickas till
 * edge-funktionen "profilbild", som kontrollerar inloggningen och sparar i en privat bucket.
 * Varje användare kan bara ändra sin egen bild. Inloggning med huvudlösenordet kan inte ändra.
 */
(function () {
  'use strict';
  var API = 'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/profilbild';
  var KEY = 'sb_publishable_7LwIOZ5ygRvJqJKFxl4cNQ_LvrzrHrP';
  var CACHE = 'taxi_pfp';
  var SIZE = 256, VIEW = 260;
  var P = window.PROFILBILD = { url: null, canEdit: true };
  var btn, menu, items = {};

  var CSS = '/* Profilbild (profilbild.js) */\n' +
    '.pfp-has { width: 36px; height: 36px; border-radius: 50% !important; border: none; padding: 0; background-size: cover !important; background-position: center !important; background-color: #1a365d; color: transparent !important; overflow: hidden; }\n' +
    '.pfp-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.6); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 16px; }\n' +
    '.pfp-box { background: #fff; border-radius: 12px; padding: 16px; width: 100%; max-width: 320px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,.25); }\n' +
    '.pfp-box h3 { margin: 0 0 4px; font-size: 1.1rem; color: #1a365d; }\n' +
    '.pfp-hint { margin: 0 0 12px; font-size: .85rem; color: #4a5568; }\n' +
    '.pfp-view { position: relative; width: 260px; height: 260px; margin: 0 auto; border-radius: 8px; overflow: hidden; touch-action: none; }\n' +
    '.pfp-view canvas { display: block; width: 260px; height: 260px; cursor: grab; }\n' +
    '.pfp-ring { position: absolute; inset: 0; pointer-events: none; border-radius: 50%; box-shadow: 0 0 0 200px rgba(255,255,255,.65); outline: 2px solid #1a365d; outline-offset: -2px; }\n' +
    '.pfp-zoom { display: flex; align-items: center; gap: 8px; margin: 12px 0 4px; font-size: .9rem; color: #2d3748; }\n' +
    '.pfp-zoom input { flex: 1; }\n' +
    '.pfp-btns { display: flex; gap: 8px; margin-top: 12px; }\n' +
    '.pfp-btns button { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e0; background: #fff; font-size: 1rem; cursor: pointer; }\n' +
    '.pfp-btns .pfp-save { background: #1a365d; color: #fff; border-color: #1a365d; }\n' +
    '.pfp-btns button:disabled { opacity: .6; }\n' +
    '.pfp-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: #1a365d; color: #fff; padding: 10px 16px; border-radius: 8px; z-index: 2100; display: none; max-width: 90vw; }';
  (function () { var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); })();

  function token() { return localStorage.getItem('taxi_session') || ''; }
  function api(body) {
    body.token = token();
    return fetch(API, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          if (!r.ok) { var e = new Error((b && b.error) || ('HTTP ' + r.status)); e.code = b && b.code; throw e; }
          return b;
        });
      });
  }
  function toast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    var t = document.getElementById('pfp-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pfp-toast'; t.className = 'pfp-toast'; t.setAttribute('role', 'alert'); document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._h); t._h = setTimeout(function () { t.style.display = 'none'; }, 4000);
  }
  function errText(e) {
    var m = e && e.message;
    if (m === 'via_master') return 'Du är inloggad med huvudlösenordet. Profilbilden kan bara bytas av personen själv.';
    if (m === 'too_big') return 'Bilden är för stor. Försök med en annan bild.';
    if (m === 'bad_image') return 'Det gick inte att läsa bilden. Försök med en annan bild.';
    return 'Det gick inte att spara bilden. Försök igen.';
  }

  function paint() {
    if (!btn) return;
    if (P.url) {
      btn.classList.add('pfp-has');
      btn.style.backgroundImage = 'url("' + P.url + '")';
      if (!btn.dataset.pfpText) btn.dataset.pfpText = btn.textContent;
      btn.textContent = '';
    } else {
      btn.classList.remove('pfp-has');
      btn.style.backgroundImage = '';
      if (btn.dataset.pfpText) btn.textContent = btn.dataset.pfpText;
    }
    if (items.change) items.change.style.display = P.canEdit ? '' : 'none';
    if (items.remove) items.remove.style.display = P.canEdit && P.url ? '' : 'none';
    if (items.change) items.change.textContent = P.url ? 'Byt profilbild' : 'Lägg till profilbild';
  }
  function save(url) {
    P.url = url || null;
    try {
      if (P.url) sessionStorage.setItem(CACHE, JSON.stringify({ url: P.url, exp: Date.now() + 50 * 60000, t: token().slice(-12), e: P.canEdit }));
      else sessionStorage.setItem(CACHE, JSON.stringify({ url: null, exp: Date.now() + 50 * 60000, t: token().slice(-12), e: P.canEdit }));
    } catch (e) {}
    paint();
  }
  var loading = false;
  function load() {
    if (!token() || loading) return;
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE) || 'null');
      if (c && c.exp > Date.now() && c.t === token().slice(-12)) { P.url = c.url; P.canEdit = c.e !== false; paint(); return; }
    } catch (e) {}
    loading = true;
    api({ action: 'get' }).then(function (r) { loading = false; P.canEdit = r.can_edit !== false; save(r.url); })
      .catch(function () { loading = false; paint(); });
  }

  // --- Beskärning: dra bilden och zooma, cirkeln visar vad som blir kvar ---
  function openCrop(file) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () { cropUI(img, url); };
    img.onerror = function () { URL.revokeObjectURL(url); toast('Det gick inte att läsa bilden. Försök med en annan bild.'); };
    img.src = url;
  }
  function cropUI(img, url) {
    var ov = document.createElement('div');
    ov.className = 'pfp-overlay';
    ov.innerHTML = '<div class="pfp-box" role="dialog" aria-label="Profilbild">' +
      '<h3>Profilbild</h3><p class="pfp-hint">Dra bilden och zooma så att ansiktet hamnar i cirkeln.</p>' +
      '<div class="pfp-view"><canvas width="' + VIEW + '" height="' + VIEW + '"></canvas><div class="pfp-ring"></div></div>' +
      '<label class="pfp-zoom">Zoom <input type="range" min="1" max="3" step="0.01" value="1"></label>' +
      '<div class="pfp-btns"><button type="button" class="pfp-cancel">Avbryt</button><button type="button" class="pfp-save">Spara</button></div></div>';
    document.body.appendChild(ov);
    var cv = ov.querySelector('canvas'), ctx = cv.getContext('2d'), zoomEl = ov.querySelector('input');
    var base = Math.max(VIEW / img.width, VIEW / img.height), z = 1, ox = 0, oy = 0;
    function clamp() {
      var w = img.width * base * z, h = img.height * base * z;
      var mx = Math.max(0, (w - VIEW) / 2), my = Math.max(0, (h - VIEW) / 2);
      ox = Math.min(mx, Math.max(-mx, ox)); oy = Math.min(my, Math.max(-my, oy));
    }
    function draw(c, size) {
      var k = size / VIEW, w = img.width * base * z * k, h = img.height * base * z * k;
      c.fillStyle = '#fff'; c.fillRect(0, 0, size, size);
      c.drawImage(img, (size - w) / 2 + ox * k, (size - h) / 2 + oy * k, w, h);
    }
    function redraw() { clamp(); draw(ctx, VIEW); }
    redraw();
    var drag = null;
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, ox: ox, oy: oy }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) { if (!drag) return; ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; redraw(); });
    cv.addEventListener('pointerup', function () { drag = null; });
    cv.addEventListener('pointercancel', function () { drag = null; });
    zoomEl.addEventListener('input', function () { z = parseFloat(zoomEl.value) || 1; redraw(); });
    function close() { URL.revokeObjectURL(url); ov.remove(); }
    ov.querySelector('.pfp-cancel').onclick = close;
    var saveBtn = ov.querySelector('.pfp-save');
    saveBtn.onclick = function () {
      var out = document.createElement('canvas'); out.width = out.height = SIZE;
      draw(out.getContext('2d'), SIZE);
      var data = out.toDataURL('image/jpeg', 0.82);
      if (data.length > 130000) data = out.toDataURL('image/jpeg', 0.6);
      saveBtn.disabled = true; saveBtn.textContent = 'Sparar...';
      api({ action: 'upload', image: data.split(',')[1] }).then(function (r) {
        close(); save(r.url); toast('Profilbilden är sparad.');
      }).catch(function (e) {
        if (e && e.code === '28000') { location.reload(); return; }
        saveBtn.disabled = false; saveBtn.textContent = 'Spara'; toast(errText(e));
      });
    };
  }

  function pick() {
    hideMenu();
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    inp.onchange = function () { var f = inp.files && inp.files[0]; inp.remove(); if (f) openCrop(f); };
    document.body.appendChild(inp); inp.click();
  }
  function remove() {
    hideMenu();
    if (!confirm('Ta bort din profilbild?')) return;
    api({ action: 'delete' }).then(function () { save(null); toast('Profilbilden är borttagen.'); })
      .catch(function (e) { if (e && e.code === '28000') { location.reload(); return; } toast(errText(e)); });
  }
  function hideMenu() {
    if (!menu) return;
    menu.classList.remove('show');
    if (menu.style.display === 'block') menu.style.display = 'none';
  }

  // init({ button, menu, before }): lägger till menyvalen före "before" (t.ex. Logga ut)
  P.init = function (o) {
    btn = o.button; menu = o.menu;
    if (menu && !items.change) {
      var cls = o.itemClass || '', st = o.itemStyle || '';
      items.change = document.createElement('div'); items.change.className = cls; items.change.setAttribute('style', st);
      items.change.textContent = 'Lägg till profilbild'; items.change.onclick = pick;
      items.remove = document.createElement('div'); items.remove.className = cls; items.remove.setAttribute('style', st);
      items.remove.textContent = 'Ta bort profilbild'; items.remove.onclick = remove; items.remove.style.display = 'none';
      menu.insertBefore(items.change, o.before || null);
      menu.insertBefore(items.remove, o.before || null);
    }
    load();
  };
  P.reset = function () { try { sessionStorage.removeItem(CACHE); } catch (e) {} P.url = null; paint(); };
})();
