const assert=require('node:assert/strict');
process.env.TRAFIKVERKET_API_KEY='synthetic-not-a-real-key';
const handler=require('../../api/trains.js');
let calls=[];
const nowIso=new Date().toISOString();
const later=new Date(Date.now()+10*60000).toISOString();
const seenTs=new Date(Date.now()-5*60000).toISOString();
const seenTs2=new Date(Date.now()-60*1000).toISOString();
let lastSeenTs=seenTs;
let changeId='100';
let patchRows=null;
const catalog=[
  {LocationSignature:'G',AdvertisedLocationName:'Göteborg C',Advertised:true,Deleted:false,CountryCode:'SE',CountyNo:[14],Geometry:{WGS84:'POINT (12 57.7)'}}
];
function boardRows(){
  return [
    {AdvertisedTrainIdent:'3001',ActivityType:'Ankomst',AdvertisedTimeAtLocation:later,EstimatedTimeAtLocation:later,LocationSignature:'G',Advertised:true,FromLocation:[{LocationSignature:'A'}],ToLocation:[{LocationSignature:'G'}]},
    {AdvertisedTrainIdent:'3002',ActivityType:'Ankomst',AdvertisedTimeAtLocation:later,LocationSignature:'G',Advertised:true,FromLocation:[{LocationSignature:'Mdn'}],ToLocation:[{LocationSignature:'G'}]}
  ];
}
global.fetch=async(url,opts)=>{
  const xml=opts.body;calls.push(xml);
  await new Promise(r=>setTimeout(r,1));
  if(xml.includes('objecttype="TrainStation"')){
    return {ok:true,text:async()=>JSON.stringify({RESPONSE:{RESULT:[{TrainStation:catalog}]}})};
  }
  assert(xml.includes('objecttype="TrainAnnouncement"'));
  assert(xml.includes('namespace="rail.trafficinfo"'),'TrainAnnouncement must use rail.trafficinfo');
  assert(xml.includes('schemaversion="1.9"'));
  let rows=[];
  if(xml.includes('TimeAtLocation desc')||xml.includes('$dateadd(-06:00:00)')){
    rows=[{AdvertisedTrainIdent:'3001',LocationSignature:'Sur',ActivityType:'Avgang',TimeAtLocation:lastSeenTs}];
  }else if(xml.includes('changeid="0"')||(xml.includes('name="LocationSignature"')&&!xml.includes('includedeletedobjects'))){
    assert(xml.includes('changeid="0"'),'full station query should send changeid=0');
    rows=boardRows();
  }else if(xml.includes('changeid=')){
    assert(xml.includes('includedeletedobjects="true"'));
    assert(xml.includes('changeid="100"')||xml.includes('changeid="200"')||xml.includes('changeid="'+changeId+'"'));
    rows=patchRows||[];
  }else{
    // full route rebuild (should not happen on delta)
    rows=[];
  }
  return {ok:true,text:async()=>JSON.stringify({RESPONSE:{RESULT:[{INFO:{LASTCHANGEID:changeId},TrainAnnouncement:rows}]}})};
};
function request(url){
  return new Promise((resolve,reject)=>{
    const res={headers:{},setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},end(text){resolve({status:this.statusCode,headers:this.headers,body:JSON.parse(text||'{}')});}};
    handler({method:'GET',url},res).catch(reject);
  });
}
(async()=>{
  const full=await request('/api/trains?station=G');
  assert.equal(full.status,200);
  assert.match(String(full.headers['cache-control']||''), /s-maxage=60/);
  assert.equal(full.body.trains.length,2);
  assert(calls.some(x=>x.includes('objecttype="TrainAnnouncement"')&&x.includes('changeid="0"')&&!x.includes('includedeletedobjects')),'full fetch asks for LASTCHANGEID with changeid=0');
  const fullRouteCalls=calls.filter(x=>x.includes('$dateadd(-12:00:00)')).length;
  assert(fullRouteCalls>=1,'full list still rebuilds routes');
  const beforeDelta=calls.length;

  // First delta after a full build: should use LASTCHANGEID, skip route rebuild, cache 10s.
  changeId='200';
  patchRows=[]; // no announcement changes
  lastSeenTs=seenTs2; // last-seen moved
  const d1=await request('/api/trains?delta=1&station=G');
  assert.equal(d1.status,200);
  assert.match(String(d1.headers['cache-control']||''), /s-maxage=10/);
  assert.equal(d1.body.delta,true);
  assert.equal(d1.body.source,'delta');
  const deltaXml=calls.slice(beforeDelta);
  assert(deltaXml.every(x=>x.includes('namespace="rail.trafficinfo"')||x.includes('TrainStation')));
  assert.equal(deltaXml.filter(x=>x.includes('$dateadd(-12:00:00)')).length,0,'delta must not rebuild routes');
  assert(deltaXml.some(x=>x.includes('changeid="100"')),'delta uses previous LASTCHANGEID');
  assert(d1.body.trains.some(t=>t.id==='3001'&&t.lastSeenSig==='Sur'),'last-seen change is in the delta');
  assert.equal(d1.body.trains.length,1,'only the changed train is returned');
  assert.deepEqual(d1.body.removed,[]);

  // Warm 10s cache: no extra upstream calls
  const mid=calls.length;
  const d1b=await request('/api/trains?delta=1&station=G');
  assert.equal(calls.length,mid,'delta responses are coalesced/cached ~10s');
  assert.equal(d1b.body.trains.length,1);

  // Announcement change + removal
  changeId='300';
  patchRows=[
    {AdvertisedTrainIdent:'3001',ActivityType:'Ankomst',AdvertisedTimeAtLocation:later,EstimatedTimeAtLocation:new Date(Date.now()+15*60000).toISOString(),LocationSignature:'G',Advertised:true,FromLocation:[{LocationSignature:'A'}],ToLocation:[{LocationSignature:'G'}]},
    {AdvertisedTrainIdent:'3002',ActivityType:'Ankomst',AdvertisedTimeAtLocation:later,LocationSignature:'G',Advertised:true,Deleted:true,FromLocation:[{LocationSignature:'Mdn'}],ToLocation:[{LocationSignature:'G'}]}
  ];
  // expire 10s cache by calling internal after advancing... we don't have clock hook; expire via ttl by waiting is slow.
  // Directly invoke buildTrainsDelta to test merge/removal without cache.
  const body=await handler._internal.buildTrainsDelta('synthetic-not-a-real-key','G');
  assert.equal(body.delta,true);
  assert(body.removed.some(r=>r.id==='3002'),'deleted announcement is reported as removed');
  assert(body.trains.some(t=>t.id==='3001'&&t.est),'updated arrival is in the delta');

  // lastChangeIdOf helper
  assert.equal(handler._internal.lastChangeIdOf({RESPONSE:{RESULT:[{INFO:{LASTCHANGEID:'42'}}]}}),'42');

  console.log('PASS trains delta: namespace, changeid, no route rebuild, s-maxage=10, diff/removed');
})().catch(e=>{console.error(e);process.exitCode=1;});
