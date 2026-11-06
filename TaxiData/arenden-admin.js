/* Admin › Ärenden – gemensam ärendelista för ägaren och S admin (2026-11-06, Christians "kör" t962u)
 * Inte en personlig inkorg: alla admin ser samma lista. Nya och olösta först, kompakt lista med rubriker.
 * Tryck på ett ärende för att öppna det separat, med verktyg: ändra status och svara (som en mejlkorg med adminverktyg).
 * Klara ärenden är ihopfällda ("Visa klara (N)"). Filter per status. "Behöver ditt svar" markeras tydligt.
 * Servern: case_admin_list, case_get, case_seen (supabase/migrations/20261106e_inkorg_arenden.sql).
 * Verktygen använder de vanliga funktionerna: set_car_issue_status, car_issue_message, admin_workshop_decide,
 * workshop_ask, sjuk_decide. Inget nytt sätt att ändra ärenden.
 */
(function () {
  var A = window.ARENDE, esc = A.esc;
  var R = window.ARENDEN_ADMIN = {};
  var st = { data: null, err: null, filter: 'alla', showDone: false, open: null, cur: null, busy: false, el: null };

  R.count = function () {
    return A.rpc('case_admin_list', {}).then(function (d) { st.data = d || { items: [] }; st.err = null; return R.needs(); })
      .catch(function (e) { st.err = e; return 0; });
  };
  R.needs = function () { return ((st.data && st.data.items) || []).filter(function (x) { return x.needs; }).length; };
  R.badge = function () { var n = R.needs(); return n ? '<span class="ar-badge" aria-label="' + n + ' behöver svar">' + n + '</span>' : ''; };
  R.load = function () { R.count().then(function () { if (st.el) R.render(st.el); }); };
  R.render = function (el) {
    st.el = el;
    if (st.open) return paintCase();
    paint();
  };
  R.back = function () {
    if (st.open) { st.open = null; st.cur = null; paint(); R.count().then(function () { if (!st.open) paint(); }); return true; }
    return false;
  };
  R.openCase = function (kind, id) { st.open = { kind: kind, id: +id }; st.cur = null; if (st.el) paintCase(); };
  R.isOpen = function () { return !!st.open; };
  R.filter = function (f) { st.filter = f; paint(); };
  R.toggleDone = function () { st.showDone = !st.showDone; paint(); };
  R.tap = function (kind, id) { R.openCase(kind, id); try { window.scrollTo(0, 0); } catch (e) {} };

  function row(x) {
    var sub = [x.who ? esc(window.shortName ? shortName(x.who) : x.who) : '', x.txt ? esc(x.txt) : ''].filter(Boolean).join(' · ');
    return '<button type="button" class="ar-row' + (x.needs ? ' need' : '') + (x.st === 'klar' ? ' done' : '') + '" onclick="ARENDEN_ADMIN.tap(\'' + x.kind + '\',' + x.id + ')">' +
      '<span class="ar-ico" aria-hidden="true">' + A.icon(x) + '</span><span class="ar-main">' +
      '<span class="ar-t"><b>' + esc(x.title) + (x.car ? ' · ' + esc(x.car) : '') + '</b>' + A.chip(x.st, A.detail(x.kind, x.status)) + '</span>' +
      (sub ? '<span class="ar-s">' + sub + '</span>' : '') +
      '<span class="ar-m">' + (x.needs ? A.needsTag() : '') + (x.urgent ? '<span class="ar-needs" style="background:#9b2c2c">🛑 Bilen står</span>' : '') +
      (x.last_from === 'forare' && x.st !== 'klar' ? '<span>💬 Föraren skrev senast</span>' : '') + '<span>' + esc(A.ago(x.at)) + '</span></span>' +
      '</span></button>';
  }
  function group(title, list) { return list.length ? '<div class="ar-h">' + title + ' (' + list.length + ')</div><div class="ar-list">' + list.map(row).join('') + '</div>' : ''; }

  function paint() {
    var el = st.el; if (!el) return;
    if (!st.data) {
      el.innerHTML = '<div class="section" style="padding:16px">' + (st.err ? (st.err.message === 'forbidden' ? 'Ingen behörighet. Ärendelistan är för ägaren och S admin.' : 'Kunde inte hämta ärendena. Försök igen.') : 'Laddar…') + '</div>';
      return;
    }
    var items = st.data.items || [], sp = A.split(items, st.filter), h = '<div style="padding:8px 12px 24px">';
    h += '<div class="ar-note" style="margin:0 2px 10px">Gemensam lista för alla admin. Tryck på ett ärende för att öppna det.</div>';
    h += A.filters(items, st.filter, 'ARENDEN_ADMIN.filter');
    if (!items.length) h += '<div class="ar-list"><div class="ar-empty">Inga ärenden just nu. 👍</div></div>';
    else if (st.filter === 'alla') {
      var o = sp.open;
      h += group('✋ Behöver ditt svar', o.filter(function (x) { return x.needs; }));
      h += group('Ny', o.filter(function (x) { return !x.needs && x.st === 'ny'; }));
      h += group('Pågår', o.filter(function (x) { return !x.needs && x.st === 'pagar'; }));
      h += group('Väntar på svar från föraren', o.filter(function (x) { return !x.needs && x.st === 'vantar'; }));
      if (!o.length) h += '<div class="ar-list"><div class="ar-empty">Inga öppna ärenden. 👍</div></div>';
      if (sp.done.length) {
        h += '<button type="button" class="ar-more" onclick="ARENDEN_ADMIN.toggleDone()">' + (st.showDone ? 'Dölj klara' : 'Visa klara (' + sp.done.length + ')') + '</button>';
        if (st.showDone) h += '<div class="ar-list" style="margin-top:8px">' + sp.done.map(row).join('') + '</div>';
      }
    } else {
      var t = st.filter === 'needs' ? '✋ Behöver ditt svar' : A.WORDS[st.filter];
      h += sp.open.length ? group(t, sp.open) : '<div class="ar-list"><div class="ar-empty">Inget här just nu.</div></div>';
    }
    el.innerHTML = h + '</div>';
  }

  function btn(label, fn, cls) { return '<button type="button"' + (cls ? ' class="' + cls + '"' : '') + ' onclick="' + fn + '">' + label + '</button>'; }
  function tools(c) {
    var d = c.data || {}, k = c.kind, h = '<div class="ar-tools"><div class="ar-h">Adminverktyg</div>';
    var ta = function (ph) { return '<div class="ar-reply" style="margin-top:0"><textarea id="ara-txt" maxlength="1000" placeholder="' + ph + '"></textarea></div>'; };
    if (k === 'issue') {
      h += ta(d.mine ? 'Anteckning (du anmälde själv)' : 'Svara föraren…');
      h += '<div class="ar-btns">' + (d.mine ? '' : btn('💬 Skicka svar', "ARENDEN_ADMIN.act('reply')", 'pri')) + '</div>';
      h += '<div class="ar-h" style="margin-top:12px">Ändra status</div><div class="ar-btns">' +
        (d.status !== 'pagar' && d.status !== 'klar' ? btn('Pågår', "ARENDEN_ADMIN.act('pagar')") : '') +
        (d.status !== 'klar' ? btn('✓ Klar', "ARENDEN_ADMIN.act('klar')", 'ok') : btn('↩️ Öppna igen', "ARENDEN_ADMIN.act('ny')")) + '</div>' +
        '<div class="ar-note">Står det text i rutan när du ändrar status, skickas den med som kommentar.</div>';
    } else if (k === 'wh') {
      h += ta('Fråga eller kommentar till föraren…');
      h += '<div class="ar-btns">' + btn('❓ Skicka fråga (Väntar på svar)', "ARENDEN_ADMIN.act('ask')", 'pri') + '</div>';
      h += '<div class="ar-h" style="margin-top:12px">Beslut</div><div class="ar-btns">' +
        (d.status !== 'approved' ? btn('✓ Godkänn (Klar)', "ARENDEN_ADMIN.act('approved')", 'ok') : '') +
        (d.status !== 'rejected' ? btn('Neka (Klar)', "ARENDEN_ADMIN.act('rejected')") : '') + '</div>';
    } else if (k === 'sjuk') {
      h += ta('Kommentar till föraren (valfri)…');
      h += '<div class="ar-btns">' +
        (d.status !== 'godkand' ? btn('✓ Godkänn (Klar)', "ARENDEN_ADMIN.act('godkand')", 'ok') : '') +
        (d.status !== 'intyg_begart' ? btn('📄 Begär läkarintyg', "ARENDEN_ADMIN.act('intyg_begart')") : '') +
        (d.status !== 'avslagen' ? btn('Avslå (Klar)', "ARENDEN_ADMIN.act('avslagen')") : '') +
        (d.status !== 'ny' ? btn('↩️ Öppna igen', "ARENDEN_ADMIN.act('ny')") : '') + '</div>' +
        '<div class="ar-note">Sjuklön och intyg hanteras som förut under Anmälningar & ärenden › Sjuk.</div>';
    } else if (k === 'task') {
      h += '<div class="ar-btns">' + btn('Öppna uppgiften i appen', "VERKSTAD_ADMIN.openApp('uppg')", 'pri') + '</div>';
    }
    return h + '</div>';
  }

  function paintCase() {
    var el = st.el; if (!el) return;
    var o = st.open, c = st.cur, back = '<button type="button" class="ar-back" onclick="ARENDEN_ADMIN.back()">‹ Alla ärenden</button>';
    if (!c) {
      el.innerHTML = '<div style="padding:8px 12px 24px">' + back + '<div class="ar-empty">Laddar…</div></div>';
      A.rpc('case_get', { p_kind: o.kind, p_id: o.id }).then(function (r) {
        if (st.open !== o) return;
        st.cur = r; paintCase();
        A.rpc('case_seen', { p_kind: o.kind, p_id: o.id }).catch(function () {});
      }).catch(function (e) { if (st.open !== o) return; el.innerHTML = '<div style="padding:8px 12px 24px">' + back + '<div class="ar-empty">' + esc(A.errText(e)) + '</div></div>'; });
      return;
    }
    el.innerHTML = '<div style="padding:8px 12px 24px">' + back + A.view(c, 'owner') + tools(c) + '</div></div>';
  }

  R.act = function (a) {
    var c = st.cur; if (!c || st.busy) return;
    var ta = document.getElementById('ara-txt'), v = ta ? ta.value.trim() : '', p;
    if (c.kind === 'issue') {
      if (a === 'reply') { if (!v) { ta.focus(); return; } p = A.rpc('car_issue_message', { p_id: c.id, p_body: v }); }
      else p = A.rpc('set_car_issue_status', { p_id: c.id, p_status: a, p_comment: v || null });
    } else if (c.kind === 'wh') {
      if (a === 'ask') { if (!v) { ta.focus(); return; } p = A.rpc('workshop_ask', { p_id: c.id, p_body: v }); }
      else p = A.rpc('admin_workshop_decide', { p_id: c.id, p_status: a, p_comment: v || null });
    } else if (c.kind === 'sjuk') {
      p = A.rpc('sjuk_decide', { p_id: c.id, p_status: a, p_comment: v || null });
    }
    if (!p) return;
    st.busy = true;
    document.querySelectorAll('.ar-tools button').forEach(function (b) { b.disabled = true; });
    p.then(function () {
      st.busy = false; st.cur = null; paintCase(); R.count();
      if (window.showToast) showToast('Sparat. Föraren får en notis.');
    }).catch(function (e) {
      st.busy = false; document.querySelectorAll('.ar-tools button').forEach(function (b) { b.disabled = false; });
      alert(A.errText(e));
    });
  };
})();
