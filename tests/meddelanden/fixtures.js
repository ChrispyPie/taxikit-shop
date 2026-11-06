// Mockad Supabase för Inkorg-harness. ALLT är påhittade exempel (inga riktiga förare, kunder eller bilar).
(function () {
  var H = 3600e3, now = Date.now(), iso = function (ms) { return new Date(now - ms).toISOString(); };
  window.MOCK = {
    inbox: { items: [
      { kind: 'issue', id: 101, title: 'Felanmälan', car: 'T-0001', txt: 'Lampan för motorfel blinkar (exempel)', status: 'pagar', st: 'pagar', needs: true, unread: 1, last_from: 'agare', last_txt: 'Kan du lämna bilen vid verkstaden kl 9 i morgon? (exempel)', at: iso(0.3 * H) },
      { kind: 'wh', id: 201, title: 'Verkstadstid', car: 'T-0001', txt: 'Däckbyte (exempel)', status: 'pending', st: 'vantar', needs: true, unread: 0, last_from: 'agare', last_txt: 'Hur länge fick du vänta där? (exempel)', at: iso(5 * H) },
      { kind: 'task', id: 301, title: 'Boka besiktning (exempel)', car: 'T-0002', txt: 'Ring och boka en tid nästa vecka', status: 'ny', st: 'vantar', needs: true, unread: 0, at: iso(26 * H) },
      { kind: 'issue', id: 102, title: 'Kvittorullar', car: 'T-0002', txt: null, status: 'ny', st: 'ny', needs: false, unread: 0, at: iso(30 * H) },
      { kind: 'issue', id: 103, title: 'Spolarvätska', car: 'T-0001', txt: null, status: 'klar', st: 'klar', needs: false, unread: 0, at: iso(80 * H) },
      { kind: 'wh', id: 202, title: 'Verkstadstid', car: 'T-0002', txt: 'Service (exempel)', status: 'approved', st: 'klar', needs: false, unread: 0, at: iso(120 * H) },
      { kind: 'sjuk', id: 401, title: 'Sjukanmälan', car: null, txt: 'Från 28/10', status: 'godkand', st: 'klar', needs: false, unread: 0, at: iso(200 * H) },
      { kind: 'issue', id: 104, title: 'Felanmälan', car: 'T-0002', txt: 'Dörren gnisslar (exempel, för 1 år sedan)', status: 'klar', st: 'klar', needs: false, unread: 0, at: iso(9000 * H) }
    ], klar_total: 4 },
    cases: {
      'issue:101': { kind: 'issue', id: 101, st: 'pagar', admin: false, data: { id: 101, kind: 'fault', car: 'T-0001', body: 'Lampan för motorfel blinkar när jag kör uppför backar. (exempel)', blocking: false, status: 'pagar', mine: true, created_at: iso(30 * H), photos: 1,
        history: [{ status: 'ny', at: iso(30 * H) }, { status: 'pagar', comment: 'Jag kollar med verkstaden.', at: iso(20 * H) }],
        msgs: [{ id: 1, role: 'driver', body: 'Den blinkade igen i natt vid Exempelgatan.', at: iso(8 * H), mine: true, who: 'Testa T' },
               { id: 2, role: 'owner', body: 'Kan du lämna bilen vid verkstaden kl 9 i morgon? (exempel)', at: iso(0.3 * H), mine: false, who: 'Ägar E' }] } },
      'wh:201': { kind: 'wh', id: 201, st: 'vantar', admin: false, data: { id: 201, car: 'T-0001', comment: 'Däckbyte (exempel)', start: iso(29 * H), end: iso(27 * H), minutes: 120, status: 'pending', waiting_on: 'driver',
        msgs: [{ role: 'owner', kind: 'msg', body: 'Hur länge fick du vänta där? (exempel)', at: iso(5 * H), who: 'Ägaren' }] } }
    },
    admin: { items: [
      { kind: 'issue', id: 111, title: 'Bilen står', car: 'T-0003', txt: 'Startar inte (exempel)', status: 'ny', st: 'ny', who: 'Exempel A', mine: false, needs: true, urgent: true, at: iso(0.5 * H) },
      { kind: 'wh', id: 211, title: 'Verkstadstid', car: 'T-0001', txt: '05/11 08:00 · 2 h 0 min', status: 'pending', st: 'pagar', who: 'Testa T', mine: false, needs: true, urgent: false, last_from: 'forare', at: iso(2 * H) },
      { kind: 'issue', id: 112, title: 'Felanmälan', car: 'T-0001', txt: 'Lampan för motorfel blinkar (exempel)', status: 'pagar', st: 'pagar', who: 'Testa T', mine: false, needs: true, urgent: false, last_from: 'forare', at: iso(8 * H) },
      { kind: 'sjuk', id: 411, title: 'Sjukanmälan', car: null, txt: 'Från 05/11', status: 'ny', st: 'ny', who: 'Prov B', mine: false, needs: true, urgent: false, at: iso(10 * H) },
      { kind: 'issue', id: 113, title: 'Kvittorullar', car: 'T-0002', txt: null, status: 'pagar', st: 'pagar', who: 'Prov B', mine: false, needs: false, urgent: false, at: iso(20 * H) },
      { kind: 'issue', id: 114, title: 'Rengöring', car: 'T-0003', txt: 'Fläck på baksätet (exempel)', status: 'ny', st: 'ny', who: 'Exempel A', mine: false, needs: false, urgent: false, last_from: 'agare', at: iso(22 * H) },
      { kind: 'task', id: 311, title: 'Boka besiktning (exempel)', car: 'T-0002', txt: 'Ring och boka en tid', status: 'ny', st: 'vantar', who: 'Testa T', mine: false, needs: false, urgent: false, at: iso(26 * H) },
      { kind: 'wh', id: 212, title: 'Verkstadstid', car: 'T-0003', txt: '03/11 13:00 · 1 h 30 min', status: 'pending', st: 'vantar', who: 'Exempel A', mine: false, needs: false, urgent: false, last_from: 'agare', at: iso(40 * H) },
      { kind: 'wish', id: 511, title: 'Önskemål', car: null, txt: 'Kan Topplistor visa veckans bästa natt? (exempel)', status: 'ny', st: 'ny', who: 'Ägar E', mine: false, needs: true, urgent: false, at: iso(4 * H) },
      { kind: 'wish', id: 512, title: 'Önskemål', car: null, txt: 'Mörkt tema i verkstaden (exempel)', status: 'planerad', st: 'pagar', who: 'Ägar E', mine: false, needs: false, urgent: false, last_from: 'agare', at: iso(48 * H) },
      { kind: 'wish', id: 513, title: 'Önskemål', car: null, txt: 'Större text på Prognos (exempel)', status: 'klar', st: 'klar', who: 'Ägar E', needs: false, at: iso(2400 * H) },
      { kind: 'issue', id: 117, title: 'Felanmälan', car: 'T-0003', txt: 'Bältet kärvar (exempel, för 1 år sedan)', status: 'klar', st: 'klar', who: 'Exempel A', needs: false, at: iso(9000 * H) },
      { kind: 'issue', id: 115, title: 'Spolarvätska', car: 'T-0001', txt: null, status: 'klar', st: 'klar', who: 'Testa T', needs: false, at: iso(80 * H) },
      { kind: 'wh', id: 213, title: 'Verkstadstid', car: 'T-0002', txt: '01/11 09:00 · 3 h 0 min', status: 'approved', st: 'klar', who: 'Prov B', needs: false, at: iso(100 * H) },
      { kind: 'wh', id: 214, title: 'Verkstadstid', car: 'T-0003', txt: '30/10 10:00 · 0 h 45 min', status: 'rejected', st: 'klar', who: 'Exempel A', needs: false, at: iso(150 * H) },
      { kind: 'issue', id: 116, title: 'Felanmälan', car: 'T-0002', txt: 'Backkameran (exempel)', status: 'klar', st: 'klar', who: 'Prov B', needs: false, at: iso(190 * H) }
    ], klar_total: 6 },
    feed: { unread: 2, items: [
      { src: 'e', id: 9001, kind: 'bil_issue_msg', body: '💬 Ägaren svarade om felanmälan (bil T-0001) "Lampan för motorfel blinkar…": Kan du lämna bilen vid verkstaden kl 9 i morgon? (exempel)', created_at: iso(0.3 * H), read: false, case_kind: 'issue', case_id: 101 },
      { src: 'p', id: 9002, kind: 'prognos', title: '🔮 Prognos', body: 'Många landningar 23–24 i kväll (exempel)', created_at: iso(3 * H), read: false },
      { src: 'e', id: 9003, kind: 'forum', body: 'Nytt svar i en tråd du följer (exempel)', created_at: iso(30 * H), read: true }
    ] }
  };
  MOCK.cases['issue:112'] = JSON.parse(JSON.stringify(MOCK.cases['issue:101'])); MOCK.cases['issue:112'].id = 112; MOCK.cases['issue:112'].admin = true;
  MOCK.cases['issue:112'].data.reporter_name = 'Testa T'; MOCK.cases['issue:112'].data.mine = false;
  MOCK.cases['issue:112'].data.msgs.push({ id: 3, role: 'driver', body: 'Ja, det går bra. (exempel)', at: iso(0.1 * H), who: 'Testa T' });
  MOCK.cases['wish:511'] = { kind: 'wish', id: 511, st: 'ny', admin: true, data: { id: 511, body: 'Kan Topplistor visa veckans bästa natt? (exempel)', status: 'ny', reply: null, created_at: iso(4 * H), updated_at: iso(4 * H), mine: false, author: 'Ägar E' } };
  MOCK.cases['wh:211'] = {kind:'wh',id:211,st:'pagar',data:{id:211,status:'pending',waiting_on:'owner',car:'T-0001',start:iso(29*H),end:iso(27*H),minutes:120,comment:'Däckbyte (exempel)',msgs:[]}};
  MOCK.messages = [{id:901,body:'Kan vi byta pass på fredag? (exempel)',at:iso(H),name:'Prova E.',peer_id:'900002',read_at:null}];
  MOCK.out = [{id:902,body:'Tack för hjälpen med bilen! (exempel)',at:iso(3*H),name:'Ägare E.',peer_id:'900009',read_at:iso(2*H)}];
  MOCK.recipients=[{id:'900002',name:'Prova E.',admin:false},{id:'900009',name:'Ägare E.',admin:true}];
  MOCK.payroll={rate:200,named:true,totals:[{driver_id:'900001',namn:'Testa E.',approved_min:300,approved_kr:1000,pending_min:120,rejected_min:0},{driver_id:'900002',namn:'Prova E.',approved_min:120,approved_kr:400,pending_min:0,rejected_min:0}]};
  MOCK.bil={me:'900001',is_admin:false,is_owner:false,can_approve_hours:false,current_car_id:1,current_car_label:'T-0001',cars:[{id:1,bilnummer:'T-0001',modell:'Testbil',km:10000}],issues:[],tasks:[],maint:[{id:1,type:'service',title:'Service',car:'T-0001',status:'plan',level:1}],notices:[],unread:0};
  MOCK.conversations=[{id:701,subject:'Passbyte på fredag',name:'Prova E.',latest_id:901,last_body:'Kan vi byta pass på fredag? (exempel)',at:iso(H),incoming:true,unread:1}, {id:702,subject:'Tack för hjälpen',name:'Ägare E.',latest_id:900,last_body:'Tack för hjälpen med bilen! (exempel)',at:iso(3*H),incoming:false,unread:0}];
  MOCK.threads={701:{id:701,subject:'Passbyte på fredag',name:'Prova E.',messages:[{id:890,body:'Jag kan köra dag på fredag. Hur ser det ut för dig? (exempel)',mine:true,at:iso(2*H),read_at:iso(1.5*H)},{id:901,body:'Kan vi byta pass på fredag? (exempel)',mine:false,at:iso(H),read_at:null}]}};
  MOCK.calls = [];
  var realFetch = window.fetch;
  window.fetch = function (url, opt) {
    var m = /\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(String(url));
    if (!m) return Promise.resolve(new Response('{}',{status:200,headers:{'Content-Type':'application/json'}}));
    var fn = m[1], a = {}; try { a = JSON.parse(opt.body); } catch (e) {}
    MOCK.calls.push(fn);
    var out = null, D = MOCK;
    if(fn==='get_me') out={id:'900001',first_name:'Testa',last_name:'Exempel',category:window.TEST_ROLE||'standard',activated:true,needs_profile:false};
    else if(fn==='admin_list_drivers')out=[{id:'900001',first_name:'Testa',last_name:'Exempel',category:window.TEST_ROLE||'standard',activated:true}];
    else if(fn==='get_my_features')out=['sjuk'];
    else if(fn==='get_bil')out=D.bil;
    else if(fn==='get_my_workshop')out={entries:[],cars:D.bil.cars,rate:200,can_approve:false};
    else if(fn==='sjuk_get')out={mine:[],all:[],boss:false,today:'2026-11-06'};
    else if(fn==='message_recipients')out=D.recipients;
    else if(fn==='conversation_list')out={items:D.conversations,unread:D.conversations.reduce((a,c)=>a+c.unread,0),next:null};
    else if(fn==='conversation_get'){out=D.threads[a.p_id];var c=D.conversations.find(c=>c.id===a.p_id);if(c)c.unread=0;out.messages.forEach(m=>{if(!m.mine)m.read_at=iso(0);});}
    else if(fn==='conversation_create'){out=703;var peer=D.recipients.find(r=>r.id===a.p_to);D.threads[703]={id:703,subject:a.p_subject,name:peer.name,messages:[{id:903,body:a.p_body,mine:true,at:iso(0),read_at:null}]};D.conversations.unshift({id:703,subject:a.p_subject,name:peer.name,latest_id:903,last_body:a.p_body,at:iso(0),incoming:false,unread:0});}
    else if(fn==='conversation_reply'){out=904;D.threads[a.p_id].messages.push({id:904,body:a.p_body,mine:true,at:iso(0),read_at:null});}
    else if(fn==='message_list')out={items:a.p_box==='out'?D.out:D.messages,unread:D.messages.filter(m=>!m.read_at).length,next:null};
    else if(fn==='message_read'){var m=D.messages.concat(D.out).find(m=>m.id===a.p_id);if(!m.read_at)m.read_at=new Date().toISOString();out={...m,incoming:D.messages.includes(m)};}
    else if(fn==='message_send'){D.out.unshift({id:903,body:a.p_body,peer_id:a.p_to,name:D.recipients.find(r=>r.id===a.p_to).name,at:iso(0),read_at:null});out=903;}
    else if(fn==='payroll_month')out=D.payroll;
    else if(fn==='workshop_pending_count')out=1;
    else if(fn==='profile_get')out={id:'900002',name:'Prova E.',co:'Exempelåkeri',mine:false,can_edit:false,bio:'Nattförare som gillar lugna pass. (exempel)',shift:'natt',gallery_n:0,guestbook_n:0,stats:{forum_threads:3,forum_replies:8}};
    else if (fn === 'case_inbox') out = D.inbox;
    else if (fn === 'case_admin_list') out = D.admin;
    else if (fn === 'case_get') out = D.cases[a.p_kind + ':' + a.p_id] || { kind: a.p_kind, id: a.p_id, st: 'ny', data: {} };
    else if (fn === 'case_seen') {
      D.inbox.items.forEach(function (x) { if (x.kind === a.p_kind && x.id === a.p_id) x.unread = 0; });
      var n = 0; D.feed.items.forEach(function (x) { if (x.case_kind === a.p_kind && x.case_id === a.p_id && !x.read) { x.read = true; n++; } }); D.feed.unread -= n;
      out = n;
    }
    else if (fn === 'notis_feed') out = D.feed;
    else if (fn === 'notis_read') out = 1;
    else if (fn === 'notis_add') out = 0;
    else out = {};
    return new Promise(function (ok) { setTimeout(function () { ok(new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })); }, 30); });
  };
})();
