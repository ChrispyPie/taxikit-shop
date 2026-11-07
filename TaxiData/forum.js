/* Klassiskt forum: sektioner → trådar → svar.
 * Sektioner: Allmänt, Önskemål & förslag (status), Buggar (status), Mitt åkeri, Admin (låst för förare).
 * RPC: forum_home, forum_section_threads, forum_thread_get/new/reply/status, forum_classic_badge.
 * Regler (god ton) oförändrade. Gamla forum_posts orörda. Admin › Önskemål (dev_wishes) orörd.
 */
(function () {
  'use strict';
  var F = window.FORUM = { id: 'forum', title: 'Forum', icon: '💬' };
  var COMPLAINT_SYSTEM = 'Roxx';
  var RULE_KEY = 'forum_rule_hidden';
  var RULES_VERSION = 1;
  // Samma statusord överallt (arende-status.js): Ny / Pågår / Väntar på svar / Klar
  var STATUS = [['ny', 'Ny'], ['pagar', 'Pågår'], ['planerad', 'Pågår · planerad'], ['klar', 'Klar']];
  var ERR = {
    via_master: 'Du är inloggad med huvudlösenordet. Bara föraren själv kan skriva i forumet.',
    demo_read_only: 'Det här är ett demokonto. Du kan titta runt men inte ändra något.',
    need_title: 'Skriv en rubrik.', need_text: 'Skriv något först.',
    title_too_long: 'Rubriken är för lång (högst 120 tecken).',
    text_too_long: 'Texten är för lång.', too_many: 'Du har skrivit väldigt mycket idag. Försök igen i morgon.',
    forbidden: 'Det får du inte göra.', need_first_name: 'Fyll i ditt förnamn först.',
    not_found: 'Tråden finns inte längre.', comment_too_long: 'Kommentaren till statusen är för lång.',
    bad_status: 'Ogiltig status.'
  };

  var CSS = '/* Forum classic */\n' +
    '.fx-crumb{font-size:.82rem;color:var(--text-soft);margin:0 0 .55rem;display:flex;gap:6px;align-items:center;flex-wrap:wrap}\n' +
    '.fx-crumb button{background:none;border:none;color:var(--primary);padding:0;font:inherit;font-size:.82rem;cursor:pointer}\n' +
    '.fx-crumb b{color:var(--text)}\n' +
    '.fx-grp{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--on-primary,#fff);background:var(--primary);padding:.35rem .65rem;border-radius:8px 8px 0 0;margin:.7rem 0 0}\n' +
    '.fx-grp:first-child{margin-top:0}\n' +
    '.fx-sec{display:flex;gap:10px;align-items:flex-start;padding:.7rem .65rem;background:var(--surface);border:1px solid var(--border-soft,var(--border));border-top:none;cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit}\n' +
    '.fx-sec:last-of-type{border-radius:0 0 8px 8px}\n' +
    '.fx-sec.locked{opacity:.7;cursor:default}\n' +
    '.fx-sec .ico{font-size:1.25rem;flex:0 0 auto;line-height:1.2}\n' +
    '.fx-sec .main{flex:1;min-width:0}\n' +
    '.fx-sec .name{font-weight:700;color:var(--primary);font-size:.98rem}\n' +
    '.fx-sec .desc{font-size:.82rem;color:var(--text-soft);margin-top:.15rem;line-height:1.3}\n' +
    '.fx-sec .meta{display:flex;gap:10px;margin-top:.3rem;font-size:.75rem;color:var(--text-soft);flex-wrap:wrap}\n' +
    '.fx-sec .meta b{color:var(--text);font-weight:600}\n' +
    '.fx-sec .new{color:var(--danger-text,#c53030);font-weight:600}\n' +
    '.fx-sec .last{flex:0 0 auto;width:5.8rem;text-align:right;font-size:.72rem;color:var(--text-soft);line-height:1.35}\n' +
    '.fx-sec .last .who{color:var(--primary);font-weight:600}\n' +
    '.fx-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 .6rem}\n' +
    '.fx-actions button{border-radius:10px;padding:.45rem .85rem;font:inherit;font-size:.9rem;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--text)}\n' +
    '.fx-actions .ok{background:var(--primary);color:var(--on-primary);border-color:var(--primary);font-weight:600}\n' +
    '.fx-thhead{display:flex;gap:8px;padding:.35rem .5rem;background:var(--primary);color:var(--on-primary,#fff);font-size:.72rem;font-weight:700;border-radius:8px 8px 0 0}\n' +
    '.fx-thhead span:nth-child(1){flex:1}.fx-thhead span:nth-child(2){width:2.2rem;text-align:center}.fx-thhead span:nth-child(3){width:5.2rem;text-align:right}\n' +
    '.fx-th{display:flex;gap:8px;align-items:flex-start;padding:.65rem .5rem;background:var(--surface);border-bottom:1px solid var(--border-soft,var(--border));cursor:pointer;width:100%;text-align:left;font:inherit;color:inherit}\n' +
    '.fx-th.dim{opacity:.55}\n' +
    '.fx-th .ti{flex:1;min-width:0}\n' +
    '.fx-th .t{font-weight:700;color:var(--primary);font-size:.95rem;word-break:break-word}\n' +
    '.fx-th .s{font-size:.75rem;color:var(--text-soft);margin-top:.15rem}\n' +
    '.fx-th .n{width:2.2rem;text-align:center;font-size:.85rem;color:var(--text-soft);font-variant-numeric:tabular-nums;padding-top:.15rem}\n' +
    '.fx-th .lm{width:5.2rem;text-align:right;font-size:.72rem;color:var(--text-soft);line-height:1.3}\n' +
    '.fx-th .lm .who{color:var(--primary);font-weight:600}\n' +
    '.fx-st{display:inline-block;font-size:.68rem;padding:.05rem .4rem;border-radius:8px;font-weight:700;margin-left:.25rem;vertical-align:middle}\n' +
    '.fx-st-ny{background:var(--c-bee3f8,#bee3f8);color:var(--c-2a4365,#2a4365)}\n' +
    '.fx-st-pagar{background:var(--c-fefcbf,#fefcbf);color:var(--c-975a16,#975a16)}\n' +
    '.fx-st-planerad{background:var(--c-e9d8fd,#e9d8fd);color:var(--c-553c9a,#553c9a)}\n' +
    '.fx-st-klar{background:var(--c-c6f6d5,#c6f6d5);color:var(--c-22543d,#22543d)}\n' +
    '.fx-st-lost{background:var(--c-c6f6d5,#c6f6d5);color:var(--c-22543d,#22543d)}\n' +
    '.fx-pin{font-size:.72rem;margin-right:.2rem}\n' +
    '.fx-sol{outline:2px solid var(--c-22543d,#22543d);outline-offset:-2px}\n' +
    '.fx-post{background:var(--surface);border:1px solid var(--border-soft,var(--border));border-radius:8px;margin:0 0 .55rem;overflow:hidden}\n' +
    '.fx-post .ph{display:flex;justify-content:space-between;gap:8px;padding:.45rem .6rem;background:var(--surface-soft,var(--bg,#f7fafc));border-bottom:1px solid var(--border-soft,var(--border));font-size:.82rem}\n' +
    '.fx-post .au{font-weight:700;color:var(--primary)}\n' +
    '.fx-post .aid{font-weight:400;color:var(--c-718096,#718096)}\n' +
    '.fx-post .tm{color:var(--text-soft);white-space:nowrap}\n' +
    '.fx-post .pb{padding:.65rem .7rem;white-space:pre-wrap;word-break:break-word;font-size:.95rem;line-height:1.45;color:var(--text)}\n' +
    '.fx-post .pf{padding:.3rem .6rem;font-size:.75rem;color:var(--text-soft);border-top:1px solid var(--border-soft,var(--border));background:var(--surface-soft,var(--bg,#f7fafc))}\n' +
    '.fx-reply{margin:.4rem 0 .8rem}\n' +
    '.fx-reply textarea,.fx-ed textarea,.fx-ed input{width:100%;box-sizing:border-box;padding:.55rem;border-radius:8px;border:1px solid var(--border);font:inherit;background:var(--surface);color:var(--text)}\n' +
    '.fx-reply textarea{min-height:72px;resize:vertical}\n' +
    '.fx-ed label{display:block;font-size:.82rem;color:var(--text-soft);margin:.45rem 0 .2rem}\n' +
    '.fx-empty{padding:1.2rem .5rem;text-align:center;color:var(--text-soft);font-size:.92rem}\n' +
    '.fx-flash{background:var(--c-c6f6d5,#c6f6d5);color:var(--c-22543d,#22543d);padding:.45rem .6rem;border-radius:8px;margin-bottom:.5rem;font-size:.88rem}\n' +
    '.fx-err{color:var(--danger-text,#c53030);font-size:.9rem;margin:.3rem 0}\n' +
    '.fx-status{border-left:4px solid var(--primary);background:var(--surface-soft,var(--bg,#f7fafc));padding:.5rem .6rem;border-radius:6px;margin:.5rem 0;font-size:.9rem}\n' +
    '.fx-chips{display:flex;flex-wrap:wrap;gap:6px;margin:.35rem 0}\n' +
    '.fo-rule{display:flex;gap:.45rem;align-items:flex-start;background:var(--surface-soft,#f7fafc);border:1px solid var(--border-soft,var(--border,#e2e8f0));border-left:3px solid var(--primary);border-radius:8px;padding:.45rem .5rem .45rem .6rem;margin-bottom:.6rem;font-size:.84rem;line-height:1.35;color:var(--text-soft,var(--text))}\n' +
    '.fo-rule-i{flex:0 0 auto;font-size:.9em;line-height:1.5}.fo-rule-t{flex:1 1 auto;min-width:0;word-break:break-word}\n' +
    '.fo-rule-x{flex:0 0 auto;background:none;border:none;color:var(--text-soft,var(--text));font-size:.85rem;line-height:1;padding:.15rem .25rem;margin:-.1rem -.1rem 0 0;cursor:pointer;border-radius:6px}\n' +
    '.fo-rule-form{margin:.2rem 0 .45rem}\n' +
    '.fo-rule-mini{display:inline-block;background:none;border:none;padding:0;margin:0 0 .5rem;color:var(--primary);font-size:.82rem;cursor:pointer}\n' +
    '.fo-gate{max-width:34rem;margin:.4rem auto 0}.fo-gate h3{margin:0 0 .5rem;color:var(--primary);font-size:1.15rem}\n' +
    '.fo-gate p{margin:0 0 .6rem;color:var(--text);font-size:.95rem;line-height:1.45}.fo-gate .fo-gate-sub{color:var(--text-soft,var(--text));font-size:.85rem}\n' +
    '.fo-gate-act{display:flex;gap:.5rem;justify-content:flex-end;flex-wrap:wrap;margin-top:.8rem}\n' +
    '.fo-gate-act button{border-radius:10px;padding:.55rem 1rem;font:inherit;font-size:.95rem;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--text)}\n' +
    '.fo-gate-act .fo-gate-ok{background:var(--primary);color:var(--on-primary);border-color:var(--primary);font-weight:600}\n' +
    '.fo-err{color:var(--danger-text,#c53030);font-size:.9rem;margin:.3rem 0}';
  (function () { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); })();

  var st = { view: 'home', home: null, section: null, threads: null, thread: null, edit: null,
    includeKlar: false, pick: null, err: null, flash: null, busy: false };
  var root = null;

  function rulesKey() { return 'forum_rules_ok_' + (localStorage.getItem('taxi_driver') || 'x'); }
  function rulesOk() { try { return localStorage.getItem(rulesKey()) === String(RULES_VERSION); } catch (e) { return false; } }
  function setRulesOk(on) { try { if (on) localStorage.setItem(rulesKey(), String(RULES_VERSION)); else localStorage.removeItem(rulesKey()); } catch (e) {} }
  function ruleText() {
    return 'Håll god ton. Inga personangrepp eller uthängningar av enskilda personer. Klagomål på en person tar du privat med din chef eller som ett ärende i ' + COMPLAINT_SYSTEM + '.';
  }
  function ruleHidden() { try { return localStorage.getItem(RULE_KEY) === '1'; } catch (e) { return false; } }
  function ruleBox(fixed) {
    if (!fixed && ruleHidden()) return '<button class="fo-rule-mini" data-a="ruleshow" aria-expanded="false">ℹ️ Forumregler</button>';
    return '<div class="fo-rule' + (fixed ? ' fo-rule-form' : '') + '" role="note"><span class="fo-rule-i" aria-hidden="true">ℹ️</span><span class="fo-rule-t">' + esc(ruleText()) + '</span>' +
      (fixed ? '' : '<button class="fo-rule-x" data-a="rulehide" aria-label="Fäll ihop forumreglerna" title="Fäll ihop">✕</button>') + '</div>';
  }

  function token() { return localStorage.getItem('taxi_session') || ''; }
  function rpc(name, args) {
    args = args || {}; args.p_token = token();
    return fetch(TRIP_API_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': TRIP_API_KEY, 'Authorization': 'Bearer ' + TRIP_API_KEY, 'Content-Type': 'application/json' },
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
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sn(s) { return window.shortName ? window.shortName(s) : (s == null ? '' : String(s)); }
  function who(name, aid) { return esc(sn(name)) + (aid ? '<span class="aid"> · ' + esc(aid) + '</span>' : ''); }
  function errText(e) { return ERR[e && e.message] || 'Det gick inte. Försök igen.'; }
  function fail(e) { if (e && e.code === '28000') { location.reload(); return true; } return false; }
  function stName(s) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i][0] === s) return STATUS[i][1]; return s || ''; }
  function stChip(s) { return s ? '<span class="fx-st fx-st-' + esc(s) + '">' + esc(stName(s)) + '</span>' : ''; }
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
  function setUnread(n) { if (window.setBadge) setBadge('forum', +n || 0); }
  function push(view) { try { history.pushState({ view: F.id, sub: view }, ''); } catch (e) {} }
  function flashHtml() { var f = st.flash; st.flash = null; return f ? '<div class="fx-flash">' + esc(f) + '</div>' : ''; }
  function grpLabel(g) { return g === 'hjalp' ? 'Hjälp' : g === 'akeri' ? 'Åkeriet' : g === 'admin' ? 'Admin' : 'Huvud'; }

  // ── Views ──────────────────────────────────────────────────────────────

  function loadHome() {
    return rpc('forum_home', {}).then(function (h) {
      st.home = h;
      var u = 0; (h.sections || []).forEach(function (s) { u += +s.unread || 0; });
      setUnread(u);
    });
  }
  function drawHome() {
    if (!root) return;
    var h = st.home;
    var html = flashHtml() + ruleBox(false);
    if (!h) { root.innerHTML = html + '<div class="fx-empty">Laddar…</div>'; return; }
    if (st.err) html += '<div class="fx-err">' + esc(st.err) + '</div>';
    var groups = {}, order = [];
    (h.sections || []).forEach(function (s) {
      var g = s.group || 'huvud';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(s);
    });
    order.forEach(function (g) {
      html += '<div class="fx-grp">' + esc(grpLabel(g)) + '</div>';
      groups[g].forEach(function (s) {
        var locked = !!s.locked;
        html += '<button type="button" class="fx-sec' + (locked ? ' locked' : '') + '" data-a="' + (locked ? 'locked' : 'sec') + '" data-id="' + esc(s.id) + '">' +
          '<div class="ico">' + (locked ? '🔒' : esc(s.icon || '💬')) + '</div>' +
          '<div class="main"><div class="name">' + esc(s.title) + '</div>' +
          '<div class="desc">' + esc(s.description || '') + '</div>' +
          (locked
            ? '<div class="meta"><span>Låst · bara ägare och superadmin</span></div></div><div class="last">🔒</div>'
            : '<div class="meta"><span>Trådar <b>' + (+s.threads || 0) + '</b></span><span>Inlägg <b>' + (+s.replies || 0) + '</b></span>' +
              (s.unread ? '<span class="new">' + s.unread + ' nya</span>' : '') + '</div></div>' +
              '<div class="last">' + (s.last ? (esc(when(s.last.at)) + '<br><span class="who">' + esc(s.last.mine ? 'Du' : sn(s.last.author)) + '</span>') : '—') + '</div>') +
          '</button>';
      });
    });
    if (!(h.sections || []).length) html += '<div class="fx-empty">Inga sektioner ännu.</div>';
    root.innerHTML = html;
  }

  function loadSection(id) {
    return rpc('forum_section_threads', { p_section: id, p_include_klar: !!st.includeKlar }).then(function (r) {
      st.threads = r; st.section = r.section;
    });
  }
  function drawSection() {
    if (!root) return;
    var sec = st.section, list = (st.threads && st.threads.threads) || [];
    var html = flashHtml();
    html += '<div class="fx-crumb"><button type="button" data-a="home">‹ Forum</button><span>·</span><b>' + esc(sec ? sec.title : '') + '</b></div>';
    if (st.err) html += '<div class="fx-err">' + esc(st.err) + '</div>';
    html += '<div class="fx-actions">';
    if (sec && sec.can_write) html += '<button type="button" class="ok" data-a="new">+ Ny tråd</button>';
    if (sec && sec.has_status) {
      html += '<button type="button" data-a="togklar">' + (st.includeKlar ? 'Dölj klara' : 'Visa klara') + '</button>';
    }
    html += '</div>';
    if (!st.threads) { root.innerHTML = html + '<div class="fx-empty">Laddar…</div>'; return; }
    if (!list.length) {
      html += '<div class="fx-empty">Inga trådar ännu.' + (sec && sec.can_write ? ' Tryck på + Ny tråd för att börja.' : '') + '</div>';
    } else {
      html += '<div class="fx-thhead" aria-hidden="true"><span>Tråd</span><span>Sv</span><span>Senaste</span></div>';
      list.forEach(function (t) {
        html += '<button type="button" class="fx-th' + (t.status === 'klar' ? ' dim' : '') + '" data-a="thread" data-id="' + t.id + '">' +
          '<div class="ti"><div class="t">' + (t.sticky ? '<span class="fx-pin" title="Fäst">📌</span>' : '') +
          (t.unread ? '💬 ' : '') + esc(t.title) + stChip(t.status) +
          (t.solved ? '<span class="fx-st fx-st-lost">Löst ✓</span>' : '') + '</div>' +
          '<div class="s">av ' + esc(t.mine ? 'Du' : sn(t.author)) + (t.co ? ' · ' + esc(t.co) : '') + ' · ' + esc(when(t.created_at)) + '</div></div>' +
          '<div class="n">' + (+t.replies || 0) + '</div>' +
          '<div class="lm">' + esc(when(t.last_activity_at)) + '<br><span class="who">' + esc(sn(t.last_author || t.author)) + '</span></div></button>';
      });
    }
    root.innerHTML = html;
  }

  function loadThread(id) {
    return rpc('forum_thread_get', { p_id: id }).then(function (t) {
      st.thread = t;
      if (t && t.section) st.section = { id: t.section.id, title: t.section.title, has_status: t.section.has_status };
    });
  }
  function drawThread() {
    if (!root) return;
    var t = st.thread;
    var html = flashHtml();
    if (!t) { root.innerHTML = html + '<div class="fx-empty">Laddar…</div>'; return; }
    html += '<div class="fx-crumb"><button type="button" data-a="home">Forum</button><span>›</span>' +
      '<button type="button" data-a="sec" data-id="' + esc(t.section.id) + '">' + esc(t.section.title) + '</button>' +
      '<span>›</span><b>' + (t.sticky ? '📌 ' : '') + esc(t.title) + '</b>' + stChip(t.status) +
      (t.solved ? '<span class="fx-st fx-st-lost">Löst ✓</span>' : '') + '</div>';
    if (t.can_pin) {
      html += '<div class="fx-actions"><button type="button" data-a="pin">' + (t.sticky ? 'Lossa tråd' : 'Fäst tråd') + '</button></div>';
    }
    if (st.err) html += '<div class="fx-err">' + esc(st.err) + '</div>';
    if (t.section.has_status && t.status) {
      html += '<div class="fx-status">Status: <b>' + esc(stName(t.status)) + '</b>' +
        (t.status_by ? ' · satt av ' + esc(sn(t.status_by)) : '') +
        (t.status_at ? ' · ' + esc(when(t.status_at)) : '') +
        (t.status_comment ? '<div style="margin-top:.3rem">' + esc(t.status_comment) + '</div>' : '') + '</div>';
    }
    if (t.can_status) {
      html += '<div class="fx-chips">';
      STATUS.forEach(function (s) {
        html += '<button type="button" class="ank-chip' + (t.status === s[0] ? ' on' : '') + '" data-a="pick" data-s="' + s[0] + '">' + s[1] + '</button>';
      });
      html += '</div>';
      if (st.pick) {
        html += '<div class="fx-reply"><label style="font-size:.82rem;color:var(--text-soft)">Kommentar till status (valfritt)</label>' +
          '<textarea id="fx-stc" maxlength="500" placeholder="Kort kommentar…"></textarea>' +
          '<div class="fx-actions" style="margin-top:.4rem"><button type="button" class="ok" data-a="setst">Spara status</button>' +
          '<button type="button" data-a="pickx">Avbryt</button></div></div>';
      }
    }
    (t.posts || []).forEach(function (p) {
      html += '<div class="fx-post' + (p.hidden ? ' hid' : '') + (p.is_solution ? ' fx-sol' : '') + '"><div class="ph"><span class="au">' + who(p.author, p.aid) + '</span>' +
        '<span class="tm">#' + p.n + ' · ' + esc(when(p.created_at)) + (p.edited ? ' · redigerad' : '') +
        (p.is_solution ? ' · Löst ✓' : '') + '</span></div>' +
        '<div class="pb">' + esc(p.body) + '</div>' +
        '<div class="pf">' + (p.mine ? 'Du' : esc(sn(p.author))) + (p.co ? ' · ' + esc(p.co) : '');
      if (t.can_solve && p.n > 1) {
        if (p.is_solution) html += ' · <button type="button" data-a="unsolve">Ta bort Löst</button>';
        else html += ' · <button type="button" data-a="solve" data-id="' + p.id + '">Markera som Löst ✓</button>';
      }
      html += '</div></div>';
    });
    if (t.can_write) {
      html += '<div class="fx-reply">' + ruleBox(true) +
        '<textarea id="fx-reply" maxlength="5000" placeholder="Skriv ett svar…"></textarea>' +
        '<div class="fx-actions" style="margin-top:.4rem"><button type="button" class="ok" data-a="reply"' + (st.busy ? ' disabled' : '') + '>' +
        (st.busy ? 'Skickar…' : 'Skicka svar') + '</button></div></div>';
    } else if (!t.has_name) {
      html += '<div class="fx-empty">Fyll i ditt förnamn under Profil för att kunna svara.</div>';
    }
    root.innerHTML = html;
  }

  function drawEdit() {
    if (!root) return;
    var e = st.edit || {};
    var html = flashHtml();
    html += '<div class="fx-crumb"><button type="button" data-a="sec" data-id="' + esc(e.section || '') + '">‹ ' + esc(e.sectionTitle || 'Sektion') + '</button><span>·</span><b>Ny tråd</b></div>';
    if (st.err) html += '<div class="fx-err">' + esc(st.err) + '</div>';
    html += '<div class="fx-ed">' + ruleBox(true) +
      '<label>Rubrik</label><input id="fx-title" maxlength="120" value="' + esc(e.title || '') + '">' +
      '<label>Inlägg</label><textarea id="fx-body" maxlength="5000" rows="6">' + esc(e.body || '') + '</textarea>' +
      '<div class="fx-actions" style="margin-top:.6rem"><button type="button" class="ok" data-a="save"' + (st.busy ? ' disabled' : '') + '>' +
      (st.busy ? 'Publicerar…' : 'Publicera') + '</button>' +
      '<button type="button" data-a="sec" data-id="' + esc(e.section || '') + '">Avbryt</button></div></div>';
    root.innerHTML = html;
  }

  function drawGate() {
    if (!root) return;
    root.innerHTML = '<div class="fo-gate" role="dialog" aria-labelledby="fo-gate-h">' +
      '<h3 id="fo-gate-h">Forumregler</h3><p>' + esc(ruleText()) + '</p>' +
      '<p class="fo-gate-sub">Du behöver godkänna reglerna en gång för att använda forumet.</p>' +
      (st.gateErr ? '<div class="fo-err">' + esc(st.gateErr) + '</div>' : '') +
      '<div class="fo-gate-act"><button type="button" data-a="rulesback">Tillbaka</button>' +
      '<button type="button" class="fo-gate-ok" data-a="rulesok"' + (st.gateBusy ? ' disabled' : '') + '>' +
      (st.gateBusy ? 'Sparar…' : 'Jag godkänner') + '</button></div></div>';
  }

  function paint() {
    if(window.VIEW_STATE)VIEW_STATE.save('forum',{view:st.view,section:st.section&&st.section.id,thread:st.thread&&st.thread.id});
    if (st.view === 'gate') drawGate();
    else if (st.view === 'home') drawHome();
    else if (st.view === 'section') drawSection();
    else if (st.view === 'thread') drawThread();
    else if (st.view === 'edit') drawEdit();
  }

  function goHome() {
    st.view = 'home'; st.section = null; st.threads = null; st.thread = null; st.edit = null; st.err = null; st.pick = null;
    paint();
    loadHome().then(function () { if (st.view === 'home') paint(); })
      .catch(function (e) { if (!fail(e)) { st.err = errText(e); paint(); } });
  }
  function goSection(id) {
    st.view = 'section'; st.thread = null; st.edit = null; st.err = null; st.pick = null; st.threads = null;
    st.section = { id: id, title: (st.home && (st.home.sections || []).filter(function (s) { return s.id === id; })[0] || {}).title || id };
    push('section'); paint();
    loadSection(id).then(function () { if (st.view === 'section') paint(); })
      .catch(function (e) { if (!fail(e)) { st.err = errText(e); paint(); } });
  }
  function goThread(id) {
    st.view = 'thread'; st.edit = null; st.err = null; st.pick = null; st.thread = null;
    push('thread'); paint();
    loadThread(id).then(function () { if (st.view === 'thread') paint(); F.refreshBadge(); })
      .catch(function (e) { if (!fail(e)) { st.err = errText(e); paint(); } });
  }
  function openEditor(pre) {
    var sec = st.section || {};
    st.view = 'edit'; st.edit = {
      section: (pre && pre.cat) || sec.id,
      sectionTitle: sec.title || (pre && pre.cat) || '',
      title: (pre && pre.title) || '',
      body: (pre && pre.body) || ''
    };
    st.err = null; push('edit'); paint();
  }

  function onClick(ev) {
    var el = ev.target.closest('[data-a]');
    if (!el || !root.contains(el)) return;
    var a = el.getAttribute('data-a');
    if (a === 'rulehide') { try { localStorage.setItem(RULE_KEY, '1'); } catch (e) {} paint(); return; }
    if (a === 'ruleshow') { try { localStorage.removeItem(RULE_KEY); } catch (e) {} paint(); return; }
    if (a === 'rulesback') { if (typeof window.openItem === 'function') window.openItem('hem'); return; }
    if (a === 'rulesok') { rulesAccept(); return; }
    if (a === 'home') { goHome(); return; }
    if (a === 'sec') { goSection(el.getAttribute('data-id')); return; }
    if (a === 'locked') { alert('Den här sektionen är bara för ägare och superadmin.'); return; }
    if (a === 'thread') { goThread(+el.getAttribute('data-id')); return; }
    if (a === 'new') { openEditor(null); return; }
    if (a === 'togklar') {
      st.includeKlar = !st.includeKlar;
      if (st.section) loadSection(st.section.id).then(paint).catch(function (e) { if (!fail(e)) alert(errText(e)); });
      return;
    }
    if (a === 'pick') { st.pick = el.getAttribute('data-s'); paint(); return; }
    if (a === 'pickx') { st.pick = null; paint(); return; }
    if (a === 'setst') {
      if (!st.thread || !st.pick || st.busy) return;
      var c = document.getElementById('fx-stc');
      st.busy = true; paint();
      rpc('forum_thread_status', { p_thread_id: st.thread.id, p_status: st.pick, p_comment: c ? c.value : '' }).then(function () {
        st.busy = false; st.pick = null; st.flash = 'Statusen är sparad.';
        return loadThread(st.thread.id);
      }).then(function () { paint(); }).catch(function (e) {
        st.busy = false; if (!fail(e)) { st.err = errText(e); paint(); }
      });
      return;
    }
    if (a === 'pin') {
      if (!st.thread || st.busy) return;
      st.busy = true; paint();
      rpc('forum_thread_pin', { p_thread_id: st.thread.id, p_sticky: !st.thread.sticky }).then(function () {
        st.busy = false; st.flash = st.thread.sticky ? 'Tråden är lossad.' : 'Tråden är fäst.';
        return loadThread(st.thread.id);
      }).then(function () { paint(); }).catch(function (e) {
        st.busy = false; if (!fail(e)) { st.err = errText(e); paint(); }
      });
      return;
    }
    if (a === 'solve') {
      if (!st.thread || st.busy) return;
      st.busy = true; paint();
      rpc('forum_thread_solve', { p_thread_id: st.thread.id, p_reply_id: +el.getAttribute('data-id') }).then(function () {
        st.busy = false; st.flash = 'Svaret är markerat som Löst ✓.';
        return loadThread(st.thread.id);
      }).then(function () { paint(); }).catch(function (e) {
        st.busy = false; if (!fail(e)) { st.err = errText(e); paint(); }
      });
      return;
    }
    if (a === 'unsolve') {
      if (!st.thread || st.busy) return;
      st.busy = true; paint();
      rpc('forum_thread_solve', { p_thread_id: st.thread.id, p_reply_id: null }).then(function () {
        st.busy = false; st.flash = 'Löst-markeringen är borttagen.';
        return loadThread(st.thread.id);
      }).then(function () { paint(); }).catch(function (e) {
        st.busy = false; if (!fail(e)) { st.err = errText(e); paint(); }
      });
      return;
    }
    if (a === 'reply') {
      if (!st.thread || st.busy) return;
      var ta = document.getElementById('fx-reply');
      var body = ta ? ta.value : '';
      st.busy = true; st.err = null; paint();
      rpc('forum_thread_reply', { p_thread_id: st.thread.id, p_body: body }).then(function () {
        st.busy = false; st.flash = 'Svaret är skickat.';
        return loadThread(st.thread.id);
      }).then(function () { paint(); }).catch(function (e) {
        st.busy = false; if (!fail(e)) { st.err = errText(e); paint(); }
      });
      return;
    }
    if (a === 'save') {
      if (!st.edit || st.busy) return;
      var ti = document.getElementById('fx-title');
      var bo = document.getElementById('fx-body');
      st.edit.title = ti ? ti.value : '';
      st.edit.body = bo ? bo.value : '';
      st.busy = true; st.err = null; paint();
      rpc('forum_thread_new', { p_section: st.edit.section, p_title: st.edit.title, p_body: st.edit.body }).then(function (r) {
        st.busy = false; st.flash = 'Tråden är publicerad.';
        goThread(r.id);
      }).catch(function (e) {
        st.busy = false; if (!fail(e)) { st.err = errText(e); paint(); }
      });
      return;
    }
  }

  function enterForum(content, pre) {
    st.view = 'home'; st.thread = null; st.edit = null; st.err = null; st.pick = null;
    paint();
    loadHome().then(function () {
      if (st.view !== 'home' || root !== content) return;
      paint();
      if (pre) {
        // Prognos m.fl. skickar cat (t.ex. buggar) + title/body
        var cat = pre.cat || 'buggar';
        st.section = (st.home.sections || []).filter(function (s) { return s.id === cat; })[0] || { id: cat, title: cat };
        openEditor(pre);
      } else if (F._post) {
        var pid = F._post; F._post = null; goThread(pid);
      } else if(F._section){var sid=F._section;F._section=null;goSection(sid);
      }
    }).catch(function (e) { if (!fail(e)) { st.err = errText(e); paint(); } });
  }

  function rulesAccept() {
    var content = root;
    if (window.DEMO && DEMO.on()) {
      setRulesOk(true); var dp = st.gatePre; st.gatePre = null; enterForum(content, dp); return;
    }
    st.gateBusy = true; st.gateErr = null; drawGate();
    rpc('forum_rules_accept', { p_version: RULES_VERSION }).then(function (r) {
      st.gateBusy = false;
      if (!r || !r.accepted) throw new Error('x');
      setRulesOk(true);
      var pre = st.gatePre; st.gatePre = null;
      if (root === content && st.view === 'gate') enterForum(content, pre);
    }).catch(function (e) {
      st.gateBusy = false;
      if (fail(e)) return;
      st.gateErr = 'Det gick inte att spara. Kontrollera nätet och försök igen.';
      if (st.view === 'gate') drawGate();
    });
  }

  F.render = function (content) {
    var nav=window.VIEW_STATE&&VIEW_STATE.get('forum',{});if(nav&&!F._post&&!F._section){F._post=nav.thread||null;F._section=nav.thread?null:nav.section;}
    root = content;
    content.onclick = onClick;
    var pre = F._pre; F._pre = null;
    if (!rulesOk()) {
      st.view = 'gate'; st.gatePre = pre || st.gatePre || null; st.gateErr = null; st.gateBusy = false;
      drawGate();
      rpc('forum_rules_status', { p_version: RULES_VERSION }).then(function (r) {
        if (r && r.accepted) {
          setRulesOk(true);
          var p2 = st.gatePre; st.gatePre = null;
          if (root === content && st.view === 'gate' && !st.gateBusy) enterForum(content, p2);
        }
      }).catch(function (e) { fail(e); });
      return;
    }
    enterForum(content, pre);
    rpc('forum_rules_status', { p_version: RULES_VERSION }).then(function (r) {
      if (r && r.accepted === false && !(window.DEMO && DEMO.on())) {
        setRulesOk(false);
        if (root === content && st.view !== 'gate') {
          st.view = 'gate'; drawGate();
        }
      }
    }).catch(function () {});
  };

  F.openPost = function (id) {
    // Nya tråd-id:n. Gamla forum_post_id (tomt) fungerar inte — öppnar hemmet om id saknas.
    F._post = +id || null;
    if (typeof window.openItem === 'function') window.openItem(F.id);
  };
  F.compose = function (pre) {
    // pre.cat: sektion-id (buggar/onskemal/allmant/akeri/admin). title/body förifylls.
    if (pre && pre.cat === 'forslag') pre.cat = 'onskemal'; // bakåtkompat med gamla kategorinamnet
    F._pre = pre || {};
    if (typeof window.openItem === 'function') window.openItem(F.id);
  };
  F.back = function () {
    if (!root || st.view === 'home' || st.view === 'gate') return false;
    if (st.view === 'thread' || st.view === 'edit') {
      if (st.section && st.section.id) { goSection(st.section.id); return true; }
      if (st.thread && st.thread.section) { goSection(st.thread.section.id); return true; }
    }
    goHome();
    return true;
  };
  F.refreshBadge = function () {
    if (!token()) return;
    rpc('forum_classic_badge', {}).then(function (n) { setUnread(n); }).catch(function () {});
  };
})();
