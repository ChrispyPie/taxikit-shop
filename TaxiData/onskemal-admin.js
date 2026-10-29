/* Admin › Önskemål och idéer.
 * Ägaren (och S admin) skriver vad som ska ändras eller läggas till i appen. Christian (och assistenten)
 * läser det via databasen och pratar igenom det innan något byggs. Inget ändras automatiskt.
 * Status (Ny / Läst / Planerad / Klar / Inte nu) och svar sätts av Christian, här visas de bara.
 * Ägaren kan ta bort sitt eget önskemål så länge det har status Ny.
 * Server: dev_wish_list, dev_wish_add, dev_wish_delete (tabell dev_wishes). Behörighet och åkeri kontrolleras där.
 * Bilder (högst 4 per önskemål): edge-funktionen onskemal-foto, privat bucket onskemal-foton. Bara den som skrev
 * önskemålet och S admin ser bilderna. Bilden skalas ner i telefonen (jpeg, under 1 MB) innan den skickas.
 * Använder admin.html:s rpc(), esc() och errText().
 * Ångra: se /workspace/backups/UNDO-onskemal-2026-10-28.md
 */
(function () {
  'use strict';
  // Kort namn för visning ("Christian P"), se namn.js
  function sn(s) { return window.shortName ? window.shortName(s) : (s == null ? '' : String(s)); }
  var STATUS = { ny: 'Ny', last: 'Läst', planerad: 'Planerad', klar: 'Klar', inte_nu: 'Inte nu' };
  var MAX = 2000;
  var ERR = {
    need_text: 'Skriv något först.',
    too_long: 'Texten är för lång (högst 2000 tecken).',
    rate_limited: 'Du har skickat många önskemål i dag. Försök igen i morgon.',
    not_found: 'Önskemålet finns inte längre.',
    not_editable: 'Christian har redan tittat på det här, så det går inte att ta bort längre.',
    forbidden: 'Du har inte behörighet att göra det.',
    demo_read_only: 'Det här är ett demokonto. Du kan titta runt men inte ändra något.',
    too_many_photos: 'Högst 4 bilder per önskemål.',
    too_big: 'Bilden är för stor. Försök med en annan bild.',
    bad_image: 'Bilden gick inte att läsa. Försök med en annan bild (jpg eller png).',
    upload_failed: 'Bilden kunde inte sparas. Försök igen.',
    invalid_session: 'Du är utloggad. Logga in igen.'
  };
  var MAXP = 4;
  var O = window.ONSKEMAL_ADMIN = { list: null, err: '', busy: false, draft: '', msg: '', files: [], photos: {} };

  (function css() {
    var s = document.createElement('style');
    s.textContent =
      '.onk-info{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px;font-size:calc(14px * var(--font-scale, 1));line-height:1.45}' +
      '.onk-info b{display:block;font-size:calc(16px * var(--font-scale, 1));margin-bottom:4px}' +
      '.onk-form{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px}' +
      '.onk-form textarea{width:100%;box-sizing:border-box;min-height:110px;padding:10px;border:1px solid var(--c-cbd5e0);border-radius:8px;font:inherit;font-size:calc(15px * var(--font-scale, 1));resize:vertical}' +
      '.onk-row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}' +
      '.onk-row small{color:var(--c-718096);font-size:calc(12px * var(--font-scale, 1))}' +
      '.onk-row button{padding:10px 22px;font-size:calc(15px * var(--font-scale, 1))}' +
      '.onk-row button.onk-go{background:var(--primary);color:var(--on-primary,#fff);font-weight:600}.onk-row button.onk-go:disabled{opacity:.6}' +
      '.onk-msg{font-size:calc(13px * var(--font-scale, 1));margin-top:8px;padding:6px 8px;border-radius:6px}' +
      '.onk-msg.ok{background:var(--c-c6f6d5);color:var(--c-276749)}.onk-msg.err{background:var(--c-fed7d7);color:var(--c-c53030)}' +
      '.onk-h{font-size:calc(12px * var(--font-scale, 1));font-weight:600;color:var(--c-718096);margin:16px 0 6px;text-transform:uppercase}' +
      '.onk-card{background:var(--surface);border-radius:12px;padding:12px;margin-bottom:10px}' +
      '.onk-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;font-size:calc(13px * var(--font-scale, 1));color:var(--c-4a5568)}' +
      '.onk-txt{margin-top:6px;font-size:calc(14px * var(--font-scale, 1));white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.onk-chip{font-size:calc(11px * var(--font-scale, 1));padding:2px 8px;border-radius:10px;white-space:nowrap;font-weight:600}' +
      '.onk-chip.ny{background:var(--c-fefcbf);color:var(--c-975a16)}.onk-chip.last{background:var(--c-edf2f7);color:var(--c-4a5568)}' +
      '.onk-chip.planerad{background:var(--c-bee3f8,#bee3f8);color:var(--c-2c5282,#2c5282)}.onk-chip.klar{background:var(--c-c6f6d5);color:var(--c-276749)}' +
      '.onk-chip.inte_nu{background:var(--c-fed7d7);color:var(--c-c53030)}' +
      '.onk-rep{margin-top:8px;font-size:calc(13px * var(--font-scale, 1));background:var(--c-f7fafc);border-radius:8px;padding:6px 8px;white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.onk-rep .w{display:block;font-size:calc(11px * var(--font-scale, 1));color:var(--c-718096);margin-bottom:2px}' +
      '.onk-del{margin-top:8px;padding:6px 12px;font-size:calc(13px * var(--font-scale, 1));border-color:var(--c-c53030)!important;color:var(--c-c53030)!important}' +
      '.onk-ph{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.onk-ph .p{position:relative}' +
      '.onk-ph img{width:84px;height:84px;object-fit:cover;border-radius:6px;display:block;background:var(--c-edf2f7)}' +
      '.onk-ph .x{position:absolute;top:-6px;right:-6px;width:24px;height:24px;min-height:0;padding:0;border-radius:12px;background:#fff;border:1px solid var(--c-c53030);color:var(--c-c53030);font-size:14px;line-height:20px}' +
      '.onk-ph .n{font-size:calc(12px * var(--font-scale, 1));color:var(--c-718096);align-self:center}' +
      '.onk-pick{padding:8px 12px;font-size:calc(13px * var(--font-scale, 1))}.onk-btns{display:flex;gap:8px;flex-wrap:wrap}' +
      '.onk-empty{text-align:center;color:var(--c-718096);font-size:calc(14px * var(--font-scale, 1));padding:16px}';
    document.head.appendChild(s);
  })();

  function E(e) { return ERR[e && e.message] || (typeof errText === 'function' ? errText(e) : 'Något gick fel.'); }
  function when(t) {
    return new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function isDemo() { return !!(window.DEMO && DEMO.owner && DEMO.owner()); }
  function demoList() {
    var d = function (n, h) { var x = new Date(); x.setDate(x.getDate() - n); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    return [
      { id: -1, body: 'Kan vi få se statistik per bil i Åkeridata? (exempel)', status: 'planerad', reply: 'Bra idé! Vi bygger det nästa vecka. (exempel)', created_at: d(2, 10), mine: true, author: 'Exempel Ä' },
      { id: -2, body: 'Påminnelse när det är dags för däckbyte. (exempel)', status: 'ny', reply: null, created_at: d(0, 9), mine: true, author: 'Exempel Ä' }];
  }

  // ---------- bilder ----------
  function photoApi(body) {
    if (isDemo()) return Promise.reject(new Error('demo_read_only'));
    body.token = localStorage.getItem('taxi_session') || '';
    return fetch(SUPABASE_URL + '/functions/v1/onskemal-foto', {
      method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error((b && b.error) || ('HTTP ' + r.status)); return b; });
    });
  }
  // Skala ner bilden innan den skickas: max 1600 px, jpeg, under ~1 MB
  function shrink(file) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var tries = [[1600, 0.8], [1280, 0.72], [1024, 0.6], [800, 0.5]], out = null;
        for (var i = 0; i < tries.length; i++) {
          var s = Math.min(1, tries[i][0] / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', tries[i][1]);
          if (out.length < 1300000) break;
        }
        URL.revokeObjectURL(url);
        if (!out || out.length >= 1390000) no(new Error('too_big')); else ok(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('bad_image')); };
      img.src = url;
    });
  }
  function pickFiles(max, cb) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = function () {
      var fs = Array.prototype.slice.call(inp.files || [], 0, max);
      if ((inp.files || []).length > max) { O.err = ERR.too_many_photos; rr(); }
      Promise.all(fs.map(function (f) { return shrink(f).then(function (d) { return d; }, function (e) { O.err = E(e); return null; }); }))
        .then(function (l) { cb(l.filter(Boolean)); });
    };
    inp.click();
  }
  function upload(wishId, dataUrl) { return photoApi({ action: 'upload', wish_id: wishId, image: dataUrl.split(',')[1] }); }
  O.pick = function () {
    O.msg = ''; O.err = '';
    if (isDemo()) { O.err = ERR.demo_read_only; rr(); return; }
    var left = MAXP - O.files.length; if (left <= 0) { O.err = ERR.too_many_photos; rr(); return; }
    pickFiles(left, function (l) { O.files = O.files.concat(l).slice(0, MAXP); rr(); });
  };
  O.unpick = function (i) { O.files.splice(i, 1); rr(); };
  O.loadPhotos = function (id) {
    O.photos[id] = { state: 'loading', at: Date.now() };
    photoApi({ action: 'list', wish_id: id }).then(function (r) { O.photos[id] = { list: r.photos || [], at: Date.now() }; rr(); })
      .catch(function (e) { O.photos[id] = { err: E(e), at: Date.now() }; rr(); });
  };
  O.addPhoto = function (id) {
    var w = (O.list || []).filter(function (x) { return x.id === id; })[0]; if (!w) return;
    O.msg = ''; O.err = '';
    if (isDemo()) { O.err = ERR.demo_read_only; rr(); return; }
    var left = MAXP - (w.photos || 0); if (left <= 0) { O.err = ERR.too_many_photos; rr(); return; }
    pickFiles(left, function (l) {
      if (!l.length) { rr(); return; }
      O.photos[id] = { state: 'loading', at: Date.now() }; rr();
      l.reduce(function (p, d) { return p.then(function () { return upload(id, d).then(function () { w.photos = (w.photos || 0) + 1; }); }); }, Promise.resolve())
        .catch(function (e) { O.err = E(e); })
        .then(function () { O.loadPhotos(id); });
    });
  };
  O.delPhoto = function (wid, pid) {
    if (!confirm('Ta bort bilden?')) return;
    O.msg = ''; O.err = '';
    photoApi({ action: 'delete_photo', photo_id: pid }).then(function () {
      var w = (O.list || []).filter(function (x) { return x.id === wid; })[0]; if (w && w.photos) w.photos--;
      O.loadPhotos(wid);
    }).catch(function (e) { O.err = E(e); rr(); });
  };
  function photoBox(w, edit) {
    var n = w.photos || 0;
    if (!n) return '';
    var P = O.photos[w.id];
    // Länkarna gäller i 15 minuter, hämta nya efter 10
    if (!P || (P.list && Date.now() - P.at > 600000)) { setTimeout(function () { O.loadPhotos(w.id); }, 0); P = { state: 'loading' }; }
    if (P.err) return '<div class="onk-ph"><span class="n">' + esc(P.err) + '</span></div>';
    if (!P.list) return '<div class="onk-ph"><span class="n">📷 Laddar ' + n + (n === 1 ? ' bild' : ' bilder') + '…</span></div>';
    return '<div class="onk-ph">' + P.list.map(function (p) {
      return p.url ? '<span class="p"><a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.url) + '" alt="Bild"></a>' +
        (edit ? '<button class="x" aria-label="Ta bort bilden" onclick="ONSKEMAL_ADMIN.delPhoto(' + w.id + ',' + p.id + ')">×</button>' : '') + '</span>' : '';
    }).join('') + '</div>';
  }

  function rr() { if (typeof render === 'function') render(); else O.render(); }   // admin.html:s render() sätter rubrik och brödsmulor

  O.load = async function () {
    O.list = null; O.err = ''; O.msg = '';
    rr();
    try { O.list = isDemo() ? demoList() : (await rpc('dev_wish_list')) || []; }
    catch (e) { O.err = E(e); O.list = []; }
    rr();
  };

  O.render = function (content) {
    var el = content || document.getElementById('content');
    if (!el || !(path[0] && path[0].id === 'onskemal')) return;
    var h = '<div class="onk-info"><b>💡 Önskemål och idéer</b>' +
      'Skriv här vad du vill ändra eller lägga till i appen. Christian går igenom allt innan något ändras. ' +
      'Inget i appen ändras automatiskt när du skickar.</div>';
    h += '<div class="onk-form"><textarea id="onk-text" maxlength="' + MAX + '" placeholder="Till exempel: Jag vill kunna se hur mycket varje bil har kört i månaden.">' + esc(O.draft) + '</textarea>' +
      (O.files.length ? '<div class="onk-ph">' + O.files.map(function (d, i) {
        return '<span class="p"><img src="' + d + '" alt="Vald bild"><button class="x" aria-label="Ta bort bilden" onclick="ONSKEMAL_ADMIN.unpick(' + i + ')">×</button></span>';
      }).join('') + '</div>' : '') +
      '<div class="onk-row"><small id="onk-count">' + O.draft.length + ' / ' + MAX + '</small>' +
      '<span class="onk-btns">' + (O.files.length < MAXP ? '<button class="onk-pick" onclick="ONSKEMAL_ADMIN.pick()"' + (O.busy ? ' disabled' : '') + '>📷 Lägg till bild</button>' : '') +
      '<button id="onk-send" class="onk-go" onclick="ONSKEMAL_ADMIN.send()"' + (O.busy ? ' disabled' : '') + '>' + (O.busy ? 'Skickar…' : 'Skicka') + '</button></span></div>' +
      (O.msg ? '<div class="onk-msg ok">' + esc(O.msg) + '</div>' : '') +
      (O.err ? '<div class="onk-msg err">' + esc(O.err) + '</div>' : '') + '</div>';
    h += '<div class="onk-h">Tidigare önskemål</div>';
    if (O.list === null) h += '<div class="onk-empty">Laddar…</div>';
    else if (!O.list.length) h += '<div class="onk-empty">Inga önskemål än.</div>';
    else O.list.forEach(function (w) {
      var st = STATUS[w.status] ? w.status : 'ny';
      h += '<div class="onk-card" data-id="' + w.id + '"><div class="onk-top"><span>' + esc(when(w.created_at)) +
        (w.author && !w.mine ? ' · ' + esc(sn(w.author)) : '') + '</span><span class="onk-chip ' + st + '">' + STATUS[st] + '</span></div>' +
        '<div class="onk-txt">' + esc(w.body) + '</div>' +
        photoBox(w, w.mine && st === 'ny') +
        (w.reply ? '<div class="onk-rep"><span class="w">Svar från Christian</span>' + esc(w.reply) + '</div>' : '') +
        (w.mine && st === 'ny' ? '<div class="onk-btns">' + ((w.photos || 0) < MAXP && w.id > 0 ? '<button class="onk-del onk-pick" style="border-color:var(--c-cbd5e0)!important;color:inherit!important" onclick="ONSKEMAL_ADMIN.addPhoto(' + w.id + ')">📷 Lägg till bild</button>' : '') +
          '<button class="onk-del" onclick="ONSKEMAL_ADMIN.del(' + w.id + ')">Ta bort</button></div>' : '') + '</div>';
    });
    el.innerHTML = h;
    var ta = document.getElementById('onk-text');
    ta.addEventListener('input', function () { O.draft = ta.value; document.getElementById('onk-count').textContent = ta.value.length + ' / ' + MAX; });
  };

  O.send = async function () {
    if (O.busy) return;
    var v = (O.draft || '').trim();
    O.msg = ''; O.err = '';
    if (!v) { O.err = ERR.need_text; rr(); return; }
    O.busy = true; rr();
    try {
      if (isDemo()) { var e = new Error('demo_read_only'); throw e; }
      var w = await rpc('dev_wish_add', { p_body: v });
      (O.list = O.list || []).unshift(w);
      O.draft = '';
      var files = O.files, bad = 0; O.files = [];
      w.photos = 0;
      for (var i = 0; i < files.length; i++) {
        try { await upload(w.id, files[i]); w.photos++; } catch (e2) { bad++; O.err = E(e2) + (bad > 1 ? ' (' + bad + ' bilder)' : ''); }
      }
      if (w.photos) delete O.photos[w.id];
      O.msg = 'Tack! Skickat' + (w.photos ? ' med ' + w.photos + (w.photos === 1 ? ' bild' : ' bilder') : '') + '. Christian läser det och hör av sig innan något ändras.' +
        (bad ? ' Du kan lägga till bilden igen under önskemålet.' : '');
    } catch (e) { O.err = E(e); }
    O.busy = false; rr();
  };

  O.del = async function (id) {
    if (!confirm('Ta bort önskemålet?')) return;
    O.msg = ''; O.err = '';
    try {
      if (isDemo()) throw new Error('demo_read_only');
      await photoApi({ action: 'delete_wish', wish_id: id });   // tar även bort bilderna
      O.list = (O.list || []).filter(function (w) { return w.id !== id; });
      O.msg = 'Borttaget.';
    } catch (e) { O.err = E(e); }
    rr();
  };
})();
