/* Forum i förarappen: inlägg (Allmänt, Hjälp, Förslag, Buggar), kommentarer, 👍 och upp till 3 foton per inlägg.
 * Förslag och buggar har status (Ny, Pågår, Klar, Avvisad) som bara ägaren och S admin kan ändra.
 * Allt kontrolleras i databasen (forum_*-funktionerna). Foton och profilbilder går via edge-funktionen "forum"
 * (privata buckets, länkarna gäller en kort stund). Forumet är bara för förarna i samma företag.
 */
(function () {
  'use strict';
  var FN = 'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/forum';
  var F = window.FORUM = { id: 'forum', title: 'Forum', icon: '💬' };
  var CATS = [['allmant', 'Allmänt'], ['hjalp', 'Hjälp'], ['forslag', 'Förslag'], ['buggar', 'Buggar']];
  var STATUS = [['ny', 'Ny'], ['pagar', 'Pågår'], ['klar', 'Klar'], ['avvisad', 'Avvisad']];
  var ERR = {
    via_master: 'Du är inloggad med huvudlösenordet. Bara föraren själv kan skriva i forumet.',
    need_title: 'Skriv en rubrik.', need_text: 'Skriv något först.', title_too_long: 'Rubriken är för lång (högst 120 tecken).',
    text_too_long: 'Texten är för lång.', too_many: 'Du har skrivit väldigt mycket idag. Försök igen i morgon.',
    too_many_photos: 'Högst 3 foton per inlägg.', too_big: 'Fotot är för stort.', bad_image: 'Det gick inte att läsa fotot. Försök med ett annat.',
    forbidden: 'Det får du inte göra.', need_first_name: 'Fyll i ditt förnamn först.', name_too_long: 'Namnet är för långt.', has_name: 'Du har redan ett namn. Ändra det under Profil.', not_found: 'Inlägget finns inte längre.', comment_too_long: 'Kommentaren till statusen är för lång.'
  };
  var CSS = '/* Forum (forum.js) */\n' +
    '.fo-top { display: flex; align-items: center; gap: 8px; margin-bottom: .6rem; }\n' +
    '.fo-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: .7rem; }\n' +
    '.fo-card { cursor: pointer; }\n' +
    '.fo-head { display: flex; align-items: center; gap: 8px; font-size: .82rem; color: var(--text-soft); }\n' +
    '.fo-av { width: 30px; height: 30px; border-radius: 50%; flex: 0 0 30px; background: #1a365d center/cover no-repeat; color: #fff; font-size: .8rem; font-weight: 600; display: flex; align-items: center; justify-content: center; }\n' +
    '.fo-av.sm { width: 24px; height: 24px; flex-basis: 24px; font-size: .7rem; }\n' +
    '.fo-name { color: var(--text); font-weight: 600; }\n' +
    '.fo-title { font-weight: 700; color: var(--primary); margin: .35rem 0 .2rem; font-size: 1.02rem; word-break: break-word; }\n' +
    '.fo-body { white-space: pre-wrap; word-break: break-word; color: var(--text); font-size: .95rem; }\n' +
    '.fo-ex { color: var(--text-soft); font-size: .9rem; word-break: break-word; }\n' +
    '.fo-meta { display: flex; gap: 12px; margin-top: .4rem; font-size: .85rem; color: var(--text-soft); align-items: center; flex-wrap: wrap; }\n' +
    '.fo-tag { font-size: .72rem; padding: .1rem .5rem; border-radius: 10px; background: #e2e8f0; color: #2d3748; white-space: nowrap; }\n' +
    '.fo-st-ny { background: #bee3f8; color: #2a4365; } .fo-st-pagar { background: #fefcbf; color: #975a16; }\n' +
    '.fo-st-klar { background: #c6f6d5; color: #22543d; } .fo-st-avvisad { background: #fed7d7; color: #9b2c2c; }\n' +
    '.fo-hid { background: #4a5568; color: #fff; }\n' +
    '.fo-back { background: none; border: none; color: var(--primary); font-size: 1rem; padding: .3rem 0; margin-bottom: .4rem; cursor: pointer; }\n' +
    '.fo-like { border: 2px solid var(--primary); background: var(--surface); color: var(--primary); border-radius: 18px; padding: .3rem .8rem; font-size: .95rem; cursor: pointer; }\n' +
    '.fo-like.on { background: var(--primary); color: var(--on-primary); }\n' +
    '.fo-photos { display: flex; gap: 6px; margin-top: .6rem; flex-wrap: wrap; }\n' +
    '.fo-photos img { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; cursor: pointer; background: #e2e8f0; }\n' +
    '.fo-pw { position: relative; } .fo-pw button { position: absolute; top: 2px; right: 2px; border: none; border-radius: 50%; width: 26px; height: 26px; background: rgba(0,0,0,.65); color: #fff; cursor: pointer; }\n' +
    '.fo-status { border-left: 4px solid var(--primary); background: var(--bg, #f7fafc); padding: .5rem .6rem; border-radius: 6px; margin-top: .6rem; font-size: .9rem; }\n' +
    '.fo-com { border-top: 1px solid var(--border-soft, #e2e8f0); padding: .55rem 0; }\n' +
    '.fo-com.hid { opacity: .65; }\n' +
    '.fo-small { display: flex; gap: 12px; margin-top: .25rem; } .fo-small button { background: none; border: none; padding: 0; color: var(--primary); font-size: .82rem; cursor: pointer; } .fo-small .fo-danger { color: var(--danger-text, #c53030); }\n' +
    '.fo-notice { display: block; width: 100%; text-align: left; background: #fefcbf; border: none; border-radius: 8px; padding: .5rem .6rem; margin-bottom: .4rem; font-size: .88rem; color: #2d3748; cursor: pointer; }\n' +
    '.fo-zoom { position: fixed; inset: 0; background: rgba(0,0,0,.88); z-index: 2000; display: flex; align-items: center; justify-content: center; } .fo-zoom img { max-width: 96vw; max-height: 90vh; }\n' +
    '.fo-err { color: var(--danger-text, #c53030); font-size: .9rem; margin: .3rem 0; }\n' +
    '.vk-field input.fo-in { width: 100%; padding: .55rem; border-radius: 8px; border: 1px solid var(--border); font: inherit; box-sizing: border-box; }';
  (function () { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); })();

  var st = { cat: null, list: null, post: null, view: 'list', err: null, flash: null, edit: null, photos: {}, avatars: {}, busy: false };
  var root = null;

  function token() { return localStorage.getItem('taxi_session') || ''; }
  function rpc(name, args) {
    args = args || {}; args.p_token = token();
    return fetch(TRIP_API_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': TRIP_API_KEY, 'Authorization': 'Bearer ' + TRIP_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.text().then(function (t) {
        var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var er = new Error((b && b.message) || ('HTTP ' + r.status)); er.code = b && b.code; throw er; }
        return b;
      });
    });
  }
  function fn(body) {
    body.token = token();
    return fetch(FN, { method: 'POST', headers: { apikey: TRIP_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          if (!r.ok) { var e = new Error((b && b.error) || ('HTTP ' + r.status)); e.code = b && b.code; throw e; }
          return b;
        });
      });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function errText(e) { return ERR[e && e.message] || 'Det gick inte. Försök igen.'; }
  function fail(e) { if (e && e.code === '28000') { location.reload(); return true; } return false; }
  function catName(c) { for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === c) return CATS[i][1]; return c; }
  function stName(s) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i][0] === s) return STATUS[i][1]; return s; }
  function when(iso) {
    var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return 'nyss';
    if (s < 3600) return Math.floor(s / 60) + ' min sedan';
    if (s < 86400) return Math.floor(s / 3600) + ' tim sedan';
    return d.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function initials(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join(''); }
  function av(name, ak, sm) {
    return '<span class="fo-av' + (sm ? ' sm' : '') + '"' + (ak ? ' data-ak="' + esc(ak) + '"' : '') + ' aria-hidden="true">' + esc(initials(name)) + '</span>';
  }
  // Profilbilder: hämta signerade länkar för de bilder som syns, spara en stund
  function paintAvatars() {
    if (!root) return;
    var els = root.querySelectorAll('[data-ak]'), need = [], now = Date.now();
    els.forEach(function (el) {
      var k = el.getAttribute('data-ak'), c = st.avatars[k];
      if (c && c.exp > now) { if (c.url) { el.style.backgroundImage = 'url("' + c.url + '")'; el.textContent = ''; } }
      else if (need.indexOf(k) < 0) need.push(k);
    });
    if (!need.length) return;
    need.forEach(function (k) { st.avatars[k] = { url: null, exp: now + 60000 }; });
    fn({ action: 'avatars', paths: need }).then(function (r) {
      var urls = (r && r.urls) || {};
      need.forEach(function (k) { st.avatars[k] = { url: urls[k] || null, exp: Date.now() + (urls[k] ? 50 * 60000 : 10 * 60000) }; });
      paintAvatars();
    }).catch(function () {});
  }
  function tags(p) {
    var h = '<span class="fo-tag">' + esc(catName(p.cat)) + '</span>';
    if (p.status) h += ' <span class="fo-tag fo-st-' + esc(p.status) + '">' + esc(stName(p.status)) + '</span>';
    if (p.hidden) h += ' <span class="fo-tag fo-hid">Dold</span>';
    return h;
  }
  // Namnruta: förnamn krävs för att skriva. I forumet visas "Förnamn E.".
  function nameBox() {
    return '<div class="vk-card"><div class="fo-title">Skriv ditt namn först</div>' +
      '<div class="fo-ex" style="margin-bottom:.5rem">För att skriva i forumet behöver du ett förnamn i din profil. Andra ser bara förnamn och första bokstaven i efternamnet, t.ex. "Anna S.". Läsa kan du ändå.</div>' +
      '<div class="vk-field"><label class="vk-lbl" for="fo-fn">Förnamn</label><input class="fo-in" id="fo-fn" maxlength="50" autocomplete="given-name"></div>' +
      '<div class="vk-field"><label class="vk-lbl" for="fo-ln">Efternamn (valfritt)</label><input class="fo-in" id="fo-ln" maxlength="50" autocomplete="family-name"></div>' +
      (st.nameErr ? '<div class="fo-err">' + esc(st.nameErr) + '</div>' : '') +
      '<div class="vk-iact"><button data-a="setname">Spara namn</button></div></div>';
  }
  function setUnread(n) { if (window.setBadge) setBadge('forum', +n || 0); }
  function push(view) { try { history.pushState({ view: F.id, sub: view }, ''); } catch (e) {} }

  // ---------- lista ----------
  function loadList() {
    st.err = null;
    return Promise.all([rpc('forum_list', { p_category: st.cat }), rpc('forum_notices', { p_mark_read: false })]).then(function (r) {
      st.list = r[0]; st.notices = (r[1] || []).filter(function (n) { return !n.read; });
      setUnread(st.list.unread);
    }).catch(function (e) { if (!fail(e)) st.err = errText(e); });
  }
  function drawList() {
    var h = '';
    if (st.flash) { h += '<div class="vk-flash">' + esc(st.flash) + '</div>'; st.flash = null; }
    if (st.list && st.list.can_write) h += st.list.has_name ? '<button class="vk-new" data-a="new">+ Nytt inlägg</button>' : nameBox();
    if (st.notices && st.notices.length) {
      h += '<div class="vk-card"><div class="vk-lbl">Nytt för dig</div>';
      st.notices.forEach(function (n) { h += '<button class="fo-notice" data-a="open" data-id="' + n.post_id + '">' + esc(n.body) + ' <span style="color:#718096">· ' + esc(when(n.created_at)) + '</span></button>'; });
      h += '<button class="fo-back" data-a="readall">Markera alla som lästa</button></div>';
    }
    h += '<div class="fo-chips" role="group" aria-label="Kategori"><button class="ank-chip' + (!st.cat ? ' on' : '') + '" data-a="cat" data-c="">Alla</button>';
    CATS.forEach(function (c) { h += '<button class="ank-chip' + (st.cat === c[0] ? ' on' : '') + '" data-a="cat" data-c="' + c[0] + '">' + c[1] + '</button>'; });
    h += '</div>';
    if (st.err) h += '<div class="tl-msg err">' + esc(st.err) + '</div>';
    else if (!st.list) h += '<div class="tl-msg">Laddar...</div>';
    else if (!st.list.posts.length) h += '<div class="tl-msg">Inga inlägg här ännu. Skriv det första!</div>';
    else st.list.posts.forEach(function (p) {
      h += '<div class="vk-card fo-card" data-a="open" data-id="' + p.id + '">' +
        '<div class="fo-head">' + av(p.author, p.ak, true) + '<span class="fo-name">' + esc(p.author) + '</span><span>· ' + esc(when(p.created_at)) + '</span></div>' +
        '<div class="fo-title">' + esc(p.title) + '</div>' +
        '<div>' + tags(p) + '</div>' +
        '<div class="fo-ex">' + esc(p.body) + (p.body.length >= 160 ? '…' : '') + '</div>' +
        '<div class="fo-meta"><span>👍 ' + p.likes + '</span><span>💬 ' + p.comments + '</span>' + (p.photos ? '<span>📷 ' + p.photos + '</span>' : '') +
        '<span style="margin-left:auto">Senast ' + esc(when(p.last_activity_at)) + '</span></div></div>';
    });
    root.innerHTML = h;
    paintAvatars();
  }

  // ---------- ett inlägg ----------
  function loadPost(id) {
    st.err = null;
    return rpc('forum_get', { p_id: id }).then(function (p) {
      st.post = p; st.photos[id] = null;
      if (window.FORUM_BADGE_REFRESH !== false) F.refreshBadge();
      if (p.photos) fn({ action: 'photos', post_id: id }).then(function (r) { st.photos[id] = r.photos || []; if (st.view === 'post' && st.post && st.post.id === id) drawPost(); }).catch(function () {});
    }).catch(function (e) { if (!fail(e)) st.err = errText(e); });
  }
  function drawPost() {
    var p = st.post, h = '<button class="fo-back" data-a="list">‹ Alla inlägg</button>';
    if (st.flash) { h += '<div class="vk-flash">' + esc(st.flash) + '</div>'; st.flash = null; }
    if (st.err && !p) { root.innerHTML = h + '<div class="tl-msg err">' + esc(st.err) + '</div>'; return; }
    if (!p) { root.innerHTML = h + '<div class="tl-msg">Laddar...</div>'; return; }
    h += '<div class="vk-card"><div class="fo-head">' + av(p.author, p.ak) + '<div><div class="fo-name">' + esc(p.author) + '</div><div>' + esc(when(p.created_at)) + (p.edited ? ' · ändrad' : '') + '</div></div></div>' +
      '<div class="fo-title" style="font-size:1.15rem">' + esc(p.title) + '</div><div style="margin-bottom:.4rem">' + tags(p) + '</div>' +
      '<div class="fo-body">' + esc(p.body) + '</div>';
    var ph = st.photos[p.id];
    if (p.photos) {
      h += '<div class="fo-photos">';
      if (!ph) for (var i = 0; i < p.photos; i++) h += '<img alt="Foto">';
      else ph.forEach(function (x) { h += '<img src="' + esc(x.url || '') + '" alt="Foto" data-a="zoom">'; });
      h += '</div>';
    }
    if (p.status) {
      h += '<div class="fo-status"><b>Status: ' + esc(stName(p.status)) + '</b>' + (p.status_by ? ' <span style="color:#718096">(' + esc(p.status_by) + ', ' + esc(when(p.status_at)) + ')</span>' : '') +
        (p.status_comment ? '<div class="fo-body" style="margin-top:.2rem">' + esc(p.status_comment) + '</div>' : '') + '</div>';
    }
    h += '<div class="fo-meta"><button class="fo-like' + (p.liked ? ' on' : '') + '" data-a="like"' + (p.can_write ? '' : ' disabled') + ' aria-pressed="' + (p.liked ? 'true' : 'false') + '">👍 ' + p.likes + '</button><span>💬 ' + p.comment_list.length + '</span></div>';
    var act = '';
    if (p.mine && p.can_write && p.has_name) act += '<button data-a="edit">Ändra</button>';
    if (p.is_admin && p.can_write) act += '<button data-a="hide">' + (p.hidden ? 'Visa igen' : 'Dölj') + '</button>';
    if ((p.mine || p.is_admin) && p.can_write) act += '<button class="vk-del" data-a="delpost">Ta bort</button>';
    if (act) h += '<div class="vk-iact">' + act + '</div>';
    h += '</div>';
    if (p.is_admin && p.can_write && p.has_name && (p.cat === 'forslag' || p.cat === 'buggar')) {
      h += '<div class="vk-card"><div class="vk-lbl">Ändra status (bara ägare och S admin)</div><div class="fo-chips">';
      STATUS.forEach(function (s) { h += '<button class="ank-chip' + (p.status === s[0] ? ' on' : '') + '" data-a="pick" data-s="' + s[0] + '">' + s[1] + '</button>'; });
      h += '</div><div class="vk-field"><textarea id="fo-stc" rows="2" maxlength="500" placeholder="Kommentar (valfritt)">' + esc(p.status_comment || '') + '</textarea></div>' +
        '<div class="vk-iact"><button data-a="status">Spara status</button></div></div>';
    }
    h += '<div class="vk-card"><div class="vk-lbl">Kommentarer</div>';
    if (!p.comment_list.length) h += '<div class="fo-ex">Inga kommentarer ännu.</div>';
    p.comment_list.forEach(function (c) {
      h += '<div class="fo-com' + (c.hidden ? ' hid' : '') + '"><div class="fo-head">' + av(c.author, c.ak, true) + '<span class="fo-name">' + esc(c.author) + '</span><span>· ' + esc(when(c.created_at)) + (c.edited ? ' · ändrad' : '') + '</span>' + (c.hidden ? ' <span class="fo-tag fo-hid">Dold</span>' : '') + '</div>';
      if (st.editCom === c.id) {
        h += '<div class="vk-field" style="margin-top:.3rem"><textarea id="fo-ec" rows="3" maxlength="2000">' + esc(c.body) + '</textarea></div><div class="vk-iact"><button data-a="comcancel">Avbryt</button><button data-a="comsave" data-id="' + c.id + '">Spara</button></div>';
      } else {
        h += '<div class="fo-body" style="margin-top:.2rem">' + esc(c.body) + '</div>';
        var s = '';
        if (c.mine && p.can_write && p.has_name) s += '<button data-a="comedit" data-id="' + c.id + '">Ändra</button>';
        if (p.is_admin && p.can_write) s += '<button data-a="comhide" data-id="' + c.id + '" data-h="' + (c.hidden ? '0' : '1') + '">' + (c.hidden ? 'Visa igen' : 'Dölj') + '</button>';
        if ((c.mine || p.is_admin) && p.can_write) s += '<button class="fo-danger" data-a="comdel" data-id="' + c.id + '">Ta bort</button>';
        if (s) h += '<div class="fo-small">' + s + '</div>';
      }
      h += '</div>';
    });
    if (p.can_write && !p.has_name) { h += '</div>' + nameBox(); h += '<div>'; }
    else if (p.can_write) {
      h += '<div class="vk-field" style="margin-top:.6rem"><textarea id="fo-com" rows="3" maxlength="2000" placeholder="Skriv en kommentar"></textarea></div>' +
        (st.err ? '<div class="fo-err">' + esc(st.err) + '</div>' : '') + '<div class="vk-iact"><button data-a="comment">Skicka</button></div>';
    }
    h += '</div>';
    st.err = null;
    root.innerHTML = h;
    paintAvatars();
  }

  // ---------- skriva / ändra inlägg ----------
  function shrink(file) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var tries = [[1280, 0.72], [1024, 0.6], [800, 0.5]], out = null;
        for (var i = 0; i < tries.length; i++) {
          var s = Math.min(1, tries[i][0] / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', tries[i][1]);
          if (out.length < 1300000) break;
        }
        URL.revokeObjectURL(url); ok(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('bad_image')); };
      img.src = url;
    });
  }
  function openEditor(p) {
    st.view = 'edit';
    st.edit = p ? { id: p.id, cat: p.cat, title: p.title, body: p.body, old: (st.photos[p.id] || []).slice(), files: [], msg: '' }
                : { id: null, cat: st.cat || 'allmant', title: '', body: '', old: [], files: [], msg: '' };
    push('edit');
    drawEditor();
  }
  function keepFields() {
    var e = st.edit, t = document.getElementById('fo-t'), b = document.getElementById('fo-b'), c = document.getElementById('fo-c');
    if (t) e.title = t.value; if (b) e.body = b.value; if (c) e.cat = c.value;
  }
  function drawEditor() {
    var e = st.edit, n = e.old.length + e.files.length;
    var h = '<button class="fo-back" data-a="cancel">‹ Avbryt</button><div class="vk-card"><div class="fo-title">' + (e.id ? 'Ändra inlägg' : 'Nytt inlägg') + '</div>' +
      '<div class="vk-field"><label class="vk-lbl" for="fo-c">Kategori</label><select id="fo-c">';
    CATS.forEach(function (c) { h += '<option value="' + c[0] + '"' + (e.cat === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; });
    h += '</select></div><div class="vk-field"><label class="vk-lbl" for="fo-t">Rubrik</label><input class="fo-in" id="fo-t" maxlength="120" value="' + esc(e.title) + '"></div>' +
      '<div class="vk-field"><label class="vk-lbl" for="fo-b">Text</label><textarea id="fo-b" rows="6" maxlength="5000">' + esc(e.body) + '</textarea></div>' +
      '<div class="vk-lbl">Foton (valfritt, högst 3)</div><div class="fo-photos">';
    e.old.forEach(function (x, i) { h += '<div class="fo-pw"><img src="' + esc(x.url || '') + '" alt="Foto"><button data-a="rmold" data-i="' + i + '" aria-label="Ta bort foto">✕</button></div>'; });
    e.files.forEach(function (u, i) { h += '<div class="fo-pw"><img src="' + u + '" alt="Nytt foto"><button data-a="rmnew" data-i="' + i + '" aria-label="Ta bort foto">✕</button></div>'; });
    h += '</div>' + (n < 3 ? '<div class="vk-iact"><button data-a="addphoto">📷 Lägg till foto</button></div>' : '') +
      (e.msg ? '<div class="fo-err">' + esc(e.msg) + '</div>' : '') +
      '<div class="vk-iact" style="margin-top:.8rem"><button data-a="save" style="background:var(--primary);color:var(--on-primary)"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Sparar...' : (e.id ? 'Spara' : 'Publicera')) + '</button></div></div>';
    root.innerHTML = h;
  }
  function saveEditor() {
    keepFields();
    var e = st.edit;
    if (!e.title.trim()) { e.msg = ERR.need_title; drawEditor(); return; }
    if (!e.body.trim()) { e.msg = ERR.need_text; drawEditor(); return; }
    st.busy = true; e.msg = ''; drawEditor();
    var id;
    rpc('forum_save_post', { p_id: e.id, p_category: e.cat, p_title: e.title, p_body: e.body }).then(function (r) {
      id = r;
      var chain = Promise.resolve();
      (e.removed || []).forEach(function (pid) { chain = chain.then(function () { return fn({ action: 'delete_photo', photo_id: pid }); }); });
      e.files.forEach(function (u) { chain = chain.then(function () { return fn({ action: 'upload', post_id: id, image: u.split(',')[1] }); }); });
      return chain;
    }).then(function () {
      st.busy = false; st.flash = e.id ? 'Inlägget är ändrat.' : 'Inlägget är publicerat.';
      st.view = 'post'; st.post = null; st.edit = null;
      try { history.replaceState({ view: F.id, sub: 'post' }, ''); } catch (x) {}
      drawPost(); return loadPost(id).then(drawPost);
    }).catch(function (x) {
      st.busy = false;
      if (fail(x)) return;
      if (id && !e.id) { e.id = id; e.files = []; e.msg = 'Inlägget sparades, men ett foto gick inte att ladda upp. ' + errText(x); }
      else e.msg = errText(x);
      drawEditor();
    });
  }

  // ---------- klick ----------
  function onClick(ev) {
    var el = ev.target.closest('[data-a]');
    if (!el || !root.contains(el) || el.disabled) return;
    var a = el.getAttribute('data-a'), id = +el.getAttribute('data-id') || null, p = st.post;
    if (a === 'cat') { st.cat = el.getAttribute('data-c') || null; st.list = null; drawList(); loadList().then(drawList); }
    else if (a === 'open') { st.view = 'post'; st.post = null; push('post'); drawPost(); loadPost(id).then(drawPost); }
    else if (a === 'list') { history.back(); }
    else if (a === 'readall') { rpc('forum_notices', { p_mark_read: true }).then(function () { setUnread(0); st.notices = []; drawList(); }).catch(function (e) { fail(e); }); }
    else if (a === 'new') { openEditor(null); }
    else if (a === 'edit') { openEditor(p); }
    else if (a === 'cancel') { history.back(); }
    else if (a === 'addphoto') {
      keepFields();
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
        shrink(f).then(function (u) { st.edit.files.push(u); st.edit.msg = ''; drawEditor(); }).catch(function () { st.edit.msg = ERR.bad_image; drawEditor(); });
      };
      document.body.appendChild(inp); inp.click();
    }
    else if (a === 'rmnew') { keepFields(); st.edit.files.splice(+el.getAttribute('data-i'), 1); drawEditor(); }
    else if (a === 'rmold') { keepFields(); var o = st.edit.old.splice(+el.getAttribute('data-i'), 1)[0]; (st.edit.removed = st.edit.removed || []).push(o.id); drawEditor(); }
    else if (a === 'save') { saveEditor(); }
    else if (a === 'zoom') {
      var z = document.createElement('div'); z.className = 'fo-zoom'; z.innerHTML = '<img alt="Foto" src="' + esc(el.getAttribute('src')) + '">';
      z.onclick = function () { z.remove(); }; document.body.appendChild(z);
    }
    else if (a === 'like') {
      el.disabled = true;
      rpc('forum_like', { p_post_id: p.id, p_like: !p.liked }).then(function (r) { p.likes = r.likes; p.liked = r.liked; drawPost(); })
        .catch(function (e) { if (!fail(e)) { st.err = errText(e); drawPost(); } });
    }
    else if (a === 'comment') {
      var t = document.getElementById('fo-com'), v = t ? t.value : '';
      if (!v.trim()) { st.err = ERR.need_text; drawPost(); return; }
      el.disabled = true;
      rpc('forum_add_comment', { p_post_id: p.id, p_body: v }).then(function () { return loadPost(p.id); }).then(drawPost)
        .catch(function (e) { el.disabled = false; if (!fail(e)) { st.err = errText(e); drawPost(); var t2 = document.getElementById('fo-com'); if (t2) t2.value = v; } });
    }
    else if (a === 'comedit') { st.editCom = id; drawPost(); }
    else if (a === 'comcancel') { st.editCom = null; drawPost(); }
    else if (a === 'comsave') {
      var ec = document.getElementById('fo-ec');
      rpc('forum_edit_comment', { p_id: id, p_body: ec ? ec.value : '' }).then(function () { st.editCom = null; return loadPost(p.id); }).then(drawPost)
        .catch(function (e) { if (!fail(e)) alert(errText(e)); });
    }
    else if (a === 'comdel') {
      if (!confirm('Ta bort kommentaren?')) return;
      rpc('forum_delete_comment', { p_id: id }).then(function () { return loadPost(p.id); }).then(drawPost).catch(function (e) { if (!fail(e)) alert(errText(e)); });
    }
    else if (a === 'comhide') {
      rpc('forum_hide', { p_post_id: null, p_comment_id: id, p_hidden: el.getAttribute('data-h') === '1' }).then(function () { return loadPost(p.id); }).then(drawPost)
        .catch(function (e) { if (!fail(e)) alert(errText(e)); });
    }
    else if (a === 'hide') {
      rpc('forum_hide', { p_post_id: p.id, p_comment_id: null, p_hidden: !p.hidden }).then(function () { st.flash = p.hidden ? 'Inlägget syns igen.' : 'Inlägget är dolt. Bara du, S admin/ägaren och den som skrev det ser det.'; return loadPost(p.id); }).then(drawPost)
        .catch(function (e) { if (!fail(e)) alert(errText(e)); });
    }
    else if (a === 'delpost') {
      if (!confirm('Ta bort inlägget med alla kommentarer och foton?')) return;
      fn({ action: 'delete_post', post_id: p.id }).then(function () { st.flash = 'Inlägget är borttaget.'; history.back(); })
        .catch(function (e) { if (!fail(e)) alert(errText(e)); });
    }
    else if (a === 'setname') {
      var fnv = (document.getElementById('fo-fn') || {}).value || '', lnv = (document.getElementById('fo-ln') || {}).value || '';
      if (!fnv.trim()) { st.nameErr = ERR.need_first_name; st.view === 'post' ? drawPost() : drawList(); return; }
      el.disabled = true;
      rpc('forum_set_name', { p_first: fnv, p_last: lnv }).then(function (r) {
        st.nameErr = null; st.flash = 'Tack! Du visas som ' + r.name + ' i forumet.';
        if (st.view === 'post' && p) return loadPost(p.id).then(drawPost);
        return loadList().then(drawList);
      }).catch(function (e) { el.disabled = false; if (!fail(e)) { st.nameErr = errText(e); st.view === 'post' ? drawPost() : drawList(); } });
    }
    else if (a === 'pick') { st.pick = el.getAttribute('data-s'); root.querySelectorAll('[data-a="pick"]').forEach(function (b) { b.classList.toggle('on', b === el); }); }
    else if (a === 'status') {
      var s = st.pick || p.status, c = document.getElementById('fo-stc');
      el.disabled = true;
      rpc('forum_set_status', { p_id: p.id, p_status: s, p_comment: c ? c.value : '' }).then(function () { st.pick = null; st.flash = 'Statusen är sparad.'; return loadPost(p.id); }).then(drawPost)
        .catch(function (e) { el.disabled = false; if (!fail(e)) alert(errText(e)); });
    }
  }

  F.render = function (content) {
    root = content;
    if (!root._foClick) { root._foClick = true; }
    content.onclick = onClick;
    st.view = 'list'; st.post = null; st.edit = null; st.editCom = null;
    drawList();
    loadList().then(function () { if (st.view === 'list' && root === content) drawList(); });
  };
  // Bakåtknappen: inne i ett inlägg eller i skrivläget går vi tillbaka till listan i stället för att lämna forumet
  F.back = function () {
    if (st.view === 'list' || !root) return false;
    st.view = 'list'; st.post = null; st.edit = null; st.editCom = null; st.busy = false;
    drawList(); loadList().then(function () { if (st.view === 'list') drawList(); });
    return true;
  };
  F.refreshBadge = function () {
    if (!token()) return;
    rpc('forum_badge', {}).then(function (n) { setUnread(n); }).catch(function () {});
  };
})();
