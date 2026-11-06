/* Samma statusord överallt (2026-11-06, Christians "kör" t962u)
 * Alla ärenden (felanmälan, behövs till bilen, verkstadstid, uppgift, sjukanmälan, önskemål, forum-förslag)
 * visas med fyra ord: Ny, Pågår, Väntar på svar, Klar. Värdena i databasen ändras inte, bara orden i appen.
 * Samma tabell finns i databasen: private.case_st (supabase/migrations/20261106f_inkorg_arenden.sql).
 * Används av inkorg.js (förarens Inkorg) och arenden-admin.js (Admin › Ärenden).
 */
(function () {
  var A = window.ARENDE = {};
  A.WORDS = { ny: 'Ny', pagar: 'Pågår', vantar: 'Väntar på svar', klar: 'Klar' };
  A.ORDER = ['ny', 'pagar', 'vantar', 'klar'];

  // Gammalt värde → nytt ord. kind: issue | wh | task | sjuk | wish | forum
  A.st = function (kind, status, waiting) {
    switch (kind) {
      case 'issue': return status === 'ny' ? 'ny' : status === 'pagar' ? 'pagar' : 'klar';
      case 'wh': return status === 'pending' ? (waiting === 'driver' ? 'vantar' : waiting === 'owner' ? 'pagar' : 'ny') : 'klar';
      case 'task': return status === 'ny' ? 'vantar' : status === 'bokad' ? 'pagar' : 'klar';
      case 'sjuk': return status === 'ny' ? 'ny' : status === 'intyg_begart' ? 'vantar' : 'klar';
      case 'wish': return status === 'ny' ? 'ny' : (status === 'last' || status === 'planerad') ? 'pagar' : 'klar';
      case 'forum': return status === 'ny' ? 'ny' : (status === 'pagar' || status === 'planerad') ? 'pagar' : status === 'klar' ? 'klar' : null;
    }
    return null;
  };
  // Litet extra ord när det gamla ordet säger något mer (t.ex. Klar · nekad)
  A.detail = function (kind, status) {
    var d = {
      wh: { approved: 'godkänd', rejected: 'nekad' },
      task: { bokad: 'tid bokad' },
      sjuk: { intyg_begart: 'läkarintyg', godkand: 'godkänd', avslagen: 'avslagen' },
      wish: { last: 'läst', planerad: 'planerad', inte_nu: 'inte nu' },
      forum: { planerad: 'planerad' }
    }[kind];
    return (d && d[status]) || '';
  };
  A.label = function (kind, status, waiting) {
    var s = A.st(kind, status, waiting), d = A.detail(kind, status);
    return s ? A.WORDS[s] + (d ? ' · ' + d : '') : '';
  };
  A.chip = function (st, detail) {
    if (!st) return '';
    return '<span class="ar-chip ar-' + st + '">' + A.WORDS[st] + (detail ? ' · ' + esc(detail) : '') + '</span>';
  };
  A.needsTag = function (txt) { return '<span class="ar-needs">✋ ' + esc(txt || 'Behöver ditt svar') + '</span>'; };

  A.icon = function (it) {
    if (it.kind === 'issue') return it.title === 'Bilen står' ? '🛑' : it.title === 'Felanmälan' ? '⚠️' : '🧴';
    return { wh: '⏱️', task: '📋', sjuk: '🤒', wish: '💡' }[it.kind] || '📄';
  };

  // Filterchips: Alla (öppna) · Behöver ditt svar · Ny · Pågår · Väntar på svar · Klar
  A.filters = function (items, active, fn) {
    var c = { alla: 0, needs: 0, ny: 0, pagar: 0, vantar: 0, klar: 0 };
    (items || []).forEach(function (x) { c[x.st] = (c[x.st] || 0) + 1; if (x.st !== 'klar') c.alla++; if (x.needs) c.needs++; });
    var defs = [['alla', 'Alla öppna'], ['needs', '✋ Behöver ditt svar'], ['ny', 'Ny'], ['pagar', 'Pågår'], ['vantar', 'Väntar på svar'], ['klar', 'Klar']];
    return '<div class="ar-filters" role="tablist">' + defs.map(function (d) {
      return '<button type="button" class="ar-f' + (active === d[0] ? ' on' : '') + (d[0] === 'needs' && c.needs ? ' hot' : '') + '" onclick="' + fn + '(\'' + d[0] + '\')">' +
        d[1] + ' <b>' + c[d[0]] + '</b></button>';
    }).join('') + '</div>';
  };
  // Vilka rader syns: open = öppna (enligt filtret), done = klara (visas bara under "Visa klara (N)" eller i filtret Klar)
  A.split = function (items, f) {
    items = items || [];
    if (f === 'klar') return { open: items.filter(function (x) { return x.st === 'klar'; }).sort(function (a, b) { return new Date(b.at) - new Date(a.at); }), done: [] };
    var open = items.filter(function (x) {
      if (x.st === 'klar') return false;
      if (f === 'needs') return x.needs;
      if (f && f !== 'alla') return x.st === f;
      return true;
    });
    var byAt = function (a, b) { return new Date(b.at) - new Date(a.at); };   // klara: senast först
    var done = (f === 'alla' || !f) ? items.filter(function (x) { return x.st === 'klar'; }).sort(byAt) : [];
    return { open: open, done: done };
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  A.esc = esc;
  A.ago = function (iso) {
    if (!iso) return '';
    var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return 'nyss';
    if (s < 3600) return Math.floor(s / 60) + ' min sedan';
    if (s < 86400) return Math.floor(s / 3600) + ' tim sedan';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var days = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (days === 1) return 'i går';
    if (days < 7) return days + ' dagar sedan';
    return d.getDate() + '/' + (d.getMonth() + 1) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  };
  A.when = function (iso) {
    if (!iso) return '';
    var d = new Date(iso), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  A.rpc = function (name, args) {
    args = args || {};
    args.p_token = localStorage.getItem('taxi_session') || '';
    /* global TRIP_API_URL, TRIP_API_KEY, SUPABASE_URL, SUPABASE_KEY */
    var url = typeof TRIP_API_URL !== 'undefined' ? TRIP_API_URL : typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
    var key = typeof TRIP_API_KEY !== 'undefined' ? TRIP_API_KEY : typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '';
    return fetch(url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.text().then(function (t) {
        var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var er = new Error((b && b.message) || ('HTTP ' + r.status)); er.code = b && b.code; throw er; }
        return b;
      });
    });
  };
  A.ERR = { need_text: 'Skriv något först.', msg_too_long: 'Texten är för lång.', comment_too_long: 'Texten är för lång.',
    too_many: 'Du har skrivit väldigt många meddelanden i dag. Försök i morgon.', not_editable: 'Det här ärendet går inte att ändra längre.',
    not_found: 'Ärendet finns inte längre.', forbidden: 'Du har inte behörighet till det här.', overlap: 'Tiden krockar med en annan verkstadstid.' };
  A.errText = function (e) { return A.ERR[e && e.message] || 'Det gick inte. Kontrollera nätet och försök igen.'; };

  // Gemensam stil (mobil först)
  var css = '' +
    '.ar-chip{display:inline-block;font-size:.74em;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;vertical-align:middle}' +
    '.ar-ny{background:#e0ecff;color:#1e4e9c}.ar-pagar{background:#fff2cc;color:#7a5200}.ar-vantar{background:#ffe1cc;color:#8a3a00}.ar-klar{background:#dcf5e3;color:#1d6b38}' +
    '.ar-needs{display:inline-block;font-size:.74em;font-weight:700;padding:2px 8px;border-radius:999px;background:#c2410c;color:#fff;white-space:nowrap;vertical-align:middle}' +
    '.ar-filters{display:flex;gap:6px;overflow-x:auto;padding:2px 0 10px;-webkit-overflow-scrolling:touch;scrollbar-width:none}.ar-filters::-webkit-scrollbar{display:none}' +
    '.ar-f{flex:0 0 auto;border:1px solid var(--border,#cbd5e0);background:var(--surface,#fff);color:var(--text,#1a202c);border-radius:999px;padding:6px 11px;font-size:.84em;cursor:pointer}' +
    '.ar-f b{font-weight:700;opacity:.7;margin-left:2px}.ar-f.on{background:var(--primary,#0a3d62);border-color:var(--primary,#0a3d62);color:#fff}.ar-f.hot:not(.on){border-color:#c2410c;color:#c2410c}' +
    '.ar-h{font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--c-718096,#718096);margin:14px 2px 6px}' +
    '.ar-list{background:var(--surface,#fff);border:1px solid var(--border-soft,#e2e8f0);border-radius:12px;overflow:hidden}' +
    '.ar-row{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--border-soft,#e2e8f0);padding:11px 12px;cursor:pointer;color:inherit;font:inherit}' +
    '.ar-row:last-child{border-bottom:0}.ar-row.need{background:#fff7ed}.ar-row.done{opacity:.72}' +
    '.ar-ico{font-size:1.25em;line-height:1.2;flex:0 0 auto}.ar-main{flex:1;min-width:0}' +
    '.ar-t{display:flex;gap:6px;align-items:center;justify-content:space-between}.ar-t b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.96em}' +
    '.ar-s{font-size:.84em;color:var(--c-4a5568,#4a5568);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ar-m{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:5px;font-size:.78em;color:var(--c-718096,#718096)}' +
    '.ar-dot{width:9px;height:9px;border-radius:50%;background:#e53e3e;flex:0 0 auto;margin-top:6px}' +
    '.ar-more{display:block;width:100%;margin:10px 0 0;padding:11px;border-radius:10px;border:1px dashed var(--border,#cbd5e0);background:transparent;color:var(--text,#1a202c);font:inherit;font-size:.9em;cursor:pointer}' +
    '.ar-empty{padding:18px 14px;color:var(--c-718096,#718096);text-align:center;font-size:.92em}' +
    '.ar-back{background:none;border:0;color:var(--c-3182ce,#3182ce);font:inherit;font-size:.95em;padding:4px 0 10px;cursor:pointer}' +
    '.ar-card{background:var(--surface,#fff);border:1px solid var(--border-soft,#e2e8f0);border-radius:12px;padding:12px}' +
    '.ar-ct{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}.ar-ct h2{font-size:1.08em;margin:0}' +
    '.ar-body{margin:10px 0 2px;white-space:pre-wrap;word-break:break-word}' +
    '.ar-thr{margin-top:12px;display:flex;flex-direction:column;gap:8px}' +
    '.ar-msg{max-width:86%;padding:8px 10px;border-radius:12px;background:var(--c-edf2f7,#edf2f7);font-size:.93em;white-space:pre-wrap;word-break:break-word}' +
    '.ar-msg.me{align-self:flex-end;background:#dbeafe}.ar-msg .w{display:block;font-size:.78em;color:var(--c-718096,#718096);margin-bottom:2px}' +
    '.ar-msg.sys{align-self:center;background:transparent;border:1px dashed var(--border,#cbd5e0);font-size:.82em;color:var(--c-4a5568,#4a5568);text-align:center}' +
    '.ar-reply{margin-top:12px}.ar-reply textarea{width:100%;min-height:74px;border-radius:10px;border:1px solid var(--border,#cbd5e0);padding:9px;font:inherit;box-sizing:border-box;background:var(--surface,#fff);color:inherit}' +
    '.ar-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.ar-btns button{flex:1 1 auto;padding:10px 12px;border-radius:10px;border:1px solid var(--border,#cbd5e0);background:var(--surface,#fff);color:inherit;font:inherit;font-size:.92em;cursor:pointer}' +
    '.ar-btns .pri{background:var(--primary,#0a3d62);border-color:var(--primary,#0a3d62);color:#fff}.ar-btns .ok{background:#dcf5e3;border-color:#9ad8ad;color:#1d6b38}' +
    '.ar-tools{margin-top:12px;padding-top:10px;border-top:1px solid var(--border-soft,#e2e8f0)}.ar-tools .ar-h{margin-top:0}' +
    '.ar-card [data-ar-certs]{margin-top:14px}.ar-card [data-ar-certs] h3{font-size:.9em;margin:0 0 8px}' +
    '.ar-card .ar-cert-files{display:flex;gap:8px;flex-wrap:wrap}.ar-card .ar-cert-files button{min-height:44px;max-width:100%;padding:10px 12px;border:1px solid var(--border,#cbd5e0);border-radius:9px;background:var(--surface,#fff);color:inherit;font:inherit;font-size:.9em;cursor:pointer}.ar-cert-files button:disabled{opacity:.6}' +
    '.ar-note{font-size:.8em;color:var(--c-718096,#718096);margin-top:10px}' +
    '.ar-badge{display:inline-block;min-width:20px;height:20px;line-height:20px;border-radius:10px;background:#c2410c;color:#fff;font-size:12px;font-weight:700;padding:0 6px;text-align:center}' +
    '.icon{position:relative}.icon .ar-badge{position:absolute;top:6px;right:6px}';
  var s = document.createElement('style'); s.id = 'arende-css'; s.textContent = css;
  (document.head || document.documentElement).appendChild(s);
})();

