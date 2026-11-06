/* Meddelanden och Ärenden – två ingångar under profilikonen, gemensam sidväxlare.
 * Mina egna ärenden: felanmälan, behövs till bilen, verkstadstid, uppgift, sjukanmälan, önskemål.
 * Varje ärende är en tråd. Klockan (🔔) är kvar för notiser: när ägaren svarar på ett öppet ärende hamnar
 * svaret i tråden här och klockan får en kort notis som leder hit. Läser man svaret försvinner båda.
 * Servern: case_inbox, case_get, case_seen (supabase/migrations/20261106f_inkorg_arenden.sql).
 * Svar skickas med de vanliga funktionerna: car_issue_message (ärende), workshop_reply (verkstadstid).
 */
(function () {
  var A = window.ARENDE, esc = A.esc;
  A.ERR.bad_recipient = 'Välj en aktiv mottagare.'; A.ERR.bad_text = 'Skriv 1–2000 tecken.'; A.ERR.bad_subject = 'Skriv ett ämne med 1–120 tecken.';
  var I = window.INKORG = { id: 'inkorg', title: 'Meddelanden / Ärenden' };
  var st = { data: null, err: false, filter: 'alla', showDone: false, open: null, cur: null, busy: false, el: null, klarLim: 300, side: 'messages', mode: 'list', messages: [], next: null, recipients: null, to: '', subject: '', body: '', reply: '', msgErr: '', msg: null, dmUnread: 0 };

  function badge() {
    var d = st.data || {}, n = (d.items || []).filter(function (x) { return x.needs || x.unread > 0; }).length + st.dmUnread;
    if (window.setBadge) {
      window.INKORG_HAS = n > 0;
      setBadge('inkorg', st.dmUnread);
      setBadge('cases', n - st.dmUnread);
      setBadge('profbtn', !!window.INKORG_NEEDS_PROFILE || n > 0);   // pricken på 👤 (profilpåminnelse eller Inkorg)
    }
  }
  I.refresh = function () {
    if (!localStorage.getItem('taxi_session')) return Promise.resolve();
    return A.rpc('case_inbox', { p_klar_limit: st.klarLim }).then(function (d) { st.data = d || { items: [] }; st.err = false; badge(); if (st.el && st.el.isConnected && !st.open && st.mode === 'list') paint(); })
      .catch(function (e) { if (e && e.code === '28000') return; st.err = true; if (st.el && st.el.isConnected && !st.open && st.mode === 'list') paint(); });
  };
  I.start = function () { I.refresh(); I.loadMessages(); if (!I._t) I._t = setInterval(function () { if (!document.hidden) { I.refresh(); I.loadMessages(); } }, 120000); };

  I.render = function (el) {
    el.innerHTML = '<div id="msg-root"></div>'; st.el = el.querySelector('#msg-root');
    if (st.mode === 'compose') { paintCompose(); return; }
    if (st.mode === 'newcase') { paintNewCase(); return; }
    if (st.mode === 'report') { st.mode='newcase'; paintNewCase(); return; }
    if (st.mode === 'message' && st.msg) { paintMessage(); return; }
    if (st.open) return paintCase();
    paint();
    I.refresh(); I.loadMessages();
  };
  I.back = function () {
    if (st.mode !== 'list') { st.mode = 'list'; st.msg = null; paint(); I.loadMessages(); return true; }
    if (st.open) { st.open = null; st.cur = null; paint(); I.refresh(); return true; }
    return false;
  };
  // Öppna en tråd direkt (från klockan): byter till Inkorgen om den inte redan är öppen
  I.openCase = function (kind, id) {
    st.mode = 'list'; st.side = 'cases'; st.open = { kind: kind, id: +id }; st.cur = null;
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
    var el = st.el; if (!el || !el.isConnected) return;
    if (st.side !== 'cases') { paintMailbox(); return; }
    var d = st.data, h = nav() + '<button type="button" class="msg-primary" onclick="INKORG.newCase()">＋ Nytt ärende</button>';
    if (!d) { el.innerHTML = h + '<div class="ar-empty">' + (st.err ? 'Kunde inte hämta ärendena. Kontrollera nätet.' : 'Laddar…') + '</div>'; return; }
    var items=d.items||[], ongoing=items.filter(function(x){return x.st!=='klar';}), done=items.filter(function(x){return x.st==='klar';});
    h+='<div class="ar-h">Pågående ('+ongoing.length+')</div><div class="ar-list">'+(ongoing.length?ongoing.map(row).join(''):'<p class="ar-empty">Inga pågående ärenden. 👍</p>')+'</div>';
    var tot=Math.max(d.klar_total||0,done.length);
    h+='<button type="button" class="ar-more" onclick="INKORG.toggleDone()">'+(st.showDone?'Dölj avslutade':'Avslutade ('+tot+')')+'</button>';
    if(st.showDone){h+='<div class="ar-list">'+(done.length?done.map(row).join(''):'<p class="ar-empty">Inga avslutade ärenden.</p>')+'</div>';if(tot>done.length)h+='<button type="button" class="ar-more" onclick="INKORG.more()">Visa fler avslutade</button>';}
    el.innerHTML=h;
  }

  function paintCase() {
    var el = st.el; if (!el) return;
    var o = st.open, c = st.cur;
    var back = '<button type="button" class="ar-back" onclick="INKORG.back()">‹ Ärenden</button>';
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
    A.mountCertificates(c, el);
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
  // En tråd har ett ämne och exakt två deltagare. Servern kontrollerar båda vid varje anrop.
  function nav() {
    return '<div class="msg-tabs" role="group" aria-label="Meddelanden eller ärenden">'+[['messages','Meddelanden'],['cases','Ärenden']].map(function(t){
      return '<button type="button" aria-pressed="'+(st.side===t[0])+'" class="'+(st.side===t[0]?'on':'')+'" onclick="INKORG.select(\''+t[0]+'\')">'+t[1]+(t[0]==='messages'&&st.dmUnread?' ('+st.dmUnread+')':t[0]==='cases'&&((st.data||{}).items||[]).some(function(x){return x.needs||x.unread>0;})?' ●':'')+'</button>';
    }).join('')+'</div>';
  }
  I.select=function(side){st.side=side;st.mode='list';st.open=null;st.cur=null;st.msg=null;paint();if(side==='cases')I.refresh();else I.loadMessages();};
  I.show=function(side){st.side=side;st.mode='list';st.open=null;st.cur=null;st.msg=null;if(window.openInbox)window.openInbox();};
  I.loadMessages=function(more){
    var args={};if(more&&st.next)args.p_before=st.next;
    return A.rpc('conversation_list',args).then(function(d){
      st.messages=more?st.messages.concat(d.items||[]):(d.items||[]);st.next=d.next;st.dmUnread=d.unread||0;st.msgErr='';badge();
      if(st.el&&st.el.isConnected&&st.mode==='list'&&!st.open&&st.side==='messages')paint();
    }).catch(function(e){st.msgErr=A.errText(e);if(st.el&&st.el.isConnected&&st.mode==='list'&&st.side==='messages')paint();});
  };
  function paintMailbox(){
    var h=nav()+'<button type="button" class="msg-primary" onclick="INKORG.compose()">＋ Nytt meddelande</button>';
    h+='<p class="ar-note">Privata samtal. ↙ Inkommande · ↗ Utgående</p>';
    if(st.msgErr)h+='<p role="alert" class="msg-error">'+esc(st.msgErr)+'</p><button type="button" onclick="INKORG.loadMessages()">Försök igen</button>';
    h+='<div class="ar-list">'+(st.messages.length?st.messages.map(function(c){
      return '<button type="button" class="ar-row" onclick="INKORG.readConversation('+c.id+')"><span class="ar-ico" aria-label="'+(c.incoming?'Senast inkommande':'Senast utgående')+'">'+(c.incoming?'↙':'↗')+'</span><span class="ar-main"><span class="ar-t"><b>'+esc(c.subject)+'</b>'+(c.unread?'<span class="ar-dot" aria-label="Oläst"></span>':'')+'</span><span class="ar-s">'+esc(c.name)+' · '+esc(c.last_body)+'</span><span class="ar-m">'+esc(A.ago(c.at))+(c.unread?' · '+c.unread+' oläst':'')+'</span></span></button>';
    }).join(''):'<p class="ar-empty">Inga samtal än. Skapa ett nytt meddelande.</p>')+'</div>';
    if(st.next)h+='<button type="button" class="ar-more" onclick="INKORG.loadMessages(true)">Visa fler samtal</button>';
    st.el.innerHTML=h;
  }
  function backButton(){return '<button type="button" class="ar-back" onclick="INKORG.back()">‹ '+(st.side==='cases'?'Ärenden':'Meddelanden')+'</button>';}
  I.compose=function(id){
    try{history.pushState({view:'inkorg',sub:'compose'},'');}catch(e){}
    st.mode='compose';st.side='messages';st.open=null;st.cur=null;st.to=id||'';st.subject='';st.body='';st.msgErr='';
    if(window.openInbox)window.openInbox();else paintCompose();
    if(st.el&&st.el.isConnected)paintCompose();
    A.rpc('message_recipients',{}).then(function(r){st.recipients=r||[];if(st.mode==='compose')paintCompose();})
      .catch(function(e){st.msgErr=A.errText(e);if(st.mode==='compose')paintCompose();});
  };
  function recipientOptions(q){return '<option value="">Välj mottagare…</option>'+(st.recipients||[]).filter(function(r){return !q||String(r.id)===String(st.to)||r.name.toLocaleLowerCase('sv').includes(q);}).map(function(r){return '<option value="'+esc(r.id)+'"'+(String(r.id)===String(st.to)?' selected':'')+'>'+esc(r.name)+(r.admin?' · Admin':'')+'</option>';}).join('');}
  function paintCompose(){
    if(!st.el||!st.el.isConnected)return;
    st.el.innerHTML=backButton()+'<form id="msg-compose" class="msg-form"><h3>Nytt meddelande</h3><p class="ar-note">Ett privat samtal mellan dig och mottagaren.</p>'+
      '<label for="msg-search">Sök förare eller admin</label><input id="msg-search" type="search" placeholder="Förnamn…" autocomplete="off">'+
      '<label for="msg-to">Till</label><select id="msg-to" required>'+recipientOptions('')+'</select>'+
      '<label for="msg-subject">Ämne</label><input id="msg-subject" required maxlength="120" value="'+esc(st.subject)+'" placeholder="Vad gäller det?">'+
      '<label for="msg-body">Meddelande</label><textarea id="msg-body" required maxlength="2000" rows="5" placeholder="Skriv här…">'+esc(st.body)+'</textarea>'+
      '<p id="msg-error" role="alert" class="msg-error">'+esc(st.msgErr)+'</p><button type="submit" class="pri"'+(st.busy?' disabled':'')+'>'+(st.busy?'Skickar…':'Skicka meddelande')+'</button></form>';
    var f=st.el.querySelector('form');
    f.querySelector('#msg-to').onchange=function(e){st.to=e.target.value;};
    f.querySelector('#msg-subject').oninput=function(e){st.subject=e.target.value;};
    f.querySelector('#msg-body').oninput=function(e){st.body=e.target.value;};
    f.querySelector('#msg-search').oninput=function(e){f.querySelector('#msg-to').innerHTML=recipientOptions(e.target.value.toLocaleLowerCase('sv'));};
    f.onsubmit=function(e){e.preventDefault();I.sendMessage();};
  }
  I.sendMessage=function(){
    if(st.busy||!st.to||!st.subject.trim()||!st.body.trim())return;
    st.busy=true;st.msgErr='';paintCompose();
    A.rpc('conversation_create',{p_to:st.to,p_subject:st.subject.trim(),p_body:st.body.trim()}).then(function(id){st.busy=false;st.body='';I.readConversation(id);if(window.showToastOk)showToastOk('Meddelandet är skickat.');else if(window.showToast)showToast('Meddelandet är skickat.');})
      .catch(function(e){st.busy=false;st.msgErr=A.errText(e);paintCompose();});
  };
  I.readConversation=function(id){
    if(st.mode!=='message'||!st.msg||st.msg.id!==id){try{history.pushState({view:'inkorg',sub:'conversation'},'');}catch(e){}}
    return A.rpc('conversation_get',{p_id:id}).then(function(c){st.msg=c;st.reply='';st.mode='message';paintMessage();I.loadMessages();})
      .catch(function(e){st.msgErr=A.errText(e);st.mode='list';paint();});
  };
  function paintMessage(){
    if(!st.el||!st.el.isConnected||!st.msg)return;var c=st.msg;
    st.el.innerHTML=backButton()+'<div class="msg-form"><h3>'+esc(c.subject)+'</h3><p class="ar-note">'+esc(c.name)+' · Privat samtal</p><div class="msg-thread">'+(c.messages||[]).map(function(m){return '<div class="msg-bubble '+(m.mine?'mine':'')+'"><small>'+(m.mine?'Du':esc(c.name))+' · '+esc(A.ago(m.at))+'</small><p class="msg-body">'+esc(m.body)+'</p>'+(m.mine?'<small>'+(m.read_at?'Läst':'Skickat')+'</small>':'')+'</div>';}).join('')+'</div>'+
      '<form id="msg-reply-form"><label for="msg-reply-body">Svara</label><textarea id="msg-reply-body" required maxlength="2000" rows="3" placeholder="Skriv ditt svar…">'+esc(st.reply)+'</textarea><p role="alert" class="msg-error">'+esc(st.msgErr)+'</p><button type="submit" class="pri"'+(st.busy?' disabled':'')+'>'+(st.busy?'Skickar…':'Skicka svar')+'</button></form></div>';
    st.el.querySelector('#msg-reply-body').oninput=function(e){st.reply=e.target.value;};
    st.el.querySelector('#msg-reply-form').onsubmit=function(e){e.preventDefault();I.reply();};
  }
  I.reply=function(){
    if(st.busy||!st.msg||!st.reply.trim())return;var id=st.msg.id;
    st.busy=true;st.msgErr='';paintMessage();A.rpc('conversation_reply',{p_id:id,p_body:st.reply.trim()}).then(function(){st.busy=false;I.readConversation(id);})
      .catch(function(e){st.busy=false;st.msgErr=A.errText(e);paintMessage();});
  };
  I.newCase=function(){try{history.pushState({view:'inkorg',sub:'newcase'},'');}catch(e){}st.mode='newcase';st.side='cases';st.open=null;st.cur=null;paintNewCase();};
  function paintNewCase(){
    if(!st.el || !st.el.isConnected)return;
    st.el.innerHTML=backButton()+'<div class="msg-form"><h3>Nytt ärende</h3><p class="ar-note">Vad vill du rapportera? Samma formulär som tidigare.</p><div class="msg-choices">'+
      [['fel','⚠️ Fel på bilen'],['behov','🧴 Behövs till bilen'],['timmar','⏱️ Verkstadstid'],['sjuk','🤒 Sjukanmälan']].filter(function(t){return t[0]!=='sjuk'||(window.SJUK && SJUK.enabled());}).map(function(t){return '<button type="button" onclick="INKORG.report(\''+t[0]+'\')">'+t[1]+' ›</button>';}).join('')+'</div></div>';
  }
  I.report=function(tab){
    if(!window.VERKSTAD)return;
    st.mode='report'; st.el.innerHTML=backButton()+'<div id="msg-report"></div>';
    localStorage.setItem('bil_tab',tab); var target=st.el.querySelector('#msg-report');
    Promise.resolve(VERKSTAD.render(target)).then(function(){if(target.isConnected && st.mode==='report') VERKSTAD.newReport(tab);});
  };
  (function(){var s=document.createElement('style');s.textContent=
    '.msg-tabs{display:flex;gap:4px;margin:12px 0}.msg-tabs button{flex:1;min-height:44px;border:1px solid var(--border,#cbd5e0);border-radius:10px;font:inherit;background:var(--surface,#fff);color:var(--text,#234)}.msg-tabs .on{background:var(--primary,#245a69);color:#fff}.msg-actions{display:flex;gap:8px}.msg-actions button{flex:1;min-height:48px;padding:8px;border-radius:10px;border:1px solid var(--border,#cbd5e0);font:inherit;background:var(--surface,#fff);color:var(--text,#234)}#msg-root .pri{background:var(--primary,#245a69);color:#fff}.msg-form{padding:16px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fff)}.msg-form h3{margin:0 0 12px}.msg-form label{display:block;margin:14px 0 6px;font-size:.88em}.msg-form input,.msg-form select,.msg-form textarea{width:100%;box-sizing:border-box;min-height:44px;padding:10px;border-radius:8px;border:1px solid var(--border,#cbd5e0);font:inherit;background:var(--surface,#fff);color:inherit}.msg-form button{min-height:44px;padding:10px;border-radius:8px;border:1px solid var(--border,#cbd5e0);font:inherit}.msg-choices{display:grid;gap:10px}.msg-choices button{text-align:left}.msg-error{color:#b91c1c}.msg-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}.msg-primary{width:100%;min-height:48px;padding:10px;margin:0 0 12px;border:0;border-radius:10px;background:var(--primary,#245a69);color:#fff;font:inherit}.msg-thread{display:grid;gap:10px}.msg-bubble{background:var(--bg,#eef4f7);border-radius:10px;padding:10px;margin-right:18px}.msg-bubble.mine{background:var(--c-bee3f8,#dcecf8);margin-right:0;margin-left:18px}.msg-bubble small{color:var(--text-soft,#526579);font-size:.75em}.msg-bubble .msg-body{margin:6px 0}.msg-tabs button:focus-visible,.msg-actions button:focus-visible{outline:3px solid #d69e2e}';document.head.appendChild(s);})();
  I.logout = function () { st.messages = []; st.recipients = null; st.msg = null; st.to = ''; st.body = ''; st.mode = 'list'; st.dmUnread = 0; st.el = null; st.data = null; st.open = null; st.cur = null; if (I._t) { clearInterval(I._t); I._t = null; } };
})();
