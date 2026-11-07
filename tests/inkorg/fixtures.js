// Extends ../meddelanden/fixtures.js. Synthetic examples only.
(function(){
  var H=3600e3, at=function(h){return new Date(Date.now()-h*H).toISOString();};
  MOCK.inbox.items.forEach(function(x){x.category=x.kind==='issue'?(x.id===101||x.id===104?'fault':'supply'):x.kind;});
  MOCK.inbox.items.push({kind:'maint',category:'maint',id:601,title:'Service (exempel)',car:'T-0001',txt:'Mitt förslag om service',st:'pagar',status:'forslag',at:at(4)});
  MOCK.cases['maint:601']={kind:'maint',id:601,st:'pagar',data:{id:601,label:'Service (exempel)',car:'T-0001',note:'Mitt förslag om service',status:'forslag',created_at:at(4)}};
  MOCK.admin.items.push({kind:'maint',id:601,title:'Service (exempel)',car:'T-0001',txt:'Förslag från förare',st:'pagar',status:'forslag',needs:true,at:at(4)});
  var admin=['admin','agare','superadmin'].includes(TEST_ROLE), owner=['agare','superadmin'].includes(TEST_ROLE);
  MOCK.bil.is_admin=admin;MOCK.bil.is_owner=admin;
  var previous=window.fetch;
  window.fetch=function(url,opt){
    var fn=(/\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(String(url))||[])[1];
    var body=opt&&opt.body?JSON.parse(opt.body):{}, out;
    if(fn==='case_inbox'&&owner)out={items:[],klar_total:0};
    else if(fn==='case_admin_list'&&TEST_ROLE==='admin')out={items:MOCK.admin.items.filter(x=>x.kind!=='sjuk'),klar_total:6};
    else if(fn==='dev_wish_list')out=[];
    if(out!==undefined){MOCK.calls.push(fn);return Promise.resolve(new Response(JSON.stringify(out),{status:200,headers:{'Content-Type':'application/json'}}));}
    return previous(url,opt);
  };
})();