/* Ett ärende med tråd (samma utseende i Inkorgen och i Admin › Ärenden).
 * c = svar från case_get: { kind, id, st, admin, data }. viewer: 'driver' | 'owner'
 */
(function () {
  var A = window.ARENDE, esc = A.esc;
  var SUP = { kvitto: 'Kvittorullar', spolar: 'Spolarvätska', rengoring: 'Rengöring', annat: 'Behövs till bilen' };
  var LOG = { skapad: 'Skapad', flyttad: 'Flyttad', andrad: 'Ändrad', bokad: 'Bokad tid', svar: 'Svar', bockad: 'Bockade av', obockad: 'Tog bort bock', klar: 'Klar' };
  function fname(s) { return window.shortName ? shortName(s) : s; }

  A.title = function (c) {
    var d = c.data || {};
    if (c.kind === 'issue') return d.kind === 'fault' ? (d.blocking ? 'Bilen står' : 'Felanmälan') : (SUP[d.supply] || 'Behövs till bilen');
    if (c.kind === 'wh') return 'Verkstadstid';
    if (c.kind === 'task') return d.title || 'Uppgift';
    if (c.kind === 'sjuk') return 'Sjukanmälan';
    if (c.kind === 'wish') return 'Önskemål';
    return 'Ärende';
  };
  A.iconOf = function (c) {
    var d = c.data || {};
    if (c.kind === 'issue') return d.kind === 'fault' ? (d.blocking ? '🛑' : '⚠️') : '🧴';
    return { wh: '⏱️', task: '📋', sjuk: '🤒', wish: '💡' }[c.kind] || '📄';
  };
  function sys(t, at, extra) { return '<div class="ar-msg sys">' + t + (at ? ' · ' + esc(A.when(at)) : '') + (extra ? '<br>' + extra : '') + '</div>'; }
  function msg(who, at, body, me) { return '<div class="ar-msg' + (me ? ' me' : '') + '"><span class="w">' + who + ' · ' + esc(A.when(at)) + '</span>' + esc(body) + '</div>'; }

  // Intyg finns redan i privata sjuk-intyg. Edge → databas kontrollerar ägare/förare
  // innan några 15-minuterslänkar skapas. Inga intyg eller länkar sparas lokalt.
  function certList(id) {
    var url = typeof TRIP_API_URL !== 'undefined' ? TRIP_API_URL : typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
    var key = typeof TRIP_API_KEY !== 'undefined' ? TRIP_API_KEY : typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '';
    return fetch(url + '/functions/v1/sjuk', {
      method: 'POST', cache: 'no-store',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', report_id: id, token: localStorage.getItem('taxi_session') || '' })
    }).then(function (r) {
      if (!r.ok) { var e = new Error('certs_unavailable'); e.denied = r.status === 403; throw e; }
      return r.json();
    }).then(function (b) { return b.certs || []; });
  }
  function certURL(x) {
    var base = typeof TRIP_API_URL !== 'undefined' ? TRIP_API_URL : typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
    if (!x || !x.url) throw new Error('certs_unavailable');
    var u = new URL(x.url, base + '/');
    if (u.protocol !== 'https:' || u.origin !== new URL(base).origin || u.pathname.indexOf('/storage/v1/object/sign/sjuk-intyg/') !== 0) throw new Error('certs_unavailable');
    return u.href;
  }
  function certError(el, e) {
    el.textContent = e && e.denied ? 'Du har inte behörighet att öppna intygen.' : 'Kunde inte öppna intygen. Försök igen eller ladda om sidan.';
  }
  A.mountCertificates = function (c, root) {
    var box = c.kind === 'sjuk' && root.querySelector('[data-ar-certs]');
    if (!box) return Promise.resolve();
    var message = box.querySelector('[role="status"]');
    return certList(c.id).then(function (certs) {
      if (!box.isConnected) return;
      box.querySelector('.ar-cert-files').textContent = '';
      message.textContent = certs.length ? 'Privata filer. En ny säker länk hämtas när du öppnar ett intyg.' : 'Inga uppladdade intyg.';
      certs.forEach(function (cert, ix) {
        var button = document.createElement('button'); button.type = 'button';
        button.textContent = '📄 Intyg ' + (ix + 1) + (cert.mime === 'application/pdf' ? ' · PDF' : ' · Bild');
        button.onclick = function () {
          // Öppna tabben i själva trycket, så även mobilens popupskydd tillåter den.
          // Länken hämtas på nytt vid VARJE öppning (aldrig en utgången eller cachad länk).
          var tab = window.open('about:blank', '_blank');
          if (tab) { tab.opener = null; tab.document.title = 'Läkarintyg'; tab.document.body.textContent = 'Hämtar en säker länk…'; }
          button.disabled = true;
          certList(c.id).then(function (fresh) {
            if (!box.isConnected) { if (tab) tab.close(); return; }
            var file = fresh.filter(function (x) { return x.id === cert.id; })[0], url = certURL(file);
            if (tab) tab.location.replace(url);
            else {
              var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
              a.textContent = 'Tryck här för att öppna intyget'; message.textContent = ''; message.appendChild(a);
            }
          }).catch(function (e) { if (tab) tab.close(); if (box.isConnected) certError(message, e); })
            .finally(function () { button.disabled = false; });
        };
        box.querySelector('.ar-cert-files').appendChild(button);
      });
    }).catch(function (e) { if (box.isConnected) certError(message, e); });
  };

  A.view = function (c, viewer) {
    var d = c.data || {}, raw = d.status, h = '', rows = [], meta = [];
    var other = viewer === 'owner' ? 'Föraren' : 'Ägaren';
    if (c.kind === 'issue') {
      if (d.car) meta.push('Bil ' + esc(d.car));
      meta.push('Anmäld ' + esc(A.when(d.created_at)));
      if (viewer === 'owner' && d.reporter_name) meta.push('av ' + esc(fname(d.reporter_name)));
      if (d.photos) meta.push('📷 ' + d.photos);
      var hist = d.history || [];
      hist.forEach(function (u, ix) {
        if (ix === 0 && u.status === 'ny') return;   // första raden = skapad
        rows.push({ at: u.at, h: sys(u.status === 'ny' ? '↩️ Öppnad igen' : 'Status: ' + A.WORDS[A.st('issue', u.status)], u.at, u.comment ? '"' + esc(u.comment) + '"' : '') });
      });
      (d.msgs || []).forEach(function (m) {
        var me = viewer === 'owner' ? m.role === 'owner' : m.role === 'driver';
        rows.push({ at: m.at, h: msg(me ? 'Du' : esc(fname(m.who) || other), m.at, m.body, me) });
      });
    } else if (c.kind === 'wh') {
      if (d.car) meta.push('Bil ' + esc(d.car));
      meta.push(esc(A.when(d.start)) + '–' + esc(A.when(d.end).split(' ')[1] || ''));
      if (d.minutes != null) meta.push(Math.floor(d.minutes / 60) + ' h ' + (d.minutes % 60) + ' min');
      if (viewer === 'owner' && d.reporter_name) meta.push(esc(fname(d.reporter_name)));
      (d.msgs || []).forEach(function (m) {
        var me = viewer === 'owner' ? m.role === 'owner' : m.role === 'driver';
        if (m.kind === 'approved') rows.push({ at: m.at, h: sys('✅ Klar · godkänd', m.at, m.body ? '"' + esc(m.body) + '"' : '') });
        else if (m.kind === 'rejected') rows.push({ at: m.at, h: sys('❌ Klar · nekad', m.at, m.body ? '"' + esc(m.body) + '"' : '') });
        else if (m.kind === 'reopen') rows.push({ at: m.at, h: sys('↩️ Öppnad igen', m.at) });
        else rows.push({ at: m.at, h: msg(me ? 'Du' : (m.role === 'owner' ? 'Ägaren' : esc(fname(m.who) || 'Föraren')), m.at, m.body, me) });
      });
    } else if (c.kind === 'task') {
      if (d.car) meta.push('Bil ' + esc(d.car));
      if (viewer === 'owner' && d.assigned_name) meta.push('till ' + esc(fname(d.assigned_name)));
      if (d.booked_at) meta.push('📅 ' + esc(A.when(d.booked_at)) + (d.booked_place ? ' · ' + esc(d.booked_place) : ''));
      var items = d.items || [];
      if (items.length) meta.push('Checklista ' + items.filter(function (x) { return x.done; }).length + '/' + items.length);
      (d.log || []).forEach(function (l) { rows.push({ at: l.at, h: sys((LOG[l.action] || esc(l.action)) + (l.by_name ? ' – ' + esc(fname(l.by_name)) : ''), l.at, l.detail ? esc(l.detail) : '') }); });
    } else if (c.kind === 'sjuk') {
      meta.push('Från ' + esc(String(d.start || '').slice(5).split('-').reverse().join('/')) + (d.end ? ' till ' + esc(String(d.end).slice(5).split('-').reverse().join('/')) : ' · pågår'));
      if (viewer === 'owner' && d.name) meta.push(esc(fname(d.name)));
      if (d.certs) meta.push('📄 Intyg: ' + d.certs);
      if (d.status_at) rows.push({ at: d.status_at, h: sys('Status: ' + A.label('sjuk', d.status), d.status_at, d.status_comment ? (d.status_by ? esc(fname(d.status_by)) + ': ' : '') + '"' + esc(d.status_comment) + '"' : '') });
    } else if (c.kind === 'wish') {
      meta.push('Skrivet ' + esc(A.when(d.created_at)));
      if (viewer === 'owner' && d.author && !d.mine) meta.push('av ' + esc(fname(d.author)));
      if (d.reply) rows.push({ at: d.updated_at, h: msg('Christian', d.updated_at, d.reply, false) });
    }
    rows.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    var body = c.kind === 'issue' ? d.body : c.kind === 'wh' ? d.comment : c.kind === 'task' ? d.instruction : c.kind === 'sjuk' ? d.comment : c.kind === 'wish' ? d.body : '';
    h += '<div class="ar-card"><div class="ar-ct"><h2>' + A.iconOf(c) + ' ' + esc(A.title(c)) + '</h2>' + A.chip(c.st, A.detail(c.kind, raw)) + '</div>';
    h += '<div class="ar-m">' + meta.join(' · ') + '</div>';
    if (body) h += '<div class="ar-body">' + esc(body) + '</div>';
    if (c.kind === 'sjuk' && d.certs) h += '<section data-ar-certs aria-label="Läkarintyg"><h3>Läkarintyg</h3><div class="ar-cert-files"></div><div class="ar-note" role="status">Hämtar intyg…</div></section>';
    h += rows.length ? '<div class="ar-thr">' + rows.map(function (r) { return r.h; }).join('') + '</div>' : '<div class="ar-note">Inga meddelanden än.</div>';
    return h;   // kortet stängs av den som anropar (svarsruta/verktyg läggs till först)
  };
})();
