/* Offentlig förarprofil: översikt, redigera, galleri, gästbok.
 * "Profil" i menyn öppnar den här sidan. Personuppgifter/lösenord nås via Redigera profil.
 * Namn = förnamn + efternamnsinitial (forum_name). Inga smeknamn, inga poäng/badges.
 * RPC: profile_get / profile_save / profile_guestbook_* · galleri via edge profil-galleri.
 */
(function () {
  'use strict';
  var P = window.PROFIL_SIDA = {};
  var EDGE = 'https://lpfdryvukqmjlgenuzpb.supabase.co/functions/v1/profil-galleri';
  var KEY = (typeof TRIP_API_KEY !== 'undefined' && TRIP_API_KEY) || 'sb_publishable_7LwIOZ5ygRvJqJKFxl4cNQ_LvrzrHrP';
  var API = (typeof TRIP_API_URL !== 'undefined' && TRIP_API_URL) || 'https://lpfdryvukqmjlgenuzpb.supabase.co';

  var VIS_FIELDS = [
    ['home_zone', 'Hemmazon'],
    ['fav_zone', 'Favoritzon'],
    ['shift', 'Pass'],
    ['languages', 'Språk'],
    ['bio', 'Om mig'],
    ['hobbies', 'Hobbyer'],
    ['permits', 'Behörigheter / erfarenhet'],
    ['also_uber_bolt', 'Kör även Uber/Bolt'],
    ['fun_tip', 'Bästa tipset'],
    ['taxi_start_year', 'Startår i taxi']
  ];
  var MONTHS = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
  var LEVELS = ['Modersmål','Flytande','Bra','Grundläggande'];
  var LICENCES = ['AM','A1','A2','A','B','BE','C1','C1E','C','CE','D1','D1E','D','DE','Taxiförarlegitimation','Serviceresor'];
  function option(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>';
  }
  function languageName(code) {
    var item = (window.PROFIL_SPRAK || []).find(function (x) { return x[0] === code; });
    return item ? item[1] : code;
  }
  function languageCode(name) {
    var n = name.trim().toLocaleLowerCase('sv');
    var aliases = {svenska:'sv',engelska:'en',arabiska:'ar',persiska:'fa',farsi:'fa',somaliska:'so'};
    if (aliases[n]) return aliases[n];
    var item = (window.PROFIL_SPRAK || []).find(function (x) { return x[0] === n || x[1].toLocaleLowerCase('sv') === n; });
    return item ? item[0] : name.trim();
  }
  function languageRows(text) {
    if (!text) return [];
    var pieces = String(text).split('\n');
    if (pieces.length === 1 && /[,;]/.test(text)) {
      var tentative = text.split(/[,;]/).map(function (x) { return x.trim(); });
      if (tentative.every(function (x) { return languageCode(x) !== x || (window.PROFIL_SPRAK || []).some(function (r) { return r[0] === x; }); })) pieces = tentative;
    }
    return pieces.filter(Boolean).map(function (x) {
      var m = x.match(/^(.*) \((Modersmål|Flytande|Bra|Grundläggande)\)$/);
      return { code: languageCode(m ? m[1] : x), level: m ? m[2] : '' };
    });
  }
  function languageOptions(selected, query) {
    var q = (query || '').toLocaleLowerCase('sv');
    var all = window.PROFIL_SPRAK || [];
    var matches = all.filter(function (x) { return !q || (x[0] + ' ' + x[1]).toLocaleLowerCase('sv').indexOf(q) >= 0; });
    // Bound mobile DOM size; the entire 7,910-language catalog is searchable.
    var shown = matches.slice(0, 150);
    if (selected && !shown.some(function (x) { return x[0] === selected; })) shown.unshift([selected, languageName(selected)]);
    return option('', 'Välj språk' + (matches.length > 150 ? ' – sök för fler' : ''), selected) + shown.map(function (x) { return option(x[0], x[1], selected); }).join('');
  }
  function languageRow(row) {
    return '<div class="ps-language"><input class="ps-language-search" aria-label="Sök bland alla språk" placeholder="Sök språk…">' +
      '<select class="ps-language-name" aria-label="Språk">' + languageOptions(row.code) + '</select>' +
      '<div class="ps-language-bottom"><select class="ps-language-level" aria-label="Språknivå">' + option('', 'Välj nivå', row.level) + LEVELS.map(function (x) { return option(x,x,row.level); }).join('') +
      '</select><button type="button" data-a="lang-remove" aria-label="Ta bort språk">×</button></div></div>';
  }
  function permitsHtml(text) {
    var values = String(text || '').split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
    var unknown = values.filter(function (x) { return !LICENCES.some(function (v) { return v.toLowerCase() === x.toLowerCase(); }); });
    return '<div class="ps-permit-chips">' + LICENCES.map(function (x) {
      return '<label><input type="checkbox" data-permit="' + esc(x) + '"' + (values.some(function (v) { return v.toLowerCase() === x.toLowerCase(); }) ? ' checked' : '') + '> ' + esc(x) + '</label>';
    }).join('') + '</div><label for="ps-perm-legacy">Tidigare uppgifter / övrig erfarenhet</label><textarea id="ps-perm-legacy" maxlength="400">' + esc(unknown.join(', ')) + '</textarea>';
  }
  var SHIFT = { dag: 'Dag', natt: 'Natt', extra: 'Extra' };
  var ERR = {
    via_master: 'Du är inloggad med huvudlösenordet. Bara föraren själv kan ändra profilen.',
    demo_read_only: 'Det här är ett demokonto. Du kan titta runt men inte ändra något.',
    need_text: 'Skriv något först.',
    text_too_long: 'Texten är för lång.',
    too_many: 'Du har skrivit väldigt mycket idag. Försök igen i morgon.',
    forbidden: 'Det får du inte göra.',
    need_first_name: 'Fyll i ditt förnamn först.',
    not_found: 'Profilen finns inte.',
    bad_kind: 'Ogiltig lista.',
    bad_year: 'Startåret ser inte rätt ut.',
    bad_month: 'Välj en månad mellan januari och december.',
    bad_zone: 'Zon måste vara ett heltal mellan 1 och 999.',
    bad_shift: 'Välj dag, natt eller extra.',
    bad_image: 'Det gick inte att läsa bilden. Försök med en annan bild.',
    too_big: 'Bilden är för stor. Försök med en annan bild.',
    upload_failed: 'Det gick inte att ladda upp bilden. Försök igen.'
  };

  var CSS = '/* Profilsida */\n' +
    '.ps-head{display:flex;gap:12px;align-items:center;padding:4px 0 12px}\n' +
    '.ps-av{width:64px;height:64px;border-radius:50%;background:var(--primary);color:var(--on-primary,#fff);display:flex;align-items:center;justify-content:center;font-size:1.35rem;font-weight:700;flex-shrink:0;background-size:cover;background-position:center;overflow:hidden}\n' +
    '.ps-name{font-size:1.15rem;font-weight:700;color:var(--primary);margin:0}\n' +
    '.ps-meta{font-size:.82rem;color:var(--text-soft);margin:.15rem 0 0}\n' +
    '.ps-co{font-size:.78rem;color:var(--text-soft);margin:.1rem 0 0}\n' +
    '.ps-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:0 0 12px}\n' +
    '.ps-stat{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 6px;text-align:center}\n.ps-stat.btn{cursor:pointer;font:inherit;color:inherit;width:100%;display:block}\n.ps-stat.btn:active{opacity:.85}\n.ps-stat.btn .n{color:var(--primary);text-decoration:underline;text-underline-offset:2px}\n.ps-flist .it{display:block;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-soft,var(--border));border-radius:8px;padding:.65rem .7rem;margin:0 0 .45rem;cursor:pointer;font:inherit;color:inherit}\n.ps-flist .it .t{font-weight:700;color:var(--primary);font-size:.95rem;word-break:break-word}\n.ps-flist .it .s{font-size:.75rem;color:var(--text-soft);margin-top:.2rem}\n.ps-flist .it .ex{font-size:.85rem;color:var(--text);margin-top:.3rem;line-height:1.35}\n' +
    '.ps-stat .n{font-size:1.25rem;font-weight:700;color:var(--primary)}\n' +
    '.ps-stat .l{font-size:.7rem;color:var(--text-soft);margin-top:2px;text-transform:uppercase;letter-spacing:.03em}\n' +
    '.ps-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px}\n' +
    '.ps-card h3{font-size:.95rem;margin:0 0 8px;color:var(--text)}\n' +
    '.ps-row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-soft,var(--border));font-size:.9rem}\n' +
    '.ps-row:last-child{border-bottom:none}\n' +
    '.ps-row .k{color:var(--text-soft)}\n' +
    '.ps-row .v{font-weight:600;color:var(--text);text-align:right}\n' +
    '.ps-bio{font-size:.92rem;line-height:1.45;color:var(--text);white-space:pre-wrap;word-break:break-word}\n' +
    '.ps-tip{background:var(--surface-soft,var(--bg,#f7fafc));border-left:3px solid var(--primary);padding:8px 10px;border-radius:6px;font-size:.9rem;margin-top:6px}\n' +
    '.ps-acts{display:flex;flex-direction:column;gap:8px;margin:0 0 12px}\n' +
    '.ps-acts button,.ps-btn{border-radius:10px;padding:.65rem 1rem;font:inherit;font-size:.95rem;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--text);width:100%;font-weight:600}\n' +
    '.ps-acts .ok,.ps-btn.ok{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}\n' +
    '.ps-acts .ghost{font-weight:500}\n' +
    '.ps-acts button:disabled,.ps-btn:disabled{opacity:.55}\n' +
    '.ps-crumb{font-size:.82rem;color:var(--text-soft);margin:0 0 .55rem;display:flex;gap:6px;align-items:center;flex-wrap:wrap}\n' +
    '.ps-crumb button{background:none;border:none;color:var(--primary);padding:0;font:inherit;font-size:.82rem;cursor:pointer}\n' +
    '.ps-crumb b{color:var(--text)}\n' +
    '.ps-field{margin:0 0 10px}\n' +
    '.ps-field label{display:block;font-size:.82rem;color:var(--text-soft);margin:0 0 .25rem}\n' +
    '.ps-field input,.ps-field textarea,.ps-field select{width:100%;box-sizing:border-box;padding:.55rem;border-radius:8px;border:1px solid var(--border);font:inherit;background:var(--surface);color:var(--text)}\n' +
    '.ps-field textarea{min-height:72px;resize:vertical}\n' +
    '.ps-vis{display:flex;gap:8px;align-items:center;margin-top:4px;font-size:.78rem;color:var(--text-soft)}\n' +
    '.ps-vis select{width:auto;padding:.25rem .4rem;font-size:.78rem}\n' +
    '.ps-chk{display:flex;align-items:center;gap:8px;font-size:.92rem;margin:4px 0 10px}\n' +
    '.ps-gal{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}\n' +
    '.ps-gal .ph{aspect-ratio:1;border-radius:8px;background:var(--surface-soft,var(--bg,#f7fafc));border:1px solid var(--border);overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center}\n' +
    '.ps-gal .ph img{width:100%;height:100%;object-fit:cover;display:block}\n' +
    '.ps-gal .ph .del{position:absolute;top:4px;right:4px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:6px;font-size:.7rem;padding:2px 6px;cursor:pointer}\n' +
    '.ps-gal .add{border-style:dashed;color:var(--primary);font-size:.8rem;font-weight:700;cursor:pointer;flex-direction:column;gap:2px;background:var(--surface)}\n' +
    '.ps-gb .msg{background:var(--surface-soft,var(--bg,#f7fafc));border:1px solid var(--border-soft,var(--border));border-radius:8px;padding:8px 10px;margin:0 0 8px}\n' +
    '.ps-gb .who{font-weight:700;color:var(--primary);font-size:.85rem}\n' +
    '.ps-gb .tm{float:right;color:var(--text-soft);font-weight:400;font-size:.75rem}\n' +
    '.ps-gb .tx{font-size:.9rem;margin-top:4px;line-height:1.4;white-space:pre-wrap;word-break:break-word}\n' +
    '.ps-gb .del{font-size:.78rem;color:var(--danger-text,#c53030);background:none;border:none;padding:0;margin-top:4px;cursor:pointer}\n' +
    '.ps-gb .form{display:flex;flex-direction:column;gap:6px;margin-top:8px}\n' +
    '.ps-gb .form textarea{min-height:56px;width:100%;box-sizing:border-box;padding:.55rem;border-radius:8px;border:1px solid var(--border);font:inherit;background:var(--surface);color:var(--text)}\n' +
    '.ps-empty{padding:.8rem .2rem;text-align:center;color:var(--text-soft);font-size:.9rem}\n' +
    '.ps-flash{background:var(--c-c6f6d5,#c6f6d5);color:var(--c-22543d,#22543d);padding:.45rem .6rem;border-radius:8px;margin-bottom:.5rem;font-size:.88rem}\n' +
    '.ps-err{color:var(--danger-text,#c53030);font-size:.9rem;margin:.3rem 0}\n' +
    '.ps-note{font-size:.82rem;color:var(--text-soft);margin:.2rem 0 .6rem;line-height:1.35}\n' +
    '.ps-date,.ps-language-bottom{display:flex;gap:8px}.ps-date select{min-width:0}.ps-language{padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px}.ps-language select,.ps-language input{margin-bottom:6px}.ps-language-bottom select{flex:1;min-width:0}.ps-language-bottom button{width:42px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;font-size:1.4rem}.ps-permit-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.ps-permit-chips label{display:flex;align-items:center;gap:5px;border:1px solid var(--border);border-radius:8px;padding:8px;margin:0}.ps-permit-chips input{width:auto}.ps-row .v{white-space:pre-line;overflow-wrap:anywhere;min-width:0}.ps-ph{opacity:.7;font-style:italic}';
  (function () { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); })();

  var st = { view: 'page', driverId: null, data: null, gallery: null, guestbook: null, forumList: null, forumKind: null, err: null, flash: null, busy: false };
  var root = null;

  function token() { return localStorage.getItem('taxi_session') || ''; }
  function rpc(name, args) {
    args = args || {}; args.p_token = token();
    return fetch(API + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) {
          var m = (j && (j.message || j.error || j.hint)) || r.statusText || 'error';
          var e = new Error(String(m).split('\n')[0]);
          e.code = j && j.code; throw e;
        }
        return j;
      });
    });
  }
  function edge(body) {
    body.token = token();
    return fetch(EDGE, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso), n = Date.now() - d.getTime();
    if (n < 60000) return 'nyss';
    if (n < 3600000) return Math.floor(n / 60000) + ' min';
    if (n < 86400000 && d.getDate() === new Date().getDate()) {
      return 'idag ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (d.getDate() === y.getDate() && d.getMonth() === y.getMonth()) {
      return 'igår ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    return d.getDate() + ' ' + ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()] +
      (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/);
    if (!p[0]) return '?';
    var a = p[0].charAt(0).toUpperCase();
    var b = (p[1] && p[1].charAt(0)) || '';
    return a + b;
  }
  function toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
  }

  function crumb(parts) {
    var h = '<div class="ps-crumb">';
    parts.forEach(function (p, i) {
      if (i) h += '<span>›</span>';
      if (p.a) h += '<button type="button" data-a="' + esc(p.a) + '">' + esc(p.t) + '</button>';
      else h += '<b>' + esc(p.t) + '</b>';
    });
    return h + '</div>';
  }

  function avatarHtml(d) {
    var url = (d.mine && window.PROFILBILD && PROFILBILD.url) ? PROFILBILD.url : null;
    if (url) return '<div class="ps-av" style="background-image:url(\'' + esc(url) + '\')" role="img" aria-label="Profilbild"></div>';
    return '<div class="ps-av" aria-hidden="true">' + esc(initials(d.name)) + '</div>';
  }

  function headHtml(d) {
    var years = d.years_taxi != null ? (' · ' + d.years_taxi + ' år i taxi') : '';
    var start = d.taxi_start_year ? ('sedan ' + (d.taxi_start_month ? MONTHS[d.taxi_start_month - 1] + ' ' : '') + d.taxi_start_year) : '';
    return '<div class="ps-head">' + avatarHtml(d) +
      '<div><p class="ps-name">' + esc(d.name || 'Förare') + (d.id ? ' · ' + esc(d.id) : '') + '</p>' +
      (start || years ? '<p class="ps-meta">' + esc(start + years) + '</p>' : '') +
      (d.co ? '<p class="ps-co">' + esc(d.co) + '</p>' : '') +
      '</div></div>';
  }

  function statsHtml(d) {
    var s = d.stats || {};
    var nt = s.forum_threads != null ? s.forum_threads : 0;
    var nr = s.forum_replies != null ? s.forum_replies : 0;
    return '<div class="ps-stats">' +
      '<div class="ps-stat"><div class="n">' + (d.years_taxi != null ? esc(d.years_taxi) : '–') + '</div><div class="l">År i taxi</div></div>' +
      '<button type="button" class="ps-stat btn" data-a="forum-threads" title="Visa trådar">' +
        '<div class="n">' + esc(nt) + '</div><div class="l">Forum-trådar</div></button>' +
      '<button type="button" class="ps-stat btn" data-a="forum-replies" title="Visa svar">' +
        '<div class="n">' + esc(nr) + '</div><div class="l">Forum-svar</div></button>' +
      '</div>';
  }

  function fieldRow(label, val) {
    if (val == null || val === '') return '';
    return '<div class="ps-row"><span class="k">' + esc(label) + '</span><span class="v">' + esc(val) + '</span></div>';
  }

  function pageHtml(d) {
    var rows = '';
    rows += fieldRow('Hemmazon', d.home_zone);
    rows += fieldRow('Favoritzon', d.fav_zone);
    rows += fieldRow('Pass', d.shift ? (SHIFT[d.shift] || d.shift) : null);
    rows += fieldRow('Språk', languageRows(d.languages).map(function (x) { return languageName(x.code) + (x.level ? ' (' + x.level + ')' : ''); }).join(' · '));
    rows += fieldRow('Hobbyer', d.hobbies);
    rows += fieldRow('Behörigheter / erfarenhet', d.permits);
    if (d.also_uber_bolt === true) rows += fieldRow('Kör även', 'Uber / Bolt');
    if (d.car && d.car.label) {
      var src = d.car.source === 'kvitto' ? 'senaste resa' : (d.car.source === 'pass' ? 'senaste pass' : '');
      rows += fieldRow('Nuvarande bil', d.car.label + (src ? ' (' + src + ')' : ''));
    }
    var h = crumb([{ t: 'Hem', a: 'home' }, { t: d.mine ? 'Min profil' : (d.name || 'Profil') }]);
    if (st.flash) h += '<div class="ps-flash">' + esc(st.flash) + '</div>';
    h += headHtml(d) + statsHtml(d);
    if (d.bio) h += '<div class="ps-card"><h3>Om mig</h3><div class="ps-bio">' + esc(d.bio) + '</div></div>';
    if (d.fun_tip) h += '<div class="ps-card"><h3>Bästa tipset för nya förare</h3><div class="ps-tip">' + esc(d.fun_tip) + '</div></div>';
    if (rows) h += '<div class="ps-card"><h3>Uppgifter</h3>' + rows + '</div>';
    h += '<div class="ps-card"><h3>Galleri</h3>' +
      '<p class="ps-note">' + (d.gallery_n || 0) + ' foto' + ((d.gallery_n || 0) === 1 ? '' : 'n') + '</p>' +
      '<button type="button" class="ps-btn ghost" data-a="gallery">Öppna galleri</button></div>';
    h += '<div class="ps-card"><h3>Gästbok</h3>' +
      '<p class="ps-note">' + (d.guestbook_n || 0) + ' meddelande' + ((d.guestbook_n || 0) === 1 ? '' : 'n') + '</p>' +
      '<button type="button" class="ps-btn ghost" data-a="guestbook">Öppna gästbok</button></div>';
    h += '<div class="ps-acts">';
    if (d.can_edit) h += '<button type="button" class="ok" data-a="edit">Redigera profil</button>';
    if (!d.mine) h += '<button type="button" class="ghost" data-a="msg">Skicka meddelande</button>';
    h += '</div>';
    if (st.err) h += '<p class="ps-err">' + esc(st.err) + '</p>';
    return h;
  }

  function visSelect(field, cur) {
    var v = (cur && cur[field]) || 'alla';
    return '<div class="ps-vis">Synlig för <select data-vis="' + esc(field) + '">' +
      '<option value="alla"' + (v === 'alla' ? ' selected' : '') + '>Alla</option>' +
      '<option value="akeri"' + (v === 'akeri' ? ' selected' : '') + '>Bara mitt åkeri</option>' +
      '</select></div>';
  }

  function editHtml(d) {
    var vis = d.visibility || {};
    var h = crumb([{ t: 'Hem', a: 'home' }, { t: 'Min profil', a: 'page' }, { t: 'Redigera' }]);
    if (st.flash) h += '<div class="ps-flash">' + esc(st.flash) + '</div>';
    h += '<div class="ps-card"><h3>Redigera profil</h3>' +
      '<p class="ps-note">Namn visas alltid som förnamn och första bokstaven i efternamnet (t.ex. Christian P.). Zoner är Taxi Göteborgs zonnummer (1–999), aldrig en adress.</p>';
    var years = option('', 'År', d.taxi_start_year);
    for (var y = new Date().getFullYear(); y >= 1970; y--) years += option(y, y, d.taxi_start_year);
    if (d.taxi_start_year > new Date().getFullYear()) years += option(d.taxi_start_year, d.taxi_start_year, d.taxi_start_year);
    h += '<div class="ps-field"><label for="ps-year">Start i taxi</label><div class="ps-date">' +
      '<select id="ps-month" aria-label="Startmånad">' + option('', 'Månad (valfri)', d.taxi_start_month) + MONTHS.map(function (m,i) { return option(i+1,m,d.taxi_start_month); }).join('') + '</select>' +
      '<select id="ps-year" aria-label="Startår">' + years + '</select></div>' +
      visSelect('taxi_start_year', vis) + '</div>';
    h += '<div class="ps-field"><label for="ps-home">Hemmazon</label>' +
      (d.home_zone && !/^[1-9][0-9]{0,2}$/.test(d.home_zone) ? '<p class="ps-note">Tidigare värde: ' + esc(d.home_zone) + ' (behålls tills du ändrar zonen)</p>' : '') +
      '<input id="ps-home" type="number" inputmode="numeric" min="1" max="999" step="1" value="' + esc(d.home_zone || '') + '" placeholder="(1–999)">' +
      visSelect('home_zone', vis) + '</div>';
    h += '<div class="ps-field"><label for="ps-fav">Favoritzon</label>' +
      (d.fav_zone && !/^[1-9][0-9]{0,2}$/.test(d.fav_zone) ? '<p class="ps-note">Tidigare värde: ' + esc(d.fav_zone) + ' (behålls tills du ändrar zonen)</p>' : '') +
      '<input id="ps-fav" type="number" inputmode="numeric" min="1" max="999" step="1" value="' + esc(d.fav_zone || '') + '" placeholder="(1–999)">' +
      visSelect('fav_zone', vis) + '</div>';
    h += '<div class="ps-field"><label for="ps-shift">Pass</label>' +
      '<select id="ps-shift"><option value="">—</option>' +
      '<option value="dag"' + (d.shift === 'dag' ? ' selected' : '') + '>Dag</option>' +
      '<option value="natt"' + (d.shift === 'natt' ? ' selected' : '') + '>Natt</option>' +
      '<option value="extra"' + (d.shift === 'extra' ? ' selected' : '') + '>Extra</option></select>' +
      visSelect('shift', vis) + '</div>';
    h += '<div class="ps-field"><label>Språk</label><div id="ps-languages">' + languageRows(d.languages).map(languageRow).join('') + '</div>' +
      '<button type="button" class="ps-btn" data-a="lang-add">+ Lägg till språk</button><p class="ps-note">Sök bland alla språk. Namn utan svensk översättning visas på originalspråk/engelska.</p>' +
      visSelect('languages', vis) + '</div>';
    h += '<div class="ps-field"><label for="ps-bio">Om mig</label>' +
      '<textarea id="ps-bio" maxlength="500">' + esc(d.bio || '') + '</textarea>' +
      visSelect('bio', vis) + '</div>';
    h += '<div class="ps-field"><label for="ps-hob">Hobbyer</label>' +
      '<input id="ps-hob" maxlength="300" value="' + esc(d.hobbies || '') + '">' +
      visSelect('hobbies', vis) + '</div>';
    h += '<div class="ps-field"><label>Behörigheter</label>' + permitsHtml(d.permits) +
      visSelect('permits', vis) + '</div>';
    h += '<label class="ps-chk"><input type="checkbox" id="ps-uber"' + (d.also_uber_bolt ? ' checked' : '') + '> Kör även Uber/Bolt</label>' +
      visSelect('also_uber_bolt', vis);
    h += '<div class="ps-field"><label for="ps-tip">Bästa tipset för nya förare</label>' +
      '<textarea id="ps-tip" maxlength="300">' + esc(d.fun_tip || '') + '</textarea>' +
      visSelect('fun_tip', vis) + '</div>';
    h += '</div>';
    h += '<div class="ps-acts">' +
      '<button type="button" class="ok" data-a="save"' + (st.busy ? ' disabled' : '') + '>Spara</button>' +
      '<button type="button" class="ghost" data-a="personal">Personuppgifter &amp; lösenord</button>' +
      '<button type="button" class="ghost" data-a="page">Avbryt</button></div>';
    if (st.err) h += '<p class="ps-err">' + esc(st.err) + '</p>';
    return h;
  }

  function galleryHtml(d, photos) {
    var h = crumb([{ t: 'Hem', a: 'home' }, { t: d.mine ? 'Min profil' : (d.name || 'Profil'), a: 'page' }, { t: 'Galleri' }]);
    if (st.flash) h += '<div class="ps-flash">' + esc(st.flash) + '</div>';
    h += '<div class="ps-card"><h3>Galleri</h3>';
    if (d.mine && d.can_edit) h += '<p class="ps-note">Ladda upp egna foton (jpeg). Du kan ta bort dina egna.</p>';
    h += '<div class="ps-gal">';
    (photos || []).forEach(function (p) {
      h += '<div class="ph">' + (p.url ? '<img src="' + esc(p.url) + '" alt="">' : '📷');
      if (d.can_edit && d.mine) h += '<button type="button" class="del" data-a="gal-del" data-id="' + esc(p.id) + '">Ta bort</button>';
      h += '</div>';
    });
    if (d.can_edit && d.mine) {
      h += '<button type="button" class="ph add" data-a="gal-add">+<br>Lägg till</button>';
      h += '<input type="file" id="ps-gal-file" accept="image/jpeg,image/png,image/webp,image/*" style="display:none">';
    }
    h += '</div>';
    if (!(photos || []).length) h += '<p class="ps-empty">Inga foton ännu.</p>';
    h += '</div>';
    if (st.err) h += '<p class="ps-err">' + esc(st.err) + '</p>';
    return h;
  }

  function guestbookHtml(d, list) {
    var h = crumb([{ t: 'Hem', a: 'home' }, { t: d.mine ? 'Min profil' : (d.name || 'Profil'), a: 'page' }, { t: 'Gästbok' }]);
    if (st.flash) h += '<div class="ps-flash">' + esc(st.flash) + '</div>';
    h += '<div class="ps-card ps-gb"><h3>Gästbok</h3>';
    (list || []).forEach(function (m) {
      h += '<div class="msg"><div class="who">' + esc(m.author || 'Förare') +
        ' <span class="tm">' + esc(when(m.created_at)) + '</span></div>' +
        '<div class="tx">' + esc(m.body) + '</div>';
      if (d.can_delete_guestbook || m.mine) h += '<button type="button" class="del" data-a="gb-del" data-id="' + esc(m.id) + '">Ta bort</button>';
      h += '</div>';
    });
    if (!(list || []).length) h += '<p class="ps-empty">Inga meddelanden ännu.</p>';
    if (!d.mine) {
      h += '<div class="form"><textarea id="ps-gb-body" maxlength="500" placeholder="Skriv ett meddelande…"></textarea>' +
        '<button type="button" class="ps-btn ok" data-a="gb-add"' + (st.busy ? ' disabled' : '') + '>Skicka</button></div>';
    } else {
      h += '<p class="ps-note">Andra kan lämna meddelanden här. Du (och admin) kan ta bort dem.</p>';
    }
    h += '</div>';
    if (st.err) h += '<p class="ps-err">' + esc(st.err) + '</p>';
    return h;
  }

  function forumListHtml(d, list) {
    var kind = (list && list.kind) || st.forumKind || 'threads';
    var title = kind === 'replies' ? 'Forum-svar' : 'Forum-trådar';
    var items = (list && list.items) || [];
    var h = crumb([{ t: 'Hem', a: 'home' }, { t: d.mine ? 'Min profil' : (d.name || 'Profil'), a: 'page' }, { t: title }]);
    if (st.flash) h += '<div class="ps-flash">' + esc(st.flash) + '</div>';
    h += '<div class="ps-card ps-flist"><h3>' + esc(title) + '</h3>' +
      '<p class="ps-note">Bara inlägg du får läsa visas. Admin-sektionen syns inte för vanliga förare.</p>';
    if (!items.length) h += '<p class="ps-empty">Inga ' + (kind === 'replies' ? 'svar' : 'trådar') + ' att visa.</p>';
    items.forEach(function (it) {
      h += '<button type="button" class="it" data-a="forum-open" data-tid="' + esc(it.thread_id || it.id) + '">' +
        '<div class="t">' + esc(it.title || 'Tråd') + '</div>' +
        '<div class="s">' + esc(it.section || '') +
        (it.status ? ' · ' + esc(it.status) : '') +
        (it.reply_count != null && kind === 'threads' ? ' · ' + esc(it.reply_count) + ' svar' : '') +
        ' · ' + esc(when(it.created_at)) + '</div>' +
        (kind === 'replies' && it.excerpt ? '<div class="ex">' + esc(it.excerpt) + '</div>' : '') +
        '</button>';
    });
    h += '</div>';
    if (st.err) h += '<p class="ps-err">' + esc(st.err) + '</p>';
    return h;
  }

  function paint() {
    if (!root) return;
    var d = st.data || {};
    if (st.view === 'edit') root.innerHTML = editHtml(d);
    else if (st.view === 'gallery') root.innerHTML = galleryHtml(d, st.gallery || []);
    else if (st.view === 'guestbook') root.innerHTML = guestbookHtml(d, st.guestbook || []);
    else if (st.view === 'forum') root.innerHTML = forumListHtml(d, st.forumList);
    else root.innerHTML = pageHtml(d);
    st.flash = null;
  }

  function go(view) {
    st.view = view;
    st.err = null;
    try { history.pushState({ view: 'profil', sub: view }, ''); } catch (e) {}
    paint();
  }

  async function load(driverId) {
    st.driverId = driverId || null;
    st.err = null;
    root.innerHTML = '<div class="ps-card">Laddar…</div>';
    try {
      var args = { p_token: token() };
      if (st.driverId) args.p_driver_id = st.driverId;
      st.data = await rpc('profile_get', st.driverId ? { p_driver_id: st.driverId } : {});
      paint();
    } catch (e) {
      if (fail(e)) return;
      root.innerHTML = '<div class="ps-card"><p class="ps-err">' + esc(errText(e)) + '</p></div>';
    }
  }

  async function loadGallery() {
    st.err = null;
    try {
      var r = await edge({ action: 'list', driver_id: st.data && st.data.id });
      st.gallery = r.photos || [];
      paint();
    } catch (e) {
      if (fail(e)) return;
      st.err = errText(e);
      st.gallery = [];
      paint();
    }
  }

  async function loadGuestbook() {
    st.err = null;
    try {
      st.guestbook = await rpc('profile_guestbook_list', { p_driver_id: st.data && st.data.id });
      if (!Array.isArray(st.guestbook)) st.guestbook = [];
      paint();
    } catch (e) {
      if (fail(e)) return;
      st.err = errText(e);
      st.guestbook = [];
      paint();
    }
  }

  function readVis() {
    var o = {};
    root.querySelectorAll('[data-vis]').forEach(function (el) {
      o[el.getAttribute('data-vis')] = el.value === 'akeri' ? 'akeri' : 'alla';
    });
    return o;
  }

  async function saveEdit() {
    if (st.busy) return;
    var year = document.getElementById('ps-year');
    var data = {
      taxi_start_year: year && year.value ? year.value : '',
      taxi_start_month: document.getElementById('ps-month').value,
      home_zone: document.getElementById('ps-home').value || (document.getElementById('ps-home').dataset.touched ? '' : (st.data.home_zone || '')),
      fav_zone: document.getElementById('ps-fav').value || (document.getElementById('ps-fav').dataset.touched ? '' : (st.data.fav_zone || '')),
      shift: (document.getElementById('ps-shift') || {}).value || '',
      languages: Array.from(root.querySelectorAll('.ps-language')).map(function (el) {
        var code = el.querySelector('.ps-language-name').value, level = el.querySelector('.ps-language-level').value;
        return code ? languageName(code) + (level ? ' (' + level + ')' : '') : '';
      }).filter(Boolean).join('\n'),
      bio: (document.getElementById('ps-bio') || {}).value || '',
      hobbies: (document.getElementById('ps-hob') || {}).value || '',
      permits: Array.from(root.querySelectorAll('[data-permit]:checked')).map(function (el) { return el.getAttribute('data-permit'); }).concat([document.getElementById('ps-perm-legacy').value.trim()]).filter(Boolean).join(', '),
      also_uber_bolt: !!(document.getElementById('ps-uber') || {}).checked,
      fun_tip: (document.getElementById('ps-tip') || {}).value || '',
      visibility: readVis()
    };
    for (var zone of ['home_zone', 'fav_zone']) {
      if (data[zone] && String(data[zone]) !== String(st.data[zone]) && !/^[1-9][0-9]{0,2}$/.test(data[zone])) { toast('Zon måste vara ett heltal mellan 1 och 999.'); return; }
    }
    if (data.taxi_start_month && !data.taxi_start_year) { toast('Välj år också.'); return; }
    if (data.languages.length > 200 || data.permits.length > 400) { toast('För mycket text: språk får vara högst 200 tecken och behörigheter 400.'); return; }
    // Keep the draft on failures; never repaint before collecting the form.
    st.busy = true; st.err = null;
    var saveButton = root.querySelector('[data-a="save"]'); if (saveButton) saveButton.disabled = true;
    try {
      st.data = await rpc('profile_save', { p_data: data });
      st.flash = 'Sparat ✓';
      st.busy = false;
      go('page');
    } catch (e) {
      st.busy = false;
      if (fail(e)) return;
      toast(errText(e));
      if (saveButton) saveButton.disabled = false;
    }
  }

  function fileToJpegB64(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var max = 1280, w = img.width, h = img.height;
          if (w > max || h > max) {
            if (w > h) { h = Math.round(h * max / w); w = max; }
            else { w = Math.round(w * max / h); h = max; }
          }
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          var data = cv.toDataURL('image/jpeg', 0.85);
          URL.revokeObjectURL(url);
          resolve(data.split(',')[1]);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad_image')); };
      img.src = url;
    });
  }

  async function uploadPhoto(file) {
    if (st.busy) return;
    st.busy = true; st.err = null; paint();
    try {
      var b64 = await fileToJpegB64(file);
      await edge({ action: 'upload', image: b64 });
      st.flash = 'Fotot är uppladdat ✓';
      st.busy = false;
      await loadGallery();
      if (st.data) st.data.gallery_n = (st.data.gallery_n || 0) + 1;
    } catch (e) {
      st.busy = false;
      if (fail(e)) return;
      st.err = errText(e);
      paint();
    }
  }

  async function deletePhoto(id) {
    if (st.busy) return;
    if (!confirm('Ta bort fotot?')) return;
    st.busy = true; st.err = null; paint();
    try {
      await edge({ action: 'delete', photo_id: +id });
      st.flash = 'Fotot är borttaget';
      st.busy = false;
      await loadGallery();
      if (st.data && st.data.gallery_n > 0) st.data.gallery_n -= 1;
    } catch (e) {
      st.busy = false;
      if (fail(e)) return;
      st.err = errText(e);
      paint();
    }
  }

  async function addGuestbook() {
    if (st.busy) return;
    var ta = document.getElementById('ps-gb-body');
    var body = ta ? ta.value.trim() : '';
    if (!body) { st.err = ERR.need_text; paint(); return; }
    st.busy = true; st.err = null; paint();
    try {
      await rpc('profile_guestbook_add', { p_driver_id: st.data.id, p_body: body });
      st.flash = 'Meddelandet är skickat ✓';
      st.busy = false;
      if (st.data) st.data.guestbook_n = (st.data.guestbook_n || 0) + 1;
      await loadGuestbook();
    } catch (e) {
      st.busy = false;
      if (fail(e)) return;
      st.err = errText(e);
      paint();
    }
  }

  async function delGuestbook(id) {
    if (st.busy) return;
    if (!confirm('Ta bort meddelandet?')) return;
    st.busy = true; st.err = null; paint();
    try {
      await rpc('profile_guestbook_delete', { p_id: +id });
      st.flash = 'Meddelandet är borttaget';
      st.busy = false;
      if (st.data && st.data.guestbook_n > 0) st.data.guestbook_n -= 1;
      await loadGuestbook();
    } catch (e) {
      st.busy = false;
      if (fail(e)) return;
      st.err = errText(e);
      paint();
    }
  }


  async function loadForumList(kind) {
    st.forumKind = kind;
    st.err = null;
    st.forumList = null;
    paint();
    try {
      st.forumList = await rpc('profile_forum_list', { p_driver_id: st.data && st.data.id, p_kind: kind });
      paint();
    } catch (e) {
      if (fail(e)) return;
      st.err = errText(e);
      st.forumList = { kind: kind, items: [] };
      paint();
    }
  }

  function openForumThread(tid) {
    if (!tid) return;
    if (window.FORUM && typeof FORUM.openPost === 'function') {
      FORUM.openPost(tid);
      return;
    }
    toast('Öppna Forum för att läsa tråden.');
  }

  function onClick(e) {
    var t = e.target.closest('[data-a]');
    if (!t || !root.contains(t)) return;
    var a = t.getAttribute('data-a');
    if (a === 'home') {
      if (typeof window.goHome === 'function') window.goHome();
      return;
    }
    if (a === 'page') { go('page'); return; }
    if (a === 'edit') { go('edit'); return; }
    if (a === 'personal') {
      if (typeof window.renderPersonalData === 'function') {
        window.renderPersonalData({ fromProfile: true });
      } else {
        toast('Personuppgifter öppnas från menyn.');
      }
      return;
    }
    if (a === 'lang-add') { root.querySelector('#ps-languages').insertAdjacentHTML('beforeend', languageRow({code:'',level:''})); return; }
    if (a === 'lang-remove') { t.closest('.ps-language').remove(); return; }
    if (a === 'save') { saveEdit(); return; }
    if (a === 'gallery') { go('gallery'); loadGallery(); return; }
    if (a === 'guestbook') { go('guestbook'); loadGuestbook(); return; }
    if (a === 'msg') {
      if (window.INKORG) INKORG.compose(st.data && st.data.id);
      return;
    }
    if (a === 'forum-threads') { st.view = 'forum'; st.forumKind = 'threads'; try { history.pushState({ view: 'profil', sub: 'forum' }, ''); } catch (e) {} loadForumList('threads'); return; }
    if (a === 'forum-replies') { st.view = 'forum'; st.forumKind = 'replies'; try { history.pushState({ view: 'profil', sub: 'forum' }, ''); } catch (e) {} loadForumList('replies'); return; }
    if (a === 'forum-open') { openForumThread(t.getAttribute('data-tid')); return; }
    if (a === 'gal-add') {
      var f = document.getElementById('ps-gal-file');
      if (f) f.click();
      return;
    }
    if (a === 'gal-del') { deletePhoto(t.getAttribute('data-id')); return; }
    if (a === 'gb-add') { addGuestbook(); return; }
    if (a === 'gb-del') { delGuestbook(t.getAttribute('data-id')); return; }
  }

  function onChange(e) {
    if (e.target && e.target.id === 'ps-gal-file' && e.target.files && e.target.files[0]) {
      uploadPhoto(e.target.files[0]);
      e.target.value = '';
    }
  }

  P.render = function (el, driverId) {
    root = el;
    st.view = 'page';
    st.gallery = null;
    st.guestbook = null;
    st.forumList = null;
    st.forumKind = null;
    st.flash = null;
    st.err = null;
    st.busy = false;
    if (!root._psBound) {
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('input', function (e) {
        if (e.target.id === 'ps-home' || e.target.id === 'ps-fav') e.target.dataset.touched = '1';
        if (!e.target.matches('.ps-language-search')) return;
        var select = e.target.closest('.ps-language').querySelector('.ps-language-name');
        select.innerHTML = languageOptions(select.value, e.target.value);
      });
      root._psBound = true;
    }
    return load(driverId || null);
  };

  P.back = function () {
    if (!root) return false;
    if (st.view === 'edit' || st.view === 'gallery' || st.view === 'guestbook' || st.view === 'forum') {
      go('page');
      return true;
    }
    return false;
  };

  P.open = function (driverId) {
    if (typeof window.openProfile === 'function' && !driverId) {
      window.openProfile();
      return;
    }
    // Annans profil: öppna profilvyn med angivet id
    if (typeof window.openProfileFor === 'function') return window.openProfileFor(driverId);
    if (root) return P.render(root, driverId);
  };
})();
