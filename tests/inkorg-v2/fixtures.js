// Synthetic examples only. Extends the historical read-only legacy fixtures.
(function(){
 var previous=window.fetch,at=new Date().toISOString(),next=820;
 var tomorrow=new Date(Date.now()+864e5).toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'});
 var contacts={cars:['25','7'],visibility:'owner'},privatePhone='+46'+'700000000';
 window.V2={calls:[],threads:{801:{id:801,subject:'Serviceförslag (test)',car_number:'25',driver_id:'900001',is_driver:true,
 messages:[{id:1,role:'driver',body:'Bilen behöver service. Kan vi boka en tid? (syntetiskt exempel)',mine:true,at:at}],
 bookings:[{id:901,title:'Service (test)',kind:'service',starts_at:tomorrow+'T09:00:00+01:00',status:'pending_driver',car_number:'25',created_at:at}]},
 802:{id:802,subject:'Godkänd besiktning (test)',car_number:'7',driver_id:'900001',is_driver:true,
 messages:[{id:2,role:'admin',body:'Tiden är bekräftad. (syntetiskt exempel)',mine:false,at:at}],
 bookings:[{id:902,title:'Besiktning (test)',kind:'besiktning',starts_at:tomorrow+'T11:00:00+01:00',status:'accepted',created_at:at,decided_at:at}]}}};
 function contact(data){return {cars:contacts.cars.map(x=>({number:x,phone:'+46707650'+x.padStart(3,'0')})),phone:!data.driver_id||data.driver_id==='900001'||contacts.visibility!=='owner'?privatePhone:null,visibility:contacts.visibility,company_label:'Taxi Göteborg'};}
 function response(out,status){return Promise.resolve(new Response(JSON.stringify(out),{status:status||200,headers:{'Content-Type':'application/json'}}));}
 window.fetch=function(url,opt){
  var fn=(/\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(String(url))||[])[1],a=opt&&opt.body?JSON.parse(opt.body):{},out;
  if(fn==='profile_get'){var mine=!a.p_driver_id||a.p_driver_id==='900001';return response({id:mine?'900001':'900002',name:mine?'Testförare':'Testkollega',co:'Teståkeri',mine:mine,can_edit:mine,visibility:{},gallery_n:0,guestbook_n:0,stats:{forum_threads:0,forum_replies:0}});}
  if(fn==='get_my_profile')return response({first_name:'Test',last_name:'Exempel',phone:privatePhone,email:'test@example.invalid',via_master:false});
  if(fn==='watch_list'||fn==='train_watch_list')return response([]);
  if(fn==='get_events')return response({city:{slug:'test',name:'Teststad'},cities:[],events:[]});
  if(fn!=='mailbox_v2')return previous(url,opt);
  var action=a.p_action,d=a.p_data||{},t=V2.threads[d.thread_id];V2.calls.push({action:action,data:d});
  if(action==='contacts_get')out=contact(d);
  else if(action==='contacts_save'){if(d.cars)contacts.cars=Array.from(new Set(d.cars.map(x=>String(+x))));if(d.visibility)contacts.visibility=d.visibility;out=contact({});}
  else if(action==='profile_save'){contacts.visibility=d.visibility;privatePhone=d.profile.phone;out=contact({});}
  else if(action==='recipients')out=[{id:'900001',name:'Testförare'},{id:'900002',name:'Testkollega'}];
  else if(action==='list')out=!d.admin&&['agare','superadmin'].includes(TEST_ROLE)?[]:Object.values(V2.threads).map(x=>({id:x.id,subject:x.subject,car_number:x.car_number,name:d.admin?'Testförare':'Admin',last_body:x.messages[x.messages.length-1].body,at:at,unread:x.id===801}));
  else if(action==='timeline')out=Object.values(V2.threads).flatMap(t=>t.bookings.filter(b=>b.status!=='declined').map(b=>({...b,thread_id:t.id,at:b.starts_at})));
  else if(action==='get')out=t;
  else if(action==='create'){t={id:next++,subject:d.subject,car_number:d.car_number,driver_id:d.driver_id||'900001',is_driver:true,messages:[{id:3,role:d.admin?'admin':'driver',mine:true,at:at,body:d.body}],bookings:[]};V2.threads[t.id]=t;out={id:t.id};}
  else if(action==='reply'){t.messages.push({id:next++,role:d.admin?'admin':'driver',mine:true,body:d.body,at:at});out={id:t.id};}
  else if(action==='book'){
   if(!t){t={id:next++,subject:d.kind,car_number:d.car_number,is_driver:true,driver_id:d.driver_id||'900001',messages:[],bookings:[]};V2.threads[t.id]=t;}
   t.bookings.push({id:next++,title:d.kind,kind:d.kind,starts_at:d.date+'T'+d.time+':00+01:00',car_number:d.car_number,status:d.admin?'pending_driver':'pending_admin',created_at:at});
   t.messages.push({id:next++,role:'system',body:'Bokad tid föreslagen: '+d.kind,at:at});if(d.body)t.messages.push({id:next++,role:d.admin?'admin':'driver',mine:true,body:d.body,at:at});out={id:t.id};
  } else if(action==='decide'){
   t=Object.values(V2.threads).find(t=>t.bookings.some(b=>b.id===d.booking_id));var b=t.bookings.find(b=>b.id===d.booking_id);
   if(d.decision==='declined'&&!d.reason.trim())return response({message:'need_reason'},400);
   b.status=d.decision;b.reason=d.reason;b.decided_at=at;out={id:t.id};
  } else return response({message:'Unknown mock action'},400);
  return response(out);
 };
})();
