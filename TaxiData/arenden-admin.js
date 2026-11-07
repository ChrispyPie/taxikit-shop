/* Admin › Ärenden – gemensam ärendelista för ägaren och S admin (2026-11-06, Christians "kör" t962u)
 * Inte en personlig inkorg: alla admin ser samma lista. Nya och olösta först, kompakt lista med rubriker.
 * Tryck på ett ärende för att öppna det separat, med verktyg: ändra status och svara (som en mejlkorg med adminverktyg).
 * Klara ärenden är ihopfällda ("Visa klara (N)") men tas aldrig bort på grund av ålder. Önskemål (ägaren → Christian) finns med. Filter per status. "Behöver ditt svar" markeras tydligt.
 * Servern: case_admin_list, case_get, case_seen (supabase/migrations/20261106f_inkorg_arenden.sql).
 * Verktygen använder de vanliga funktionerna: set_car_issue_status, car_issue_message, admin_workshop_decide,
 * workshop_ask, sjuk_decide. Inget nytt sätt att ändra ärenden.
 */
(function () {
  var A = window.ARENDE, esc = A.esc;
  var R = window.ARENDEN_ADMIN = {};
  var st = { data: null, err: null, filter: 'alla', showDone: false, open: null, cur: null, busy: false, el: null, klarLim: 300, type: 'all', bil: null };

  R.count = function () {
    return A.rpc('case_admin_list', { p_klar_limit: st.klarLim }).then(function (d) { st.data = d || { items: [] }; st.err = null; return R.needs(); })
      .catch(function (e) { st.err = e; return 0; });
  };
  R.needs = function () { return ((st.data && st.data.items) || []).filter(function (x) { return x.needs; }).length; };
  R.badge = function () { var n = R.needs(); return n ? '<span class="ar-badge" aria-label="' + n + ' behöver svar">' + n + '</span>' : ''; };
  R.load = function () { Promise.all([R.count(), A.rpc('get_bil', {}).then(function(b){st.bil=b;}).catch(function(){st.bil={error:true};})]).then(function () { if (st.el && st.el.isConnected) R.render(st.el); }); };
  R.render = function (el) {
    if (el !== st.el) { el.innerHTML = '<div id="admin-cases-root"></div>'; st.el = el.querySelector('#admin-cases-root'); }
    if (st.open) return paintCase();
    paint();
  };
  R.back = function () {
    if (st.open) { st.open = null; st.cur = null; paint(); R.count().then(function () { if (!st.open) paint(); }); return true; }
    return false;
  };
  R.openCase = function (kind, id) { st.open = { kind: kind, id: +id }; st.cur = null; if (st.el) paintCase(); };
  R.isOpen = function () { return !!st.open; };
  R.type = function(t) { st.type=t; st.filter='alla'; st.showDone=false; paint(); };
  R.filter = function (f) { st.filter = f; paint(); };
  R.toggleDone = function () { st.showDone = !st.showDone; paint(); };
  // Klara sparas för alltid (underlag); de hämtas i omgångar
  R.more = function () { st.klarLim += 300; R.load(); };
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
    var items = (st.data.items || []).filter(function(x){ return st.type==='all' || x.kind===st.type; }), sp = A.split(items, st.filter), h = '<div style="padding:8px 12px 24px">';
    h += '<div class="ar-note" style="margin:0 2px 10px">Öppna ett ärende för att svara eller ta beslut. Löneunderlag finns under Löner.</div>';
    h += '<label for="ara-type" class="ar-note">Typ av ärende</label><select id="ara-type" style="width:100%;min-height:44px;padding:10px;margin:6px 0 12px;border:1px solid var(--border,#cbd5e0);border-radius:10px;background:var(--surface);color:inherit;font:inherit" onchange="ARENDEN_ADMIN.type(this.value)">' +
      [['all','Alla typer'],['issue','Behövs till bilen / Fel på bilen'],['maint','Underhåll'],['wh','Verkstadstid'],['task','Uppgifter'],['sjuk','Sjukanmälningar'],['wish','Önskemål till Christian']].map(function(t){ return '<option value="'+t[0]+'"'+(st.type===t[0]?' selected':'')+'>'+t[1]+'</option>'; }).join('') + '</select>';
    if(st.type==='maint') { paintMaintenance(el,h); return; }

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
        var tot = st.type==='all' ? Math.max(st.data.klar_total || 0, sp.done.length) : sp.done.length;
        h += '<button type="button" class="ar-more" onclick="ARENDEN_ADMIN.toggleDone()">' + (st.showDone ? 'Dölj klara' : 'Visa klara (' + tot + ')') + '</button>';
        if (st.showDone) {
          h += '<div class="ar-list" style="margin-top:8px">' + sp.done.map(row).join('') + '</div>';
          if (tot > sp.done.length) h += '<button type="button" class="ar-more" onclick="ARENDEN_ADMIN.more()">Visa fler klara (' + (tot - sp.done.length) + ' till)</button>';
        }
      }
    } else {
      var t = st.filter === 'needs' ? '✋ Behöver ditt svar' : A.WORDS[st.filter];
      h += sp.open.length ? group(t, sp.open) : '<div class="ar-list"><div class="ar-empty">Inget här just nu.</div></div>';
    }
    if(st.type!=='all' && (st.data.klar_total||0)>(st.data.items||[]).filter(function(x){return x.st==='klar';}).length) h+='<button type="button" class="ar-more" onclick="ARENDEN_ADMIN.more()">Hämta fler avslutade ärenden</button>';
    el.innerHTML = h + '</div>';
  }

  function paintMaintenance(el,h) {
    var b=st.bil;
    if(!b || b.error) { el.innerHTML=h+'<div class="ar-empty">'+(b?'Kunde inte hämta underhåll.':'Laddar underhåll…')+'</div></div>'; return; }
    var all=b.maint||[], open=all.filter(function(m){return m.status!=='klar';}), done=all.filter(function(m){return m.status==='klar';});
    function rows(ms){return '<div class="ar-list">'+ms.map(function(m){return '<div class="ar-row"><span class="ar-ico">🔧</span><span class="ar-main"><b>'+esc(m.title||m.type||'Underhåll')+'</b><span class="ar-s">'+esc(m.car||m.car_label||'')+' · '+esc(m.status==='klar'?'Klar':m.status==='forslag'?'Förslag':m.level===2?'Försenat':'Planerat')+'</span></span></div>';}).join('')+'</div>';}
    h+=rows(open);
    if(!open.length)h+='<p class="ar-empty">Inget öppet underhåll.</p>';
    if(done.length){h+='<button type="button" class="ar-more" onclick="ARENDEN_ADMIN.toggleDone()">'+(st.showDone?'Dölj klara':'Visa klara ('+done.length+')')+'</button>';if(st.showDone)h+=rows(done);}
    h+='<div class="ar-btns"><button type="button" class="pri" onclick="VERKSTAD_ADMIN.openApp(\'underhall\')">Hantera underhåll</button></div>';
    el.innerHTML=h+'</div>';
  }

  // Neutrala knappar, bara liten färgad ikon (t1010u). Färg bär bara ärendets status.
  var OK = '<span style="color:#1d6b38;font-weight:700">✓</span>', NO = '<span style="color:#c53030;font-weight:700">✗</span>';
  function btn(label, fn, cls) { return '<button type="button"' + (cls ? ' class="' + cls + '"' : '') + ' onclick="' + fn + '">' + label + '</button>'; }
  function tools(c) {
    var d = c.data || {}, k = c.kind, h = '<div class="ar-tools"><div class="ar-h">Adminverktyg</div>';
    var ta = function (ph) { return '<div class="ar-reply" style="margin-top:0"><textarea id="ara-txt" maxlength="1000" placeholder="' + ph + '"></textarea></div>'; };
    if (k === 'issue') {
      h += ta(d.mine ? 'Anteckning (du anmälde själv)' : 'Svara föraren…');
      h += '<div class="ar-btns">' + (d.mine ? '' : btn('💬 Skicka svar', "ARENDEN_ADMIN.act('reply')", 'pri')) + '</div>';
      h += '<div class="ar-h" style="margin-top:12px">Ändra status</div><div class="ar-btns">' +
        (d.status !== 'pagar' && d.status !== 'klar' ? btn('Pågår', "ARENDEN_ADMIN.act('pagar')") : '') +
        (d.status !== 'klar' ? btn(OK + ' Klar', "ARENDEN_ADMIN.act('klar')", 'ok') : btn('↩️ Öppna igen', "ARENDEN_ADMIN.act('ny')")) + '</div>' +
        '<div class="ar-note">Står det text i rutan när du ändrar status, skickas den med som kommentar.</div>';
    } else if (k === 'wh') {
      h += ta('Fråga eller motivering till beslutet…');
      h += '<div class="ar-btns">' + btn('Fråga föraren', "ARENDEN_ADMIN.act('ask')", 'pri') + '</div>';
      h += '<div class="ar-h" style="margin-top:12px">Beslut</div><div class="ar-btns">' +
        (d.status !== 'approved' ? btn(OK + ' Godkänn (Klar)', "ARENDEN_ADMIN.act('approved')", 'ok') : '') +
        (d.status !== 'rejected' ? btn(NO + ' Neka (Klar)', "ARENDEN_ADMIN.act('rejected')") : '') + '</div>';
    } else if (k === 'sjuk') {
      h += ta('Kommentar till föraren (valfri)…');
      h += '<div class="ar-btns">' +
        (d.status !== 'godkand' ? btn(OK + ' Godkänn (Klar)', "ARENDEN_ADMIN.act('godkand')", 'ok') : '') +
        (d.status !== 'intyg_begart' ? btn('📄 Begär läkarintyg', "ARENDEN_ADMIN.act('intyg_begart')") : '') +
        (d.status !== 'avslagen' ? btn(NO + ' Avslå (Klar)', "ARENDEN_ADMIN.act('avslagen')") : '') +
        (d.status !== 'ny' ? btn('↩️ Öppna igen', "ARENDEN_ADMIN.act('ny')") : '') + '</div>' +
        '<div class="ar-btns">' + btn('Sjuklön och intyg', "VERKSTAD_ADMIN.openApp('sjuk')") + '</div>' +
        '<div class="ar-note">Sjuklön och intyg hanteras i det befintliga sjukformuläret.</div>';
    } else if (k === 'wish') {
      h += '<div class="ar-note" style="margin-top:0">Önskemål till Christian. Status och svar sätts av Christian (via assistenten), inte här.</div>';
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
    A.mountCertificates(c, el);
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
