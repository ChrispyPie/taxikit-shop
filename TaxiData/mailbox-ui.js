/* Gemensamma ärendetrådar: förare ↔ åkeriets admin. Ingen privat förare-till-förare-sändning.
 * Servern kontrollerar varje listning, svar, bokning och bekräftelse. */
(function(){
 'use strict';
 var A=window.ARENDE,esc=A.esc;
 // Samma händelse/tråd som i ärenden (arende-status.js, 2026-11-13chatt1). Reserv om den inte är laddad.
 function evt(w,at,b){return A.event?A.event(w,at,b):'<div class="tk-ev"><div class="tk-ev-h"><b class="tk-ev-who">'+w+'</b><time class="tk-ev-t">'+esc(at?when(at):'')+'</time></div><div class="tk-ev-b">'+b+'</div></div>';}
 function thr(items){return A.thread?A.thread(items):'<div class="tk-thr" data-tk-thr>'+items.join('')+'</div>';}
 var FILTERS=[['all','Alla','📥'],['message','Meddelande','💬'],['sick','Sjuk','🤒'],['hours','Verkstadstimmar','⏱️']];
 var ADMIN_FILTERS=[['all','Alla','📥'],['message','Meddelanden','💬'],['hours','Verkstadstimmar','⏱️'],['sick','Sjuk','🤒']];
 var STATUS={pending_driver:'Väntar på förarens svar',pending_admin:'Väntar på admins svar',accepted:'Godkänd',declined:'Avböjd'};
 function when(at){var p={};new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).forEach(function(x){p[x.type]=x.value;});return p.year+'-'+p.month+'-'+p.day+' '+p.hour+':'+p.minute;}
 function err(e){return {bad_car_number:'Bilnummer ska vara 1–3 siffror.',bad_date:'Välj ett giltigt datum och klockslag framåt i tiden (svensk tid).',thread_closed:'Tråden är stängd. Du kan läsa den men inte svara.',need_reason:'Vänligen specificera orsak',need_car_choice:'Välj en bil på åkeriet eller Nej.',bad_car_choice:'Välj en bil på åkeriet eller Nej.',bad_visibility:'Välj vem som får se telefonnumret.',bad_subject:'Fyll i rubrik/typ (högst 120 tecken).',bad_text:'Skriv ett meddelande (högst 2000 tecken).',forbidden:'Du har inte behörighet till detta.',not_found:'Det här ärendet finns inte här.',demo_read_only:'Du kan bara läsa i demoläget.',too_many:'För många försök. Försök senare.',need_text:'Skriv något först.',comment_too_long:'Texten är för lång.',msg_too_long:'Texten är för lång (högst 1000 tecken).',not_editable:'Det här ärendet går inte att ändra längre.'}[e&&e.message]||A.errText(e);}
 window.MAILBOX={rpc:function(action,data){
  // Demo får aldrig läsa verkliga kontakter/trådar via den nya serverfunktionen.
  if(window.DEMO&&DEMO.on()){
   if(action==='item_lock')return Promise.resolve({locked:false});
   if(action==='mailbox_capabilities')return Promise.resolve({can_trash:false});
   if(action==='contacts_get')return Promise.resolve({cars:[],phone:null,visibility:'owner',company_label:'Taxi Göteborg'});
   if(['list','timeline','recipients','cars','unread_flags','item_flags'].indexOf(action)>=0)return Promise.resolve([]);
   return Promise.reject(new Error('demo_read_only'));
  }
  return A.rpc('mailbox_v2',{p_action:action,p_data:data||{}});},create:function(admin,name){
  var U={},st={el:null,mode:'list',filter:'all',trash:false,canTrash:false,selected:[],flags:[],threads:[],cases:[],old:[],next:null,thread:null,legacy:null,recipients:[],cars:[],links:[],optionsPending:false,draft:{},replyDraft:'',busy:false,error:'',epoch:0,request:0,refreshRequest:0,loaded:false};
  function rpc(action,data){return MAILBOX.rpc(action,Object.assign({},data,{admin:admin}));}
  // Bokad tid på felanmälan (2026-11-12svar2): issue_booking kopplar en vanlig mailbox-tråd till ärendet (issue_threads).
  function ib(action,data){if(window.DEMO&&DEMO.on())return action==='links'?Promise.resolve([]):action==='get'?Promise.resolve(null):Promise.reject(new Error('demo_read_only'));return A.rpc('issue_booking',{p_action:action,p_data:Object.assign({},data,{admin:admin})});}
  function linkFor(issueId){return st.links.find(function(l){return +l.issue_id===+issueId;})||null;}
  function linkByThread(threadId){return st.links.find(function(l){return +l.thread_id===+threadId;})||null;}
  function linkMeta(l){if(!l)return '';var s=l.booking_states||[];if(s.indexOf('pending_driver')>=0)return ' · Bokad tid väntar på föraren';if(s.indexOf('pending_admin')>=0)return ' · Bokad tid väntar på admin';if(l.next_at)return ' · Bokad tid '+when(l.next_at);return '';}
  function push(){try{history.pushState({view:admin?'admin':'inkorg',sub:'thread'},'');}catch(e){}}
  function go(mode){st.mode=mode;st.error='';push();paint();}
  function back(){return '<button class="ar-back" type="button" onclick="'+name+'.back()">‹ '+(admin?'Ärenden':'Meddelanden')+'</button>';}
  function category(x){return x.kind==='sjuk'?'sick':x.kind==='wh'?'hours':'message';}
  function preference(kind,id){return st.flags.find(function(f){return f.kind===kind&&+f.id===+id;})||{};}
  function flagged(kind,id){return !!preference(kind,id).is_unread;}
  function hidden(kind,id){return !!preference(kind,id).hidden;}
 function owner(){return !admin&&['agare','superadmin'].indexOf(window.INKORG_ROLE)>=0;}
  // Oläst är personligt. needs styr arbetsgrupper, aldrig läsprickar eller aktivitetsantal.
  U.count=function(){return st.threads.filter(function(x){return !hidden('thread',x.id)&&(x.unread||flagged('thread',x.id));}).length+st.cases.filter(function(x){return !hidden(x.kind,x.id)&&(x.unread>0||flagged(x.kind,x.id)||(x.kind==='issue'&&!!(linkFor(x.id)||{}).unread));}).length+st.old.filter(function(x){return !hidden('old-message',x.id)&&(x.unread||flagged('old-message',x.id));}).length;};
  function badge(){if(window.LAZY)LAZY.unreadChanged();if(!admin)window.INKORG_HAS=U.count()>0;if(!admin&&window.setBadge){setBadge('inkorg',U.count());setBadge('profbtn',U.count()>0||!!window.INKORG_NEEDS_PROFILE);}}
  var refreshPending=null;
  U.refresh=function(force){
   if(!force&&refreshPending)return refreshPending;
   var work=refreshNow();refreshPending=work;
   work.finally(function(){if(refreshPending===work)refreshPending=null;});return work;
  };
  function refreshNow(){
   var epoch=st.epoch,refreshRequest=++st.refreshRequest;
   function part(p){return p.then(function(v){return {ok:true,v:v};},function(e){return {ok:false,e:e};});}
   function optional(p,fallback){return p.catch(function(){return fallback;});}
   return Promise.all([
    part(rpc('list',{})),
    part(A.rpc(admin?'case_admin_list':'case_inbox',{p_klar_limit:5000})),
    part(admin?Promise.resolve({items:[]}):A.rpc('conversation_list',{})),
    optional(rpc('item_flags',{}),[]),
    optional(rpc('mailbox_capabilities',{}),{}),
    optional(ib('links',{}),[])
   ]).then(function(d){
    if(epoch!==st.epoch||refreshRequest!==st.refreshRequest)return U.count();
    st.flags=d[3]||[];st.canTrash=admin&&!!(d[4]&&d[4].can_trash);st.links=Array.isArray(d[5])?d[5]:[];
    if(d[0].ok)st.threads=(d[0].v||[]).filter(function(t){return !linkByThread(t.id);});
    if(d[1].ok)st.cases=((d[1].v&&d[1].v.items)||[]).filter(function(x){return x.kind!=='wish';});
    if(d[2].ok){st.old=d[2].v.items||[];st.next=d[2].v.next;}
    var fatal=(!d[0].ok&&d[0].e)||(!d[1].ok&&d[1].e)||(!d[2].ok&&d[2].e)||null;
    st.loaded=true;st.error=fatal?err(fatal):'';badge();if(st.mode==='list')paint();return U.count();
   });
  };
  U.moreOld=function(){if(!st.next||st.busy)return;var epoch=st.epoch;st.busy=true;A.rpc('conversation_list',{p_before:st.next}).then(function(d){if(epoch!==st.epoch)return;st.old=st.old.concat(d.items||[]);st.next=d.next;st.busy=false;if(st.mode==='list')paint();}).catch(function(e){if(epoch!==st.epoch)return;st.busy=false;st.error=err(e);if(st.mode==='list')paint();});};
  var navRestored=false;
  U.render=function(el){st.el=el;if(!navRestored&&window.VIEW_STATE){navRestored=true;var n=VIEW_STATE.get(admin?'admin-mailbox':'inkorg',{});if(FILTERS.some(function(f){return f[0]===n.filter;}))st.filter=n.filter;paint();if(n.thread)return U.openThread(n.thread);if(n.kind&&n.id)return U.openCase(n.kind,n.id);}paint();if(st.mode==='list')U.refresh();};
  U.back=function(){var dialog=st.el&&st.el.querySelector('dialog[open]');if(dialog){dialog.close();return true;}if(st.mode==='booking'&&st.draft.issue_id){U.openCase('issue',st.draft.issue_id);return true;}if(st.mode!=='list'){st.request++;st.mode='list';st.thread=null;st.legacy=null;st.replyDraft='';paint();U.refresh();return true;}return false;};
  U.select=function(f){st.request++;st.filter=f;st.selected=[];st.mode='list';paint();};
  U.show=function(){st.mode='list';st.filter='all';st.trash=false;st.selected=[];if(!admin&&window.openInbox)openInbox();else paint();};
  U.newCase=function(){
   if(!st.el)return;var d=document.createElement('dialog');d.className='mx-picker';d.setAttribute('aria-label','Nytt ärende');
   d.innerHTML='<h3>Nytt ärende</h3>'+[['message','Meddelande'],['sick','Sjuk'],['hours','Verkstadstimmar']].map(function(x){return '<button type="button" onclick="'+name+'.choose(\''+x[0]+'\')">'+x[1]+'</button>';}).join('')+'<button type="button" onclick="this.closest(\'dialog\').close()">Avbryt</button>';
   st.el.appendChild(d);d.addEventListener('close',function(){d.remove();});d.showModal();
  };
  U.choose=function(type){var d=st.el&&st.el.querySelector('dialog');if(d)d.close();if(type==='message')U.compose();else U.report(type==='sick'?'sjuk':'timmar');};
  U.compose=function(){st.draft={};go('compose');recipients();};
  U.issueBooking=function(){if(!st.legacy||st.legacy.kind!=='issue')return;var c=st.legacy.data,d=c.data||{};st.draft={issue_id:c.id,issue_car:d.car||'',issue_who:d.reporter_name||'',issue_title:A.title?A.title(c):'Felanmälan',kind:'Verkstad',car_choice:''};go('booking');recipients();};
  U.newBooking=function(){st.draft={thread_id:st.mode==='thread'&&st.thread?st.thread.id:null,car_choice:''};go('booking');recipients();};
  function recipients(){var epoch=st.epoch;Promise.all([rpc('cars',{}),admin?rpc('recipients',{}):Promise.resolve([])]).then(function(d){if(epoch!==st.epoch)return;st.cars=d[0]||[];st.recipients=d[1]||[];if(st.draft.issue_id&&!st.draft.car_choice&&st.draft.issue_car){var m=st.cars.find(function(c){return String(c.number).trim()===String(st.draft.issue_car).trim();});if(m)st.draft.car_choice=String(m.id);}if(st.mode==='compose'||st.mode==='booking'){if(st.el&&st.el.querySelector('dialog[open]'))st.optionsPending=true;else paint();}}).catch(function(e){if(epoch!==st.epoch)return;st.error=err(e);if(!st.el||!st.el.querySelector('dialog[open]'))paint();});}

  function captureReply(){var box=st.el&&st.el.querySelector('#mx-reply-body');if(box)st.replyDraft=box.value;}
  U.openThread=function(id){
   var link=linkByThread(id);if(link)return U.openCase('issue',link.issue_id);
   if(owner()){location.href='admin.html#message='+encodeURIComponent(id);return Promise.resolve();}
   var stay=st.mode==='thread'&&st.thread&&+st.thread.id===+id;if(!stay)st.replyDraft='';else captureReply();
   st.mode='loading';if(!stay)st.thread=null;var request=++st.request;push();if(!stay){if(!admin&&window.openInbox)openInbox();else paint();}var epoch=st.epoch;
   return rpc('get',{thread_id:id}).then(async function(d){if(epoch!==st.epoch||request!==st.request||st.mode!=='loading')return;try{await rpc('mark_read',{kind:'thread',id:id});}catch(e){st.error=err(e);}if(epoch!==st.epoch||request!==st.request||st.mode!=='loading')return;st.thread=d;st.mode='thread';paint();return U.refresh(true);}).catch(function(e){if(epoch!==st.epoch||request!==st.request)return;st.error=err(e);st.mode='list';paint();});
  };
  U.openCase=function(kind,id){
   if(kind==='wish'){if(admin&&window.openMenu)openMenu('onskemal');else if(U.isAdmin())location.href='admin.html#onskemal';return;}
   st.mode='loading';var request=++st.request;push();if(!admin&&window.openInbox)openInbox();else paint();
   var epoch=st.epoch;
   return Promise.all([A.rpc(kind==='old-message'?'conversation_get':'case_get',kind==='old-message'?{p_id:id}:{p_kind:kind,p_id:id}),rpc('item_lock',{kind:kind,id:id}),kind==='issue'?ib('get',{issue_id:id}).catch(function(){return null;}):Promise.resolve(null)]).then(async function(result){var c=result[0];c.locked=!!(result[1]&&result[1].locked);c.booking=result[2]||null;if(epoch!==st.epoch||request!==st.request||st.mode!=='loading')return;try{await Promise.all([rpc('mark_read',{kind:kind,id:id}),kind==='old-message'?Promise.resolve():A.rpc('case_seen',{p_kind:kind,p_id:id})]);}catch(e){st.error=err(e);}if(epoch!==st.epoch||request!==st.request||st.mode!=='loading')return;st.legacy={kind:kind,data:c};st.mode='legacy';paint();return U.refresh(true);}).catch(function(e){if(epoch!==st.epoch||request!==st.request)return;st.error=err(e);st.mode='list';paint();});
  };
  U.tap=U.openCase;U.readConversation=function(id){return U.openCase('old-message',id);};
  function formField(label,id,type,required,max){var d=st.draft,v=d[id]||'';return '<label for="mx-'+id+'">'+label+'</label><input id="mx-'+id+'" data-mx="'+id+'" type="'+(type||'text')+'"'+(required?' required':'')+(max?' maxlength="'+max+'"':'')+' value="'+esc(v)+'">';}
  function carField(){return '<label for="mx-car_choice">Bil nr:</label><select id="mx-car_choice" data-mx="car_choice" aria-required="true"><option value="">Välj</option><option value="none"'+(st.draft.car_choice==='none'?' selected':'')+'>Nej</option>'+st.cars.map(function(c){return '<option value="'+esc(c.id)+'"'+(String(c.id)===String(st.draft.car_choice)?' selected':'')+'>'+esc(c.number)+'</option>';}).join('')+'</select><p id="mx-car-error" class="mx-error" role="alert"></p>';}
  function timeField(){var value=(st.draft.time||'').split(':');function options(n,selected){var h='<option value="">Välj</option>';for(var i=0;i<n;i++){var x=String(i).padStart(2,'0');h+='<option value="'+x+'"'+(x===selected?' selected':'')+'>'+x+'</option>';}return h;}return '<label>Tid (HH:MM, svensk tid)</label><div class="mx-time"><select id="mx-hour" data-mx="hour" aria-label="Timme" required>'+options(24,value[0])+'</select><span aria-hidden="true">:</span><select id="mx-minute" data-mx="minute" aria-label="Minut" required>'+options(60,value[1])+'</select></div>';}
  function dateField(){return '<label for="mx-date">Datum (ÅÅÅÅ-MM-DD)</label><div class="mx-date-line"><input id="mx-date" type="text" readonly onclick="'+name+'.calendar()" placeholder="ÅÅÅÅ-MM-DD" value="'+esc(st.draft.date||'')+'" aria-label="Valt datum"><button id="mx-date-open" type="button" aria-label="Välj datum" onclick="'+name+'.calendar()"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 17h2M12 17h2"></path></svg></button></div>';}
  var calendarMonth;
  function iso(d){return d.toISOString().slice(0,10);}
  function calendarBounds(){var today=when(Date.now()).slice(0,10),limit=new Date(today+'T12:00:00Z');limit.setUTCFullYear(limit.getUTCFullYear()+2);return {today:today,max:iso(limit)};}
  function calendarDraw(){var d=st.el&&st.el.querySelector('#mx-calendar');if(!d)return;var bound=calendarBounds(),first=new Date(calendarMonth+'-01T12:00:00Z'),y=first.getUTCFullYear(),m=first.getUTCMonth(),offset=(first.getUTCDay()+6)%7,count=new Date(Date.UTC(y,m+1,0,12)).getUTCDate();
   var h='<div class="mx-cal-nav"><button type="button" aria-label="Föregående månad" onclick="'+name+'.calendarMove(-1)"'+(calendarMonth<=bound.today.slice(0,7)?' disabled':'')+'>‹</button><b>'+esc(first.toLocaleDateString('sv-SE',{month:'long',year:'numeric',timeZone:'UTC'}))+'</b><button type="button" aria-label="Nästa månad" onclick="'+name+'.calendarMove(1)"'+(calendarMonth>=bound.max.slice(0,7)?' disabled':'')+'>›</button></div><div class="mx-cal-grid">'+['Må','Ti','On','To','Fr','Lö','Sö'].map(function(x){return '<small>'+x+'</small>';}).join('');
   for(var i=0;i<offset;i++)h+='<span></span>';for(var day=1;day<=count;day++){var key=iso(new Date(Date.UTC(y,m,day,12)));h+='<button type="button" class="mx-cal-day" aria-label="'+key+'" aria-pressed="'+(st.draft.date===key)+'"'+(key<bound.today||key>bound.max?' disabled':'')+' onclick="'+name+'.pickDate(\''+key+'\')">'+day+'</button>';}
   d.innerHTML=h+'</div><button type="button" class="mx-cal-cancel" onclick="this.closest(\'dialog\').close()">Avbryt</button>';
  }
  U.calendar=function(){if(!st.el||st.mode!=='booking'||st.el.querySelector('#mx-calendar'))return;calendarMonth=(st.draft.date||calendarBounds().today).slice(0,7);var d=document.createElement('dialog');d.id='mx-calendar';d.className='mx mx-calendar';d.setAttribute('aria-label','Välj datum');st.el.appendChild(d);calendarDraw();d.addEventListener('close',function(){d.remove();if(st.optionsPending){st.optionsPending=false;paint();}var b=st.el&&st.el.querySelector('#mx-date-open');if(b)b.focus();});d.showModal();var selected=d.querySelector('[aria-pressed="true"]')||d.querySelector('.mx-cal-day:not(:disabled)');if(selected)selected.focus();};
  U.calendarMove=function(delta){var d=new Date(calendarMonth+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);calendarMonth=iso(d).slice(0,7);calendarDraw();var b=st.el.querySelector(delta<0?'[aria-label="Föregående månad"]':'[aria-label="Nästa månad"]');if(b)b.focus();};
  U.pickDate=function(key){var bound=calendarBounds();if(key<bound.today||key>bound.max)return;st.draft.date=key;var input=st.el.querySelector('#mx-date');if(input)input.value=key;var d=st.el.querySelector('#mx-calendar');if(d)d.close();};

  function driverField(){if(st.draft.issue_id)return '<p class="mx-fixed">'+esc(st.draft.issue_title||'Felanmälan')+(st.draft.issue_car?' · Bil '+esc(st.draft.issue_car):'')+(admin&&st.draft.issue_who?'<br>Chaufför: '+esc(st.draft.issue_who):'')+'</p>';if(!admin||st.draft.thread_id)return '';return '<label for="mx-driver_id">Chaufför på åkeriet</label><select id="mx-driver_id" data-mx="driver_id" required><option value="">Välj chaufför…</option>'+st.recipients.map(function(d){return '<option value="'+esc(d.id)+'"'+(String(d.id)===String(st.draft.driver_id)?' selected':'')+'>'+esc(d.name)+'</option>';}).join('')+'</select>';}
  function composeHtml(book){
   return back()+'<form class="mx-form" id="mx-form"><h3>'+(book?'Bokad tid':admin?'Meddelande till chaufför':'Meddelande till admin')+'</h3>'+driverField()+
    (book?formField('Typ (blir ärendets rubrik)','kind','text',true,120)+dateField()+timeField():formField('Rubrik','subject','text',true,120)+'<label for="mx-body">Meddelande</label><textarea id="mx-body" data-mx="body" required maxlength="2000" rows="5">'+esc(st.draft.body||'')+'</textarea>')+
    // På en felanmälan skrivs meddelanden i ärendets svarsruta, så allt hamnar i samma tråd.
    (book&&!st.draft.issue_id?'<label for="mx-body">Meddelande (valfritt)</label><textarea id="mx-body" data-mx="body" maxlength="2000" rows="4">'+esc(st.draft.body||'')+'</textarea>':'')+carField()+(!book&&!admin?'<p class="ar-note">Sjukanmälan och läkarintyg skickas under Sjuk, inte här.</p>':'')+(book?'<p class="ar-note">'+(st.draft.issue_id?'Vill du skriva något till '+(admin?'föraren':'ägaren')+'? Använd svarsrutan i ärendet. ':'')+(admin?'Föraren måste godkänna tiden.':'Admin måste bekräfta ditt förslag.')+' Tiden visas grå i schemat tills den är godkänd.</p>':'')+
    '<p class="mx-error mx-server-error" role="alert">'+esc(st.error)+'</p><button type="submit"'+(st.busy?' disabled':'')+'>'+(st.busy?'Sparar…':book?'Föreslå tid':'Skicka')+'</button></form>';
  }
  // Closed wins over legacy needs; a pending booking or unanswered human reply wins over other bookings.
  function threadGroup(t){
   var states=t.booking_states||[],waiting=t.last_sender_role===(admin?'driver':'admin')&&!t.decision_reply;
   if(states.some(function(x){return x==='pending_driver'||x==='pending_admin';})||waiting)return 0;
   if(states.length&&states.every(function(x){return x==='declined';}))return 2;
   return 1;
  }
  function caseGroup(c){return c.st==='klar'?2:c.st==='ny'||c.st==='vantar'||c.needs?0:1;}
  function unreadButton(kind,id){return '<button type="button" onclick="'+name+'.markUnread(\''+kind+'\','+id+')">Markera som oläst</button>';}
  U.markUnread=function(kind,id){if(st.busy)return;st.busy=true;rpc('mark_unread',{kind:kind,id:id}).then(function(){st.busy=false;st.mode='list';st.thread=null;st.legacy=null;return U.refresh(true);}).catch(function(e){st.busy=false;st.error=err(e);paint();});};
  U.toggleSelection=function(kind,id,on){var key=kind+':'+id;st.selected=st.selected.filter(function(x){return x!==key;});if(on&&st.selected.length<100)st.selected.push(key);paint();};
  U.trash=function(on){if(!st.canTrash)return;st.trash=on;st.selected=[];paint();};
  U.bulk=function(operation){if(st.busy||!st.selected.length)return;if((operation==='restore'||operation==='permanent')&&!st.canTrash)return;if(operation==='permanent'&&!window.confirm('Radera permanent från ägarsidan? Om föraren också har raderat tas vanliga meddelandetrådar bort helt. Det kan inte ångras.'))return;st.busy=true;var items=st.selected.map(function(key){var p=key.split(':');return {kind:p[0],id:+p[1]};});rpc('bulk_preferences',{operation:operation,items:items}).then(function(){st.busy=false;st.selected=[];return U.refresh(true);}).catch(function(e){st.busy=false;st.error=err(e);paint();});};
  function listHtml(){
   var filters=admin?ADMIN_FILTERS:FILTERS;
   var h='<div class="mx-filters" role="group" aria-label="'+(admin?'Ärenden':'Meddelanden')+'">'+filters.map(function(x){return '<button aria-label="'+x[1]+'" title="'+x[1]+'" aria-pressed="'+(st.filter===x[0])+'" onclick="'+name+'.select(\''+x[0]+'\')"><span aria-hidden="true">'+x[2]+'</span></button>';}).join('')+'</div>';
   h+='<h2 class="mx-category-heading">'+esc((filters.find(function(x){return x[0]===st.filter;})||filters[0])[1])+'</h2>';
   if(st.canTrash)h+='<button class="mx-trash-toggle" onclick="'+name+'.trash('+(!st.trash)+')">'+(st.trash?'Tillbaka till listan':'Papperskorg')+'</button>';
   if(st.trash)h+='<h3>Papperskorg</h3><p class="ar-note">Åkeriets papperskorg. Återställ eller radera permanent från ägarsidan. Motparten behåller sin kopia tills båda har raderat. Sjukuppgifter och intyg raderas aldrig här.</p>';
   h+=admin?'<div class="mx-actions"><button onclick="'+name+'.compose()">Meddelande</button><button onclick="'+name+'.newBooking()">Bokad tid</button></div>':'<button class="mx-new" onclick="'+name+'.newCase()">＋ Nytt ärende</button>';
   if(owner())h+='<p class="ar-note">Alla dina ärenden hanteras i <a href="admin.html#arenden">Admin › Ärenden</a>.</p>';
   var all=st.threads.map(function(t){return {kind:'thread',id:t.id,at:t.at,title:t.subject,body:t.last_body||'',meta:t.name+(t.car_number?' · Bil '+t.car_number:'')+(t.locked?' · Tråden är stängd':''),unread:t.unread||flagged('thread',t.id),open:name+'.openThread('+t.id+')',cat:'message',group:threadGroup(t)};});
   all=all.concat(st.cases.map(function(c){return {kind:c.kind,id:c.id,at:c.at,title:c.title,body:c.last_txt||c.txt||'',meta:(c.car?'Bil '+c.car+' · ':'')+(A.WORDS[c.st]||'')+(['sjuk','wh','issue'].indexOf(c.kind)<0?' · Arkiv':'')+(c.kind==='issue'?linkMeta(linkFor(c.id)):''),unread:c.unread>0||flagged(c.kind,c.id)||(c.kind==='issue'&&!!(linkFor(c.id)||{}).unread),open:name+'.openCase(\''+c.kind+'\','+c.id+')',cat:category(c),group:c.kind==='issue'&&/pending_/.test(((linkFor(c.id)||{}).booking_states||[]).join())?0:caseGroup(c)};}));
   all=all.concat(st.old.map(function(c){return {kind:'old-message',id:c.id,at:c.at,title:c.subject,body:c.last_body,meta:'Äldre privat samtal · bara läsning',unread:c.unread||flagged('old-message',c.id),open:name+'.readConversation('+c.id+')',cat:'message',group:2};}));
   all=all.filter(function(x){return !preference(x.kind,x.id).permanent&&(st.trash?st.canTrash&&preference(x.kind,x.id).in_trash:!hidden(x.kind,x.id))&&(st.filter==='all'||st.filter===x.cat);}).sort(function(a,b){return Date.parse(b.at)-Date.parse(a.at);});
   h+='<p class="mx-error mx-server-error" role="alert">'+esc(st.error)+'</p>';
   if(st.selected.length)h+='<div class="mx-bulk" role="group" aria-label="Valda rader"><b>'+st.selected.length+' valda</b>'+(st.trash?'<button onclick="'+name+'.bulk(\'restore\')">Återställ</button><button onclick="'+name+'.bulk(\'permanent\')">Radera på riktigt</button>':'<button onclick="'+name+'.bulk(\'pin\')">Nåla fast</button><button onclick="'+name+'.bulk(\'unpin\')">Ta bort nål</button><button onclick="'+name+'.bulk(\'unread\')">Markera som oläst</button><button onclick="'+name+'.bulk(\'hide\')">Radera</button>')+'</div>';
   function row(x){var key=x.kind+':'+x.id;return '<div class="mx-select-row"><label class="mx-row-check"><input type="checkbox" aria-label="Markera '+esc(x.title)+'" '+(st.selected.indexOf(key)>=0?'checked ':'')+'onchange="'+name+'.toggleSelection(\''+x.kind+'\','+x.id+',this.checked)"></label><button class="ar-row" onclick="'+x.open+'"><span class="ar-main"><span class="ar-t"><b>'+esc(x.title)+'</b>'+(x.unread?'<span class="ar-dot" aria-label="Oläst"></span>':'')+'</span><span class="ar-s">'+esc(x.body)+'</span><span class="ar-m">'+esc(x.meta)+' · '+esc(when(x.at))+'</span></span></button></div>';}
   var pinned=st.trash?[]:all.filter(function(x){return preference(x.kind,x.id).pinned;});
   if(pinned.length){h+='<section class="mx-case-group"><h3>📌 Fastnålade</h3><div class="ar-list">'+pinned.map(row).join('')+'</div></section>';all=all.filter(function(x){return !preference(x.kind,x.id).pinned;});}
   if(admin&&!st.trash){['Ohanterade / väntar på svar','Pågående','Avslutade'].forEach(function(label,i){var items=all.filter(function(x){return x.group===i;});if(items.length)h+='<section class="mx-case-group"><h3>'+label+'</h3><div class="ar-list">'+items.map(row).join('')+'</div></section>';});}
   else h+='<div class="ar-list">'+all.map(row).join('')+'</div>';
   if(!all.length&&!pinned.length)h+='<p class="ar-empty">'+(st.loaded?'Inget här just nu.':'Laddar…')+'</p>';
   if(st.next)h+='<button onclick="'+name+'.moreOld()">Visa fler äldre samtal</button>';
   return h;
  }
  // Bokad tid i tråden (2026-11-13chatt1): en fast rad överst med det som gäller nu (väntande förslag
  // och senaste godkända tid), och varje förslag/beslut som en vanlig händelse i tråden.
  function bWhen(b){return A.whenLong?A.whenLong(b.starts_at):when(b.starts_at);}
  function bWhat(b){var t=b.kind||b.title||'';return esc(bWhen(b))+(t&&t!=='Bokad tid'?' · '+esc(t):'')+(b.car_number?' · Bil '+esc(b.car_number):'');}
  function bRole(b){return b.proposer_role||(b.status==='pending_admin'?'driver':'admin');}
  function bWho(role,adminWord){return role==='admin'?(admin?'Du':adminWord):(admin?'Föraren':'Du');}
  function bookingEvents(bs,adminWord){var out=[];(bs||[]).forEach(function(b){var r=bRole(b),o=r==='admin'?'driver':'admin';
    out.push({at:b.created_at,h:evt(esc(bWho(r,adminWord)),b.created_at,'Föreslog Bokad tid: '+bWhat(b))});
    if(b.decided_at&&(b.status==='accepted'||b.status==='declined'))out.push({at:b.decided_at,h:evt(esc(bWho(o,adminWord)),b.decided_at,(b.status==='accepted'?'Godkände Bokad tid: ':'Avböjde Bokad tid: ')+bWhat(b)+(b.reason?'\nOrsak: '+esc(b.reason):''))});});
   return out;}
  function bookingSummary(bs,ctx){ctx=ctx||{};bs=bs||[];var rows=[],pend=bs.filter(function(b){return b.status==='pending_driver'||b.status==='pending_admin';}),acc=bs.filter(function(b){return b.status==='accepted';}).sort(function(a,b){return new Date(a.starts_at)-new Date(b.starts_at);}),now=Date.now();
   var cur=acc.filter(function(b){return new Date(b.starts_at).getTime()>=now-3600000;})[0]||acc[acc.length-1];
   if(cur)rows.push(sumRow(cur,ctx));pend.forEach(function(b){rows.push(sumRow(b,ctx));});return rows;}
  function sumRow(b,ctx){var can=!(ctx.locked&&!admin)&&((admin&&b.status==='pending_admin')||((!admin||ctx.is_driver)&&b.status==='pending_driver'));
   return '<section class="tk-sum-row mx-booking '+(b.status==='accepted'?'solid':'pending')+'"><div><b>Bokad tid:</b> '+bWhat(b)+' · <span class="tk-sum-st">'+esc(STATUS[b.status]||'')+'</span></div>'+(can?'<div class="mx-actions"><button onclick="'+name+'.decide('+b.id+',\'accepted\')">'+(admin&&b.status==='pending_admin'?'Bekräfta':'Acceptera')+'</button><button onclick="'+name+'.decide('+b.id+',\'declined\')">Avböj</button></div>':'')+'</section>';}
  function threadHtml(){var t=st.thread;
   return back()+unreadButton('thread',t.id)+'<article class="mx-thread ar-card"><div class="ar-ct"><h2>'+esc(t.subject)+'</h2></div>'+(t.car_number?'<div class="ar-m">Bil '+esc(t.car_number)+'</div>':'')+(t.locked&&!admin?'':'<button onclick="'+name+'.newBooking()">Bokad tid</button>')+
    (function(r){return A.summary?A.summary(r):r.join('');})(bookingSummary(t.bookings,t))+thr(t.messages.map(function(m){return {at:m.at,h:evt(esc(m.role==='system'?'Historik':m.mine?'Du':m.role==='admin'?'Admin':'Föraren'),m.at,esc(m.body))};}).concat(bookingEvents(t.bookings,'Admin')).sort(function(a,b){return new Date(a.at)-new Date(b.at);}).map(function(r){return r.h;}))+
    (t.locked&&!admin?'<p class="ar-note" role="status">Tråden är stängd. Du kan läsa hela tråden men inte svara.</p>':'<form id="mx-reply"><p id="mx-decline-error" class="mx-error" role="alert"></p><label for="mx-reply-body">Svara</label><textarea id="mx-reply-body" required maxlength="2000" rows="3">'+esc(st.replyDraft||'')+'</textarea><button type="submit"'+(st.busy?' disabled':'')+'>Skicka svar</button></form>')+'<p class="mx-error mx-server-error" role="alert">'+esc(st.error)+'</p></article>';
  }
  function legacyHtml(){var c=st.legacy.data,k=st.legacy.kind,d=c.data||{};
   if(k==='old-message')return back()+unreadButton(k,c.id)+'<h2>'+esc(c.subject)+'</h2><p class="ar-note">Äldre privat samtal – bara läsning. Nya meddelanden går till admin.</p>'+thr(c.messages.map(function(m){return evt(esc(m.mine?'Du':(c.name||'Avsändare')),m.at,esc(m.body));}));
   var bk=k==='issue'&&c.booking&&c.booking.bookings||[];
   var h=back()+unreadButton(k,c.id)+A.view(c,admin?'owner':'driver',bk.length?{events:bookingEvents(bk,'Ägaren'),summary:bookingSummary(bk,{locked:c.locked,is_driver:c.booking.is_driver})}:null);
   if(c.locked&&!admin)return h+'<p class="ar-note" role="status">Tråden är stängd. Du kan läsa den men inte svara här.</p>';
   if(k==='wh'){var decided=d.status&&d.status!=='pending';h+='<div class="mx-form"><label for="mx-legacy-text">'+(admin?(decided?'Meddelande till föraren (beslutet ändras inte)':'Meddelande till föraren, eller motivering till beslutet'):'Svara')+'</label><textarea id="mx-legacy-text" maxlength="1000"></textarea><div class="mx-actions">'+(admin?'<button onclick="'+name+'.legacyAct(\'message\')">Skicka meddelande</button><button onclick="'+name+'.legacyAct(\'ask\')">'+(decided?'Öppna igen och fråga':'Fråga föraren')+'</button><button onclick="'+name+'.legacyAct(\'approved\')">Godkänn</button><button onclick="'+name+'.legacyAct(\'rejected\')">Neka</button>':'<button onclick="'+name+'.legacyAct(\'reply\')">Skicka svar</button>')+'</div></div>';}
   else if(k==='sjuk')h+=admin?'<div class="mx-form"><label for="mx-legacy-text">Kommentar</label><textarea id="mx-legacy-text" maxlength="500"></textarea><div class="mx-actions">'+[['godkand','Godkänn'],['intyg_begart','Begär intyg'],['avslagen','Avslå']].map(function(x){return '<button onclick="'+name+'.legacyAct(\''+x[0]+'\')">'+x[1]+'</button>';}).join('')+'</div></div>':'<button onclick="'+name+'.report(\'sjuk\')">Öppna sjukanmälan och intyg</button>';
   // Felanmälan / Bilen står / Behövs (2026-11-12svar1): svarsruta för både ägare/admin och föraren, via car_issue_message (status ändras inte).
   else if(k==='issue'){var closed=c.st==='klar'||(d.status&&A.st('issue',d.status)==='klar');h+='<div class="mx-form">'+(closed?'<p class="ar-note">Ärendet är redan klart. Du kan ändå skriva, status ändras inte.</p>':'')+'<label for="mx-legacy-text">'+(admin?'Meddelande till föraren':'Svara')+'</label><textarea id="mx-legacy-text" maxlength="1000"></textarea><p id="mx-decline-error" class="mx-error" role="alert"></p><div class="mx-actions"><button onclick="'+name+'.legacyAct(\'issue_message\')"'+(st.busy?' disabled':'')+'>'+(admin?'Skicka meddelande':'Skicka svar')+'</button>'+(c.booking?'<button onclick="'+name+'.issueBooking()">Bokad tid</button>':'')+'</div></div>';}
   else h+='<p class="ar-note">Äldre bilärende – bara läsning. Skapa ett Meddelande om något nytt behövs.</p>';
   return h+'<p class="mx-error mx-server-error" role="alert">'+esc(st.error)+'</p>';
  }
  function paint(){captureReply();if(window.VIEW_STATE&&['list','thread','legacy'].indexOf(st.mode)>=0)VIEW_STATE.save(admin?'admin-mailbox':'inkorg',{filter:st.filter,thread:st.mode==='thread'&&st.thread?st.thread.id:null,kind:st.mode==='legacy'&&st.legacy?st.legacy.kind:null,id:st.mode==='legacy'&&st.legacy?st.legacy.data.id||st.legacy.data.data&&st.legacy.data.data.id:null});if(!st.el||!st.el.isConnected)return;
   st.el.innerHTML='<div class="mx">'+(st.mode==='list'?listHtml():st.mode==='compose'?composeHtml(false):st.mode==='booking'?composeHtml(true):st.mode==='thread'&&st.thread?threadHtml():st.mode==='legacy'&&st.legacy?legacyHtml():st.mode==='report'?back()+'<div id="mx-report"></div>':back()+'<p>Laddar…</p>')+'</div>';
   var f=st.el.querySelector('#mx-form');if(f){f.querySelectorAll('[data-mx]').forEach(function(e){e.oninput=e.onchange=function(){st.draft[e.dataset.mx]=e.value;if(e.dataset.mx==='car_choice'){var error=f.querySelector('#mx-car-error');if(error)error.textContent='';}if(e.dataset.mx==='hour'||e.dataset.mx==='minute'){var h=f.querySelector('#mx-hour').value,m=f.querySelector('#mx-minute').value;st.draft.time=h&&m?h+':'+m:'';}};});f.onsubmit=function(e){e.preventDefault();submit(st.mode==='booking'?'book':'create',st.draft);};}
   var reply=st.el.querySelector('#mx-reply');if(reply){var box=st.el.querySelector('#mx-reply-body');if(box)box.oninput=function(){st.replyDraft=box.value;};reply.onsubmit=function(e){e.preventDefault();submit('reply',{thread_id:st.thread.id,body:st.el.querySelector('#mx-reply-body').value});};}
   if(st.mode==='legacy'&&st.legacy.kind==='sjuk')A.mountCertificates(st.legacy.data,st.el);
   // Tråden öppnas vid senaste händelsen: bara trådrutan rullas, aldrig sidan (2026-11-13chatt1).
   if(A.mountThread)A.mountThread(st.el,st.mode==='thread'&&st.thread?'t:'+st.thread.id:st.mode==='legacy'&&st.legacy?'c:'+st.legacy.kind+':'+(st.legacy.data.id||(st.legacy.data.data||{}).id):null);
  }
  function submit(action,data){if(st.busy)return;if(action==='book'||action==='create'){var ce=st.el.querySelector('#mx-car-error');if(!data.car_choice){if(ce)ce.textContent='Välj en bil på åkeriet eller Nej.';return;}if(ce)ce.textContent='';if(action==='book'&&!data.date){var error=st.el.querySelector('.mx-server-error');if(error)error.textContent='Välj datum i kalendern.';return;}}st.busy=true;st.error='';var epoch=st.epoch,request=st.request;var btn=st.el.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
   var issueId=action==='book'&&data.issue_id?data.issue_id:action==='decide'&&st.mode==='legacy'&&st.legacy&&st.legacy.kind==='issue'?st.legacy.data.id:null;
   var call=action==='book'&&data.issue_id?ib('book',{issue_id:data.issue_id,kind:data.kind,date:data.date,time:data.time,body:'',car_choice:data.car_choice}):rpc(action,data);
   call.then(function(r){if(epoch!==st.epoch)return;if(request!==st.request){st.busy=false;return;}st.busy=false;if(issueId){st.draft={};U.openCase('issue',issueId);return;}if(owner()){location.href='admin.html#message='+r.id;return;}if(action==='reply'||(action==='decide'&&data.decision==='declined')){st.replyDraft='';var box=st.el&&st.el.querySelector('#mx-reply-body');if(box)box.value='';}else captureReply();U.openThread(r.id);}).catch(function(e){if(epoch!==st.epoch)return;if(request!==st.request){st.busy=false;return;}st.busy=false;st.error=err(e);var error=st.el&&st.el.querySelector('.mx-server-error');if(error)error.textContent=st.error;if(btn)btn.disabled=false;});
  }
  U.decide=function(id,decision){var reply=st.el.querySelector('#mx-reply-body')||st.el.querySelector('#mx-legacy-text'),error=st.el.querySelector('#mx-decline-error'),reason=reply?reply.value.trim():'';if(error)error.textContent='';if(decision==='declined'&&!reason){if(error)error.textContent='Vänligen specificera orsak';if(reply){reply.setAttribute('aria-invalid','true');reply.focus();}return;}if(reply)reply.removeAttribute('aria-invalid');submit('decide',{booking_id:id,decision:decision,reason:decision==='declined'?reason:''});};

  U.legacyAct=function(action){if(st.busy||!st.legacy)return;var c=st.legacy.data,txt=(st.el.querySelector('#mx-legacy-text')||{}).value||'',box=st.el.querySelector('#mx-legacy-text');
   if((action==='ask'||action==='reply'||action==='message'||action==='issue_message')&&!String(txt).trim()){st.error=err({message:'need_text'});if(box)box.focus();paint();return;}
   if(action==='issue_message'){if(c.kind!=='issue')return;st.error='';var ep=st.epoch,rq=st.request;st.busy=true;var sb=st.el&&st.el.querySelector('.mx-form .mx-actions button');if(sb)sb.disabled=true;A.rpc('car_issue_message',{p_id:c.id,p_body:txt}).then(function(){if(ep!==st.epoch)return;st.busy=false;if(rq===st.request)U.openCase(c.kind,c.id);}).catch(function(e){if(ep!==st.epoch)return;st.busy=false;if(rq===st.request){st.error=err(e);paint();var b=st.el&&st.el.querySelector('#mx-legacy-text');if(b)b.value=txt;}});return;}
   var rpcName=c.kind==='sjuk'?'sjuk_decide':!admin?'workshop_reply':action==='ask'?'workshop_ask':action==='message'?'workshop_owner_message':'admin_workshop_decide';
   var args={p_id:c.id};if(action==='ask'||action==='reply'||action==='message')args.p_body=txt;else {args.p_status=action;args.p_comment=txt||null;}
   var epoch=st.epoch,request=st.request;st.busy=true;A.rpc(rpcName,args).then(function(){if(epoch!==st.epoch)return;st.busy=false;if(request===st.request)U.openCase(c.kind,c.id);}).catch(function(e){if(epoch!==st.epoch)return;st.busy=false;if(request===st.request){st.error=err(e);paint();}});
  };
  U.report=async function(tab){
   if(window.LAZY)await LAZY.ensure('verkstad');
   if(tab!=='sjuk'&&tab!=='timmar'){U.compose();return;}
   go('report');var target=st.el&&st.el.querySelector('#mx-report');if(!target)return;
   if(tab==='sjuk'){Promise.resolve(SJUK.render(target)).then(function(){if(target.isConnected&&SJUK.newReport)SJUK.newReport();});}
   else {Promise.resolve(VERKSTAD.render(target)).then(function(){if(target.isConnected)VERKSTAD.newReport('timmar');});}
  };
  U.has=function(k,id){return st.cases.some(function(x){return x.kind===k&&x.id===+id;});};
  U.isAdmin=function(){return ['admin','agare','superadmin'].indexOf(window.INKORG_ROLE)>=0;};
  U.badge=function(){var n=U.count();return n?'<span class="ar-badge">'+n+'</span>':'';};
  U.logout=function(){navRestored=false;st.epoch++;st.mode='list';st.trash=false;st.canTrash=false;st.selected=[];st.flags=[];st.threads=[];st.cases=[];st.old=[];st.thread=null;st.legacy=null;st.recipients=[];st.cars=[];st.optionsPending=false;st.draft={};st.replyDraft='';st.el=null;st.busy=false;if(!admin)window.INKORG_HAS=false;};
  U.load=U.refresh;U.needs=U.count;U.isOpen=function(){return st.mode!=='list';};
  return U;
 }};
 (function(){var s=document.createElement('style');s.textContent='.mx-bulk{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:var(--surface,#fff);border:1px solid var(--border,#aaa);border-radius:10px}.mx-bulk b{width:100%}.mx-select-row{display:flex;align-items:stretch;gap:4px}.mx-select-row>.ar-row{flex:1;min-width:0}.mx .mx-row-check{display:flex;align-items:center;justify-content:center;min-width:44px;margin:0}.mx .mx-row-check input{width:22px;min-height:22px;margin:0}.mx{padding:10px 12px 24px}.mx button,.mx input,.mx select,.mx textarea{font:inherit;min-height:44px;box-sizing:border-box;border:1px solid var(--border,#cbd5e0);border-radius:9px;background:var(--surface,#fff);color:inherit;padding:10px}.mx button{cursor:pointer}.mx-filters,.mx-actions{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.mx-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.mx-filters button{padding:6px;min-width:0;font-size:24px}.mx-check{display:flex!important;align-items:center;gap:8px;min-height:44px}.mx .mx-check input{width:22px;min-height:24px;margin:0}.mx-time{display:grid;grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr);align-items:center;text-align:center}.mx-date-line{display:grid;grid-template-columns:minmax(0,1fr) 50px;gap:8px}.mx-date-line button{display:flex;align-items:center;justify-content:center}.mx-calendar{position:fixed;inset:0;margin:auto;height:fit-content;width:calc(100% - 12px);max-width:380px;padding:10px;border:1px solid #aab;border-radius:12px;background:var(--surface,#fff);color:inherit;max-height:90dvh;overflow:auto;box-sizing:border-box}.mx-calendar::backdrop{background:#0007}.mx-cal-nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;text-align:center;gap:4px;margin-bottom:8px}.mx-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;text-align:center}.mx-cal-grid button{padding:4px;min-width:0;min-height:44px}.mx-cal-grid [aria-pressed=true]{outline:2px solid var(--primary,#234)}.mx-calendar button:disabled{opacity:.35}.mx-cal-cancel{width:100%;margin-top:8px}.mx-category-heading{font-size:1.15em;margin:18px 0 10px}.mx-filters [aria-pressed="true"]{outline:2px solid var(--primary,#234)}.mx-new{width:100%}.mx .ar-s,.mx .ar-m{display:block}.mx .ar-row{text-align:left}.mx-form,.mx-thread{padding:14px;background:var(--surface,#fff);border-radius:12px}.mx label{display:block;margin:13px 0 5px}.mx input,.mx select,.mx textarea{width:100%}.mx-error{color:#b91c1c}.mx-booking small{font-size:.78em}.mx-thread h2,.mx-booking h4,.mx-booking p{overflow-wrap:anywhere}.mx-booking{padding:12px;border:1px solid var(--border,#aaa);border-radius:10px;margin:12px 0}.mx-booking.pending{background:#edf0f2;color:#52606a;border-style:dashed}.mx-booking.solid{border:2px solid var(--primary,#234)}.mx-picker{position:fixed;inset:0;margin:auto;width:calc(100% - 24px);max-width:420px;border:1px solid #aaa;border-radius:12px;padding:18px;background:var(--surface,#fff);color:inherit}.mx-picker button{display:block;min-height:48px;width:100%;margin:10px 0;font:inherit}.mx-picker::backdrop{background:#0007}';document.head.appendChild(s);})();
})();
