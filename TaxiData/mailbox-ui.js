/* Gemensamma ärendetrådar: förare ↔ åkeriets admin. Ingen privat förare-till-förare-sändning.
 * Servern kontrollerar varje listning, svar, bokning och bekräftelse. */
(function(){
 'use strict';
 var A=window.ARENDE,esc=A.esc;
 var FILTERS=[['all','Alla','📥'],['message','Meddelande','💬'],['sick','Sjuk','🤒'],['hours','Verkstadstimmar','⏱️']];
 var STATUS={pending_driver:'Väntar på förarens svar',pending_admin:'Väntar på admins svar',accepted:'Godkänd',declined:'Avböjd'};
 function when(at){var p={};new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).forEach(function(x){p[x.type]=x.value;});return p.year+'-'+p.month+'-'+p.day+' '+p.hour+':'+p.minute;}
 function err(e){return {bad_car_number:'Bilnummer ska vara 1–3 siffror.',bad_date:'Välj ett giltigt datum och klockslag framåt i tiden (svensk tid).',need_reason:'Vänligen specificera orsak',need_car_number:'Ange bilnummer (1–3 siffror) eller välj Ej angivet.',bad_visibility:'Välj vem som får se telefonnumret.',bad_subject:'Fyll i rubrik/typ (högst 120 tecken).',bad_text:'Skriv ett meddelande (högst 2000 tecken).',forbidden:'Du har inte behörighet till detta.',not_found:'Det här ärendet finns inte här.',demo_read_only:'Du kan bara läsa i demoläget.',too_many:'För många försök. Försök senare.'}[e&&e.message]||A.errText(e);}
 window.MAILBOX={rpc:function(action,data){
  // Demo får aldrig läsa verkliga kontakter/trådar via den nya serverfunktionen.
  if(window.DEMO&&DEMO.on()){
   if(action==='contacts_get')return Promise.resolve({cars:[],phone:null,visibility:'owner',company_label:'Taxi Göteborg'});
   if(['list','timeline','recipients'].indexOf(action)>=0)return Promise.resolve([]);
   return Promise.reject(new Error('demo_read_only'));
  }
  return A.rpc('mailbox_v2',{p_action:action,p_data:data||{}});},create:function(admin,name){
  var U={},st={el:null,mode:'list',filter:'all',threads:[],cases:[],old:[],next:null,thread:null,legacy:null,recipients:[],draft:{},busy:false,error:'',epoch:0,request:0,loaded:false};
  function rpc(action,data){return MAILBOX.rpc(action,Object.assign({},data,{admin:admin}));}
  function push(){try{history.pushState({view:admin?'admin':'inkorg',sub:'thread'},'');}catch(e){}}
  function go(mode){st.mode=mode;st.error='';push();paint();}
  function back(){return '<button class="ar-back" type="button" onclick="'+name+'.back()">‹ '+(admin?'Ärenden':'Inkorg')+'</button>';}
  function category(x){return x.kind==='sjuk'?'sick':x.kind==='wh'?'hours':'message';}
  function owner(){return !admin&&['agare','superadmin'].indexOf(window.INKORG_ROLE)>=0;}
  U.count=function(){return st.threads.filter(function(x){return x.unread;}).length+st.cases.filter(function(x){return x.needs||x.unread>0;}).length;};
  function badge(){if(!admin&&window.setBadge){setBadge('inkorg',U.count());setBadge('profbtn',U.count()>0||!!window.INKORG_NEEDS_PROFILE);}}
  U.refresh=function(){
   var epoch=st.epoch;
   return Promise.all([rpc('list',{}),A.rpc(admin?'case_admin_list':'case_inbox',{p_klar_limit:5000}),admin?Promise.resolve({items:[]}):A.rpc('conversation_list',{})]).then(function(d){
    if(epoch!==st.epoch)return 0;
    st.threads=d[0]||[];st.cases=(d[1].items||[]).filter(function(x){return x.kind!=='wish';});st.old=d[2].items||[];st.next=d[2].next;st.loaded=true;st.error='';badge();if(st.mode==='list')paint();return U.count();
   }).catch(function(e){if(epoch!==st.epoch)return 0;st.loaded=true;st.error=err(e);if(st.mode==='list')paint();return 0;});
  };
  U.moreOld=function(){if(!st.next||st.busy)return;var epoch=st.epoch;st.busy=true;A.rpc('conversation_list',{p_before:st.next}).then(function(d){if(epoch!==st.epoch)return;st.old=st.old.concat(d.items||[]);st.next=d.next;st.busy=false;if(st.mode==='list')paint();}).catch(function(e){if(epoch!==st.epoch)return;st.busy=false;st.error=err(e);if(st.mode==='list')paint();});};
  U.render=function(el){st.el=el;paint();if(st.mode==='list')U.refresh();};
  U.back=function(){if(st.mode!=='list'){st.request++;st.mode='list';st.thread=null;st.legacy=null;paint();U.refresh();return true;}return false;};
  U.select=function(f){st.request++;st.filter=f;st.mode='list';paint();};
  U.show=function(){st.mode='list';st.filter='all';if(!admin&&window.openInbox)openInbox();else paint();};
  U.newCase=function(){
   if(!st.el)return;var d=document.createElement('dialog');d.className='mx-picker';d.setAttribute('aria-label','Nytt ärende');
   d.innerHTML='<h3>Nytt ärende</h3>'+[['message','Meddelande'],['sick','Sjuk'],['hours','Verkstadstimmar']].map(function(x){return '<button type="button" onclick="'+name+'.choose(\''+x[0]+'\')">'+x[1]+'</button>';}).join('')+'<button type="button" onclick="this.closest(\'dialog\').close()">Avbryt</button>';
   st.el.appendChild(d);d.addEventListener('close',function(){d.remove();});d.showModal();
  };
  U.choose=function(type){var d=st.el&&st.el.querySelector('dialog');if(d)d.close();if(type==='message')U.compose();else U.report(type==='sick'?'sjuk':'timmar');};
  U.compose=function(){st.draft={};go('compose');recipients();};
  U.newBooking=function(){st.draft={thread_id:st.mode==='thread'&&st.thread?st.thread.id:null,car_number:st.mode==='thread'&&st.thread?st.thread.car_number||'':''};go('booking');if(!st.draft.thread_id)recipients();};
  function recipients(){if(!admin)return;var epoch=st.epoch;rpc('recipients',{}).then(function(d){if(epoch!==st.epoch)return;st.recipients=d||[];if(st.mode==='compose'||st.mode==='booking')paint();}).catch(function(e){if(epoch!==st.epoch)return;st.error=err(e);paint();});}
  U.openThread=function(id){
   if(owner()){location.href='admin.html#message='+encodeURIComponent(id);return Promise.resolve();}
   st.mode='loading';st.thread=null;var request=++st.request;push();if(!admin&&window.openInbox)openInbox();else paint();var epoch=st.epoch;
   return rpc('get',{thread_id:id}).then(function(d){if(epoch!==st.epoch||request!==st.request||st.mode!=='loading')return;st.thread=d;st.mode='thread';paint();U.refresh();}).catch(function(e){if(epoch!==st.epoch||request!==st.request)return;st.error=err(e);st.mode='list';paint();});
  };
  U.openCase=function(kind,id){
   if(kind==='wish'){if(admin&&window.openMenu)openMenu('onskemal');else if(U.isAdmin())location.href='admin.html#onskemal';return;}
   st.mode='loading';var request=++st.request;push();if(!admin&&window.openInbox)openInbox();else paint();
   var epoch=st.epoch;
   return A.rpc(kind==='old-message'?'conversation_get':'case_get',kind==='old-message'?{p_id:id}:{p_kind:kind,p_id:id}).then(function(c){if(epoch!==st.epoch||request!==st.request||st.mode!=='loading')return;st.legacy={kind:kind,data:c};st.mode='legacy';paint();if(kind!=='old-message')A.rpc('case_seen',{p_kind:kind,p_id:id}).catch(function(){});}).catch(function(e){if(epoch!==st.epoch||request!==st.request)return;st.error=err(e);st.mode='list';paint();});
  };
  U.tap=U.openCase;U.readConversation=function(id){return U.openCase('old-message',id);};
  function formField(label,id,type,required,max){var d=st.draft,v=d[id]||'';return '<label for="mx-'+id+'">'+label+'</label><input id="mx-'+id+'" data-mx="'+id+'" type="'+(type||'text')+'"'+(required?' required':'')+(max?' maxlength="'+max+'"':'')+' value="'+esc(v)+'">';}
  function carField(book){var absent=book&&st.draft.car_unspecified===true;return '<label for="mx-car_number">Bilnummer '+(book?'(obligatoriskt)':'(valfritt)')+'</label><input id="mx-car_number" data-mx="car_number" inputmode="numeric"'+(book?' aria-required="'+(!absent)+'"':' pattern="[0-9]{1,3}"')+' maxlength="3"'+(absent?' disabled':'')+' value="'+esc(st.draft.car_number||'')+'" placeholder="1–3 siffror">'+(book?'<label class="mx-check"><input type="checkbox" id="mx-car-unspecified" data-mx="car_unspecified"'+(absent?' checked':'')+'> Ej angivet</label><p id="mx-car-error" class="mx-error" role="alert"></p>':'');}

  function driverField(){if(!admin||st.draft.thread_id)return '';return '<label for="mx-driver_id">Chaufför på åkeriet</label><select id="mx-driver_id" data-mx="driver_id" required><option value="">Välj chaufför…</option>'+st.recipients.map(function(d){return '<option value="'+esc(d.id)+'"'+(String(d.id)===String(st.draft.driver_id)?' selected':'')+'>'+esc(d.name)+'</option>';}).join('')+'</select>';}
  function composeHtml(book){
   return back()+'<form class="mx-form" id="mx-form"><h3>'+(book?'Bokad tid':admin?'Meddelande till chaufför':'Meddelande till admin')+'</h3>'+driverField()+
    (book?formField('Typ (blir ärendets rubrik)','kind','text',true,120)+'<label for="mx-date">Datum (ÅÅÅÅ-MM-DD)</label><input id="mx-date" data-mx="date" type="text" inputmode="text" placeholder="ÅÅÅÅ-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxlength="10" required value="'+esc(st.draft.date||'')+'">'+formField('Tid (svensk tid)','time','time',true):formField('Rubrik','subject','text',true,120)+'<label for="mx-body">Meddelande</label><textarea id="mx-body" data-mx="body" required maxlength="2000" rows="5">'+esc(st.draft.body||'')+'</textarea>')+
    (book?'<label for="mx-body">Meddelande (valfritt)</label><textarea id="mx-body" data-mx="body" maxlength="2000" rows="4">'+esc(st.draft.body||'')+'</textarea>':'')+carField(book)+(!book&&!admin?'<p class="ar-note">Sjukanmälan och läkarintyg skickas under Sjuk, inte här.</p>':'')+(book?'<p class="ar-note">'+(admin?'Föraren måste godkänna tiden.':'Admin måste bekräfta ditt förslag.')+' Tiden visas grå i schemat tills den är godkänd.</p>':'')+
    '<p class="mx-error mx-server-error" role="alert">'+esc(st.error)+'</p><button type="submit"'+(st.busy?' disabled':'')+'>'+(st.busy?'Sparar…':book?'Föreslå tid':'Skicka')+'</button></form>';
  }
  function listHtml(){
   var h=admin?'<div class="mx-actions"><button onclick="'+name+'.compose()">Meddelande</button><button onclick="'+name+'.newBooking()">Bokad tid</button></div>':'<div class="mx-filters" role="group" aria-label="Inkorg">'+FILTERS.map(function(x){return '<button aria-label="'+x[1]+'" title="'+x[1]+'" aria-pressed="'+(st.filter===x[0])+'" onclick="'+name+'.select(\''+x[0]+'\')"><span aria-hidden="true">'+x[2]+'</span></button>';}).join('')+'</div><button class="mx-new" onclick="'+name+'.newCase()">＋ Nytt ärende</button>';
   if(owner())h+='<p class="ar-note">Alla dina ärenden hanteras i <a href="admin.html#arenden">Admin › Ärenden</a>.</p>';
   if(!admin)h+='<h2 class="mx-category-heading">'+esc((FILTERS.find(function(x){return x[0]===st.filter;})||FILTERS[0])[1])+'</h2>';
   var all=st.threads.map(function(t){return {at:t.at,title:t.subject,body:t.last_body||'',meta:t.name+(t.car_number?' · Bil '+t.car_number:''),unread:t.unread,open:name+'.openThread('+t.id+')',cat:'message'};});
   all=all.concat(st.cases.map(function(c){return {at:c.at,title:c.title,body:c.last_txt||c.txt||'',meta:(c.car?'Bil '+c.car+' · ':'')+(A.WORDS[c.st]||'')+(['sjuk','wh'].indexOf(c.kind)<0?' · Arkiv':''),unread:c.unread||c.needs,open:name+'.openCase(\''+c.kind+'\','+c.id+')',cat:category(c)};}));
   all=all.concat(st.old.map(function(c){return {at:c.at,title:c.subject,body:c.last_body,meta:'Äldre privat samtal · bara läsning',unread:c.unread,open:name+'.readConversation('+c.id+')',cat:'message'};}));
   all=all.filter(function(x){return admin||st.filter==='all'||st.filter===x.cat;}).sort(function(a,b){return Date.parse(b.at)-Date.parse(a.at);});
   h+='<p class="mx-error mx-server-error" role="alert">'+esc(st.error)+'</p><div class="ar-list">'+all.map(function(x){return '<button class="ar-row" onclick="'+x.open+'"><span class="ar-main"><span class="ar-t"><b>'+esc(x.title)+'</b>'+(x.unread?'<span class="ar-dot" aria-label="Oläst"></span>':'')+'</span><span class="ar-s">'+esc(x.body)+'</span><span class="ar-m">'+esc(x.meta)+' · '+esc(when(x.at))+'</span></span></button>';}).join('')+'</div>';
   if(!all.length)h+='<p class="ar-empty">'+(st.loaded?'Inget här just nu.':'Laddar…')+'</p>';
   if(st.next)h+='<button onclick="'+name+'.moreOld()">Visa fler äldre samtal</button>';
   return h;
  }
  function bookingHtml(b){var can=(admin&&b.status==='pending_admin')||((!admin||(st.thread&&st.thread.is_driver))&&b.status==='pending_driver');
   return '<section class="mx-booking '+(b.status==='accepted'?'solid':'pending')+'"><h4>'+esc(b.title)+'</h4><p>'+(b.kind&&b.kind!==b.title?esc(b.kind)+' · ':'')+esc(when(b.starts_at))+(b.car_number?' · Bil '+esc(b.car_number):' · Bil: Ej angivet')+'</p><p>'+esc(STATUS[b.status])+'</p><small>Föreslagen '+esc(when(b.created_at))+(b.decided_at?' · Beslut '+esc(when(b.decided_at)):'')+'</small>'+(b.reason?'<p>'+esc(b.reason)+'</p>':'')+(can?'<label for="mx-reason-'+b.id+'">Motivering om du avböjer</label><input id="mx-reason-'+b.id+'" maxlength="500" aria-describedby="mx-reason-error-'+b.id+'"><p id="mx-reason-error-'+b.id+'" class="mx-error" role="alert"></p><div class="mx-actions"><button onclick="'+name+'.decide('+b.id+',\'accepted\')">'+(admin&&b.status==='pending_admin'?'Bekräfta':'Acceptera')+'</button><button onclick="'+name+'.decide('+b.id+',\'declined\')">Avböj</button></div>':'')+'</section>';
  }
  function threadHtml(){var t=st.thread;
   return back()+'<article class="mx-thread"><h2>'+esc(t.subject)+'</h2>'+(t.car_number?'<p>Bil '+esc(t.car_number)+'</p>':'')+'<button onclick="'+name+'.newBooking()">Bokad tid</button>'+
    '<div class="mx-history">'+t.messages.map(function(m){return '<div class="mx-message '+(m.mine?'mine':'')+'"><small>'+esc(m.role==='system'?'Historik':m.mine?'Du':m.role==='admin'?'Admin':'Föraren')+' · '+esc(when(m.at))+'</small><p>'+esc(m.body)+'</p></div>';}).join('')+'</div>'+(t.bookings||[]).map(bookingHtml).join('')+
    '<form id="mx-reply"><label for="mx-reply-body">Svara</label><textarea id="mx-reply-body" required maxlength="2000" rows="3"></textarea><button type="submit"'+(st.busy?' disabled':'')+'>Skicka svar</button></form><p class="mx-error mx-server-error" role="alert">'+esc(st.error)+'</p></article>';
  }
  function legacyHtml(){var c=st.legacy.data,k=st.legacy.kind,d=c.data||{};
   if(k==='old-message')return back()+'<h2>'+esc(c.subject)+'</h2><p class="ar-note">Äldre privat samtal – bara läsning. Nya meddelanden går till admin.</p>'+c.messages.map(function(m){return '<div class="mx-message"><small>'+esc(when(m.at))+'</small><p>'+esc(m.body)+'</p></div>';}).join('');
   var h=back()+A.view(c,admin?'owner':'driver');
   if(k==='wh')h+='<div class="mx-form"><label for="mx-legacy-text">'+(admin?'Fråga eller motivering':'Svara admin')+'</label><textarea id="mx-legacy-text" maxlength="1000"></textarea><div class="mx-actions">'+(admin?'<button onclick="'+name+'.legacyAct(\'ask\')">Fråga föraren</button><button onclick="'+name+'.legacyAct(\'approved\')">Godkänn</button><button onclick="'+name+'.legacyAct(\'rejected\')">Neka</button>':d.status==='pending'?'<button onclick="'+name+'.legacyAct(\'reply\')">Skicka svar</button>':'')+'</div></div>';
   else if(k==='sjuk')h+=admin?'<div class="mx-form"><label for="mx-legacy-text">Kommentar</label><textarea id="mx-legacy-text" maxlength="500"></textarea><div class="mx-actions">'+[['godkand','Godkänn'],['intyg_begart','Begär intyg'],['avslagen','Avslå']].map(function(x){return '<button onclick="'+name+'.legacyAct(\''+x[0]+'\')">'+x[1]+'</button>';}).join('')+'</div></div>':'<button onclick="'+name+'.report(\'sjuk\')">Öppna sjukanmälan och intyg</button>';
   else h+='<p class="ar-note">Äldre bilärende – bara läsning. Skapa ett Meddelande om något nytt behövs.</p>';
   return h+'<p class="mx-error mx-server-error" role="alert">'+esc(st.error)+'</p>';
  }
  function paint(){if(!st.el||!st.el.isConnected)return;
   st.el.innerHTML='<div class="mx">'+(st.mode==='list'?listHtml():st.mode==='compose'?composeHtml(false):st.mode==='booking'?composeHtml(true):st.mode==='thread'&&st.thread?threadHtml():st.mode==='legacy'&&st.legacy?legacyHtml():st.mode==='report'?back()+'<div id="mx-report"></div>':back()+'<p>Laddar…</p>')+'</div>';
   var f=st.el.querySelector('#mx-form');if(f){f.querySelectorAll('[data-mx]').forEach(function(e){e.oninput=e.onchange=function(){st.draft[e.dataset.mx]=e.type==='checkbox'?e.checked:e.value;if(e.dataset.mx==='car_number'||e.dataset.mx==='car_unspecified'){var error=f.querySelector('#mx-car-error');if(error)error.textContent='';}if(e.dataset.mx==='car_unspecified'){var car=f.querySelector('#mx-car_number');car.disabled=e.checked;car.setAttribute('aria-required',String(!e.checked));if(e.checked){st.draft.car_number='';car.value='';}}};});f.onsubmit=function(e){e.preventDefault();submit(st.mode==='booking'?'book':'create',st.draft);};}
   var reply=st.el.querySelector('#mx-reply');if(reply)reply.onsubmit=function(e){e.preventDefault();submit('reply',{thread_id:st.thread.id,body:st.el.querySelector('#mx-reply-body').value});};
   if(st.mode==='legacy'&&st.legacy.kind==='sjuk')A.mountCertificates(st.legacy.data,st.el);
  }
  function submit(action,data){if(st.busy)return;if(action==='book'){var car=String(data.car_number||'').trim(),absent=data.car_unspecified===true,msg=(!car&&!absent)||(car&&absent)?'Ange bilnummer (1–3 siffror) eller välj Ej angivet.':car&&!/^[0-9]{1,3}$/.test(car)?'Bilnummer ska vara 1–3 siffror.':'';var ce=st.el.querySelector('#mx-car-error');if(ce)ce.textContent=msg;if(msg)return;}st.busy=true;st.error='';var epoch=st.epoch,request=st.request;var btn=st.el.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
   rpc(action,data).then(function(r){if(epoch!==st.epoch)return;if(request!==st.request){st.busy=false;return;}st.busy=false;if(owner()){location.href='admin.html#message='+r.id;return;}U.openThread(r.id);}).catch(function(e){if(epoch!==st.epoch)return;if(request!==st.request){st.busy=false;return;}st.busy=false;st.error=err(e);var error=st.el&&st.el.querySelector('.mx-server-error');if(error)error.textContent=st.error;if(btn)btn.disabled=false;});
  }
  U.decide=function(id,decision){var reason=st.el.querySelector('#mx-reason-'+id),error=st.el.querySelector('#mx-reason-error-'+id);if(error)error.textContent='';if(decision==='declined'&&(!reason||!reason.value.trim())){if(error)error.textContent='Vänligen specificera orsak';if(reason){reason.setAttribute('aria-invalid','true');reason.focus();}return;}if(reason)reason.removeAttribute('aria-invalid');submit('decide',{booking_id:id,decision:decision,reason:reason?reason.value:''});};
  U.legacyAct=function(action){if(st.busy||!st.legacy)return;var c=st.legacy.data,txt=(st.el.querySelector('#mx-legacy-text')||{}).value||'';
   var rpcName=c.kind==='sjuk'?'sjuk_decide':admin?(action==='ask'?'workshop_ask':'admin_workshop_decide'):'workshop_reply';
   var args={p_id:c.id};if(action==='ask'||action==='reply')args.p_body=txt;else {args.p_status=action;args.p_comment=txt||null;}
   var epoch=st.epoch,request=st.request;st.busy=true;A.rpc(rpcName,args).then(function(){if(epoch!==st.epoch)return;st.busy=false;if(request===st.request)U.openCase(c.kind,c.id);}).catch(function(e){if(epoch!==st.epoch)return;st.busy=false;if(request===st.request){st.error=err(e);paint();}});
  };
  U.report=function(tab){
   if(tab!=='sjuk'&&tab!=='timmar'){U.compose();return;}
   go('report');var target=st.el&&st.el.querySelector('#mx-report');if(!target)return;
   if(tab==='sjuk'){Promise.resolve(SJUK.render(target)).then(function(){if(target.isConnected&&SJUK.newReport)SJUK.newReport();});}
   else {Promise.resolve(VERKSTAD.render(target)).then(function(){if(target.isConnected)VERKSTAD.newReport('timmar');});}
  };
  U.has=function(k,id){return st.cases.some(function(x){return x.kind===k&&x.id===+id;});};
  U.isAdmin=function(){return ['admin','agare','superadmin'].indexOf(window.INKORG_ROLE)>=0;};
  U.badge=function(){var n=U.count();return n?'<span class="ar-badge">'+n+'</span>':'';};
  U.logout=function(){st.epoch++;st.mode='list';st.threads=[];st.cases=[];st.old=[];st.thread=null;st.legacy=null;st.recipients=[];st.draft={};st.el=null;st.busy=false;};
  U.load=U.refresh;U.needs=U.count;U.isOpen=function(){return st.mode!=='list';};
  return U;
 }};
 (function(){var s=document.createElement('style');s.textContent='.mx{padding:10px 12px 24px}.mx button,.mx input,.mx select,.mx textarea{font:inherit;min-height:44px;box-sizing:border-box;border:1px solid var(--border,#cbd5e0);border-radius:9px;background:var(--surface,#fff);color:inherit;padding:10px}.mx button{cursor:pointer}.mx-filters,.mx-actions{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.mx-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.mx-filters button{padding:6px;min-width:0;font-size:24px}.mx-check{display:flex!important;align-items:center;gap:8px;min-height:44px}.mx .mx-check input{width:22px;min-height:24px;margin:0}.mx-category-heading{font-size:1.15em;margin:18px 0 10px}.mx-filters [aria-pressed="true"]{outline:2px solid var(--primary,#234)}.mx-new{width:100%}.mx .ar-s,.mx .ar-m{display:block}.mx .ar-row{text-align:left}.mx-form,.mx-thread{padding:14px;background:var(--surface,#fff);border-radius:12px}.mx label{display:block;margin:13px 0 5px}.mx input,.mx select,.mx textarea{width:100%}.mx-error{color:#b91c1c}.mx-message{background:var(--bg,#eef3f7);padding:12px;border-radius:10px;margin:12px 0}.mx-message.mine{border-left:3px solid var(--primary,#234)}.mx-message p{white-space:pre-wrap;overflow-wrap:anywhere}.mx-message small,.mx-booking small{font-size:.78em}.mx-booking{padding:12px;border:1px solid var(--border,#aaa);border-radius:10px;margin:12px 0}.mx-booking.pending{background:#edf0f2;color:#52606a;border-style:dashed}.mx-booking.solid{border:2px solid var(--primary,#234)}.mx-picker{position:fixed;inset:0;margin:auto;width:calc(100% - 24px);max-width:420px;border:1px solid #aaa;border-radius:12px;padding:18px;background:var(--surface,#fff);color:inherit}.mx-picker button{display:block;min-height:48px;width:100%;margin:10px 0;font:inherit}.mx-picker::backdrop{background:#0007}';document.head.appendChild(s);})();
})();
