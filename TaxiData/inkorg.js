/* Inkorg (förare) – under profilikonen uppe till höger (2026-11-06, Christians "kör" t962u)
 * Mina egna ärenden: felanmälan, behövs till bilen, verkstadstid, uppgift, sjukanmälan, önskemål.
 * Varje ärende är en tråd. Klockan (🔔) är kvar för notiser: när ägaren svarar på ett öppet ärende hamnar
 * svaret i tråden här och klockan får en kort notis som leder hit. Läser man svaret försvinner båda.
 * Servern: case_inbox, case_get, case_seen (supabase/migrations/20261106f_inkorg_arenden.sql).
 * Svar skickas med de vanliga funktionerna: car_issue_message (ärende), workshop_reply (verkstadstid).
 */
(function () {
  var A = window.ARENDE, esc = A.esc;
  var I = window.INKORG = { id: 'inkorg', title: 'Inkorg' };
  var st = { data: null, err: false, filter: 'alla', showDone: false, open: null, cur: null, busy: false, el: null, klarLim: 300 };

  function badge() {
    var d = st.data || {}, n = (d.items || []).filter(function (x) { return x.needs || x.unread > 0; }).length;
    if (window.setBadge) {
      window.INKORG_HAS = n > 0;
      setBadge('inkorg', n);
      setBadge('profbtn', !!window.INKORG_NEEDS_PROFILE || n > 0);   // pricken på 👤 (profilpåminnelse eller Inkorg)
    }
  }
  I.refresh = function () {
    if (!localStorage.getItem('taxi_session')) return Promise.resolve();
    return A.rpc('case_inbox', { p_klar_limit: st.klarLim }).then(function (d) { st.data = d || { items: [] }; st.err = false; badge(); if (st.el && !st.open) paint(); })
      .catch(function (e) { if (e && e.code === '28000') return; st.err = true; if (st.el && !st.open) paint(); });
  };
  I.start = function () { I.refresh(); if (!I._t) I._t = setInterval(function () { if (!document.hidden) I.refresh(); }, 120000); };

  I.render = function (el) {
    st.el = el;
    if (st.open) return paintCase();
    paint();
    I.refresh();
  };
  I.back = function () {
    if (st.open) { st.open = null; st.cur = null; paint(); I.refresh(); return true; }
    return false;
  };
  // Öppna en tråd direkt (från klockan): byter till Inkorgen om den inte redan är öppen
  I.openCase = function (kind, id) {
    st.open = { kind: kind, id: +id }; st.cur = null;
    if (typeof window.openInbox === 'function') window.openInbox();
    else if (st.el) paintCase();
  };
  // Finns ärendet i min Inkorg? (annars är det ett ärende för ägaren/admin)
  I.has = function (kind, id) { return !!((st.data && st.data.items) || []).filter(function (x) { return x.kind === kind && x.id === +id; }).length; };
  I.isAdmin = function () { return ['agare', 'superadmin'].indexOf(String(window.INKORG_ROLE || '')) >= 0; };
  I.filter = function (f) { st.filter = f; paint(); };
  I.toggleDone = function () { st.showDone = !st.showDone; paint(); };
  // Klara sparas för alltid; de hämtas i omgångar så att listan går snabbt
  I.more = function () { st.klarLim += 300; I.refresh(); };
  I.tap = function (kind, id) {
    st.open = { kind: kind, id: +id }; st.cur = null;
    try { history.pushState({ view: 'inkorg', c: kind + ':' + id }, ''); } catch (e) {}
    paintCase();
  };

  function row(x) {
    var who = x.last_from === 'agare' ? 'Ägaren: ' : x.last_from === 'du' ? 'Du: ' : '';
    var sub = x.last_txt ? who + x.last_txt : (x.txt || '');
    return '<button type="button" class="ar-row' + (x.needs ? ' need' : '') + (x.st === 'klar' ? ' done' : '') + '" onclick="INKORG.tap(\'' + x.kind + '\',' + x.id + ')">' +
      '<span class="ar-ico" aria-hidden="true">' + A.icon(x) + '</span><span class="ar-main">' +
      '<span class="ar-t"><b>' + esc(x.title) + (x.car ? ' · ' + esc(x.car) : '') + '</b>' + A.chip(x.st, A.detail(x.kind, x.status)) + '</span>' +
      (sub ? '<span class="ar-s">' + esc(sub) + '</span>' : '') +
      '<span class="ar-m">' + (x.needs ? A.needsTag() : '') + (x.unread > 0 ? '<span style="color:#c53030;font-weight:700">● Nytt svar</span>' : '') + '<span>' + esc(A.ago(x.at)) + '</span></span>' +
      '</span>' + (x.unread > 0 ? '<span class="ar-dot" aria-label="Oläst"></span>' : '') + '</button>';
  }
  function paint() {
    var el = st.el; if (!el) return;
    var d = st.data;
    if (!d) { el.innerHTML = '<div class="ar-empty">' + (st.err ? 'Kunde inte hämta Inkorgen. Kontrollera nätet.' : 'Laddar…') + '</div>'; return; }
    var items = d.items || [], sp = A.split(items, st.filter), h = '';
    h += '<div class="ar-note" style="margin:0 2px 10px">Här samlas dina ärenden och svaren på dem. Notiser finns kvar under 🔔.</div>';
    h += A.filters(items, st.filter, 'INKORG.filter');
    if (!items.length) h += '<div class="ar-list"><div class="ar-empty">Inga ärenden än.<br>När du gör en felanmälan, skickar verkstadstid eller får en uppgift syns det här.</div></div>';
    else {
      var needs = sp.open.filter(function (x) { return x.needs; }), rest = sp.open.filter(function (x) { return !x.needs; });
      if (st.filter === 'alla' && needs.length) h += '<div class="ar-h">Behöver ditt svar (' + needs.length + ')</div><div class="ar-list">' + needs.map(row).join('') + '</div>';
      var list = st.filter === 'alla' ? rest : sp.open;
      if (list.length) h += '<div class="ar-h">' + (st.filter === 'alla' ? 'Öppna' : st.filter === 'needs' ? 'Behöver ditt svar' : A.WORDS[st.filter]) + ' (' + list.length + ')</div><div class="ar-list">' + list.map(row).join('') + '</div>';
      else if (!(st.filter === 'alla' && needs.length)) h += '<div class="ar-list"><div class="ar-empty">Inget här just nu. 👍</div></div>';
      if (sp.done.length) {
        var dn = sp.done.filter(function (x) { return x.unread > 0; }).length;
        var tot = Math.max(d.klar_total || 0, sp.done.length);
        h += '<button type="button" class="ar-more" onclick="INKORG.toggleDone()">' + (st.showDone ? 'Dölj klara' : 'Visa klara (' + tot + ')' + (dn ? ' · ● ' + dn + ' nytt' : '')) + '</button>';
        if (st.showDone) {
          h += '<div class="ar-list" style="margin-top:8px">' + sp.done.map(row).join('') + '</div>';
          if (tot > sp.done.length) h += '<button type="button" class="ar-more" onclick="INKORG.more()">Visa fler klara (' + (tot - sp.done.length) + ' till)</button>';
        }
      }
    }
    el.innerHTML = h;
  }

  function paintCase() {
    var el = st.el; if (!el) return;
    var o = st.open, c = st.cur;
    var back = '<button type="button" class="ar-back" onclick="INKORG.back()">‹ Inkorgen</button>';
    if (!c) {
      el.innerHTML = back + '<div class="ar-empty">Laddar…</div>';
      A.rpc('case_get', { p_kind: o.kind, p_id: o.id }).then(function (r) {
        if (st.open !== o) return;
        st.cur = r; paintCase();
        // läst: tar bort "nytt svar" i Inkorgen och klockans notis för ärendet
        A.rpc('case_seen', { p_kind: o.kind, p_id: o.id }).then(function () {
          I.refresh(); if (window.NOTIS && NOTIS.refresh) NOTIS.refresh(true);
        }).catch(function () {});
      }).catch(function (e) { if (st.open !== o) return; el.innerHTML = back + '<div class="ar-empty">' + esc(A.errText(e)) + '</div>'; });
      return;
    }
    var d = c.data || {}, h = back + A.view(c, 'driver');
    if (c.kind === 'issue' && d.status !== 'klar') {
      h += '<div class="ar-reply"><textarea id="ink-txt" maxlength="1000" placeholder="Skriv till ägaren…"></textarea>' +
        '<div class="ar-btns"><button type="button" class="pri" id="ink-send" onclick="INKORG.send()">Skicka</button></div></div>';
    } else if (c.kind === 'wh' && d.status === 'pending') {
      h += '<div class="ar-reply"><textarea id="ink-txt" maxlength="1000" placeholder="' + (d.waiting_on === 'driver' ? 'Svara på ägarens fråga…' : 'Skriv till ägaren…') + '"></textarea>' +
        '<div class="ar-btns"><button type="button" class="pri" id="ink-send" onclick="INKORG.send()">Skicka</button></div></div>';
    } else if (c.kind === 'task') {
      h += '<div class="ar-btns"><button type="button" class="pri" onclick="INKORG.app(\'uppg\')">Öppna uppgiften och svara</button></div>';
    } else if (c.kind === 'sjuk') {
      h += '<div class="ar-btns"><button type="button" class="pri" onclick="INKORG.app(\'sjuk\')">' + (d.status === 'intyg_begart' ? '📄 Ladda upp läkarintyg' : 'Öppna sjukanmälan') + '</button></div>';
    } else if (c.kind === 'wish') {
      h += '<div class="ar-note">Christian läser önskemålen och svarar här.</div>';
    } else {
      h += '<div class="ar-note">Ärendet är klart. Vill du ta upp det igen, gör en ny anmälan.</div>';
    }
    el.innerHTML = h + '</div>';
  }
  I.send = function () {
    var c = st.cur, ta = document.getElementById('ink-txt'), b = document.getElementById('ink-send');
    if (!c || !ta || st.busy) return;
    var v = ta.value.trim(); if (!v) { ta.focus(); return; }
    st.busy = true; if (b) { b.disabled = true; b.textContent = 'Skickar…'; }
    var p = c.kind === 'issue' ? A.rpc('car_issue_message', { p_id: c.id, p_body: v }) : A.rpc('workshop_reply', { p_id: c.id, p_body: v });
    p.then(function () { st.cur = null; st.busy = false; paintCase(); if (window.showToast) showToast('Skickat till ägaren.'); })
      .catch(function (e) { st.busy = false; if (b) { b.disabled = false; b.textContent = 'Skicka'; } alert(A.errText(e)); });
  };
  // Uppgifter och sjukanmälan har egna formulär i Anmälningar & ärenden
  I.app = function (tab) {
    if (!window.VERKSTAD || typeof window.openItem !== 'function') return;
    try { localStorage.setItem('bil_tab', tab); } catch (e) {}
    st.open = null; st.cur = null;
    openItem(VERKSTAD.id);
    if (VERKSTAD.openTab) { try { VERKSTAD.openTab(tab); } catch (e) {} }
  };
  I.logout = function () { st.data = null; st.open = null; st.cur = null; if (I._t) { clearInterval(I._t); I._t = null; } };
})();
