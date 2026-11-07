/* Inkorg – gemensam tidsordnad lista för privata samtal och egna ärenden.
 * Mina egna ärenden: felanmälan, behövs till bilen, verkstadstid, uppgift, sjukanmälan, önskemål.
 * Varje ärende är en tråd. Klockan (🔔) är kvar för notiser: när ägaren svarar på ett öppet ärende hamnar
 * svaret i tråden här och klockan får en kort notis som leder hit. Läser man svaret försvinner båda.
 * Servern: case_inbox, case_get, case_seen (supabase/migrations/20261106f_inkorg_arenden.sql).
 * Svar skickas med de vanliga funktionerna: car_issue_message (ärende), workshop_reply (verkstadstid).
 */
(function () {
  var A = window.ARENDE, esc = A.esc;
  A.ERR.bad_recipient = 'Välj en aktiv mottagare.'; A.ERR.bad_text = 'Skriv 1–2000 tecken.'; A.ERR.bad_subject = 'Skriv ett ämne med 1–120 tecken.';
  var I = window.INKORG = { id: 'inkorg', title: 'Inkorg' };
  var st = { data: null, err: false, filter: 'alla', showDone: false, open: null, cur: null, busy: false, el: null, klarLim: 300, side: 'all', mode: 'list', messages: [], next: null, recipients: null, to: '', subject: '', body: '', reply: '', msgErr: '', msg: null, dmUnread: 0, msgLoaded: false, generation: 0, viewRequest: 0 };

  function badge() {
    var d = st.data || {}, n = (ownerMailbox() ? [] : (d.items || [])).filter(function (x) { return x.needs || x.unread > 0; }).length + st.dmUnread;
    if (window.setBadge) {
      window.INKORG_HAS = n > 0;
      setBadge('inkorg', n);
      setBadge('cases', 0); // tidigare separata menyvalet är borttaget
      setBadge('profbtn', !!window.INKORG_NEEDS_PROFILE || n > 0);   // pricken på 👤 (profilpåminnelse eller Inkorg)
    }
  }
  I.refresh = function () {
    if (!localStorage.getItem('taxi_session')) return Promise.resolve();
    var generation = st.generation;
    return A.rpc('case_inbox', { p_klar_limit: st.klarLim }).then(function (d) { if (generation !== st.generation) return; st.data = d || { items: [] }; st.err = false; badge(); if (st.el && st.el.isConnected && !st.open && st.mode === 'list') paint(); })
      .catch(function (e) { if (generation !== st.generation) return; if (e && e.code === '28000') return; st.err = true; if (st.el && st.el.isConnected && !st.open && st.mode === 'list') paint(); });
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
    if (window.VERKSTAD && VERKSTAD.closeEdit && VERKSTAD.closeEdit()) return true;
    if (st.mode !== 'list') { st.mode = 'list'; st.msg = null; paint(); I.refresh(); I.loadMessages(); return true; }
    if (st.open) { st.open = null; st.cur = null; paint(); I.refresh(); return true; }
    return false;
  };
  // Öppna en tråd direkt (från klockan): byter till Inkorgen om den inte redan är öppen
  I.openCase = function (kind, id) {
    if (ownerMailbox()) { location.href = 'admin.html#arende=' + encodeURIComponent(kind + ':' + id); return; }
    st.mode = 'list'; st.open = { kind: kind, id: +id }; st.cur = null;
    if (typeof window.openInbox === 'function') window.openInbox();
    else if (st.el) paintCase();
  };
  // Finns ärendet i min Inkorg? (annars är det ett ärende för ägaren/admin)
  I.has = function (kind, id) { return !!((st.data && st.data.items) || []).filter(function (x) { return x.kind === kind && x.id === +id; }).length; };
  I.isAdmin = function () { return ['admin', 'agare', 'superadmin'].indexOf(String(window.INKORG_ROLE || '')) >= 0; };
  I.filter = function (f) { st.filter = f; paint(); };
  I.toggleDone = function () { st.showDone = !st.showDone; paint(); };
  // Klara sparas för alltid; de hämtas i omgångar så att listan går snabbt
  I.more = function () { st.klarLim += 300; I.refresh(); };
  I.tap = function (kind, id) {
    st.mode = 'list'; st.msg = null; st.open = { kind: kind, id: +id }; st.cur = null;
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
      '<span class="ar-m">' + (x.needs ? A.needsTag() : '') + (x.unread > 0 ? '<span style="color:#c53030;font-weight:700">● Nytt svar</span>' : '') + '<span>' + (x.last_from === 'agare' || x.kind === 'task' ? '↙ Till dig · ' : '↗ Från dig · ') + esc(A.ago(x.at)) + '</span></span>' +
      '</span>' + (x.unread > 0 ? '<span class="ar-dot" aria-label="Oläst"></span>' : '') + '</button>';
  }
  function ownerMailbox() { return ['agare', 'superadmin'].indexOf(String(window.INKORG_ROLE || '')) >= 0; }
  var CATEGORIES = [['alla','Alla'],['messages','Meddelanden'],['fault','Felanmälan'],['supply','Förbrukning'],['maint','Underhåll'],['sjuk','Sjukanmälan'],['wish','Önskemål'],['wh','Verkstadstid'],['task','Uppgifter']];
  function categories() { return CATEGORIES.filter(function(t) { return !ownerMailbox() || t[0] === 'alla' || t[0] === 'messages'; }); }
  function caseCategory(x) { return x.category || x.kind; }
  function messageRow(c) {
    return '<button type="button" class="ar-row" onclick="INKORG.readConversation('+c.id+')"><span class="ar-ico" aria-label="'+(c.incoming?'Senast inkommande':'Senast utgående')+'">'+(c.incoming?'↙':'↗')+'</span><span class="ar-main"><span class="ar-t"><b>'+esc(c.subject)+'</b>'+(c.unread?'<span class="ar-dot" aria-label="Oläst"></span>':'')+'</span><span class="ar-s">'+esc(c.name)+' · '+esc(c.last_body)+'</span><span class="ar-m">Meddelande · '+esc(A.ago(c.at))+(c.unread?' · '+c.unread+' oläst':'')+'</span></span></button>';
  }
  function paint() {
    var el = st.el; if (!el || !el.isConnected) return;
    var d = st.data || {}, cases = ownerMailbox() ? [] : (d.items || []);
    var h = nav() + '<button type="button" class="msg-primary" onclick="INKORG.newCase()">＋ Nytt ärende</button>';
    h += '<p class="ar-note">↙ Inkommande · ↗ Utgående. Nytt meddelande startar du från personens profil.</p>';
    if (ownerMailbox()) h += '<p class="ar-note">Dina ärenden finns i <a href="admin.html#arenden">Admin › Ärenden</a>, inte i inkorgen.</p>';
    if (st.err) h += '<p role="alert" class="msg-error">Kunde inte hämta ärendena.</p><button type="button" class="ar-more" onclick="INKORG.refresh()">Försök igen med ärenden</button>';
    if (st.msgErr) h += '<p role="alert" class="msg-error">'+esc(st.msgErr)+'</p><button type="button" class="ar-more" onclick="INKORG.loadMessages()">Försök igen med meddelanden</button>';
    var items = cases.filter(function(x) { return st.filter === 'alla' || st.filter === 'cases' || caseCategory(x) === st.filter; }).map(function(x) { return { at:x.at, key:x.kind+':'+x.id, html:row(x) }; });
    if (st.filter === 'alla' || st.filter === 'messages') items = items.concat(st.messages.map(function(c) { return { at:c.at, key:'message:'+c.id, html:messageRow(c) }; }));
    items.sort(function(a,b) { return (Date.parse(b.at)||0)-(Date.parse(a.at)||0) || a.key.localeCompare(b.key); });
    h += '<div class="ar-list">'+(items.length ? items.map(function(x) { return x.html; }).join('') : '<p class="ar-empty">'+((!st.data && !st.err) || !st.msgLoaded ? 'Laddar…' : 'Inget här just nu.')+'</p>')+'</div>';
    if (st.next && (st.filter === 'alla' || st.filter === 'messages')) h += '<button type="button" class="ar-more" onclick="INKORG.loadMessages(true)">Visa fler meddelanden</button>';
    if (!ownerMailbox() && st.filter !== 'messages' && (d.klar_total||0) > cases.filter(function(x) { return x.st === 'klar'; }).length) h += '<button type="button" class="ar-more" onclick="INKORG.more()">Hämta fler avslutade ärenden</button>';
    el.innerHTML = h;
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
    } else if (c.kind === 'maint') {
      h += '<div class="ar-note">Underhåll hanteras av admin. Du kan följa ditt förslag här.</div>';
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
    var generation=st.generation;st.busy = true; if (b) { b.disabled = true; b.textContent = 'Skickar…'; }
    var p = c.kind === 'issue' ? A.rpc('car_issue_message', { p_id: c.id, p_body: v }) : A.rpc('workshop_reply', { p_id: c.id, p_body: v });
    p.then(function () { if(generation!==st.generation)return;st.busy = false;if(st.cur!==c){I.refresh();return;}st.cur = null; paintCase(); if (window.showToast) showToast('Skickat till ägaren.'); })
      .catch(function (e) { if(generation!==st.generation)return;st.busy = false; if(st.cur!==c)return;if (b) { b.disabled = false; b.textContent = 'Skicka'; } alert(A.errText(e)); });
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
    return '<div class="msg-tabs" role="group" aria-label="Filtrera inkorgen">'+categories().map(function(t){
      return '<button type="button" aria-pressed="'+(st.filter===t[0])+'" class="'+(st.filter===t[0]?'on':'')+'" onclick="INKORG.select(\''+t[0]+'\')">'+t[1]+'</button>';
    }).join('')+'</div>';
  }
  I.select=function(filter){st.filter=filter;st.mode='list';st.open=null;st.cur=null;st.msg=null;paint();};
  // Old links (messages/cases) still work; the profile menu opens Alla.
  I.show=function(filter){st.filter=filter||'alla';st.mode='list';st.open=null;st.cur=null;st.msg=null;if(window.openInbox)window.openInbox();};
  I.loadMessages=function(more){
    if (!localStorage.getItem('taxi_session')) return Promise.resolve();
    var generation=st.generation, args={};if(more&&st.next)args.p_before=st.next;
    return A.rpc('conversation_list',args).then(function(d){
      if(generation!==st.generation)return;
      var incoming=d.items||[], previous=st.messages;
      // Refresh the newest page without dropping already loaded older pages.
      st.messages=(more?previous.concat(incoming):incoming.concat(previous.filter(function(c){return !incoming.some(function(n){return n.id===c.id;});})));
      st.messages=st.messages.filter(function(c,i,all){return all.findIndex(function(n){return n.id===c.id;})===i;});
      if(more||!st.msgLoaded||previous.length<=50)st.next=d.next;
      st.dmUnread=d.unread||0;st.msgErr='';st.msgLoaded=true;badge();
      if(st.el&&st.el.isConnected&&st.mode==='list'&&!st.open)paint();
    }).catch(function(e){if(generation!==st.generation)return;st.msgErr=A.errText(e);st.msgLoaded=true;if(st.el&&st.el.isConnected&&st.mode==='list'&&!st.open)paint();});
  };
  function backButton(){return '<button type="button" class="ar-back" onclick="INKORG.back()">‹ Inkorg</button>';}
  I.compose=function(id){
    try{history.pushState({view:'inkorg',sub:'compose'},'');}catch(e){}
    st.mode='compose';st.side='messages';st.open=null;st.cur=null;st.to=id||'';st.subject='';st.body='';st.msgErr='';
    if(window.openInbox)window.openInbox();else paintCompose();
    if(st.el&&st.el.isConnected)paintCompose();
    var generation=st.generation;
    A.rpc('message_recipients',{}).then(function(r){if(generation!==st.generation)return;st.recipients=r||[];if(st.mode==='compose')paintCompose();})
      .catch(function(e){if(generation!==st.generation)return;st.msgErr=A.errText(e);if(st.mode==='compose')paintCompose();});
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
    var generation=st.generation;st.busy=true;st.msgErr='';paintCompose();
    A.rpc('conversation_create',{p_to:st.to,p_subject:st.subject.trim(),p_body:st.body.trim()}).then(function(id){if(generation!==st.generation)return;st.busy=false;st.body='';I.readConversation(id);if(window.showToastOk)showToastOk('Meddelandet är skickat.');else if(window.showToast)showToast('Meddelandet är skickat.');})
      .catch(function(e){if(generation!==st.generation)return;st.busy=false;st.msgErr=A.errText(e);if(st.mode==='compose')paintCompose();else if(st.mode==='list'&&!st.open)paint();});
  };
  I.readConversation=function(id){
    if(st.mode!=='message'||!st.msg||st.msg.id!==id){try{history.pushState({view:'inkorg',sub:'conversation'},'');}catch(e){}}
    st.open=null;st.cur=null;st.mode='loading-message';var generation=st.generation,request=++st.viewRequest;
    if(st.el&&st.el.isConnected)st.el.innerHTML=backButton()+'<p class="ar-empty">Laddar…</p>';
    return A.rpc('conversation_get',{p_id:id}).then(function(c){if(generation!==st.generation||request!==st.viewRequest||st.mode!=='loading-message')return;st.msg=c;st.reply='';st.mode='message';paintMessage();I.loadMessages();})
      .catch(function(e){if(generation!==st.generation||request!==st.viewRequest||st.mode!=='loading-message')return;st.msgErr=A.errText(e);st.mode='list';paint();});
  };
  function paintMessage(){
    if(!st.el||!st.el.isConnected||!st.msg)return;var c=st.msg;
    st.el.innerHTML=backButton()+'<div class="msg-form"><h3>'+esc(c.subject)+'</h3><p class="ar-note">'+esc(c.name)+' · Privat samtal</p><div class="msg-thread">'+(c.messages||[]).map(function(m){return '<div class="msg-bubble '+(m.mine?'mine':'')+'"><small>'+(m.mine?'Du':esc(c.name))+' · '+esc(A.when(m.at))+'</small><p class="msg-body">'+esc(m.body)+'</p>'+(m.mine?'<small>'+(m.read_at?'Läst':'Skickat')+'</small>':'')+'</div>';}).join('')+'</div>'+
      '<form id="msg-reply-form"><label for="msg-reply-body">Svara</label><textarea id="msg-reply-body" required maxlength="2000" rows="3" placeholder="Skriv ditt svar…">'+esc(st.reply)+'</textarea><p role="alert" class="msg-error">'+esc(st.msgErr)+'</p><button type="submit" class="pri"'+(st.busy?' disabled':'')+'>'+(st.busy?'Skickar…':'Skicka svar')+'</button></form></div>';
    st.el.querySelector('#msg-reply-body').oninput=function(e){st.reply=e.target.value;};
    st.el.querySelector('#msg-reply-form').onsubmit=function(e){e.preventDefault();I.reply();};
  }
  I.reply=function(){
    if(st.busy||!st.msg||!st.reply.trim())return;var id=st.msg.id,generation=st.generation;
    st.busy=true;st.msgErr='';paintMessage();A.rpc('conversation_reply',{p_id:id,p_body:st.reply.trim()}).then(function(){if(generation!==st.generation)return;st.busy=false;if(st.mode==='message'&&st.msg&&st.msg.id===id)I.readConversation(id);else I.loadMessages();})
      .catch(function(e){if(generation!==st.generation)return;st.busy=false;st.msgErr=A.errText(e);if(st.mode==='message'&&st.msg&&st.msg.id===id)paintMessage();else if(st.mode==='list'&&!st.open)paint();});
  };
  I.newCase=function(){try{history.pushState({view:'inkorg',sub:'newcase'},'');}catch(e){}st.mode='newcase';st.open=null;st.cur=null;paintNewCase();};
  function paintNewCase(){
    if(!st.el || !st.el.isConnected)return;
    paint();
    var dlg=document.createElement('dialog');dlg.className='msg-picker';dlg.setAttribute('aria-labelledby','msg-picker-title');
    dlg.innerHTML='<h3 id="msg-picker-title">Nytt ärende</h3><p class="ar-note">Vad gäller det? Välj typ så öppnas rätt formulär.</p><div class="msg-choices">'+
      [['fel','Felanmälan'],['behov','Förbrukning till bilen'],['underhall','Underhåll'],['timmar','Verkstadstid'],['sjuk','Sjukanmälan'],['wish','Önskemål till Christian']].filter(function(t){return (t[0]!=='sjuk'||(window.SJUK && SJUK.enabled())) && (t[0]!=='wish'||I.isAdmin());}).map(function(t){return '<button type="button" onclick="INKORG.report(\''+t[0]+'\')">'+t[1]+' ›</button>';}).join('')+'</div><p class="ar-note">Uppgifter från admin visas också i inkorgen.</p><button type="button" class="ar-back" onclick="INKORG.back()">Avbryt</button>';
    st.el.appendChild(dlg);dlg.addEventListener('cancel',function(e){e.preventDefault();I.back();});dlg.showModal();
  }
  I.report=function(tab){
    if(tab==='wish'){location.href='admin.html#onskemal';return;}
    if(!window.VERKSTAD)return;
    st.mode='report'; st.el.innerHTML=backButton()+'<div id="msg-report"></div>';
    var target=st.el.querySelector('#msg-report');
    if(tab==='sjuk' && window.SJUK){Promise.resolve(SJUK.render(target)).then(function(){if(target.isConnected&&st.mode==='report'&&SJUK.newReport)SJUK.newReport();});return;}
    localStorage.setItem('bil_tab',tab);
    Promise.resolve(VERKSTAD.render(target)).then(function(){if(target.isConnected && st.mode==='report') VERKSTAD.newReport(tab);});
  };
  (function(){var s=document.createElement('style');s.textContent=
    '.msg-picker{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:calc(100% - 24px);max-width:440px;max-height:90dvh;overflow:auto;border:1px solid var(--border,#cbd5e0);border-radius:14px;padding:18px;background:var(--surface,#fff);color:var(--text,#234)}.msg-picker::backdrop{background:#0007}.msg-picker h3{margin-top:0}.msg-picker button{font:inherit;min-height:44px;border:1px solid var(--border,#cbd5e0);border-radius:8px;padding:10px;background:var(--surface,#fff);color:inherit}.msg-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.msg-tabs button{flex:0 1 auto;padding:8px 12px;min-height:44px;border:1px solid var(--border,#cbd5e0);border-radius:10px;font:inherit;background:var(--surface,#fff);color:var(--text,#234)}.msg-tabs .on{background:var(--primary,#245a69);color:#fff}.msg-actions{display:flex;gap:8px}.msg-actions button{flex:1;min-height:48px;padding:8px;border-radius:10px;border:1px solid var(--border,#cbd5e0);font:inherit;background:var(--surface,#fff);color:var(--text,#234)}#msg-root .pri{background:var(--primary,#245a69);color:#fff}.msg-form{padding:16px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fff)}.msg-form h3{margin:0 0 12px}.msg-form label{display:block;margin:14px 0 6px;font-size:.88em}.msg-form input,.msg-form select,.msg-form textarea{width:100%;box-sizing:border-box;min-height:44px;padding:10px;border-radius:8px;border:1px solid var(--border,#cbd5e0);font:inherit;background:var(--surface,#fff);color:inherit}.msg-form button{min-height:44px;padding:10px;border-radius:8px;border:1px solid var(--border,#cbd5e0);font:inherit}.msg-choices{display:grid;gap:10px}.msg-choices button{text-align:left}.msg-error{color:#b91c1c}.msg-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}.msg-primary{width:100%;min-height:48px;padding:10px;margin:0 0 12px;border:0;border-radius:10px;background:var(--primary,#245a69);color:#fff;font:inherit}.msg-thread{display:grid;gap:10px}.msg-bubble{background:var(--bg,#eef4f7);border-radius:10px;padding:10px;margin-right:18px}.msg-bubble.mine{background:var(--c-bee3f8,#dcecf8);margin-right:0;margin-left:18px}.msg-bubble small{color:var(--text-soft,#526579);font-size:.75em}.msg-bubble .msg-body{margin:6px 0}.msg-tabs button:focus-visible,.msg-actions button:focus-visible{outline:3px solid #d69e2e}';document.head.appendChild(s);})();
  I.logout = function () { st.generation++; st.busy = false; st.subject = ''; st.reply = ''; st.klarLim = 300; st.filter = 'alla'; st.next = null; st.msgLoaded = false; st.msgErr = ''; st.err = false; st.messages = []; st.recipients = null; st.msg = null; st.to = ''; st.body = ''; st.mode = 'list'; st.dmUnread = 0; st.el = null; st.data = null; st.open = null; st.cur = null; if (I._t) { clearInterval(I._t); I._t = null; } };
})();
